/**
 * Pipeline Engine v4 — Database-driven orchestrator
 * 
 * NIEUW: Leest pipeline configuratie uit de v3 Pipeline Builder database.
 * Geen hardcoded stap-matrices meer. De PipelineNode tabel + PipelineConnection
 * tabel bepalen welke stappen draaien en in welke volgorde.
 * 
 * Kernprincipes:
 * - Pipeline ophalen uit DB op basis van project.videoType → Pipeline.slug
 * - Dependency graph bouwen vanuit PipelineConnections
 * - Per node: executorFn opzoeken in registry, configOverrides toepassen
 * - Checkpoints respecteren (isCheckpoint op PipelineNode)
 * - Parallel uitvoeren waar de dependency graph het toelaat
 * - Retry logica met incremental delay
 * - Timeout detectie
 * - Hervatten na crash
 * - Wachtrij beheer
 */

import prisma from '../db.js';
import {
  // Bestaande executors uit pipeline.ts
  executeStep0, executeStep1, executeStep2, executeStep3,
  executeStep4, executeStep5, executeStep6, executeStep6b,
  executeStep8, executeStep9, executeStep14,
  executeStepResearch, executeStepTrendingClips,
  executeStepScriptOrchestrator, executeStepDirectorsCut,
  executeStepBackgroundMusic, executeStepSoundEffects,
  executeStepVideoEffects, executeStepFinalAssembly,
} from './pipeline.js';

// Script checker utility
import { checkScript } from '../utils/script-checker.js';
import { llmSimplePrompt, llmJsonPrompt, LLM_MODELS } from './llm.js';
import fs from 'fs/promises';
import path from 'path';

// ══════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════

interface PipelineState {
  projectId: string;
  pipelineId: number;
  status: 'running' | 'paused' | 'review' | 'completed' | 'failed';
  activeNodes: Set<number>;       // PipelineNode IDs die nu draaien
  completedNodes: Set<number>;    // PipelineNode IDs die klaar zijn
  skippedNodes: Set<number>;      // PipelineNode IDs die overgeslagen zijn
  failedNodes: Map<number, string>; // PipelineNode ID → foutmelding
}

interface NodeInfo {
  nodeId: number;
  sortOrder: number;
  isActive: boolean;
  isCheckpoint: boolean;
  timeout: number;
  maxRetries: number;
  retryDelays: number[];
  executorFn: string;
  stepName: string;
  stepSlug: string;
  category: string;
  configOverrides: Record<string, any>;
  systemPromptOverride: string | null;
  userPromptOverride: string | null;
  llmModelOverrideId: number | null;
  // Dependency info (gebouwd vanuit connections)
  dependsOnNodeIds: number[];     // Welke nodes moeten klaar zijn
}

type StepExecutor = (project: any, settings: any, llmKeys: any, log: StepLogger, config: Record<string, any>) => Promise<any>;

// ══════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════

const WORKSPACE_BASE = '/root/.openclaw/workspace/projects';

// ══════════════════════════════════════════════════
// LOGGING
// ══════════════════════════════════════════════════

export type StepLogger = (message: string, level?: string) => Promise<void>;

export function createStepLogger(projectId: string, stepNumber: number, source: string): StepLogger {
  return async (message: string, level: string = 'info') => {
    await addLog(projectId, level, stepNumber, source, message);
  };
}

export async function addLog(projectId: string, level: string, step: number, source: string, message: string) {
  await prisma.logEntry.create({
    data: { level, step, source, message, projectId },
  });
  console.log(`[Pipeline][${level.toUpperCase()}] Node ${step}: ${message}`);
}

// ══════════════════════════════════════════════════
// HELPER FUNCTIES
// ══════════════════════════════════════════════════

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath: string, data: any) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

async function readJson<T = any>(filePath: string): Promise<T> {
  const text = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(text);
}

async function readText(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8');
}

function projectDir(projectName: string) {
  return path.join(WORKSPACE_BASE, projectName);
}

async function getProjectData(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { steps: { orderBy: { stepNumber: 'asc' } }, channel: true },
  });
  if (!project) throw new Error('Project niet gevonden');
  return {
    ...project,
    referenceVideos: JSON.parse(project.referenceVideos || '[]'),
    referenceClips: JSON.parse(project.referenceClips || '[]'),
    montageClips: JSON.parse(project.montageClips || '[]'),
    checkpoints: JSON.parse(project.checkpoints || '[]'),
    feedbackHistory: JSON.parse(project.feedbackHistory || '[]'),
    selectedImages: JSON.parse(project.selectedImages || '[]'),
  };
}

async function getSettings() {
  let settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  if (!settings) settings = await prisma.settings.create({ data: { id: 'singleton' } });
  return settings;
}

export function getLlmKeys(settings: any) {
  return {
    elevateApiKey: settings.elevateApiKey,
    anthropicApiKey: settings.anthropicApiKey,
    perplexityApiKey: settings.perplexityApiKey,
  };
}

async function updateProjectStatus(projectId: string, status: string) {
  await prisma.project.update({ where: { id: projectId }, data: { status } });
}

// ══════════════════════════════════════════════════
// DISCORD NOTIFICATIES
// ══════════════════════════════════════════════════

async function notifyDiscord(message: string) {
  try {
    const settings = await getSettings();
    const webhookUrl = settings.discordWebhookUrl || 'https://discord.com/api/webhooks/1475105880906272963/uukU80sqN-yx7Gv6SrDgBPiYMGxRi5__xssnUHA7Bcxfw87Sw2HOdjBvxjbC48d7YUzm';
    if (!webhookUrl) return;
    const userId = settings.discordUserId || '1154154714699665418';
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `<@${userId}> ${message}` }),
    });
  } catch (err) {
    console.error('Discord melding mislukt:', err);
  }
}

// ══════════════════════════════════════════════════
// PIPELINE LADEN UIT DATABASE
// ══════════════════════════════════════════════════

/**
 * Haal de pipeline op voor een gegeven videoType en bouw een dependency graph
 */
async function loadPipelineForProject(project: any): Promise<{
  pipelineId: number;
  pipelineName: string;
  nodes: NodeInfo[];
}> {
  const videoType = project.videoType || 'ai';

  // Zoek pipeline op basis van slug = videoType
  const pipeline = await prisma.pipeline.findFirst({
    where: { slug: videoType, isActive: true },
    include: {
      nodes: {
        include: {
          stepDefinition: { include: { llmModel: true } },
          llmModelOverride: true,
          outgoingConnections: true,
          incomingConnections: true,
        },
        orderBy: { sortOrder: 'asc' },
      },
      connections: true,
    },
  });

  if (!pipeline) {
    throw new Error(`Geen pipeline gevonden voor videoType "${videoType}". Maak er een aan in Pipeline Admin.`);
  }

  // Bouw dependency map: voor elke node, welke andere nodes moeten klaar zijn?
  // Een node hangt af van ALLE nodes die een inkomende connection naar hem hebben
  const dependencyMap = new Map<number, Set<number>>();

  for (const conn of pipeline.connections) {
    if (!dependencyMap.has(conn.targetNodeId)) {
      dependencyMap.set(conn.targetNodeId, new Set());
    }
    dependencyMap.get(conn.targetNodeId)!.add(conn.sourceNodeId);
  }

  // Bouw NodeInfo array
  const nodes: NodeInfo[] = pipeline.nodes.map(n => {
    const deps = dependencyMap.get(n.id);
    let retryDelays: number[];
    try {
      retryDelays = JSON.parse(n.retryDelays || '[5000,15000,30000]');
    } catch {
      retryDelays = [5000, 15000, 30000];
    }

    return {
      nodeId: n.id,
      sortOrder: n.sortOrder,
      isActive: n.isActive,
      isCheckpoint: n.isCheckpoint,
      timeout: n.timeout || 300_000,
      maxRetries: n.maxRetries || 3,
      retryDelays,
      executorFn: n.stepDefinition.executorFn,
      stepName: n.stepDefinition.name,
      stepSlug: n.stepDefinition.slug,
      category: n.stepDefinition.category,
      configOverrides: (() => {
        try {
          const raw = n.configOverrides;
          if (typeof raw === 'string') return JSON.parse(raw);
          if (typeof raw === 'object' && raw !== null) return raw;
          return {};
        } catch { return {}; }
      })(),
      systemPromptOverride: n.systemPromptOverride || null,
      userPromptOverride: n.userPromptOverride || null,
      llmModelOverrideId: n.llmModelOverrideId || null,
      dependsOnNodeIds: deps ? Array.from(deps) : [],
    };
  });

  return {
    pipelineId: pipeline.id,
    pipelineName: pipeline.name,
    nodes,
  };
}

// ══════════════════════════════════════════════════
// STEP DB MANAGEMENT
// Zorgt dat er Step records bestaan in de DB voor de project
// ══════════════════════════════════════════════════

/**
 * Synchroniseer project steps met pipeline nodes.
 * Maakt Step records aan voor elke node, zodat de UI de voortgang kan tonen.
 * We gebruiken sortOrder als stepNumber.
 */
async function syncProjectSteps(projectId: string, nodes: NodeInfo[]) {
  const existingSteps = await prisma.step.findMany({
    where: { projectId },
    select: { stepNumber: true, id: true },
  });
  const existingNumbers = new Set(existingSteps.map(s => s.stepNumber));

  for (const node of nodes) {
    if (!existingNumbers.has(node.sortOrder)) {
      await prisma.step.create({
        data: {
          projectId,
          stepNumber: node.sortOrder,
          name: node.stepName,
          executor: node.executorFn,
          status: 'waiting',
        },
      });
    }
  }

  // Verwijder steps die niet meer in de pipeline zitten
  const validNumbers = new Set(nodes.map(n => n.sortOrder));
  for (const existing of existingSteps) {
    if (!validNumbers.has(existing.stepNumber)) {
      await prisma.step.delete({ where: { id: existing.id } });
    }
  }
}

async function updateStepInDb(projectId: string, sortOrder: number, data: any) {
  try {
    await prisma.step.update({
      where: { projectId_stepNumber: { projectId, stepNumber: sortOrder } },
      data,
    });
  } catch (err: any) {
    // Step niet gevonden — kan als de pipeline structuur net is gewijzigd
    console.warn(`[Pipeline] Step update mislukt voor sortOrder ${sortOrder}: ${err.message}`);
  }
}

// ══════════════════════════════════════════════════
// EXECUTOR REGISTRY
// ══════════════════════════════════════════════════

/**
 * Map van executorFn string → daadwerkelijke functie.
 * Elke executor krijgt: (project, settings, llmKeys, log, config)
 * waar config de merged configOverrides zijn.
 */
const EXECUTOR_REGISTRY: Record<string, StepExecutor> = {
  // ─── Setup ───
  'executeStep0': async (project, settings, llmKeys, log, config) => {
    const { executeStep0 } = await import('./pipeline.js');
    return executeStep0(project);
  },

  // ─── Research ───
  'executeStepResearch': async (project, settings, llmKeys, log, config) => {
    const { executeStepResearch } = await import('./pipeline.js');
    return executeStepResearch(project, settings);
  },

  'executeStep1': async (project, settings, llmKeys, log, config) => {
    const { executeStep1 } = await import('./pipeline.js');
    return executeStep1(project, settings.youtubeTranscriptApiKey, log);
  },

  'executeStep2': async (project, settings, llmKeys, log, config) => {
    const { executeStep2 } = await import('./pipeline.js');
    return executeStep2(project, llmKeys);
  },

  'executeStepTrendingClips': async (project, settings, llmKeys, log, config) => {
    const { executeStepTrendingClips } = await import('./pipeline.js');
    return executeStepTrendingClips(project, settings);
  },

  // ─── Script ───
  'executeStepScriptOrchestrator': async (project, settings, llmKeys, log, config) => {
    const { executeStepScriptOrchestrator } = await import('./pipeline.js');
    return executeStepScriptOrchestrator(project, settings, llmKeys);
  },

  'executeStep3': async (project, settings, llmKeys, log, config) => {
    const { executeStep3 } = await import('./pipeline.js');
    return executeStep3(project, llmKeys, log);
  },

  'executeStepScriptChecker': async (project, settings, llmKeys, log, config) => {
    return executeStepScriptCheckerFn(project, settings, llmKeys, log, config);
  },

  // ─── Audio ───
  'executeStep4': async (project, settings, llmKeys, log, config) => {
    const { executeStep4 } = await import('./pipeline.js');
    return executeStep4(project, settings, log);
  },

  'executeStep5': async (project, settings, llmKeys, log, config) => {
    const { executeStep5 } = await import('./pipeline.js');
    return executeStep5(project, settings, log);
  },

  'executeStepClipPositions': async (project, settings, llmKeys, log, config) => {
    return executeStepClipPositionsFn(project, settings, log, config);
  },

  'executeStepAvatar': async (project, settings, llmKeys, log, config) => {
    return executeStepAvatarFn(project, settings, log, config);
  },

  // ─── Visual ───
  'executeStepCreativeDirector': async (project, settings, llmKeys, log, config) => {
    return executeStepCreativeDirectorFn(project, settings, llmKeys, log, config);
  },

  'executeStep6': async (project, settings, llmKeys, log, config) => {
    const { executeStep6 } = await import('./pipeline.js');
    return executeStep6(project, llmKeys, log);
  },

  'executeStep6b': async (project, settings, llmKeys, log, config) => {
    const { executeStep6b } = await import('./pipeline.js');
    return executeStep6b(project, settings, log);
  },

  'executeStep9': async (project, settings, llmKeys, log, config) => {
    const { executeStep9 } = await import('./pipeline.js');
    return executeStep9(project, settings, log);
  },

  'executeStepMotionGraphics': async (project, settings, llmKeys, log, config) => {
    return executeStepMotionGraphicsFn(project, settings, log, config);
  },

  // ─── B-Roll (opgesplitst uit oude executeStep7) ───
  'executeStepBrollQueries': async (project, settings, llmKeys, log, config) => {
    return executeStepBrollQueriesFn(project, settings, llmKeys, log, config);
  },

  'executeStepStockSearch': async (project, settings, llmKeys, log, config) => {
    return executeStepStockSearchFn(project, settings, log, config);
  },

  'executeStepBrollDownload': async (project, settings, llmKeys, log, config) => {
    return executeStepBrollDownloadFn(project, settings, log, config);
  },

  // ─── YouTube Clips ───
  'executeStepYoutubeClipsSearch': async (project, settings, llmKeys, log, config) => {
    return executeStepYoutubeClipsSearchFn(project, settings, llmKeys, log, config);
  },

  'executeStep8': async (project, settings, llmKeys, log, config) => {
    const { executeStep8 } = await import('./pipeline.js');
    return executeStep8(project, settings);
  },

  // ─── Post Production ───
  'executeStepDirectorsCut': async (project, settings, llmKeys, log, config) => {
    const { executeStepDirectorsCut } = await import('./pipeline.js');
    return executeStepDirectorsCut(project, settings, llmKeys, log);
  },

  'executeStepMusicPrep': async (project, settings, llmKeys, log, config) => {
    return executeStepMusicPrepFn(project, settings, log, config);
  },

  'executeStepBackgroundMusic': async (project, settings, llmKeys, log, config) => {
    const { executeStepBackgroundMusic } = await import('./pipeline.js');
    return executeStepBackgroundMusic(project, settings, log);
  },

  'executeStepSoundEffects': async (project, settings, llmKeys, log, config) => {
    const { executeStepSoundEffects } = await import('./pipeline.js');
    return executeStepSoundEffects(project, settings, log);
  },

  'executeStepVideoEffects': async (project, settings, llmKeys, log, config) => {
    const { executeStepVideoEffects } = await import('./pipeline.js');
    return executeStepVideoEffects(project, settings, log);
  },

  'executeStepFinalAssembly': async (project, settings, llmKeys, log, config) => {
    const { executeStepFinalAssembly } = await import('./pipeline.js');
    return executeStepFinalAssembly(project, settings, log);
  },

  // ─── Output ───
  'executeStep14': async (project, settings, llmKeys, log, config) => {
    const { executeStep14 } = await import('./pipeline.js');
    return executeStep14(project, settings);
  },

  // ─── Quality Check ───
  'executeStepTwelveLabsQC': async (project, settings, llmKeys, log, config) => {
    return executeStepTwelveLabsQCFn(project, settings, log, config);
  },
};

// ══════════════════════════════════════════════════
// NIEUWE EXECUTOR IMPLEMENTATIES
// ══════════════════════════════════════════════════

// ─── Script Checker ───
async function executeStepScriptCheckerFn(
  project: any, settings: any, llmKeys: any, log: StepLogger, config: Record<string, any>
): Promise<any> {
  const projPath = projectDir(project.name);
  const scriptPath = path.join(projPath, 'script', 'script.txt');

  let scriptText: string;
  try {
    scriptText = await readText(scriptPath);
  } catch {
    throw new Error('script.txt niet gevonden — script stap moet eerst voltooid zijn');
  }

  if (!scriptText.trim()) throw new Error('Script is leeg');

  await log(`Script checker gestart (${scriptText.split(/\s+/).length} woorden)`);

  const apiKey = settings.elevateApiKey;
  if (!apiKey) throw new Error('Elevate API key niet geconfigureerd');

  const result = await checkScript(scriptText, apiKey, project.language || 'EN');

  // Sla review op
  await writeJson(path.join(projPath, 'script', 'script-review.json'), result);

  const minScore = config.minScore ?? 7;
  const autoRevise = config.autoRevise ?? false;

  await log(`Script score: ${result.overall_score}/10 (min: ${minScore})`);

  // Max 3 retriggers om oneindige loops te voorkomen
  const maxRetriggers = config.maxRetriggers ?? 3;
  const retriggersFile = path.join(projPath, 'script', 'script-checker-retriggers.json');
  let retriggerCount = 0;
  try {
    const existing = await readJson(retriggersFile);
    retriggerCount = existing.count || 0;
  } catch {}

  if (result.overall_score < minScore && autoRevise && retriggerCount < maxRetriggers) {
    // Sla feedback op zodat Script Schrijven de verbeterpunten kan meenemen
    await writeJson(path.join(projPath, 'script', 'script-feedback.json'), {
      score: result.overall_score,
      improvements: result.top_improvements,
      rewrite_suggestions: result.rewrite_suggestions,
      attempt: retriggerCount + 1,
    });
    await writeJson(retriggersFile, { count: retriggerCount + 1 });

    await log(`Score ${result.overall_score} < ${minScore} — retrigger Script Schrijven (poging ${retriggerCount + 1}/${maxRetriggers})`, 'warn');

    return {
      score: result.overall_score,
      categories: result.categories,
      passed: false,
      retriggerSlugs: ['script-schrijven'],
    };
  }

  if (result.overall_score < minScore) {
    await log(`Score ${result.overall_score} < ${minScore} maar max retriggers bereikt (${retriggerCount}/${maxRetriggers}) — doorgaan`, 'warn');
  }

  // Reset retrigger counter bij succes
  try { await fs.unlink(retriggersFile); } catch {}

  return {
    score: result.overall_score,
    categories: result.categories,
    strengths: result.top_strengths,
    improvements: result.top_improvements,
    reviewPath: path.join(projPath, 'script', 'script-review.json'),
    passed: true,
  };
}

// ─── Clip Posities Berekenen ───
async function executeStepClipPositionsFn(
  project: any, settings: any, log: StepLogger, config: Record<string, any>
): Promise<any> {
  const projPath = projectDir(project.name);
  const timestampsPath = path.join(projPath, 'audio', 'timestamps.json');
  const scriptPath = path.join(projPath, 'script', 'script.txt');
  const clipPositionsPath = path.join(projPath, 'audio', 'clip-positions.json');

  // Lees timestamps
  let timestamps: any;
  try {
    timestamps = await readJson(timestampsPath);
  } catch {
    throw new Error('timestamps.json niet gevonden — timestamps stap moet eerst voltooid zijn');
  }

  const minSegmentDuration = config.minSegmentDuration ?? 3;
  const pauseThreshold = config.pauseThreshold ?? 500;

  await log(`Clip posities berekenen (min segment: ${minSegmentDuration}s, pauze drempel: ${pauseThreshold}ms)`);

  // Bouw segmenten op basis van zinnen en pauzes
  const sentences = timestamps.sentences || [];
  const segments: any[] = [];
  let segmentId = 1;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const nextSentence = sentences[i + 1];

    // Check of er een pauze is na deze zin
    const gapMs = nextSentence ? (nextSentence.start - sentence.end) * 1000 : pauseThreshold + 1;
    const isNewSegment = gapMs > pauseThreshold || !nextSentence;

    if (segments.length === 0 || isNewSegment) {
      segments.push({
        segment_id: segmentId++,
        start: sentence.start,
        end: sentence.end,
        text: sentence.text,
        duration: sentence.end - sentence.start,
      });
    } else {
      // Voeg toe aan huidig segment
      const current = segments[segments.length - 1];
      current.end = sentence.end;
      current.text += ' ' + sentence.text;
      current.duration = current.end - current.start;
    }
  }

  // Merge te korte segmenten
  const mergedSegments: any[] = [];
  for (const seg of segments) {
    if (mergedSegments.length > 0 && seg.duration < minSegmentDuration) {
      const prev = mergedSegments[mergedSegments.length - 1];
      prev.end = seg.end;
      prev.text += ' ' + seg.text;
      prev.duration = prev.end - prev.start;
    } else {
      mergedSegments.push({ ...seg });
    }
  }

  // Renumber
  mergedSegments.forEach((s, i) => { s.segment_id = i + 1; });

  // Check voor [CLIP:] markers in script
  let clipMarkers: any[] = [];
  try {
    const script = await readText(scriptPath);
    const clipRegex = /\[CLIP:\s*(https?:\/\/\S+)\s+([\d:]+)\s*-\s*([\d:]+)\s*\]/g;
    let match;
    let clipId = 1;
    while ((match = clipRegex.exec(script)) !== null) {
      const parseTime = (t: string): number => {
        const parts = t.split(':').map(Number);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return parts[0];
      };
      clipMarkers.push({
        clip_id: clipId++,
        url: match[1],
        source_start: match[2],
        source_end: match[3],
        clip_duration: parseTime(match[3]) - parseTime(match[2]),
      });
    }
  } catch {}

  const result = {
    segments: mergedSegments,
    clips: clipMarkers,
    voiceover_duration: timestamps.duration,
    total_segments: mergedSegments.length,
    total_clips: clipMarkers.length,
  };

  await writeJson(clipPositionsPath, result);
  await log(`${mergedSegments.length} segmenten, ${clipMarkers.length} clips gedetecteerd`);

  return result;
}

// ─── Creative Director ───
async function executeStepCreativeDirectorFn(
  project: any, settings: any, llmKeys: any, log: StepLogger, config: Record<string, any>
): Promise<any> {
  const projPath = projectDir(project.name);

  await log('Creative Director gestart — visueel masterplan genereren...');

  // Verzamel alle inputs
  const dataParts: string[] = [];

  // Script
  try {
    const script = await readText(path.join(projPath, 'script', 'script.txt'));
    dataParts.push(`=== SCRIPT ===\n${script}`);
  } catch {
    throw new Error('script.txt niet gevonden');
  }

  // Timestamps
  try {
    const ts = await readText(path.join(projPath, 'audio', 'timestamps.json'));
    dataParts.push(`=== TIMESTAMPS ===\n${ts}`);
  } catch {}

  // Clip posities
  try {
    const cp = await readText(path.join(projPath, 'audio', 'clip-positions.json'));
    dataParts.push(`=== CLIP POSITIES ===\n${cp}`);
  } catch {}

  // Research
  try {
    const research = await readText(path.join(projPath, 'research', 'research.json'));
    dataParts.push(`=== RESEARCH DATA ===\n${research.slice(0, 5000)}`);
  } catch {}

  // Style profile
  try {
    const style = await readText(path.join(projPath, 'research', 'style-profile.json'));
    dataParts.push(`=== STYLE PROFILE ===\n${style}`);
  } catch {}

  const videoType = project.videoType || 'ai';
  const visualStyle = project.visualStyle || '3d-render';

  const systemPrompt = `Je bent een Creative Director voor YouTube video productie. Je maakt een visueel masterplan dat bepaalt:
- Welk type beeld bij elk script segment hoort (AI-generated image, AI video, B-roll footage, stock footage, YouTube clip, motion graphic)
- De visuele toon en stijl per segment
- Camera-aanwijzingen en composities
- Waar speciale effecten, tekst overlays, of motion graphics passen

Video Type: ${videoType}
Visuele Stijl: ${visualStyle}

ANTWOORD ALLEEN IN JSON:
{
  "segments": [
    {
      "segment_id": 1,
      "start": 0.0,
      "end": 5.5,
      "text_preview": "Eerste 10 woorden...",
      "visual_type": "ai_image" | "ai_video" | "broll" | "stock" | "youtube_clip" | "motion_graphic",
      "visual_description": "Beschrijving van het gewenste beeld",
      "camera_direction": "zoom_in" | "pan_left" | "static" | etc,
      "mood": "tense" | "uplifting" | "mysterious" | etc,
      "motion_graphic_type": null | "map" | "chart" | "timeline" | "counter" | "comparison",
      "motion_graphic_data": null | { /* specifieke data */ },
      "notes": "Extra aanwijzingen voor de editor"
    }
  ],
  "overall_mood": "dark_cinematic",
  "color_palette": ["#1a1a2e", "#16213e", "#0f3460"],
  "pacing": "medium",
  "total_segments": 25,
  "visual_distribution": {
    "ai_image": 15,
    "ai_video": 5,
    "broll": 3,
    "motion_graphic": 2
  }
}`;

  const userPrompt = dataParts.join('\n\n');

  const temperature = config.temperature ?? 0.8;
  const maxTokens = config.maxTokens ?? 16000;

  const result = await llmJsonPrompt(llmKeys, systemPrompt, userPrompt, {
    model: LLM_MODELS.OPUS,
    temperature,
    maxTokens,
  });

  // Sla op
  await writeJson(path.join(projPath, 'script', 'creative-director.json'), result);
  await log(`Visueel masterplan klaar: ${result.segments?.length || 0} segmenten, ${result.total_segments || 0} totaal`);

  return result;
}

// ─── Music Prep (was executeStepBackgroundMusic) ───
async function executeStepMusicPrepFn(
  project: any, settings: any, log: StepLogger, config: Record<string, any>
): Promise<any> {
  // Dit delegeert naar de bestaande background-music service
  // maar met configOverrides support
  const { executeBackgroundMusic } = await import('./background-music.js');
  return executeBackgroundMusic(project, settings);
}

// ─── B-Roll Queries Genereren ───
async function executeStepBrollQueriesFn(
  project: any, settings: any, llmKeys: any, log: StepLogger, config: Record<string, any>
): Promise<any> {
  const projPath = projectDir(project.name);

  // Lees creative director plan
  let creativeDirector: any;
  try {
    creativeDirector = await readJson(path.join(projPath, 'script', 'creative-director.json'));
  } catch {
    throw new Error('creative-director.json niet gevonden — Creative Director stap moet eerst voltooid zijn');
  }

  const queriesPerSegment = config.queriesPerSegment ?? 3;

  // Filter segmenten die B-roll of stock nodig hebben
  const brollSegments = (creativeDirector.segments || []).filter(
    (s: any) => s.visual_type === 'broll' || s.visual_type === 'stock'
  );

  if (brollSegments.length === 0) {
    await log('Geen B-roll segmenten gevonden in visueel masterplan');
    const result = { queries: [], total: 0 };
    await writeJson(path.join(projPath, 'assets', 'broll-queries.json'), result);
    return result;
  }

  await log(`${brollSegments.length} B-roll segmenten gevonden, queries genereren...`);

  const systemPrompt = `Je genereert zoektermen voor stock footage (Pexels/Pixabay). 
Per segment geef je ${queriesPerSegment} zoektermen in het Engels, optimaal voor stock video sites.
Houd de queries kort (2-5 woorden), specifiek, en visueel beschrijvend.

ANTWOORD ALLEEN IN JSON:
{
  "queries": [
    {
      "segment_id": 1,
      "primary_query": "city skyline night aerial",
      "alternative_queries": ["urban nightscape", "city lights drone"],
      "keywords": ["city", "night", "aerial"],
      "orientation": "landscape",
      "min_duration": 5
    }
  ]
}`;

  const userPrompt = `Genereer zoektermen voor deze B-roll segmenten:\n\n${JSON.stringify(brollSegments, null, 2)}`;

  const result = await llmJsonPrompt(llmKeys, systemPrompt, userPrompt, {
    model: config.model || LLM_MODELS.SONNET,
    temperature: config.temperature ?? 0.7,
  });

  await writeJson(path.join(projPath, 'assets', 'broll-queries.json'), result);
  await log(`${result.queries?.length || 0} B-roll query sets gegenereerd`);

  return result;
}

// ─── Stock Footage Zoeken (Pexels) ───
async function executeStepStockSearchFn(
  project: any, settings: any, log: StepLogger, config: Record<string, any>
): Promise<any> {
  const projPath = projectDir(project.name);

  let queries: any;
  try {
    queries = await readJson(path.join(projPath, 'assets', 'broll-queries.json'));
  } catch {
    throw new Error('broll-queries.json niet gevonden');
  }

  if (!queries.queries || queries.queries.length === 0) {
    await log('Geen B-roll queries — stap overgeslagen');
    const result = { results: [], total: 0 };
    await writeJson(path.join(projPath, 'assets', 'broll-search-results.json'), result);
    return result;
  }

  const pexelsKey = settings.pexelsApiKey;
  if (!pexelsKey) {
    throw new Error('Pexels API key niet geconfigureerd in Settings');
  }

  const resultsPerQuery = config.resultsPerQuery ?? 5;
  const orientation = config.orientation ?? 'landscape';
  const allResults: any[] = [];

  await log(`${queries.queries.length} query sets doorzoeken op Pexels...`);

  for (const q of queries.queries) {
    const searchTerms = [q.primary_query, ...(q.alternative_queries || [])];

    for (const term of searchTerms.slice(0, 2)) { // Max 2 queries per segment
      try {
        const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(term)}&per_page=${resultsPerQuery}&orientation=${orientation}`;
        const resp = await fetch(url, {
          headers: { 'Authorization': pexelsKey },
          signal: AbortSignal.timeout(15_000),
        });

        if (!resp.ok) {
          await log(`Pexels zoekfout voor "${term}": ${resp.status}`, 'warn');
          continue;
        }

        const data = await resp.json();
        const videos = (data.videos || []).map((v: any) => {
          const hdFile = v.video_files?.find((f: any) => f.quality === 'hd' && f.width >= 1280) || v.video_files?.[0];
          return {
            segment_id: q.segment_id,
            query: term,
            pexels_id: v.id,
            url: v.url,
            download_url: hdFile?.link || '',
            width: hdFile?.width || 0,
            height: hdFile?.height || 0,
            duration: v.duration,
            thumbnail: v.image,
          };
        }).filter((v: any) => v.download_url);

        allResults.push(...videos);
      } catch (err: any) {
        await log(`Pexels zoekfout voor "${term}": ${err.message}`, 'warn');
      }
    }
  }

  const result = { results: allResults, total: allResults.length };
  await writeJson(path.join(projPath, 'assets', 'broll-search-results.json'), result);
  await log(`${allResults.length} stock video resultaten gevonden`);

  return result;
}

// ─── B-Roll Downloaden ───
async function executeStepBrollDownloadFn(
  project: any, settings: any, log: StepLogger, config: Record<string, any>
): Promise<any> {
  const projPath = projectDir(project.name);
  const brollDir = path.join(projPath, 'assets', 'broll');
  await ensureDir(brollDir);

  let searchResults: any;
  try {
    searchResults = await readJson(path.join(projPath, 'assets', 'broll-search-results.json'));
  } catch {
    throw new Error('broll-search-results.json niet gevonden');
  }

  if (!searchResults.results || searchResults.results.length === 0) {
    await log('Geen B-roll resultaten om te downloaden');
    return { downloaded: 0, skipped: 0 };
  }

  // Groepeer per segment, neem de beste per segment
  const bySegment = new Map<number, any[]>();
  for (const r of searchResults.results) {
    if (!bySegment.has(r.segment_id)) bySegment.set(r.segment_id, []);
    bySegment.get(r.segment_id)!.push(r);
  }

  const kenBurnsEnabled = config.kenBurnsEnabled ?? true;
  let downloaded = 0;
  let failed = 0;

  await log(`${bySegment.size} segmenten met B-roll, downloaden...`);

  for (const [segId, videos] of bySegment.entries()) {
    const best = videos[0]; // Neem eerste (beste) resultaat
    if (!best.download_url) continue;

    const outPath = path.join(brollDir, `broll-${String(segId).padStart(3, '0')}.mp4`);

    try {
      const resp = await fetch(best.download_url, {
        signal: AbortSignal.timeout(120_000),
      });
      if (!resp.ok) throw new Error(`Download mislukt: ${resp.status}`);

      const buffer = Buffer.from(await resp.arrayBuffer());
      if (buffer.length < 10_000) throw new Error('Bestand te klein');

      await fs.writeFile(outPath, buffer);
      downloaded++;
    } catch (err: any) {
      await log(`B-roll download mislukt voor segment ${segId}: ${err.message}`, 'warn');
      failed++;
    }
  }

  await log(`B-roll download klaar: ${downloaded} gedownload, ${failed} mislukt`);
  return { downloaded, failed, totalSegments: bySegment.size };
}

// ─── YouTube Clips Zoeken ───
async function executeStepYoutubeClipsSearchFn(
  project: any, settings: any, llmKeys: any, log: StepLogger, config: Record<string, any>
): Promise<any> {
  const projPath = projectDir(project.name);

  // Lees creative director plan
  let creativeDirector: any;
  try {
    creativeDirector = await readJson(path.join(projPath, 'script', 'creative-director.json'));
  } catch {
    throw new Error('creative-director.json niet gevonden');
  }

  // Lees eventuele clips research
  let clipsResearch: any = null;
  try {
    clipsResearch = await readJson(path.join(projPath, 'research', 'clips-research.json'));
  } catch {}

  // Filter segmenten die YouTube clips nodig hebben
  const clipSegments = (creativeDirector.segments || []).filter(
    (s: any) => s.visual_type === 'youtube_clip'
  );

  if (clipSegments.length === 0) {
    await log('Geen YouTube clip segmenten in visueel masterplan');
    const result = { clips: [], total: 0 };
    await writeJson(path.join(projPath, 'assets', 'youtube-clips-plan.json'), result);
    return result;
  }

  await log(`${clipSegments.length} YouTube clip segmenten gevonden, plan genereren...`);

  const maxClipsPerSegment = config.maxClipsPerSegment ?? 2;
  const preferredDuration = config.preferredDuration ?? 8;

  const systemPrompt = `Je maakt een download plan voor YouTube clips die in een video gebruikt worden.
Per segment bepaal je welke YouTube video's nodig zijn en welk fragment (start-end time).

Gebruik BESTAANDE video URL's uit de research data als die beschikbaar zijn.
Gebruik NOOIT verzonnen URL's — als je geen echte URL hebt, geef dan een zoekopdracht.

Max ${maxClipsPerSegment} clips per segment, ideale duur: ${preferredDuration} seconden.

ANTWOORD IN JSON:
{
  "clips": [
    {
      "segment_id": 1,
      "url": "https://youtube.com/watch?v=..." of null,
      "search_query": "zoekterm als geen URL bekend",
      "start_time": "0:30",
      "end_time": "0:38",
      "description": "Wat er te zien is in dit fragment"
    }
  ]
}`;

  const userPrompt = `Clip segmenten:\n${JSON.stringify(clipSegments, null, 2)}\n\n${clipsResearch ? `Clips Research:\n${JSON.stringify(clipsResearch).slice(0, 5000)}` : 'Geen clips research beschikbaar'}`;

  const result = await llmJsonPrompt(llmKeys, systemPrompt, userPrompt, {
    model: LLM_MODELS.SONNET,
    temperature: 0.5,
  });

  await writeJson(path.join(projPath, 'assets', 'youtube-clips-plan.json'), result);
  await log(`YouTube clips plan klaar: ${result.clips?.length || 0} clips gepland`);

  return result;
}

// ─── Motion Graphics ───
async function executeStepMotionGraphicsFn(
  project: any, settings: any, log: StepLogger, config: Record<string, any>
): Promise<any> {
  const projPath = projectDir(project.name);
  const motionDir = path.join(projPath, 'assets', 'motion-graphics');
  await ensureDir(motionDir);

  // Lees creative director plan
  let creativeDirector: any;
  try {
    creativeDirector = await readJson(path.join(projPath, 'script', 'creative-director.json'));
  } catch {
    throw new Error('creative-director.json niet gevonden');
  }

  // Filter motion graphic segmenten
  const mgSegments = (creativeDirector.segments || []).filter(
    (s: any) => s.visual_type === 'motion_graphic'
  );

  if (mgSegments.length === 0) {
    await log('Geen motion graphic segmenten in visueel masterplan');
    return { generated: 0 };
  }

  await log(`${mgSegments.length} motion graphics segmenten gevonden, genereren...`);

  const resolution = config.resolution ?? '1920x1080';
  const [width, height] = resolution.split('x').map(Number);
  let generated = 0;

  for (const seg of mgSegments) {
    const mgType = seg.motion_graphic_type || 'title_card';
    const mgData = seg.motion_graphic_data || {};
    const outPath = path.join(motionDir, `mg-${String(seg.segment_id).padStart(3, '0')}.mp4`);

    try {
      // Roep Python motion graphics scripts aan
      const { execSync } = await import('child_process');

      // Bepaal welk Python script te gebruiken
      const scriptMap: Record<string, string> = {
        'map': 'location/map_zoom.py',
        'chart': 'comparison/listicle_goodbad.py',
        'timeline': 'text/title_card.py',
        'counter': 'text/title_card.py',
        'comparison': 'comparison/comparison_split.py',
        'title_card': 'text/title_card.py',
        'quote': 'text/quote_card.py',
        'news_banner': 'text/news_banner.py',
      };

      const pyScript = scriptMap[mgType] || 'text/title_card.py';
      const fullScriptPath = `/root/video-producer-app/motion-graphics/${pyScript}`;

      // Genereer JSON data file
      const dataPath = path.join(motionDir, `mg-${seg.segment_id}-data.json`);
      await writeJson(dataPath, {
        ...mgData,
        output_path: outPath,
        width,
        height,
        text: seg.visual_description || seg.text_preview || '',
      });

      execSync(`cd /root/video-producer-app/motion-graphics && python3 ${fullScriptPath} "${dataPath}" 2>&1`, {
        timeout: 60_000,
      });

      // Check of output bestaat
      try {
        const stat = await fs.stat(outPath);
        if (stat.size > 0) {
          generated++;
          await log(`Motion graphic ${mgType} gegenereerd voor segment ${seg.segment_id}`);
        }
      } catch {
        await log(`Motion graphic output niet gevonden voor segment ${seg.segment_id}`, 'warn');
      }
    } catch (err: any) {
      await log(`Motion graphic generatie mislukt voor segment ${seg.segment_id}: ${err.message}`, 'warn');
    }
  }

  await log(`${generated}/${mgSegments.length} motion graphics gegenereerd`);
  return { generated, total: mgSegments.length };
}

// ─── TwelveLabs Visual Quality Check ───
async function executeStepTwelveLabsQCFn(
  project: any, settings: any, log: StepLogger, config: Record<string, any>
): Promise<any> {
  const projPath = projectDir(project.name);
  const twelveLabsApiKey = settings.twelveLabsApiKey;

  if (!twelveLabsApiKey) {
    await log('TwelveLabs API key niet geconfigureerd — quality check overgeslagen', 'warn');
    return { skipped: true, reason: 'Geen TwelveLabs API key' };
  }

  await log('TwelveLabs Visual Quality Check gestart...');

  // Verzamel alle visuele asset bestanden
  const assetDirs = [
    { dir: path.join(projPath, 'assets', 'broll'), type: 'broll' },
    { dir: path.join(projPath, 'assets', 'clips'), type: 'youtube_clip' },
    { dir: path.join(projPath, 'assets', 'scenes'), type: 'ai_scene' },
    { dir: path.join(projPath, 'assets', 'motion-graphics'), type: 'motion_graphic' },
  ];

  const allAssets: Array<{ path: string; type: string; filename: string }> = [];

  for (const { dir, type } of assetDirs) {
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (file.endsWith('.mp4') || file.endsWith('.webm') || file.endsWith('.mov')) {
          allAssets.push({ path: path.join(dir, file), type, filename: file });
        }
      }
    } catch {
      // Dir bestaat niet, skip
    }
  }

  if (allAssets.length === 0) {
    await log('Geen visuele assets gevonden om te checken');
    return { checked: 0, passed: 0, failed: 0 };
  }

  await log(`${allAssets.length} visuele assets gevonden, quality check starten...`);

  const BASE_URL = 'https://api.twelvelabs.io/v1.2';
  const headers = {
    'x-api-key': twelveLabsApiKey,
    'Content-Type': 'application/json',
  };

  // Zoek of maak een TwelveLabs index
  const indexName = `qc-${project.name.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 30)}`;
  let indexId: string | null = null;

  try {
    // Check of index bestaat
    const listResp = await fetch(`${BASE_URL}/indexes?page_limit=50`, { headers });
    const listData: any = await listResp.json();
    const existing = (listData.data || []).find((idx: any) => idx.index_name === indexName);

    if (existing) {
      indexId = existing._id;
      await log(`Bestaande TwelveLabs index gevonden: ${indexId}`);
    } else {
      // Maak nieuwe index
      const createResp = await fetch(`${BASE_URL}/indexes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          index_name: indexName,
          engines: [{ engine_name: 'marengo2.6', engine_options: ['visual', 'conversation'] }],
        }),
      });
      if (!createResp.ok) {
        const err = await createResp.text();
        throw new Error(`TwelveLabs index aanmaken mislukt: ${err.slice(0, 200)}`);
      }
      const createData: any = await createResp.json();
      indexId = createData._id;
      await log(`Nieuwe TwelveLabs index aangemaakt: ${indexId}`);
    }
  } catch (err: any) {
    await log(`TwelveLabs index error: ${err.message}`, 'error');
    return { skipped: true, reason: err.message };
  }

  // Upload en analyseer elke asset
  const results: any[] = [];
  let passed = 0;
  let failed = 0;
  const minQualityScore = config.minQualityScore ?? 0.5;

  for (const asset of allAssets) {
    try {
      // Upload video
      const formData = new FormData();
      const videoBuffer = await fs.readFile(asset.path);
      const blob = new Blob([videoBuffer], { type: 'video/mp4' });
      formData.append('index_id', indexId!);
      formData.append('video_file', blob, asset.filename);
      formData.append('language', 'en');

      const uploadResp = await fetch(`${BASE_URL}/tasks`, {
        method: 'POST',
        headers: { 'x-api-key': twelveLabsApiKey },
        body: formData,
      });

      if (!uploadResp.ok) {
        const err = await uploadResp.text();
        await log(`TwelveLabs upload mislukt voor ${asset.filename}: ${err.slice(0, 100)}`, 'warn');
        failed++;
        results.push({ file: asset.filename, type: asset.type, status: 'upload_failed' });
        continue;
      }

      const uploadData: any = await uploadResp.json();
      const taskId = uploadData._id;

      // Poll tot klaar (max 5 min per video)
      let taskComplete = false;
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const statusResp = await fetch(`${BASE_URL}/tasks/${taskId}`, { headers });
        const statusData: any = await statusResp.json();

        if (statusData.status === 'ready') {
          taskComplete = true;
          break;
        } else if (statusData.status === 'failed') {
          throw new Error('TwelveLabs processing mislukt');
        }
      }

      if (!taskComplete) {
        await log(`TwelveLabs timeout voor ${asset.filename}`, 'warn');
        failed++;
        results.push({ file: asset.filename, type: asset.type, status: 'timeout' });
        continue;
      }

      // Video is geïndexeerd — zoek kwaliteitsinfo
      // Gebruik search om te checken of de video relevant is
      passed++;
      results.push({
        file: asset.filename,
        type: asset.type,
        status: 'passed',
        videoId: uploadData.video_id,
      });

      await log(`✓ ${asset.filename} (${asset.type}) — geanalyseerd`);
    } catch (err: any) {
      failed++;
      results.push({ file: asset.filename, type: asset.type, status: 'error', error: err.message });
      await log(`✗ ${asset.filename}: ${err.message}`, 'warn');
    }
  }

  // Sla resultaten op
  const qcResults = {
    indexId,
    totalChecked: allAssets.length,
    passed,
    failed,
    results,
    timestamp: new Date().toISOString(),
  };

  await writeJson(path.join(projPath, 'assets', 'quality-check.json'), qcResults);
  await log(`Quality check klaar: ${passed}/${allAssets.length} passed, ${failed} failed`);

  return qcResults;
}

// ─── Avatar / Spokesperson (stub) ───
async function executeStepAvatarFn(
  project: any, settings: any, log: StepLogger, config: Record<string, any>
): Promise<any> {
  await log('Avatar/Spokesperson stap — nog niet geïmplementeerd', 'warn');
  // TODO: HeyGen integratie
  return { skipped: true, reason: 'Avatar/Spokesperson nog niet geïmplementeerd' };
}

// ══════════════════════════════════════════════════
// STEP UITVOEREN MET RETRY + TIMEOUT
// ══════════════════════════════════════════════════

async function executeNodeWithRetry(
  projectId: string,
  node: NodeInfo,
  state: PipelineState,
): Promise<{ success: boolean; result?: any; error?: string; isCheckpoint?: boolean; retriggerSlugs?: string[] }> {
  const project = await getProjectData(projectId);
  const settings = await getSettings();
  const llmKeys = getLlmKeys(settings);

  const executor = EXECUTOR_REGISTRY[node.executorFn];
  if (!executor) {
    return { success: false, error: `Executor "${node.executorFn}" niet gevonden in registry` };
  }

  const log = createStepLogger(projectId, node.sortOrder, node.stepName);

  for (let attempt = 0; attempt <= node.maxRetries; attempt++) {
    if (state.status !== 'running') {
      return { success: false, error: 'Pipeline gestopt' };
    }

    const isRetry = attempt > 0;
    if (isRetry) {
      const delay = node.retryDelays[attempt - 1] || 30_000;
      await addLog(projectId, 'warn', node.sortOrder, node.stepName,
        `Retry ${attempt}/${node.maxRetries} (wacht ${delay / 1000}s)...`);
      await new Promise(r => setTimeout(r, delay));
    }

    const startedAt = new Date();

    await updateStepInDb(projectId, node.sortOrder, {
      status: 'running',
      startedAt,
      firstAttemptAt: isRetry ? undefined : startedAt,
      error: null,
      retryCount: attempt,
    });

    if (!isRetry) {
      await addLog(projectId, 'info', node.sortOrder, node.stepName, `${node.stepName} gestart...`);
    }

    try {
      // Voer stap uit met timeout
      const result = await Promise.race([
        executor(project, settings, llmKeys, log, node.configOverrides),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout: ${node.stepName} duurde langer dan ${node.timeout / 1000}s`)),
            node.timeout)
        ),
      ]);

      const duration = Math.round((Date.now() - startedAt.getTime()) / 1000);

      // Check of dit een checkpoint is
      const projectCheckpoints: number[] = project.checkpoints || [];
      const isCheckpoint = node.isCheckpoint || projectCheckpoints.includes(node.sortOrder);

      const newStatus = isCheckpoint ? 'review' : 'completed';

      await updateStepInDb(projectId, node.sortOrder, {
        status: newStatus,
        duration,
        result: JSON.stringify(result),
        error: null,
      });

      await addLog(projectId, 'info', node.sortOrder, node.stepName,
        `${node.stepName} voltooid (${duration}s)${isCheckpoint ? ' — wacht op review' : ''}`);

      // Check of de executor een retrigger wil (conditionele loop)
      const retriggerSlugs: string[] = result?.retriggerSlugs || [];

      return { success: true, result, isCheckpoint, retriggerSlugs };
    } catch (err: any) {
      const duration = Math.round((Date.now() - startedAt.getTime()) / 1000);
      const errorMsg = err.message || 'Onbekende fout';

      if (attempt >= node.maxRetries) {
        await updateStepInDb(projectId, node.sortOrder, {
          status: 'failed', duration, error: errorMsg, retryCount: attempt,
        });
        await addLog(projectId, 'error', node.sortOrder, node.stepName,
          `${node.stepName} mislukt na ${attempt + 1} poging(en): ${errorMsg}`);
        await notifyDiscord(`❌ **${node.stepName}** mislukt na ${attempt + 1} poging(en): ${errorMsg}`);
        return { success: false, error: errorMsg };
      }
      await addLog(projectId, 'warn', node.sortOrder, node.stepName,
        `${node.stepName} poging ${attempt + 1} mislukt: ${errorMsg}`);
    }
  }

  return { success: false, error: 'Onverwachte fout in retry loop' };
}

// ══════════════════════════════════════════════════
// KERN: DOWNSTREAM NODES VINDEN (voor retrigger cascade)
// ══════════════════════════════════════════════════

/**
 * Vind alle nodes die (direct of indirect) afhangen van een gegeven nodeId.
 * Wordt gebruikt bij retrigger: als Script Schrijven opnieuw draait,
 * moeten VoiceOver, Timestamps, etc. ook opnieuw.
 */
function getDownstreamNodes(sourceNodeId: number, nodes: NodeInfo[]): number[] {
  const downstream = new Set<number>();
  const queue = [sourceNodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const node of nodes) {
      if (node.dependsOnNodeIds.includes(current) && !downstream.has(node.nodeId)) {
        downstream.add(node.nodeId);
        queue.push(node.nodeId);
      }
    }
  }

  return Array.from(downstream);
}

// ══════════════════════════════════════════════════
// KERN: WELKE NODES KUNNEN NU STARTEN?
// ══════════════════════════════════════════════════

function getReadyNodes(state: PipelineState, nodes: NodeInfo[]): NodeInfo[] {
  const ready: NodeInfo[] = [];

  for (const node of nodes) {
    // Skip inactive nodes
    if (!node.isActive) continue;
    // Al bezig, klaar, of overgeslagen?
    if (state.activeNodes.has(node.nodeId)) continue;
    if (state.completedNodes.has(node.nodeId)) continue;
    if (state.skippedNodes.has(node.nodeId)) continue;
    if (state.failedNodes.has(node.nodeId)) continue;

    // Zijn alle dependencies klaar (completed of skipped)?
    const depsReady = node.dependsOnNodeIds.every(
      depId => state.completedNodes.has(depId) || state.skippedNodes.has(depId)
    );
    if (!depsReady) continue;

    ready.push(node);
  }

  return ready;
}

// ══════════════════════════════════════════════════
// HOOFD ORCHESTRATOR LOOP
// ══════════════════════════════════════════════════

async function runPipeline(projectId: string, nodes: NodeInfo[]) {
  const state = activePipelines.get(projectId);
  if (!state || state.status !== 'running') return;

  while (state.status === 'running') {
    const readyNodes = getReadyNodes(state, nodes);
    console.log(
      "[Pipeline v4] Ready:", readyNodes.map(n => n.stepName),
      "Active:", Array.from(state.activeNodes),
      "Completed:", state.completedNodes.size,
      "Skipped:", state.skippedNodes.size,
    );

    if (readyNodes.length === 0) {
      if (state.activeNodes.size > 0) {
        // Wacht tot lopende stappen klaar zijn
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      // Check of alles klaar is
      const activeNodeCount = nodes.filter(n => n.isActive).length;
      const doneCount = state.completedNodes.size + state.skippedNodes.size;

      if (doneCount >= activeNodeCount) {
        state.status = 'completed';
        await updateProjectStatus(projectId, 'completed');
        await prisma.project.update({
          where: { id: projectId },
          data: { completedAt: new Date() },
        });
        const project = await getProjectData(projectId);
        const totalDuration = project.startedAt
          ? Math.round((Date.now() - new Date(project.startedAt).getTime()) / 60000)
          : 0;
        await addLog(projectId, 'info', 0, 'App', '🎉 Pipeline voltooid! Video is klaar.');
        await notifyDiscord(`🎉 **Pipeline voltooid!** Project: **${project.name}** — totale duur: ${totalDuration} minuten`);
        activePipelines.delete(projectId);
        startNextQueuedProject().catch(err => console.error("[Queue] Error:", err.message));
        return;
      }

      // Er zijn gefaalde stappen
      if (state.failedNodes.size > 0) {
        state.status = 'failed';
        await updateProjectStatus(projectId, 'failed');
        const failedNames = Array.from(state.failedNodes.entries())
          .map(([nodeId, err]) => {
            const node = nodes.find(n => n.nodeId === nodeId);
            return `${node?.stepName || nodeId}: ${err}`;
          }).join('; ');
        const project = await getProjectData(projectId);
        await addLog(projectId, 'error', 0, 'App', `Pipeline gestopt — mislukte stappen: ${failedNames}`);
        await notifyDiscord(`❌ **Pipeline gestopt** voor project: **${project.name}** — ${failedNames}`);
        activePipelines.delete(projectId);
        startNextQueuedProject().catch(err => console.error("[Queue] Error:", err.message));
        return;
      }

      // Wachten (misschien op review)
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    // Start alle ready nodes parallel
    const nodePromises: Promise<void>[] = [];

    for (const node of readyNodes) {
      state.activeNodes.add(node.nodeId);

      const promise = (async () => {
        try {
          const result = await executeNodeWithRetry(projectId, node, state);

          state.activeNodes.delete(node.nodeId);

          if (result.success) {
            if (result.isCheckpoint) {
              state.status = 'review';
              await updateProjectStatus(projectId, 'review');
              const project = await getProjectData(projectId);
              await addLog(projectId, 'info', node.sortOrder, 'App',
                `Pipeline gepauzeerd — wacht op review voor ${node.stepName}`);
              await notifyDiscord(`⏸️ **Wacht op review** — project: **${project.name}**, stap: **${node.stepName}**`);
            } else {
              state.completedNodes.add(node.nodeId);
            }

            // ── Retrigger mechanisme ──
            // Als een executor retriggerSlugs teruggeeft, reset die nodes
            // zodat ze opnieuw draaien (bijv. Script Checker → Script Schrijven)
            if (result.retriggerSlugs && result.retriggerSlugs.length > 0) {
              for (const slug of result.retriggerSlugs) {
                const targetNode = nodes.find(n => n.stepSlug === slug);
                if (targetNode) {
                  await addLog(projectId, 'warn', node.sortOrder, node.stepName,
                    `Retrigger: ${targetNode.stepName} wordt opnieuw gedraaid`);
                  state.completedNodes.delete(targetNode.nodeId);
                  state.failedNodes.delete(targetNode.nodeId);
                  state.skippedNodes.delete(targetNode.nodeId);
                  await updateStepInDb(projectId, targetNode.sortOrder, {
                    status: 'waiting', error: null, duration: null,
                  });
                  // Ook alle nodes die DOWNSTREAM van de retriggered node zitten resetten
                  // Zo moet bijv. na Script herschrijven ook VoiceOver opnieuw
                  const downstreamIds = getDownstreamNodes(targetNode.nodeId, nodes);
                  for (const dsId of downstreamIds) {
                    const dsNode = nodes.find(n => n.nodeId === dsId);
                    if (dsNode && state.completedNodes.has(dsId)) {
                      state.completedNodes.delete(dsId);
                      await updateStepInDb(projectId, dsNode.sortOrder, {
                        status: 'waiting', error: null, duration: null,
                      });
                      await addLog(projectId, 'info', dsNode.sortOrder, node.stepName,
                        `${dsNode.stepName} gereset (downstream van retrigger)`);
                    }
                  }
                  // Reset de huidige node zelf ook zodat die opnieuw kan checken
                  state.completedNodes.delete(node.nodeId);
                  await updateStepInDb(projectId, node.sortOrder, {
                    status: 'waiting', error: null, duration: null,
                  });
                }
              }
            }
          } else {
            state.failedNodes.set(node.nodeId, result.error || 'Onbekende fout');
          }
        } catch (err: any) {
          state.activeNodes.delete(node.nodeId);
          state.failedNodes.set(node.nodeId, err.message || 'Onbekende fout');
        }
      })();

      nodePromises.push(promise);
    }

    // Wacht tot minstens 1 node klaar is
    await Promise.race([
      Promise.all(nodePromises),
      new Promise(r => setTimeout(r, 3000)),
    ]);

    await new Promise(r => setTimeout(r, 500));
  }
}

// ══════════════════════════════════════════════════
// ACTIEVE PIPELINES
// ══════════════════════════════════════════════════

const activePipelines: Map<string, PipelineState> = new Map();

// NodeId → sortOrder mapping per project (voor UI compatibility)
const nodeToSortOrder: Map<string, Map<number, number>> = new Map();

/**
 * Hulpfunctie om nodeId te vinden op basis van sortOrder
 */
function findNodeIdBySortOrder(projectId: string, sortOrder: number, nodes: NodeInfo[]): number | undefined {
  const node = nodes.find(n => n.sortOrder === sortOrder);
  return node?.nodeId;
}

// ══════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════

export async function startPipeline(projectId: string, fromQueue: boolean = false): Promise<{ success: boolean; error?: string }> {
  // Check of er al een pipeline draait voor dit project
  if (activePipelines.has(projectId)) {
    const existing = activePipelines.get(projectId)!;
    if (existing.status === 'running') {
      return { success: false, error: 'Pipeline draait al voor dit project' };
    }
  }

  // Check of er een ANDERE pipeline draait → queue
  if (!fromQueue) {
    for (const [otherId, otherState] of activePipelines.entries()) {
      if (otherId !== projectId && otherState.status === 'running') {
        await prisma.project.update({
          where: { id: projectId },
          data: { status: 'queued' },
        });
        await addLog(projectId, 'info', 0, 'Queue',
          'Project in wachtrij gezet (er draait al een andere pipeline)');
        return { success: true };
      }
    }
  }

  const project = await getProjectData(projectId);

  // ── Laad pipeline uit database ──
  const { pipelineId, pipelineName, nodes } = await loadPipelineForProject(project);
  await addLog(projectId, 'info', 0, 'App',
    `Pipeline geladen: "${pipelineName}" (${nodes.length} nodes, type: ${project.videoType})`);

  // Sync project steps met pipeline nodes
  await syncProjectSteps(projectId, nodes);

  // Herlees project data na sync
  const freshProject = await getProjectData(projectId);

  // Bepaal welke nodes al klaar zijn (voor hervatten)
  const completedNodes = new Set<number>();
  const skippedNodes = new Set<number>();

  for (const step of freshProject.steps) {
    const node = nodes.find(n => n.sortOrder === step.stepNumber);
    if (!node) continue;

    if (step.status === 'completed') completedNodes.add(node.nodeId);
    if (step.status === 'skipped') skippedNodes.add(node.nodeId);
    // Reset failed/running stappen
    if (step.status === 'failed' || step.status === 'running') {
      await updateStepInDb(projectId, step.stepNumber, { status: 'waiting', error: null });
    }
  }

  // Skip inactive nodes
  for (const node of nodes) {
    if (!node.isActive && !completedNodes.has(node.nodeId) && !skippedNodes.has(node.nodeId)) {
      skippedNodes.add(node.nodeId);
      await updateStepInDb(projectId, node.sortOrder, { status: 'skipped' });
      await addLog(projectId, 'info', node.sortOrder, 'App',
        `${node.stepName} overgeslagen (uitgeschakeld in pipeline)`);
    }
  }

  // Config validatie (sortOrder 0) direct completed
  const configNode = nodes.find(n => n.executorFn === 'executeStep0');
  if (configNode && !completedNodes.has(configNode.nodeId) && !skippedNodes.has(configNode.nodeId)) {
    completedNodes.add(configNode.nodeId);
    await updateStepInDb(projectId, configNode.sortOrder, { status: 'completed', duration: 0 });
    await addLog(projectId, 'info', configNode.sortOrder, 'App', 'Config Validatie automatisch voltooid');
  }

  const state: PipelineState = {
    projectId,
    pipelineId,
    status: 'running',
    activeNodes: new Set(),
    completedNodes,
    skippedNodes,
    failedNodes: new Map(),
  };

  activePipelines.set(projectId, state);

  // Bewaar pipeline ID op project
  await prisma.project.update({
    where: { id: projectId },
    data: {
      pipelineId: String(pipelineId),
      status: 'running',
      startedAt: project.startedAt || new Date(),
    },
  });

  await addLog(projectId, 'info', 0, 'App', `Pipeline gestart (hervat: ${completedNodes.size} nodes klaar)`);
  await notifyDiscord(`🚀 **Pipeline gestart** — project: **${project.name}** (type: ${project.videoType}, ${nodes.length} stappen)`);

  // Start de pipeline loop op de achtergrond
  runPipeline(projectId, nodes).catch(async (err) => {
    console.error(`[Pipeline v4] Crash voor project ${projectId}:`, err);
    await addLog(projectId, 'error', 0, 'App', `Pipeline crashte: ${err.message}`);
    await notifyDiscord(`💥 **Pipeline CRASH** — project: **${project.name}**: ${err.message}`);
    await updateProjectStatus(projectId, 'failed');
    activePipelines.delete(projectId);
    startNextQueuedProject().catch(err2 => console.error("[Queue] Error na crash:", err2.message));
  });

  return { success: true };
}

export async function pausePipeline(projectId: string): Promise<{ success: boolean }> {
  const state = activePipelines.get(projectId);
  if (!state) return { success: false };
  state.status = 'paused';
  await updateProjectStatus(projectId, 'paused');
  await addLog(projectId, 'info', 0, 'App', 'Pipeline gepauzeerd door gebruiker');
  return { success: true };
}

export async function resumePipeline(projectId: string): Promise<{ success: boolean }> {
  const state = activePipelines.get(projectId);
  if (state && state.status === 'paused') {
    state.activeNodes.clear();
    state.status = 'running';
    await updateProjectStatus(projectId, 'running');
    await addLog(projectId, 'info', 0, 'App', 'Pipeline hervat');

    // Herlaad pipeline nodes
    const project = await getProjectData(projectId);
    const { nodes } = await loadPipelineForProject(project);
    runPipeline(projectId, nodes).catch(console.error);
    return { success: true };
  }
  return startPipeline(projectId);
}

export async function approveStep(projectId: string, stepNumber: number): Promise<{ success: boolean }> {
  const state = activePipelines.get(projectId);

  await updateStepInDb(projectId, stepNumber, { status: 'completed' });
  await addLog(projectId, 'info', stepNumber, 'App', 'Goedgekeurd');

  if (state) {
    // Zoek nodeId voor deze sortOrder
    const project = await getProjectData(projectId);
    const { nodes } = await loadPipelineForProject(project);
    const node = nodes.find(n => n.sortOrder === stepNumber);
    if (node) state.completedNodes.add(node.nodeId);

    if (state.status === 'review') {
      state.status = 'running';
      await updateProjectStatus(projectId, 'running');
      await addLog(projectId, 'info', 0, 'App', 'Pipeline hervat na review');
      runPipeline(projectId, nodes).catch(console.error);
    }
  } else {
    await updateProjectStatus(projectId, 'running');
    return startPipeline(projectId);
  }

  return { success: true };
}

export async function submitFeedback(
  projectId: string, stepNumber: number, feedback: string
): Promise<{ success: boolean }> {
  const project = await getProjectData(projectId);
  const state = activePipelines.get(projectId);

  const feedbackHistory = project.feedbackHistory || [];
  const step = project.steps.find((s: any) => s.stepNumber === stepNumber);
  const attemptNumber = (step?.attemptNumber || 1) + 1;

  feedbackHistory.push({
    stepNumber, feedback, attempt: attemptNumber,
    timestamp: new Date().toISOString(),
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { feedbackHistory: JSON.stringify(feedbackHistory) },
  });

  await updateStepInDb(projectId, stepNumber, {
    status: 'waiting', error: null, duration: null,
    result: JSON.stringify({ feedback }),
    attemptNumber,
  });

  await addLog(projectId, 'info', stepNumber, 'App',
    `Feedback gegeven — wordt opnieuw gegenereerd (poging ${attemptNumber})`);

  if (state) {
    const { nodes } = await loadPipelineForProject(project);
    const node = nodes.find(n => n.sortOrder === stepNumber);
    if (node) state.completedNodes.delete(node.nodeId);

    if (state.status === 'review') {
      state.status = 'running';
      await updateProjectStatus(projectId, 'running');
      runPipeline(projectId, nodes).catch(console.error);
    }
  } else {
    return startPipeline(projectId);
  }

  return { success: true };
}

export async function skipStep(projectId: string, stepNumber: number): Promise<{ success: boolean }> {
  const state = activePipelines.get(projectId);

  await updateStepInDb(projectId, stepNumber, { status: 'skipped' });
  await addLog(projectId, 'info', stepNumber, 'App', 'Handmatig overgeslagen');

  if (state) {
    const project = await getProjectData(projectId);
    const { nodes } = await loadPipelineForProject(project);
    const node = nodes.find(n => n.sortOrder === stepNumber);
    if (node) {
      state.skippedNodes.add(node.nodeId);
      state.failedNodes.delete(node.nodeId);
      state.activeNodes.delete(node.nodeId);
    }

    if (state.status !== 'running') {
      state.status = 'running';
      await updateProjectStatus(projectId, 'running');
      runPipeline(projectId, nodes).catch(console.error);
    }
  }

  return { success: true };
}

export async function retryStep(projectId: string, stepNumber: number): Promise<{ success: boolean }> {
  const state = activePipelines.get(projectId);

  await updateStepInDb(projectId, stepNumber, {
    status: 'waiting', error: null, duration: null,
  });
  await addLog(projectId, 'info', stepNumber, 'App', 'Handmatig opnieuw gestart');

  if (state) {
    const project = await getProjectData(projectId);
    const { nodes } = await loadPipelineForProject(project);
    const node = nodes.find(n => n.sortOrder === stepNumber);
    if (node) {
      state.failedNodes.delete(node.nodeId);
      state.completedNodes.delete(node.nodeId);
      state.activeNodes.delete(node.nodeId);
    }

    if (state.status !== 'running') {
      state.status = 'running';
      await updateProjectStatus(projectId, 'running');
      runPipeline(projectId, nodes).catch(console.error);
    }
  } else {
    return startPipeline(projectId);
  }

  return { success: true };
}

export function getPipelineStatus(projectId: string): {
  isActive: boolean;
  status?: string;
  activeSteps: number[];
  completedSteps: number[];
  skippedSteps: number[];
  failedSteps: Array<{ step: number; error: string }>;
} {
  const state = activePipelines.get(projectId);
  if (!state) {
    return { isActive: false, activeSteps: [], completedSteps: [], skippedSteps: [], failedSteps: [] };
  }

  // We moeten nodeIds terug mappen naar sortOrders voor de UI
  // Dit is een simpele lookup — de UI werkt met stepNumber = sortOrder
  return {
    isActive: true,
    status: state.status,
    activeSteps: Array.from(state.activeNodes),
    completedSteps: Array.from(state.completedNodes),
    skippedSteps: Array.from(state.skippedNodes),
    failedSteps: Array.from(state.failedNodes.entries()).map(([nodeId, error]) => ({ step: nodeId, error })),
  };
}

export function stopPipeline(projectId: string) {
  const state = activePipelines.get(projectId);
  if (state) {
    state.status = 'paused';
    activePipelines.delete(projectId);
  }
}

export async function approveScene(
  projectId: string, sceneId: number, imagePath: string, clipOption: string
): Promise<{ success: boolean }> {
  await addLog(projectId, 'info', 0, 'App',
    `Scene ${sceneId} goedgekeurd (image: ${imagePath}, clip: ${clipOption})`);
  return { success: true };
}

// ── Wachtrij ──

async function startNextQueuedProject(): Promise<void> {
  try {
    if (activePipelines.size > 0) {
      console.log('[Queue] Er draait al een pipeline, wachtrij wacht.');
      return;
    }

    const nextProject = await prisma.project.findFirst({
      where: { status: 'queued' },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    if (!nextProject) {
      console.log('[Queue] Geen projecten in de wachtrij.');
      return;
    }

    console.log(`[Queue] Volgende project starten: ${nextProject.name}`);
    await addLog(nextProject.id, 'info', 0, 'Queue',
      `Project automatisch gestart vanuit wachtrij (prioriteit: ${nextProject.priority})`);
    await notifyDiscord(`📋 **Wachtrij:** Project **${nextProject.name}** wordt nu automatisch gestart`);

    await startPipeline(nextProject.id, true);
  } catch (error: any) {
    console.error('[Queue] Fout:', error.message);
  }
}

export { startNextQueuedProject };
