/**
 * Asset Search Service v4 — Streaming Hybrid B-Roll Pipeline
 * 
 * Streaming Architecture:
 * - LLM batch klaar → direct door naar DB check → Sonar → Download → Validatie
 * - Geen wachten tot alle fasen volledig klaar zijn
 * 
 * Hybrid Search:
 * - Laag 1: Hoofdbronnen (volledige speeches, persconferenties) → TwelveLabs index
 * - Laag 2: Gevarieerde B-roll per segment → YouTube + nieuwssites + social media
 * 
 * API's:
 * - Sonar-pro via Elevate Chat API (real-time web search, geen Perplexity key nodig)
 * - video-download-api (YouTube downloads)
 * - TwelveLabs (validatie + hergebruik index)
 * - LLM/Sonnet (query generatie, script analyse)
 * 
 * Draait bij: Trending, Documentary, Compilation, Spokesperson
 * Niet bij: AI type (stap 14+15)
 */

import prisma from '../db.js';
import { TwelveLabsService } from './twelvelabs.js';
import { llmSimplePrompt, LLM_MODELS } from './llm.js';
import fs from 'fs/promises';
import path from 'path';

// ══════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════

interface BRollConfig {
  projectDir: string;
  projectName: string;
  channelName?: string;
  settings: any;
  videoType: string;
}

interface VoiceoverSegment {
  id: number;
  timestamp_start: number;  // seconden
  timestamp_end: number;    // seconden
  spoken_text: string;
  duration: number;         // seconden
}

interface BRollRequest {
  id: number;
  timestamp_start: number;
  timestamp_end: number;
  spoken_text: string;
  search_query: string;
  preferred_type: 'video' | 'image';
  context: string;
  fallback_query: string;
  is_key_event: boolean;  // Hoort bij een hoofdbron?
  key_event_id?: number;  // Welke hoofdbron?
}

interface KeySource {
  id: number;
  description: string;
  search_query: string;
  youtube_url?: string;
  local_path?: string;
  twelvelabs_video_id?: string;
}

interface BRollResult {
  id: number;
  timestamp_start: number;
  timestamp_end: number;
  asset_type: 'video' | 'image';
  source: 'database' | 'twelvelabs_index' | 'key_source' | 'youtube' | 'news_image' | 'skipped';
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
  key_sources: KeySource[];
  stats: {
    total_segments: number;
    from_database: number;
    from_twelve_labs: number;
    from_key_source: number;
    from_youtube: number;
    from_news_image: number;
    skipped: number;
    total_time_ms: number;
  };
  clip_gaps: Array<{ start: number; end: number; clip_id: number }>;
}

// ══════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════

const SEGMENT_TARGET_S = 4.5;
const SEGMENT_MAX_S = 6;
const MAX_CLIP_REUSE = 3;
const MIN_REUSE_GAP_S = 120;
const TWELVE_LABS_MIN_SCORE = 0.6;
const LLM_BATCH_SIZE = 15;
const SONAR_BATCH_SIZE = 3;
const VIDEO_DOWNLOAD_PARALLEL = 8;
const IMAGE_DOWNLOAD_PARALLEL = 12;
const TWELVELABS_PARALLEL = 5;
const VIDEO_DOWNLOAD_API_BASE = 'https://p.lbserver.xyz';
const ELEVATE_CHAT_URL = 'https://chat-api.elevate.uno/v1/chat/completions';

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
        console.error("[Parallel] Item " + i + " fout: " + error.message);
        results[i] = undefined as any;
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ══════════════════════════════════════════════════
// UTILITY: Sonar-pro call via Elevate Chat API
// ══════════════════════════════════════════════════

async function callSonarPro(
  elevateApiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 1500
): Promise<string> {
  try {
    const response = await fetch(ELEVATE_CHAT_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + elevateApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error("Sonar-pro API fout (" + response.status + "): " + text.slice(0, 200));
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (error: any) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new Error('Sonar-pro timeout (60s)');
    }
    throw error;
  }
}

// ══════════════════════════════════════════════════
// UTILITY: Robuuste JSON parser
// ══════════════════════════════════════════════════

function parseJsonSafe(text: string): any[] {
  const cleaned = text.trim().replace(/^```json?\s*/g, '').replace(/\s*```$/g, '');

  // Probeer array
  const arrStart = cleaned.indexOf('[');
  const arrEnd = cleaned.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd > arrStart) {
    try { return JSON.parse(cleaned.slice(arrStart, arrEnd + 1)); } catch {}
  }

  // Probeer object met array property
  const objStart = cleaned.indexOf('{');
  const objEnd = cleaned.lastIndexOf('}');
  if (objStart !== -1 && objEnd > objStart) {
    try {
      const obj = JSON.parse(cleaned.slice(objStart, objEnd + 1));
      return obj.segments || obj.queries || obj.results || obj.data || obj.sources || obj.key_sources || [];
    } catch {}
  }

  return [];
}

// ══════════════════════════════════════════════════
// UTILITY: Extract URLs from text
// ══════════════════════════════════════════════════

function extractYouTubeUrls(text: string): string[] {
  const regex = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
  const urls: string[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    urls.push('https://www.youtube.com/watch?v=' + match[1]);
  }
  return [...new Set(urls)];
}

function extractImageUrls(text: string): string[] {
  const regex = /https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)/gi;
  return [...new Set(text.match(regex) || [])];
}

// ══════════════════════════════════════════════════
// MAIN: executeAssetSearch (Stap 12)
// ══════════════════════════════════════════════════

export async function executeAssetSearch(config: BRollConfig): Promise<BRollPlan> {
  const startTime = Date.now();
  const { projectDir: projDir, projectName, settings } = config;

  console.log("\n" + "═".repeat(60));
  console.log("[B-Roll] Start Streaming Hybrid Pipeline voor \"" + projectName + "\"");
  console.log("═".repeat(60) + "\n");

  const brollDir = path.join(projDir, 'assets', 'b-roll');
  await fs.mkdir(brollDir, { recursive: true });

  // ─── PRE-ANALYSE: Script + Taal + Hoofdbronnen ───
  console.log("[B-Roll] ▶ Pre-analyse: Script, taal en hoofdbronnen...");

  const { segments, clipGaps } = await buildSegments(projDir);
  console.log("[B-Roll]   " + segments.length + " segmenten, " + clipGaps.length + " clip gaps");

  if (segments.length === 0) {
    console.log("[B-Roll]   Geen segmenten — pipeline klaar");
    const emptyPlan: BRollPlan = {
      segments: [], key_sources: [], clip_gaps: clipGaps,
      stats: { total_segments: 0, from_database: 0, from_twelve_labs: 0, from_key_source: 0, from_youtube: 0, from_news_image: 0, skipped: 0, total_time_ms: Date.now() - startTime },
    };
    await fs.writeFile(path.join(projDir, 'assets', 'b-roll-plan.json'), JSON.stringify(emptyPlan, null, 2));
    return emptyPlan;
  }

  // Lees script en research voor context
  let scriptText = '';
  try { scriptText = await fs.readFile(path.join(projDir, 'script', 'script.txt'), 'utf-8'); } catch {}
  let researchJson: any = {};
  try { researchJson = JSON.parse(await fs.readFile(path.join(projDir, 'research', 'research.json'), 'utf-8')); } catch {}

  const llmKeys = { elevateApiKey: settings.elevateApiKey, anthropicApiKey: settings.anthropicApiKey };

  // Script analyse: taal, key events, hergebruik-strategie
  const scriptAnalysis = await analyzeScript(scriptText, researchJson, llmKeys);
  console.log("[B-Roll]   Taal: " + scriptAnalysis.language + " | Key events: " + scriptAnalysis.keySources.length + " | Max hergebruik: " + scriptAnalysis.maxReuse);

  // ─── HOOFDBRONNEN OPHALEN (parallel met segment processing) ───
  const keySources: KeySource[] = scriptAnalysis.keySources;
  let keySourcesPromise: Promise<void> | null = null;

  if (keySources.length > 0 && settings.elevateApiKey) {
    console.log("[B-Roll]   Hoofdbronnen zoeken via Sonar-pro...");
    keySourcesPromise = fetchKeySources(keySources, settings, brollDir);
  }

  // ─── STREAMING PIPELINE: LLM → DB → Sonar → Download ───
  console.log("\n[B-Roll] ▶ Streaming pipeline starten...");

  const allResults: BRollResult[] = new Array(segments.length);
  const usedClipIds = new Map<string, { count: number; lastUsedAt_s: number }>();

  // TwelveLabs setup
  let twelvelabs: TwelveLabsService | null = null;
  let channelIndexId: string | null = null;
  if (settings.twelveLabsApiKey) {
    twelvelabs = new TwelveLabsService({ apiKey: settings.twelveLabsApiKey });
    if (config.channelName) {
      try {
        const indexName = ("channel-" + config.channelName.replace(/[^a-zA-Z0-9]/g, '-')).slice(0, 48);
        channelIndexId = await twelvelabs.getOrCreateIndex(indexName);
      } catch (e: any) {
        console.log("[B-Roll]   TwelveLabs index fout: " + e.message);
      }
    }
  }

  // Maak LLM batches
  const batches: VoiceoverSegment[][] = [];
  for (let i = 0; i < segments.length; i += LLM_BATCH_SIZE) {
    batches.push(segments.slice(i, i + LLM_BATCH_SIZE));
  }

  // Streaming: elke batch doorloopt direct het hele pad
  let completedBatches = 0;

  await parallelLimit(batches, 2, async (batch, batchIdx) => {
    const batchStart = Date.now();
    console.log("[B-Roll]   Batch " + (batchIdx + 1) + "/" + batches.length + " (" + batch.length + " segmenten)...");

    // ── STAP A: LLM queries genereren ──
    const requests = await generateBatchQueries(batch, scriptAnalysis, llmKeys);

    // ── STAP B: Database check ──
    const unmatchedRequests: BRollRequest[] = [];
    for (const req of requests) {
      const globalIdx = segments.findIndex(s => s.id === req.id);
      
      // Check key source match
      if (req.is_key_event && req.key_event_id != null) {
        const ks = keySources.find(k => k.id === req.key_event_id);
        if (ks?.local_path) {
          allResults[globalIdx] = {
            id: req.id, timestamp_start: req.timestamp_start, timestamp_end: req.timestamp_end,
            asset_type: 'video', source: 'key_source', file_path: ks.local_path,
            source_url: ks.youtube_url || '', search_query: req.search_query,
          };
          continue;
        }
      }

      // Check AssetClip database
      const dbMatch = await searchAssetClipDB(req, usedClipIds, scriptAnalysis.maxReuse);
      if (dbMatch) {
        allResults[globalIdx] = {
          id: req.id, timestamp_start: req.timestamp_start, timestamp_end: req.timestamp_end,
          asset_type: dbMatch.isVideo ? 'video' : 'image', source: 'database',
          file_path: dbMatch.localPath, source_url: dbMatch.sourceUrl,
          search_query: req.search_query, asset_clip_id: dbMatch.id,
        };
        const tracking = usedClipIds.get(dbMatch.id) || { count: 0, lastUsedAt_s: 0 };
        tracking.count++; tracking.lastUsedAt_s = req.timestamp_start;
        usedClipIds.set(dbMatch.id, tracking);
        continue;
      }

      // Check TwelveLabs index
      if (twelvelabs && channelIndexId) {
        try {
          const searchResults = await twelvelabs.searchInIndex(channelIndexId, req.search_query, 3);
          const best = searchResults.find(r => r.score >= TWELVE_LABS_MIN_SCORE);
          if (best) {
            allResults[globalIdx] = {
              id: req.id, timestamp_start: req.timestamp_start, timestamp_end: req.timestamp_end,
              asset_type: 'video', source: 'twelvelabs_index', file_path: '',
              source_url: '', source_start_s: best.start, source_end_s: best.end,
              search_query: req.search_query, twelve_labs_score: best.score,
            };
            continue;
          }
        } catch {}
      }

      unmatchedRequests.push(req);
    }

    // ── STAP C: Sonar-pro zoeken + Download ──
    if (unmatchedRequests.length > 0 && settings.elevateApiKey) {
      console.log("[B-Roll]   Unmatched: " + unmatchedRequests.length + " (video: " + unmatchedRequests.filter(r => r.preferred_type === "video").length + ", image: " + unmatchedRequests.filter(r => r.preferred_type === "image").length + ")");
      const videoReqs = unmatchedRequests.filter(r => r.preferred_type === 'video');
      const imageReqs = unmatchedRequests.filter(r => r.preferred_type === 'image');

      // Video: Sonar → YouTube URLs → Download
      if (videoReqs.length > 0) {
        const videoUrls = await fetchVideoUrlsViaSonar(videoReqs, settings, scriptAnalysis.language);
        console.log("[B-Roll]   Sonar video zoeken voor " + videoReqs.length + " segments...");

        console.log("[B-Roll]   Video URLs gevonden: " + videoUrls.filter(u => u?.url).length + "/" + videoReqs.length);
        await parallelLimit(
          videoReqs.map((req, i) => ({ req, urlInfo: videoUrls[i] })),
          VIDEO_DOWNLOAD_PARALLEL,
          async ({ req, urlInfo }) => {
            const globalIdx = segments.findIndex(s => s.id === req.id);
            if (!urlInfo?.url) return;
            console.log("[B-Roll]   Downloading " + urlInfo.url.slice(0, 60) + "...");

            const download = await downloadYouTubeVideo(urlInfo.url, req, brollDir, settings);
            if (download?.filePath) {
              allResults[globalIdx] = {
                id: req.id, timestamp_start: req.timestamp_start, timestamp_end: req.timestamp_end,
                asset_type: 'video', source: 'youtube', file_path: download.filePath,
                source_url: download.sourceUrl, search_query: req.search_query,
              };
            }
          }
        );
      }

      // Images: Sonar → News image URLs → Download
      if (imageReqs.length > 0) {
        const imageUrls = await fetchImageUrlsViaSonar(imageReqs, settings, scriptAnalysis.language);

        await parallelLimit(
          imageReqs.map((req, i) => ({ req, urlInfo: imageUrls[i] })),
          IMAGE_DOWNLOAD_PARALLEL,
          async ({ req, urlInfo }) => {
            const globalIdx = segments.findIndex(s => s.id === req.id);
            if (!urlInfo?.url) return;
            console.log("[B-Roll]   Downloading " + urlInfo.url.slice(0, 60) + "...");

            const download = await downloadImage(urlInfo.url, req, brollDir);
            if (download?.filePath) {
              allResults[globalIdx] = {
                id: req.id, timestamp_start: req.timestamp_start, timestamp_end: req.timestamp_end,
                asset_type: 'image', source: 'news_image', file_path: download.filePath,
                source_url: download.sourceUrl, search_query: req.search_query,
              };
            }
          }
        );
      }

      // Fallback: mislukte video requests → probeer als image
      const failedVideoReqs = videoReqs.filter(req => {
        const globalIdx = segments.findIndex(s => s.id === req.id);
        return !allResults[globalIdx]?.file_path;
      });

      if (failedVideoReqs.length > 0) {
        const fallbackUrls = await fetchImageUrlsViaSonar(failedVideoReqs, settings, scriptAnalysis.language);
        await parallelLimit(
          failedVideoReqs.map((req, i) => ({ req, urlInfo: fallbackUrls[i] })),
          IMAGE_DOWNLOAD_PARALLEL,
          async ({ req, urlInfo }) => {
            const globalIdx = segments.findIndex(s => s.id === req.id);
            if (!urlInfo?.url) return;
            console.log("[B-Roll]   Downloading " + urlInfo.url.slice(0, 60) + "...");
            const download = await downloadImage(urlInfo.url, req, brollDir);
            if (download?.filePath) {
              allResults[globalIdx] = {
                id: req.id, timestamp_start: req.timestamp_start, timestamp_end: req.timestamp_end,
                asset_type: 'image', source: 'news_image', file_path: download.filePath,
                source_url: download.sourceUrl, search_query: req.fallback_query || req.search_query,
              };
            }
          }
        );
      }
    }

    completedBatches++;
    const found = requests.filter(r => {
      const idx = segments.findIndex(s => s.id === r.id);
      return allResults[idx]?.file_path || allResults[idx]?.source === 'twelvelabs_index';
    }).length;
    console.log("[B-Roll]   Batch " + (batchIdx + 1) + " klaar: " + found + "/" + requests.length + " gevonden (" + (Date.now() - batchStart) + "ms)");
  });

  // Wacht op hoofdbronnen als die nog bezig zijn
  if (keySourcesPromise) {
    console.log("[B-Roll]   Wachten op hoofdbronnen...");
    await keySourcesPromise;
  }

  // ─── TwelveLabs Validatie (optioneel, voor nieuwe video's) ───
  if (twelvelabs) {
    const videosToValidate = allResults
      .filter(r => r && r.file_path && r.asset_type === 'video' && r.source !== 'database' && r.source !== 'twelvelabs_index')
      .slice(0, 30);

    if (videosToValidate.length > 0) {
      console.log("[B-Roll]   " + videosToValidate.length + " video's valideren via TwelveLabs...");
      const projectIndexName = ("broll-" + projectName.replace(/[^a-zA-Z0-9]/g, '-')).slice(0, 48);
      try {
        const projectIndexId = await twelvelabs.getOrCreateIndex(projectIndexName);
        await parallelLimit(videosToValidate, TWELVELABS_PARALLEL, async (video) => {
          try {
            const result = await twelvelabs!.validateLocalVideo({
              filePath: video.file_path, expectedDescription: video.search_query,
              projectIndexId, cleanup: false,
            });
            video.twelve_labs_score = result.score;
          } catch {}
        });
      } catch {}
    }

    // Upload naar kanaal-index (fire and forget)
    if (channelIndexId) {
      const newVideos = allResults.filter(r => r && r.file_path && r.asset_type === 'video' && r.source === 'youtube').slice(0, 20);
      if (newVideos.length > 0) {
        parallelLimit(newVideos, 3, async (video) => {
          try { await twelvelabs!.uploadVideoFile(channelIndexId!, video.file_path); } catch {}
          return null;
        }).catch(() => {});
      }
    }
  }

  // ─── OUTPUT ───
  console.log("\n[B-Roll] ▶ Output genereren...");

  // Vul lege results → skipped
  for (let i = 0; i < segments.length; i++) {
    if (!allResults[i]) {
      const seg = segments[i];
      allResults[i] = {
        id: seg.id, timestamp_start: seg.timestamp_start, timestamp_end: seg.timestamp_end,
        asset_type: 'video', source: 'skipped', file_path: '', source_url: '',
        search_query: '',
      };
    }
  }

  // Sla nieuwe assets op in database
  for (const asset of allResults) {
    if (asset.file_path && asset.source !== 'database' && asset.source !== 'twelvelabs_index' && asset.source !== 'skipped') {
      try {
        const clip = await prisma.assetClip.create({
          data: {
            sourceUrl: asset.source_url || '', videoId: '',
            title: asset.search_query.slice(0, 100),
            startTime: String(Math.floor(asset.source_start_s || 0)),
            endTime: String(Math.floor(asset.source_end_s || 0)),
            localPath: asset.file_path,
            tags: JSON.stringify([asset.search_query]),
            description: asset.search_query,
            category: asset.asset_type === 'video' ? 'b-roll-video' : 'b-roll-image',
            subjects: '[]', mood: null,
            quality: asset.twelve_labs_score || null,
          },
        });
        asset.asset_clip_id = clip.id;
      } catch {}
    }
  }

  const totalTime = Date.now() - startTime;
  const plan: BRollPlan = {
    segments: allResults.filter(r => r != null),
    key_sources: keySources,
    stats: {
      total_segments: allResults.length,
      from_database: allResults.filter(r => r?.source === 'database').length,
      from_twelve_labs: allResults.filter(r => r?.source === 'twelvelabs_index').length,
      from_key_source: allResults.filter(r => r?.source === 'key_source').length,
      from_youtube: allResults.filter(r => r?.source === 'youtube').length,
      from_news_image: allResults.filter(r => r?.source === 'news_image').length,
      skipped: allResults.filter(r => r?.source === 'skipped').length,
      total_time_ms: totalTime,
    },
    clip_gaps: clipGaps,
  };

  await fs.writeFile(path.join(projDir, 'assets', 'b-roll-plan.json'), JSON.stringify(plan, null, 2), 'utf-8');

  console.log("\n" + "═".repeat(60));
  console.log("[B-Roll] ✓ Pipeline klaar in " + (totalTime / 1000).toFixed(1) + "s");
  console.log("[B-Roll]   Totaal: " + plan.stats.total_segments);
  console.log("[B-Roll]   DB: " + plan.stats.from_database + " | TL: " + plan.stats.from_twelve_labs + " | Key: " + plan.stats.from_key_source);
  console.log("[B-Roll]   YT: " + plan.stats.from_youtube + " | IMG: " + plan.stats.from_news_image + " | Skip: " + plan.stats.skipped);
  console.log("═".repeat(60) + "\n");

  return plan;
}

// ══════════════════════════════════════════════════
// SCRIPT ANALYSE: taal, key events, strategie
// ══════════════════════════════════════════════════

async function analyzeScript(
  scriptText: string,
  researchJson: any,
  llmKeys: any
): Promise<{
  language: string;
  keySources: KeySource[];
  maxReuse: number;
  topicSummary: string;
}> {
  const defaultResult = { language: 'en', keySources: [], maxReuse: 3, topicSummary: '' };
  if (!scriptText) return defaultResult;

  try {
    const scriptPreview = scriptText.slice(0, 3000);
    const title = researchJson.title || researchJson.topic || '';

    const rawResponse = await llmSimplePrompt(
      llmKeys,
      "You analyze video scripts. Return ONLY JSON, no other text.",
      "Analyze this script and return JSON:\n" +
      "1. language: the script language code (en, nl, de, etc.)\n" +
      "2. topic_summary: 1-sentence summary of the video topic\n" +
      "3. key_events: array of 2-5 major events/sources mentioned that would have dedicated video footage (press conferences, speeches, incidents, protests etc). Each with: id (1-5), description, search_query (YouTube search terms).\n" +
      "4. max_reuse: how many times a single source video can be reused (2-5, more for narrow topics, less for broad topics)\n\n" +
      "Title: " + title + "\n\nScript:\n" + scriptPreview + "\n\nReturn JSON only: {\"language\":\"en\",\"topic_summary\":\"...\",\"key_events\":[{\"id\":1,\"description\":\"...\",\"search_query\":\"...\"}],\"max_reuse\":3}",
      { model: LLM_MODELS.SONNET, maxTokens: 2000, temperature: 0.3 }
    );

    const parsed = parseJsonSafe(rawResponse);
    // parseJsonSafe returns array, but we expect object — try direct parse
    let analysis: any;
    try {
      const cleaned = rawResponse.trim().replace(/^```json?\s*/g, '').replace(/\s*```$/g, '');
      const objStart = cleaned.indexOf('{');
      const objEnd = cleaned.lastIndexOf('}');
      if (objStart !== -1 && objEnd > objStart) {
        analysis = JSON.parse(cleaned.slice(objStart, objEnd + 1));
      }
    } catch {}

    if (!analysis) return defaultResult;

    return {
      language: analysis.language || 'en',
      topicSummary: analysis.topic_summary || '',
      maxReuse: Math.min(Math.max(analysis.max_reuse || 3, 1), 10),
      keySources: (analysis.key_events || []).map((e: any, i: number) => ({
        id: e.id || i + 1,
        description: e.description || '',
        search_query: e.search_query || '',
      })),
    };
  } catch (error: any) {
    console.log("[B-Roll]   Script analyse fout: " + error.message);
    return defaultResult;
  }
}

// ══════════════════════════════════════════════════
// HOOFDBRONNEN OPHALEN via Sonar-pro
// ══════════════════════════════════════════════════

async function fetchKeySources(
  keySources: KeySource[],
  settings: any,
  brollDir: string,
): Promise<void> {
  if (!settings.elevateApiKey || keySources.length === 0) return;

  await parallelLimit(keySources, 3, async (source) => {
    try {
      const response = await callSonarPro(
        settings.elevateApiKey,
        "You find YouTube video URLs. Return only YouTube URLs, one per line.",
        "Find the full YouTube video for: " + source.search_query + ". " +
        "Prefer: full unedited footage, C-SPAN, official channels, news networks. " +
        "Return the best YouTube URL only.",
        500
      );

      const urls = extractYouTubeUrls(response);
      if (urls.length > 0) {
        source.youtube_url = urls[0];
        console.log("[B-Roll]   Key source " + source.id + ": " + urls[0]);

        // Download
        const outputPath = path.join(brollDir, "key-source-" + source.id + ".mp4");
        const download = await downloadVideoFile(urls[0], outputPath, settings);
        if (download) {
          source.local_path = outputPath;
        }
      }
    } catch (error: any) {
      console.log("[B-Roll]   Key source " + source.id + " fout: " + error.message);
    }
  });
}

// ══════════════════════════════════════════════════
// BUILD SEGMENTS from Timestamps
// ══════════════════════════════════════════════════

async function buildSegments(projDir: string): Promise<{
  segments: VoiceoverSegment[];
  clipGaps: Array<{ start: number; end: number; clip_id: number }>;
}> {
  const timestampsPath = path.join(projDir, 'audio', 'timestamps.json');
  const timestampsRaw = JSON.parse(await fs.readFile(timestampsPath, 'utf-8'));
  const words: Array<{ text: string; start: number; end: number }> = timestampsRaw.words || [];

  if (words.length === 0) throw new Error('timestamps.json bevat geen woorden');

  let clipGaps: Array<{ start: number; end: number; clip_id: number }> = [];
  try {
    const clipPosPath = path.join(projDir, 'audio', 'clip-positions.json');
    const clipData = JSON.parse(await fs.readFile(clipPosPath, 'utf-8'));
    clipGaps = (clipData.clips || []).map((c: any) => ({
      start: c.timeline_start || c.voiceover_pause_at || 0,
      end: c.timeline_end || (c.timeline_start + (c.clip_duration || 0)) || 0,
      clip_id: c.clip_id || 0,
    }));
  } catch {}

  const segments: VoiceoverSegment[] = [];
  let segmentId = 1;
  let currentWords: typeof words = [];
  let segmentStart = words[0]?.start || 0;

  for (const word of words) {
    const inClipGap = clipGaps.some(g => word.start >= g.start && word.start <= g.end);

    if (inClipGap) {
      if (currentWords.length > 0) {
        const lastWord = currentWords[currentWords.length - 1];
        segments.push({
          id: segmentId++, timestamp_start: segmentStart, timestamp_end: lastWord.end,
          spoken_text: currentWords.map(w => w.text).join(' '),
          duration: lastWord.end - segmentStart,
        });
        currentWords = [];
      }
      segmentStart = word.end;
      continue;
    }

    currentWords.push(word);
    const segmentDuration = word.end - segmentStart;

    if (segmentDuration >= SEGMENT_TARGET_S && currentWords.length >= 3) {
      segments.push({
        id: segmentId++, timestamp_start: segmentStart, timestamp_end: word.end,
        spoken_text: currentWords.map(w => w.text).join(' '),
        duration: word.end - segmentStart,
      });
      currentWords = [];
      segmentStart = word.end;
    } else if (segmentDuration >= SEGMENT_MAX_S) {
      segments.push({
        id: segmentId++, timestamp_start: segmentStart, timestamp_end: word.end,
        spoken_text: currentWords.map(w => w.text).join(' '),
        duration: word.end - segmentStart,
      });
      currentWords = [];
      segmentStart = word.end;
    }
  }

  if (currentWords.length > 0) {
    const lastWord = currentWords[currentWords.length - 1];
    segments.push({
      id: segmentId++, timestamp_start: segmentStart, timestamp_end: lastWord.end,
      spoken_text: currentWords.map(w => w.text).join(' '),
      duration: lastWord.end - segmentStart,
    });
  }

  const filteredSegments = segments.filter(seg => seg.duration >= 1.5);
  console.log("[B-Roll]   Woorden: " + words.length + " → Segmenten: " + filteredSegments.length + " (" + (segments.length - filteredSegments.length) + " te kort verwijderd)");

  return { segments: filteredSegments, clipGaps };
}

// ══════════════════════════════════════════════════
// LLM: Generate queries for a batch
// ══════════════════════════════════════════════════

async function generateBatchQueries(
  batch: VoiceoverSegment[],
  scriptAnalysis: { language: string; keySources: KeySource[]; topicSummary: string },
  llmKeys: any
): Promise<BRollRequest[]> {
  const keyEventsList = scriptAnalysis.keySources.map(k => "ID " + k.id + ": " + k.description).join('; ');

  try {
    const segmentList = batch.map(s =>
      "ID " + s.id + ": \"" + s.spoken_text + "\" (" + s.timestamp_start.toFixed(1) + "s - " + s.timestamp_end.toFixed(1) + "s)"
    ).join('\n');

    const rawResponse = await llmSimplePrompt(
      llmKeys,
      "You are an expert video editor generating B-roll search queries for a " + scriptAnalysis.language + " video.\n" +
      "The video is about: " + scriptAnalysis.topicSummary + "\n" +
      (keyEventsList ? "Key events in this video: " + keyEventsList + "\n" : "") +
      "\nRULES:\n" +
      "- Search queries must be visually descriptive, 3-8 words\n" +
      "- Language of visual on-screen text must match: " + scriptAnalysis.language + "\n" +
      "- Prefer video for: actions, events, locations, people, footage\n" +
      "- Use image ONLY for: data, charts, graphs, logos, documents\n" +
      "- If a segment relates to a key event, set is_key_event=true and key_event_id\n" +
      "- Fallback query should be broader (2-4 words)\n" +
      "\nReturn ONLY a JSON array:\n" +
      "[{\"id\":1,\"search_query\":\"...\",\"preferred_type\":\"video\",\"context\":\"...\",\"fallback_query\":\"...\",\"is_key_event\":false,\"key_event_id\":null}]",
      "Segments:\n" + segmentList + "\n\nGenerate for ALL " + batch.length + " segments. JSON array only.",
      { model: LLM_MODELS.SONNET, maxTokens: 4096, temperature: 0.4 }
    );

    const parsed = parseJsonSafe(rawResponse);

    return batch.map(seg => {
      const match = parsed.find((p: any) => p.id === seg.id) || parsed[batch.indexOf(seg)];
      return {
        id: seg.id,
        timestamp_start: seg.timestamp_start,
        timestamp_end: seg.timestamp_end,
        spoken_text: seg.spoken_text,
        search_query: match?.search_query || seg.spoken_text.split(/\s+/).slice(0, 6).join(' '),
        preferred_type: match?.preferred_type === 'image' ? 'image' as const : 'video' as const,
        context: match?.context || '',
        fallback_query: match?.fallback_query || seg.spoken_text.split(/\s+/).slice(0, 3).join(' '),
        is_key_event: !!match?.is_key_event,
        key_event_id: match?.key_event_id || undefined,
      };
    });
  } catch (error: any) {
    console.log("[B-Roll]   LLM batch fout: " + error.message + " — fallback queries");
    return batch.map(seg => ({
      id: seg.id, timestamp_start: seg.timestamp_start, timestamp_end: seg.timestamp_end,
      spoken_text: seg.spoken_text,
      search_query: seg.spoken_text.split(/\s+/).slice(0, 6).join(' '),
      preferred_type: 'video' as const, context: 'Fallback',
      fallback_query: seg.spoken_text.split(/\s+/).slice(0, 3).join(' '),
      is_key_event: false,
    }));
  }
}

// ══════════════════════════════════════════════════
// DATABASE SEARCH (AssetClip)
// ══════════════════════════════════════════════════

async function searchAssetClipDB(
  req: BRollRequest,
  usedClips: Map<string, { count: number; lastUsedAt_s: number }>,
  maxReuse: number
): Promise<any | null> {
  try {
    const queryWords = req.search_query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (queryWords.length === 0) return null;

    const clips = await prisma.assetClip.findMany({
      where: {
        AND: [
          { localPath: { not: '' } },
          { OR: queryWords.slice(0, 5).map(word => ({
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

    for (const clip of clips) {
      const tracking = usedClips.get(clip.id);
      if (tracking) {
        if (tracking.count >= maxReuse) continue;
        if (req.timestamp_start - tracking.lastUsedAt_s < MIN_REUSE_GAP_S) continue;
      }

      try { await fs.access(clip.localPath); } catch { continue; }

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
        return { ...clip, isVideo: clip.localPath.endsWith('.mp4') || clip.localPath.endsWith('.webm') };
      }
    }
    return null;
  } catch { return null; }
}

// ══════════════════════════════════════════════════
// SONAR-PRO: Fetch YouTube Video URLs
// ══════════════════════════════════════════════════

async function fetchVideoUrlsViaSonar(
  requests: BRollRequest[],
  settings: any,
  language: string
): Promise<Array<{ url: string; title?: string } | null>> {
  if (!settings.elevateApiKey) return requests.map(() => null);

  const results: Array<{ url: string; title?: string } | null> = new Array(requests.length).fill(null);

  const batches: BRollRequest[][] = [];
  for (let i = 0; i < requests.length; i += SONAR_BATCH_SIZE) {
    batches.push(requests.slice(i, i + SONAR_BATCH_SIZE));
  }

  await parallelLimit(batches, 3, async (batch, batchIdx) => {
    try {
      const queryList = batch.map((r, i) =>
        (i + 1) + ". " + r.search_query + " (" + (r.timestamp_end - r.timestamp_start).toFixed(1) + "s footage needed)"
      ).join('\n');

      const response = await callSonarPro(
        settings.elevateApiKey,
        "Find YouTube video URLs for B-roll footage. For each query find ONE YouTube URL. " +
        "Prefer: news footage, official channels, documentaries. " +
        "Video content language should match: " + language + ". " +
        "Avoid: music videos, podcasts, shorts. " +
        "Return ONLY YouTube URLs, one per line, numbered to match the queries.",
        "Find YouTube videos for:\n" + queryList,
        1500
      );

      const urls = extractYouTubeUrls(response);
      const lines = response.split('\n');

      for (let i = 0; i < batch.length; i++) {
        // Probeer URL te matchen op regelnummer
        const lineMatch = lines.find(l => l.match(new RegExp("^\\s*" + (i + 1) + "[.):] ")));
        if (lineMatch) {
          const lineUrls = extractYouTubeUrls(lineMatch);
          if (lineUrls.length > 0) {
            const globalIdx = requests.indexOf(batch[i]);
            if (globalIdx !== -1) results[globalIdx] = { url: lineUrls[0] };
            continue;
          }
        }
        // Fallback: gebruik URLs in volgorde
        if (urls[i]) {
          const globalIdx = requests.indexOf(batch[i]);
          if (globalIdx !== -1) results[globalIdx] = { url: urls[i] };
        }
      }
    } catch (error: any) {
      console.log("[B-Roll]   Sonar video batch " + (batchIdx + 1) + " fout: " + error.message);
    }
    return null;
  });

  return results;
}

// ══════════════════════════════════════════════════
// SONAR-PRO: Fetch News Image URLs
// ══════════════════════════════════════════════════

async function fetchImageUrlsViaSonar(
  requests: BRollRequest[],
  settings: any,
  language: string
): Promise<Array<{ url: string; title?: string } | null>> {
  if (!settings.elevateApiKey) return requests.map(() => null);

  const results: Array<{ url: string; title?: string } | null> = new Array(requests.length).fill(null);

  const batches: BRollRequest[][] = [];
  for (let i = 0; i < requests.length; i += SONAR_BATCH_SIZE) {
    batches.push(requests.slice(i, i + SONAR_BATCH_SIZE));
  }

  await parallelLimit(batches, 3, async (batch, batchIdx) => {
    try {
      const queryList = batch.map((r, i) =>
        (i + 1) + ". " + r.search_query
      ).join('\n');

      const response = await callSonarPro(
        settings.elevateApiKey,
        "Find high-quality news images from the web. " +
        "For each query find ONE direct image URL (.jpg, .png, .webp). " +
        "Prefer: news agencies (Reuters, AP, Getty), official sources. " +
        "Include the full URL for each. Return numbered list matching the queries.",
        "Find images for:\n" + queryList,
        1500
      );

      const urls = extractImageUrls(response);
      for (let i = 0; i < batch.length && i < urls.length; i++) {
        const globalIdx = requests.indexOf(batch[i]);
        if (globalIdx !== -1) results[globalIdx] = { url: urls[i] };
      }
    } catch (error: any) {
      console.log("[B-Roll]   Sonar image batch " + (batchIdx + 1) + " fout: " + error.message);
    }
    return null;
  });

  return results;
}

// ══════════════════════════════════════════════════
// DOWNLOAD: YouTube Video via video-download-api
// ══════════════════════════════════════════════════

async function downloadVideoFile(
  youtubeUrl: string,
  outputPath: string,
  settings: any,
  startTimeSec?: number,
  endTimeSec?: number
): Promise<boolean> {
  const apiKey = settings.videoDownloadApiKey;
  if (!apiKey) return false;

  try {
    const encodedUrl = encodeURIComponent(youtubeUrl);
    let apiUrl = VIDEO_DOWNLOAD_API_BASE + "/ajax/download.php?format=1080&url=" + encodedUrl + "&apikey=" + apiKey;

    // Voeg start/end time toe als ze meegegeven zijn
    if (startTimeSec && startTimeSec > 0) apiUrl += "&start_time=" + Math.floor(startTimeSec);
    if (endTimeSec && endTimeSec > startTimeSec!) apiUrl += "&end_time=" + Math.floor(endTimeSec);

    // Stap 1: Start download taak
    const response = await fetch(apiUrl, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) {
      console.log("[Download] API start fout: " + response.status);
      return false;
    }

    const data = await response.json();
    if (!data.success) {
      console.log("[Download] API niet succesvol: " + JSON.stringify(data).slice(0, 200));
      return false;
    }

    // Nieuwe API: async poll-model (content is leeg, progress_url beschikbaar)
    if (!data.content && data.progress_url) {
      const downloadUrl = await pollVideoProgress(data.progress_url, 300_000); // 5 min max
      if (!downloadUrl) return false;

      const videoResponse = await fetch(downloadUrl, { signal: AbortSignal.timeout(300_000) });
      if (!videoResponse.ok) return false;

      const arrayBuffer = await videoResponse.arrayBuffer();
      const videoBuffer = Buffer.from(arrayBuffer);
      if (videoBuffer.length < 10_000) return false;

      await fs.writeFile(outputPath, videoBuffer);
      return true;
    }

    // Fallback: oude API (base64 content met directe download link)
    if (data.content) {
      const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
      const urlMatch = decoded.match(/href="([^"]+)"/i) || decoded.match(/(https?:\/\/[^\s"'<>]+)/i);
      if (!urlMatch?.[1]) return false;

      const videoResponse = await fetch(urlMatch[1], { signal: AbortSignal.timeout(300_000) });
      if (!videoResponse.ok) return false;

      const arrayBuffer = await videoResponse.arrayBuffer();
      const videoBuffer = Buffer.from(arrayBuffer);
      if (videoBuffer.length < 10_000) return false;

      await fs.writeFile(outputPath, videoBuffer);
      return true;
    }

    return false;
  } catch (error: any) {
    console.log("[Download] Fout: " + error.message);
    return false;
  }
}

/**
 * Poll de video-download-api progress URL tot de download klaar is.
 * Returns de download URL als succesvol, null als timeout of fout.
 */
async function pollVideoProgress(
  progressUrl: string,
  timeoutMs: number = 300_000,
  pollIntervalMs: number = 5_000
): Promise<string | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(progressUrl, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) {
        console.log("[Download] Poll fout: " + response.status);
        await sleep(pollIntervalMs);
        continue;
      }

      const data = await response.json();

      if (data.success === 1 && data.download_url) {
        return data.download_url;
      }

      // Check op definitieve fout (success = -1 of error veld)
      if (data.success === -1 || data.error) {
        console.log("[Download] Poll definitief mislukt: " + (data.text || data.error || 'onbekend'));
        return null;
      }

      // Nog bezig — wacht en probeer opnieuw
      await sleep(pollIntervalMs);
    } catch (error: any) {
      console.log("[Download] Poll exception: " + error.message);
      await sleep(pollIntervalMs);
    }
  }

  console.log("[Download] Poll timeout na " + (timeoutMs / 1000) + "s");
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadYouTubeVideo(
  youtubeUrl: string,
  req: BRollRequest,
  outputDir: string,
  settings: any
): Promise<{ filePath: string; sourceUrl: string } | null> {
  const outputPath = path.join(outputDir, "segment-" + String(req.id).padStart(4, '0') + ".mp4");
  const success = await downloadVideoFile(youtubeUrl, outputPath, settings);
  if (success) {
    console.log("[B-Roll]   ✓ Video segment " + req.id);
    return { filePath: outputPath, sourceUrl: youtubeUrl };
  }
  return null;
}

// ══════════════════════════════════════════════════
// DOWNLOAD: Image
// ══════════════════════════════════════════════════

async function downloadImage(
  imageUrl: string,
  req: BRollRequest,
  outputDir: string
): Promise<{ filePath: string; sourceUrl: string } | null> {
  try {
    const response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(30_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VideoProducer/1.0)' },
    });
    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    let ext = '.jpg';
    if (contentType.includes('png')) ext = '.png';
    else if (contentType.includes('webp')) ext = '.webp';

    const outputPath = path.join(outputDir, "segment-" + String(req.id).padStart(4, '0') + ext);
    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    if (imageBuffer.length < 5_000) return null;

    // Magic byte check
    const h = imageBuffer.slice(0, 4);
    const isImage = (h[0] === 0xFF && h[1] === 0xD8) || (h[0] === 0x89 && h[1] === 0x50) ||
                    (h[0] === 0x52 && h[1] === 0x49) || (h[0] === 0x47 && h[1] === 0x49);
    if (!isImage) return null;

    await fs.writeFile(outputPath, imageBuffer);
    console.log("[B-Roll]   ✓ Image segment " + req.id);
    return { filePath: outputPath, sourceUrl: imageUrl };
  } catch { return null; }
}
