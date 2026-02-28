/**
 * Asset Search Service v3 — B-Roll Pipeline Complete Rebuild
 * 
 * 5-Fasen Flow:
 * 1. Script → Segmenten + Zoekqueries (LLM gebatcht)
 * 2. Database Check (AssetClip + TwelveLabs indexes)
 * 3. Nieuwe Footage Ophalen (Sonar → YouTube/Google Images)
 * 4. TwelveLabs Validatie & Indexering (parallel)
 * 5. Output (b-roll-plan.json + bestanden)
 * 
 * Draait alleen bij: Trending, Documentary, Compilation, Spokesperson
 * Niet bij: AI type (die gebruikt stap 14+15)
 * 
 * Parallellisatie:
 * - LLM queries: 15 segmenten per batch
 * - Sonar URL zoeken: 10 segmenten per batch, 3 parallel
 * - Video downloads: 10 parallel
 * - Image downloads: 15 parallel
 * - TwelveLabs validatie: 5 parallel
 */

import prisma from '../db.js';
import { TwelveLabsService } from './twelvelabs.js';
import { llmJsonPrompt, LLM_MODELS } from './llm.js';
import { PerplexityService } from './perplexity.js';
import fs from 'fs/promises';
import path from 'path';

// ══════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════

interface BRollConfig {
  projectDir: string;
  projectName: string;
  channelName?: string;
  settings: any;          // Settings record uit DB
  videoType: string;      // 'trending' | 'documentary' | 'compilation' | 'spokesperson'
}

interface VoiceoverSegment {
  id: number;
  timestamp_start_ms: number;
  timestamp_end_ms: number;
  spoken_text: string;
  duration_ms: number;
}

interface BRollRequest {
  id: number;
  timestamp_start_ms: number;
  timestamp_end_ms: number;
  spoken_text: string;
  search_query: string;
  preferred_type: 'video' | 'image';
  context: string;
  fallback_query: string;
}

interface BRollResult {
  id: number;
  timestamp_start_ms: number;
  timestamp_end_ms: number;
  asset_type: 'video' | 'image';
  source: 'database' | 'twelvelabs_index' | 'youtube' | 'google_image' | 'failed';
  file_path: string;
  source_url: string;
  source_start_s?: number;
  source_end_s?: number;
  twelve_labs_score?: number;
  search_query: string;
  asset_clip_id?: string;
}

interface BRollPlan {
  segments: BRollResult[];
  stats: {
    total_segments: number;
    from_database: number;
    from_twelve_labs: number;
    from_youtube_new: number;
    from_google_image: number;
    failed: number;
    total_time_ms: number;
  };
  clip_gaps: Array<{ start_ms: number; end_ms: number; clip_id: number }>;
}

// ══════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════

const SEGMENT_MIN_MS = 3000;       // Min 3 seconden per segment
const SEGMENT_MAX_MS = 6000;       // Max 6 seconden per segment
const SEGMENT_TARGET_MS = 4500;    // Target 4.5 seconden
const MAX_CLIP_REUSE = 3;          // Max 3x hergebruik per video
const MIN_REUSE_GAP_MS = 120_000;  // Min 2 minuten tussen hergebruik
const TWELVE_LABS_MIN_SCORE = 0.6; // Minimum validatie score
const LLM_BATCH_SIZE = 15;        // Segmenten per LLM batch call
const SONAR_BATCH_SIZE = 10;       // Segmenten per Sonar batch
const SONAR_PARALLEL = 3;          // Parallelle Sonar batches
const VIDEO_DOWNLOAD_PARALLEL = 10;// Parallelle video downloads
const IMAGE_DOWNLOAD_PARALLEL = 15;// Parallelle image downloads
const TWELVELABS_PARALLEL = 5;     // Parallelle TwelveLabs validaties
const VIDEO_DOWNLOAD_API_BASE = 'https://p.lbserver.xyz';

// ══════════════════════════════════════════════════
// UTILITY: Parallel executor met concurrency limiet
// ══════════════════════════════════════════════════

async function parallelLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      try {
        results[i] = await fn(items[i], i);
      } catch (error: any) {
        console.error(`[Parallel] Item ${i} fout: ${error.message}`);
        results[i] = undefined as any;
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ══════════════════════════════════════════════════
// MAIN: executeAssetSearch (Stap 12)
// ══════════════════════════════════════════════════

export async function executeAssetSearch(config: BRollConfig): Promise<BRollPlan> {
  const startTime = Date.now();
  const { projectDir: projDir, projectName, settings } = config;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`[B-Roll] Start Asset Pipeline voor "${projectName}"`);
  console.log(`${'═'.repeat(60)}\n`);

  // Maak output directories
  const brollDir = path.join(projDir, 'assets', 'b-roll');
  await fs.mkdir(brollDir, { recursive: true });

  // ─── FASE 1: Script → Segmenten + Zoekqueries ───
  console.log(`[B-Roll] ▶ Fase 1: Script analyseren en segmenten maken...`);
  const phase1Start = Date.now();

  const { segments, clipGaps } = await buildSegments(projDir);
  console.log(`[B-Roll]   ${segments.length} segmenten, ${clipGaps.length} clip gaps`);

  const requests = await generateSearchQueries(segments, projDir, settings);
  console.log(`[B-Roll]   ${requests.length} zoekqueries gegenereerd (${Date.now() - phase1Start}ms)`);

  // ─── FASE 2: Database Check ───
  console.log(`\n[B-Roll] ▶ Fase 2: Database checken (AssetClip + TwelveLabs)...`);
  const phase2Start = Date.now();

  const results: BRollResult[] = new Array(requests.length);
  const unmatchedRequests: BRollRequest[] = [];
  const usedClipIds = new Map<string, { count: number; lastUsedAtMs: number }>();

  // Check AssetClip database
  for (let i = 0; i < requests.length; i++) {
    const req = requests[i];
    const dbMatch = await searchAssetClipDB(req, usedClipIds);

    if (dbMatch) {
      results[i] = {
        id: req.id,
        timestamp_start_ms: req.timestamp_start_ms,
        timestamp_end_ms: req.timestamp_end_ms,
        asset_type: dbMatch.isVideo ? 'video' : 'image',
        source: 'database',
        file_path: dbMatch.localPath,
        source_url: dbMatch.sourceUrl,
        search_query: req.search_query,
        asset_clip_id: dbMatch.id,
        twelve_labs_score: dbMatch.quality || undefined,
      };

      // Track hergebruik
      const tracking = usedClipIds.get(dbMatch.id) || { count: 0, lastUsedAtMs: 0 };
      tracking.count++;
      tracking.lastUsedAtMs = req.timestamp_start_ms;
      usedClipIds.set(dbMatch.id, tracking);

      // Update DB usage
      await prisma.assetClip.update({
        where: { id: dbMatch.id },
        data: { timesUsed: { increment: 1 }, lastUsedAt: new Date() },
      }).catch(() => {});
    } else {
      unmatchedRequests.push(req);
    }
  }

  // Check TwelveLabs index voor kanaal
  let twelvelabs: TwelveLabsService | null = null;
  let channelIndexId: string | null = null;

  if (settings.twelveLabsApiKey) {
    twelvelabs = new TwelveLabsService({ apiKey: settings.twelveLabsApiKey });
    if (config.channelName) {
      try {
        const indexName = `channel-${config.channelName.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 40)}`;
        channelIndexId = await twelvelabs.getOrCreateIndex(indexName);
        console.log(`[B-Roll]   TwelveLabs index: ${indexName} (${channelIndexId})`);

        // Zoek in bestaande index voor ongematchte segmenten
        const tlMatched: number[] = [];
        for (const req of unmatchedRequests) {
          const searchResults = await twelvelabs.searchInIndex(channelIndexId, req.search_query, 3);
          const bestMatch = searchResults.find(r => r.score >= TWELVE_LABS_MIN_SCORE);

          if (bestMatch) {
            const idx = requests.findIndex(r => r.id === req.id);
            results[idx] = {
              id: req.id,
              timestamp_start_ms: req.timestamp_start_ms,
              timestamp_end_ms: req.timestamp_end_ms,
              asset_type: 'video',
              source: 'twelvelabs_index',
              file_path: '',
              source_url: '',
              source_start_s: bestMatch.start,
              source_end_s: bestMatch.end,
              search_query: req.search_query,
              twelve_labs_score: bestMatch.score,
            };
            tlMatched.push(req.id);
          }
        }

        // Verwijder TL-matched items uit unmatchedRequests
        if (tlMatched.length > 0) {
          console.log(`[B-Roll]   ${tlMatched.length} matches uit TwelveLabs index`);
          for (const id of tlMatched) {
            const idx = unmatchedRequests.findIndex(r => r.id === id);
            if (idx !== -1) unmatchedRequests.splice(idx, 1);
          }
        }
      } catch (e: any) {
        console.log(`[B-Roll]   TwelveLabs index fout (niet-kritiek): ${e.message}`);
      }
    }
  }

  const dbMatches = requests.length - unmatchedRequests.length;
  console.log(`[B-Roll]   ${dbMatches} matches gevonden, ${unmatchedRequests.length} nog te zoeken (${Date.now() - phase2Start}ms)`);

  // ─── FASE 3: Nieuwe Footage Ophalen ───
  console.log(`\n[B-Roll] ▶ Fase 3: Nieuwe footage ophalen via Sonar + Downloads...`);
  const phase3Start = Date.now();

  if (unmatchedRequests.length > 0) {
    // Split in video en image requests
    const videoRequests = unmatchedRequests.filter(r => r.preferred_type === 'video');
    const imageRequests = unmatchedRequests.filter(r => r.preferred_type === 'image');

    console.log(`[B-Roll]   ${videoRequests.length} video requests, ${imageRequests.length} image requests`);

    // ── Video: Sonar → YouTube URLs → Download ──
    if (videoRequests.length > 0) {
      const videoUrls = await fetchYouTubeUrlsViaSonar(videoRequests, settings);
      console.log(`[B-Roll]   ${videoUrls.filter(v => v.url).length}/${videoRequests.length} YouTube URLs gevonden`);

      // Download videos parallel
      const videoDownloads = await parallelLimit(
        videoRequests.map((req, i) => ({ req, urlInfo: videoUrls[i] })),
        VIDEO_DOWNLOAD_PARALLEL,
        async ({ req, urlInfo }) => {
          if (!urlInfo?.url) return null;
          return downloadYouTubeVideo(urlInfo.url, req, brollDir, settings);
        }
      );

      // Map resultaten terug
      for (let i = 0; i < videoRequests.length; i++) {
        const req = videoRequests[i];
        const download = videoDownloads[i];
        const idx = requests.findIndex(r => r.id === req.id);

        if (download?.filePath) {
          results[idx] = {
            id: req.id,
            timestamp_start_ms: req.timestamp_start_ms,
            timestamp_end_ms: req.timestamp_end_ms,
            asset_type: 'video',
            source: 'youtube',
            file_path: download.filePath,
            source_url: download.sourceUrl,
            search_query: req.search_query,
          };
        }
      }
    }

    // ── Images: Sonar → Google Image URLs → Download ──
    if (imageRequests.length > 0) {
      const imageUrls = await fetchImageUrlsViaSonar(imageRequests, settings);
      console.log(`[B-Roll]   ${imageUrls.filter(v => v.url).length}/${imageRequests.length} image URLs gevonden`);

      // Download images parallel
      const imageDownloads = await parallelLimit(
        imageRequests.map((req, i) => ({ req, urlInfo: imageUrls[i] })),
        IMAGE_DOWNLOAD_PARALLEL,
        async ({ req, urlInfo }) => {
          if (!urlInfo?.url) return null;
          return downloadImage(urlInfo.url, req, brollDir);
        }
      );

      for (let i = 0; i < imageRequests.length; i++) {
        const req = imageRequests[i];
        const download = imageDownloads[i];
        const idx = requests.findIndex(r => r.id === req.id);

        if (download?.filePath) {
          results[idx] = {
            id: req.id,
            timestamp_start_ms: req.timestamp_start_ms,
            timestamp_end_ms: req.timestamp_end_ms,
            asset_type: 'image',
            source: 'google_image',
            file_path: download.filePath,
            source_url: download.sourceUrl,
            search_query: req.search_query,
          };
        }
      }
    }

    // Probeer video-failed segmenten als image fallback
    const failedVideoReqs = videoRequests.filter(req => {
      const idx = requests.findIndex(r => r.id === req.id);
      return !results[idx]?.file_path;
    });

    if (failedVideoReqs.length > 0) {
      console.log(`[B-Roll]   ${failedVideoReqs.length} mislukte video requests → probeer als image fallback...`);
      const fallbackImageUrls = await fetchImageUrlsViaSonar(failedVideoReqs, settings);

      const fallbackDownloads = await parallelLimit(
        failedVideoReqs.map((req, i) => ({ req, urlInfo: fallbackImageUrls[i] })),
        IMAGE_DOWNLOAD_PARALLEL,
        async ({ req, urlInfo }) => {
          if (!urlInfo?.url) return null;
          return downloadImage(urlInfo.url, req, brollDir);
        }
      );

      for (let i = 0; i < failedVideoReqs.length; i++) {
        const req = failedVideoReqs[i];
        const download = fallbackDownloads[i];
        const idx = requests.findIndex(r => r.id === req.id);

        if (download?.filePath) {
          results[idx] = {
            id: req.id,
            timestamp_start_ms: req.timestamp_start_ms,
            timestamp_end_ms: req.timestamp_end_ms,
            asset_type: 'image',
            source: 'google_image',
            file_path: download.filePath,
            source_url: download.sourceUrl,
            search_query: req.fallback_query || req.search_query,
          };
        }
      }
    }
  }

  console.log(`[B-Roll]   Downloads klaar (${Date.now() - phase3Start}ms)`);

  // ─── FASE 4: TwelveLabs Validatie ───
  console.log(`\n[B-Roll] ▶ Fase 4: TwelveLabs validatie (parallel)...`);
  const phase4Start = Date.now();

  if (twelvelabs) {
    // Verzamel alle nieuw gedownloade video's voor validatie
    const videosToValidate = results
      .filter(r => r && r.file_path && r.asset_type === 'video' && r.source !== 'database' && r.source !== 'twelvelabs_index')
      .map(r => ({
        id: r.id,
        filePath: r.file_path,
        searchQuery: r.search_query,
      }));

    if (videosToValidate.length > 0) {
      console.log(`[B-Roll]   ${videosToValidate.length} video's valideren...`);

      // Maak project-specifieke index voor validatie + hergebruik
      const projectIndexName = `broll-${projectName.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 40)}`;
      let projectIndexId: string | null = null;

      try {
        projectIndexId = await twelvelabs.getOrCreateIndex(projectIndexName);
      } catch (e: any) {
        console.log(`[B-Roll]   TwelveLabs index aanmaken mislukt: ${e.message}`);
      }

      if (projectIndexId) {
        // Parallel validatie
        const validationResults = await parallelLimit(
          videosToValidate,
          TWELVELABS_PARALLEL,
          async (video) => {
            try {
              const result = await twelvelabs!.validateLocalVideo({
                filePath: video.filePath,
                expectedDescription: video.searchQuery,
                projectIndexId: projectIndexId!,
                cleanup: false, // Bewaar in index voor hergebruik
              });
              return { id: video.id, ...result };
            } catch (e: any) {
              console.log(`[B-Roll]   Validatie ${video.id} fout: ${e.message}`);
              return { id: video.id, score: 0.5, description: '', matches: true, tags: [] };
            }
          }
        );

        // Update scores in results
        for (const validation of validationResults) {
          if (!validation) continue;
          const result = results.find(r => r?.id === validation.id);
          if (result) {
            result.twelve_labs_score = validation.score;
            if (!validation.matches && validation.score < TWELVE_LABS_MIN_SCORE) {
              console.log(`[B-Roll]   Segment ${validation.id}: lage score (${validation.score.toFixed(2)}) — markeer als zwak`);
            }
          }
        }
      }
    }

    // Upload ook naar kanaal-index voor toekomstig hergebruik
    if (channelIndexId) {
      const newVideos = results.filter(r => r && r.file_path && r.asset_type === 'video' && r.source === 'youtube');
      if (newVideos.length > 0) {
        console.log(`[B-Roll]   ${newVideos.length} video's uploaden naar kanaal-index voor hergebruik...`);
        // Fire and forget — dit hoeft niet te blokkeren
        parallelLimit(newVideos.slice(0, 20), 3, async (video) => {
          try {
            await twelvelabs!.uploadVideoFile(channelIndexId!, video.file_path);
          } catch {}
          return null;
        }).catch(() => {});
      }
    }
  } else {
    console.log(`[B-Roll]   Geen TwelveLabs API key — validatie overgeslagen`);
  }

  console.log(`[B-Roll]   Validatie klaar (${Date.now() - phase4Start}ms)`);

  // ─── FASE 5: Output ───
  console.log(`\n[B-Roll] ▶ Fase 5: Output genereren...`);

  // Vul lege results (failed)
  for (let i = 0; i < requests.length; i++) {
    if (!results[i]) {
      const req = requests[i];
      results[i] = {
        id: req.id,
        timestamp_start_ms: req.timestamp_start_ms,
        timestamp_end_ms: req.timestamp_end_ms,
        asset_type: req.preferred_type,
        source: 'failed',
        file_path: '',
        source_url: '',
        search_query: req.search_query,
      };
    }
  }

  // Sla nieuwe assets op in database
  const newAssets = results.filter(r => r.file_path && r.source !== 'database' && r.source !== 'twelvelabs_index' && r.source !== 'failed');
  for (const asset of newAssets) {
    try {
      const clip = await prisma.assetClip.create({
        data: {
          sourceUrl: asset.source_url || '',
          videoId: '',
          title: asset.search_query.slice(0, 100),
          startTime: String(Math.floor((asset.source_start_s || 0))),
          endTime: String(Math.floor((asset.source_end_s || 0))),
          localPath: asset.file_path,
          tags: JSON.stringify([asset.search_query]),
          description: asset.search_query,
          category: asset.asset_type === 'video' ? 'b-roll-video' : 'b-roll-image',
          subjects: '[]',
          mood: null,
          quality: asset.twelve_labs_score || null,
        },
      });
      asset.asset_clip_id = clip.id;
    } catch (err: any) {
      // Niet-kritiek
    }
  }

  // Bouw stats
  const totalTime = Date.now() - startTime;
  const plan: BRollPlan = {
    segments: results.filter(r => r != null),
    stats: {
      total_segments: results.length,
      from_database: results.filter(r => r?.source === 'database').length,
      from_twelve_labs: results.filter(r => r?.source === 'twelvelabs_index').length,
      from_youtube_new: results.filter(r => r?.source === 'youtube').length,
      from_google_image: results.filter(r => r?.source === 'google_image').length,
      failed: results.filter(r => r?.source === 'failed').length,
      total_time_ms: totalTime,
    },
    clip_gaps: clipGaps,
  };

  // Schrijf output
  const planPath = path.join(projDir, 'assets', 'b-roll-plan.json');
  await fs.writeFile(planPath, JSON.stringify(plan, null, 2), 'utf-8');

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`[B-Roll] ✓ Pipeline klaar in ${(totalTime / 1000).toFixed(1)}s`);
  console.log(`[B-Roll]   Totaal: ${plan.stats.total_segments} segmenten`);
  console.log(`[B-Roll]   Database: ${plan.stats.from_database} | TwelveLabs: ${plan.stats.from_twelve_labs}`);
  console.log(`[B-Roll]   YouTube: ${plan.stats.from_youtube_new} | Images: ${plan.stats.from_google_image}`);
  console.log(`[B-Roll]   Mislukt: ${plan.stats.failed}`);
  console.log(`${'═'.repeat(60)}\n`);

  return plan;
}

// ══════════════════════════════════════════════════
// FASE 1: Build Segments from Timestamps
// ══════════════════════════════════════════════════

async function buildSegments(projDir: string): Promise<{
  segments: VoiceoverSegment[];
  clipGaps: Array<{ start_ms: number; end_ms: number; clip_id: number }>;
}> {
  // Lees timestamps
  const timestampsPath = path.join(projDir, 'audio', 'timestamps.json');
  const timestampsRaw = JSON.parse(await fs.readFile(timestampsPath, 'utf-8'));
  const words: Array<{ text: string; start: number; end: number }> = timestampsRaw.words || [];

  if (words.length === 0) {
    throw new Error('timestamps.json bevat geen woorden');
  }

  // Lees clip-positions (optioneel)
  let clipGaps: Array<{ start_ms: number; end_ms: number; clip_id: number }> = [];
  try {
    const clipPosPath = path.join(projDir, 'audio', 'clip-positions.json');
    const clipData = JSON.parse(await fs.readFile(clipPosPath, 'utf-8'));
    clipGaps = (clipData.clips || []).map((c: any) => ({
      start_ms: c.timeline_start || c.voiceover_pause_at || 0,
      end_ms: c.timeline_end || (c.timeline_start + c.clip_duration * 1000) || 0,
      clip_id: c.clip_id || 0,
    }));
  } catch {
    // Geen clip-positions, dat is OK
  }

  // Groepeer woorden in segmenten van 3-6 seconden
  const segments: VoiceoverSegment[] = [];
  let segmentId = 1;
  let currentWords: typeof words = [];
  let segmentStart = words[0]?.start || 0;

  for (const word of words) {
    // Check of dit woord in een clip-gap zit
    const inClipGap = clipGaps.some(g =>
      word.start >= g.start_ms && word.start <= g.end_ms
    );

    if (inClipGap) {
      // Flush huidige segment als er woorden zijn
      if (currentWords.length > 0) {
        const lastWord = currentWords[currentWords.length - 1];
        segments.push({
          id: segmentId++,
          timestamp_start_ms: segmentStart,
          timestamp_end_ms: lastWord.end,
          spoken_text: currentWords.map(w => w.text).join(' '),
          duration_ms: lastWord.end - segmentStart,
        });
        currentWords = [];
      }
      segmentStart = word.end;
      continue;
    }

    currentWords.push(word);
    const segmentDuration = word.end - segmentStart;

    // Segment afsluiten als we de target duur bereiken
    if (segmentDuration >= SEGMENT_TARGET_MS && currentWords.length >= 3) {
      segments.push({
        id: segmentId++,
        timestamp_start_ms: segmentStart,
        timestamp_end_ms: word.end,
        spoken_text: currentWords.map(w => w.text).join(' '),
        duration_ms: word.end - segmentStart,
      });
      currentWords = [];
      segmentStart = word.end;
    }
    // Forceer afsluiting bij max duur
    else if (segmentDuration >= SEGMENT_MAX_MS) {
      segments.push({
        id: segmentId++,
        timestamp_start_ms: segmentStart,
        timestamp_end_ms: word.end,
        spoken_text: currentWords.map(w => w.text).join(' '),
        duration_ms: word.end - segmentStart,
      });
      currentWords = [];
      segmentStart = word.end;
    }
  }

  // Flush resterende woorden
  if (currentWords.length > 0) {
    const lastWord = currentWords[currentWords.length - 1];
    segments.push({
      id: segmentId++,
      timestamp_start_ms: segmentStart,
      timestamp_end_ms: lastWord.end,
      spoken_text: currentWords.map(w => w.text).join(' '),
      duration_ms: lastWord.end - segmentStart,
    });
  }

  // Filter te korte segmenten (minder dan 1.5 sec)
  const filteredSegments = segments.filter(seg => seg.duration_ms >= 1500);

  console.log(`[B-Roll]   Woorden: ${words.length} → Segmenten: ${filteredSegments.length} (${segments.length - filteredSegments.length} te kort verwijderd)`);

  return { segments: filteredSegments, clipGaps };
}

// ══════════════════════════════════════════════════
// FASE 1b: LLM Search Query Generation (gebatcht)
// ══════════════════════════════════════════════════

async function generateSearchQueries(
  segments: VoiceoverSegment[],
  projDir: string,
  settings: any,
): Promise<BRollRequest[]> {
  const llmKeys = { elevateApiKey: settings.elevateApiKey, anthropicApiKey: settings.anthropicApiKey };

  // Lees research context (optioneel)
  let researchContext = '';
  try {
    const researchPath = path.join(projDir, 'research', 'research.json');
    const research = JSON.parse(await fs.readFile(researchPath, 'utf-8'));
    researchContext = `Video topic: ${research.title || research.topic || 'unknown'}. ${(research.summary || research.description || '').slice(0, 500)}`;
  } catch {}

  // Lees script voor extra context
  let scriptContext = '';
  try {
    const scriptPath = path.join(projDir, 'script', 'script.txt');
    const script = await fs.readFile(scriptPath, 'utf-8');
    scriptContext = script.slice(0, 1000);
  } catch {}

  // Batch LLM calls
  const batches: VoiceoverSegment[][] = [];
  for (let i = 0; i < segments.length; i += LLM_BATCH_SIZE) {
    batches.push(segments.slice(i, i + LLM_BATCH_SIZE));
  }

  const allRequests: BRollRequest[] = [];

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    console.log(`[B-Roll]   LLM batch ${batchIdx + 1}/${batches.length} (${batch.length} segmenten)...`);

    try {
      const segmentList = batch.map(s =>
        `ID ${s.id}: "${s.spoken_text}" (${s.timestamp_start_ms}ms - ${s.timestamp_end_ms}ms)`
      ).join('\n');

      const result = await llmJsonPrompt<any>(
        llmKeys,
        `You are an expert video editor generating B-roll search queries.
For each voiceover segment, generate a visual search query and determine if video or image is more appropriate.

RULES:
- Search queries must be in ENGLISH, 3-8 words, visually descriptive
- Prefer "video" for: actions, people, events, locations, emotions, environments
- Use "image" ONLY for: data/statistics, charts, graphs, documents, specific logos
- Fallback query should be broader (2-4 words)
- Context explains why this B-roll is needed

Return ONLY a JSON array, one object per segment:
[{"id": 1, "search_query": "...", "preferred_type": "video", "context": "...", "fallback_query": "..."}]`,
        `Video context: ${researchContext || scriptContext || 'Unknown topic'}

Segments to process:
${segmentList}

Generate search queries for ALL ${batch.length} segments. Return JSON array only.`,
        { model: LLM_MODELS.SONNET, maxTokens: 4096, temperature: 0.4 }
      );

      // Parse result — kan array of object met array zijn
      const parsed: any[] = Array.isArray(result) ? result : (result.segments || result.queries || []);

      for (const seg of batch) {
        const match = parsed.find((p: any) => p.id === seg.id) || parsed[batch.indexOf(seg)];
        allRequests.push({
          id: seg.id,
          timestamp_start_ms: seg.timestamp_start_ms,
          timestamp_end_ms: seg.timestamp_end_ms,
          spoken_text: seg.spoken_text,
          search_query: match?.search_query || seg.spoken_text.split(/\s+/).slice(0, 6).join(' '),
          preferred_type: match?.preferred_type === 'image' ? 'image' : 'video',
          context: match?.context || '',
          fallback_query: match?.fallback_query || seg.spoken_text.split(/\s+/).slice(0, 3).join(' '),
        });
      }
    } catch (error: any) {
      console.log(`[B-Roll]   LLM batch ${batchIdx + 1} fout: ${error.message} — gebruik fallback queries`);
      for (const seg of batch) {
        allRequests.push({
          id: seg.id,
          timestamp_start_ms: seg.timestamp_start_ms,
          timestamp_end_ms: seg.timestamp_end_ms,
          spoken_text: seg.spoken_text,
          search_query: seg.spoken_text.split(/\s+/).slice(0, 6).join(' '),
          preferred_type: 'video',
          context: 'Fallback — LLM fout',
          fallback_query: seg.spoken_text.split(/\s+/).slice(0, 3).join(' '),
        });
      }
    }
  }

  // Schrijf requests naar disk voor debugging
  const requestsPath = path.join(projDir, 'assets', 'b-roll-requests.json');
  await fs.writeFile(requestsPath, JSON.stringify({
    segments: allRequests,
    total_segments: allRequests.length,
    clip_gaps_excluded: true,
  }, null, 2), 'utf-8');

  return allRequests;
}

// ══════════════════════════════════════════════════
// FASE 2: Database Search (AssetClip)
// ══════════════════════════════════════════════════

async function searchAssetClipDB(
  req: BRollRequest,
  usedClips: Map<string, { count: number; lastUsedAtMs: number }>
): Promise<any | null> {
  try {
    const queryWords = req.search_query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (queryWords.length === 0) return null;

    // Zoek op beschrijving en tags
    const clips = await prisma.assetClip.findMany({
      where: {
        AND: [
          { localPath: { not: '' } },
          {
            OR: queryWords.slice(0, 5).map(word => ({
              OR: [
                { description: { contains: word } },
                { tags: { contains: word } },
                { category: { contains: word } },
              ]
            }))
          },
        ],
      },
      orderBy: [{ quality: 'desc' }, { timesUsed: 'asc' }],
      take: 10,
    });

    if (clips.length === 0) return null;

    // Score en filter
    for (const clip of clips) {
      const tracking = usedClips.get(clip.id);

      // Check hergebruik-regels
      if (tracking) {
        if (tracking.count >= MAX_CLIP_REUSE) continue;
        if (req.timestamp_start_ms - tracking.lastUsedAtMs < MIN_REUSE_GAP_MS) continue;
      }

      // Check of bestand bestaat
      try {
        await fs.access(clip.localPath);
      } catch {
        continue; // Bestand niet gevonden, skip
      }

      // Score berekenen
      let score = 0;
      const clipDesc = (clip.description || '').toLowerCase();
      const clipTags: string[] = (() => { try { return JSON.parse(clip.tags || '[]'); } catch { return []; } })();

      for (const word of queryWords) {
        if (clipDesc.includes(word)) score += 2;
        if (clipTags.some((t: string) => t.toLowerCase().includes(word))) score += 3;
      }

      if (clip.quality && clip.quality > 0.7) score += 2;
      score -= (clip.timesUsed || 0) * 0.5;

      if (score >= 4) {
        return {
          ...clip,
          isVideo: clip.localPath.endsWith('.mp4') || clip.localPath.endsWith('.webm'),
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════
// FASE 3a: Sonar → YouTube Video URLs
// ══════════════════════════════════════════════════

async function fetchYouTubeUrlsViaSonar(
  requests: BRollRequest[],
  settings: any
): Promise<Array<{ url: string; title?: string } | null>> {
  if (!settings.perplexityApiKey) {
    console.log('[B-Roll]   Geen Perplexity API key — skip YouTube URL zoeken');
    return requests.map(() => null);
  }

  const perplexity = new PerplexityService({ apiKey: settings.perplexityApiKey });
  const results: Array<{ url: string; title?: string } | null> = new Array(requests.length).fill(null);

  // Batch Sonar calls
  const batches: BRollRequest[][] = [];
  for (let i = 0; i < requests.length; i += SONAR_BATCH_SIZE) {
    batches.push(requests.slice(i, i + SONAR_BATCH_SIZE));
  }

  // Process batches met parallel limiet
  await parallelLimit(batches, SONAR_PARALLEL, async (batch, batchIdx) => {
    try {
      const queryList = batch.map((r, i) =>
        `${i + 1}. "${r.search_query}" (needed: ${(r.timestamp_end_ms - r.timestamp_start_ms) / 1000}s B-roll)`
      ).join('\n');

      const response = await perplexity.research(
        `You are a video research assistant. Find specific YouTube video URLs for B-roll footage.
For each search query, find ONE specific YouTube video URL that shows the described scene.
Prefer: news footage, documentaries, stock footage channels, official channels.
Avoid: music videos, podcasts, shorts, private/age-restricted videos.

IMPORTANT: Return ONLY a JSON array. No markdown, no explanation.
Format: [{"index": 1, "url": "https://www.youtube.com/watch?v=...", "title": "Video Title"}, ...]
If you cannot find a suitable video, set url to empty string "".`,
        `Find YouTube videos for these B-roll needs:\n${queryList}`
      );

      // Parse response
      let parsed: any[] = [];
      try {
        const jsonStr = response.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
        const firstBracket = jsonStr.indexOf('[');
        const lastBracket = jsonStr.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket > firstBracket) {
          parsed = JSON.parse(jsonStr.slice(firstBracket, lastBracket + 1));
        }
      } catch {
        // Probeer individuele URLs te extracten
        const urlMatches = response.match(/https?:\/\/(?:www\.)?youtube\.com\/watch\?v=[a-zA-Z0-9_-]{11}/g);
        if (urlMatches) {
          parsed = urlMatches.map((url, i) => ({ index: i + 1, url }));
        }
      }

      // Map terug naar results array
      for (let i = 0; i < batch.length; i++) {
        const match = parsed.find((p: any) => p.index === i + 1) || parsed[i];
        if (match?.url && match.url.includes('youtube.com/watch')) {
          const globalIdx = requests.indexOf(batch[i]);
          if (globalIdx !== -1) {
            results[globalIdx] = { url: match.url, title: match.title };
          }
        }
      }
    } catch (error: any) {
      console.log(`[B-Roll]   Sonar video batch ${batchIdx + 1} fout: ${error.message}`);
    }
    return null;
  });

  return results;
}

// ══════════════════════════════════════════════════
// FASE 3b: Sonar → Google Image URLs
// ══════════════════════════════════════════════════

async function fetchImageUrlsViaSonar(
  requests: BRollRequest[],
  settings: any
): Promise<Array<{ url: string; title?: string } | null>> {
  if (!settings.perplexityApiKey) {
    console.log('[B-Roll]   Geen Perplexity API key — skip image URL zoeken');
    return requests.map(() => null);
  }

  const perplexity = new PerplexityService({ apiKey: settings.perplexityApiKey });
  const results: Array<{ url: string; title?: string } | null> = new Array(requests.length).fill(null);

  const batches: BRollRequest[][] = [];
  for (let i = 0; i < requests.length; i += SONAR_BATCH_SIZE) {
    batches.push(requests.slice(i, i + SONAR_BATCH_SIZE));
  }

  await parallelLimit(batches, SONAR_PARALLEL, async (batch, batchIdx) => {
    try {
      const queryList = batch.map((r, i) =>
        `${i + 1}. "${r.search_query}" — need a high-resolution image`
      ).join('\n');

      const response = await perplexity.research(
        `You are a visual research assistant. Find high-quality image URLs from the web.
For each query, find ONE direct image URL (.jpg, .png, .webp) from a reliable source.
Prefer: news agencies (Reuters, AP, Getty), Wikipedia Commons, official sources, high-res photos.
Avoid: thumbnail URLs, tiny images, social media avatars, watermarked stock photos.

IMPORTANT: Return ONLY a JSON array. No markdown, no explanation.
Format: [{"index": 1, "url": "https://example.com/image.jpg", "title": "Image description"}, ...]
If you cannot find a suitable image, set url to empty string "".`,
        `Find images for these B-roll needs:\n${queryList}`
      );

      let parsed: any[] = [];
      try {
        const jsonStr = response.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
        const firstBracket = jsonStr.indexOf('[');
        const lastBracket = jsonStr.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket > firstBracket) {
          parsed = JSON.parse(jsonStr.slice(firstBracket, lastBracket + 1));
        }
      } catch {
        // Probeer URLs te extracten
        const urlMatches = response.match(/https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)/gi);
        if (urlMatches) {
          parsed = urlMatches.map((url, i) => ({ index: i + 1, url }));
        }
      }

      for (let i = 0; i < batch.length; i++) {
        const match = parsed.find((p: any) => p.index === i + 1) || parsed[i];
        if (match?.url && match.url.startsWith('http')) {
          const globalIdx = requests.indexOf(batch[i]);
          if (globalIdx !== -1) {
            results[globalIdx] = { url: match.url, title: match.title };
          }
        }
      }
    } catch (error: any) {
      console.log(`[B-Roll]   Sonar image batch ${batchIdx + 1} fout: ${error.message}`);
    }
    return null;
  });

  return results;
}

// ══════════════════════════════════════════════════
// FASE 3c: Download YouTube Video via video-download-api
// ══════════════════════════════════════════════════

async function downloadYouTubeVideo(
  youtubeUrl: string,
  req: BRollRequest,
  outputDir: string,
  settings: any,
): Promise<{ filePath: string; sourceUrl: string } | null> {
  const apiKey = settings.videoDownloadApiKey;
  if (!apiKey) {
    console.log(`[B-Roll]   Geen videoDownloadApiKey — skip YouTube download`);
    return null;
  }

  try {
    const encodedUrl = encodeURIComponent(youtubeUrl);
    const apiUrl = `${VIDEO_DOWNLOAD_API_BASE}/ajax/download.php?format=720&url=${encodedUrl}&apikey=${apiKey}`;

    const response = await fetch(apiUrl, {
      signal: AbortSignal.timeout(60_000), // 60s timeout per request
    });

    if (!response.ok) {
      console.log(`[B-Roll]   Download API fout ${response.status} voor segment ${req.id}`);
      return null;
    }

    const data = await response.json();
    if (!data.success || !data.content) {
      console.log(`[B-Roll]   Download API niet succesvol voor segment ${req.id}`);
      return null;
    }

    // Decodeer base64 content om download URL te vinden
    const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
    const urlMatch = decoded.match(/href="([^"]+)"/i) || decoded.match(/(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/i);

    if (!urlMatch?.[1]) {
      // Fallback: probeer elke URL uit de decoded content
      const anyUrl = decoded.match(/(https?:\/\/[^\s"'<>]+)/i);
      if (!anyUrl?.[1]) {
        console.log(`[B-Roll]   Geen download URL gevonden in API response voor segment ${req.id}`);
        return null;
      }
    }

    const downloadUrl = urlMatch?.[1] || '';
    if (!downloadUrl) return null;

    const outputPath = path.join(outputDir, `segment-${String(req.id).padStart(4, '0')}.mp4`);

    // Download het videobestand
    const videoResponse = await fetch(downloadUrl, {
      signal: AbortSignal.timeout(120_000), // 2 min timeout
    });

    if (!videoResponse.ok || !videoResponse.body) {
      console.log(`[B-Roll]   Video download mislukt voor segment ${req.id}: ${videoResponse.status}`);
      return null;
    }

    // Stream naar bestand via ArrayBuffer (Node.js compatible)
    const arrayBuffer = await videoResponse.arrayBuffer();
    const videoBuffer = Buffer.from(arrayBuffer);

    if (videoBuffer.length < 10_000) {
      console.log(`[B-Roll]   Gedownload bestand te klein (${videoBuffer.length} bytes) voor segment ${req.id}`);
      return null;
    }

    await fs.writeFile(outputPath, videoBuffer);
    console.log(`[B-Roll]   ✓ Video segment ${req.id} gedownload (${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB)`);

    return { filePath: outputPath, sourceUrl: youtubeUrl };
  } catch (error: any) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      console.log(`[B-Roll]   YouTube download timeout voor segment ${req.id}`);
    } else {
      console.log(`[B-Roll]   YouTube download fout segment ${req.id}: ${error.message}`);
    }
    return null;
  }
}

// ══════════════════════════════════════════════════
// FASE 3d: Download Image
// ══════════════════════════════════════════════════

async function downloadImage(
  imageUrl: string,
  req: BRollRequest,
  outputDir: string,
): Promise<{ filePath: string; sourceUrl: string } | null> {
  try {
    const response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(30_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VideoProducer/1.0)',
      },
    });

    if (!response.ok) {
      return null;
    }

    // Bepaal extensie op basis van content-type
    const contentType = response.headers.get('content-type') || '';
    let ext = '.jpg';
    if (contentType.includes('png')) ext = '.png';
    else if (contentType.includes('webp')) ext = '.webp';
    else if (contentType.includes('gif')) ext = '.gif';

    const outputPath = path.join(outputDir, `segment-${String(req.id).padStart(4, '0')}${ext}`);

    // Download via ArrayBuffer (Node.js compatible)
    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    if (imageBuffer.length < 5_000) {
      return null; // Te klein
    }

    // Magic byte check — is het echt een image?
    const header = imageBuffer.slice(0, 4);
    const isJpeg = header[0] === 0xFF && header[1] === 0xD8;
    const isPng = header[0] === 0x89 && header[1] === 0x50;
    const isWebp = header[0] === 0x52 && header[1] === 0x49;
    const isGif = header[0] === 0x47 && header[1] === 0x49;

    if (!isJpeg && !isPng && !isWebp && !isGif) {
      console.log(`[B-Roll]   Gedownload bestand is geen image voor segment ${req.id}`);
      return null;
    }

    await fs.writeFile(outputPath, imageBuffer);
    console.log(`[B-Roll]   ✓ Image segment ${req.id} gedownload (${(imageBuffer.length / 1024).toFixed(0)}KB)`);

    return { filePath: outputPath, sourceUrl: imageUrl };
  } catch (error: any) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      console.log(`[B-Roll]   Image download timeout voor segment ${req.id}`);
    } else {
      console.log(`[B-Roll]   Image download fout segment ${req.id}: ${error.message}`);
    }
    return null;
  }
}
