/**
 * Pipeline Service — logica voor elke pipeline stap
 */

import fs from 'fs/promises';
import type { StepLogger } from './pipeline-engine.js';
import path from 'path';
import { fetchTranscriptsBatch } from './youtube.js';
import { llmJsonPrompt, llmSimplePrompt } from './llm.js';
import { generateImages, generateVideos } from './media-generator.js';

const noopLog: StepLogger = async () => {};

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

export async function executeStep1(project: any, youtubeApiKey: string, log: StepLogger = noopLog) {
  const refs: string[] = (project.referenceVideos || []).filter((r: string) => r?.trim());

  if (refs.length === 0) {
    throw new Error('Geen referentie video URLs gevonden. Voeg minimaal 1 (liefst 3) toe.');
  }

  await log(`${refs.length} referentie video(s) gevonden, transcripts ophalen...`);
  const batchResult = await fetchTranscriptsBatch(youtubeApiKey, refs);
  await log(`${batchResult.results.length} transcripts ontvangen, ${batchResult.failures.length} mislukt`);

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

  for (const t of transcripts) {
    await log(`Transcript ${t.index}: "${t.videoTitle}" (${t.wordCount} woorden, ${t.language})`);
  }
  if (batchResult.failures.length > 0) {
    for (const f of batchResult.failures) {
      await log(`Transcript mislukt: ${f.videoId} — ${f.error}`, 'warn');
    }
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

  // ── Check of kanaal een baseStyleProfile heeft ──
  let channelStyleProfile: any = null;
  let channelMaxClipDuration = 15; // default
  if (project.channelId) {
    try {
      const prismaImport = await import('../db.js');
      const prismaClient = prismaImport.default;
      const channel = await prismaClient.channel.findUnique({ where: { id: project.channelId } });
      if (channel?.baseStyleProfile) {
        try {
          channelStyleProfile = JSON.parse(channel.baseStyleProfile);
          console.log(`[Style Profile] Kanaal baseStyleProfile gevonden (${channel.baseStyleProfile.length} chars)`);
        } catch {}
      }
      if (channel?.maxClipDurationSeconds) {
        channelMaxClipDuration = channel.maxClipDurationSeconds;
      }
    } catch {}
  }

  // ── Als kanaal een volledig style profile heeft → gebruik dat direct ──
  if (channelStyleProfile) {
    // Unwrap als het in een wrapper zit (bijv. { script_style_profile: { ... } })
    const profile = channelStyleProfile.script_style_profile || channelStyleProfile;

    // Voeg project-specifieke waarden toe
    const targetWords = project.scriptLength || 5000;
    if (!profile.script_formatting_rules) profile.script_formatting_rules = {};
    profile.script_formatting_rules.total_target_words = targetWords;
    profile._source = 'channel_base_profile';
    profile._maxClipDurationSeconds = channelMaxClipDuration;

    await writeJson(path.join(projPath, 'script', 'style-profile.json'), profile);

    // Update config
    try {
      const configPath = path.join(projPath, 'config.json');
      const config = await readJson(configPath);
      config.visual = config.visual || {};
      config.visual.genre = profile.genre || '';
      config.visual.mood = profile.mood || profile.emotional_tone?.primary || '';
      await writeJson(configPath, config);
    } catch {}

    console.log(`[Style Profile] Kanaal profile gebruikt (${profile.profile_name || 'unnamed'}), target: ${targetWords} woorden, maxClip: ${channelMaxClipDuration}s`);
    return profile;
  }

  // ── Geen kanaal profile → genereer from scratch via LLM ──
  const transcriptTexts: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const filePath = path.join(projPath, 'script', `ref-transcript-${i}.txt`);
    try {
      const text = await readText(filePath);
      if (text.trim()) transcriptTexts.push(text);
    } catch {}
  }

  if (transcriptTexts.length === 0) {
    throw new Error('Geen transcripts gevonden en geen kanaal style profile beschikbaar.');
  }

  // Haal research data op voor context
  let researchContext = '';
  try {
    const research = await readJson(path.join(projPath, 'research', 'research.json'));
    const brief = research.research_brief || research;
    researchContext = `\n\nONDERWERP CONTEXT (uit research):
Titel: ${project.title}
${brief.video_metadata?.topic_one_sentence ? `Kern: ${brief.video_metadata.topic_one_sentence}` : ''}
${brief.video_metadata?.primary_emotion_to_evoke ? `Gewenste emotie: ${brief.video_metadata.primary_emotion_to_evoke}` : ''}
${brief.the_crisis?.crisis_name ? `Crisis: ${brief.the_crisis.crisis_name}` : ''}
${brief.the_crisis?.why_it_matters ? `Belang: ${brief.the_crisis.why_it_matters}` : ''}

Gebruik deze context om de toon, emotie en pacing van het style profile af te stemmen op dit specifieke onderwerp.`;
  } catch {
    console.log('[Style Profile] Geen research.json beschikbaar, profiel alleen op transcripts gebaseerd');
  }

  const userPrompt = `Analyseer deze ${transcriptTexts.length} referentie transcripts en maak een style profile JSON:

${transcriptTexts.map((t, i) => `=== TRANSCRIPT ${i + 1} ===\n${t.slice(0, 10000)}\n`).join('\n')}
${researchContext}

Let op:
- Tel het werkelijke aantal secties in elk transcript
- Neem het gemiddelde als basis
- Bepaal genre en mood
${researchContext ? '- Stem de emotionele toon af op het onderwerp uit de research context' : ''}
- Geef ALLEEN de JSON terug, geen extra tekst`;

  const styleProfile = await llmJsonPrompt(
    llmKeys, STYLE_PROFILE_SYSTEM, userPrompt,
    { maxTokens: 4096, temperature: 0.5 }
  );

  // Bereken sections en avg_words_per_section
  const targetWords = project.scriptLength || 5000;
  const sections = styleProfile.script_formatting_rules?.sections || Math.max(3, Math.round(targetWords / 1200));
  const avgWordsPerSection = Math.round(targetWords / sections);
  if (!styleProfile.script_formatting_rules) styleProfile.script_formatting_rules = {};
  styleProfile.script_formatting_rules.sections = sections;
  styleProfile.script_formatting_rules.avg_words_per_section = avgWordsPerSection;
  styleProfile.script_formatting_rules.total_target_words = targetWords;
  styleProfile._source = 'llm_generated';
  styleProfile._maxClipDurationSeconds = channelMaxClipDuration;
  console.log(`[Style Profile] LLM-gegenereerd, target: ${targetWords} woorden, ${sections} secties x ${avgWordsPerSection} woorden`);

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

KRITISCHE REGELS:
- Volg het style profile 100% — toon, structuur, pacing, devices, clip_blueprint
- Als het style profile een clip_blueprint bevat, volg die EXACT:
  * Respecteer clip taxonomie (OPENER, VALIDATION, FEATURE, FLASH, TRANSITION)
  * Respecteer combo_groups regels (opening combo, max 3 clips per combo)
  * Respecteer placement_rules (spacing, triggers, section_density)
  * Respecteer duration_distribution (varieer clip lengtes volgens de targets)
  * Opening clip protocol: clips openen de video, narrator spreekt NIET eerst
  * Closing clip protocol: narrator krijgt ALTIJD het laatste woord
- GEEN headings, GEEN line breaks (behalve bij [CLIP] markers), GEEN underscores
- Schrijf in de taal die gevraagd wordt
- Houd het ritme strak — korte gesproken zinnen
- Vermijd opvulling en herhaling
- Clip formaat: [CLIP: URL HH:MM:SS - HH:MM:SS]
- Elke [CLIP] marker moet een SPECIFIEKE URL bevatten uit de beschikbare clips lijst
- Clips mogen NOOIT langer zijn dan het opgegeven maximum

OUTPUT: Geef ALLEEN het script terug. Geen inleiding, geen uitleg, alleen het script.`;

export async function executeStep3(project: any, llmKeys: { elevateApiKey?: string; anthropicApiKey?: string }, log: StepLogger = noopLog) {
  const projPath = projectDir(project.name);

  let styleProfile: any;
  try {
    styleProfile = await readJson(path.join(projPath, 'script', 'style-profile.json'));
  } catch {
    throw new Error('Style profile niet gevonden. Voer eerst stap 2 uit.');
  }

  const targetTotalWords = project.scriptLength || 5000;
  const sections = styleProfile.script_formatting_rules?.sections || 8;

  let clipInfo = '';
  const clips = project.referenceClips || [];
  const montageClips = project.montageClips || [];

  // Haal clips-research.json op (stap 4) voor trending clips
  let trendingClips: any[] = [];
  try {
    const clipsResearch = await readJson(path.join(projPath, 'research', 'clips-research.json'));
    trendingClips = (clipsResearch.clips || []).filter((c: any) => c.validated !== false);
  } catch {}

  // Bereken totale clip-duur en trek af van narration target
  const WPM = 150; // woorden per minuut
  let totalClipSeconds = 0;
  const parseTime = (t: string): number => {
    const p = (t || '0:00').split(':').map(Number);
    return p.length === 3 ? p[0]*3600+p[1]*60+p[2] : p.length === 2 ? p[0]*60+p[1] : p[0]||0;
  };
  for (const c of montageClips) {
    if (c.startTime && c.endTime) totalClipSeconds += parseTime(c.endTime) - parseTime(c.startTime);
  }
  for (const c of trendingClips) {
    const start = c.timestamp_start || '00:00';
    const end = c.timestamp_end || '00:15';
    totalClipSeconds += parseTime(end) - parseTime(start);
  }
  const clipMinutes = totalClipSeconds / 60;
  const targetNarrationMinutes = (targetTotalWords / WPM) - clipMinutes;
  const wordCount = Math.max(Math.round(targetNarrationMinutes * WPM), Math.round(targetTotalWords * 0.3)); // minimum 30% narration
  await log(`Script parameters: ${wordCount} narration woorden (target ${targetTotalWords} totaal, ${Math.round(clipMinutes * 10) / 10} min clips afgetrokken), ${sections} secties`);
  const wordsPerSection = Math.round(wordCount / sections);

  // Trending clips altijd meenemen als ze beschikbaar zijn (ongeacht useClips flag)
  const hasAnyClips = clips.length > 0 || montageClips.length > 0 || trendingClips.length > 0;
  if (hasAnyClips) {
    const allClips = [
      ...clips,
      ...montageClips.map((c: any) => `${c.url} ${c.startTime} - ${c.endTime}`),
      ...trendingClips.map((c: any) => `${c.url} (${c.timestamp_start || '00:00'}-${c.timestamp_end || '00:15'}) — ${c.description || c.title || ''}`),
    ];

    clipInfo = `\n\nCLIP INTEGRATIE:
Er moeten [CLIP] markers in het script op plekken waar echte footage het verhaal versterkt.
Beschikbare clips (${allClips.length} stuks):
${allClips.map((c, i) => `  ${i + 1}. ${typeof c === 'string' ? c : JSON.stringify(c)}`).join('\n')}

Formaat: [CLIP: URL HH:MM:SS - HH:MM:SS]
Regels:
- MAXIMALE clip duur: ${styleProfile._maxClipDurationSeconds || 20} seconden per clip — NOOIT langer
- Volg de clip_blueprint uit het style profile als die aanwezig is (clip types, placement, combo groups, density)
- Gebruik de meest impactvolle clips op strategische momenten
- Plaats clips op plekken waar visueel bewijs de tekst versterkt
- De tekst voor en na moet vloeiend aansluiten op de clip
- Varieer clip lengtes (5-${styleProfile._maxClipDurationSeconds || 20}s) voor ritme`;
  }

  const userPrompt = `Schrijf een YouTube script met de volgende specificaties:

STYLE PROFILE:
${JSON.stringify(styleProfile, null, 2)}

ONDERWERP: ${project.title}
${project.description ? `BESCHRIJVING: ${project.description}` : ''}
TAAL: ${project.language === 'NL' ? 'Nederlands' : 'Engels'}
TOTAAL NARRATION WOORDENAANTAL: EXACT ${wordCount} woorden (ABSOLUUT MINIMUM: ${Math.floor(wordCount * 0.9)} woorden, ABSOLUUT MAXIMUM: ${Math.ceil(wordCount * 1.1)} woorden)
BELANGRIJK: Dit is ALLEEN de narration tekst. De [CLIP] markers tellen NIET mee als woorden. De clips duren ~${Math.round(clipMinutes * 10) / 10} minuten, dus de narration moet ~${Math.round(targetNarrationMinutes * 10) / 10} minuten zijn om op ${Math.round(targetTotalWords / WPM)} minuten totaal uit te komen.
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

export async function executeStep6(project: any, llmKeys: { elevateApiKey?: string; anthropicApiKey?: string }, log: StepLogger = noopLog) {
  const projPath = projectDir(project.name);

  // 1. Laad script
  const scriptPath = path.join(projPath, 'script', 'script-voiceover.txt');
  const scriptText = await readText(scriptPath);
  if (!scriptText?.trim()) throw new Error('script-voiceover.txt is leeg of niet gevonden');

  // 2. Laad style preset
  const allStyles2 = await readJson<any[]>(STYLES_PATH);
  const stylePreset = allStyles2.find((s: any) => s.id === project.visualStyle) || {};
  const genre = project.genre || '';
  const mood = project.mood || '';

  // 3. Laad timestamps (woord-level timing van AssemblyAI)
  let timestamps: any = null;
  let audioDuration = 0;
  let wordTimestamps: any[] = [];

  try {
    timestamps = await readJson(path.join(projPath, 'audio', 'timestamps.json'));
    audioDuration = timestamps.duration || timestamps.audio_duration || 0;
    wordTimestamps = timestamps.words || timestamps.word_timestamps || [];
  } catch {
    console.warn('[Step 6] Geen timestamps gevonden');
  }

  if (wordTimestamps.length === 0) {
    throw new Error('Geen word-level timestamps beschikbaar. Voer eerst stap 9 (Timestamps) uit.');
  }

  console.log(`[Step 6] Audio: ${audioDuration}s, ${wordTimestamps.length} woorden`);

  // ────────────────────────────────────────────────────────
  // STAP A: Deterministische scene splitsing (3-5 seconden)
  // ────────────────────────────────────────────────────────
  const scenes: Array<{
    id: number;
    start: number;
    end: number;
    duration: number;
    text: string;
  }> = [];

  let currentWords: any[] = [];
  let sceneStart = 0;
  let sceneId = 1;

  const SCENE_MIN = 3.0;
  const SCENE_MAX = 6.0;
  const SCENE_TARGET = 5.0;

  // Normaliseer word timestamps (ms → sec als nodig)
  const words = wordTimestamps.map((w: any) => ({
    text: w.text || w.word || '',
    start: (w.start || w.start_time || 0) > 1000 ? (w.start || w.start_time || 0) / 1000 : (w.start || w.start_time || 0),
    end: (w.end || w.end_time || 0) > 1000 ? (w.end || w.end_time || 0) / 1000 : (w.end || w.end_time || 0),
    confidence: w.confidence || 1,
  }));

  sceneStart = words[0]?.start || 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    currentWords.push(word);

    const sceneEnd = word.end;
    const sceneDuration = sceneEnd - sceneStart;
    const isLastWord = i === words.length - 1;

    let shouldBreak = false;

    if (isLastWord) {
      shouldBreak = true;
    } else if (sceneDuration >= SCENE_MAX) {
      shouldBreak = true;
    } else if (sceneDuration >= SCENE_MIN) {
      const wordText = word.text.trim();
      const endsWithPeriod = /[.!?]$/.test(wordText);
      const endsWithComma = /[,;:]$/.test(wordText);
      const nextWord = words[i + 1];
      const gap = nextWord ? nextWord.start - word.end : 0;
      const hasNaturalPause = gap > 0.3;

      if (endsWithPeriod) {
        shouldBreak = true;
      } else if (sceneDuration >= SCENE_TARGET && (endsWithComma || hasNaturalPause)) {
        shouldBreak = true;
      } else if (sceneDuration >= SCENE_TARGET + 1) {
        const clauseBreaks = ['and', 'but', 'or', 'so', 'then', 'when', 'while', 'because', 'which', 'where', 'that'];
        if (nextWord && clauseBreaks.includes(nextWord.text.toLowerCase())) {
          shouldBreak = true;
        }
      }
    }

    if (shouldBreak && currentWords.length > 0) {
      const sceneText = currentWords.map(w => w.text).join(' ');
      const sceneEndTime = currentWords[currentWords.length - 1].end;
      const duration = sceneEndTime - sceneStart;

      if (duration < SCENE_MIN && !isLastWord) {
        continue;
      }

      scenes.push({
        id: sceneId++,
        start: Math.round(sceneStart * 100) / 100,
        end: Math.round(sceneEndTime * 100) / 100,
        duration: Math.round(duration * 100) / 100,
        text: sceneText,
      });

      currentWords = [];
      sceneStart = words[i + 1]?.start || sceneEndTime;
    }
  }

  // Merge resterende woorden met laatste scene
  if (currentWords.length > 0 && scenes.length > 0) {
    const lastScene = scenes[scenes.length - 1];
    const extraText = currentWords.map(w => w.text).join(' ');
    lastScene.text += ' ' + extraText;
    lastScene.end = currentWords[currentWords.length - 1].end;
    lastScene.duration = Math.round((lastScene.end - lastScene.start) * 100) / 100;
  }

  // Fix scene durations: sluit pauzes in zodat video sync met audio
  // Elke scene duurt tot de start van de volgende scene
  for (let i = 0; i < scenes.length - 1; i++) {
    const nextStart = scenes[i + 1].start;
    scenes[i].end = nextStart;
    scenes[i].duration = Math.round((nextStart - scenes[i].start) * 100) / 100;
  }
  // Laatste scene: duur tot einde audio
  if (scenes.length > 0) {
    const lastScene = scenes[scenes.length - 1];
    lastScene.end = Math.round(audioDuration * 100) / 100;
    lastScene.duration = Math.round((lastScene.end - lastScene.start) * 100) / 100;
  }

  const totalSceneDur = scenes.reduce((sum, s) => sum + s.duration, 0);
  console.log(`[Step 6] ${scenes.length} scenes gesplitst, totale duur: ${totalSceneDur.toFixed(1)}s (audio: ${audioDuration}s)`);

  // ────────────────────────────────────────────────────────
  // STAP B: Batch scenes per ~200-250 woorden script
  // ────────────────────────────────────────────────────────
  const WORDS_PER_BATCH = 225; // ~200-250 woorden per LLM call
  const batches: typeof scenes[] = [];
  let currentBatch: typeof scenes = [];
  let batchWordCount = 0;

  for (const scene of scenes) {
    const sceneWordCount = scene.text.split(/\s+/).length;

    if (batchWordCount > 0 && batchWordCount + sceneWordCount > WORDS_PER_BATCH) {
      batches.push(currentBatch);
      currentBatch = [];
      batchWordCount = 0;
    }

    currentBatch.push(scene);
    batchWordCount += sceneWordCount;
  }
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  console.log(`[Step 6] ${batches.length} batches (gem. ~${WORDS_PER_BATCH} woorden per batch)`);

  // ────────────────────────────────────────────────────────
  // STAP C: LLM prompts per batch (parallel)
  // ────────────────────────────────────────────────────────
  const styleBlock = [
    `- Prefix (begin van elke prompt): ${stylePreset.style_prefix || ''}`,
    `- Suffix (eind van elke prompt): ${stylePreset.style_suffix || ''}`,
    `- Character beschrijving: ${stylePreset.character_description || ''}`,
    genre ? `- Genre: ${genre}` : '',
    mood ? `- Mood: ${mood}` : '',
  ].filter(Boolean).join('\n');

  const PROMPT_SYSTEM = `Je bent een ervaren visuele regisseur die scene prompts maakt voor AI video generatie.
Je werkt met image-to-video technologie: eerst wordt een stilstaand beeld gegenereerd, daarna wordt dat beeld geanimeerd tot een video.

JE MAAKT PER SCENE:
1. visual_prompt = het STARTBEELD (frame 1 van de video). Beschrijf wat je ziet als je de video pauzeert op het allereerste moment. Dit is een stilstaand beeld, GEEN actie beschrijven hier.
2. video_prompt = de ACTIE die vervolgens plaatsvindt. Beschrijf wat er GEBEURT: bewegingen, veranderingen, acties. Dit stuurt de animatie aan.
3. visual_prompt_variants = 3 VERSCHILLENDE perspectieven van hetzelfde startmoment (close-up, wide shot, creatief)

VOORBEELD:
Script: "De detective loopt door de verlaten straat in de regen"
- visual_prompt: "Een detective in een lange jas staat aan het begin van een verlaten stadsstraat. Natte straatstenen reflecteren neonlicht. Regen hangt bevroren in de lucht. Camera op ooghoogte."
- video_prompt: "De detective begint te lopen, zijn jas wappert. Regendruppels vallen. Camera volgt hem langzaam van achteren terwijl hij de straat in loopt."

REGELS:
- visual_prompt: ALTIJD beginnen met de style prefix, eindigen met de style suffix
- visual_prompt: Beschrijf het MOMENT NET VOOR de actie begint
- video_prompt: Beschrijf de BEWEGING en ACTIE die volgt op het startbeeld
- video_prompt: Kort en concreet (1-2 zinnen), focus op wat er beweegt/verandert
- Match de sfeer/emotie PRECIES met de tekst die wordt uitgesproken
- De visual_prompt en video_prompt moeten SAMEN het verhaal van de scene vertellen
- 3 varianten moeten ECHT ANDERS zijn qua camerahoek/perspectief, maar dezelfde actie beschrijven
- NOOIT tekst, letters, woorden of nummers in het beeld
- NOOIT pratende/sprekende karakters beschrijven`;

  const batchPromises = batches.map(async (batch, batchIndex) => {
    const scenesForPrompt = batch.map((scene) => {
      const globalIdx = scenes.findIndex(s => s.id === scene.id);
      const prevScene = globalIdx > 0 ? scenes[globalIdx - 1] : null;
      const nextScene = globalIdx < scenes.length - 1 ? scenes[globalIdx + 1] : null;

      return {
        scene_number: scene.id,
        scene_text: scene.text,
        duration: scene.duration,
        previous_context: prevScene ? prevScene.text : '(opening van de video)',
        next_context: nextScene ? nextScene.text : '(einde van de video)',
      };
    });

    const batchPrompt = [
      `Genereer visuele prompts voor ${batch.length} scenes.`,
      '',
      'STIJL:',
      styleBlock,
      '',
      'SCENES:',
      JSON.stringify(scenesForPrompt, null, 2),
      '',
      'PER SCENE LEVEREN:',
      '- visual_prompt: het STARTBEELD — wat je ziet als je frame 1 pauzeert (start met style prefix, eindig met suffix)',
      '- visual_prompt_variants: array van 3 VERSCHILLENDE perspectieven van hetzelfde startmoment',
      '- video_prompt: de ACTIE die volgt — wat er GEBEURT/BEWEEGT in de scene (1-2 zinnen)',
      '- camera_movement: camerabewegingen (bijv. "slow pan right", "tracking shot")',
      '- mood: sfeer/emotie van de scene',
      '',
      'ANTWOORD — ALLEEN JSON:',
      '{"scenes": [{"id": 1, "visual_prompt": "...", "visual_prompt_variants": ["...", "...", "..."], "video_prompt": "...", "camera_movement": "...", "mood": "..."}]}',
    ].join('\n');

    try {
      const result = await llmJsonPrompt<{ scenes: any[] }>(
        llmKeys, PROMPT_SYSTEM, batchPrompt,
        { maxTokens: 16000, temperature: 0.7 }
      );
      console.log(`[Step 6] Batch ${batchIndex + 1}/${batches.length}: ${(result.scenes || []).length} prompts`);
      return { batchIndex, scenes: result.scenes || [] };
    } catch (error: any) {
      console.error(`[Step 6] Batch ${batchIndex + 1} gefaald: ${error.message}`);
      return { batchIndex, scenes: [] };
    }
  });

  const batchResults = await Promise.all(batchPromises);
  batchResults.sort((a, b) => a.batchIndex - b.batchIndex);

  // ────────────────────────────────────────────────────────
  // STAP D: Combineer deterministische timing + LLM prompts
  // ────────────────────────────────────────────────────────
  const allPromptResults: any[] = [];
  for (const batch of batchResults) {
    allPromptResults.push(...batch.scenes);
  }

  const finalScenes: any[] = [];
  let promptIdx = 0;

  for (const scene of scenes) {
    const llmScene = allPromptResults.find((p: any) => p.id === scene.id)
      || allPromptResults[promptIdx];
    promptIdx++;

    finalScenes.push({
      id: scene.id,
      start: scene.start,
      end: scene.end,
      duration: scene.duration,
      text: scene.text,
      type: 'ai_video',
      asset_type: 'ai_video',
      visual_prompt: llmScene?.visual_prompt || `${stylePreset.style_prefix || ''} Scene depicting: ${scene.text}. ${stylePreset.style_suffix || ''}`,
      visual_prompt_variants: llmScene?.visual_prompt_variants || [],
      video_prompt: llmScene?.video_prompt || '',
      camera_movement: llmScene?.camera_movement || 'slow pan',
      mood: llmScene?.mood || mood || 'neutral',
    });
  }

  // Statistieken
  const totalDuration = finalScenes.reduce((sum: number, s: any) => sum + (s.duration || 0), 0);
  const avgDuration = finalScenes.length > 0 ? totalDuration / finalScenes.length : 0;
  const withPrompts = finalScenes.filter((s: any) => s.visual_prompt_variants?.length >= 3).length;

  console.log(`[Step 6] Klaar! ${finalScenes.length} scenes, ${totalDuration.toFixed(1)}s totaal (audio: ${audioDuration}s)`);
  console.log(`[Step 6] ${withPrompts}/${finalScenes.length} scenes met 3 prompt varianten`);

  if (Math.abs(totalDuration - audioDuration) > 10 && audioDuration > 0) {
    console.warn(`[Step 6] ⚠️ Scene totaal (${totalDuration.toFixed(1)}s) wijkt af van audio (${audioDuration}s)`);
  }

  const outputPath = path.join(projPath, 'assets', 'scene-prompts.json');
  await writeJson(outputPath, {
    project: project.name, style: project.visualStyle, genre, mood,
    audio_duration: audioDuration,
    total_scenes: finalScenes.length, ai_video_scenes: finalScenes.length,
    clip_scenes: 0, real_image_scenes: 0,
    avg_scene_duration: Math.round(avgDuration * 10) / 10, scenes: finalScenes,
  });

  return {
    totalScenes: finalScenes.length, aiVideoScenes: finalScenes.length, clipScenes: 0, realImageScenes: 0,
    avgDuration: Math.round(avgDuration * 10) / 10, filePath: outputPath,
    audioDuration,
    typeCounts: { ai_video: finalScenes.length, clip: 0, real_image: 0 },
    preview: finalScenes.slice(0, 3),
  };
}


// ── Stap 13: Images Genereren (via N8N) ──

// ── Stap 13: Images Genereren (direct API) ──

export async function executeStep6b(project: any, settings: any, log: StepLogger = noopLog) {
  const projPath = projectDir(project.name);
  const scenePromptsPath = path.join(projPath, 'assets', 'scene-prompts.json');

  let scenePrompts: any;
  try {
    scenePrompts = await readJson(scenePromptsPath);
  } catch {
    throw new Error('scene-prompts.json niet gevonden. Voer eerst stap 10 uit.');
  }

  const aiScenes = (scenePrompts.scenes || []).filter(
    (s: any) => (s.asset_type === 'ai_video' || s.type === 'ai_video')
      && (s.visual_prompt_variants?.length > 0 || s.visual_prompt)
  );

  if (aiScenes.length === 0) {
    console.log('[Step 13] Geen ai_video scenes gevonden');
    return { skipped: true, reason: 'Geen scenes met visual prompts' };
  }

  console.log(`[Step 13] ${aiScenes.length} images genereren via directe API...`);

  const mediaSettings = {
    elevateApiKey: settings.elevateApiKey || '',
    genaiProApiKey: settings.genaiProApiKey || '',
    genaiProEnabled: settings.genaiProEnabled || false,
    genaiProImagesEnabled: settings.genaiProImagesEnabled || false,
  };

  const results = await generateImages(
    aiScenes,
    projPath,
    mediaSettings,
    async (done, total, sceneId) => {
      console.log(`[Step 13] Voortgang: ${done}/${total} (scene ${sceneId})`);
      if (done % 10 === 0 || done === total) {
        try {
          const prisma = (await import('../db.js')).default;
          await prisma.logEntry.create({ data: {
            projectId: project.id, level: 'info', step: 13,
            source: 'Elevate', message: `Images: ${done}/${total} klaar`,
            timestamp: new Date(),
          }});
        } catch {}
      }
    }
  );

  const selections = results.map(r => ({
    scene_id: r.sceneId,
    chosen_option: 1,
    chosen_path: r.localPath,
    chosen_url: r.imageUrl,
    provider: r.provider,
    prompt: r.prompt,
  }));

  await writeJson(
    path.join(projPath, 'assets', 'image-selections.json'),
    {
      project: project.name,
      saved_at: new Date().toISOString(),
      auto_selected: true,
      total_selections: selections.length,
      selections,
    }
  );

  console.log(`[Step 13] Klaar! ${results.length}/${aiScenes.length} images gegenereerd`);

  if (results.length === 0 && aiScenes.length > 0) {
    throw new Error('Alle scenes mislukt. Geen images gegenereerd.');
  }

  return {
    totalScenes: aiScenes.length,
    generated: results.length,
    failed: aiScenes.length - results.length,
    autoSelected: true,
  };
}

// ── Stap 4: Voiceover genereren (direct Elevate TTS API) ──

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
    console.warn('[Step 8] Voice "' + voiceName + '" niet gevonden, fallback naar eerste voice');
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
      if (content.status === 'failed') throw new Error(content.error || 'Workflow failed');
    } catch (e: any) {
      if (e.message && !e.message.includes('ENOENT') && !e.message.includes('Unexpected')) {
        throw e;
      }
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error('Timeout: status.json niet gevonden of niet voltooid binnen de tijdslimiet');
}

/**
 * Elevate TTS API — directe aanroep zonder N8N
 * POST /v2/media → type: "tts" → poll tot completed → download result_url
 */
async function elevateTTS(params: {
  apiKey: string;
  text: string;
  voiceId: string;
  outputPath: string;
  stability?: number;
  similarityBoost?: number;
  speed?: number;
}): Promise<{ duration: number; fileSizeKb: number }> {
  const ELEVATE_BASE = 'https://public-api.elevate.uno';
  const headers = {
    'Authorization': `Bearer ${params.apiKey}`,
    'Content-Type': 'application/json',
  };

  // 1. Maak TTS task aan
  console.log(`[TTS] Elevate TTS starten (${params.text.split(/\s+/).length} woorden)...`);
  const createResponse = await fetch(`${ELEVATE_BASE}/v2/media`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: 'tts',
      prompt: params.text,
      voice_id: params.voiceId,
      model_id: 'eleven_turbo_v2_5',
      stability: params.stability ?? 0.5,
      similarity_boost: params.similarityBoost ?? 0.75,
      speed: params.speed ?? 1.0,
    }),
  });

  if (!createResponse.ok) {
    const errText = await createResponse.text();
    throw new Error(`Elevate TTS fout (${createResponse.status}): ${errText.slice(0, 300)}`);
  }

  const createData = await createResponse.json();
  console.log(`[TTS] API response:`, JSON.stringify(createData).slice(0, 500));
  if (!createData.success || !createData.data?.id) {
    throw new Error(`Elevate TTS: geen task ID ontvangen. Response: ${JSON.stringify(createData).slice(0, 300)}`);
  }

  const taskId = createData.data.id;
  console.log(`[TTS] Task aangemaakt: ${taskId}`);

  // 2. Poll tot completed (max 5 minuten)
  const startTime = Date.now();
  const timeout = 300_000;
  const pollInterval = 5_000;

  while (Date.now() - startTime < timeout) {
    await new Promise(r => setTimeout(r, pollInterval));

    const statusResponse = await fetch(`${ELEVATE_BASE}/v2/media/${taskId}?type=tts`, { headers });
    if (!statusResponse.ok) continue;

    const statusData = await statusResponse.json();
    const status = statusData.data?.status;

    if (status === 'completed' && statusData.data?.result_url) {
      const resultUrl = statusData.data.result_url;
      console.log(`[TTS] Klaar! Downloaden van ${resultUrl.slice(0, 60)}...`);

      // 3. Download het audiobestand
      const audioResponse = await fetch(resultUrl);
      if (!audioResponse.ok) throw new Error(`Audio download mislukt: ${audioResponse.status}`);

      const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
      const fsImport = await import('fs/promises');
      const pathImport = await import('path');
      await fsImport.mkdir(pathImport.dirname(params.outputPath), { recursive: true });
      await fsImport.writeFile(params.outputPath, audioBuffer);

      const fileSizeKb = Math.round(audioBuffer.length / 1024);

      // 4. Haal duur op via ffprobe
      let duration = 0;
      try {
        const { execSync } = await import('child_process');
        const probeOutput = execSync(
          `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${params.outputPath}"`,
          { encoding: 'utf-8', timeout: 10_000 }
        ).trim();
        duration = parseFloat(probeOutput) || 0;
      } catch {}

      console.log(`[TTS] Opgeslagen: ${params.outputPath} (${fileSizeKb} KB, ${duration.toFixed(1)}s)`);
      return { duration, fileSizeKb };
    }

    if (status === 'failed') {
      throw new Error(`Elevate TTS mislukt: ${statusData.data?.error || 'onbekend'}`);
    }

    // Nog bezig (queued, processing)
  }

  throw new Error('Elevate TTS timeout (5 minuten)');
}

export async function executeStep4(project: any, settings: any, log: StepLogger = noopLog) {
  const projPath = projectDir(project.name);
  const scriptVoiceoverPath = path.join(projPath, 'script', 'script-voiceover.txt');
  const outputPath = path.join(projPath, 'audio', 'voiceover.mp3');

  // Check of schoon script bestaat, zo niet: maak het aan
  let scriptText: string;
  try {
    scriptText = await readText(scriptVoiceoverPath);
    if (!scriptText.trim()) throw new Error('Bestand is leeg');
  } catch {
    console.log('[Step 8] script-voiceover.txt niet gevonden, maak aan vanuit script.txt...');
    const scriptPath = path.join(projPath, 'script', 'script.txt');
    const script = await readText(scriptPath);
    scriptText = script.replace(/\[CLIP:.*?\]\n?/g, '').replace(/\n{3,}/g, '\n\n').trim();
    await writeText(scriptVoiceoverPath, scriptText);
  }

  // Zoek voice_id op
  const voice = await resolveVoiceId(project.voice);
  console.log('[Step 8] Voice: ' + voice.name + ' (' + voice.voice_id + ')');
  await log(`Voice geselecteerd: ${voice.name} (${voice.voice_id})`);
  await log(`Script: ${scriptText.split(/\s+/).length} woorden`);

  // Zorg dat audio dir bestaat
  await ensureDir(path.join(projPath, 'audio'));

  // Verwijder oude audio
  try { await fs.unlink(outputPath); } catch {}

  // Check API key
  if (!settings.elevateApiKey) {
    throw new Error('Elevate API key niet geconfigureerd in Settings. Nodig voor TTS.');
  }

  // Direct Elevate TTS API call
  const result = await elevateTTS({
    apiKey: settings.elevateApiKey,
    text: scriptText,
    voiceId: voice.voice_id,
    outputPath,
    stability: 0.5,
    similarityBoost: 0.75,
    speed: 1.0,
  });

  console.log(`[Step 8] Voiceover klaar! ${result.fileSizeKb} KB, ${result.duration.toFixed(1)}s`);
  await log(`Voiceover klaar: ${result.fileSizeKb} KB, ${result.duration.toFixed(1)}s`);

  return {
    audioPath: outputPath,
    fileSizeKb: result.fileSizeKb,
    duration: result.duration,
    voiceName: voice.name,
    voiceId: voice.voice_id,
  };
}

// ── Stap 5: Timestamps genereren (via N8N) ──

export async function executeStep5(project: any, settings: any, log: StepLogger = noopLog) {
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
    // Ondersteun zowel MM:SS als HH:MM:SS formaten
    const clipRegex = /\[CLIP:\s*(https?:\/\/\S+)\s+([\d:]+)\s*-\s*([\d:]+)\s*\]/g;
    const clips: any[] = [];
    let match;
    let clipId = 1;

    while ((match = clipRegex.exec(script)) !== null) {
      const url = match[1];
      const parseTime = (t: string): number => {
        const parts = t.split(':').map(Number);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return parts[0];
      };
      const startSec = parseTime(match[2]);
      const endSec = parseTime(match[3]);
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

  // Stap 12 draait NIET bij AI type — die gebruikt stap 14+15
  const videoType = (project.videoType || project.type || '').toLowerCase();
  const aiTypes = ['ai', 'ai-generated', 'ai_generated'];
  if (aiTypes.includes(videoType)) {
    console.log(`[Step 12] Video type "${videoType}" is AI — stap overgeslagen (gebruikt stap 14+15)`);
    return { skipped: true, reason: `Video type "${videoType}" gebruikt AI-generatie (stap 14+15), niet B-roll` };
  }

  // Check of timestamps bestaan (vereist)
  const timestampsPath = path.join(projPath, 'audio', 'timestamps.json');
  try {
    await fs.access(timestampsPath);
  } catch {
    throw new Error('timestamps.json niet gevonden — stap 10 moet eerst voltooid zijn');
  }

  // Haal kanaal naam op voor TwelveLabs index
  let channelName: string | undefined;
  try {
    const projectData = await readJson<any>(path.join(projPath, 'project.json'));
    channelName = projectData.channelName || projectData.channel_name;
  } catch {}

  // Import en run de B-Roll pipeline
  const { executeAssetSearch } = await import('./asset-search.js');

  const plan = await executeAssetSearch({
    projectDir: projPath,
    projectName: project.name,
    channelName,
    settings,
    videoType,
  });

  // Bewaar ook asset-map.json voor backwards compatibility met andere stappen
  const assetMap = {
    scenes: plan.segments.map(s => ({
      scene_id: s.id,
      asset_path: s.file_path,
      source: s.source,
      asset_clip_id: s.asset_clip_id || null,
      quality_score: s.twelve_labs_score || null,
      is_video: s.asset_type === 'video',
    })),
  };
  await writeJson(path.join(projPath, 'assets', 'asset-map.json'), assetMap);

  return {
    skipped: false,
    totalSegments: plan.stats.total_segments,
    fromDatabase: plan.stats.from_database,
    fromTwelveLabs: plan.stats.from_twelve_labs,
    fromKeySource: plan.stats.from_key_source,
    fromYouTube: plan.stats.from_youtube,
    fromNewsImage: plan.stats.from_news_image,
    skipped: plan.stats.skipped,
    totalTimeMs: plan.stats.total_time_ms,
    clipGaps: plan.clip_gaps.length,
    keySources: plan.key_sources.length,
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


// ── Stap 8: YouTube clips downloaden via video-download-api ──

export async function executeStep8(project: any, settings: any) {
  const projPath = projectDir(project.name);
  const clipsDir = path.join(projPath, 'assets', 'clips');
  await ensureDir(clipsDir);

  if (!project.useClips) {
    console.log('[Step 13] Clips niet ingeschakeld — stap overgeslagen');
    return { skipped: true, reason: 'YouTube clips zijn niet ingeschakeld voor dit project' };
  }

  let clips: any[] = [];
  const clipPositionsPath = path.join(projPath, 'audio', 'clip-positions.json');
  try {
    const clipData = await readJson<any>(clipPositionsPath);
    clips = clipData.clips || clipData || [];
    if (!Array.isArray(clips)) clips = [];
  } catch {
    console.log('[Step 13] clip-positions.json niet gevonden, check scene-prompts.json...');
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
    console.log('[Step 13] Geen clips gevonden — stap overgeslagen');
    return { skipped: true, reason: 'Geen clips gevonden in clip-positions.json of scene-prompts.json' };
  }

  clips = clips.map((c: any, i: number) => ({
    clip_id: c.clip_id || i + 1,
    url: c.url || c.source_url || '',
    source_start: c.source_start || c.start || '00:00',
    source_end: c.source_end || c.end || '00:10',
    clip_duration: c.clip_duration || 0,
  }));

  const apiKey = settings.videoDownloadApiKey;
  if (!apiKey) {
    throw new Error('videoDownloadApiKey niet ingesteld in Settings — kan geen clips downloaden');
  }

  const VIDEO_DOWNLOAD_API_BASE = 'https://p.lbserver.xyz';
  console.log(`[Step 13] ${clips.length} clips downloaden via video-download-api...`);

  const results: Array<{ clip_id: number; success: boolean; path?: string; error?: string }> = [];

  // Download clips parallel (max 5 tegelijk)
  const PARALLEL_LIMIT = 5;
  let nextIdx = 0;

  async function downloadWorker() {
    while (nextIdx < clips.length) {
      const idx = nextIdx++;
      const clip = clips[idx];
      const clipId = clip.clip_id;

      if (!clip.url || !clip.url.includes('youtube.com') && !clip.url.includes('youtu.be')) {
        console.log(`[Step 13] Clip ${clipId}: geen geldige YouTube URL — skip`);
        results[idx] = { clip_id: clipId, success: false, error: 'Geen geldige YouTube URL' };
        continue;
      }

      try {
        // Parse start/end tijden naar seconden
        const startSec = parseTimeToSeconds(clip.source_start);
        const endSec = parseTimeToSeconds(clip.source_end);

        const encodedUrl = encodeURIComponent(clip.url);
        let apiUrl = `${VIDEO_DOWNLOAD_API_BASE}/ajax/download.php?format=1080&url=${encodedUrl}&apikey=${apiKey}`;
        
        // Voeg start/end toe als ze zinvol zijn
        if (startSec > 0 || endSec > 0) {
          if (startSec > 0) apiUrl += `&start_time=${startSec}`;
          if (endSec > startSec) apiUrl += `&end_time=${endSec}`;
        }

        console.log(`[Step 13] Clip ${clipId}: downloading ${clip.url} (${clip.source_start} - ${clip.source_end})...`);

        const response = await fetch(apiUrl, {
          signal: AbortSignal.timeout(120_000), // 2 min timeout per clip
        });

        if (!response.ok) {
          throw new Error(`API fout ${response.status}`);
        }

        const data = await response.json();
        if (!data.success || !data.content) {
          throw new Error('API response niet succesvol');
        }

        // Decodeer base64 content om download URL te vinden
        const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
        const urlMatch = decoded.match(/href="([^"]+)"/i) || decoded.match(/(https?:\/\/[^\s"'<>]+)/i);

        if (!urlMatch?.[1]) {
          throw new Error('Geen download URL gevonden in API response');
        }

        const downloadUrl = urlMatch[1];
        const outputPath = path.join(clipsDir, `clip-${String(clipId).padStart(3, '0')}.mp4`);

        // Download het videobestand
        const videoResponse = await fetch(downloadUrl, {
          signal: AbortSignal.timeout(300_000), // 5 min timeout voor grote clips
        });

        if (!videoResponse.ok) {
          throw new Error(`Video download mislukt: ${videoResponse.status}`);
        }

        const arrayBuffer = await videoResponse.arrayBuffer();
        const videoBuffer = Buffer.from(arrayBuffer);

        if (videoBuffer.length < 10_000) {
          throw new Error(`Gedownload bestand te klein (${videoBuffer.length} bytes)`);
        }

        await fs.writeFile(outputPath, videoBuffer);
        console.log(`[Step 13] ✓ Clip ${clipId} gedownload (${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB)`);

        results[idx] = { clip_id: clipId, success: true, path: outputPath };
      } catch (error: any) {
        console.log(`[Step 13] ✗ Clip ${clipId} mislukt: ${error.message}`);
        results[idx] = { clip_id: clipId, success: false, error: error.message };
      }
    }
  }

  const workers = Array.from({ length: Math.min(PARALLEL_LIMIT, clips.length) }, () => downloadWorker());
  await Promise.all(workers);

  // Schrijf status bestand voor backwards compatibility
  const downloaded = results.filter(r => r?.success).length;
  const failed = results.filter(r => r && !r.success).length;

  const statusData = {
    status: 'completed',
    clips_downloaded: downloaded,
    clips_failed: failed,
    total_clips: clips.length,
    results: results.filter(r => r != null),
  };

  await writeJson(path.join(projPath, 'assets', 'clips-status.json'), statusData);

  console.log(`[Step 13] Klaar! ${downloaded}/${clips.length} clips gedownload, ${failed} mislukt`);

  if (downloaded === 0 && clips.length > 0) {
    throw new Error(`Alle ${clips.length} clips mislukt bij downloaden`);
  }

  return {
    skipped: false,
    clipsDownloaded: downloaded,
    clipsFailed: failed,
    totalClips: clips.length,
    results: results.filter(r => r != null),
  };
}

/** Parse tijdstring (MM:SS of HH:MM:SS of seconden) naar seconden */
function parseTimeToSeconds(timeStr: string | number): number {
  if (typeof timeStr === 'number') return timeStr;
  if (!timeStr) return 0;
  
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(timeStr) || 0;
}


// ── Stap 9: Video scenes genereren (VEO 3 image-to-video) via N8N ──

// ── Stap 14: Video Scenes Genereren (direct API) ──

export async function executeStep9(project: any, settings: any, log: StepLogger = noopLog) {
  const projPath = projectDir(project.name);
  const scenePromptsPath = path.join(projPath, 'assets', 'scene-prompts.json');
  const selectionsPath = path.join(projPath, 'assets', 'image-selections.json');

  let scenePrompts: any;
  try {
    scenePrompts = await readJson(scenePromptsPath);
  } catch {
    throw new Error('scene-prompts.json niet gevonden.');
  }

  let imageSelections: any = { selections: [] };
  try {
    imageSelections = await readJson(selectionsPath);
  } catch {
    console.log('[Step 14] Geen image selecties gevonden — text-to-video mode');
  }

  const aiScenes = (scenePrompts.scenes || []).filter(
    (s: any) => s.asset_type === 'ai_video' || s.type === 'ai_video'
  );

  if (aiScenes.length === 0) {
    return { skipped: true, reason: 'Geen ai_video scenes' };
  }

  console.log(`[Step 14] ${aiScenes.length} video scenes genereren via directe API...`);

  const mediaSettings = {
    elevateApiKey: settings.elevateApiKey || '',
    genaiProApiKey: settings.genaiProApiKey || '',
    genaiProEnabled: settings.genaiProEnabled || false,
    genaiProImagesEnabled: settings.genaiProImagesEnabled || false,
  };

  const results = await generateVideos(
    aiScenes,
    imageSelections.selections || [],
    projPath,
    mediaSettings,
    async (done, total, sceneId) => {
      console.log(`[Step 14] Voortgang: ${done}/${total} (scene ${sceneId})`);
      if (done % 5 === 0 || done === total) {
        try {
          const prisma = (await import('../db.js')).default;
          await prisma.logEntry.create({ data: {
            projectId: project.id, level: 'info', step: 14,
            source: 'Elevate', message: `Videos: ${done}/${total} klaar`,
            timestamp: new Date(),
          }});
        } catch {}
      }
    }
  );

  await writeJson(
    path.join(projPath, 'assets', 'scenes', 'video-results.json'),
    { results, generated_at: new Date().toISOString() }
  );

  console.log(`[Step 14] Klaar! ${results.length}/${aiScenes.length} videos gegenereerd`);

  if (results.length === 0 && aiScenes.length > 0) {
    throw new Error('Alle video scenes mislukt.');
  }

  return {
    totalScenes: aiScenes.length,
    generated: results.length,
    failed: aiScenes.length - results.length,
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
// STAP 13: FINAL EXPORT (Direct FFmpeg, geen N8N)
// ============================================================

export async function executeStep13(project: any, settings: any) {
  const projPath = projectDir(project.name);
  const { execSync } = await import('child_process');

  console.log('[Final Export] Gestart...');

  // 1. Laad scene data
  const scenePrompts = await readJson<any>(path.join(projPath, 'assets', 'scene-prompts.json'));
  const scenes = scenePrompts.scenes || [];
  const audioPath = path.join(projPath, 'audio', 'voiceover.mp3');
  const editDir = path.join(projPath, 'edit');
  await fs.mkdir(editDir, { recursive: true });

  // 2. Project settings
  const transitionType = project.uniformTransition || 'crossfade';
  const crossfadeDuration = transitionType === 'crossfade' ? 0.5 : 0;
  const resolution = '1920:1080';
  const fps = 30;

  console.log('[Final Export] ' + scenes.length + ' scenes, transitie: ' + transitionType);

  // 3. Prepareer clips — trim en schaal naar 1080p
  const preparedDir = path.join(editDir, 'prepared-clips');
  await fs.mkdir(preparedDir, { recursive: true });

  const scenesDir = path.join(projPath, 'assets', 'scenes');
  const preparedClips: string[] = [];
  const clipDurations: number[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const videoPath = path.join(scenesDir, 'scene' + scene.id + '.mp4');
    const outClip = path.join(preparedDir, 'clip' + String(i).padStart(4, '0') + '.mp4');

    try {
      await fs.access(videoPath);
    } catch {
      console.warn('[Final Export] Scene ' + scene.id + ': geen video, overgeslagen');
      continue;
    }

    try {
      // Clip duur: +crossfade voor overlap, BEHALVE laatste clip
      const baseDur = scene.duration || 5;
      const isLastClip = i === scenes.length - 1;
      const dur = (crossfadeDuration > 0 && !isLastClip) ? baseDur + crossfadeDuration : baseDur;
      execSync(
        'ffmpeg -y -i "' + videoPath + '"' +
        ' -t ' + dur +
        ' -vf "scale=' + resolution + ':force_original_aspect_ratio=decrease,pad=' + resolution + ':(ow-iw)/2:(oh-ih)/2:black,fps=' + fps + '"' +
        ' -c:v libx264 -preset fast -crf 23 -an -movflags +faststart' +
        ' "' + outClip + '"',
        { timeout: 120000, stdio: 'pipe' }
      );
      preparedClips.push(outClip);
      clipDurations.push(dur);
    } catch (err: any) {
      console.error('[Final Export] Scene ' + scene.id + ' clip prep mislukt: ' + (err.message || '').slice(0, 200));
    }

    if ((i + 1) % 25 === 0 || i === scenes.length - 1) {
      console.log('[Final Export] Clips voorbereid: ' + (i + 1) + '/' + scenes.length);
    }
  }

  console.log('[Final Export] ' + preparedClips.length + ' clips voorbereid');

  if (preparedClips.length === 0) {
    throw new Error('Geen clips voorbereid voor export');
  }

  // 4. Samenvoegen
  const videoOnly = path.join(editDir, project.name + '-video.mp4');
  const outputFile = path.join(editDir, project.name + '-final.mp4');

  if (crossfadeDuration > 0 && preparedClips.length > 1) {
    // Crossfade in batches van 15 (FFmpeg filter graph limiet)
    const BATCH_SIZE = 15;
    const batchOutputs: string[] = [];

    for (let b = 0; b < preparedClips.length; b += BATCH_SIZE) {
      const batch = preparedClips.slice(b, b + BATCH_SIZE);
      const batchDurs = clipDurations.slice(b, b + BATCH_SIZE);
      const batchOut = path.join(preparedDir, 'batch' + String(Math.floor(b / BATCH_SIZE)).padStart(3, '0') + '.mp4');

      if (batch.length === 1) {
        await fs.copyFile(batch[0], batchOut);
        batchOutputs.push(batchOut);
        continue;
      }

      // Bouw crossfade filter
      const inputs = batch.map((c, i) => '-i "' + c + '"').join(' ');
      let filter = '';
      const n = batch.length;

      for (let i = 0; i < n; i++) {
        filter += '[' + i + ':v]setpts=PTS-STARTPTS[v' + i + ']; ';
      }

      let lastLabel = 'v0';
      let cumulativeOffset = 0;
      for (let i = 1; i < n; i++) {
        cumulativeOffset += batchDurs[i - 1] - crossfadeDuration;
        const outLabel = i < n - 1 ? 'cf' + i : 'vout';
        filter += '[' + lastLabel + '][v' + i + ']xfade=transition=fade:duration=' + crossfadeDuration + ':offset=' + Math.max(0, cumulativeOffset).toFixed(3) + '[' + outLabel + ']; ';
        lastLabel = outLabel;
      }

      filter = filter.trim().replace(/;\s*$/, '');

      try {
        execSync(
          'ffmpeg -y ' + inputs +
          " -filter_complex '" + filter + "'" +
          ' -map "[vout]" -c:v libx264 -preset fast -crf 23 -movflags +faststart' +
          ' "' + batchOut + '"',
          { timeout: 600000, stdio: 'pipe', maxBuffer: 50 * 1024 * 1024 }
        );
        batchOutputs.push(batchOut);
      } catch (err: any) {
        console.error('[Final Export] Batch ' + Math.floor(b / BATCH_SIZE) + ' crossfade mislukt: ' + (err.message || '').slice(0, 300));
        // Fallback: concat zonder crossfade voor deze batch
        const concatFile = path.join(preparedDir, 'batch' + String(Math.floor(b / BATCH_SIZE)).padStart(3, '0') + '.txt');
        await fs.writeFile(concatFile, batch.map(f => "file '" + f + "'").join('\n'));
        execSync(
          'ffmpeg -y -f concat -safe 0 -i "' + concatFile + '" -c:v libx264 -preset fast -crf 23 -movflags +faststart "' + batchOut + '"',
          { timeout: 300000, stdio: 'pipe' }
        );
        batchOutputs.push(batchOut);
      }

      console.log('[Final Export] Batch ' + (Math.floor(b / BATCH_SIZE) + 1) + '/' + Math.ceil(preparedClips.length / BATCH_SIZE) + ' samengevoegd');
    }

    // Merge alle batches
    if (batchOutputs.length === 1) {
      await fs.copyFile(batchOutputs[0], videoOnly);
    } else {
      // Batches samenvoegen met crossfade
      const inputs = batchOutputs.map((c, i) => '-i "' + c + '"').join(' ');
      // Haal batch duren op
      const bDurs: number[] = [];
      for (const bo of batchOutputs) {
        try {
          const d = execSync('ffprobe -v error -show_entries format=duration -of csv=p=0 "' + bo + '"', { encoding: 'utf-8', timeout: 10000 }).trim();
          bDurs.push(parseFloat(d) || 60);
        } catch { bDurs.push(60); }
      }

      let bFilter = '';
      const bn = batchOutputs.length;
      for (let i = 0; i < bn; i++) {
        bFilter += '[' + i + ':v]setpts=PTS-STARTPTS[bv' + i + ']; ';
      }
      let bLast = 'bv0';
      let bOffset = 0;
      for (let i = 1; i < bn; i++) {
        bOffset += bDurs[i - 1] - crossfadeDuration;
        const bOut = i < bn - 1 ? 'bcf' + i : 'vout';
        bFilter += '[' + bLast + '][bv' + i + ']xfade=transition=fade:duration=' + crossfadeDuration + ':offset=' + Math.max(0, bOffset).toFixed(3) + '[' + bOut + ']; ';
        bLast = bOut;
      }
      bFilter = bFilter.trim().replace(/;\s*$/, '');

      try {
        execSync(
          'ffmpeg -y ' + inputs +
          " -filter_complex '" + bFilter + "'" +
          ' -map "[vout]" -c:v libx264 -preset fast -crf 23 -movflags +faststart' +
          ' "' + videoOnly + '"',
          { timeout: 900000, stdio: 'pipe', maxBuffer: 50 * 1024 * 1024 }
        );
      } catch {
        // Fallback: simpele concat
        const concatFile = path.join(preparedDir, 'final-concat.txt');
        await fs.writeFile(concatFile, batchOutputs.map(f => "file '" + f + "'").join('\n'));
        execSync(
          'ffmpeg -y -f concat -safe 0 -i "' + concatFile + '" -c copy -movflags +faststart "' + videoOnly + '"',
          { timeout: 600000, stdio: 'pipe' }
        );
      }
    }
  } else {
    // Simpele concat zonder transities
    const concatFile = path.join(preparedDir, 'concat.txt');
    await fs.writeFile(concatFile, preparedClips.map(f => "file '" + f + "'").join('\n'));
    execSync(
      'ffmpeg -y -f concat -safe 0 -i "' + concatFile + '" -c:v libx264 -preset fast -crf 23 -movflags +faststart "' + videoOnly + '"',
      { timeout: 600000, stdio: 'pipe' }
    );
  }

  console.log('[Final Export] Video samengevoegd, audio toevoegen...');

  // 5. Voiceover toevoegen
  try {
    await fs.access(audioPath);
    execSync(
      'ffmpeg -y -i "' + videoOnly + '" -i "' + audioPath + '"' +
      ' -c:v copy -c:a aac -b:a 192k -map 0:v:0 -map 1:a:0 -shortest -movflags +faststart' +
      ' "' + outputFile + '"',
      { timeout: 300000, stdio: 'pipe' }
    );
    // Verwijder video-only versie
    try { await fs.unlink(videoOnly); } catch {}
  } catch {
    // Geen audio, gebruik video-only
    await fs.rename(videoOnly, outputFile);
    console.warn('[Final Export] Geen voiceover gevonden, video zonder audio');
  }

  // 6. Stats
  const stats = await fs.stat(outputFile);
  const fileSizeMb = Math.round(stats.size / 1024 / 1024 * 10) / 10;

  let duration = 0;
  try {
    const d = execSync('ffprobe -v error -show_entries format=duration -of csv=p=0 "' + outputFile + '"', { encoding: 'utf-8', timeout: 30000 }).trim();
    duration = Math.round(parseFloat(d));
  } catch {}

  // Cleanup prepared clips
  try { await fs.rm(preparedDir, { recursive: true, force: true }); } catch {}

  console.log('[Final Export] Klaar! ' + duration + 's, ' + fileSizeMb + ' MB');

  return {
    outputFile,
    duration,
    fileSizeMb,
    format: 'YouTube 1080p',
    totalScenes: preparedClips.length,
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

// ══════════════════════════════════════════════════
// STAP 2: RESEARCH JSON (Perplexity Deep Research)
// ══════════════════════════════════════════════════

import { PerplexityService } from './perplexity.js';

export async function executeStepResearch(project: any, settings: any): Promise<any> {
  const projPath = projectDir(project.name);
  const researchDir = path.join(projPath, 'research');
  await ensureDir(researchDir);

  if (!settings.perplexityApiKey) {
    throw new Error('Perplexity API key niet geconfigureerd in Settings');
  }

  // 1. Haal research template op (project override → kanaal baseline → default)
  let researchTemplate: any = null;

  // Check kanaal baseline
  if (project.channelId) {
    const prismaImport = await import('../db.js');
    const prismaClient = prismaImport.default;
    const channel = await prismaClient.channel.findUnique({ where: { id: project.channelId } });
    if (channel?.baseResearchTemplate) {
      try { researchTemplate = JSON.parse(channel.baseResearchTemplate); } catch {}
    }
  }

  // Fallback: default template uit database
  if (!researchTemplate) {
    const prismaImport = await import('../db.js');
    const prismaClient = prismaImport.default;
    const videoType = project.videoType || 'ai';
    const defaultTemplate = await prismaClient.researchTemplate.findFirst({
      where: { videoType, isDefault: true },
    });
    if (defaultTemplate?.template) {
      try { researchTemplate = JSON.parse(defaultTemplate.template); } catch {}
    }
  }

  // Ultieme fallback: basis template
  if (!researchTemplate) {
    researchTemplate = {
      topic: "",
      summary: "",
      key_facts: [],
      timeline: [],
      key_figures: [],
      sources: []
    };
  }

  // 2. Bouw referentie video info (als beschikbaar)
  let referenceVideoInfo = '';
  const config = typeof project.config === 'string' ? JSON.parse(project.config) : project.config;
  if (config?.referenceVideos && config.referenceVideos.length > 0) {
    referenceVideoInfo = `Referentie video URLs: ${config.referenceVideos.filter((v: string) => v).join(', ')}`;
  }

  // 3. Perplexity research uitvoeren
  const perplexity = new PerplexityService({ apiKey: settings.perplexityApiKey });

  const result = await perplexity.executeResearch({
    title: project.title,
    description: project.description || '',
    researchTemplate,
    referenceVideoInfo,
  });

  // 4. Opslaan als research.json
  await writeJson(path.join(researchDir, 'research.json'), result);

  console.log(`[Pipeline] Stap 2: Research JSON opgeslagen voor ${project.name}`);

  return { success: true, researchFile: 'research/research.json' };
}

// ══════════════════════════════════════════════════
// STAP 4: TRENDING CLIPS RESEARCH (Perplexity)
// ══════════════════════════════════════════════════

export async function executeStepTrendingClips(project: any, settings: any): Promise<any> {
  const projPath = projectDir(project.name);
  const researchDir = path.join(projPath, 'research');
  await ensureDir(researchDir);

  if (!settings.perplexityApiKey) {
    throw new Error('Perplexity API key niet geconfigureerd in Settings');
  }

  // 1. Bepaal max clip duur
  let maxClipDuration = 15; // default
  if (project.channelId) {
    const prismaImport = await import('../db.js');
    const prismaClient = prismaImport.default;
    const channel = await prismaClient.channel.findUnique({ where: { id: project.channelId } });
    if (channel?.maxClipDurationSeconds) {
      maxClipDuration = channel.maxClipDurationSeconds;
    }
  }

  // 2. Haal eerder gebruikte clips op (uit kanaal)
  let usedClips: { url: string; timesUsed: number }[] = [];
  if (project.channelId) {
    const prismaImport = await import('../db.js');
    const prismaClient = prismaImport.default;
    const channel = await prismaClient.channel.findUnique({ where: { id: project.channelId } });
    if (channel?.usedClips) {
      try { usedClips = JSON.parse(channel.usedClips); } catch {}
    }
  }

  // 3. Haal research.json op (als beschikbaar, van stap 2)
  let researchData: any = null;
  try {
    researchData = await readJson(path.join(researchDir, 'research.json'));
  } catch {
    // research.json niet beschikbaar — geen probleem
    console.log('[Pipeline] Stap 4: Geen research.json gevonden, doorgaan zonder');
  }

  // 4. Haal style profile op voor clip_blueprint (als beschikbaar)
  let clipBlueprint: any = null;
  try {
    const styleProfile = await readJson(path.join(projPath, 'script', 'style-profile.json'));
    const profile = styleProfile.script_style_profile || styleProfile;
    if (profile.clip_blueprint) {
      clipBlueprint = profile.clip_blueprint;
      console.log('[Pipeline] Stap 4: clip_blueprint gevonden in style profile');
    }
  } catch {
    console.log('[Pipeline] Stap 4: Geen style profile/clip_blueprint beschikbaar');
  }

  // 5. Perplexity clips research
  const perplexity = new PerplexityService({ apiKey: settings.perplexityApiKey });

  const result = await perplexity.executeTrendingClipsResearch({
    title: project.title,
    description: project.description || '',
    researchData,
    usedClips,
    maxClipDuration,
    videoType: project.videoType || 'ai',
    clipBlueprint,
  });

  // 5. Opslaan als clips-research.json
  await writeJson(path.join(researchDir, 'clips-research.json'), result);

  console.log(`[Pipeline] Stap 4: ${result.total_clips_found || result.clips?.length || 0} clips gevonden voor ${project.name}`);

  return { success: true, clipsFile: 'research/clips-research.json', totalClips: result.total_clips_found || result.clips?.length || 0 };
}

// ══════════════════════════════════════════════════
// STAP 6: SCRIPT ORCHESTRATOR (Elevate Claude Opus 4.5)
// Verzamelt alle data en maakt een gedetailleerde outline/blueprint
// ══════════════════════════════════════════════════

import { LLM_MODELS } from './llm.js';

export async function executeStepScriptOrchestrator(project: any, settings: any, llmKeys: any): Promise<any> {
  const projPath = projectDir(project.name);

  // 1. Verzamel ALLE beschikbare data
  const dataParts: string[] = [];

  // Research JSON (stap 2)
  try {
    const research = await readJson(path.join(projPath, 'research', 'research.json'));
    dataParts.push(`=== RESEARCH DATA ===\n${JSON.stringify(research, null, 2)}`);
  } catch { dataParts.push('=== RESEARCH DATA ===\nNiet beschikbaar'); }

  // Clips Research (stap 4)
  try {
    const clips = await readJson(path.join(projPath, 'research', 'clips-research.json'));
    dataParts.push(`=== TRENDING CLIPS ===\n${JSON.stringify(clips, null, 2)}`);
  } catch { dataParts.push('=== TRENDING CLIPS ===\nNiet beschikbaar'); }

  // Style Profile (stap 5)
  try {
    const styleJson = await readJson(path.join(projPath, 'script', 'style-profile.json'));
    dataParts.push(`=== STYLE PROFILE ===\n${JSON.stringify(styleJson, null, 2)}`);
  } catch { dataParts.push('=== STYLE PROFILE ===\nNiet beschikbaar'); }

  // Transcripts (stap 3)
  try {
    const scriptDir = path.join(projPath, 'script');
    const files = await fs.readdir(scriptDir).catch(() => []);
    const transcriptFiles = files.filter(f => f.startsWith('ref-transcript-') && f.endsWith('.txt'));
    for (const file of transcriptFiles.slice(0, 5)) {
      const content = await readText(path.join(scriptDir, file));
      dataParts.push(`=== REFERENTIE TRANSCRIPT: ${file} ===\n${content.substring(0, 3000)}`);
    }
  } catch {}

  // Kanaal instructies
  let channelInstructions = '';
  if (project.channelId) {
    const prismaImport = await import('../db.js');
    const prismaClient = prismaImport.default;
    const channel = await prismaClient.channel.findUnique({ where: { id: project.channelId } });
    if (channel) {
      if (channel.styleExtraInstructions) channelInstructions += `\nKanaal stijl instructies: ${channel.styleExtraInstructions}`;
      if (channel.baseStyleProfile) {
        try {
          const profile = JSON.parse(channel.baseStyleProfile);
          dataParts.push(`=== KANAAL STYLE PROFILE ===\n${JSON.stringify(profile, null, 2)}`);
        } catch {}
      }
    }
  }

  // Project config
  const config = typeof project.config === 'string' ? JSON.parse(project.config) : project.config;
  const scriptLength = config?.scriptLength || 5000;
  const videoType = project.videoType || 'ai';

  // 2. LLM Call met Claude Opus 4.5
  const { llmSimplePrompt } = await import('./llm.js');

  const systemPrompt = `Je bent een expert video regisseur en script planner. Je maakt een gedetailleerde OUTLINE/BLUEPRINT voor een YouTube video.

Je ontvangt uitgebreide research data, clips, style profile, en referentie transcripts. Jouw taak is om dit allemaal te analyseren en een complete video structuur te maken.

De outline bevat:
1. HOOFD NARRATIEF: De rode draad en kernboodschap van de video
2. STRUCTUUR: Exacte secties met tijdsindicatie (intro, hoofddelen, conclusie)  
3. PER SECTIE:
   - Kernboodschap
   - Specifieke feiten/data uit research die gebruikt moeten worden
   - Toon en energie (opbouwend, dramatisch, informatief, etc.)
   - Clip suggesties: welke trending clips hier passen (met URL + timestamp)
   - Overgangen naar volgende sectie
4. PACING: Tempo-indicatie per deel (snel, medium, langzaam)
5. HOOKS: Opening hook en cliffhangers voor viewer retention
6. CALL TO ACTION: Waar en hoe
7. SPECIFIEKE INSTRUCTIES voor de scriptschrijver

Maak de outline zo gedetailleerd en specifiek mogelijk. De scriptschrijver moet hier direct mee aan de slag kunnen zonder zelf nog research te hoeven doen.

Geef de outline in het volgende JSON format:
{
  "title": "Video titel",
  "hook": "De openingszin/hook die de kijker pakt",
  "narrative_thread": "De rode draad van de video in 2-3 zinnen",
  "target_length_words": ${scriptLength},
  "tone": "De algehele toon (bijv. 'urgent en informatief met dramatische spanning')",
  "sections": [
    {
      "id": 1,
      "title": "Sectie titel",
      "type": "intro|main|climax|conclusion",
      "duration_percent": 15,
      "key_message": "Wat de kijker hier moet leren/voelen",
      "facts_to_include": ["Specifiek feit 1 uit research", "Feit 2"],
      "tone": "opbouwend",
      "pacing": "medium",
      "clip_suggestions": [
        {"url": "https://...", "timestamp": "00:32-00:47", "reason": "Waarom deze clip hier past"}
      ],
      "transition_to_next": "Hoe je naar de volgende sectie overgaat",
      "script_instructions": "Specifieke instructies voor de schrijver voor deze sectie"
    }
  ],
  "call_to_action": "Subscribe/like instructie",
  "writer_instructions": "Algemene instructies voor de scriptschrijver"
}`;

  const userPrompt = `VIDEO: ${project.title}
BESCHRIJVING: ${project.description || 'Geen beschrijving'}
VIDEO TYPE: ${videoType}
GEWENSTE SCRIPTLENGTE: ${scriptLength} woorden
${channelInstructions}

${dataParts.join('\n\n')}

Maak een gedetailleerde outline/blueprint voor deze video. Gebruik ALLE beschikbare research data, clips, en stijlinformatie.`;

  console.log(`[Pipeline] Stap 6: Script Orchestrator starten (Claude Opus 4.5)...`);

  const response = await llmSimplePrompt(llmKeys, systemPrompt, userPrompt, {
    model: LLM_MODELS.OPUS,
    maxTokens: 16384,
    temperature: 0.6,
  });

  // 3. Parse en opslaan
  let outline: any;
  try {
    outline = JSON.parse(response);
  } catch {
    const match = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      outline = JSON.parse(match[1].trim());
    } else {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        outline = JSON.parse(jsonMatch[0]);
      } else {
        // Sla raw response op als fallback
        await writeText(path.join(projPath, 'script_outline.txt'), response);
        console.log('[Pipeline] Stap 6: Outline als tekst opgeslagen (geen JSON)');
        return { success: true, outlineFile: 'script_outline.txt', format: 'text' };
      }
    }
  }

  await writeJson(path.join(projPath, 'script_outline.json'), outline);
  console.log(`[Pipeline] Stap 6: Script outline opgeslagen (${outline.sections?.length || 0} secties)`);

  return {
    success: true,
    outlineFile: 'script_outline.json',
    sections: outline.sections?.length || 0,
    format: 'json',
  };
}

// ══════════════════════════════════════════════════
// STAP 16: DIRECTOR'S CUT (Claude Opus 4.5)
// ══════════════════════════════════════════════════

import { executeDirectorsCut } from './directors-cut.js';

export async function executeStepDirectorsCut(project: any, settings: any, llmKeys: any, log?: any): Promise<any> {
  return executeDirectorsCut({ project, settings, llmKeys });
}

// ══════════════════════════════════════════════════
// STAP 17: BACKGROUND MUSIC
// ══════════════════════════════════════════════════

import { executeBackgroundMusic } from './background-music.js';

export async function executeStepBackgroundMusic(project: any, settings: any, log?: any): Promise<any> {
  return executeBackgroundMusic(project, settings);
}

// ══════════════════════════════════════════════════
// STAP 21: SOUND EFFECTS
// ══════════════════════════════════════════════════

import { executeSoundEffects } from './sound-effects.js';

export async function executeStepSoundEffects(project: any, settings: any, log?: any): Promise<any> {
  return executeSoundEffects(project, settings);
}

// ══════════════════════════════════════════════════
// STAP 22: VIDEO EFFECTS / SPECIAL EDITS
// ══════════════════════════════════════════════════

import { executeVideoEffects } from './video-effects.js';

export async function executeStepVideoEffects(project: any, settings: any, log?: any): Promise<any> {
  return executeVideoEffects(project, settings);
}

// ══════════════════════════════════════════════════
// STAP 23: FINAL ASSEMBLY
// ══════════════════════════════════════════════════

import { executeFinalAssembly } from './final-assembly.js';

export async function executeStepFinalAssembly(project: any, settings: any, log?: any): Promise<any> {
  return executeFinalAssembly(project, settings);
}
