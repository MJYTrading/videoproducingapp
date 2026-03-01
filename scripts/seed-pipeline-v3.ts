/**
 * Pipeline Builder v3 Seed — Fase 1
 * 
 * Seeds:
 * - 27 StepDefinitions (atomaire stappen met input/output schema's)
 * - 6 Pipelines (1 per video type)
 * - PipelineNodes per pipeline
 * - PipelineConnections (de draden)
 *
 * Gebruik: npx tsx scripts/seed-pipeline-v3.ts
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════════
// STEP DEFINITIONS — 27 atomaire stappen
// ═══════════════════════════════════════════════════════════

const STEP_DEFINITIONS = [
  // ── Pre-productie ──
  {
    slug: 'config-validation',
    name: 'Config Validatie',
    category: 'setup',
    description: 'Valideert project configuratie en maakt werkmap structuur aan',
    executorFn: 'executeStep0',
    executorLabel: 'App',
    inputSchema: [
      { key: 'project_form', type: 'object', label: 'Project Formulier Data', required: true, source: 'project' },
    ],
    outputSchema: [
      { key: 'config_json', type: 'json', label: 'Project Config', filePath: 'config.json' },
    ],
    isReady: true,
  },
  {
    slug: 'research-json',
    name: 'Research JSON',
    category: 'research',
    description: 'Deep research via Perplexity Sonar over het onderwerp',
    executorFn: 'executeStepResearch',
    executorLabel: 'Sonar Deep Research',
    toolPrimary: 'Perplexity',
    llmModel: 'Sonar Deep Research',
    outputFormat: 'json',
    inputSchema: [
      { key: 'config_json', type: 'json', label: 'Project Config', required: true },
    ],
    outputSchema: [
      { key: 'research_json', type: 'json', label: 'Research Data', filePath: 'script/research.json' },
    ],
    defaultConfig: { temperature: 0.3, maxTokens: 8000 },
    isReady: true,
  },
  {
    slug: 'transcripts-ophalen',
    name: 'Transcripts Ophalen',
    category: 'research',
    description: 'Haalt transcripts op van referentie YouTube videos',
    executorFn: 'executeStep1',
    executorLabel: 'YouTube Transcript API',
    toolPrimary: 'YouTube Transcript API',
    inputSchema: [
      { key: 'config_json', type: 'json', label: 'Project Config (referenceVideos)', required: true },
    ],
    outputSchema: [
      { key: 'transcripts_txt', type: 'text', label: 'Transcripts', filePath: 'script/transcripts.txt' },
    ],
    isReady: true,
  },
  {
    slug: 'style-profile',
    name: 'Style Profile Genereren',
    category: 'research',
    description: 'Analyseert research + transcripts om een schrijfstijl profiel te maken',
    executorFn: 'executeStep2',
    executorLabel: 'Elevate Opus',
    toolPrimary: 'Elevate Chat API',
    llmModel: 'Claude Opus 4.5',
    outputFormat: 'json',
    inputSchema: [
      { key: 'research_json', type: 'json', label: 'Research Data', required: true },
      { key: 'transcripts_txt', type: 'text', label: 'Transcripts', required: true },
    ],
    outputSchema: [
      { key: 'style_profile_json', type: 'json', label: 'Style Profile', filePath: 'script/style-profile.json' },
    ],
    defaultConfig: { temperature: 0.7, maxTokens: 4000 },
    isReady: true,
  },
  {
    slug: 'trending-clips-research',
    name: 'Trending Clips Research',
    category: 'research',
    description: 'Zoekt trending/relevante clips voor het onderwerp',
    executorFn: 'executeStepTrendingClips',
    executorLabel: 'Sonar Pro',
    toolPrimary: 'Perplexity',
    llmModel: 'Sonar Pro',
    outputFormat: 'json',
    inputSchema: [
      { key: 'research_json', type: 'json', label: 'Research Data', required: true },
      { key: 'config_json', type: 'json', label: 'Project Config', required: true },
    ],
    outputSchema: [
      { key: 'clips_research_json', type: 'json', label: 'Clips Research', filePath: 'script/clips-research.json' },
    ],
    defaultConfig: { temperature: 0.3 },
    isReady: true,
  },

  // ── Script ──
  {
    slug: 'script-orchestrator',
    name: 'Script Orchestrator',
    category: 'script',
    description: 'Maakt een script outline op basis van alle research data',
    executorFn: 'executeStepScriptOrchestrator',
    executorLabel: 'Elevate Opus',
    toolPrimary: 'Elevate Chat API',
    llmModel: 'Claude Opus 4.5',
    outputFormat: 'json',
    inputSchema: [
      { key: 'research_json', type: 'json', label: 'Research Data', required: true },
      { key: 'transcripts_txt', type: 'text', label: 'Transcripts', required: false },
      { key: 'style_profile_json', type: 'json', label: 'Style Profile', required: true },
      { key: 'clips_research_json', type: 'json', label: 'Clips Research', required: false },
    ],
    outputSchema: [
      { key: 'script_outline_json', type: 'json', label: 'Script Outline', filePath: 'script/outline.json' },
    ],
    defaultConfig: { temperature: 0.8, maxTokens: 8000 },
    isReady: true,
  },
  {
    slug: 'script-schrijven',
    name: 'Script Schrijven',
    category: 'script',
    description: 'Schrijft het volledige script op basis van de outline',
    executorFn: 'executeStep3',
    executorLabel: 'Elevate Opus',
    toolPrimary: 'Elevate Chat API',
    llmModel: 'Claude Opus 4.5',
    outputFormat: 'text',
    inputSchema: [
      { key: 'script_outline_json', type: 'json', label: 'Script Outline', required: true },
      { key: 'style_profile_json', type: 'json', label: 'Style Profile', required: true },
      { key: 'research_json', type: 'json', label: 'Research Data', required: false },
    ],
    outputSchema: [
      { key: 'script_txt', type: 'text', label: 'Script', filePath: 'script/script.txt' },
    ],
    defaultConfig: { temperature: 0.85, maxTokens: 16000 },
    isReady: true,
  },
  {
    slug: 'script-checker',
    name: 'Script Checker',
    category: 'script',
    description: 'Review en quality check op het script, met optionele revisie',
    executorFn: 'executeStepScriptChecker',
    executorLabel: 'Elevate Opus',
    toolPrimary: 'Elevate Chat API',
    llmModel: 'Claude Opus 4.5',
    outputFormat: 'json',
    inputSchema: [
      { key: 'script_txt', type: 'text', label: 'Script', required: true },
      { key: 'research_json', type: 'json', label: 'Research Data', required: true },
      { key: 'style_profile_json', type: 'json', label: 'Style Profile', required: true },
      { key: 'script_outline_json', type: 'json', label: 'Script Outline', required: true },
    ],
    outputSchema: [
      { key: 'script_review_json', type: 'json', label: 'Script Review', filePath: 'script/script-review.json' },
    ],
    defaultConfig: { temperature: 0.5 },
    isReady: false,
  },

  // ── Audio ──
  {
    slug: 'voice-over',
    name: 'Voice Over Genereren',
    category: 'audio',
    description: 'Genereert voiceover audio van het script via ElevenLabs TTS',
    executorFn: 'executeStep4',
    executorLabel: 'Elevate TTS',
    toolPrimary: 'Elevate Media API',
    outputFormat: 'file',
    inputSchema: [
      { key: 'script_txt', type: 'text', label: 'Script', required: true },
      { key: 'config_json', type: 'json', label: 'Project Config (voice)', required: true },
    ],
    outputSchema: [
      { key: 'voiceover_mp3', type: 'file', label: 'Voiceover Audio', filePath: 'audio/voiceover.mp3' },
    ],
    isReady: true,
  },
  {
    slug: 'avatar-spokesperson',
    name: 'Avatar / Spokesperson',
    category: 'audio',
    description: 'Genereert AI spokesperson video met lip-sync',
    executorFn: 'executeStepAvatar',
    executorLabel: 'HeyGen',
    toolPrimary: 'HeyGen',
    outputFormat: 'file',
    inputSchema: [
      { key: 'voiceover_mp3', type: 'file', label: 'Voiceover Audio', required: true },
      { key: 'config_json', type: 'json', label: 'Project Config', required: true },
    ],
    outputSchema: [
      { key: 'spokesperson_mp4', type: 'file', label: 'Spokesperson Video', filePath: 'assets/spokesperson.mp4' },
    ],
    isReady: false,
  },
  {
    slug: 'timestamps-ophalen',
    name: 'Timestamps Ophalen',
    category: 'audio',
    description: 'Haalt woord-level timestamps op van de voiceover via AssemblyAI',
    executorFn: 'executeStep5',
    executorLabel: 'AssemblyAI',
    toolPrimary: 'AssemblyAI',
    outputFormat: 'json',
    inputSchema: [
      { key: 'voiceover_mp3', type: 'file', label: 'Voiceover Audio', required: true },
    ],
    outputSchema: [
      { key: 'timestamps_json', type: 'json', label: 'Word Timestamps', filePath: 'audio/timestamps.json' },
    ],
    isReady: true,
  },
  {
    slug: 'clip-posities',
    name: 'Clip Posities Berekenen',
    category: 'audio',
    description: 'Berekent begin/eind posities van visuele segmenten op basis van timestamps',
    executorFn: 'executeStepClipPositions',
    executorLabel: 'App',
    outputFormat: 'json',
    inputSchema: [
      { key: 'timestamps_json', type: 'json', label: 'Word Timestamps', required: true },
      { key: 'script_txt', type: 'text', label: 'Script', required: true },
    ],
    outputSchema: [
      { key: 'clip_positions_json', type: 'json', label: 'Clip Posities', filePath: 'audio/clip-positions.json' },
    ],
    isReady: true,
  },

  // ── Creative Direction ──
  {
    slug: 'creative-director',
    name: 'Creative Director',
    category: 'visual',
    description: 'Maakt visueel masterplan: welke beelden/scenes bij welk script segment',
    executorFn: 'executeStepCreativeDirector',
    executorLabel: 'Elevate Opus',
    toolPrimary: 'Elevate Chat API',
    llmModel: 'Claude Opus 4.5',
    outputFormat: 'json',
    inputSchema: [
      { key: 'script_txt', type: 'text', label: 'Script', required: true },
      { key: 'timestamps_json', type: 'json', label: 'Timestamps', required: true },
      { key: 'clip_positions_json', type: 'json', label: 'Clip Posities', required: true },
      { key: 'research_json', type: 'json', label: 'Research Data', required: false },
      { key: 'style_profile_json', type: 'json', label: 'Style Profile', required: true },
    ],
    outputSchema: [
      { key: 'creative_director_json', type: 'json', label: 'Visueel Masterplan', filePath: 'script/creative-director.json' },
    ],
    defaultConfig: { temperature: 0.8, maxTokens: 16000 },
    isReady: false,
  },

  // ── Asset Generatie: B-Roll ──
  {
    slug: 'broll-queries',
    name: 'B-Roll Zoekquery\'s Genereren',
    category: 'visual',
    description: 'LLM genereert zoektermen voor stock footage',
    executorFn: 'executeStepBrollQueries',
    executorLabel: 'Elevate Sonnet',
    toolPrimary: 'Elevate Chat API',
    llmModel: 'Claude Sonnet 4.5',
    outputFormat: 'json',
    inputSchema: [
      { key: 'creative_director_json', type: 'json', label: 'Visueel Masterplan', required: true },
    ],
    outputSchema: [
      { key: 'broll_queries_json', type: 'json', label: 'B-Roll Zoekquery\'s', filePath: 'assets/broll-queries.json' },
    ],
    defaultConfig: { temperature: 0.7 },
    isReady: true,
  },
  {
    slug: 'stock-footage-zoeken',
    name: 'Stock Footage Zoeken',
    category: 'visual',
    description: 'Zoekt stock footage via Pexels/Pixabay API',
    executorFn: 'executeStepStockSearch',
    executorLabel: 'Pexels API',
    toolPrimary: 'Elevate Media API',
    outputFormat: 'json',
    inputSchema: [
      { key: 'broll_queries_json', type: 'json', label: 'B-Roll Zoekquery\'s', required: true },
    ],
    outputSchema: [
      { key: 'broll_results_json', type: 'json', label: 'Zoekresultaten', filePath: 'assets/broll-search-results.json' },
    ],
    isReady: true,
  },
  {
    slug: 'broll-downloaden',
    name: 'B-Roll Downloaden',
    category: 'visual',
    description: 'Download stock footage + Ken Burns effect toepassen',
    executorFn: 'executeStepBrollDownload',
    executorLabel: 'FFmpeg',
    outputFormat: 'multi-file',
    inputSchema: [
      { key: 'broll_results_json', type: 'json', label: 'Zoekresultaten', required: true },
    ],
    outputSchema: [
      { key: 'broll_files', type: 'directory', label: 'B-Roll Bestanden', filePath: 'assets/broll/' },
    ],
    isReady: true,
  },

  // ── Asset Generatie: YouTube Clips ──
  {
    slug: 'youtube-clips-zoeken',
    name: 'YouTube Clips Zoeken',
    category: 'visual',
    description: 'Bepaalt welke YouTube clips nodig zijn op basis van creative director plan',
    executorFn: 'executeStepYoutubeClipsSearch',
    executorLabel: 'App',
    outputFormat: 'json',
    inputSchema: [
      { key: 'creative_director_json', type: 'json', label: 'Visueel Masterplan', required: true },
      { key: 'clips_research_json', type: 'json', label: 'Clips Research', required: false },
    ],
    outputSchema: [
      { key: 'youtube_clips_plan_json', type: 'json', label: 'Clips Download Plan', filePath: 'assets/youtube-clips-plan.json' },
    ],
    isReady: true,
  },
  {
    slug: 'youtube-clips-downloaden',
    name: 'YouTube Clips Downloaden & Trimmen',
    category: 'visual',
    description: 'Download YouTube clips en trim naar juiste segmenten',
    executorFn: 'executeStep8',
    executorLabel: 'Video Download API',
    toolPrimary: 'Video Download API',
    outputFormat: 'multi-file',
    inputSchema: [
      { key: 'youtube_clips_plan_json', type: 'json', label: 'Clips Download Plan', required: true },
    ],
    outputSchema: [
      { key: 'clips_files', type: 'directory', label: 'Clip Bestanden', filePath: 'assets/clips/' },
    ],
    isReady: true,
  },

  // ── AI Visuals ──
  {
    slug: 'scene-prompts',
    name: 'Scene Prompts Genereren',
    category: 'visual',
    description: 'LLM genereert gedetailleerde image prompts per scene',
    executorFn: 'executeStep6',
    executorLabel: 'Elevate Sonnet',
    toolPrimary: 'Elevate Chat API',
    llmModel: 'Claude Sonnet 4.5',
    outputFormat: 'json',
    inputSchema: [
      { key: 'creative_director_json', type: 'json', label: 'Visueel Masterplan', required: true },
      { key: 'timestamps_json', type: 'json', label: 'Timestamps', required: true },
    ],
    outputSchema: [
      { key: 'scene_prompts_json', type: 'json', label: 'Scene Prompts', filePath: 'assets/scene-prompts.json' },
    ],
    defaultConfig: { temperature: 0.8 },
    isReady: true,
  },
  {
    slug: 'ai-images-genereren',
    name: 'AI Images Genereren',
    category: 'visual',
    description: 'Genereert AI images per scene via Elevate Image API',
    executorFn: 'executeStep6b',
    executorLabel: 'Elevate Image',
    toolPrimary: 'Elevate Media API',
    outputFormat: 'multi-file',
    inputSchema: [
      { key: 'scene_prompts_json', type: 'json', label: 'Scene Prompts', required: true },
    ],
    outputSchema: [
      { key: 'images_files', type: 'directory', label: 'AI Images', filePath: 'assets/images/' },
    ],
    isReady: true,
  },
  {
    slug: 'ai-video-scenes',
    name: 'AI Video Scenes (Image-to-Video)',
    category: 'visual',
    description: 'Zet AI images om naar video scenes via Elevate/GenAIPro',
    executorFn: 'executeStep9',
    executorLabel: 'Elevate/GenAIPro Video',
    toolPrimary: 'Elevate Media API',
    toolFallback: 'GenAIPro',
    outputFormat: 'multi-file',
    inputSchema: [
      { key: 'images_files', type: 'directory', label: 'AI Images', required: true },
      { key: 'scene_prompts_json', type: 'json', label: 'Scene Prompts (motion instructions)', required: true },
    ],
    outputSchema: [
      { key: 'scenes_files', type: 'directory', label: 'Video Scenes', filePath: 'assets/scenes/' },
    ],
    isReady: true,
  },

  // ── Motion Graphics ──
  {
    slug: 'motion-graphics',
    name: 'Motion Graphics Genereren',
    category: 'visual',
    description: 'Data visualisaties, kaarten, grafieken als video overlays',
    executorFn: 'executeStepMotionGraphics',
    executorLabel: 'Python/FFmpeg',
    outputFormat: 'multi-file',
    inputSchema: [
      { key: 'creative_director_json', type: 'json', label: 'Visueel Masterplan', required: true },
    ],
    outputSchema: [
      { key: 'motion_graphics_files', type: 'directory', label: 'Motion Graphics', filePath: 'assets/motion-graphics/' },
    ],
    isReady: false,
  },

  // ── Post-productie ──
  {
    slug: 'directors-cut',
    name: 'Director\'s Cut (Montageplan)',
    category: 'post',
    description: 'Technisch montageplan met exacte tijdcodes en bestandsreferenties',
    executorFn: 'executeStepDirectorsCut',
    executorLabel: 'Elevate Opus',
    toolPrimary: 'Elevate Chat API',
    llmModel: 'Claude Opus 4.5',
    outputFormat: 'json',
    inputSchema: [
      { key: 'creative_director_json', type: 'json', label: 'Visueel Masterplan', required: true },
      { key: 'timestamps_json', type: 'json', label: 'Timestamps', required: true },
      { key: 'broll_files', type: 'directory', label: 'B-Roll Bestanden', required: false },
      { key: 'clips_files', type: 'directory', label: 'Clip Bestanden', required: false },
      { key: 'scenes_files', type: 'directory', label: 'Video Scenes', required: false },
      { key: 'motion_graphics_files', type: 'directory', label: 'Motion Graphics', required: false },
    ],
    outputSchema: [
      { key: 'directors_cut_json', type: 'json', label: 'Director\'s Cut', filePath: 'edit/directors-cut.json' },
    ],
    defaultConfig: { temperature: 0.5, maxTokens: 16000 },
    isReady: false,
  },
  {
    slug: 'muziek-preparatie',
    name: 'Muziek Selectie & Preparatie',
    category: 'post',
    description: 'Selecteert en prepareert achtergrondmuziek op basis van het montageplan',
    executorFn: 'executeStepMusicPrep',
    executorLabel: 'FFmpeg',
    outputFormat: 'file',
    inputSchema: [
      { key: 'directors_cut_json', type: 'json', label: 'Director\'s Cut', required: true },
    ],
    outputSchema: [
      { key: 'music_prepared_mp3', type: 'file', label: 'Voorbereide Muziek', filePath: 'audio/music-prepared.mp3' },
    ],
    isReady: false,
  },
  {
    slug: 'final-assembly',
    name: 'Final Assembly',
    category: 'post',
    description: 'Assembleert alle assets tot de uiteindelijke video (incl. transitions, subtitles, color grading, overlays, SFX)',
    executorFn: 'executeStepFinalAssembly',
    executorLabel: 'FFmpeg',
    outputFormat: 'file',
    inputSchema: [
      { key: 'directors_cut_json', type: 'json', label: 'Director\'s Cut', required: true },
      { key: 'voiceover_mp3', type: 'file', label: 'Voiceover Audio', required: true },
      { key: 'music_prepared_mp3', type: 'file', label: 'Voorbereide Muziek', required: false },
      { key: 'config_json', type: 'json', label: 'Project Config (subtitles, color grading)', required: true },
    ],
    outputSchema: [
      { key: 'final_mp4', type: 'file', label: 'Finale Video', filePath: 'output/final.mp4' },
    ],
    isReady: false,
  },

  // ── Output ──
  {
    slug: 'thumbnail-genereren',
    name: 'Thumbnail Genereren',
    category: 'output',
    description: 'Genereert een thumbnail voor de video',
    executorFn: 'executeStepThumbnail',
    executorLabel: 'App',
    outputFormat: 'file',
    inputSchema: [
      { key: 'final_mp4', type: 'file', label: 'Finale Video', required: true },
    ],
    outputSchema: [
      { key: 'thumbnail_png', type: 'file', label: 'Thumbnail', filePath: 'output/thumbnail.png' },
    ],
    isReady: false,
  },
  {
    slug: 'drive-upload',
    name: 'Google Drive Upload',
    category: 'output',
    description: 'Upload finale video naar Google Drive',
    executorFn: 'executeStep14',
    executorLabel: 'Google Drive',
    outputFormat: 'text',
    inputSchema: [
      { key: 'final_mp4', type: 'file', label: 'Finale Video', required: true },
    ],
    outputSchema: [
      { key: 'drive_url', type: 'text', label: 'Drive URL', filePath: '' },
    ],
    isReady: true,
  },
];

// ═══════════════════════════════════════════════════════════
// PIPELINE DEFINITIONS — 6 video types
// ═══════════════════════════════════════════════════════════

// Layout helpers: posities op canvas (x, y)
const X = { start: 50, research: 300, script: 600, audio: 900, creative: 1200, assets: 1500, post: 1900, output: 2200 };
const Y = { top: 50, mid: 200, bot: 350, bot2: 500 };

// Verbindingen als [sourceSlug.outputKey → targetSlug.inputKey]
type Conn = { from: string; fromKey: string; to: string; toKey: string };

interface PipelineDef {
  name: string;
  slug: string;
  description: string;
  nodes: { slug: string; x: number; y: number; isCheckpoint?: boolean; timeout?: number; maxRetries?: number }[];
  connections: Conn[];
}

// Gemeenschappelijke verbindingen die bijna alle pipelines delen
const COMMON_CONNECTIONS: Conn[] = [
  // Config → Research & Transcripts
  { from: 'config-validation', fromKey: 'config_json', to: 'research-json', toKey: 'config_json' },
  { from: 'config-validation', fromKey: 'config_json', to: 'transcripts-ophalen', toKey: 'config_json' },
  { from: 'config-validation', fromKey: 'config_json', to: 'voice-over', toKey: 'config_json' },
  { from: 'config-validation', fromKey: 'config_json', to: 'final-assembly', toKey: 'config_json' },
  // Research + Transcripts → Style Profile
  { from: 'research-json', fromKey: 'research_json', to: 'style-profile', toKey: 'research_json' },
  { from: 'transcripts-ophalen', fromKey: 'transcripts_txt', to: 'style-profile', toKey: 'transcripts_txt' },
  // Research → Script Orchestrator
  { from: 'research-json', fromKey: 'research_json', to: 'script-orchestrator', toKey: 'research_json' },
  { from: 'transcripts-ophalen', fromKey: 'transcripts_txt', to: 'script-orchestrator', toKey: 'transcripts_txt' },
  { from: 'style-profile', fromKey: 'style_profile_json', to: 'script-orchestrator', toKey: 'style_profile_json' },
  // Script Orchestrator → Script
  { from: 'script-orchestrator', fromKey: 'script_outline_json', to: 'script-schrijven', toKey: 'script_outline_json' },
  { from: 'style-profile', fromKey: 'style_profile_json', to: 'script-schrijven', toKey: 'style_profile_json' },
  // Script → Voice Over
  { from: 'script-schrijven', fromKey: 'script_txt', to: 'voice-over', toKey: 'script_txt' },
  // Voice Over → Timestamps → Clip Posities
  { from: 'voice-over', fromKey: 'voiceover_mp3', to: 'timestamps-ophalen', toKey: 'voiceover_mp3' },
  { from: 'timestamps-ophalen', fromKey: 'timestamps_json', to: 'clip-posities', toKey: 'timestamps_json' },
  { from: 'script-schrijven', fromKey: 'script_txt', to: 'clip-posities', toKey: 'script_txt' },
  // Creative Director inputs
  { from: 'script-schrijven', fromKey: 'script_txt', to: 'creative-director', toKey: 'script_txt' },
  { from: 'timestamps-ophalen', fromKey: 'timestamps_json', to: 'creative-director', toKey: 'timestamps_json' },
  { from: 'clip-posities', fromKey: 'clip_positions_json', to: 'creative-director', toKey: 'clip_positions_json' },
  { from: 'style-profile', fromKey: 'style_profile_json', to: 'creative-director', toKey: 'style_profile_json' },
  // Director's Cut → Music → Final
  { from: 'directors-cut', fromKey: 'directors_cut_json', to: 'muziek-preparatie', toKey: 'directors_cut_json' },
  { from: 'directors-cut', fromKey: 'directors_cut_json', to: 'final-assembly', toKey: 'directors_cut_json' },
  { from: 'voice-over', fromKey: 'voiceover_mp3', to: 'final-assembly', toKey: 'voiceover_mp3' },
  { from: 'muziek-preparatie', fromKey: 'music_prepared_mp3', to: 'final-assembly', toKey: 'music_prepared_mp3' },
  // Final → Output
  { from: 'final-assembly', fromKey: 'final_mp4', to: 'drive-upload', toKey: 'final_mp4' },
];

// B-Roll keten
const BROLL_CONNECTIONS: Conn[] = [
  { from: 'creative-director', fromKey: 'creative_director_json', to: 'broll-queries', toKey: 'creative_director_json' },
  { from: 'broll-queries', fromKey: 'broll_queries_json', to: 'stock-footage-zoeken', toKey: 'broll_queries_json' },
  { from: 'stock-footage-zoeken', fromKey: 'broll_results_json', to: 'broll-downloaden', toKey: 'broll_results_json' },
  { from: 'broll-downloaden', fromKey: 'broll_files', to: 'directors-cut', toKey: 'broll_files' },
];

// YouTube clips keten
const CLIPS_CONNECTIONS: Conn[] = [
  { from: 'creative-director', fromKey: 'creative_director_json', to: 'youtube-clips-zoeken', toKey: 'creative_director_json' },
  { from: 'trending-clips-research', fromKey: 'clips_research_json', to: 'youtube-clips-zoeken', toKey: 'clips_research_json' },
  { from: 'youtube-clips-zoeken', fromKey: 'youtube_clips_plan_json', to: 'youtube-clips-downloaden', toKey: 'youtube_clips_plan_json' },
  { from: 'youtube-clips-downloaden', fromKey: 'clips_files', to: 'directors-cut', toKey: 'clips_files' },
];

// Trending clips research → script orchestrator
const TRENDING_CONN: Conn = { from: 'trending-clips-research', fromKey: 'clips_research_json', to: 'script-orchestrator', toKey: 'clips_research_json' };

// AI visuals keten
const AI_VISUAL_CONNECTIONS: Conn[] = [
  { from: 'creative-director', fromKey: 'creative_director_json', to: 'scene-prompts', toKey: 'creative_director_json' },
  { from: 'timestamps-ophalen', fromKey: 'timestamps_json', to: 'scene-prompts', toKey: 'timestamps_json' },
  { from: 'scene-prompts', fromKey: 'scene_prompts_json', to: 'ai-images-genereren', toKey: 'scene_prompts_json' },
  { from: 'ai-images-genereren', fromKey: 'images_files', to: 'ai-video-scenes', toKey: 'images_files' },
  { from: 'scene-prompts', fromKey: 'scene_prompts_json', to: 'ai-video-scenes', toKey: 'scene_prompts_json' },
  { from: 'ai-video-scenes', fromKey: 'scenes_files', to: 'directors-cut', toKey: 'scenes_files' },
];

// Motion graphics keten
const MOTION_CONN: Conn[] = [
  { from: 'creative-director', fromKey: 'creative_director_json', to: 'motion-graphics', toKey: 'creative_director_json' },
  { from: 'motion-graphics', fromKey: 'motion_graphics_files', to: 'directors-cut', toKey: 'motion_graphics_files' },
];

// Research → trending clips
const RESEARCH_TRENDING: Conn[] = [
  { from: 'research-json', fromKey: 'research_json', to: 'trending-clips-research', toKey: 'research_json' },
  { from: 'config-validation', fromKey: 'config_json', to: 'trending-clips-research', toKey: 'config_json' },
];

// Base nodes die alle pipelines hebben
const BASE_NODES = [
  { slug: 'config-validation', x: X.start, y: Y.mid },
  { slug: 'research-json', x: X.research, y: Y.top, timeout: 600000 },
  { slug: 'transcripts-ophalen', x: X.research, y: Y.bot },
  { slug: 'style-profile', x: X.research + 150, y: Y.mid },
  { slug: 'script-orchestrator', x: X.script, y: Y.mid, isCheckpoint: true, timeout: 300000 },
  { slug: 'script-schrijven', x: X.script + 200, y: Y.mid, isCheckpoint: true, timeout: 600000 },
  { slug: 'voice-over', x: X.audio, y: Y.mid, timeout: 180000 },
  { slug: 'timestamps-ophalen', x: X.audio + 150, y: Y.mid, timeout: 300000 },
  { slug: 'clip-posities', x: X.audio + 300, y: Y.mid },
  { slug: 'creative-director', x: X.creative, y: Y.mid, isCheckpoint: true, timeout: 300000 },
  { slug: 'directors-cut', x: X.post, y: Y.mid, timeout: 300000 },
  { slug: 'muziek-preparatie', x: X.post + 200, y: Y.top },
  { slug: 'final-assembly', x: X.post + 400, y: Y.mid, timeout: 1800000 },
  { slug: 'drive-upload', x: X.output, y: Y.mid, timeout: 600000 },
];

const PIPELINES: PipelineDef[] = [
  {
    name: 'AI Generated Video',
    slug: 'ai',
    description: 'Volledig AI-gegenereerde videos met AI images en video scenes',
    nodes: [
      ...BASE_NODES,
      // AI visuals
      { slug: 'scene-prompts', x: X.assets, y: Y.top, timeout: 300000 },
      { slug: 'ai-images-genereren', x: X.assets + 150, y: Y.top, timeout: 3600000 },
      { slug: 'ai-video-scenes', x: X.assets + 300, y: Y.top, timeout: 3600000 },
      // B-Roll
      { slug: 'broll-queries', x: X.assets, y: Y.bot },
      { slug: 'stock-footage-zoeken', x: X.assets + 150, y: Y.bot },
      { slug: 'broll-downloaden', x: X.assets + 300, y: Y.bot, timeout: 1800000 },
      // Motion graphics
      { slug: 'motion-graphics', x: X.assets, y: Y.bot2 },
    ],
    connections: [...COMMON_CONNECTIONS, ...BROLL_CONNECTIONS, ...AI_VISUAL_CONNECTIONS, ...MOTION_CONN],
  },
  {
    name: 'Trending Video',
    slug: 'trending',
    description: 'Videos met trending YouTube clips en stock footage',
    nodes: [
      ...BASE_NODES,
      { slug: 'trending-clips-research', x: X.research, y: Y.bot2, timeout: 600000 },
      // B-Roll
      { slug: 'broll-queries', x: X.assets, y: Y.top },
      { slug: 'stock-footage-zoeken', x: X.assets + 150, y: Y.top },
      { slug: 'broll-downloaden', x: X.assets + 300, y: Y.top, timeout: 1800000 },
      // YouTube clips
      { slug: 'youtube-clips-zoeken', x: X.assets, y: Y.bot },
      { slug: 'youtube-clips-downloaden', x: X.assets + 200, y: Y.bot, timeout: 1800000 },
      // Motion graphics
      { slug: 'motion-graphics', x: X.assets, y: Y.bot2 },
    ],
    connections: [...COMMON_CONNECTIONS, ...RESEARCH_TRENDING, TRENDING_CONN, ...BROLL_CONNECTIONS, ...CLIPS_CONNECTIONS, ...MOTION_CONN],
  },
  {
    name: 'Documentary',
    slug: 'documentary',
    description: 'Documentaire-stijl videos met stock footage en YouTube clips',
    nodes: [
      ...BASE_NODES,
      // B-Roll
      { slug: 'broll-queries', x: X.assets, y: Y.top },
      { slug: 'stock-footage-zoeken', x: X.assets + 150, y: Y.top },
      { slug: 'broll-downloaden', x: X.assets + 300, y: Y.top, timeout: 1800000 },
      // YouTube clips
      { slug: 'youtube-clips-zoeken', x: X.assets, y: Y.bot },
      { slug: 'youtube-clips-downloaden', x: X.assets + 200, y: Y.bot, timeout: 1800000 },
      // Motion graphics
      { slug: 'motion-graphics', x: X.assets, y: Y.bot2 },
    ],
    connections: [...COMMON_CONNECTIONS, ...BROLL_CONNECTIONS, ...CLIPS_CONNECTIONS, ...MOTION_CONN],
  },
  {
    name: 'Compilation Video',
    slug: 'compilation',
    description: 'Compilatie van YouTube clips met minimale aanvulling',
    nodes: [
      ...BASE_NODES,
      { slug: 'trending-clips-research', x: X.research, y: Y.bot2, timeout: 600000 },
      // YouTube clips (primair)
      { slug: 'youtube-clips-zoeken', x: X.assets, y: Y.mid },
      { slug: 'youtube-clips-downloaden', x: X.assets + 200, y: Y.mid, timeout: 1800000 },
      // Motion graphics
      { slug: 'motion-graphics', x: X.assets, y: Y.bot },
    ],
    connections: [...COMMON_CONNECTIONS, ...RESEARCH_TRENDING, TRENDING_CONN, ...CLIPS_CONNECTIONS, ...MOTION_CONN],
  },
  {
    name: 'Spokesperson AI',
    slug: 'spokesperson_ai',
    description: 'AI spokesperson met lip-sync + AI generated visuals',
    nodes: [
      ...BASE_NODES,
      { slug: 'avatar-spokesperson', x: X.audio + 100, y: Y.bot },
      // AI visuals
      { slug: 'scene-prompts', x: X.assets, y: Y.top, timeout: 300000 },
      { slug: 'ai-images-genereren', x: X.assets + 150, y: Y.top, timeout: 3600000 },
      { slug: 'ai-video-scenes', x: X.assets + 300, y: Y.top, timeout: 3600000 },
      // Motion graphics
      { slug: 'motion-graphics', x: X.assets, y: Y.bot },
    ],
    connections: [
      ...COMMON_CONNECTIONS, ...AI_VISUAL_CONNECTIONS, ...MOTION_CONN,
      { from: 'voice-over', fromKey: 'voiceover_mp3', to: 'avatar-spokesperson', toKey: 'voiceover_mp3' },
      { from: 'config-validation', fromKey: 'config_json', to: 'avatar-spokesperson', toKey: 'config_json' },
    ],
  },
  {
    name: 'Spokesperson (Echt)',
    slug: 'spokesperson',
    description: 'Echte spokesperson met clips, b-roll en stock footage',
    nodes: [
      ...BASE_NODES,
      { slug: 'trending-clips-research', x: X.research, y: Y.bot2, timeout: 600000 },
      { slug: 'avatar-spokesperson', x: X.audio + 100, y: Y.bot },
      // B-Roll
      { slug: 'broll-queries', x: X.assets, y: Y.top },
      { slug: 'stock-footage-zoeken', x: X.assets + 150, y: Y.top },
      { slug: 'broll-downloaden', x: X.assets + 300, y: Y.top, timeout: 1800000 },
      // YouTube clips
      { slug: 'youtube-clips-zoeken', x: X.assets, y: Y.bot },
      { slug: 'youtube-clips-downloaden', x: X.assets + 200, y: Y.bot, timeout: 1800000 },
      // Motion graphics
      { slug: 'motion-graphics', x: X.assets, y: Y.bot2 },
    ],
    connections: [
      ...COMMON_CONNECTIONS, ...RESEARCH_TRENDING, TRENDING_CONN, ...BROLL_CONNECTIONS, ...CLIPS_CONNECTIONS, ...MOTION_CONN,
      { from: 'voice-over', fromKey: 'voiceover_mp3', to: 'avatar-spokesperson', toKey: 'voiceover_mp3' },
      { from: 'config-validation', fromKey: 'config_json', to: 'avatar-spokesperson', toKey: 'config_json' },
    ],
  },
];

// ═══════════════════════════════════════════════════════════
// SEED EXECUTION
// ═══════════════════════════════════════════════════════════

async function seed() {
  console.log('🌱 Pipeline Builder v3 seed starten...\n');

  // Haal bestaande LLM models op voor koppeling
  const llmModels = await prisma.llmModel.findMany();
  const findModel = (name: string) => llmModels.find(m => m.name === name)?.id;

  // Haal bestaande API tools op
  const apiTools = await prisma.apiTool.findMany();
  const findTool = (name: string) => apiTools.find(t => t.name === name)?.id;

  // ── 1. Step Definitions seeden ──
  console.log('📋 Step Definitions seeden...');
  const stepDefMap: Record<string, number> = {};

  for (const def of STEP_DEFINITIONS) {
    const data = {
      name: def.name,
      slug: def.slug,
      category: def.category,
      description: def.description,
      executorFn: def.executorFn,
      executorLabel: def.executorLabel,
      toolPrimaryId: def.toolPrimary ? findTool(def.toolPrimary) : null,
      toolFallbackId: def.toolFallback ? findTool(def.toolFallback) : null,
      llmModelId: def.llmModel ? findModel(def.llmModel) : null,
      defaultConfig: JSON.stringify(def.defaultConfig || {}),
      systemPrompt: def.systemPrompt || '',
      userPromptTpl: def.userPromptTpl || '',
      outputFormat: def.outputFormat || '',
      inputSchema: JSON.stringify(def.inputSchema),
      outputSchema: JSON.stringify(def.outputSchema),
      isReady: def.isReady ?? false,
    };

    const result = await prisma.stepDefinition.upsert({
      where: { slug: def.slug },
      update: data,
      create: data,
    });
    stepDefMap[def.slug] = result.id;
    console.log(`  ✅ ${def.name} (${def.slug}) ${def.isReady ? '' : '— skeleton'}`);
  }

  // ── 2. Pipelines seeden ──
  console.log('\n🔗 Pipelines seeden...');

  for (const pDef of PIPELINES) {
    // Pipeline aanmaken/updaten
    const pipeline = await prisma.pipeline.upsert({
      where: { slug: pDef.slug },
      update: { name: pDef.name, description: pDef.description },
      create: { name: pDef.name, slug: pDef.slug, description: pDef.description, isDefault: true },
    });

    // Bestaande nodes en connections verwijderen (clean re-seed)
    await prisma.pipelineConnection.deleteMany({ where: { pipelineId: pipeline.id } });
    await prisma.pipelineNode.deleteMany({ where: { pipelineId: pipeline.id } });

    // Nodes aanmaken
    const nodeMap: Record<string, number> = {};
    for (let i = 0; i < pDef.nodes.length; i++) {
      const nDef = pDef.nodes[i];
      const stepDefId = stepDefMap[nDef.slug];
      if (!stepDefId) {
        console.warn(`  ⚠️ StepDefinition "${nDef.slug}" niet gevonden, skip`);
        continue;
      }

      const node = await prisma.pipelineNode.create({
        data: {
          pipelineId: pipeline.id,
          stepDefinitionId: stepDefId,
          positionX: nDef.x,
          positionY: nDef.y,
          sortOrder: i,
          isCheckpoint: nDef.isCheckpoint ?? false,
          timeout: nDef.timeout ?? 300000,
          maxRetries: nDef.maxRetries ?? 3,
        },
      });
      nodeMap[nDef.slug] = node.id;
    }

    // Connections aanmaken
    let connCount = 0;
    for (const conn of pDef.connections) {
      const sourceNodeId = nodeMap[conn.from];
      const targetNodeId = nodeMap[conn.to];
      if (!sourceNodeId || !targetNodeId) continue; // Node niet in deze pipeline

      await prisma.pipelineConnection.create({
        data: {
          pipelineId: pipeline.id,
          sourceNodeId,
          sourceOutputKey: conn.fromKey,
          targetNodeId,
          targetInputKey: conn.toKey,
        },
      });
      connCount++;
    }

    console.log(`  ✅ ${pDef.name} (${pDef.slug}): ${Object.keys(nodeMap).length} nodes, ${connCount} connections`);
  }

  // ── Samenvatting ──
  const totalDefs = await prisma.stepDefinition.count();
  const totalPipelines = await prisma.pipeline.count();
  const totalNodes = await prisma.pipelineNode.count();
  const totalConns = await prisma.pipelineConnection.count();

  console.log(`\n✅ Pipeline Builder v3 seed voltooid!`);
  console.log(`   - ${totalDefs} step definitions`);
  console.log(`   - ${totalPipelines} pipelines`);
  console.log(`   - ${totalNodes} pipeline nodes`);
  console.log(`   - ${totalConns} connections`);

  const skeletons = await prisma.stepDefinition.findMany({ where: { isReady: false } });
  console.log(`\n📋 Skeleton stappen (${skeletons.length}):`);
  for (const s of skeletons) console.log(`   - ${s.name} (${s.slug})`);
}

seed()
  .catch(e => { console.error('❌', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
