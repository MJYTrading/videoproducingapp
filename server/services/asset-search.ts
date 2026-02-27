/**
 * Asset Search Service — Intelligent B-roll zoeken
 * 
 * Zoekstrategie per scene:
 * 1. Clip Library (AssetClip model) — tags/subjects/category match
 * 2. Perplexity Sonar — relevante YouTube video's zoeken
 * 3. Download via video-download-api of N8N
 * 4. Optioneel: TwelveLabs validatie
 * 5. Opslaan in Clip Library voor hergebruik
 */

import prisma from '../db.js';
import { TwelveLabsService } from './twelvelabs.js';
import { llmSimplePrompt, LLM_MODELS } from './llm.js';

interface AssetSearchConfig {
  n8nBaseUrl: string;
  pexelsApiKey?: string;
  twelveLabsApiKey?: string;
  enableTwelveLabsValidation: boolean;
}

interface SceneAssetRequest {
  sceneId: number;
  text: string;           // Voiceover tekst
  visualPrompt: string;   // Gewenste visual beschrijving
  duration: number;       // Scene duur in seconden
  assetType: 'real_image' | 'ai_image' | 'video' | 'clip';
  searchQuery?: string;   // Custom search query
}

interface AssetResult {
  sceneId: number;
  assetPath: string;
  source: 'library' | 'new_download' | 'pexels' | 'google' | 'wikimedia';
  assetClipId?: string;
  qualityScore: number | null;
  isVideo: boolean;
}

export class AssetSearchService {
  private config: AssetSearchConfig;
  private twelvelabs?: TwelveLabsService;

  constructor(config: AssetSearchConfig) {
    this.config = config;
    if (config.twelveLabsApiKey) {
      this.twelvelabs = new TwelveLabsService({ apiKey: config.twelveLabsApiKey });
    }
  }

  /**
   * Zoek assets voor meerdere scenes
   */
  async searchForScenes(
    scenes: SceneAssetRequest[],
    projectDir: string,
    outputFormat: 'landscape' | 'portrait',
    llmKeys: any
  ): Promise<AssetResult[]> {
    const results: AssetResult[] = [];

    for (const scene of scenes) {
      console.log(`[AssetSearch] Scene ${scene.sceneId}: "${scene.text.slice(0, 60)}..."`);

      try {
        const result = await this.searchForScene(scene, projectDir, outputFormat, llmKeys);
        results.push(result);
      } catch (error: any) {
        console.error(`[AssetSearch] Scene ${scene.sceneId} fout: ${error.message}`);
        results.push({
          sceneId: scene.sceneId,
          assetPath: '',
          source: 'new_download',
          qualityScore: null,
          isVideo: false,
        });
      }
    }

    return results;
  }

  /**
   * Zoek asset voor één scene
   */
  private async searchForScene(
    scene: SceneAssetRequest,
    projectDir: string,
    outputFormat: 'landscape' | 'portrait',
    llmKeys: any
  ): Promise<AssetResult> {
    // Stap 1: Genereer zoektermen met AI
    const searchTerms = await this.generateSearchTerms(scene, llmKeys);

    // Stap 2: Zoek in Clip Library
    const libraryMatch = await this.searchLibrary(searchTerms, scene);
    if (libraryMatch) {
      console.log(`[AssetSearch] Scene ${scene.sceneId}: Library match gevonden (${libraryMatch.title})`);

      // Markeer als gebruikt
      await prisma.assetClip.update({
        where: { id: libraryMatch.id },
        data: { timesUsed: { increment: 1 }, lastUsedAt: new Date() },
      });

      return {
        sceneId: scene.sceneId,
        assetPath: libraryMatch.localPath,
        source: 'library',
        assetClipId: libraryMatch.id,
        qualityScore: libraryMatch.quality,
        isVideo: libraryMatch.localPath.endsWith('.mp4') || libraryMatch.localPath.endsWith('.webm'),
      };
    }

    console.log(`[AssetSearch] Scene ${scene.sceneId}: Geen library match, zoeken via N8N...`);

    // Stap 3: Zoek via N8N asset-downloader (Google/Pexels/Wikimedia)
    const downloadResult = await this.downloadViaN8N(scene, searchTerms, projectDir, outputFormat);

    if (downloadResult) {
      // Stap 4: Optioneel TwelveLabs validatie
      if (this.config.enableTwelveLabsValidation && this.twelvelabs && downloadResult.isVideo) {
        const validation = await this.twelvelabs.validateContent({
          videoUrl: downloadResult.assetPath,
          expectedDescription: scene.visualPrompt || scene.text,
        });

        if (!validation.matches) {
          console.log(`[AssetSearch] Scene ${scene.sceneId}: TwelveLabs validatie gefaald (${validation.score}), maar gebruiken als fallback`);
        }
        downloadResult.qualityScore = validation.score;
      }

      // Stap 5: Sla op in Clip Library voor hergebruik
      try {
        const clip = await prisma.assetClip.create({
          data: {
            sourceUrl: downloadResult.sourceUrl || '',
            videoId: downloadResult.videoId || '',
            title: scene.visualPrompt?.slice(0, 100) || scene.text.slice(0, 100),
            startTime: '00:00',
            endTime: String(scene.duration || 10),
            localPath: downloadResult.assetPath,
            tags: JSON.stringify(searchTerms.tags || []),
            description: scene.visualPrompt || scene.text.slice(0, 500),
            category: searchTerms.category || 'other',
            subjects: JSON.stringify(searchTerms.subjects || []),
            mood: searchTerms.mood || null,
            quality: downloadResult.qualityScore,
          },
        });
        downloadResult.assetClipId = clip.id;
        console.log(`[AssetSearch] Scene ${scene.sceneId}: Opgeslagen in library (${clip.id})`);
      } catch (err: any) {
        console.log(`[AssetSearch] Library opslaan mislukt (niet-kritiek): ${err.message}`);
      }

      return downloadResult;
    }

    // Fallback: geen asset gevonden
    console.log(`[AssetSearch] Scene ${scene.sceneId}: Geen asset gevonden`);
    return {
      sceneId: scene.sceneId,
      assetPath: '',
      source: 'new_download',
      qualityScore: null,
      isVideo: false,
    };
  }

  /**
   * AI genereert slimme zoektermen op basis van scene context
   */
  private async generateSearchTerms(
    scene: SceneAssetRequest,
    llmKeys: any
  ): Promise<{ query: string; fallback: string; tags: string[]; subjects: string[]; category: string; mood: string }> {
    try {
      const prompt = `Genereer zoektermen voor B-roll footage. De voiceover zegt: "${scene.text.slice(0, 300)}"
Gewenste visual: "${scene.visualPrompt?.slice(0, 200) || 'passend bij de tekst'}"

Geef terug als JSON:
{
  "query": "primaire zoekterm (3-6 woorden, Engels)",
  "fallback": "fallback zoekterm (breder, 2-4 woorden)",
  "tags": ["tag1", "tag2", "tag3"],
  "subjects": ["onderwerp1", "onderwerp2"],
  "category": "news|nature|technology|sports|politics|entertainment|education|other",
  "mood": "dramatic|calm|energetic|serious|neutral"
}
Alleen JSON, geen extra tekst.`;

      const response = await llmSimplePrompt(llmKeys, 
        'Je bent een expert video editor die B-roll zoektermen genereert. Geef ALLEEN JSON terug.',
        prompt,
        { model: LLM_MODELS.SONNET, maxTokens: 500, temperature: 0.3 }
      );

      const parsed = JSON.parse(response.replace(/```json?\s*/g, '').replace(/```/g, '').trim());
      return {
        query: parsed.query || scene.text.split(/\s+/).slice(0, 5).join(' '),
        fallback: parsed.fallback || scene.text.split(/\s+/).slice(0, 3).join(' '),
        tags: parsed.tags || [],
        subjects: parsed.subjects || [],
        category: parsed.category || 'other',
        mood: parsed.mood || 'neutral',
      };
    } catch {
      // Fallback: handmatige extractie
      const words = (scene.visualPrompt || scene.text).split(/\s+/);
      return {
        query: words.slice(0, 6).join(' '),
        fallback: words.slice(0, 3).join(' '),
        tags: words.slice(0, 5),
        subjects: [],
        category: 'other',
        mood: 'neutral',
      };
    }
  }

  /**
   * Zoek in bestaande Clip Library
   */
  private async searchLibrary(
    searchTerms: { query: string; tags: string[]; category: string; mood: string },
    scene: SceneAssetRequest
  ): Promise<any | null> {
    try {
      // Zoek op tags overlap
      const tagConditions = searchTerms.tags.map(tag => ({ tags: { contains: tag } }));
      
      const clips = await prisma.assetClip.findMany({
        where: {
          AND: [
            { OR: [
              ...tagConditions,
              { description: { contains: searchTerms.query } },
              { category: searchTerms.category },
            ]},
            { localPath: { not: '' } },
          ],
        },
        orderBy: [
          { quality: 'desc' },
          { timesUsed: 'asc' },
        ],
        take: 5,
      });

      // Geef de beste match terug (als die er is)
      return clips.length > 0 ? clips[0] : null;
    } catch (error: any) {
      console.log(`[AssetSearch] Library search fout: ${error.message}`);
      return null;
    }
  }

  /**
   * Download asset via N8N asset-downloader webhook
   */
  private async downloadViaN8N(
    scene: SceneAssetRequest,
    searchTerms: { query: string; fallback: string },
    projectDir: string,
    outputFormat: 'landscape' | 'portrait'
  ): Promise<(AssetResult & { sourceUrl?: string; videoId?: string }) | null> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      const scenesDir = path.join(projectDir, 'assets', 'scenes');
      const imagesDir = path.join(projectDir, 'assets', 'images');
      await fs.mkdir(scenesDir, { recursive: true });
      await fs.mkdir(imagesDir, { recursive: true });

      const n8nUrl = this.config.n8nBaseUrl + '/webhook/asset-downloader';

      const payload = {
        project: path.basename(projectDir),
        output_dir: imagesDir + '/',
        scenes_dir: scenesDir + '/',
        pexels_api_key: this.config.pexelsApiKey || '',
        output_format: outputFormat,
        assets: [{
          scene_id: scene.sceneId,
          search_query: searchTerms.query,
          search_query_fallback: searchTerms.fallback,
          sources: ['google', 'pexels', 'wikimedia'],
          min_width: 1920,
          ken_burns_type: 'zoom_in',
          duration: scene.duration || 5,
        }],
      };

      const response = await fetch(n8nUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.log(`[AssetSearch] N8N fout: ${response.status}`);
        return null;
      }

      // Wacht op status bestand
      const statusPath = path.join(projectDir, 'assets', 'assets-status.json');
      
      // Poll max 60 seconden voor single asset
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 5000));
        try {
          const statusText = await fs.readFile(statusPath, 'utf-8');
          const status = JSON.parse(statusText);
          if (status.status === 'completed' || status.status === 'done') {
            const result = status.results?.[0];
            if (result && result.success) {
              return {
                sceneId: scene.sceneId,
                assetPath: result.path || result.local_path || '',
                source: (result.source as any) || 'new_download',
                qualityScore: null,
                isVideo: (result.path || '').endsWith('.mp4'),
                sourceUrl: result.url || '',
                videoId: '',
              };
            }
          }
        } catch { /* Status nog niet beschikbaar */ }
      }

      return null;
    } catch (error: any) {
      console.log(`[AssetSearch] N8N download fout: ${error.message}`);
      return null;
    }
  }
}
