/**
 * Media Generator — Direct API calls naar Elevate + GenAIPro
 * Vervangt N8N image-options-generator en video-scene-generator workflows
 */

import fs from 'fs/promises';
import path from 'path';

// ── Types ──

interface MediaSettings {
  elevateApiKey: string;
  genaiProApiKey: string;
  genaiProEnabled: boolean;
  genaiProImagesEnabled: boolean;
}

interface ImageResult {
  sceneId: number;
  provider: 'elevate' | 'genaipro';
  imageUrl: string;
  localPath: string;
  prompt: string;
}

interface VideoResult {
  sceneId: number;
  provider: 'elevate' | 'genaipro';
  videoUrl: string;
  localPath: string;
  prompt: string;
  duration: number;
}

// ── Concurrency Limiter ──

async function withConcurrencyLimit<T>(
  tasks: (() => Promise<T>)[],
  maxConcurrent: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = index++;
      if (i >= tasks.length) break;
      try {
        results[i] = await tasks[i]();
      } catch (err: any) {
        results[i] = undefined as any;
      }
    }
  }

  const workers = Array(Math.min(maxConcurrent, tasks.length))
    .fill(null)
    .map(() => worker());
  await Promise.all(workers);
  return results;
}

// ── Elevate API ──

const ELEVATE_BASE = 'https://public-api.elevate.uno';

async function elevateCreateMedia(
  apiKey: string,
  type: 'image' | 'video',
  prompt: string,
  options: { aspectRatio?: string; sourceImage?: string } = {}
): Promise<{ id: number; type: string }> {
  const body: any = { type, prompt };

  if (type === 'image') {
    body.aspect_ratio = options.aspectRatio || 'landscape';
  }
  if (type === 'video') {
    body.aspect_ratio = options.aspectRatio || 'landscape';
    if (options.sourceImage) {
      body.operation = 'image';
      body.source_image = options.sourceImage;
    }
  }

  const resp = await fetch(`${ELEVATE_BASE}/v2/media`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Elevate ${type} create failed (${resp.status}): ${err.slice(0, 200)}`);
  }

  const data = await resp.json();
  if (!data?.data?.id && !data?.id) {
    console.error('[Elevate] Onverwachte response:', JSON.stringify(data).slice(0, 300));
    throw new Error('Elevate response bevat geen task id: ' + JSON.stringify(data).slice(0, 200));
  }
  return data.data || data;
}

async function elevatePollStatus(
  apiKey: string,
  taskId: number,
  type: 'image' | 'video',
  maxWaitMs: number = 600_000
): Promise<{ resultUrl: string; status: string }> {
  const startTime = Date.now();
  const pollInterval = type === 'video' ? 10_000 : 5_000;

  while (Date.now() - startTime < maxWaitMs) {
    const resp = await fetch(`${ELEVATE_BASE}/v2/media/${taskId}?type=${type}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!resp.ok) throw new Error(`Elevate poll failed: ${resp.status}`);
    const data = await resp.json();
    const task = data.data || data;

    if (task.status === 'completed') {
      return { resultUrl: task.result_url, status: 'completed' };
    }
    if (task.status === 'failed') {
      throw new Error(`Elevate ${type} failed: ${task.error || 'unknown'}`);
    }

    await new Promise(r => setTimeout(r, pollInterval));
  }

  throw new Error(`Elevate ${type} timeout na ${maxWaitMs / 1000}s`);
}

// ── GenAIPro API ──

const GENAIPRO_BASE = 'https://genaipro.vn/api/v1';

async function genaiProCreateImage(
  apiKey: string,
  prompt: string,
  aspectRatio: string = 'IMAGE_ASPECT_RATIO_LANDSCAPE',
  count: number = 1
): Promise<{ fileUrls: string[] }> {
  const formData = new FormData();
  formData.append('prompt', prompt);
  formData.append('aspect_ratio', aspectRatio);
  formData.append('number_of_images', String(count));

  const resp = await fetch(`${GENAIPRO_BASE}/veo/create-image`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`GenAIPro image failed (${resp.status}): ${err.slice(0, 200)}`);
  }

  return await readSSEResponse(resp);
}

async function genaiProTextToVideo(
  apiKey: string,
  prompt: string,
  aspectRatio: string = 'VIDEO_ASPECT_RATIO_LANDSCAPE',
  count: number = 1
): Promise<{ fileUrl: string }> {
  const formData = new FormData();
  formData.append('prompt', prompt);
  formData.append('aspect_ratio', aspectRatio);
  formData.append('number_of_videos', String(count));

  const resp = await fetch(`${GENAIPRO_BASE}/veo/text-to-video`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`GenAIPro video failed (${resp.status}): ${err.slice(0, 200)}`);
  }

  return await readStreamingSSE(resp, 600_000);
}

async function genaiProFrameToVideo(
  apiKey: string,
  startImagePath: string,
  prompt: string,
  aspectRatio: string = 'VIDEO_ASPECT_RATIO_LANDSCAPE'
): Promise<{ fileUrl: string }> {
  const imageBuffer = await fs.readFile(startImagePath);
  const formData = new FormData();
  formData.append('start_image', new Blob([imageBuffer]), 'start.png');
  formData.append('prompt', prompt);
  formData.append('aspect_ratio', aspectRatio);
  formData.append('number_of_videos', '1');

  const resp = await fetch(`${GENAIPRO_BASE}/veo/frames-to-video`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`GenAIPro frame-to-video failed (${resp.status}): ${err.slice(0, 200)}`);
  }

  return await readStreamingSSE(resp, 600_000);
}

// ── SSE Stream Reader ──

async function readSSEResponse(resp: Response): Promise<any> {
  const text = await resp.text();

  // GenAIPro SSE format: "event:<type>\ndata:<json>\n\n"
  // We zoeken het laatste succesvolle data event met JSON
  const lines = text.split('\n');
  let lastData: any = null;
  let lastEvent: string = '';
  let hasError = false;
  let errorMsg = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('event:')) {
      lastEvent = trimmed.slice(6).trim();
    } else if (trimmed.startsWith('data:')) {
      const dataStr = trimmed.slice(5).trim();
      if (lastEvent === 'error' || lastEvent === 'generation_error') {
        hasError = true;
        try { errorMsg = JSON.parse(dataStr).error || dataStr; } catch { errorMsg = dataStr; }
      } else if (dataStr.startsWith('{') || dataStr.startsWith('[')) {
        try {
          const parsed = JSON.parse(dataStr);
          // Alleen opslaan als het een resultaat is (heeft file_urls, fileUrl, id, etc.)
          if (parsed.file_urls || parsed.fileUrls || parsed.id || parsed.url) {
            lastData = parsed;
          }
        } catch {}
      }
    } else if (trimmed.startsWith('data: ')) {
      // Alternatief format met spatie na data:
      const dataStr = trimmed.slice(6).trim();
      if (dataStr.startsWith('{') || dataStr.startsWith('[')) {
        try {
          lastData = JSON.parse(dataStr);
        } catch {}
      }
    }
  }

  // Als we data hebben gevonden, gebruik dat
  if (lastData) return lastData;

  // Als er een error event was, gooi die
  if (hasError) throw new Error('GenAIPro API error: ' + errorMsg);

  // Probeer hele response als JSON te parsen (geen SSE)
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Kon GenAIPro response niet parsen: ' + text.slice(0, 300));
  }
}

// ── Streaming SSE Reader (voor langlopende video generatie) ──

async function readStreamingSSE(resp: Response, timeoutMs: number = 600_000): Promise<any> {
  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('SSE stream timeout na ' + (timeoutMs / 1000) + 's'));
    }, timeoutMs);

    try {
      const text = await resp.text();
      clearTimeout(timeout);

      const lines = text.split('\n');
      let lastData: any = null;
      let lastEvent: string = '';
      let hasError = false;
      let errorMsg = '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('event:')) {
          lastEvent = trimmed.slice(6).trim();
        } else if (trimmed.startsWith('data:')) {
          const dataStr = trimmed.slice(5).trim();

          if (lastEvent === 'error' || lastEvent === 'generation_error') {
            hasError = true;
            try { errorMsg = JSON.parse(dataStr).error || dataStr; } catch { errorMsg = dataStr; }
          } else if (lastEvent.includes('complete') || lastEvent.includes('finished')) {
            // Dit is het eindresultaat
            if (dataStr.startsWith('{') || dataStr.startsWith('[')) {
              try { lastData = JSON.parse(dataStr); } catch {}
            }
          } else if (dataStr.startsWith('{') || dataStr.startsWith('[')) {
            try {
              const parsed = JSON.parse(dataStr);
              // Direct object met file_url(s)
              if (parsed.file_urls || parsed.fileUrls || parsed.file_url || parsed.fileUrl || parsed.video_url || parsed.videoUrl) {
                lastData = parsed;
              }
              // Array response: [{file_url: "..."}]
              if (Array.isArray(parsed) && parsed.length > 0 && (parsed[0].file_url || parsed[0].file_urls)) {
                lastData = parsed;
              }
            } catch {}
          }
        }
      }

      if (lastData) return resolve(lastData);
      if (hasError) return reject(new Error('GenAIPro API error: ' + errorMsg));

      // Probeer hele response als JSON
      try {
        return resolve(JSON.parse(text));
      } catch {
        reject(new Error('Kon GenAIPro streaming response niet parsen: ' + text.slice(0, 300)));
      }
    } catch (err: any) {
      clearTimeout(timeout);
      reject(err);
    }
  });
}

// ── File Download Helper ──

async function downloadFile(url: string, localPath: string): Promise<void> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download failed: ${resp.status} voor ${url}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, buffer);
}

// ── Hoofdfunctie: Image Generatie ──

export async function generateImages(
  scenes: any[],
  projectPath: string,
  settings: MediaSettings,
  onProgress?: (completed: number, total: number, sceneId: number) => void
): Promise<ImageResult[]> {
  const results: ImageResult[] = [];
  const outputDir = path.join(projectPath, 'assets', 'image-options');
  await fs.mkdir(outputDir, { recursive: true });

  const useGenAIPro = settings.genaiProEnabled && settings.genaiProImagesEnabled && settings.genaiProApiKey;
  const useElevate = !!settings.elevateApiKey;

  console.log(`[Images] ${scenes.length} scenes, primair: ${useElevate ? 'Elevate' : 'GenAIPro'}, fallback: ${useElevate && useGenAIPro ? 'GenAIPro' : 'geen'}`);

  const MAX_IMG_CONCURRENT = 20;
  const imgTasks: (() => Promise<void>)[] = scenes.map((scene) => async () => {
    const sceneId = scene.id;
    const prompt = scene.visual_prompt_variants?.[0] || scene.visual_prompt || scene.prompt;

    if (!prompt) {
      console.warn(`[Images] Scene ${sceneId}: geen prompt, overgeslagen`);
      return null;
    }

    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        let imageUrl: string;
        let provider: 'elevate' | 'genaipro';

        // Elevate primair, GenAIPro als fallback
        if (useElevate) {
          try {
            const task = await elevateCreateMedia(settings.elevateApiKey, 'image', prompt, { aspectRatio: 'landscape' });
            const status = await elevatePollStatus(settings.elevateApiKey, task.id, 'image');
            imageUrl = status.resultUrl;
            provider = 'elevate';
          } catch (elevateErr: any) {
            if (!useGenAIPro) throw elevateErr;
            console.warn(`[Images] Scene ${sceneId} Elevate mislukt, fallback naar GenAIPro: ${elevateErr.message}`);
            const genResult = await genaiProCreateImage(settings.genaiProApiKey, prompt, 'IMAGE_ASPECT_RATIO_LANDSCAPE');
            imageUrl = genResult.file_urls?.[0] || (genResult as any).fileUrls?.[0];
            provider = 'genaipro';
          }
        } else if (useGenAIPro) {
          const genResult = await genaiProCreateImage(settings.genaiProApiKey, prompt, 'IMAGE_ASPECT_RATIO_LANDSCAPE');
          imageUrl = genResult.file_urls?.[0] || (genResult as any).fileUrls?.[0];
          provider = 'genaipro';
        } else {
          throw new Error('Geen image provider beschikbaar');
        }

        if (!imageUrl) throw new Error('Geen image URL in response');

        const ext = imageUrl.includes('.png') ? '.png' : '.jpg';
        const localPath = path.join(outputDir, `scene${sceneId}-option1${ext}`);
        await downloadFile(imageUrl, localPath);

        const imgResult: ImageResult = { sceneId, provider, imageUrl, localPath, prompt };
        results.push(imgResult);

        if (onProgress) onProgress(results.length, scenes.length, sceneId);
        console.log(`[Images] Scene ${sceneId} klaar (${results.length}/${scenes.length}) via ${provider}`);
        break; // Succes, stop retry loop

      } catch (err: any) {
        if (attempt < MAX_RETRIES) {
          const delay = attempt * 5;
          console.warn(`[Images] Scene ${sceneId} poging ${attempt}/${MAX_RETRIES} mislukt: ${err.message} (retry in ${delay}s)`);
          await new Promise(r => setTimeout(r, delay * 1000));
        } else {
          console.error(`[Images] Scene ${sceneId} definitief mislukt na ${MAX_RETRIES} pogingen: ${err.message}`);
          
          // Probeer met alternatieve prompt variant
          const variants = scene.visual_prompt_variants || [];
          const currentVariantIdx = variants.indexOf(prompt);
          const nextVariant = variants[currentVariantIdx + 1] || variants[1] || variants[2];
          
          if (nextVariant && nextVariant !== prompt) {
            console.log(`[Images] Scene ${sceneId}: probeer alternatieve prompt variant...`);
            try {
              let imageUrl: string;
              let provider: 'elevate' | 'genaipro';

              if (useElevate) {
                try {
                  const task = await elevateCreateMedia(settings.elevateApiKey, 'image', nextVariant, { aspectRatio: 'landscape' });
                  const status = await elevatePollStatus(settings.elevateApiKey, task.id, 'image');
                  imageUrl = status.resultUrl;
                  provider = 'elevate';
                } catch (elevateErr2: any) {
                  if (!useGenAIPro) throw elevateErr2;
                  const genResult = await genaiProCreateImage(settings.genaiProApiKey, nextVariant, 'IMAGE_ASPECT_RATIO_LANDSCAPE');
                  imageUrl = genResult.file_urls?.[0] || (genResult as any).fileUrls?.[0];
                  provider = 'genaipro';
                }
              } else if (useGenAIPro) {
                const genResult = await genaiProCreateImage(settings.genaiProApiKey, nextVariant, 'IMAGE_ASPECT_RATIO_LANDSCAPE');
                imageUrl = genResult.file_urls?.[0] || (genResult as any).fileUrls?.[0];
                provider = 'genaipro';
              } else {
                throw new Error('Geen provider');
              }

              if (!imageUrl) throw new Error('Geen image URL');

              const ext = imageUrl.includes('.png') ? '.png' : '.jpg';
              const localPath = path.join(outputDir, `scene${sceneId}-option1${ext}`);
              await downloadFile(imageUrl, localPath);

              const imgResult: ImageResult = { sceneId, provider, imageUrl, localPath, prompt: nextVariant };
              results.push(imgResult);
              if (onProgress) onProgress(results.length, scenes.length, sceneId);
              console.log(`[Images] Scene ${sceneId} klaar via alternatieve prompt (${results.length}/${scenes.length}) via ${provider}`);
            } catch (altErr: any) {
              console.error(`[Images] Scene ${sceneId} ook met alternatieve prompt mislukt: ${altErr.message}`);
            }
          }
        }
      }
    }
  });

  await withConcurrencyLimit(imgTasks, MAX_IMG_CONCURRENT);
  return results;
}

// ── Hoofdfunctie: Video Generatie ──

export async function generateVideos(
  scenes: any[],
  imageSelections: any[],
  projectPath: string,
  settings: MediaSettings,
  onProgress?: (completed: number, total: number, sceneId: number) => void
): Promise<VideoResult[]> {
  const results: VideoResult[] = [];
  const outputDir = path.join(projectPath, 'assets', 'scenes');
  await fs.mkdir(outputDir, { recursive: true });

  const useGenAIPro = settings.genaiProEnabled && settings.genaiProApiKey;
  const useElevate = !!settings.elevateApiKey;

  console.log(`[Videos] ${scenes.length} scenes genereren`);
  console.log(`[Videos] Elevate: ${useElevate ? 'ja (1 concurrent)' : 'nee'}`);
  console.log(`[Videos] GenAIPro: ${useGenAIPro ? 'ja (onbeperkt parallel)' : 'nee'}`);

  const elevateQueue: typeof scenes = [];
  const genaiQueue: typeof scenes = [];

  if (useElevate) {
    elevateQueue.push(...scenes);
  } else if (useGenAIPro) {
    genaiQueue.push(...scenes);
  } else if (useElevate) {
    elevateQueue.push(...scenes);
  } else {
    throw new Error('Geen video provider beschikbaar');
  }

  // GenAIPro: alle scenes parallel
  const MAX_VID_CONCURRENT = 10;
  const genaiTasks: (() => Promise<void>)[] = genaiQueue.map((scene) => async () => {
    const sceneId = scene.id;
    const prompt = scene.video_prompt || scene.visual_prompt || scene.prompt;
    const selection = imageSelections.find((s: any) =>
      s.scene_id === sceneId || String(s.scene_id) === String(sceneId)
    );

    try {
      let videoUrl: string;

      if (!selection?.chosen_path) {
        console.warn(`[Videos] Scene ${sceneId}: geen source image, overgeslagen`);
        return;
      }

      const apiResult = await genaiProFrameToVideo(settings.genaiProApiKey, selection.chosen_path, prompt);
      videoUrl = Array.isArray(apiResult) ? apiResult[0]?.file_url : (apiResult.file_url || apiResult.fileUrl);

      const localPath = path.join(outputDir, `scene${sceneId}.mp4`);
      await downloadFile(videoUrl, localPath);

      const videoResult: VideoResult = {
        sceneId, provider: 'genaipro', videoUrl, localPath, prompt,
        duration: scene.duration || 5,
      };
      results.push(videoResult);

      if (onProgress) onProgress(results.length, scenes.length, sceneId);
      console.log(`[Videos] Scene ${sceneId} klaar via GenAIPro (${results.length}/${scenes.length})`);
    } catch (err: any) {
      console.error(`[Videos] Scene ${sceneId} GenAIPro mislukt: ${err.message}`);
      if (useElevate) {
        elevateQueue.push(scene);
        console.log(`[Videos] Scene ${sceneId} fallback naar Elevate queue`);
      }
    }
  });

  // Elevate: sequentieel (1 concurrent)
  const elevatePromise = (async () => {
    for (const scene of elevateQueue) {
      const sceneId = scene.id;
      const prompt = scene.video_prompt || scene.visual_prompt || scene.prompt;
      const selection = imageSelections.find((s: any) =>
        s.scene_id === sceneId || String(s.scene_id) === String(sceneId)
      );

      try {
        if (!selection?.chosen_path) {
          console.warn(`[Videos] Scene ${sceneId}: geen source image, overgeslagen`);
          continue;
        }

        const imgBuffer = await fs.readFile(selection.chosen_path);
        const ext = selection.chosen_path.endsWith('.png') ? 'png' : 'jpeg';
        const sourceImage = `data:image/${ext};base64,${imgBuffer.toString('base64')}`;

        const task = await elevateCreateMedia(settings.elevateApiKey, 'video', prompt, {
          aspectRatio: 'landscape',
          sourceImage,
        });
        const status = await elevatePollStatus(settings.elevateApiKey, task.id, 'video', 600_000);

        const localPath = path.join(outputDir, `scene${sceneId}.mp4`);
        await downloadFile(status.resultUrl, localPath);

        const result: VideoResult = {
          sceneId, provider: 'elevate', videoUrl: status.resultUrl, localPath, prompt,
          duration: scene.duration || 5,
        };
        results.push(result);

        if (onProgress) onProgress(results.length, scenes.length, sceneId);
        console.log(`[Videos] Scene ${sceneId} klaar via Elevate (${results.length}/${scenes.length})`);
      } catch (err: any) {
        console.error(`[Videos] Scene ${sceneId} Elevate mislukt: ${err.message}`);
      }
    }
  })();

  // GenAIPro met concurrency limit + Elevate sequentieel parallel
  await Promise.all([
    withConcurrencyLimit(genaiTasks, MAX_VID_CONCURRENT),
    elevatePromise,
  ]);

  console.log(`[Videos] Klaar! ${results.length}/${scenes.length} scenes succesvol`);
  return results;
}
