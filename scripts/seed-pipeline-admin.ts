/**
 * Seed Script — Pipeline Admin v2.0
 * 
 * Migreert de v2 pipeline specificatie naar de database.
 * 24 stappen (0-23), nieuwe Creative Director flow.
 * Veilig om meerdere keren te draaien (upsert logica).
 * 
 * Gebruik: npx tsx scripts/seed-pipeline-admin.ts
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// ═══════════════════════════════════════════════
// LLM MODELLEN
// ═══════════════════════════════════════════════

const LLM_MODELS = [
  { name: 'Claude Sonnet 4.5', provider: 'Elevate', modelString: 'claude-sonnet-4.5', modelType: 'chat', baseUrl: 'https://chat-api.elevate.uno/v1', supportsStream: true, maxTokens: 8192, notes: 'Standaard chat model' },
  { name: 'Claude Opus 4.5', provider: 'Elevate', modelString: 'claude-opus-4.5', modelType: 'chat', baseUrl: 'https://chat-api.elevate.uno/v1', supportsStream: true, maxTokens: 16384, notes: 'Orchestrator, Creative Director, complexe taken' },
  { name: 'GPT-5', provider: 'Elevate', modelString: 'gpt-5', modelType: 'chat', baseUrl: 'https://chat-api.elevate.uno/v1', supportsStream: true, maxTokens: 8192, notes: 'Alternatief chat model' },
  { name: 'DeepSeek v3.1', provider: 'Elevate', modelString: 'deepseek-v3.1', modelType: 'chat', baseUrl: 'https://chat-api.elevate.uno/v1', supportsStream: true, maxTokens: 8192, notes: 'Alternatief chat model' },
  { name: 'Gemini 3 Pro', provider: 'Elevate', modelString: 'gemini-3-pro', modelType: 'chat', baseUrl: 'https://chat-api.elevate.uno/v1', supportsStream: true, maxTokens: 8192, notes: 'Alternatief chat model' },
  { name: 'Sonar Deep Research', provider: 'Perplexity', modelString: 'sonar-deep-research', modelType: 'research', baseUrl: 'https://api.perplexity.ai', supportsStream: false, notes: 'Research — diepgaand' },
  { name: 'Sonar Pro', provider: 'Perplexity', modelString: 'sonar-pro', modelType: 'research', baseUrl: 'https://api.perplexity.ai', supportsStream: false, notes: 'Research — sneller' },
  { name: 'ElevenLabs Flash v2.5', provider: 'Elevate', modelString: 'eleven_flash_v2_5', modelType: 'tts', baseUrl: 'https://public-api.elevate.uno', supportsStream: false, notes: 'TTS — snel' },
  { name: 'ElevenLabs Multilingual v2', provider: 'Elevate', modelString: 'eleven_multilingual_v2', modelType: 'tts', baseUrl: 'https://public-api.elevate.uno', supportsStream: false, notes: 'TTS — meertalig' },
  { name: 'ElevenLabs Turbo v2.5', provider: 'Elevate', modelString: 'eleven_turbo_v2_5', modelType: 'tts', baseUrl: 'https://public-api.elevate.uno', supportsStream: false, notes: 'TTS — snelste, uit v2 spec' },
  { name: 'Elevate Image Gen', provider: 'Elevate', modelString: 'image', modelType: 'image', baseUrl: 'https://public-api.elevate.uno', supportsStream: false, notes: 'AI images (~10-20s)' },
  { name: 'Elevate Video Gen', provider: 'Elevate', modelString: 'video', modelType: 'video', baseUrl: 'https://public-api.elevate.uno', supportsStream: false, notes: 'AI video (~2-5 min), 1 concurrent' },
  { name: 'GenAIPro Video', provider: 'GenAIPro', modelString: 'genai-video', modelType: 'video', baseUrl: '', supportsStream: false, notes: 'Video — onbeperkt concurrent' },
];

// ═══════════════════════════════════════════════
// API TOOLS
// ═══════════════════════════════════════════════

const API_TOOLS = [
  { name: 'Elevate Media API', category: 'api', baseUrl: 'https://public-api.elevate.uno', authType: 'bearer', authKeyRef: 'elevateApiKey', healthEndpoint: '/v2/media/health?type=all', notes: 'TTS, Images, Videos' },
  { name: 'Elevate Chat API', category: 'api', baseUrl: 'https://chat-api.elevate.uno/v1', authType: 'bearer', authKeyRef: 'elevateApiKey', healthEndpoint: '/models', notes: 'OpenAI-compatible LLM' },
  { name: 'AssemblyAI', category: 'api', baseUrl: 'https://api.assemblyai.com', authType: 'api-key', authKeyRef: 'assemblyAiApiKey', notes: 'Transcriptie + timestamps' },
  { name: 'Perplexity', category: 'api', baseUrl: 'https://api.perplexity.ai', authType: 'bearer', authKeyRef: 'perplexityApiKey', notes: 'Deep research via Sonar' },
  { name: 'Video Download API', category: 'local', baseUrl: 'http://localhost:3033', authType: 'none', authKeyRef: '', healthEndpoint: '/', notes: 'YouTube clips downloaden' },
  { name: 'Pexels API', category: 'api', baseUrl: 'https://api.pexels.com', authType: 'api-key', authKeyRef: 'pexelsApiKey', notes: 'Stock foto/video' },
  { name: 'HeyGen', category: 'api', baseUrl: '', authType: 'bearer', authKeyRef: '', notes: 'AI Avatar / Spokesperson (TODO)' },
];

// ═══════════════════════════════════════════════
// PIPELINE V2 STAPPEN (24 stappen, 0-23)
// ═══════════════════════════════════════════════

interface StepDef {
  stepNumber: number; name: string; description: string;
  executorLabel: string; executorFn: string;
  dependsOn: number[]; parallelGroup?: string;
  isCheckpoint?: boolean; checkpointCond?: string;
  timeout: number; maxRetries: number; retryDelays: number[];
  readyToUse: boolean;
  toolPrimary: string; toolFallback?: string;
  outputFormat: string; temperature?: number; maxTokens?: number;
  llmModelString?: string; notes?: string;
}

const PIPELINE_STEPS: StepDef[] = [
  // ── Pre-productie ──
  { stepNumber: 0,  name: 'Ideation',               description: 'Project-idee aanmaken en valideren',
    executorLabel: 'App', executorFn: 'auto-complete', dependsOn: [],
    timeout: 30000, maxRetries: 1, retryDelays: [0], readyToUse: false,
    toolPrimary: 'App', outputFormat: '' },

  { stepNumber: 1,  name: 'Project Formulier',       description: 'Valideer configuratie, maak projectmappen, sla config op',
    executorLabel: 'App', executorFn: 'executeStep0', dependsOn: [0],
    timeout: 30000, maxRetries: 1, retryDelays: [0], readyToUse: true,
    toolPrimary: 'App', outputFormat: 'JSON' },

  // ── Research (parallel) ──
  { stepNumber: 2,  name: 'Research JSON',           description: 'Diepgaand feitelijk onderzoek met bronvermelding',
    executorLabel: 'Sonar Deep Research', executorFn: 'executeStepResearch', dependsOn: [1],
    parallelGroup: 'research',
    timeout: 600000, maxRetries: 3, retryDelays: [5000, 15000, 30000], readyToUse: true,
    toolPrimary: 'Perplexity', toolFallback: 'Elevate Chat API', outputFormat: 'JSON',
    llmModelString: 'sonar-deep-research' },

  { stepNumber: 3,  name: 'Transcripts Ophalen',     description: 'Download transcripts van referentie YouTube videos',
    executorLabel: 'App', executorFn: 'executeStep1', dependsOn: [1],
    parallelGroup: 'research',
    timeout: 120000, maxRetries: 3, retryDelays: [5000, 15000, 30000], readyToUse: true,
    toolPrimary: 'YouTube Transcript API', outputFormat: 'TXT' },

  // ── Analyse ──
  { stepNumber: 4,  name: 'Style Profile',           description: 'Analyseer schrijfstijl van referentie transcripts',
    executorLabel: 'Elevate Opus', executorFn: 'executeStep2', dependsOn: [2, 3],
    timeout: 600000, maxRetries: 3, retryDelays: [5000, 15000, 30000], readyToUse: true,
    toolPrimary: 'Elevate Chat API', toolFallback: 'Anthropic Direct', outputFormat: 'JSON',
    temperature: 0.5, maxTokens: 4096, llmModelString: 'claude-opus-4.5' },

  { stepNumber: 5,  name: 'Trending Clips Research', description: 'Zoek echte YouTube clips relevant voor het onderwerp',
    executorLabel: 'Sonar Deep Research', executorFn: 'executeStepTrendingClips', dependsOn: [2],
    timeout: 600000, maxRetries: 3, retryDelays: [5000, 15000, 30000], readyToUse: true,
    toolPrimary: 'Perplexity', outputFormat: 'JSON',
    llmModelString: 'sonar-deep-research' },

  // ── Script ──
  { stepNumber: 6,  name: 'Script Orchestrator',     description: 'Maak gedetailleerde outline/blueprint voor de video',
    executorLabel: 'Elevate Opus', executorFn: 'executeStepScriptOrchestrator', dependsOn: [2, 3, 4, 5],
    timeout: 600000, maxRetries: 3, retryDelays: [5000, 15000, 30000], readyToUse: true,
    isCheckpoint: true,
    toolPrimary: 'Elevate Chat API', outputFormat: 'JSON',
    temperature: 0.6, maxTokens: 16384, llmModelString: 'claude-opus-4.5' },

  { stepNumber: 7,  name: 'Script Schrijven',        description: 'Schrijf het volledige script op basis van outline en style profile',
    executorLabel: 'Elevate Opus', executorFn: 'executeStep3', dependsOn: [6],
    timeout: 600000, maxRetries: 3, retryDelays: [5000, 15000, 30000], readyToUse: true,
    isCheckpoint: true,
    toolPrimary: 'Elevate Chat API', toolFallback: 'Anthropic Direct', outputFormat: 'TXT',
    temperature: 0.8, maxTokens: 16384, llmModelString: 'claude-opus-4.5' },

  { stepNumber: 8,  name: 'Script Checker',          description: 'Quality gate: review script op fouten en kwaliteit',
    executorLabel: 'Elevate Opus', executorFn: 'executeStepScriptChecker', dependsOn: [7],
    timeout: 600000, maxRetries: 3, retryDelays: [5000, 15000, 30000], readyToUse: false,
    toolPrimary: 'Elevate Chat API', toolFallback: 'Anthropic Direct', outputFormat: 'JSON',
    temperature: 0.3, maxTokens: 16384, llmModelString: 'claude-opus-4.5',
    notes: 'NIEUW in v2 — skeleton, nog te bouwen' },

  // ── Audio ──
  { stepNumber: 9,  name: 'Voice Over',              description: 'Genereer TTS audio van het script',
    executorLabel: 'Elevate', executorFn: 'executeStep4', dependsOn: [8],
    timeout: 600000, maxRetries: 3, retryDelays: [5000, 15000, 30000], readyToUse: true,
    toolPrimary: 'Elevate Media API', outputFormat: 'Audio',
    notes: 'Fallback dependency: als stap 8 niet ready, wacht op stap 7' },

  // ── Audio verwerking (parallel) ──
  { stepNumber: 10, name: 'Avatar / Spokesperson',   description: 'Genereer AI avatar video met lipsync',
    executorLabel: 'HeyGen', executorFn: 'skip', dependsOn: [9],
    parallelGroup: 'audio-proc',
    timeout: 600000, maxRetries: 3, retryDelays: [5000, 15000, 30000], readyToUse: false,
    toolPrimary: 'HeyGen', outputFormat: 'Video',
    notes: 'TODO — nog niet gebouwd' },

  { stepNumber: 11, name: 'Timestamps Ophalen',      description: 'Woord-voor-woord timestamps uit voiceover audio',
    executorLabel: 'Assembly AI', executorFn: 'executeStep5', dependsOn: [9],
    parallelGroup: 'audio-proc',
    timeout: 300000, maxRetries: 3, retryDelays: [5000, 15000, 30000], readyToUse: true,
    toolPrimary: 'AssemblyAI', outputFormat: 'JSON' },

  // ── Creative Director ──
  { stepNumber: 12, name: 'Creative Director',       description: 'Visueel masterplan: bepaalt wat kijker ziet bij elk moment',
    executorLabel: 'Elevate Opus', executorFn: 'executeStepCreativeDirector', dependsOn: [11],
    timeout: 600000, maxRetries: 3, retryDelays: [5000, 15000, 30000], readyToUse: false,
    isCheckpoint: true,
    toolPrimary: 'Elevate Chat API', outputFormat: 'JSON',
    temperature: 0.5, maxTokens: 16384, llmModelString: 'claude-opus-4.5',
    notes: 'NIEUW in v2 — vervangt oude Scene Prompts + Directors Cut combo' },

  // ── Asset generatie (parallel) ──
  { stepNumber: 13, name: 'Scene Prompts',           description: 'AI image prompts per scene (alleen AI video types)',
    executorLabel: 'Elevate Opus', executorFn: 'executeStep6', dependsOn: [12],
    parallelGroup: 'assets',
    timeout: 300000, maxRetries: 3, retryDelays: [5000, 15000, 30000], readyToUse: true,
    toolPrimary: 'Elevate Chat API', toolFallback: 'Anthropic Direct', outputFormat: 'JSON',
    temperature: 0.7, maxTokens: 8192, llmModelString: 'claude-opus-4.5' },

  { stepNumber: 14, name: 'Assets Zoeken',           description: 'B-roll footage zoeken en downloaden',
    executorLabel: 'Pexels + TwelveLabs', executorFn: 'executeStep7', dependsOn: [12],
    parallelGroup: 'assets',
    timeout: 5400000, maxRetries: 2, retryDelays: [10000, 30000], readyToUse: true,
    toolPrimary: 'Pexels API + TwelveLabs', outputFormat: 'Video' },

  { stepNumber: 15, name: 'Clips Downloaden',        description: 'YouTube clips downloaden en trimmen',
    executorLabel: 'Video Download API', executorFn: 'executeStep8', dependsOn: [12],
    parallelGroup: 'assets',
    timeout: 5400000, maxRetries: 2, retryDelays: [10000, 30000], readyToUse: true,
    toolPrimary: 'Video Download API', outputFormat: 'Video' },

  { stepNumber: 16, name: 'Images Genereren',        description: 'AI images genereren (alleen AI video types)',
    executorLabel: 'Elevate', executorFn: 'executeStep6b', dependsOn: [13],
    timeout: 3600000, maxRetries: 2, retryDelays: [10000, 30000], readyToUse: true,
    toolPrimary: 'Elevate Media API', toolFallback: 'GenAIPro', outputFormat: 'Image' },

  { stepNumber: 17, name: 'Video Scenes',            description: 'AI video clips via image-to-video (alleen AI types)',
    executorLabel: 'Elevate', executorFn: 'executeStep9', dependsOn: [16],
    timeout: 10800000, maxRetries: 2, retryDelays: [10000, 30000], readyToUse: true,
    toolPrimary: 'Elevate Media API', toolFallback: 'GenAIPro Video', outputFormat: 'Video' },

  // ── Post-productie ──
  { stepNumber: 18, name: "Director's Cut",          description: 'Verfijn masterplan met echte bestanden tot technisch montageplan',
    executorLabel: 'Elevate Opus', executorFn: 'executeStepDirectorsCut', dependsOn: [14, 15, 17, 20],
    timeout: 600000, maxRetries: 2, retryDelays: [10000, 30000], readyToUse: false,
    toolPrimary: 'Elevate Chat API', outputFormat: 'JSON',
    temperature: 0.5, maxTokens: 16384, llmModelString: 'claude-opus-4.5',
    notes: 'v2: nu na Creative Director, werkt met echte bestanden' },

  { stepNumber: 19, name: 'Muziek Preparatie',       description: 'Selecteer en prepareer muziek tracks volgens Directors Cut',
    executorLabel: 'FFMPEG', executorFn: 'executeStepMusicPrep', dependsOn: [18],
    timeout: 600000, maxRetries: 2, retryDelays: [10000, 30000], readyToUse: false,
    toolPrimary: 'FFMPEG + Music Library', outputFormat: 'Audio',
    notes: 'NIEUW in v2 — gescheiden van Final Assembly' },

  { stepNumber: 20, name: 'Motion Graphics',         description: 'Render motion graphics (data visualisaties) als MP4',
    executorLabel: 'Python + FFMPEG', executorFn: 'executeStepMotionGraphics', dependsOn: [12],
    parallelGroup: 'assets',
    timeout: 3600000, maxRetries: 2, retryDelays: [15000, 30000], readyToUse: false,
    toolPrimary: 'Python moviepy', outputFormat: 'Video',
    notes: 'NIEUW in v2 — motion graphics package' },

  // ── Final ──
  { stepNumber: 21, name: 'Final Assembly',          description: 'Finale render: video + audio + subtitles + overlay in één ffmpeg chain',
    executorLabel: 'FFMPEG', executorFn: 'executeStepFinalAssembly', dependsOn: [18, 19],
    timeout: 1800000, maxRetries: 2, retryDelays: [10000, 30000], readyToUse: true,
    toolPrimary: 'FFMPEG', outputFormat: 'Video' },

  { stepNumber: 22, name: 'Thumbnail',               description: 'Genereer een thumbnail voor de video',
    executorLabel: 'Elevate', executorFn: 'skip', dependsOn: [21],
    parallelGroup: 'final',
    timeout: 600000, maxRetries: 2, retryDelays: [10000, 30000], readyToUse: false,
    toolPrimary: 'Elevate Media API', outputFormat: 'Image',
    notes: 'TODO — nog niet gebouwd' },

  { stepNumber: 23, name: 'Drive Upload',            description: 'Upload finale video naar Google Drive',
    executorLabel: 'App', executorFn: 'executeStep14', dependsOn: [21],
    parallelGroup: 'final',
    timeout: 600000, maxRetries: 2, retryDelays: [10000, 30000], readyToUse: true,
    toolPrimary: 'Google Drive API', outputFormat: '' },
];

// ═══════════════════════════════════════════════
// VIDEO TYPE MATRIX v2 (24 stappen, 0-23)
// ═══════════════════════════════════════════════

const VIDEO_TYPE_STEPS: Record<string, Record<number, boolean>> = {
  ai: {
    0: true, 1: true, 2: true, 3: true, 4: true, 5: false,
    6: true, 7: true, 8: true, 9: true, 10: false, 11: true,
    12: true, 13: true, 14: true, 15: false, 16: true, 17: true,
    18: true, 19: true, 20: true, 21: true, 22: false, 23: true,
  },
  spokesperson_ai: {
    0: true, 1: true, 2: true, 3: true, 4: true, 5: false,
    6: true, 7: true, 8: true, 9: false, 10: true, 11: true,
    12: true, 13: true, 14: true, 15: false, 16: true, 17: true,
    18: true, 19: true, 20: true, 21: true, 22: false, 23: true,
  },
  trending: {
    0: true, 1: true, 2: true, 3: true, 4: true, 5: true,
    6: true, 7: true, 8: true, 9: true, 10: false, 11: true,
    12: true, 13: false, 14: true, 15: true, 16: false, 17: false,
    18: true, 19: true, 20: true, 21: true, 22: false, 23: true,
  },
  documentary: {
    0: true, 1: true, 2: true, 3: true, 4: true, 5: false,
    6: true, 7: true, 8: true, 9: true, 10: false, 11: true,
    12: true, 13: false, 14: true, 15: true, 16: false, 17: false,
    18: true, 19: true, 20: true, 21: true, 22: false, 23: true,
  },
  compilation: {
    0: true, 1: true, 2: true, 3: true, 4: true, 5: true,
    6: true, 7: true, 8: true, 9: true, 10: false, 11: true,
    12: true, 13: false, 14: true, 15: true, 16: false, 17: false,
    18: true, 19: true, 20: true, 21: true, 22: false, 23: true,
  },
  spokesperson: {
    0: true, 1: true, 2: true, 3: true, 4: true, 5: true,
    6: true, 7: true, 8: true, 9: false, 10: true, 11: true,
    12: true, 13: false, 14: true, 15: true, 16: false, 17: false,
    18: true, 19: true, 20: true, 21: true, 22: false, 23: true,
  },
};

// ═══════════════════════════════════════════════
// SEED FUNCTIE
// ═══════════════════════════════════════════════

async function seed() {
  console.log('🌱 Pipeline Admin v2 seed starten...\n');

  // ── 1. LLM Modellen ──
  console.log('📊 LLM Modellen seeden...');
  const modelMap: Record<string, number> = {};
  
  for (const model of LLM_MODELS) {
    const existing = await prisma.llmModel.findFirst({ where: { modelString: model.modelString } });
    if (existing) {
      modelMap[model.modelString] = existing.id;
      console.log(`  ⏭ ${model.name} (bestaat al)`);
    } else {
      const created = await prisma.llmModel.create({ data: model });
      modelMap[model.modelString] = created.id;
      console.log(`  ✅ ${model.name}`);
    }
  }

  // ── 2. API Tools ──
  console.log('\n🔧 API Tools seeden...');
  for (const tool of API_TOOLS) {
    const existing = await prisma.apiTool.findFirst({ where: { name: tool.name } });
    if (existing) {
      console.log(`  ⏭ ${tool.name} (bestaat al)`);
    } else {
      await prisma.apiTool.create({ data: tool });
      console.log(`  ✅ ${tool.name}`);
    }
  }

  // ── 3. Pipeline Stappen ──
  console.log('\n🔗 Pipeline Stappen v2 seeden...');
  const stepIdMap: Record<number, number> = {};

  for (const step of PIPELINE_STEPS) {
    const llmModelId = step.llmModelString ? modelMap[step.llmModelString] || null : null;

    const data = {
      stepNumber: step.stepNumber,
      name: step.name,
      description: step.description,
      executorLabel: step.executorLabel,
      executorFn: step.executorFn,
      toolPrimary: step.toolPrimary,
      toolFallback: step.toolFallback || null,
      llmModelId,
      outputFormat: step.outputFormat,
      temperature: step.temperature ?? 0.7,
      maxTokens: step.maxTokens ?? null,
      dependsOn: JSON.stringify(step.dependsOn),
      parallelGroup: step.parallelGroup || null,
      isCheckpoint: step.isCheckpoint || false,
      checkpointCond: step.checkpointCond || null,
      timeout: step.timeout,
      maxRetries: step.maxRetries,
      retryDelays: JSON.stringify(step.retryDelays),
      readyToUse: step.readyToUse,
      isActive: true,
      sortOrder: step.stepNumber,
      notes: step.notes || '',
    };

    // Upsert: als stepNumber al bestaat, update; anders create
    const existing = await prisma.pipelineStep.findUnique({ where: { stepNumber: step.stepNumber } });
    if (existing) {
      await prisma.pipelineStep.update({ where: { stepNumber: step.stepNumber }, data });
      stepIdMap[step.stepNumber] = existing.id;
      console.log(`  🔄 Stap ${step.stepNumber}: ${step.name} (geüpdatet)`);
    } else {
      const created = await prisma.pipelineStep.create({ data });
      stepIdMap[step.stepNumber] = created.id;
      console.log(`  ✅ Stap ${step.stepNumber}: ${step.name}`);
    }
  }

  // Deactiveer stappen die niet meer in v2 zitten (24-25 van v1)
  const v2StepNumbers = PIPELINE_STEPS.map(s => s.stepNumber);
  const oldSteps = await prisma.pipelineStep.findMany({
    where: { stepNumber: { notIn: v2StepNumbers } },
  });
  for (const old of oldSteps) {
    await prisma.pipelineStep.update({
      where: { id: old.id },
      data: { isActive: false, notes: `Gedeactiveerd bij v2 migratie (was: ${old.name})` },
    });
    console.log(`  🗑️ Stap ${old.stepNumber}: ${old.name} (gedeactiveerd — niet in v2)`);
  }

  // ── 4. Video Type Configs ──
  console.log('\n🎬 Video Type Configs seeden...');
  let configCount = 0;

  for (const [videoType, steps] of Object.entries(VIDEO_TYPE_STEPS)) {
    for (const [stepNumStr, enabled] of Object.entries(steps)) {
      const stepNumber = parseInt(stepNumStr);
      const stepId = stepIdMap[stepNumber];
      if (!stepId) continue;

      await prisma.pipelineVideoTypeConfig.upsert({
        where: { videoType_stepId: { videoType, stepId } },
        update: { enabled },
        create: { videoType, stepId, enabled },
      });
      configCount++;
    }
  }
  console.log(`  ✅ ${configCount} configs aangemaakt/geüpdatet`);

  // ── Samenvatting ──
  const readyCount = PIPELINE_STEPS.filter(s => s.readyToUse).length;
  const skeletonCount = PIPELINE_STEPS.filter(s => !s.readyToUse).length;
  
  console.log('\n✅ Pipeline Admin v2 seed voltooid!');
  console.log(`   - ${LLM_MODELS.length} LLM modellen`);
  console.log(`   - ${API_TOOLS.length} API tools`);
  console.log(`   - ${PIPELINE_STEPS.length} pipeline stappen (${readyCount} ready, ${skeletonCount} skeleton)`);
  console.log(`   - ${Object.keys(VIDEO_TYPE_STEPS).length} video types`);
  console.log(`\n📋 Skeleton stappen (nog te bouwen):`);
  PIPELINE_STEPS.filter(s => !s.readyToUse).forEach(s => {
    console.log(`   - Stap ${s.stepNumber}: ${s.name} ${s.notes ? `(${s.notes})` : ''}`);
  });
}

seed()
  .catch((e) => { console.error('❌ Seed fout:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
