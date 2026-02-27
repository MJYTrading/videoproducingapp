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
  return data.data;
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
    const task = data.data;

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
  const formData = new URLSearchParams({
    prompt,
    aspect_ratio: aspectRatio,
    number_of_images: String(count),
  });

  const resp = await fetch(`${GENAIPRO_BASE}/veo/create-image`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
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
  const resp = await fetch(`${GENAIPRO_BASE}/veo/text-to-video`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      aspect_ratio: aspectRatio,
      number_of_videos: count,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`GenAIPro video failed (${resp.status}): ${err.slice(0, 200)}`);
  }

  return await readSSEResponse(resp);
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

  return await readSSEResponse(resp);
}

// ── SSE Stream Reader ──

async function readSSEResponse(resp: Response): Promise<any> {
  const text = await resp.text();

  const lines = text.split('\n');
  let lastData: any = null;

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        lastData = JSON.parse(line.slice(6));
      } catch {}
    }
  }

  if (!lastData) {
    try {
      lastData = JSON.parse(text);
    } catch {
      throw new Error('Kon GenAIPro response niet parsen: ' + text.slice(0, 200));
    }
  }

  return lastData;
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

  console.log(`[Images] ${scenes.length} scenes, provider: ${useGenAIPro ? 'GenAIPro (parallel)' : 'Elevate (sequential)'}`);

  const promises = scenes.map(async (scene) => {
    const sceneId = scene.id;
    const prompt = scene.visual_prompt_variants?.[0] || scene.visual_prompt || scene.prompt;

    if (!prompt) {
      console.warn(`[Images] Scene ${sceneId}: geen prompt, overgeslagen`);
      return null;
    }

    try {
      let imageUrl: string;
      let provider: 'elevate' | 'genaipro';

      if (useGenAIPro) {
        const result = await genaiProCreateImage(settings.genaiProApiKey, prompt, 'IMAGE_ASPECT_RATIO_LANDSCAPE');
        imageUrl = result.fileUrls?.[0] || (result as any).file_urls?.[0];
        provider = 'genaipro';
      } else if (useElevate) {
        const task = await elevateCreateMedia(settings.elevateApiKey, 'image', prompt, { aspectRatio: 'landscape' });
        const status = await elevatePollStatus(settings.elevateApiKey, task.id, 'image');
        imageUrl = status.resultUrl;
        provider = 'elevate';
      } else {
        throw new Error('Geen image provider beschikbaar');
      }

      const ext = imageUrl.includes('.png') ? '.png' : '.jpg';
      const localPath = path.join(outputDir, `scene${sceneId}-option1${ext}`);
      await downloadFile(imageUrl, localPath);

      const result: ImageResult = { sceneId, provider, imageUrl, localPath, prompt };
      results.push(result);

      if (onProgress) onProgress(results.length, scenes.length, sceneId);
      console.log(`[Images] Scene ${sceneId} klaar (${results.length}/${scenes.length}) via ${provider}`);

      return result;
    } catch (err: any) {
      console.error(`[Images] Scene ${sceneId} mislukt: ${err.message}`);
      return null;
    }
  });

  await Promise.all(promises);
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

  if (useGenAIPro && useElevate) {
    elevateQueue.push(scenes[0]);
    genaiQueue.push(...scenes.slice(1));
  } else if (useGenAIPro) {
    genaiQueue.push(...scenes);
  } else if (useElevate) {
    elevateQueue.push(...scenes);
  } else {
    throw new Error('Geen video provider beschikbaar');
  }

  // GenAIPro: alle scenes parallel
  const genaiPromises = genaiQueue.map(async (scene) => {
    const sceneId = scene.id;
    const prompt = scene.video_prompt || scene.visual_prompt || scene.prompt;
    const selection = imageSelections.find((s: any) =>
      s.scene_id === sceneId || String(s.scene_id) === String(sceneId)
    );

    try {
      let videoUrl: string;

      if (selection?.chosen_path) {
        const result = await genaiProFrameToVideo(settings.genaiProApiKey, selection.chosen_path, prompt);
        videoUrl = result.fileUrl || (result as any).file_url;
      } else {
        const result = await genaiProTextToVideo(settings.genaiProApiKey, prompt);
        videoUrl = result.fileUrl || (result as any).file_url;
      }

      const localPath = path.join(outputDir, `scene${sceneId}.mp4`);
      await downloadFile(videoUrl, localPath);

      const result: VideoResult = {
        sceneId, provider: 'genaipro', videoUrl, localPath, prompt,
        duration: scene.duration || 5,
      };
      results.push(result);

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
        let sourceImage: string | undefined;

        if (selection?.chosen_path) {
          const imgBuffer = await fs.readFile(selection.chosen_path);
          const ext = selection.chosen_path.endsWith('.png') ? 'png' : 'jpeg';
          sourceImage = `data:image/${ext};base64,${imgBuffer.toString('base64')}`;
        }

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

  await Promise.all([...genaiPromises, elevatePromise]);

  console.log(`[Videos] Klaar! ${results.length}/${scenes.length} scenes succesvol`);
  return results;
}
