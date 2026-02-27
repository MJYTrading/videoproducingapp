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

    // Check of image al bestaat op disk
    const existingFiles = await fs.readdir(outputDir).catch(() => []);
    const existingImage = existingFiles.find((f: string) => f.startsWith(`scene${sceneId}-option1`));
    if (existingImage) {
      const localPath = path.join(outputDir, existingImage);
      results.push({ sceneId, provider: 'cached', imageUrl: '', localPath, prompt } as any);
      if (onProgress) onProgress(results.length, scenes.length, sceneId);
      console.log(`[Images] Scene ${sceneId} al aanwezig, overgeslagen (${results.length}/${scenes.length})`);
      return;
    }

    // Prompt varianten om doorheen te cyclen
    const variants = [prompt, ...(scene.visual_prompt_variants || []).filter((v: string) => v !== prompt)];
    const MAX_ROUNDS = 3; // 3 rondes door alle varianten = nooit opgeven
    
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const currentPrompt = variants[round % variants.length] || prompt;
      const isAltPrompt = round > 0;
      
      if (isAltPrompt) {
        console.log(`[Images] Scene ${sceneId}: ronde ${round + 1}, variant ${(round % variants.length) + 1}...`);
      }

      try {
        let imageUrl: string;
        let provider: 'elevate' | 'genaipro';

        if (useElevate) {
          try {
            const task = await elevateCreateMedia(settings.elevateApiKey, 'image', currentPrompt, { aspectRatio: 'landscape' });
            const status = await elevatePollStatus(settings.elevateApiKey, task.id, 'image');
            imageUrl = status.resultUrl;
            provider = 'elevate';
          } catch (elevateErr: any) {
            if (!useGenAIPro) throw elevateErr;
            console.warn(`[Images] Scene ${sceneId} Elevate mislukt, fallback GenAIPro: ${elevateErr.message}`);
            const genResult = await genaiProCreateImage(settings.genaiProApiKey, currentPrompt, 'IMAGE_ASPECT_RATIO_LANDSCAPE');
            imageUrl = genResult.file_urls?.[0] || (genResult as any).fileUrls?.[0];
            provider = 'genaipro';
          }
        } else if (useGenAIPro) {
          const genResult = await genaiProCreateImage(settings.genaiProApiKey, currentPrompt, 'IMAGE_ASPECT_RATIO_LANDSCAPE');
          imageUrl = genResult.file_urls?.[0] || (genResult as any).fileUrls?.[0];
          provider = 'genaipro';
        } else {
          throw new Error('Geen image provider beschikbaar');
        }

        if (!imageUrl) throw new Error('Geen image URL in response');

        const ext = imageUrl.includes('.png') ? '.png' : '.jpg';
        const localPath = path.join(outputDir, `scene${sceneId}-option1${ext}`);
        await downloadFile(imageUrl, localPath);

        const imgResult: ImageResult = { sceneId, provider, imageUrl, localPath, prompt: currentPrompt };
        results.push(imgResult);
        if (onProgress) onProgress(results.length, scenes.length, sceneId);
        console.log(`[Images] Scene ${sceneId} klaar${isAltPrompt ? " (variant)" : ""} (${results.length}/${scenes.length}) via ${provider}`);
        return; // Succes!

      } catch (err: any) {
        const delay = Math.min(10 + round * 5, 30);
        console.warn(`[Images] Scene ${sceneId} ronde ${round + 1}/${MAX_ROUNDS} mislukt: ${err.message} (retry in ${delay}s)`);
        await new Promise(r => setTimeout(r, delay * 1000));
      }
    }
    
    console.error(`[Images] Scene ${sceneId} mislukt na ${MAX_ROUNDS} rondes met alle varianten`);
  });

  await withConcurrencyLimit(imgTasks, MAX_IMG_CONCURRENT);

  // NOOIT stoppen tot ALLE scenes een image hebben
  let imgRound = 1;
  while (true) {
    // Tel welke scenes nog missen op disk
    const allFiles = await fs.readdir(outputDir).catch(() => []);
    const missingScenes = scenes.filter((scene: any) => {
      const hasFile = allFiles.some((f: string) => f.startsWith(`scene${scene.id}-option1`));
      return !hasFile;
    });

    if (missingScenes.length === 0) {
      console.log(`[Images] 100% compleet! Alle ${scenes.length} scenes hebben een image.`);
      break;
    }

    imgRound++;
    if (imgRound > 20) {
      console.error(`[Images] Na 20 rondes nog ${missingScenes.length} scenes zonder image. Geforceerd stoppen.`);
      throw new Error(`${missingScenes.length} scenes hebben na 20 rondes nog geen image`);
    }

    const delay = Math.min(imgRound * 5, 30);
    console.log(`[Images] ${missingScenes.length}/${scenes.length} scenes missen nog een image. Retry ronde ${imgRound} (wacht ${delay}s)...`);
    await new Promise(r => setTimeout(r, delay * 1000));

    // Gebruik afwisselend prompt varianten per ronde
    const retryImgTasks: (() => Promise<void>)[] = missingScenes.map((scene: any) => async () => {
      const sceneId = scene.id;
      const variants = [
        scene.visual_prompt_variants?.[0] || scene.visual_prompt || scene.prompt,
        ...(scene.visual_prompt_variants || []).slice(1),
      ].filter(Boolean);
      const currentPrompt = variants[(imgRound - 1) % variants.length] || variants[0];

      if (!currentPrompt) return;

      try {
        let imageUrl: string;
        let provider: 'elevate' | 'genaipro';

        if (useElevate) {
          try {
            const task = await elevateCreateMedia(settings.elevateApiKey, 'image', currentPrompt, { aspectRatio: 'landscape' });
            const status = await elevatePollStatus(settings.elevateApiKey, task.id, 'image');
            imageUrl = status.resultUrl;
            provider = 'elevate';
          } catch (elevateErr: any) {
            if (!useGenAIPro) throw elevateErr;
            console.warn(`[Images] Scene ${sceneId} Elevate mislukt, fallback GenAIPro: ${elevateErr.message}`);
            const genResult = await genaiProCreateImage(settings.genaiProApiKey, currentPrompt, 'IMAGE_ASPECT_RATIO_LANDSCAPE');
            imageUrl = genResult.file_urls?.[0] || (genResult as any).fileUrls?.[0];
            provider = 'genaipro';
          }
        } else if (useGenAIPro) {
          const genResult = await genaiProCreateImage(settings.genaiProApiKey, currentPrompt, 'IMAGE_ASPECT_RATIO_LANDSCAPE');
          imageUrl = genResult.file_urls?.[0] || (genResult as any).fileUrls?.[0];
          provider = 'genaipro';
        } else {
          throw new Error('Geen provider');
        }

        if (!imageUrl) throw new Error('Geen image URL');

        const ext = imageUrl.includes('.png') ? '.png' : '.jpg';
        const localPath = path.join(outputDir, `scene${sceneId}-option1${ext}`);
        await downloadFile(imageUrl, localPath);

        results.push({ sceneId, provider, imageUrl, localPath, prompt: currentPrompt } as any);
        if (onProgress) onProgress(results.length, scenes.length, sceneId);
        console.log(`[Images] Scene ${sceneId} klaar via retry ronde ${imgRound} (${results.length}/${scenes.length}) via ${provider}`);
      } catch (err: any) {
        console.warn(`[Images] Scene ${sceneId} retry ronde ${imgRound} mislukt: ${err.message}`);
      }
    });

    await withConcurrencyLimit(retryImgTasks, MAX_IMG_CONCURRENT);
  }

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

  if (useElevate && useGenAIPro) {
    // Beide: Elevate 1 tegelijk + GenAIPro parallel, wie eerst klaar is wint
    elevateQueue.push(...scenes);
    genaiQueue.push(...scenes);
  } else if (useElevate) {
    elevateQueue.push(...scenes);
  } else if (useGenAIPro) {
    genaiQueue.push(...scenes);
  } else {
    throw new Error('Geen video provider beschikbaar');
  }

  // Varieer video prompt per retry ronde
  const varyVideoPrompt = (originalPrompt: string, round: number): string => {
    const variations = [
      '', // ronde 1: origineel
      'Smooth slow motion. ',
      'Subtle camera movement. ',
      'Gentle zoom in. ',
      'Slow cinematic pan. ',
    ];
    const prefix = variations[round % variations.length] || '';
    // Kort de prompt in als die te lang is (soms weigeren APIs lange prompts)
    const trimmed = originalPrompt.length > 400 ? originalPrompt.slice(0, 400) : originalPrompt;
    return prefix + trimmed;
  };

  // Track welke scenes al klaar zijn (voorkom dubbel werk)
  const completedScenes = new Set<number>();
  const inProgressScenes = new Set<number>();

  // GenAIPro: alle scenes parallel
  const MAX_VID_CONCURRENT = 10;
  const genaiTasks: (() => Promise<void>)[] = genaiQueue.map((scene) => async () => {
    const sceneId = scene.id;
    const prompt = scene.video_prompt || scene.visual_prompt || scene.prompt;
    const selection = imageSelections.find((s: any) =>
      s.scene_id === sceneId || String(s.scene_id) === String(sceneId)
    );

    // Check of video al bestaat
    const existingVideo = path.join(outputDir, `scene${sceneId}.mp4`);
    try {
      await fs.access(existingVideo);
      results.push({ sceneId, provider: 'cached', videoUrl: '', localPath: existingVideo, prompt, duration: scene.duration || 5 } as any);
      if (onProgress) onProgress(results.length, scenes.length, sceneId);
      console.log(`[Videos] Scene ${sceneId} al aanwezig, overgeslagen (${results.length}/${scenes.length})`);
      return;
    } catch {}

    // Skip als andere provider al klaar of bezig is
    if (completedScenes.has(sceneId) || inProgressScenes.has(sceneId)) {
      if (completedScenes.has(sceneId)) console.log(`[Videos] Scene ${sceneId} al klaar, overgeslagen`);
      return;
    }
    inProgressScenes.add(sceneId);

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
      completedScenes.add(sceneId);
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

      // Check of video al bestaat
      const existingVid = path.join(outputDir, `scene${sceneId}.mp4`);
      try {
        await fs.access(existingVid);
        results.push({ sceneId, provider: 'cached', videoUrl: '', localPath: existingVid, prompt, duration: scene.duration || 5 } as any);
        if (onProgress) onProgress(results.length, scenes.length, sceneId);
        console.log(`[Videos] Scene ${sceneId} al aanwezig, overgeslagen (${results.length}/${scenes.length})`);
        continue;
      } catch {}

      // Skip als andere provider al klaar of bezig is
      if (completedScenes.has(sceneId) || inProgressScenes.has(sceneId)) {
        if (completedScenes.has(sceneId)) console.log(`[Videos] Scene ${sceneId} al klaar, overgeslagen`);
        continue;
      }
      inProgressScenes.add(sceneId);

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
        completedScenes.add(sceneId);
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

  // Check welke scenes nog missen en retry
  const MAX_VIDEO_ROUNDS = 5;
  let round = 1;
  
  while (round < MAX_VIDEO_ROUNDS) {
    // Zoek scenes zonder video op disk
    const missingScenes: typeof scenes = [];
    for (const scene of scenes) {
      const vidPath = path.join(outputDir, `scene${scene.id}.mp4`);
      try {
        await fs.access(vidPath);
      } catch {
        // Check of scene een image heeft (nodig voor video)
        const selection = imageSelections.find((s: any) =>
          s.scene_id === scene.id || String(s.scene_id) === String(scene.id)
        );
        if (selection?.chosen_path) {
          missingScenes.push(scene);
        }
      }
    }

    if (missingScenes.length === 0) {
      console.log(`[Videos] Alle scenes met images hebben een video!`);
      break;
    }

    round++;
    const delay = round * 10;
    console.log(`[Videos] ${missingScenes.length} scenes missen nog een video, retry ronde ${round}/${MAX_VIDEO_ROUNDS} (wacht ${delay}s)...`);
    await new Promise(r => setTimeout(r, delay * 1000));

    // Reset inProgress voor missende scenes
    for (const scene of missingScenes) {
      inProgressScenes.delete(scene.id);
      completedScenes.delete(scene.id);
    }

    // Retry met GenAIPro parallel
    const retryTasks: (() => Promise<void>)[] = missingScenes.map((scene) => async () => {
      const sceneId = scene.id;
      const originalPrompt = scene.video_prompt || scene.visual_prompt || scene.prompt;
      const prompt = varyVideoPrompt(originalPrompt, round);
      const selection = imageSelections.find((s: any) =>
        s.scene_id === sceneId || String(s.scene_id) === String(sceneId)
      );

      if (!selection?.chosen_path) return;
      if (completedScenes.has(sceneId)) return;
      inProgressScenes.add(sceneId);

      try {
        let videoUrl: string | undefined;
        let provider: 'elevate' | 'genaipro' = 'genaipro';

        if (useGenAIPro) {
          const apiResult = await genaiProFrameToVideo(settings.genaiProApiKey, selection.chosen_path, prompt);
          videoUrl = Array.isArray(apiResult) ? apiResult[0]?.file_url : (apiResult.file_url || apiResult.fileUrl);
        } else if (useElevate) {
          const imgBuffer = await fs.readFile(selection.chosen_path);
          const ext = selection.chosen_path.endsWith('.png') ? 'png' : 'jpeg';
          const sourceImage = `data:image/${ext};base64,${imgBuffer.toString('base64')}`;
          const task = await elevateCreateMedia(settings.elevateApiKey, 'video', prompt, { aspectRatio: 'landscape', sourceImage });
          const status = await elevatePollStatus(settings.elevateApiKey, task.id, 'video', 600_000);
          videoUrl = status.resultUrl;
          provider = 'elevate';
        }

        if (!videoUrl) throw new Error('Geen video URL');

        const localPath = path.join(outputDir, `scene${sceneId}.mp4`);
        await downloadFile(videoUrl, localPath);

        results.push({ sceneId, provider, videoUrl, localPath, prompt, duration: scene.duration || 5 } as any);
        completedScenes.add(sceneId);
        if (onProgress) onProgress(results.length, scenes.length, sceneId);
        console.log(`[Videos] Scene ${sceneId} klaar via retry ronde ${round} (${results.length}/${scenes.length})`);
      } catch (err: any) {
        console.warn(`[Videos] Scene ${sceneId} retry ronde ${round} mislukt: ${err.message}`);
      }
    });

    await withConcurrencyLimit(retryTasks, MAX_VID_CONCURRENT);
  }

  // NOOIT stoppen tot ALLE scenes met een image ook een video hebben
  while (round <= 20) {
    // Tel welke scenes nog missen op disk
    const missingVids: typeof scenes = [];
    for (const scene of scenes) {
      try {
        await fs.access(path.join(outputDir, `scene${scene.id}.mp4`));
      } catch {
        const selection = imageSelections.find((s: any) =>
          s.scene_id === scene.id || String(s.scene_id) === String(scene.id)
        );
        if (selection?.chosen_path) {
          missingVids.push(scene);
        }
      }
    }

    if (missingVids.length === 0) {
      console.log(`[Videos] 100% compleet! Alle scenes met images hebben een video.`);
      break;
    }

    if (round > 20) {
      console.error(`[Videos] Na 20 rondes nog ${missingVids.length} scenes zonder video. Geforceerd stoppen.`);
      throw new Error(`${missingVids.length} scenes hebben na 20 rondes nog geen video`);
    }

    round++;
    const delay = Math.min(round * 5, 30);
    console.log(`[Videos] ${missingVids.length} scenes missen nog een video, retry ronde ${round} (wacht ${delay}s)...`);
    await new Promise(r => setTimeout(r, delay * 1000));

    for (const scene of missingVids) {
      inProgressScenes.delete(scene.id);
      completedScenes.delete(scene.id);
    }

    const retryVidTasks: (() => Promise<void>)[] = missingVids.map((scene) => async () => {
      const sceneId = scene.id;
      const originalPrompt = scene.video_prompt || scene.visual_prompt || scene.prompt;
      const prompt = varyVideoPrompt(originalPrompt, round);
      const selection = imageSelections.find((s: any) =>
        s.scene_id === sceneId || String(s.scene_id) === String(sceneId)
      );

      if (!selection?.chosen_path) return;
      if (completedScenes.has(sceneId)) return;
      inProgressScenes.add(sceneId);

      try {
        let videoUrl: string | undefined;
        let provider: 'elevate' | 'genaipro' = 'genaipro';

        if (useGenAIPro) {
          try {
            const apiResult = await genaiProFrameToVideo(settings.genaiProApiKey, selection.chosen_path, prompt);
            videoUrl = Array.isArray(apiResult) ? apiResult[0]?.file_url : (apiResult.file_url || apiResult.fileUrl);
            provider = 'genaipro';
          } catch (genErr: any) {
            if (!useElevate) throw genErr;
            console.warn(`[Videos] Scene ${sceneId} GenAIPro mislukt, fallback Elevate: ${genErr.message}`);
            const imgBuffer = await fs.readFile(selection.chosen_path);
            const ext = selection.chosen_path.endsWith('.png') ? 'png' : 'jpeg';
            const sourceImage = `data:image/${ext};base64,${imgBuffer.toString('base64')}`;
            const task = await elevateCreateMedia(settings.elevateApiKey, 'video', prompt, { aspectRatio: 'landscape', sourceImage });
            const status = await elevatePollStatus(settings.elevateApiKey, task.id, 'video', 600_000);
            videoUrl = status.resultUrl;
            provider = 'elevate';
          }
        } else if (useElevate) {
          const imgBuffer = await fs.readFile(selection.chosen_path);
          const ext = selection.chosen_path.endsWith('.png') ? 'png' : 'jpeg';
          const sourceImage = `data:image/${ext};base64,${imgBuffer.toString('base64')}`;
          const task = await elevateCreateMedia(settings.elevateApiKey, 'video', prompt, { aspectRatio: 'landscape', sourceImage });
          const status = await elevatePollStatus(settings.elevateApiKey, task.id, 'video', 600_000);
          videoUrl = status.resultUrl;
          provider = 'elevate';
        }

        if (!videoUrl) throw new Error('Geen video URL');

        const localPath = path.join(outputDir, `scene${sceneId}.mp4`);
        await downloadFile(videoUrl, localPath);

        results.push({ sceneId, provider, videoUrl, localPath, prompt, duration: scene.duration || 5 } as any);
        completedScenes.add(sceneId);
        if (onProgress) onProgress(results.length, scenes.length, sceneId);
        console.log(`[Videos] Scene ${sceneId} klaar via retry ronde ${round} (${results.length}/${scenes.length}) via ${provider}`);
      } catch (err: any) {
        console.warn(`[Videos] Scene ${sceneId} retry ronde ${round} mislukt: ${err.message}`);
      }
    });

    await withConcurrencyLimit(retryVidTasks, MAX_VID_CONCURRENT);
  }

  // Tel definitieve resultaten
  let finalCount = 0;
  for (const scene of scenes) {
    try {
      await fs.access(path.join(outputDir, `scene${scene.id}.mp4`));
      finalCount++;
    } catch {}
  }

  console.log(`[Videos] Klaar! ${finalCount}/${scenes.length} videos op disk`);
  return results;
}
