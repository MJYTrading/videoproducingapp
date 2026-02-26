/**
 * Pipeline Service — logica voor elke pipeline stap
 */

import fs from 'fs/promises';
import path from 'path';
import { fetchTranscriptsBatch } from './youtube.js';
import { llmJsonPrompt, llmSimplePrompt } from './llm.js';

const WORKSPACE_BASE = '/root/.openclaw/workspace/projects';

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath: string, data: any) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

async function writeText(filePath: string, text: string) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, text, 'utf-8');
}

async function readText(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8');
}

async function readJson<T = any>(filePath: string): Promise<T> {
  const text = await readText(filePath);
  return JSON.parse(text);
}

function projectDir(projectName: string) {
  return path.join(WORKSPACE_BASE, projectName);
}

// ── Stap 0: Config Validatie ──

export async function executeStep0(project: any) {
  const errors: string[] = [];
  const projPath = projectDir(project.name);

  if (!project.name) errors.push('Project naam ontbreekt');
  if (project.name && /\s/.test(project.name)) errors.push('Project naam mag geen spaties bevatten');
  if (!project.title) errors.push('Titel ontbreekt');
  if (!project.voice) errors.push('Voice selectie ontbreekt');
  if (!project.visualStyle) errors.push('Visuele stijl ontbreekt');

  if (project.scriptSource === 'new') {
    const refs = project.referenceVideos || [];
    if (refs.length === 0 || refs.every((r: string) => !r?.trim())) {
      errors.push('Minimaal 1 referentie video URL nodig (3 aanbevolen)');
    }
    if (!project.scriptLength) errors.push('Scriptlengte ontbreekt');
  } else if (project.scriptSource === 'existing') {
    if (!project.scriptUrl) errors.push('Script URL ontbreekt');
  }

  if (errors.length > 0) {
    return { valid: false, errors, projectPath: projPath };
  }

  const dirs = [
    'script', 'audio', 'assets/scenes', 'assets/images',
    'assets/clips', 'assets/sfx', 'edit/trimmed', 'edit/draft', 'output'
  ];
  for (const dir of dirs) {
    await ensureDir(path.join(projPath, dir));
  }

  const config = {
    project: { name: project.name, title: project.title, description: project.description, language: project.language },
    script: {
      source: project.scriptSource,
      reference_urls: project.referenceVideos || [],
      target_title: project.title,
      target_topic: project.description || project.title,
      word_count: project.scriptLength || 5000,
    },
    voice: { name: project.voice, voice_id: '', model: 'eleven_flash_v2_5' },
    visual: { style_id: project.visualStyle, genre: '', mood: '' },
    clips: { enabled: project.useClips, urls: project.referenceClips || [] },
    assets: { stock_images: project.stockImages, color_grade: project.colorGrading },
    output: { format: project.output, subtitles: project.subtitles, background_music: project.backgroundMusic },
  };
  await writeJson(path.join(projPath, 'config.json'), config);

  return { valid: true, errors: [], projectPath: projPath };
}

// ── Stap 1: Transcripts ophalen ──

export async function executeStep1(project: any, youtubeApiKey: string) {
  const refs: string[] = (project.referenceVideos || []).filter((r: string) => r?.trim());

  if (refs.length === 0) {
    throw new Error('Geen referentie video URLs gevonden. Voeg minimaal 1 (liefst 3) toe.');
  }

  const batchResult = await fetchTranscriptsBatch(youtubeApiKey, refs);

  if (batchResult.failures.length > 0 && batchResult.results.length === 0) {
    const failDetails = batchResult.failures.map(f => `${f.videoId}: ${f.error}`).join('\n');
    throw new Error(`Alle transcripts mislukt:\n${failDetails}`);
  }

  const projPath = projectDir(project.name);
  const transcripts = [];

  for (let i = 0; i < batchResult.results.length; i++) {
    const result = batchResult.results[i];
    const filePath = path.join(projPath, 'script', `ref-transcript-${i + 1}.txt`);
    await writeText(filePath, result.text);
    transcripts.push({
      index: i + 1,
      videoId: result.videoId,
      videoTitle: result.videoTitle,
      language: result.language,
      wordCount: result.text.split(/\s+/).length,
      filePath,
    });
  }

  return { transcripts, failures: batchResult.failures };
}

// ── Stap 2: Style Profile maken ──

const STYLE_PROFILE_SYSTEM = `Je bent een expert schrijfstijl-analist. Je analyseert YouTube video transcripts en documenteert de schrijfstijl in een gestructureerd JSON profiel.

REGELS:
- Analyseer de stijl, structuur, toon, en retorische middelen
- Tel het WERKELIJKE aantal secties/delen in de transcripts
- Er is GEEN hardcoded default — het profiel is 100% gebaseerd op de analyse
- Gebruik GEEN specifieke namen, events, of data uit de transcripts — het profiel moet generiek zijn
- Bepaal genre en mood op basis van de content

VERPLICHT JSON FORMAT (geef ALLEEN de JSON terug, geen extra tekst):
{
  "tone_of_voice": "...",
  "narrative_structure": "...",
  "characters": "no_specific_characters_use_generic_roles",
  "dialogue": "minimal/moderate/extensive",
  "humor": "...",
  "pacing": "...",
  "hook_style": "...",
  "sentence_style": "...",
  "visual_cue_prompts": {
    "transitions": "...",
    "visual_metaphors": "...",
    "on_screen_text": "...",
    "cut_timing": "..."
  },
  "common_devices": {
    "repetition": "...",
    "analogies": "...",
    "metaphors": "...",
    "irony": "...",
    "open_loops": "...",
    "suspense": "..."
  },
  "emotional_tone": "...",
  "point_of_view": "...",
  "language_style": "...",
  "audience_addressing_style": "...",
  "general_style_tags": ["tag1", "tag2", "tag3"],
  "genre": "...",
  "mood": "...",
  "script_formatting_rules": {
    "sections": <GETAL UIT ANALYSE>,
    "avg_words_per_section": <GETAL UIT ANALYSE>,
    "no_headings": true,
    "no_line_breaks": true,
    "no_underscores": true,
    "no_comments": true,
    "no_intro_or_closing_statements": true,
    "output": "one_batch_only"
  }
}`;

export async function executeStep2(project: any, llmKeys: { elevateApiKey?: string; anthropicApiKey?: string }) {
  const projPath = projectDir(project.name);

  const transcriptTexts: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const filePath = path.join(projPath, 'script', `ref-transcript-${i}.txt`);
    try {
      const text = await readText(filePath);
      if (text.trim()) transcriptTexts.push(text);
    } catch {}
  }

  if (transcriptTexts.length === 0) {
    throw new Error('Geen transcripts gevonden. Voer eerst stap 1 uit.');
  }

  const userPrompt = `Analyseer deze ${transcriptTexts.length} referentie transcripts en maak een style profile JSON:

${transcriptTexts.map((t, i) => `=== TRANSCRIPT ${i + 1} ===\n${t.slice(0, 10000)}\n`).join('\n')}

Let op:
- Tel het werkelijke aantal secties in elk transcript
- Neem het gemiddelde als basis
- Bepaal genre en mood
- Geef ALLEEN de JSON terug, geen extra tekst`;

  const styleProfile = await llmJsonPrompt(
    llmKeys, STYLE_PROFILE_SYSTEM, userPrompt,
    { maxTokens: 4096, temperature: 0.5 }
  );

  await writeJson(path.join(projPath, 'script', 'style-profile.json'), styleProfile);

  try {
    const configPath = path.join(projPath, 'config.json');
    const config = await readJson(configPath);
    config.visual = config.visual || {};
    config.visual.genre = styleProfile.genre || '';
    config.visual.mood = styleProfile.mood || '';
    await writeJson(configPath, config);
  } catch {}

  return styleProfile;
}

// ── Stap 3: Script schrijven ──

const SCRIPT_SYSTEM = `Je bent een top-tier YouTube scriptwriter. Je schrijft meeslepende, high-retention scripts op basis van een style profile en een onderwerp.

REGELS:
- Volg het style profile 100% — toon, structuur, pacing, devices
- Het script heeft PRECIES het aantal secties uit het style profile
- De hook is 50-75 woorden, direct pakkend
- De outro is max 30 woorden met een subscribe CTA
- GEEN headings, GEEN line breaks (behalve bij [CLIP] markers), GEEN underscores
- Schrijf in de taal die gevraagd wordt
- Houd het ritme strak — korte gesproken zinnen
- Vermijd opvulling en herhaling
- Als er [CLIP] markers nodig zijn, gebruik formaat: [CLIP: URL HH:MM:SS - HH:MM:SS]

OUTPUT: Geef ALLEEN het script terug. Geen inleiding, geen uitleg, alleen het script.`;

export async function executeStep3(project: any, llmKeys: { elevateApiKey?: string; anthropicApiKey?: string }) {
  const projPath = projectDir(project.name);

  let styleProfile: any;
  try {
    styleProfile = await readJson(path.join(projPath, 'script', 'style-profile.json'));
  } catch {
    throw new Error('Style profile niet gevonden. Voer eerst stap 2 uit.');
  }

  const wordCount = project.scriptLength || 5000;
  const sections = styleProfile.script_formatting_rules?.sections || 8;
  const wordsPerSection = Math.round(wordCount / sections);

  let clipInfo = '';
  const clips = project.referenceClips || [];
  const montageClips = project.montageClips || [];
  if (project.useClips && (clips.length > 0 || montageClips.length > 0)) {
    clipInfo = `\n\nCLIP INTEGRATIE:
Er moeten [CLIP] markers in het script op plekken waar echte footage het verhaal versterkt.
Beschikbare clips: ${JSON.stringify([...clips, ...montageClips.map((c: any) => `${c.url} ${c.startTime} - ${c.endTime}`)])}
Formaat: [CLIP: URL HH:MM:SS - HH:MM:SS]
Regels: maximaal 1 clip per 2-3 minuten, tekst voor en na moet vloeiend aansluiten.`;
  }

  const userPrompt = `Schrijf een YouTube script met de volgende specificaties:

STYLE PROFILE:
${JSON.stringify(styleProfile, null, 2)}

ONDERWERP: ${project.title}
${project.description ? `BESCHRIJVING: ${project.description}` : ''}
TAAL: ${project.language === 'NL' ? 'Nederlands' : 'Engels'}
TOTAAL WOORDENAANTAL: EXACT ${wordCount} woorden (ABSOLUUT MINIMUM: ${Math.floor(wordCount * 0.9)} woorden, ABSOLUUT MAXIMUM: ${Math.ceil(wordCount * 1.1)} woorden)
BELANGRIJK: Tel je woorden. Het script MOET minstens ${Math.floor(wordCount * 0.9)} woorden bevatten. Schrijf gedetailleerd en uitgebreid.
AANTAL SECTIES: ${sections} (uit style profile)
WOORDEN PER SECTIE: ~${wordsPerSection}
${clipInfo}

Schrijf het volledige script. ALLEEN het script, geen extra uitleg.`;

  const targetWordCount = wordCount;
  const minWords = Math.floor(targetWordCount * 0.90);
  const maxWords = Math.ceil(targetWordCount * 1.10);
  const MAX_SCRIPT_ATTEMPTS = 5;

  let script = '';
  let actualWordCount = 0;

  for (let attempt = 1; attempt <= MAX_SCRIPT_ATTEMPTS; attempt++) {
    const attemptPrompt = attempt === 1 ? userPrompt
      : userPrompt + `\n\nBELANGRIJK: De vorige versie had ${actualWordCount} woorden. Het MOET tussen ${minWords} en ${maxWords} woorden zijn (target: ${targetWordCount}). ${actualWordCount < minWords ? 'Schrijf LANGER en meer detail.' : 'Schrijf KORTER en bondiger.'}`;

    script = await llmSimplePrompt(
      llmKeys, SCRIPT_SYSTEM, attemptPrompt,
      { maxTokens: 16384, temperature: 0.8 }
    );

    actualWordCount = script.split(/\s+/).length;

    if (actualWordCount >= minWords && actualWordCount <= maxWords) {
      break;
    }

    if (attempt < MAX_SCRIPT_ATTEMPTS) {
      console.log(`[Script] Poging ${attempt}: ${actualWordCount} woorden (target ${minWords}-${maxWords}). Opnieuw...`);
    } else {
      console.log(`[Script] Poging ${attempt}: ${actualWordCount} woorden. Accepteren na ${MAX_SCRIPT_ATTEMPTS} pogingen.`);
      if (actualWordCount < minWords) {
        throw new Error(`Script te kort: ${actualWordCount} woorden (minimum: ${minWords}). Na ${MAX_SCRIPT_ATTEMPTS} pogingen niet binnen range.`);
      }
    }
  }

  const scriptVoiceover = script.replace(/\[CLIP:.*?\]\n?/g, '').replace(/\n{3,}/g, '\n\n').trim();

  const scriptPath = path.join(projPath, 'script', 'script.txt');
  await writeText(scriptPath, script);
  await writeText(path.join(projPath, 'script', 'script-voiceover.txt'), scriptVoiceover);

  return {
    script,
    scriptVoiceover,
    wordCount: actualWordCount,
    targetWordCount,
    withinRange: actualWordCount >= minWords && actualWordCount <= maxWords,
    sections,
    filePath: scriptPath,
  };
}

// ── Stap 6: Scene Prompts genereren ──

const STYLES_PATH = '/root/.openclaw/workspace/video-producer/presets/styles.json';

async function loadStylePreset(styleId: string) {
  let styles: any[] = [];
  try {
    styles = await readJson(STYLES_PATH);
  } catch {
    return {
      style_prefix: 'A photorealistic 3D render of featureless white mannequin figures with no facial features, smooth plastic-like skin, in a cinematic scene with dramatic Octane-style lighting.',
      style_suffix: 'Unreal Engine 5, Octane Render, volumetric lighting, cinematic composition, 8K detail, hyper-realistic materials, depth of field',
      character_description: 'Featureless white mannequin with smooth plastic skin, no facial features, humanoid proportions.',
    };
  }
  return styles.find((s: any) => s.id === styleId) || styles[0] || { style_prefix: '', style_suffix: '', character_description: '' };
}

const PROMPTS_SYSTEM = `Je bent een visuele regisseur die scene-voor-scene prompts maakt voor AI video generatie.

JE TAAK:
- Segmenteer het transcript in scenes van 3-5 seconden
- Maak voor elke scene een gedetailleerde visuele prompt
- Gebruik de opgegeven stijl prefix en suffix in elke prompt
- Scenes langer dan 8 seconden moeten gesplitst worden
- Markeer scenes die echte afbeeldingen nodig hebben met asset_type: "real_image"
- Markeer [CLIP] scenes met type: "clip"
- Voor elke ai_video scene: maak 3 VERSCHILLENDE visuele prompt varianten
  - Variant 1: Close-up / intiem perspectief
  - Variant 2: Wide shot / episch overzicht
  - Variant 3: Creatief / onverwacht perspectief (overhead, laag, door object heen, etc.)
  - Elke variant moet de stijl prefix en suffix bevatten
  - De varianten moeten ECHT ANDERS zijn qua compositie en camerahoek, niet alleen kleine kleurverschillen

OUTPUT FORMAT (JSON, ALLEEN de JSON):
{
  "scenes": [
    {
      "id": 1,
      "start": 0.0,
      "end": 4.2,
      "duration": 4.2,
      "text": "De gesproken tekst voor deze scene",
      "type": "ai_video",
      "asset_type": "ai_video",
      "visual_prompt": "Hoofdprompt (variant 1) met style prefix en suffix",
      "visual_prompt_variants": [
        "Variant 1: close-up/intiem perspectief met style prefix en suffix",
        "Variant 2: wide shot/episch perspectief met style prefix en suffix",
        "Variant 3: creatief/onverwacht perspectief met style prefix en suffix"
      ],
      "video_prompt": "Beschrijving van beweging/actie voor image-to-video generatie (wat moet er BEWEGEN vanuit het stilstaande beeld)",
      "camera_movement": "beschrijving van camera beweging",
      "mood": "sfeer van de scene"
    }
  ]
}

BELANGRIJK voor visual_prompt_variants:
- Alleen voor ai_video scenes (NIET voor clip of real_image)
- Elke variant is een VOLLEDIGE prompt (inclusief stijl prefix/suffix)
- visual_prompt bevat altijd variant 1 (voor backwards compatibility)
- De 3 varianten tonen dezelfde scene-inhoud maar vanuit TOTAAL ANDER perspectief

BELANGRIJK voor video_prompt:
- Dit is een APARTE prompt specifiek voor image-to-video generatie
- Beschrijft welke BEWEGING en ACTIE er moet gebeuren vanuit het stilstaande beeld
- Focus op: camera beweging (pan, zoom, dolly), karakter actie (lopen, gebaren), omgevingseffecten (wind, regen, licht)
- Voorbeeld: "Slow camera push-in while the mannequin turns its head to the left, rain begins falling, streetlights flicker"
- Moet kort en actiegericht zijn (1-2 zinnen)
- Alleen voor ai_video scenes`;

export async function executeStep6(project: any, llmKeys: { elevateApiKey?: string; anthropicApiKey?: string }) {
  const projPath = projectDir(project.name);

  let scriptText: string;
  try {
    scriptText = await readText(path.join(projPath, 'script', 'script.txt'));
  } catch {
    throw new Error('Script niet gevonden. Voer eerst stap 3 uit.');
  }

  const stylePreset = await loadStylePreset(project.visualStyle || '3d-render');

  let genre = '', mood = '';
  try {
    const config = await readJson(path.join(projPath, 'config.json'));
    genre = config.visual?.genre || '';
    mood = config.visual?.mood || '';
  } catch {}
  if (!genre) {
    try {
      const profile = await readJson(path.join(projPath, 'script', 'style-profile.json'));
      genre = profile.genre || '';
      mood = profile.mood || '';
    } catch {}
  }

  // Split script in secties (~300 woorden per batch)
  const rawSections = scriptText.split(/\n\n+/);
  const sections: string[] = [];
  let currentChunk = '';
  for (const section of rawSections) {
    if (currentChunk && (currentChunk + ' ' + section).split(/\s+/).length > 350) {
      sections.push(currentChunk.trim());
      currentChunk = section;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + section;
    }
  }
  if (currentChunk.trim()) sections.push(currentChunk.trim());

  console.log(`[Step 6] Script gesplitst in ${sections.length} batches`);

  // Bouw prompts voor alle batches
  const styleBlock = [
    `- Prefix (begin van elke prompt): ${stylePreset.style_prefix}`,
    `- Suffix (eind van elke prompt): ${stylePreset.style_suffix}`,
    `- Character beschrijving: ${stylePreset.character_description}`,
    genre ? `- Genre: ${genre}` : '',
    mood ? `- Mood: ${mood}` : '',
  ].filter(Boolean).join('\n');

  const batchPromises = sections.map((section, i) => {
    const batchPrompt = [
      `Maak visuele scene prompts voor deel ${i + 1} van ${sections.length} van een video script.`,
      '',
      'STIJL:',
      styleBlock,
      '',
      `SCRIPT DEEL ${i + 1}:`,
      section,
      '',
      'REGELS:',
      '- Maak scenes van 3-5 seconden elk',
      '- Splits scenes langer dan 8 seconden',
      '- [CLIP] markers worden type: "clip"',
      '- Elke scene heeft: id, start, end, duration, text, type, asset_type, visual_prompt, video_prompt, camera_movement, mood',
      '- Geef ALLEEN een JSON object terug met een "scenes" array',
      '- Voor ai_video scenes: voeg visual_prompt_variants toe (array van 3 VERSCHILLENDE prompts)',
      '- visual_prompt = variant 1, visual_prompt_variants = [variant1, variant2, variant3]',
      '- Varianten moeten ECHT ANDERS zijn: close-up vs wide shot vs creatief perspectief',
      '- Clip en real_image scenes hebben GEEN visual_prompt_variants nodig',
      '- Voor ai_video scenes: voeg video_prompt toe (korte beschrijving van beweging/actie voor image-to-video)',
    ].join('\n');

    return llmJsonPrompt<{ scenes: any[] }>(
      llmKeys, PROMPTS_SYSTEM, batchPrompt,
      { maxTokens: 12000, temperature: 0.7 }
    ).then(result => {
      console.log(`[Step 6] Batch ${i + 1}: ${(result.scenes || []).length} scenes`);
      return { index: i, scenes: result.scenes || [] };
    }).catch(error => {
      console.error(`[Step 6] Batch ${i + 1} gefaald: ${error.message}`);
      return { index: i, scenes: [] };
    });
  });

  // Voer ALLE batches parallel uit
  console.log(`[Step 6] ${sections.length} batches parallel starten...`);
  const batchResults = await Promise.all(batchPromises);

  // Sorteer op originele volgorde en combineer
  batchResults.sort((a, b) => a.index - b.index);
  const allScenes: any[] = [];
  let sceneId = 1;
  let timeOffset = 0;

  for (const batch of batchResults) {
    for (const scene of batch.scenes) {
      scene.id = sceneId++;
      if (scene.start !== undefined) {
        const originalDuration = (scene.end || 0) - (scene.start || 0);
        scene.start = timeOffset;
        scene.end = timeOffset + (originalDuration || scene.duration || 4);
      }
      timeOffset = scene.end || (timeOffset + (scene.duration || 4));
      allScenes.push(scene);
    }
  }

  if (allScenes.length === 0) {
    throw new Error('Geen scenes gegenereerd uit alle batches');
  }

  const aiVideoScenes = allScenes.filter((s: any) => s.type === 'ai_video' || s.asset_type === 'ai_video').length;
  const clipScenes = allScenes.filter((s: any) => s.type === 'clip').length;
  const realImageScenes = allScenes.filter((s: any) => s.asset_type === 'real_image').length;
  const totalDuration = allScenes.reduce((sum: number, s: any) => sum + (s.duration || 0), 0);
  const avgDuration = allScenes.length > 0 ? totalDuration / allScenes.length : 0;

  const outputPath = path.join(projPath, 'assets', 'scene-prompts.json');
  await writeJson(outputPath, {
    project: project.name, style: project.visualStyle, genre, mood,
    total_scenes: allScenes.length, ai_video_scenes: aiVideoScenes,
    clip_scenes: clipScenes, real_image_scenes: realImageScenes,
    avg_scene_duration: Math.round(avgDuration * 10) / 10, scenes: allScenes,
  });

  console.log(`[Step 6] Klaar! ${allScenes.length} scenes totaal`);

  return {
    totalScenes: allScenes.length, aiVideoScenes, clipScenes, realImageScenes,
    avgDuration: Math.round(avgDuration * 10) / 10, filePath: outputPath,
    typeCounts: { ai_video: aiVideoScenes, clip: clipScenes, real_image: realImageScenes },
    preview: allScenes.slice(0, 3),
  };
}


// ── Stap 6b: Scene images genereren (via N8N) ──

export async function executeStep6b(project: any, settings: any) {
  const projPath = projectDir(project.name);
  const scenePromptsPath = path.join(projPath, 'assets', 'scene-prompts.json');
  const imageOptionsDir = path.join(projPath, 'assets', 'image-options') + '/';
  const selectionsPath = path.join(projPath, 'assets', 'image-selections.json');

  let scenePrompts: any;
  try {
    scenePrompts = await readJson(scenePromptsPath);
  } catch {
    throw new Error('scene-prompts.json niet gevonden. Voer eerst stap 6 uit.');
  }

  // Filter alleen ai_video scenes die visual_prompt_variants hebben
  const aiScenes = (scenePrompts.scenes || []).filter(
    (s: any) => (s.asset_type === 'ai_video' || s.type === 'ai_video') && s.visual_prompt_variants && s.visual_prompt_variants.length >= 3
  );

  if (aiScenes.length === 0) {
    console.log('[Step 6b] Geen ai_video scenes met prompt varianten gevonden');
    return { skipped: true, reason: 'Geen scenes met visual_prompt_variants in scene-prompts.json' };
  }

  const isAutoMode = project.imageSelectionMode !== 'manual';
  if (isAutoMode) {
    console.log('[Step 6b] Auto mode: 1 image per scene genereren, automatisch selecteren');
  }

  const n8nUrl = (settings.n8nBaseUrl || 'https://n8n.srv1275252.hstgr.cloud') + '/webhook/image-options-generator';
  const aspectRatio = project.output === 'youtube_short' ? 'portrait' : 'landscape';

  console.log('[Step 6b] ' + aiScenes.length + ' scenes, 3 images per scene genereren via ' + n8nUrl);

  const allOptions: any[] = [];
  let completed = 0;
  let failed = 0;

  // ── Stap 1: Alle webhooks tegelijk versturen ──
  const sceneJobs: { sceneId: number; scene: any; statusPath: string; webhookOk: boolean }[] = [];

  await Promise.all(aiScenes.map(async (scene: any, i: number) => {
    const sceneId = scene.id;
    const statusPath = path.join(projPath, 'assets', 'image-options', 'scene' + sceneId + '-status.json');

    const prompts = isAutoMode
      ? [scene.visual_prompt_variants[0] || scene.visual_prompt]
      : scene.visual_prompt_variants.slice(0, 3);

    const payload = {
      project: project.name,
      scene_id: sceneId,
      visual_prompts: prompts,
      aspect_ratio: aspectRatio,
      output_dir: imageOptionsDir,
      elevate_api_key: settings.elevateApiKey,
      status_path: statusPath,
    };

    try {
      try { await fs.unlink(statusPath); } catch {}

      const response = await fetch(n8nUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error('Webhook mislukt (' + response.status + '): ' + body);
      }

      console.log('[Step 6b] Scene ' + sceneId + ' (' + (i + 1) + '/' + aiScenes.length + ') webhook verstuurd');
      sceneJobs.push({ sceneId, scene, statusPath, webhookOk: true });
    } catch (err: any) {
      console.error('[Step 6b] Scene ' + sceneId + ' webhook error: ' + err.message);
      sceneJobs.push({ sceneId, scene, statusPath, webhookOk: false });
      failed++;
      allOptions.push({
        scene_id: sceneId,
        text: scene.text || '',
        visual_prompt: scene.visual_prompt,
        options: [],
        error: err.message,
      });
    }
  }));

  const activeJobs = sceneJobs.filter(j => j.webhookOk);
  console.log('[Step 6b] ' + activeJobs.length + '/' + aiScenes.length + ' webhooks verstuurd, parallel pollen...');

  // ── Stap 2: Alle status files parallel pollen ──
  await Promise.all(activeJobs.map(async (job) => {
    try {
      const status = await pollForStatus(job.statusPath, 5000, 180000);

      if (status.status === 'completed') {
        completed++;
        allOptions.push({
          scene_id: job.sceneId,
          text: job.scene.text || '',
          visual_prompt: job.scene.visual_prompt,
          options: status.options || [],
        });
        console.log('[Step 6b] Scene ' + job.sceneId + ' klaar! (' + completed + '/' + aiScenes.length + ')');
      } else {
        failed++;
        allOptions.push({
          scene_id: job.sceneId,
          text: job.scene.text || '',
          visual_prompt: job.scene.visual_prompt,
          options: [],
          error: status.error || 'Unknown',
        });
        console.warn('[Step 6b] Scene ' + job.sceneId + ' mislukt: ' + (status.error || 'Unknown'));
      }
    } catch (err: any) {
      failed++;
      allOptions.push({
        scene_id: job.sceneId,
        text: job.scene.text || '',
        visual_prompt: job.scene.visual_prompt,
        options: [],
        error: err.message,
      });
      console.error('[Step 6b] Scene ' + job.sceneId + ' poll error: ' + err.message);
    }
  }));

  // Schrijf alle opties naar image-options.json
  const imageOptionsPath = path.join(projPath, 'assets', 'image-options.json');
  await writeJson(imageOptionsPath, {
    project: project.name,
    total_scenes: aiScenes.length,
    completed,
    failed,
    generated_at: new Date().toISOString(),
    scenes: allOptions,
  });

  console.log('[Step 6b] Klaar! ' + completed + ' scenes gelukt, ' + failed + ' mislukt');

  // Auto mode: schrijf automatisch image-selections.json (altijd optie 1)
  if (isAutoMode) {
    const autoSelections = allOptions
      .filter((s: any) => s.options && s.options.length > 0)
      .map((s: any) => ({
        scene_id: s.scene_id,
        chosen_option: 1,
        chosen_path: s.options[0]?.path || '',
      }));

    const selectionsPath = path.join(projPath, 'assets', 'image-selections.json');
    await writeJson(selectionsPath, {
      project: project.name,
      saved_at: new Date().toISOString(),
      auto_selected: true,
      total_selections: autoSelections.length,
      selections: autoSelections,
    });
    console.log('[Step 6b] Auto mode: ' + autoSelections.length + ' images automatisch geselecteerd');
  }

  // Als geen enkele scene gelukt is, throw error zodat de stap niet op completed komt
  if (failed > 0) {
    throw new Error('Alle ' + aiScenes.length + ' scenes mislukt. Geen images gegenereerd.');
  }

  return {
    totalScenes: aiScenes.length,
    scenesCompleted: completed,
    scenesFailed: failed,
    filePath: imageOptionsPath,
    autoSelected: isAutoMode,
  };
}


// ── Stap 4: Voiceover genereren (via N8N) ──

const VOICES_PATH = '/root/.openclaw/workspace/video-producer/presets/voices.json';

async function resolveVoiceId(voiceName: string): Promise<{ voice_id: string; name: string }> {
  let voices: any[] = [];
  try {
    voices = await readJson(VOICES_PATH);
  } catch {
    throw new Error('voices.json niet gevonden op ' + VOICES_PATH);
  }

  const cleanName = voiceName.split('—')[0].split('-')[0].trim().toLowerCase();
  const match = voices.find((v: any) =>
    v.name.toLowerCase() === cleanName ||
    v.name.toLowerCase() === voiceName.toLowerCase() ||
    voiceName.toLowerCase().includes(v.name.toLowerCase())
  );

  if (!match) {
    console.warn('[Step 4] Voice "' + voiceName + '" niet gevonden, fallback naar eerste voice');
    if (voices.length === 0) throw new Error('Geen voices beschikbaar in voices.json');
    return { voice_id: voices[0].voice_id, name: voices[0].name };
  }

  return { voice_id: match.voice_id, name: match.name };
}

async function pollForStatus(statusPath: string, intervalMs: number, timeoutMs: number): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const content = await readJson<any>(statusPath);
      if (content.status === 'completed') return content;
      if (content.status === 'failed') throw new Error(content.error || 'N8N workflow failed');
    } catch (e: any) {
      if (e.message && !e.message.includes('ENOENT') && !e.message.includes('Unexpected')) {
        throw e;
      }
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error('Timeout: status.json niet gevonden of niet voltooid binnen de tijdslimiet');
}

export async function executeStep4(project: any, settings: any) {
  const projPath = projectDir(project.name);
  const scriptVoiceoverPath = path.join(projPath, 'script', 'script-voiceover.txt');
  const outputPath = path.join(projPath, 'audio', 'voiceover.mp3');
  const statusPath = path.join(projPath, 'audio', 'voiceover-status.json');

  // Check of schoon script bestaat, zo niet: maak het aan
  let scriptText: string;
  try {
    scriptText = await readText(scriptVoiceoverPath);
    if (!scriptText.trim()) throw new Error('Bestand is leeg');
  } catch {
    console.log('[Step 4] script-voiceover.txt niet gevonden, maak aan vanuit script.txt...');
    const scriptPath = path.join(projPath, 'script', 'script.txt');
    const script = await readText(scriptPath);
    scriptText = script.replace(/\[CLIP:.*?\]\n?/g, '').replace(/\n{3,}/g, '\n\n').trim();
    await writeText(scriptVoiceoverPath, scriptText);
  }

  // Zoek voice_id op
  const voice = await resolveVoiceId(project.voice);
  console.log('[Step 4] Voice: ' + voice.name + ' (' + voice.voice_id + ')');

  // Zorg dat audio dir bestaat
  await ensureDir(path.join(projPath, 'audio'));

  // Verwijder oude status en audio zodat polling schoon is
  try { await fs.unlink(statusPath); } catch {}
  try { await fs.unlink(outputPath); } catch {}

  // Stuur webhook naar N8N — nu met tekst en API key in payload
  const n8nUrl = (settings.n8nBaseUrl || 'https://n8n.srv1275252.hstgr.cloud') + '/webhook/audio-generator';

  const payload = {
    project: project.name,
    text: scriptText,
    output_path: outputPath,
    voice_id: voice.voice_id,
    model: 'eleven_flash_v2_5',
    elevate_api_key: settings.elevateApiKey,
  };

  console.log('[Step 4] Webhook sturen naar ' + n8nUrl + '...');

  const response = await fetch(n8nUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error('N8N webhook mislukt (' + response.status + '): ' + body);
  }

  const webhookResult = await response.json();
  console.log('[Step 4] N8N response: ' + JSON.stringify(webhookResult));

  // Poll status.json (max 3 minuten)
  console.log('[Step 4] Wachten op status: ' + statusPath);
  const status = await pollForStatus(statusPath, 5000, 180000);

  console.log('[Step 4] Voiceover klaar! ' + (status.file_size_kb || 0) + ' KB, ' + (status.duration || 0).toFixed(1) + 's');

  return {
    audioPath: outputPath,
    fileSizeKb: status.file_size_kb || 0,
    duration: status.duration || 0,
    voiceName: voice.name,
    voiceId: voice.voice_id,
  };
}

// ── Stap 5: Timestamps genereren (via N8N) ──

export async function executeStep5(project: any, settings: any) {
  const projPath = projectDir(project.name);
  const audioPath = path.join(projPath, 'audio', 'voiceover.mp3');
  const scriptPath = path.join(projPath, 'script', 'script.txt');
  const outputDir = path.join(projPath, 'audio') + '/';
  const statusPath = path.join(projPath, 'audio', 'timestamps-status.json');
  const timestampsPath = path.join(projPath, 'audio', 'timestamps.json');

  // Check of voiceover bestaat
  try {
    const stat = await fs.stat(audioPath);
    if (stat.size === 0) throw new Error('Bestand is leeg');
  } catch {
    throw new Error('voiceover.mp3 niet gevonden. Voer eerst stap 4 uit.');
  }

  // Verwijder oude bestanden zodat polling schoon is
  try { await fs.unlink(statusPath); } catch {}
  try { await fs.unlink(timestampsPath); } catch {}
  try { await fs.unlink(path.join(projPath, 'audio', 'clip-positions.json')); } catch {}

  // Stuur webhook naar N8N — met API key in payload
  const n8nUrl = (settings.n8nBaseUrl || 'https://n8n.srv1275252.hstgr.cloud') + '/webhook/timestamp-generator';

  const payload = {
    project: project.name,
    audio_path: audioPath,
    script_path: scriptPath,
    output_dir: outputDir,
    assemblyai_api_key: settings.assemblyAiApiKey,
  };

  console.log('[Step 5] Webhook sturen naar ' + n8nUrl + '...');

  const response = await fetch(n8nUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error('N8N webhook mislukt (' + response.status + '): ' + body);
  }

  const webhookResult = await response.json();
  console.log('[Step 5] N8N response: ' + JSON.stringify(webhookResult));

  // Poll status.json (max 5 minuten)
  console.log('[Step 5] Wachten op status: ' + statusPath);
  const status = await pollForStatus(statusPath, 5000, 300000);

  console.log('[Step 5] Timestamps klaar! ' + (status.word_count || 0) + ' woorden, ' + Math.round(status.duration || 0) + 's, ' + (status.clip_count || 0) + ' clips');

  return {
    timestampsPath,
    wordCount: status.word_count || 0,
    duration: Math.round((status.duration || 0) * 10) / 10,
    sentenceCount: status.sentence_count || 0,
    clipCount: status.clip_count || 0,
    totalDurationWithClips: status.total_duration_with_clips || status.duration || 0,
  };
}


// ── Stap 7: Assets zoeken (afbeeldingen + Ken Burns) via N8N ──

export async function executeStep7(project: any, settings: any) {
  const projPath = projectDir(project.name);
  const scenePromptsPath = path.join(projPath, 'assets', 'scene-prompts.json');
  const statusPath = path.join(projPath, 'assets', 'assets-status.json');

  let scenePrompts: any;
  try {
    scenePrompts = await readJson(scenePromptsPath);
  } catch {
    throw new Error('scene-prompts.json niet gevonden. Voer eerst stap 6 uit.');
  }

  const realImageScenes = (scenePrompts.scenes || []).filter(
    (s: any) => s.asset_type === 'real_image'
  );

  if (realImageScenes.length === 0) {
    console.log('[Step 7] Geen real_image scenes gevonden — stap overgeslagen');
    return {
      skipped: true,
      reason: 'Geen scenes met asset_type "real_image" in scene-prompts.json',
      totalScenes: scenePrompts.scenes?.length || 0,
      realImageScenes: 0,
    };
  }

  const assets = realImageScenes.map((scene: any) => ({
    scene_id: scene.id,
    search_query: buildSearchQuery(scene),
    search_query_fallback: buildFallbackQuery(scene),
    sources: ['google', 'pexels', 'wikimedia'],
    min_width: 1920,
    ken_burns_type: pickKenBurnsType(scene),
    duration: scene.duration || 5,
  }));

  try { await fs.unlink(statusPath); } catch {}

  const n8nUrl = (settings.n8nBaseUrl || 'https://n8n.srv1275252.hstgr.cloud') + '/webhook/asset-downloader';

  const payload = {
    project: project.name,
    output_dir: path.join(projPath, 'assets', 'images') + '/',
    scenes_dir: path.join(projPath, 'assets', 'scenes') + '/',
    pexels_api_key: settings.pexelsApiKey || 'dCnXQyimW0Ds7Vw7OjvB2xDxAfeqQbhkOZpD9ZcS3lDbBtuIFVk7om43',
    output_format: project.output === 'youtube_short' ? 'portrait' : 'landscape',
    assets,
  };

  console.log(`[Step 7] ${assets.length} assets sturen naar ${n8nUrl}...`);

  const response = await fetch(n8nUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error('N8N webhook mislukt (' + response.status + '): ' + body);
  }

  const webhookResult = await response.json();
  console.log('[Step 7] N8N response: ' + JSON.stringify(webhookResult));

  console.log('[Step 7] Wachten op status: ' + statusPath);
  const status = await pollForStatus(statusPath, 5000, 600000);

  console.log(`[Step 7] Assets klaar! ${status.assets_found || 0}/${status.total || 0} gevonden`);

  return {
    skipped: false,
    assetsFound: status.assets_found || 0,
    assetsFailed: status.assets_failed || 0,
    total: status.total || 0,
    fromGoogle: status.from_google || 0,
    fromPexels: status.from_pexels || 0,
    fromWikimedia: status.from_wikimedia || 0,
    failedScenes: status.failed_scenes || '',
    results: status.results || [],
  };
}

function buildSearchQuery(scene: any): string {
  const text = scene.text || scene.visual_prompt || '';
  const words = text.split(/\s+/).slice(0, 8).join(' ');
  return words.length > 10 ? words : text.slice(0, 80);
}

function buildFallbackQuery(scene: any): string {
  const prompt = scene.visual_prompt || scene.text || '';
  const words = prompt.split(/\s+/).slice(0, 4).join(' ');
  return words || 'historical photo';
}

function pickKenBurnsType(scene: any): string {
  const text = ((scene.text || '') + ' ' + (scene.visual_prompt || '')).toLowerCase();
  if (text.match(/portrait|person|face|man|woman|leader|king|president|mugshot/)) return 'zoom_in';
  if (text.match(/landscape|city|skyline|aerial|panorama|view|mountain|ocean/)) return Math.random() > 0.5 ? 'pan_left_right' : 'zoom_out';
  if (text.match(/building|temple|church|castle|bridge|monument|tower|statue/)) return 'zoom_in';
  if (text.match(/map|document|letter|newspaper|chart|diagram/)) return 'zoom_in_pan';
  if (text.match(/group|crowd|army|battle|event|ceremony|gathering/)) return 'pan_left_right';
  const types = ['zoom_in', 'zoom_out', 'pan_left_right'];
  return types[Math.floor(Math.random() * types.length)];
}


// ── Stap 8: YouTube clips ophalen via N8N ──

export async function executeStep8(project: any, settings: any) {
  const projPath = projectDir(project.name);
  const statusPath = path.join(projPath, 'assets', 'clips-status.json');

  if (!project.useClips) {
    console.log('[Step 8] Clips niet ingeschakeld — stap overgeslagen');
    return { skipped: true, reason: 'YouTube clips zijn niet ingeschakeld voor dit project' };
  }

  let clips: any[] = [];
  const clipPositionsPath = path.join(projPath, 'audio', 'clip-positions.json');
  try {
    const clipData = await readJson<any>(clipPositionsPath);
    clips = clipData.clips || clipData || [];
    if (!Array.isArray(clips)) clips = [];
  } catch {
    console.log('[Step 8] clip-positions.json niet gevonden, check scene-prompts.json...');
    try {
      const scenePrompts = await readJson<any>(path.join(projPath, 'assets', 'scene-prompts.json'));
      const clipScenes = (scenePrompts.scenes || []).filter((s: any) => s.type === 'clip');
      clips = clipScenes.map((s: any, i: number) => ({
        clip_id: i + 1,
        url: s.clip_url || '',
        start: s.clip_start || '00:00',
        end: s.clip_end || '00:10',
      })).filter((c: any) => c.url);
    } catch {}
  }

  if (clips.length === 0) {
    console.log('[Step 8] Geen clips gevonden — stap overgeslagen');
    return { skipped: true, reason: 'Geen clips gevonden in clip-positions.json of scene-prompts.json' };
  }

  clips = clips.map((c: any, i: number) => ({
    clip_id: c.clip_id || i + 1,
    url: c.url || c.source_url || '',
    start: c.start || c.source_start || '00:00',
    end: c.end || c.source_end || '00:10',
  }));

  try { await fs.unlink(statusPath); } catch {}

  const n8nUrl = (settings.n8nBaseUrl || 'https://n8n.srv1275252.hstgr.cloud') + '/webhook/clip-downloader';

  const payload = {
    project: project.name,
    output_dir: path.join(projPath, 'assets', 'clips') + '/',
    output_format: project.output === 'youtube_short' ? 'portrait' : 'landscape',
    clips,
  };

  console.log(`[Step 8] ${clips.length} clips sturen naar ${n8nUrl}...`);

  const response = await fetch(n8nUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error('N8N webhook mislukt (' + response.status + '): ' + body);
  }

  const webhookResult = await response.json();
  console.log('[Step 8] N8N response: ' + JSON.stringify(webhookResult));

  console.log('[Step 8] Wachten op status: ' + statusPath);
  const status = await pollForStatus(statusPath, 5000, 600000);

  console.log(`[Step 8] Clips klaar! ${status.clips_downloaded || 0}/${status.total_clips || 0} gedownload`);

  return {
    skipped: false,
    clipsDownloaded: status.clips_downloaded || 0,
    clipsFailed: status.clips_failed || 0,
    totalClips: status.total_clips || 0,
    results: status.results || [],
  };
}


// ── Stap 9: Video scenes genereren (VEO 3 image-to-video) via N8N ──

export async function executeStep9(project: any, settings: any) {
  const projPath = projectDir(project.name);
  const scenePromptsPath = path.join(projPath, 'assets', 'scene-prompts.json');
  const selectionsPath = path.join(projPath, 'assets', 'image-selections.json');
  const statusPath = path.join(projPath, 'assets', 'scenes-status.json');
  const outputDir = path.join(projPath, 'assets', 'scenes') + '/';

  let scenePrompts: any;
  try {
    scenePrompts = await readJson(scenePromptsPath);
  } catch {
    throw new Error('scene-prompts.json niet gevonden. Voer eerst stap 6 uit.');
  }

  // Lees image selecties (van stap 6b)
  let imageSelections: any = { selections: [] };
  try {
    imageSelections = await readJson(selectionsPath);
    console.log('[Step 9] ' + (imageSelections.selections?.length || 0) + ' image selecties geladen');
  } catch {
    throw new Error('image-selections.json niet gevonden. Voer eerst stap 6b uit.');
  }

  const selections = imageSelections.selections || [];

  const aiScenes = (scenePrompts.scenes || []).filter(
    (s: any) => s.asset_type === 'ai_video' || s.type === 'ai_video'
  );

  if (aiScenes.length === 0) {
    console.log('[Step 9] Geen ai_video scenes gevonden — stap overgeslagen');
    return { skipped: true, reason: 'Geen scenes met asset_type "ai_video" in scene-prompts.json' };
  }

  const n8nUrl = (settings.n8nBaseUrl || 'https://n8n.srv1275252.hstgr.cloud') + '/webhook/video-scene-generator';
  const aspectRatio = project.output === 'youtube_short' ? 'portrait' : 'landscape';

  console.log('[Step 9] ' + aiScenes.length + ' scenes genereren via image-to-video, PARALLEL via ' + n8nUrl);

  const results: any[] = [];
  let completed = 0;
  let failed = 0;

  // ── Alle webhooks tegelijk versturen ──
  const sceneJobs: { sceneId: number; scene: any; statusPath: string; webhookOk: boolean }[] = [];

  await Promise.all(aiScenes.map(async (scene: any, i: number) => {
    const sceneId = scene.id;
    const sceneStatusPath = path.join(projPath, 'assets', 'scenes', 'scene' + sceneId + '-status.json');

    const selection = selections.find((s: any) => s.scene_id === sceneId || String(s.scene_id) === String(sceneId));
    const sourceImagePath = selection?.chosen_path || '';

    if (!sourceImagePath) {
      console.warn('[Step 9] Scene ' + sceneId + ': geen source image, overgeslagen');
      failed++;
      results.push({ scene_id: sceneId, status: 'failed', error: 'Geen source image geselecteerd' });
      return;
    }

    const payload = {
      project: project.name,
      scene_id: sceneId,
      visual_prompt: scene.visual_prompt,
      duration: scene.duration || 5,
      aspect_ratio: aspectRatio,
      output_dir: outputDir,
      elevate_api_key: settings.elevateApiKey,
      source_image_path: sourceImagePath,
      genai_pro_api_key: settings.genaiProApiKey || '',
      genai_pro_enabled: settings.genaiProEnabled || false,
    };

    try {
      try { await fs.unlink(sceneStatusPath); } catch {}

      const response = await fetch(n8nUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error('Webhook mislukt (' + response.status + '): ' + body);
      }

      console.log('[Step 9] Scene ' + sceneId + ' (' + (i + 1) + '/' + aiScenes.length + ') webhook verstuurd');
      sceneJobs.push({ sceneId, scene, statusPath: sceneStatusPath, webhookOk: true });
    } catch (err: any) {
      console.error('[Step 9] Scene ' + sceneId + ' webhook error: ' + err.message);
      failed++;
      results.push({ scene_id: sceneId, status: 'failed', error: err.message });
    }
  }));

  const activeJobs = sceneJobs.filter(j => j.webhookOk);
  console.log('[Step 9] ' + activeJobs.length + '/' + aiScenes.length + ' webhooks verstuurd, parallel pollen...');

  // ── Alle status files parallel pollen ──
  await Promise.all(activeJobs.map(async (job) => {
    try {
      const status = await pollForStatus(job.statusPath, 10000, 600000);

      if (status.status === 'completed') {
        completed++;
        results.push({ scene_id: job.sceneId, status: 'success', file_path: status.file_path });
        console.log('[Step 9] Scene ' + job.sceneId + ' klaar! (' + completed + '/' + aiScenes.length + ')');
      } else {
        failed++;
        results.push({ scene_id: job.sceneId, status: 'failed', error: status.error || 'Unknown' });
        console.log('[Step 9] Scene ' + job.sceneId + ' mislukt: ' + (status.error || 'Unknown'));
      }
    } catch (err: any) {
      failed++;
      results.push({ scene_id: job.sceneId, status: 'failed', error: err.message });
      console.log('[Step 9] Scene ' + job.sceneId + ' poll error: ' + err.message);
    }
  }));

  console.log('[Step 9] Klaar! ' + completed + '/' + aiScenes.length + ' geslaagd, ' + failed + ' mislukt');

  if (failed > 0) {
    throw new Error(failed + ' van ' + aiScenes.length + ' video scenes mislukt.');
  }

  return {
    skipped: false,
    scenesCompleted: completed,
    scenesFailed: failed,
    totalScenes: aiScenes.length,
    results,
  };
}

// ============================================================
// STAP 10: VIDEO EDITING
// ============================================================

export async function executeStep10(project: any, settings: any) {
  const projPath = projectDir(project.name);
  const statusPath = path.join(projPath, 'edit', 'edit-status.json');
  const n8nUrl = (settings.n8nBaseUrl || 'https://n8n.srv1275252.hstgr.cloud') + '/webhook/video-editor';

  const payload = {
    project: project.name,
    project_dir: projPath,
    color_grade: project.colorGrade || settings.colorGrade || 'none',
    subtitles: project.subtitles !== false,
    output_format: project.output === 'youtube_short' ? 'youtube_short' : 'youtube_1080p',
  };

  console.log(`[Step 10] Video editing starten via ${n8nUrl}...`);

  try { await fs.unlink(statusPath); } catch {}
  await fs.mkdir(path.join(projPath, 'edit', 'draft'), { recursive: true });
  await fs.mkdir(path.join(projPath, 'edit', 'trimmed'), { recursive: true });

  const response = await fetch(n8nUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error('N8N webhook mislukt (' + response.status + '): ' + body);
  }

  console.log('[Step 10] Wachten op edit-status.json...');
  const status = await pollForStatus(statusPath, 15000, 3600000);

  console.log(`[Step 10] Editing klaar! Duur: ${status.duration}s, Grootte: ${status.file_size_mb} MB`);

  return {
    outputFile: status.output_file,
    duration: status.duration,
    fileSizeMb: status.file_size_mb,
    segments: status.segments,
    missingScenes: status.missing_scenes,
  };
}

// ============================================================
// STAP 11: COLOR GRADING
// ============================================================

export async function executeStep11(project: any, settings: any) {
  const projPath = projectDir(project.name);
  const statusPath = path.join(projPath, 'edit', 'colorgrade-status.json');
  const n8nUrl = (settings.n8nBaseUrl || 'https://n8n.srv1275252.hstgr.cloud') + '/webhook/color-grader';

  const payload = {
    project: project.name,
    project_dir: projPath,
    color_grade: project.colorGrade || settings.colorGrade || 'none',
  };

  console.log(`[Step 11] Color grading (${payload.color_grade}) via ${n8nUrl}...`);

  // Skip als geen color grading nodig
  if (payload.color_grade === 'none' || !payload.color_grade) {
    console.log('[Step 11] Geen color grading nodig, skip...');
    return { outputFile: null, colorGrade: 'none', duration: 0, fileSizeMb: 0 };
  }

  try { await fs.unlink(statusPath); } catch {}

  const response = await fetch(n8nUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error('N8N webhook mislukt (' + response.status + '): ' + body);
  }

  console.log('[Step 11] Wachten op colorgrade-status.json...');
  const status = await pollForStatus(statusPath, 10000, 1800000);

  console.log(`[Step 11] Color grading klaar! Grade: ${status.color_grade}`);

  return {
    outputFile: status.output_file,
    colorGrade: status.color_grade,
    duration: status.duration,
    fileSizeMb: status.file_size_mb,
  };
}

// ============================================================
// STAP 12: SUBTITLES
// ============================================================

export async function executeStep12(project: any, settings: any) {
  const projPath = projectDir(project.name);
  const statusPath = path.join(projPath, 'edit', 'subtitles-status.json');
  const n8nUrl = (settings.n8nBaseUrl || 'https://n8n.srv1275252.hstgr.cloud') + '/webhook/subtitle-burner';

  const payload = {
    project: project.name,
    project_dir: projPath,
    subtitles: project.subtitles !== false,
    subtitle_font_size: 22,
  };

  if (!payload.subtitles) {
    console.log('[Step 12] Subtitles uitgeschakeld — stap overgeslagen');
    return { skipped: true, reason: 'Subtitles uitgeschakeld in project config' };
  }

  console.log(`[Step 12] Subtitles branden via ${n8nUrl}...`);

  try { await fs.unlink(statusPath); } catch {}

  const response = await fetch(n8nUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error('N8N webhook mislukt (' + response.status + '): ' + body);
  }

  console.log('[Step 12] Wachten op subtitles-status.json...');
  const status = await pollForStatus(statusPath, 10000, 1800000);

  console.log(`[Step 12] Subtitles klaar! ${status.subtitles_count} zinnen gebrand`);

  return {
    outputFile: status.output_file,
    subtitlesCount: status.subtitles_count,
    srtFile: status.srt_file,
    duration: status.duration,
    fileSizeMb: status.file_size_mb,
  };
}

// ============================================================
// STAP 13: FINAL EXPORT
// ============================================================

export async function executeStep13(project: any, settings: any) {
  const projPath = projectDir(project.name);
  const statusPath = path.join(projPath, 'edit', 'export-status.json');
  const n8nUrl = (settings.n8nBaseUrl || 'https://n8n.srv1275252.hstgr.cloud') + '/webhook/final-exporter';

  const payload = {
    project: project.name,
    project_dir: projPath,
    subtitles: project.subtitles !== false,
    output_format: project.output === 'youtube_short' ? 'youtube_short' : 'youtube_1080p',
  };

  console.log(`[Step 13] Final export via ${n8nUrl}...`);

  try { await fs.unlink(statusPath); } catch {}

  const response = await fetch(n8nUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error('N8N webhook mislukt (' + response.status + '): ' + body);
  }

  console.log('[Step 13] Wachten op export-status.json...');
  const status = await pollForStatus(statusPath, 10000, 1800000);

  console.log(`[Step 13] Export klaar! ${status.duration}s, ${status.file_size_mb} MB`);

  return {
    outputFile: status.output_file,
    duration: status.duration,
    fileSizeMb: status.file_size_mb,
    format: status.format,
  };
}

// ── Stap 14: Google Drive Upload ──

export async function executeStep14(project: any, settings: any) {
  const projPath = projectDir(project.name);
  const statusPath = path.join(projPath, 'drive-upload-status.json');
  const channelName = project.channel?.name || 'Geen Kanaal';

  console.log(`[Step 14] Google Drive upload starten voor ${project.name}...`);

  try { await fs.unlink(statusPath); } catch {}

  // Voer het upload script uit via child_process
  const { execSync } = await import('child_process');
  const result = execSync(
    `bash /root/video-producer-app/scripts/gdrive-upload.sh "${project.name}" "${channelName}"`,
    { timeout: 600000, encoding: 'utf-8' }
  );

  let status;
  try {
    status = JSON.parse(result.trim());
  } catch {
    // Lees status bestand als fallback
    status = await pollForStatus(statusPath, 5000, 60000);
  }

  if (status.status === 'error') {
    throw new Error(status.message || 'Google Drive upload mislukt');
  }

  console.log(`[Step 14] Upload klaar! ${status.files_uploaded} bestanden → ${status.drive_url}`);

  // Sla drive URL op in project
  const prisma = (await import('../db.js')).default;
  await prisma.project.update({
    where: { id: project.id },
    data: { driveUrl: status.drive_url },
  });

  return {
    driveUrl: status.drive_url,
    drivePath: status.drive_path,
    filesUploaded: status.files_uploaded,
    errors: status.errors,
  };
}
