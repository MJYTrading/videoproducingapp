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

  // Bereken sections en avg_words_per_section op basis van target scriptLength
  const targetWords = project.scriptLength || 5000;
  const sections = styleProfile.script_formatting_rules?.sections || Math.max(3, Math.round(targetWords / 1200));
  const avgWordsPerSection = Math.round(targetWords / sections);
  if (!styleProfile.script_formatting_rules) styleProfile.script_formatting_rules = {};
  styleProfile.script_formatting_rules.sections = sections;
  styleProfile.script_formatting_rules.avg_words_per_section = avgWordsPerSection;
  styleProfile.script_formatting_rules.total_target_words = targetWords;
  console.log(`[Style Profile] Target: ${targetWords} woorden, ${sections} secties x ${avgWordsPerSection} woorden`);

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

const PROMPTS_SYSTEM = `Je bent een ervaren visuele regisseur en storyteller die scene-voor-scene prompts maakt voor AI video generatie.

STORYTELLING PRINCIPES (KRITIEK):
- Elke scene moet NAADLOOS aansluiten bij het verhaal — zowel visueel als narratief
- De visuele prompt moet EXACT weergeven wat er op DAT MOMENT in het script wordt verteld
- Denk als een filmmaker: elke scene moet visueel logisch volgen op de vorige en leiden naar de volgende
- Voorkom visuele "sprongen" — als het script over een persoon praat die door een stad loopt, maak dan geen scene van een berg
- De EMOTIE en SFEER van de scene moet matchen met de toon van de tekst op dat moment
- Let op narratieve overgangen: als het script van onderwerp wisselt, moet de visuele overgang dat weerspiegelen
- Bij een doorlopend verhaal: behoud visuele consistentie (zelfde setting, zelfde karakters, zelfde belichting)
- Bij een nieuw onderwerp: maak een duidelijke visuele transitie die past bij de vertelling

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

  // 1. Laad script
  let scriptText: string;
  try {
    scriptText = await readText(path.join(projPath, 'script', 'script.txt'));
  } catch {
    throw new Error('Script niet gevonden. Voer eerst stap 3 uit.');
  }

  // 2. Laad timestamps (woord-level timing van AssemblyAI)
  let timestamps: any = null;
  let audioDuration = 0;
  let wordTimestamps: any[] = [];
  try {
    timestamps = await readJson(path.join(projPath, 'audio', 'timestamps.json'));
    audioDuration = timestamps.duration || timestamps.audio_duration || 0;
    wordTimestamps = timestamps.words || timestamps.word_timestamps || [];
    console.log(`[Step 6] Timestamps geladen: ${audioDuration}s, ${wordTimestamps.length} woorden`);
  } catch {
    console.warn('[Step 6] Geen timestamps gevonden — scene timing wordt geschat');
  }

  // 3. Laad style preset
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

  // 4. Bereken verwacht aantal scenes
  const targetSceneDuration = 5; // seconden per scene
  const estimatedSceneCount = audioDuration > 0
    ? Math.ceil(audioDuration / targetSceneDuration)
    : Math.ceil(scriptText.split(/\s+/).length / 15); // ~15 woorden = ~5 sec spraak
  
  console.log(`[Step 6] Audio: ${audioDuration}s → verwacht ~${estimatedSceneCount} scenes`);

  // 5. Splits script in batches MET timestamp info
  const rawSections = scriptText.split(/\n\n+/);
  const sections: Array<{ text: string; startTime: number; endTime: number; wordCount: number }> = [];
  let currentChunk = '';
  let chunkStartTime = 0;
  let chunkEndTime = 0;
  let wordsProcessed = 0;

  for (const section of rawSections) {
    const sectionWords = section.split(/\s+/).length;
    
    if (currentChunk && (currentChunk + ' ' + section).split(/\s+/).length > 350) {
      sections.push({
        text: currentChunk.trim(),
        startTime: chunkStartTime,
        endTime: chunkEndTime,
        wordCount: currentChunk.trim().split(/\s+/).length,
      });
      currentChunk = section;
      chunkStartTime = chunkEndTime;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + section;
    }
    
    // Bereken eindtijd op basis van woord-timestamps
    wordsProcessed += sectionWords;
    if (wordTimestamps.length > 0 && wordsProcessed < wordTimestamps.length) {
      const wordData = wordTimestamps[Math.min(wordsProcessed - 1, wordTimestamps.length - 1)];
      chunkEndTime = (wordData.end || wordData.end_time || 0) / 1000; // ms → sec
    } else if (audioDuration > 0) {
      chunkEndTime = (wordsProcessed / (wordTimestamps.length || scriptText.split(/\s+/).length)) * audioDuration;
    }
  }
  if (currentChunk.trim()) {
    sections.push({
      text: currentChunk.trim(),
      startTime: chunkStartTime,
      endTime: audioDuration || chunkEndTime,
      wordCount: currentChunk.trim().split(/\s+/).length,
    });
  }

  console.log(`[Step 6] Script gesplitst in ${sections.length} batches`);

  // 6. Bouw prompts met timing informatie
  const styleBlock = [
    `- Prefix (begin van elke prompt): ${stylePreset.style_prefix}`,
    `- Suffix (eind van elke prompt): ${stylePreset.style_suffix}`,
    `- Character beschrijving: ${stylePreset.character_description}`,
    genre ? `- Genre: ${genre}` : '',
    mood ? `- Mood: ${mood}` : '',
  ].filter(Boolean).join('\n');

  const batchPromises = sections.map((section, i) => {
    const sectionDuration = section.endTime - section.startTime;
    const expectedScenes = Math.max(1, Math.round(sectionDuration / targetSceneDuration));
    
    // Context van vorige en volgende batch voor continuiteit
    const prevSection = i > 0 ? sections[i - 1] : null;
    const nextSection = i < sections.length - 1 ? sections[i + 1] : null;
    const prevContext = prevSection 
      ? prevSection.text.split(/\s+/).slice(-40).join(' ')
      : '(Dit is het BEGIN van de video)';
    const nextContext = nextSection
      ? nextSection.text.split(/\s+/).slice(0, 40).join(' ')
      : '(Dit is het EINDE van de video)';

    const batchPrompt = [
      `Maak visuele scene prompts voor deel ${i + 1} van ${sections.length} van een video script.`,
      '',
      'VERHAALCONTEXT (KRITIEK — lees dit eerst):',
      `- Wat er NET DAARVOOR werd verteld: "${prevContext}"`,
      `- Wat er NA DIT DEEL wordt verteld: "${nextContext}"`,
      '- Jouw scenes moeten NAADLOOS aansluiten op deze context',
      '- De eerste scene moet visueel logisch volgen op het einde van het vorige deel',
      '- De laatste scene moet een natuurlijke overgang zijn naar het volgende deel',
      '',
      'TIMING INFORMATIE:',
      `- Dit deel loopt van ${section.startTime.toFixed(1)}s tot ${section.endTime.toFixed(1)}s (${sectionDuration.toFixed(1)} seconden)`,
      `- Totale video duur: ${audioDuration.toFixed(1)} seconden`,
      `- Genereer PRECIES ${expectedScenes} scenes voor dit deel`,
      `- Elke scene moet 3-8 seconden duren (ideaal 4-6 seconden)`,
      `- De scenes moeten PRECIES de tijdspanne ${section.startTime.toFixed(1)}s - ${section.endTime.toFixed(1)}s beslaan`,
      '',
      'STIJL:',
      styleBlock,
      '',
      `SCRIPT DEEL ${i + 1}:`,
      section.text,
      '',
      'REGELS:',
      '- STORYTELLING: Elke visual_prompt moet PRECIES beschrijven wat het script op DAT moment vertelt',
      '- STORYTELLING: Scenes moeten visueel op elkaar aansluiten — geen willekeurige beelden',
      '- STORYTELLING: Match de sfeer/emotie van het beeld met de toon van de tekst',
      '- STORYTELLING: Bij doorlopend verhaal: behoud dezelfde setting, karakters en belichting',
      '- Elke scene MOET start, end en duration hebben die optellen tot de volledige tijdspanne',
      '- [CLIP] markers worden type: "clip"',
      '- Elke scene heeft: id, start, end, duration, text, type, asset_type, visual_prompt, video_prompt, camera_movement, mood',
      '- Geef ALLEEN een JSON object terug met een "scenes" array',
      '- Voor ai_video scenes: voeg visual_prompt_variants toe (array van 3 VERSCHILLENDE prompts)',
      '- visual_prompt = variant 1, visual_prompt_variants = [variant1, variant2, variant3]',
      '- Varianten moeten ECHT ANDERS zijn: close-up vs wide shot vs creatief perspectief',
      '- Clip en real_image scenes hebben GEEN visual_prompt_variants nodig',
      '- Voor ai_video scenes: voeg video_prompt toe (korte beschrijving van beweging/actie)',
      `- BELANGRIJK: Genereer PRECIES ${expectedScenes} scenes, niet meer en niet minder`,
    ].join('\n');

    return llmJsonPrompt<{ scenes: any[] }>(
      llmKeys, PROMPTS_SYSTEM, batchPrompt,
      { maxTokens: 16000, temperature: 0.7 }
    ).then(result => {
      console.log(`[Step 6] Batch ${i + 1}: ${(result.scenes || []).length} scenes (verwacht: ${expectedScenes})`);
      return { index: i, scenes: result.scenes || [], startTime: section.startTime };
    }).catch(error => {
      console.error(`[Step 6] Batch ${i + 1} gefaald: ${error.message}`);
      return { index: i, scenes: [], startTime: section.startTime };
    });
  });

  // 7. Voer ALLE batches parallel uit
  console.log(`[Step 6] ${sections.length} batches parallel starten...`);
  const batchResults = await Promise.all(batchPromises);

  // 8. Sorteer en combineer met correcte timing
  batchResults.sort((a, b) => a.index - b.index);
  const allScenes: any[] = [];
  let sceneId = 1;

  for (const batch of batchResults) {
    for (const scene of batch.scenes) {
      scene.id = sceneId++;
      allScenes.push(scene);
    }
  }

  if (allScenes.length === 0) {
    throw new Error('Geen scenes gegenereerd uit alle batches');
  }

  // 9. Statistieken
  const aiVideoScenes = allScenes.filter((s: any) => s.type === 'ai_video' || s.asset_type === 'ai_video').length;
  const clipScenes = allScenes.filter((s: any) => s.type === 'clip').length;
  const realImageScenes = allScenes.filter((s: any) => s.asset_type === 'real_image').length;
  const totalDuration = allScenes.reduce((sum: number, s: any) => sum + (s.duration || 0), 0);
  const avgDuration = allScenes.length > 0 ? totalDuration / allScenes.length : 0;

  console.log(`[Step 6] Klaar! ${allScenes.length} scenes, ${totalDuration.toFixed(1)}s totaal (audio: ${audioDuration}s)`);
  if (Math.abs(totalDuration - audioDuration) > 10 && audioDuration > 0) {
    console.warn(`[Step 6] ⚠️ Scene totaal (${totalDuration.toFixed(1)}s) wijkt af van audio (${audioDuration}s)`);
  }

  const outputPath = path.join(projPath, 'assets', 'scene-prompts.json');
  await writeJson(outputPath, {
    project: project.name, style: project.visualStyle, genre, mood,
    audio_duration: audioDuration,
    total_scenes: allScenes.length, ai_video_scenes: aiVideoScenes,
    clip_scenes: clipScenes, real_image_scenes: realImageScenes,
    avg_scene_duration: Math.round(avgDuration * 10) / 10, scenes: allScenes,
  });

  return {
    totalScenes: allScenes.length, aiVideoScenes, clipScenes, realImageScenes,
    avgDuration: Math.round(avgDuration * 10) / 10, filePath: outputPath,
    audioDuration,
    typeCounts: { ai_video: aiVideoScenes, clip: clipScenes, real_image: realImageScenes },
    preview: allScenes.slice(0, 3),
  };
}


// ── Stap 13: Images Genereren (via N8N) ──

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
    console.log('[Step 13] Geen ai_video scenes met prompt varianten gevonden');
    return { skipped: true, reason: 'Geen scenes met visual_prompt_variants in scene-prompts.json' };
  }

  const isAutoMode = project.imageSelectionMode !== 'manual';
  if (isAutoMode) {
    console.log('[Step 13] Auto mode: 1 image per scene genereren, automatisch selecteren');
  }

  const n8nUrl = (settings.n8nBaseUrl || 'https://n8n.srv1275252.hstgr.cloud') + '/webhook/image-options-generator';
  const aspectRatio = project.output === 'youtube_short' ? 'portrait' : 'landscape';

  console.log('[Step 13] ' + aiScenes.length + ' scenes, 3 images per scene genereren via ' + n8nUrl);

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

      console.log('[Step 13] Scene ' + sceneId + ' (' + (i + 1) + '/' + aiScenes.length + ') webhook verstuurd');
      sceneJobs.push({ sceneId, scene, statusPath, webhookOk: true });
    } catch (err: any) {
      console.error('[Step 13] Scene ' + sceneId + ' webhook error: ' + err.message);
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
  console.log('[Step 13] ' + activeJobs.length + '/' + aiScenes.length + ' webhooks verstuurd, parallel pollen...');

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
        console.log('[Step 13] Scene ' + job.sceneId + ' klaar! (' + completed + '/' + aiScenes.length + ')');
      } else {
        failed++;
        allOptions.push({
          scene_id: job.sceneId,
          text: job.scene.text || '',
          visual_prompt: job.scene.visual_prompt,
          options: [],
          error: status.error || 'Unknown',
        });
        console.warn('[Step 13] Scene ' + job.sceneId + ' mislukt: ' + (status.error || 'Unknown'));
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
      console.error('[Step 13] Scene ' + job.sceneId + ' poll error: ' + err.message);
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

  console.log('[Step 13] Klaar! ' + completed + ' scenes gelukt, ' + failed + ' mislukt');

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
    console.log('[Step 13] Auto mode: ' + autoSelections.length + ' images automatisch geselecteerd');
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
  const timestampsPath = path.join(projPath, 'audio', 'timestamps.json');
  const clipPositionsPath = path.join(projPath, 'audio', 'clip-positions.json');

  const apiKey = settings.assemblyAiApiKey;
  if (!apiKey) throw new Error('AssemblyAI API key niet ingesteld. Ga naar Instellingen.');

  // Check of voiceover bestaat
  try {
    const stat = await fs.stat(audioPath);
    if (stat.size === 0) throw new Error('Bestand is leeg');
  } catch {
    throw new Error('voiceover.mp3 niet gevonden. Voer eerst stap 7 (Voice Over) uit.');
  }

  // Verwijder oude bestanden
  try { await fs.unlink(timestampsPath); } catch {}
  try { await fs.unlink(clipPositionsPath); } catch {}

  const headers = { 'Authorization': apiKey, 'Content-Type': 'application/json' };

  // 1. Upload audio naar AssemblyAI
  console.log('[Timestamps] Audio uploaden naar AssemblyAI...');
  const audioBuffer = await fs.readFile(audioPath);
  const uploadResp = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers: { 'Authorization': apiKey },
    body: audioBuffer,
  });
  if (!uploadResp.ok) throw new Error('AssemblyAI upload mislukt: ' + (await uploadResp.text()).slice(0, 200));
  const uploadData = await uploadResp.json();
  const uploadUrl = uploadData.upload_url;
  console.log('[Timestamps] Audio geüpload, URL ontvangen');

  // 2. Start transcriptie
  console.log('[Timestamps] Transcriptie starten...');
  const transcriptResp = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers,
    body: JSON.stringify({ audio_url: uploadUrl, punctuate: true, format_text: true }),
  });
  if (!transcriptResp.ok) throw new Error('AssemblyAI transcript start mislukt: ' + (await transcriptResp.text()).slice(0, 200));
  const transcriptData = await transcriptResp.json();
  const transcriptId = transcriptData.id;
  console.log('[Timestamps] Transcript ID: ' + transcriptId);

  // 3. Poll tot completed (max 10 minuten)
  let transcript: any = null;
  const maxPolls = 60;
  for (let i = 0; i < maxPolls; i++) {
    await new Promise(r => setTimeout(r, 10000)); // 10s wachten
    const pollResp = await fetch('https://api.assemblyai.com/v2/transcript/' + transcriptId, {
      headers: { 'Authorization': apiKey },
    });
    const pollData = await pollResp.json();

    if (pollData.status === 'completed') {
      transcript = pollData;
      console.log('[Timestamps] Transcriptie voltooid! Duur: ' + Math.round(pollData.audio_duration) + 's');
      break;
    } else if (pollData.status === 'error') {
      throw new Error('AssemblyAI transcriptie mislukt: ' + (pollData.error || 'onbekende fout'));
    }
    // Nog bezig, poll opnieuw
    if (i % 6 === 5) console.log('[Timestamps] Nog bezig... (' + ((i + 1) * 10) + 's)');
  }

  if (!transcript) throw new Error('AssemblyAI timeout: transcriptie duurde langer dan 10 minuten');

  // 4. Haal sentences op
  console.log('[Timestamps] Sentences ophalen...');
  const sentencesResp = await fetch('https://api.assemblyai.com/v2/transcript/' + transcriptId + '/sentences', {
    headers: { 'Authorization': apiKey },
  });
  if (!sentencesResp.ok) throw new Error('AssemblyAI sentences ophalen mislukt');
  const sentencesData = await sentencesResp.json();

  // 5. Bouw timestamps.json
  const timestamps = {
    words: (transcript.words || []).map((w: any) => ({
      text: w.text,
      start: w.start / 1000,
      end: w.end / 1000,
      confidence: w.confidence,
    })),
    sentences: (sentencesData.sentences || []).map((s: any) => ({
      text: s.text,
      start: s.start / 1000,
      end: s.end / 1000,
    })),
    duration: transcript.audio_duration,
    audio_file: 'voiceover.mp3',
  };

  await writeJson(timestampsPath, timestamps);
  console.log('[Timestamps] timestamps.json opgeslagen (' + timestamps.words.length + ' woorden, ' + timestamps.sentences.length + ' zinnen)');

  // 6. Bereken clip posities (als er clips in het script staan)
  let clipCount = 0;
  try {
    const script = await readText(scriptPath);
    const clipRegex = /\[CLIP:\s*(https?:\/\/\S+)\s+(\d{2}:\d{2}:\d{2})\s*-\s*(\d{2}:\d{2}:\d{2})\s*\]/g;
    const clips: any[] = [];
    let match;
    let clipId = 1;

    while ((match = clipRegex.exec(script)) !== null) {
      const url = match[1];
      const startParts = match[2].split(':').map(Number);
      const endParts = match[3].split(':').map(Number);
      const startSec = startParts[0] * 3600 + startParts[1] * 60 + startParts[2];
      const endSec = endParts[0] * 3600 + endParts[1] * 60 + endParts[2];
      const clipDuration = endSec - startSec;

      // Zoek timestamp waar clip moet beginnen
      const textBefore = script.substring(0, match.index).trim();
      const wordsBeforeMarker = textBefore
        .replace(/\[CLIP:[^\]]*\]/g, '')
        .split(/\s+/)
        .filter((w: string) => w.length > 0)
        .slice(-8)
        .map((w: string) => w.toLowerCase().replace(/[^a-zA-Z0-9'-]/g, ''));

      let bestMatchEnd = 0;
      let bestScore = 0;
      for (let i = 0; i < timestamps.words.length; i++) {
        let score = 0;
        let lastIdx = i;
        for (let j = 0; j < wordsBeforeMarker.length && (i + j) < timestamps.words.length; j++) {
          const tsWord = timestamps.words[i + j].text.toLowerCase().replace(/[^a-zA-Z0-9'-]/g, '');
          if (tsWord === wordsBeforeMarker[j] || tsWord.includes(wordsBeforeMarker[j])) {
            score++;
            lastIdx = i + j;
          }
        }
        if (score >= Math.ceil(wordsBeforeMarker.length * 0.6) && score > bestScore) {
          bestScore = score;
          bestMatchEnd = timestamps.words[lastIdx].end;
        }
      }

      clips.push({
        clip_id: clipId++, url,
        source_start: match[2], source_end: match[3],
        clip_duration: clipDuration,
        voiceover_pause_at: bestMatchEnd,
        timeline_start: bestMatchEnd,
        timeline_end: bestMatchEnd + clipDuration,
      });
    }

    if (clips.length > 0) {
      const clipPositions = {
        clips,
        voiceover_duration: transcript.audio_duration,
        total_duration_with_clips: transcript.audio_duration + clips.reduce((s: number, c: any) => s + c.clip_duration, 0),
      };
      await writeJson(clipPositionsPath, clipPositions);
      console.log('[Timestamps] ' + clips.length + ' clips gevonden en opgeslagen');
      clipCount = clips.length;
    }
  } catch (err: any) {
    console.log('[Timestamps] Clip detectie overgeslagen: ' + err.message);
  }

  console.log('[Timestamps] Klaar! ' + timestamps.words.length + ' woorden, ' + Math.round(transcript.audio_duration) + 's, ' + clipCount + ' clips');

  return {
    timestampsPath,
    wordCount: timestamps.words.length,
    duration: Math.round(transcript.audio_duration * 10) / 10,
    sentenceCount: timestamps.sentences.length,
    clipCount,
    totalDurationWithClips: transcript.audio_duration,
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

  // Lees image selecties (van stap 13)
  let imageSelections: any = { selections: [] };
  try {
    imageSelections = await readJson(selectionsPath);
    console.log('[Step 9] ' + (imageSelections.selections?.length || 0) + ' image selecties geladen');
  } catch {
    throw new Error('image-selections.json niet gevonden. Voer eerst stap 13 (Images Genereren) uit.');
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
