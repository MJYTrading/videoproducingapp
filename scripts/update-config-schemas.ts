/**
 * Pipeline Builder v3.1 — configSchema toevoegen
 * 
 * Voegt configSchema toe aan StepDefinition en vult dit in voor alle 27 stappen.
 * configSchema definieert welke configuratie-velden een stap nodig heeft in het UI.
 *
 * Gebruik: npx tsx scripts/update-config-schemas.ts
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Type: "llm" = LLM stap met prompts, "api" = API stap, "app" = pure app logic
// Field types: text, number, range, select, toggle, textarea, json

interface ConfigField {
  key: string;
  type: 'text' | 'number' | 'range' | 'select' | 'toggle' | 'textarea' | 'json';
  label: string;
  description?: string;
  default?: any;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  source?: string; // "voices" | "styles" | "colorGrades" — laadt opties dynamisch
  required?: boolean;
  group?: string; // groepering in UI
}

const STEP_TYPE_MAP: Record<string, 'llm' | 'api' | 'app'> = {};
const CONFIG_SCHEMAS: Record<string, ConfigField[]> = {};

// ── Setup ──
STEP_TYPE_MAP['config-validation'] = 'app';
CONFIG_SCHEMAS['config-validation'] = []; // Geen config nodig, leest project data

// ── Research ──
STEP_TYPE_MAP['research-json'] = 'llm';
CONFIG_SCHEMAS['research-json'] = [
  { key: 'temperature', type: 'range', label: 'Temperature', default: 0.3, min: 0, max: 1, step: 0.1, group: 'LLM' },
  { key: 'maxTokens', type: 'number', label: 'Max Tokens', default: 8000, group: 'LLM' },
  { key: 'searchDepth', type: 'select', label: 'Research Diepte', default: 'deep', options: [
    { value: 'basic', label: 'Basis' }, { value: 'deep', label: 'Diep' }, { value: 'comprehensive', label: 'Uitgebreid' }
  ], group: 'Research' },
];

STEP_TYPE_MAP['transcripts-ophalen'] = 'api';
CONFIG_SCHEMAS['transcripts-ophalen'] = [
  { key: 'maxTranscripts', type: 'number', label: 'Max Transcripts', default: 5, description: 'Maximum aantal transcripts om op te halen' },
  { key: 'language', type: 'select', label: 'Taal Filter', default: 'en', options: [
    { value: 'en', label: 'Engels' }, { value: 'nl', label: 'Nederlands' }, { value: 'auto', label: 'Automatisch' }
  ]},
];

STEP_TYPE_MAP['style-profile'] = 'llm';
CONFIG_SCHEMAS['style-profile'] = [
  { key: 'temperature', type: 'range', label: 'Temperature', default: 0.7, min: 0, max: 1, step: 0.1, group: 'LLM' },
  { key: 'maxTokens', type: 'number', label: 'Max Tokens', default: 4000, group: 'LLM' },
];

STEP_TYPE_MAP['trending-clips-research'] = 'llm';
CONFIG_SCHEMAS['trending-clips-research'] = [
  { key: 'temperature', type: 'range', label: 'Temperature', default: 0.3, min: 0, max: 1, step: 0.1, group: 'LLM' },
  { key: 'maxClips', type: 'number', label: 'Max Clips', default: 10, description: 'Maximum clips om te vinden' },
  { key: 'recencyDays', type: 'number', label: 'Recency (dagen)', default: 30, description: 'Zoek clips van de laatste X dagen' },
];

// ── Script ──
STEP_TYPE_MAP['script-orchestrator'] = 'llm';
CONFIG_SCHEMAS['script-orchestrator'] = [
  { key: 'temperature', type: 'range', label: 'Temperature', default: 0.8, min: 0, max: 1, step: 0.1, group: 'LLM' },
  { key: 'maxTokens', type: 'number', label: 'Max Tokens', default: 8000, group: 'LLM' },
  { key: 'targetSections', type: 'number', label: 'Aantal Secties', default: 0, description: '0 = automatisch bepalen' },
];

STEP_TYPE_MAP['script-schrijven'] = 'llm';
CONFIG_SCHEMAS['script-schrijven'] = [
  { key: 'temperature', type: 'range', label: 'Temperature', default: 0.85, min: 0, max: 1, step: 0.1, group: 'LLM' },
  { key: 'maxTokens', type: 'number', label: 'Max Tokens', default: 16000, group: 'LLM' },
  { key: 'targetWordCount', type: 'number', label: 'Doel Woordenaantal', default: 0, description: '0 = uit project config' },
];

STEP_TYPE_MAP['script-checker'] = 'llm';
CONFIG_SCHEMAS['script-checker'] = [
  { key: 'temperature', type: 'range', label: 'Temperature', default: 0.5, min: 0, max: 1, step: 0.1, group: 'LLM' },
  { key: 'autoRevise', type: 'toggle', label: 'Auto Revisie', default: false, description: 'Automatisch script herschrijven bij lage score' },
  { key: 'minScore', type: 'number', label: 'Minimale Score', default: 7, description: 'Score onder deze waarde triggert revisie (1-10)' },
];

// ── Audio ──
STEP_TYPE_MAP['voice-over'] = 'api';
CONFIG_SCHEMAS['voice-over'] = [
  { key: 'voice_id', type: 'select', label: 'Voice', required: true, source: 'voices', group: 'TTS' },
  { key: 'model_id', type: 'select', label: 'TTS Model', default: 'eleven_multilingual_v2', options: [
    { value: 'eleven_multilingual_v2', label: 'Multilingual v2' },
    { value: 'eleven_turbo_v2_5', label: 'Turbo v2.5' },
    { value: 'eleven_flash_v2_5', label: 'Flash v2.5' },
  ], group: 'TTS' },
  { key: 'stability', type: 'range', label: 'Stability', default: 0.5, min: 0, max: 1, step: 0.05, group: 'Voice Settings' },
  { key: 'similarity_boost', type: 'range', label: 'Similarity Boost', default: 0.75, min: 0, max: 1, step: 0.05, group: 'Voice Settings' },
  { key: 'speed', type: 'range', label: 'Speed', default: 1.0, min: 0.5, max: 2.0, step: 0.1, group: 'Voice Settings' },
];

STEP_TYPE_MAP['avatar-spokesperson'] = 'api';
CONFIG_SCHEMAS['avatar-spokesperson'] = [
  { key: 'avatarId', type: 'text', label: 'Avatar ID', description: 'HeyGen avatar ID' },
  { key: 'background', type: 'select', label: 'Achtergrond', default: 'transparent', options: [
    { value: 'transparent', label: 'Transparant' }, { value: 'studio', label: 'Studio' }, { value: 'custom', label: 'Custom' }
  ]},
  { key: 'resolution', type: 'select', label: 'Resolutie', default: '1080p', options: [
    { value: '720p', label: '720p' }, { value: '1080p', label: '1080p' }
  ]},
];

STEP_TYPE_MAP['timestamps-ophalen'] = 'api';
CONFIG_SCHEMAS['timestamps-ophalen'] = [
  { key: 'language', type: 'select', label: 'Taal', default: 'en', options: [
    { value: 'en', label: 'Engels' }, { value: 'nl', label: 'Nederlands' }, { value: 'auto', label: 'Automatisch' }
  ]},
];

STEP_TYPE_MAP['clip-posities'] = 'app';
CONFIG_SCHEMAS['clip-posities'] = [
  { key: 'minSegmentDuration', type: 'number', label: 'Min Segment (sec)', default: 3, description: 'Minimale duur van een visueel segment' },
  { key: 'pauseThreshold', type: 'number', label: 'Pauze Drempel (ms)', default: 500, description: 'Pauze langer dan dit = nieuw segment' },
];

// ── Creative Direction ──
STEP_TYPE_MAP['creative-director'] = 'llm';
CONFIG_SCHEMAS['creative-director'] = [
  { key: 'temperature', type: 'range', label: 'Temperature', default: 0.8, min: 0, max: 1, step: 0.1, group: 'LLM' },
  { key: 'maxTokens', type: 'number', label: 'Max Tokens', default: 16000, group: 'LLM' },
  { key: 'visualStyle', type: 'select', label: 'Visuele Stijl', source: 'styles', group: 'Stijl' },
  { key: 'colorGrade', type: 'select', label: 'Color Grading', source: 'colorGrades', group: 'Stijl' },
];

// ── B-Roll ──
STEP_TYPE_MAP['broll-queries'] = 'llm';
CONFIG_SCHEMAS['broll-queries'] = [
  { key: 'temperature', type: 'range', label: 'Temperature', default: 0.7, min: 0, max: 1, step: 0.1, group: 'LLM' },
  { key: 'queriesPerSegment', type: 'number', label: 'Queries per Segment', default: 3 },
];

STEP_TYPE_MAP['stock-footage-zoeken'] = 'api';
CONFIG_SCHEMAS['stock-footage-zoeken'] = [
  { key: 'resultsPerQuery', type: 'number', label: 'Resultaten per Query', default: 5 },
  { key: 'minDuration', type: 'number', label: 'Min Duur (sec)', default: 5 },
  { key: 'orientation', type: 'select', label: 'Orientatie', default: 'landscape', options: [
    { value: 'landscape', label: 'Landscape' }, { value: 'portrait', label: 'Portrait' }, { value: 'any', label: 'Alles' }
  ]},
];

STEP_TYPE_MAP['broll-downloaden'] = 'app';
CONFIG_SCHEMAS['broll-downloaden'] = [
  { key: 'kenBurnsEnabled', type: 'toggle', label: 'Ken Burns Effect', default: true },
  { key: 'targetResolution', type: 'select', label: 'Resolutie', default: '1920x1080', options: [
    { value: '1920x1080', label: '1080p' }, { value: '3840x2160', label: '4K' }
  ]},
];

// ── YouTube Clips ──
STEP_TYPE_MAP['youtube-clips-zoeken'] = 'app';
CONFIG_SCHEMAS['youtube-clips-zoeken'] = [
  { key: 'maxClipsPerSegment', type: 'number', label: 'Max Clips per Segment', default: 2 },
  { key: 'preferredDuration', type: 'number', label: 'Ideale Clip Duur (sec)', default: 8 },
];

STEP_TYPE_MAP['youtube-clips-downloaden'] = 'api';
CONFIG_SCHEMAS['youtube-clips-downloaden'] = [
  { key: 'maxConcurrent', type: 'number', label: 'Max Gelijktijdig', default: 3 },
  { key: 'trimPadding', type: 'number', label: 'Trim Padding (sec)', default: 0.5, description: 'Extra marge bij in/uit punt' },
];

// ── AI Visuals ──
STEP_TYPE_MAP['scene-prompts'] = 'llm';
CONFIG_SCHEMAS['scene-prompts'] = [
  { key: 'temperature', type: 'range', label: 'Temperature', default: 0.8, min: 0, max: 1, step: 0.1, group: 'LLM' },
  { key: 'visualStyle', type: 'select', label: 'Visuele Stijl', source: 'styles', group: 'Stijl' },
  { key: 'stylePrefix', type: 'textarea', label: 'Style Prefix', description: 'Wordt voor elke prompt gezet', group: 'Stijl' },
  { key: 'styleSuffix', type: 'textarea', label: 'Style Suffix', description: 'Wordt achter elke prompt gezet', group: 'Stijl' },
];

STEP_TYPE_MAP['ai-images-genereren'] = 'api';
CONFIG_SCHEMAS['ai-images-genereren'] = [
  { key: 'aspect_ratio', type: 'select', label: 'Aspect Ratio', default: 'landscape', options: [
    { value: 'landscape', label: 'Landscape (16:9)' }, { value: 'portrait', label: 'Portrait (9:16)' }, { value: 'square', label: 'Vierkant (1:1)' }
  ], group: 'Image' },
  { key: 'seed', type: 'number', label: 'Seed', default: 0, description: '0 = random, anders voor reproduceerbaarheid', group: 'Image' },
  { key: 'maxConcurrent', type: 'number', label: 'Max Gelijktijdig', default: 3, group: 'Performance' },
];

STEP_TYPE_MAP['ai-video-scenes'] = 'api';
CONFIG_SCHEMAS['ai-video-scenes'] = [
  { key: 'aspect_ratio', type: 'select', label: 'Aspect Ratio', default: 'landscape', options: [
    { value: 'landscape', label: 'Landscape' }, { value: 'portrait', label: 'Portrait' }, { value: 'square', label: 'Vierkant' }
  ], group: 'Video' },
  { key: 'provider', type: 'select', label: 'Provider', default: 'elevate', options: [
    { value: 'elevate', label: 'Elevate (primary)' }, { value: 'genai', label: 'GenAIPro (fallback)' }
  ], group: 'Video' },
  { key: 'maxConcurrent', type: 'number', label: 'Max Gelijktijdig', default: 1, description: 'Elevate: max 1, GenAIPro: onbeperkt', group: 'Performance' },
];

// ── Motion Graphics ──
STEP_TYPE_MAP['motion-graphics'] = 'app';
CONFIG_SCHEMAS['motion-graphics'] = [
  { key: 'types', type: 'json', label: 'Beschikbare Types', default: '["map","chart","timeline","counter"]', description: 'Welke motion graphic types genereren' },
  { key: 'resolution', type: 'select', label: 'Resolutie', default: '1920x1080', options: [
    { value: '1920x1080', label: '1080p' }, { value: '3840x2160', label: '4K' }
  ]},
];

// ── Post-productie ──
STEP_TYPE_MAP['directors-cut'] = 'llm';
CONFIG_SCHEMAS['directors-cut'] = [
  { key: 'temperature', type: 'range', label: 'Temperature', default: 0.5, min: 0, max: 1, step: 0.1, group: 'LLM' },
  { key: 'maxTokens', type: 'number', label: 'Max Tokens', default: 16000, group: 'LLM' },
  { key: 'crossfadeDuration', type: 'number', label: 'Crossfade (ms)', default: 200, group: 'Montage' },
  { key: 'transitionStyle', type: 'select', label: 'Transitie Stijl', default: 'crossfade', options: [
    { value: 'cut', label: 'Harde Cut' }, { value: 'crossfade', label: 'Crossfade' }, { value: 'mixed', label: 'Mix' }
  ], group: 'Montage' },
];

STEP_TYPE_MAP['muziek-preparatie'] = 'app';
CONFIG_SCHEMAS['muziek-preparatie'] = [
  { key: 'volumeLevel', type: 'range', label: 'Volume (dB)', default: -18, min: -30, max: 0, step: 1 },
  { key: 'fadeInMs', type: 'number', label: 'Fade In (ms)', default: 3000 },
  { key: 'fadeOutMs', type: 'number', label: 'Fade Out (ms)', default: 5000 },
  { key: 'duckingEnabled', type: 'toggle', label: 'Auto Ducking', default: true, description: 'Volume verlagen tijdens spraak' },
  { key: 'duckingLevel', type: 'range', label: 'Ducking Level (dB)', default: -6, min: -20, max: 0, step: 1 },
];

STEP_TYPE_MAP['final-assembly'] = 'app';
CONFIG_SCHEMAS['final-assembly'] = [
  { key: 'subtitlesEnabled', type: 'toggle', label: 'Ondertitels', default: true, group: 'Ondertitels' },
  { key: 'subtitleStyle', type: 'select', label: 'Ondertitel Stijl', default: 'classic', options: [
    { value: 'classic', label: 'Classic' }, { value: 'bold', label: 'Bold' }, { value: 'minimal', label: 'Minimal' }, { value: 'karaoke', label: 'Karaoke' }
  ], group: 'Ondertitels' },
  { key: 'colorGrade', type: 'select', label: 'Color Grading', source: 'colorGrades', group: 'Visueel' },
  { key: 'outputResolution', type: 'select', label: 'Output Resolutie', default: '1920x1080', options: [
    { value: '1920x1080', label: '1080p' }, { value: '3840x2160', label: '4K' }, { value: '1080x1920', label: '1080p Vertical' }
  ], group: 'Output' },
  { key: 'outputFormat', type: 'select', label: 'Output Formaat', default: 'mp4', options: [
    { value: 'mp4', label: 'MP4 (H.264)' }, { value: 'webm', label: 'WebM' }
  ], group: 'Output' },
];

// ── Output ──
STEP_TYPE_MAP['thumbnail-genereren'] = 'app';
CONFIG_SCHEMAS['thumbnail-genereren'] = [
  { key: 'style', type: 'select', label: 'Thumbnail Stijl', default: 'auto', options: [
    { value: 'auto', label: 'Automatisch' }, { value: 'screenshot', label: 'Beste Frame' }, { value: 'ai', label: 'AI Generated' }
  ]},
  { key: 'addText', type: 'toggle', label: 'Tekst Toevoegen', default: true },
];

STEP_TYPE_MAP['drive-upload'] = 'api';
CONFIG_SCHEMAS['drive-upload'] = [
  { key: 'folderStrategy', type: 'select', label: 'Map Strategie', default: 'channel', options: [
    { value: 'channel', label: 'Per Kanaal' }, { value: 'date', label: 'Per Datum' }, { value: 'project', label: 'Per Project' }
  ]},
];

// ═══════════════════════════════════════════════════════════
// UPDATE EXECUTION
// ═══════════════════════════════════════════════════════════

async function update() {
  console.log('🔧 Config schemas updaten...\n');

  for (const [slug, schema] of Object.entries(CONFIG_SCHEMAS)) {
    const stepType = STEP_TYPE_MAP[slug] || 'app';
    try {
      await prisma.stepDefinition.update({
        where: { slug },
        data: {
          configSchema: JSON.stringify({ stepType, fields: schema }),
        },
      });
      console.log(`  ✅ ${slug} (${stepType}) — ${schema.length} velden`);
    } catch (err: any) {
      console.warn(`  ⚠️ ${slug}: ${err.message}`);
    }
  }

  const total = Object.keys(CONFIG_SCHEMAS).length;
  console.log(`\n✅ ${total} step definitions geüpdatet met configSchema`);
}

update()
  .catch(e => { console.error('❌', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
