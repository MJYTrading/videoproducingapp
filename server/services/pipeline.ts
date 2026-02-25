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
TOTAAL WOORDENAANTAL: ${wordCount} woorden
AANTAL SECTIES: ${sections} (uit style profile)
WOORDEN PER SECTIE: ~${wordsPerSection}
${clipInfo}

Schrijf het volledige script. ALLEEN het script, geen extra uitleg.`;

  const script = await llmSimplePrompt(
    llmKeys, SCRIPT_SYSTEM, userPrompt,
    { maxTokens: 16384, temperature: 0.8 }
  );

  const scriptVoiceover = script.replace(/\[CLIP:.*?\]\n?/g, '').replace(/\n{3,}/g, '\n\n').trim();

  const scriptPath = path.join(projPath, 'script', 'script.txt');
  await writeText(scriptPath, script);
  await writeText(path.join(projPath, 'script', 'script-voiceover.txt'), scriptVoiceover);

  const actualWordCount = script.split(/\s+/).length;

  return {
    script,
    scriptVoiceover,
    wordCount: actualWordCount,
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
      "visual_prompt": "Volledige prompt met style prefix en suffix",
      "camera_movement": "beschrijving van camera beweging",
      "mood": "sfeer van de scene"
    }
  ]
}`;

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
      '- Elke scene heeft: id, start, end, duration, text, type, asset_type, visual_prompt, camera_movement, mood',
      '- Geef ALLEEN een JSON object terug met een "scenes" array',
    ].join('\n');

    return llmJsonPrompt<{ scenes: any[] }>(
      llmKeys, PROMPTS_SYSTEM, batchPrompt,
      { maxTokens: 8192, temperature: 0.7 }
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
