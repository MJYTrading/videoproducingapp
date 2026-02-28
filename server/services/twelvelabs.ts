/**
 * TwelveLabs Service v2 — Video content analyse en validatie
 * 
 * Correcte API flow:
 * 1. Index aanmaken (per project)
 * 2. Video uploaden naar index → wacht op indexering
 * 3. Zoeken / analyseren via Search API of Generate API
 * 
 * Gebruikt voor:
 * - Stap 4:  Validatie of Perplexity clip URLs echt bestaan en relevant zijn
 * - Stap 12: Validatie of gedownloade B-roll past bij de scene
 * - Stap 13: Validatie of gedownloade YouTube clips relevant zijn
 */

const TWELVELABS_URL = 'https://api.twelvelabs.io/v1.2';

interface TwelveLabsConfig {
  apiKey: string;
}

export class TwelveLabsService {
  private apiKey: string;

  constructor(config: TwelveLabsConfig) {
    this.apiKey = config.apiKey;
  }

  // ══════════════════════════════════════════════════
  // CORE API
  // ══════════════════════════════════════════════════

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const response = await fetch(`${TWELVELABS_URL}${endpoint}`, {
      ...options,
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`TwelveLabs API fout (${response.status}): ${text.slice(0, 300)}`);
    }

    return response.json();
  }

  /**
   * Upload met multipart form data (voor lokale bestanden)
   */
  private async uploadFile(endpoint: string, formData: FormData): Promise<any> {
    const response = await fetch(`${TWELVELABS_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
      },
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`TwelveLabs upload fout (${response.status}): ${text.slice(0, 300)}`);
    }

    return response.json();
  }

  // ══════════════════════════════════════════════════
  // INDEX MANAGEMENT
  // ══════════════════════════════════════════════════

  /**
   * Maak een index aan of hergebruik bestaande
   */
  async getOrCreateIndex(name: string): Promise<string> {
    // Zoek bestaande index
    try {
      const existing = await this.request(`/indexes?page=1&page_limit=50`);
      const found = (existing.data || []).find((idx: any) => idx.index_name === name);
      if (found) {
        console.log(`[TwelveLabs] Bestaande index gevonden: ${found._id}`);
        return found._id;
      }
    } catch (e: any) {
      console.log(`[TwelveLabs] Index zoeken mislukt: ${e.message}`);
    }

    // Maak nieuwe index aan
    const index = await this.request('/indexes', {
      method: 'POST',
      body: JSON.stringify({
        index_name: name,
        engines: [
          {
            engine_name: 'marengo2.7',
            engine_options: ['visual', 'audio'],
          },
        ],
      }),
    });

    const indexId = index._id || index.id;
    console.log(`[TwelveLabs] Nieuwe index aangemaakt: ${indexId}`);
    return indexId;
  }

  /**
   * Verwijder een index
   */
  async deleteIndex(indexId: string): Promise<void> {
    try {
      await this.request(`/indexes/${indexId}`, { method: 'DELETE' });
    } catch {}
  }

  // ══════════════════════════════════════════════════
  // VIDEO UPLOAD & INDEXERING
  // ══════════════════════════════════════════════════

  /**
   * Upload een video via URL en wacht op indexering
   * Returns video_id of null bij fout
   */
  async uploadVideoUrl(indexId: string, videoUrl: string, waitForDone = true): Promise<string | null> {
    try {
      console.log(`[TwelveLabs] Video uploaden via URL: ${videoUrl.slice(0, 80)}...`);

      const task = await this.request('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          index_id: indexId,
          url: videoUrl,
        }),
      });

      const taskId = task._id || task.id;
      if (!taskId) {
        console.log('[TwelveLabs] Geen task ID ontvangen');
        return null;
      }

      if (!waitForDone) return taskId;

      // Poll tot indexering klaar is (max 5 minuten)
      return await this.waitForTask(taskId, 300_000);
    } catch (error: any) {
      console.log(`[TwelveLabs] Upload via URL mislukt: ${error.message}`);
      return null;
    }
  }

  /**
   * Upload een lokaal videobestand en wacht op indexering
   */
  async uploadVideoFile(indexId: string, filePath: string, waitForDone = true): Promise<string | null> {
    try {
      const fs = await import('fs');
      const path = await import('path');

      if (!fs.existsSync(filePath)) {
        console.log(`[TwelveLabs] Bestand niet gevonden: ${filePath}`);
        return null;
      }

      console.log(`[TwelveLabs] Video uploaden: ${path.basename(filePath)}...`);

      const fileBuffer = fs.readFileSync(filePath);
      const blob = new Blob([fileBuffer]);

      const formData = new FormData();
      formData.append('index_id', indexId);
      formData.append('video_file', blob, path.basename(filePath));

      const task = await this.uploadFile('/tasks', formData);
      const taskId = task._id || task.id;

      if (!taskId) return null;
      if (!waitForDone) return taskId;

      return await this.waitForTask(taskId, 300_000);
    } catch (error: any) {
      console.log(`[TwelveLabs] Upload bestand mislukt: ${error.message}`);
      return null;
    }
  }

  /**
   * Wacht tot een indexeringstask klaar is
   * Returns video_id of null
   */
  private async waitForTask(taskId: string, timeoutMs: number): Promise<string | null> {
    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconden

    while (Date.now() - startTime < timeoutMs) {
      try {
        const status = await this.request(`/tasks/${taskId}`);

        if (status.status === 'ready') {
          const videoId = status.video_id;
          console.log(`[TwelveLabs] Indexering klaar: video_id=${videoId}`);
          return videoId;
        }

        if (status.status === 'failed') {
          console.log(`[TwelveLabs] Indexering mislukt: ${JSON.stringify(status.error || 'onbekend')}`);
          return null;
        }

        // Nog bezig (queued, validating, indexing, pending)
      } catch {}

      await new Promise(r => setTimeout(r, pollInterval));
    }

    console.log(`[TwelveLabs] Indexering timeout na ${timeoutMs / 1000}s`);
    return null;
  }

  // ══════════════════════════════════════════════════
  // SEARCH & ANALYSE
  // ══════════════════════════════════════════════════

  /**
   * Zoek in een index naar video fragmenten die matchen met een beschrijving
   */
  async searchInIndex(indexId: string, query: string, limit = 5): Promise<Array<{
    videoId: string;
    score: number;
    start: number;
    end: number;
    confidence: string;
  }>> {
    try {
      const result = await this.request('/search', {
        method: 'POST',
        body: JSON.stringify({
          index_id: indexId,
          query_text: query,
          search_options: ['visual', 'audio'],
          group_by: 'clip',
          page_limit: limit,
          sort_option: 'score',
        }),
      });

      return (result.data || []).map((item: any) => ({
        videoId: item.video_id,
        score: item.score || 0,
        start: item.start || 0,
        end: item.end || 0,
        confidence: item.confidence || 'unknown',
      }));
    } catch (error: any) {
      console.log(`[TwelveLabs] Search fout: ${error.message}`);
      return [];
    }
  }

  /**
   * Analyseer een video met een prompt (Pegasus generate)
   */
  async analyzeVideo(videoId: string, prompt: string): Promise<string> {
    try {
      const result = await this.request('/generate', {
        method: 'POST',
        body: JSON.stringify({
          video_id: videoId,
          prompt,
        }),
      });

      return result.data || result.text || '';
    } catch (error: any) {
      console.log(`[TwelveLabs] Analyse fout: ${error.message}`);
      return '';
    }
  }

  /**
   * Genereer een samenvatting van een video
   */
  async summarizeVideo(videoId: string): Promise<string> {
    try {
      const result = await this.request('/summarize', {
        method: 'POST',
        body: JSON.stringify({
          video_id: videoId,
          type: 'summary',
        }),
      });

      return result.summary || result.data || '';
    } catch (error: any) {
      console.log(`[TwelveLabs] Samenvatting fout: ${error.message}`);
      return '';
    }
  }

  // ══════════════════════════════════════════════════
  // HIGH-LEVEL VALIDATIE FUNCTIES
  // ══════════════════════════════════════════════════

  /**
   * Valideer of een lokaal videobestand past bij een scene beschrijving.
   * 
   * Flow: upload → indexeer → analyseer → score → cleanup
   * 
   * Returns: { score: 0-1, description, matches: boolean, tags }
   */
  async validateLocalVideo(params: {
    filePath: string;
    expectedDescription: string;
    projectIndexId?: string;  // Hergebruik project index als die er is
    cleanup?: boolean;        // Verwijder video uit index na validatie
  }): Promise<{ score: number; description: string; matches: boolean; tags: string[] }> {
    const defaultResult = { score: 0.5, description: 'Validatie niet beschikbaar', matches: true, tags: [] };

    try {
      // Gebruik bestaande project index of maak tijdelijke
      const indexId = params.projectIndexId || await this.getOrCreateIndex('temp-validation');

      // Upload en indexeer
      const videoId = await this.uploadVideoFile(indexId, params.filePath);
      if (!videoId) return defaultResult;

      // Analyseer met Pegasus
      const analysis = await this.analyzeVideo(videoId, 
        `Beschrijf kort wat er te zien is in deze video. ` +
        `Beoordeel of dit een goede visuele match is voor: "${params.expectedDescription}". ` +
        `Geef een JSON response: {"score": 0-10, "description": "wat je ziet", "tags": ["tag1","tag2"], "match_reason": "waarom het wel/niet past"}`
      );

      // Parse score
      let score = 0.5;
      let description = analysis;
      let tags: string[] = [];

      try {
        const jsonStr = analysis.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
        const firstBrace = jsonStr.indexOf('{');
        const lastBrace = jsonStr.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          const parsed = JSON.parse(jsonStr.slice(firstBrace, lastBrace + 1));
          score = (parsed.score || 5) / 10;
          description = parsed.description || analysis.slice(0, 300);
          tags = parsed.tags || [];
        }
      } catch {
        // Probeer score uit tekst te halen
        const scoreMatch = analysis.match(/(\d+)\s*(?:\/\s*10|out of 10)/i);
        if (scoreMatch) score = parseInt(scoreMatch[1]) / 10;
      }

      // Cleanup als gevraagd en het een temp index was
      if (params.cleanup && !params.projectIndexId) {
        try { await this.deleteIndex(indexId); } catch {}
      }

      return {
        score: Math.min(1, Math.max(0, score)),
        description: description.slice(0, 500),
        matches: score >= 0.6,
        tags,
      };
    } catch (error: any) {
      console.log(`[TwelveLabs] Validatie fout (niet-kritiek): ${error.message}`);
      return defaultResult;
    }
  }

  /**
   * Valideer meerdere video's in batch (efficiënter — hergebruikt 1 index)
   */
  async validateBatch(params: {
    videos: Array<{ filePath: string; expectedDescription: string; id: string | number }>;
    projectName: string;
  }): Promise<Map<string | number, { score: number; description: string; matches: boolean; tags: string[] }>> {
    const results = new Map();
    
    if (params.videos.length === 0) return results;

    try {
      // Maak project-specifieke index
      const indexName = `validation-${params.projectName}`.slice(0, 48);
      const indexId = await this.getOrCreateIndex(indexName);

      for (const video of params.videos) {
        const result = await this.validateLocalVideo({
          filePath: video.filePath,
          expectedDescription: video.expectedDescription,
          projectIndexId: indexId,
          cleanup: false,
        });
        results.set(video.id, result);
        console.log(`[TwelveLabs] Validatie ${video.id}: score=${result.score.toFixed(2)} matches=${result.matches}`);
      }

      // Cleanup index na batch
      try { await this.deleteIndex(indexId); } catch {}
    } catch (error: any) {
      console.log(`[TwelveLabs] Batch validatie fout: ${error.message}`);
    }

    return results;
  }

  // ══════════════════════════════════════════════════
  // UTILITIES
  // ══════════════════════════════════════════════════

  /**
   * Check of de API key werkt
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.request('/indexes?page=1&page_limit=1');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Haal beschikbare indexeringsminuten op
   */
  async getUsage(): Promise<{ used: number; limit: number; remaining: number } | null> {
    try {
      const data = await this.request('/usage');
      return {
        used: data.usage?.indexing_minutes_used || 0,
        limit: data.usage?.indexing_minutes_limit || 600,
        remaining: (data.usage?.indexing_minutes_limit || 600) - (data.usage?.indexing_minutes_used || 0),
      };
    } catch {
      return null;
    }
  }
}
