/**
 * Pipeline Engine — Server-side orchestrator
 * 
 * Beheert de volledige video productie pipeline:
 * - Automatisch doorschakelen tussen stappen
 * - Parallelle verwerking waar mogelijk
 * - 6b→9 streaming (per scene image→video)
 * - Retry logica met incremental delay
 * - Timeout detectie
 * - Checkpoint pauzering (review)
 * - Hervatten na crash
 * - Skip logica op basis van project config
 */

import prisma from '../db.js';
import {
  executeStep0, executeStep1, executeStep2, executeStep3,
  executeStep4, executeStep5, executeStep6, executeStep6b,
  executeStep7, executeStep8, executeStep9, executeStep10,
  executeStep11, executeStep12, executeStep13,
} from './pipeline.js';

// ── Types ──

interface PipelineState {
  projectId: string;
  status: 'running' | 'paused' | 'review' | 'completed' | 'failed';
  activeSteps: Set<number>;       // Stappen die nu draaien
  completedSteps: Set<number>;    // Stappen die klaar zijn
  skippedSteps: Set<number>;      // Stappen die overgeslagen zijn
  failedSteps: Map<number, string>; // Stap → foutmelding
  sceneQueue: SceneTask[];        // 6b→9 streaming queue
  abortController?: AbortController;
}

interface SceneTask {
  sceneId: number;
  imageReady: boolean;
  imageApproved: boolean;  // Voor manual mode
  videoStarted: boolean;
  videoCompleted: boolean;
  imagePath?: string;
}

type StepExecutor = (project: any, settings: any, llmKeys: any) => Promise<any>;

// ── Constants ──

// Stap volgorde en afhankelijkheden
// "dependsOn" = welke stappen KLAAR moeten zijn voordat deze mag starten
// "parallel" = mag tegelijk draaien met andere stappen die ook parallel=true zijn
const STEP_CONFIG: Record<number, {
  dependsOn: number[];
  isCheckpoint?: boolean;        // Pauzeert voor review
  checkpointCondition?: string;  // Wanneer het een checkpoint is
  canSkip?: (project: any) => boolean;
  timeout: number;               // Max milliseconden
  maxRetries: number;
  retryDelays: number[];         // Wachttijden tussen retries in ms
}> = {
  0:  { dependsOn: [],         timeout: 30_000,     maxRetries: 1, retryDelays: [0] },
  1:  { dependsOn: [0],        timeout: 120_000,    maxRetries: 3, retryDelays: [5_000, 15_000, 30_000] },
  2:  { dependsOn: [1],        timeout: 180_000,    maxRetries: 3, retryDelays: [5_000, 15_000, 30_000] },
  3:  { dependsOn: [2],        timeout: 300_000,    maxRetries: 3, retryDelays: [5_000, 15_000, 30_000],
        isCheckpoint: true },
  4:  { dependsOn: [3],        timeout: 180_000,    maxRetries: 3, retryDelays: [5_000, 15_000, 30_000] },
  5:  { dependsOn: [4],        timeout: 300_000,    maxRetries: 3, retryDelays: [5_000, 15_000, 30_000] },
  6:  { dependsOn: [5],        timeout: 300_000,    maxRetries: 3, retryDelays: [5_000, 15_000, 30_000],
        checkpointCondition: 'manual_image_mode' },
  65: { dependsOn: [6],        timeout: 900_000,    maxRetries: 2, retryDelays: [10_000, 30_000],
        checkpointCondition: 'manual_image_mode' },
  7:  { dependsOn: [6],        timeout: 600_000,    maxRetries: 3, retryDelays: [5_000, 15_000, 30_000],
        canSkip: (p) => !p.stockImages },
  8:  { dependsOn: [6],        timeout: 600_000,    maxRetries: 3, retryDelays: [5_000, 15_000, 30_000],
        canSkip: (p) => !p.useClips },
  9:  { dependsOn: [65],       timeout: 900_000,    maxRetries: 2, retryDelays: [10_000, 30_000] },
  10: { dependsOn: [7, 8, 9],  timeout: 3_600_000,  maxRetries: 2, retryDelays: [15_000, 30_000] },
  11: { dependsOn: [10],       timeout: 1_800_000,  maxRetries: 2, retryDelays: [10_000, 30_000],
        canSkip: (p) => !p.colorGrading || p.colorGrading === 'Geen' },
  12: { dependsOn: [10],       timeout: 1_800_000,  maxRetries: 2, retryDelays: [10_000, 30_000],
        canSkip: (p) => !p.subtitles },
  13: { dependsOn: [10, 11, 12], timeout: 1_800_000, maxRetries: 2, retryDelays: [10_000, 30_000] },
};

// Stap volgorde voor display (stepNumber waarden)
const STEP_ORDER = [0, 1, 2, 3, 4, 5, 6, 65, 7, 8, 9, 10, 11, 12, 13];

// Parallel groep: stappen 65, 7, 8 mogen tegelijk starten zodra stap 6 klaar is
const PARALLEL_GROUP = [65, 7, 8];

// ── Actieve pipelines in memory ──

const activePipelines: Map<string, PipelineState> = new Map();

// ── Hulpfuncties ──

async function getProjectData(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { steps: { orderBy: { stepNumber: 'asc' } } },
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

function getLlmKeys(settings: any) {
  return { elevateApiKey: settings.elevateApiKey, anthropicApiKey: settings.anthropicApiKey };
}

async function updateStepInDb(projectId: string, stepNumber: number, data: any) {
  await prisma.step.update({
    where: { projectId_stepNumber: { projectId, stepNumber } },
    data,
  });
}

async function addLog(projectId: string, level: string, step: number, source: string, message: string) {
  await prisma.logEntry.create({
    data: { level, step, source, message, projectId },
  });
  console.log(`[Pipeline][${level.toUpperCase()}] Stap ${step}: ${message}`);
}

async function updateProjectStatus(projectId: string, status: string) {
  await prisma.project.update({ where: { id: projectId }, data: { status } });
}

function getExecutorName(stepNumber: number): string {
  const map: Record<number, string> = {
    0: 'App', 1: 'App', 2: 'Elevate AI', 3: 'Elevate AI',
    4: 'N8N', 5: 'N8N', 6: 'Elevate AI', 65: 'N8N',
    7: 'N8N', 8: 'N8N', 9: 'N8N', 10: 'N8N',
    11: 'N8N', 12: 'App', 13: 'N8N',
  };
  return map[stepNumber] || 'App';
}

function getStepName(stepNumber: number): string {
  const map: Record<number, string> = {
    0: 'Config validatie', 1: 'Transcripts ophalen', 2: 'Style profile maken',
    3: 'Script schrijven', 4: 'Voiceover genereren', 5: 'Timestamps genereren',
    6: 'Scene prompts genereren', 65: 'Scene images genereren',
    7: 'Assets zoeken', 8: 'YouTube clips ophalen', 9: 'Video scenes genereren',
    10: 'Video editing', 11: 'Color grading', 12: 'Subtitles', 13: 'Final export',
  };
  return map[stepNumber] || `Stap ${stepNumber}`;
}

// ── Stap uitvoeren met retry + timeout ──

async function executeStepWithRetry(
  projectId: string,
  stepNumber: number,
  state: PipelineState,
): Promise<{ success: boolean; result?: any; error?: string }> {
  const config = STEP_CONFIG[stepNumber];
  if (!config) return { success: false, error: `Onbekende stap ${stepNumber}` };

  const project = await getProjectData(projectId);
  const settings = await getSettings();
  const llmKeys = getLlmKeys(settings);
  const source = getExecutorName(stepNumber);
  const stepName = getStepName(stepNumber);

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    // Check of pipeline nog draait
    if (state.status !== 'running') {
      return { success: false, error: 'Pipeline gestopt' };
    }

    const isRetry = attempt > 0;
    if (isRetry) {
      const delay = config.retryDelays[attempt - 1] || 30_000;
      await addLog(projectId, 'warn', stepNumber, source,
        `${stepName} retry ${attempt}/${config.maxRetries} (wacht ${delay / 1000}s)...`);
      await new Promise(r => setTimeout(r, delay));

      // Refresh project data voor retry
      const freshProject = await getProjectData(projectId);
      Object.assign(project, freshProject);
    }

    const startedAt = new Date();

    await updateStepInDb(projectId, stepNumber, {
      status: 'running',
      startedAt,
      firstAttemptAt: isRetry ? undefined : startedAt,
      error: null,
      retryCount: attempt,
    });

    if (!isRetry) {
      await addLog(projectId, 'info', stepNumber, source, `${stepName} gestart...`);
    }

    try {
      // Voer stap uit met timeout
      const result = await Promise.race([
        executeStepFunction(stepNumber, project, settings, llmKeys),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout: ${stepName} duurde langer dan ${config.timeout / 1000}s`)),
            config.timeout)
        ),
      ]);

      const duration = Math.round((Date.now() - startedAt.getTime()) / 1000);

      // Check of dit een checkpoint is
      const isCheckpoint = config.isCheckpoint ||
        (config.checkpointCondition === 'manual_image_mode' && project.imageSelectionMode === 'manual');

      const newStatus = isCheckpoint ? 'review' : 'completed';

      await updateStepInDb(projectId, stepNumber, {
        status: newStatus,
        duration,
        result: JSON.stringify(result),
        error: null,
      });

      await addLog(projectId, 'info', stepNumber, source,
        `${stepName} voltooid (${duration}s)${isCheckpoint ? ' — wacht op review' : ''}`);

      return { success: true, result, isCheckpoint } as any;
    } catch (err: any) {
      const duration = Math.round((Date.now() - startedAt.getTime()) / 1000);
      const errorMsg = err.message || 'Onbekende fout';

      if (attempt >= config.maxRetries) {
        // Alle retries mislukt
        await updateStepInDb(projectId, stepNumber, {
          status: 'failed', duration, error: errorMsg, retryCount: attempt,
        });
        await addLog(projectId, 'error', stepNumber, source,
          `${stepName} mislukt na ${attempt + 1} poging(en): ${errorMsg}`);
        return { success: false, error: errorMsg };
      }
      // Nog retries over
      await addLog(projectId, 'warn', stepNumber, source,
        `${stepName} poging ${attempt + 1} mislukt: ${errorMsg}`);
    }
  }

  return { success: false, error: 'Onverwachte fout in retry loop' };
}

// ── Step function dispatcher ──

async function executeStepFunction(
  stepNumber: number, project: any, settings: any, llmKeys: any
): Promise<any> {
  switch (stepNumber) {
    case 0: {
      const r = await executeStep0(project);
      if (!r.valid) throw new Error(`Validatie fouten: ${r.errors.join(', ')}`);
      return { projectPath: r.projectPath };
    }
    case 1: return executeStep1(project, settings.youtubeTranscriptApiKey);
    case 2: return executeStep2(project, llmKeys);
    case 3: return executeStep3(project, llmKeys);
    case 4: return executeStep4(project, settings);
    case 5: return executeStep5(project, settings);
    case 6: return executeStep6(project, llmKeys);
    case 65: return executeStep6b(project, settings);
    case 7: return executeStep7(project, settings);
    case 8: return executeStep8(project, settings);
    case 9: return executeStep9(project, settings);
    case 10: return executeStep10(project, settings);
    case 11: return executeStep11(project, settings);
    case 12: return executeStep12(project, settings);
    case 13: return executeStep13(project, settings);
    default: throw new Error(`Stap ${stepNumber} niet geïmplementeerd`);
  }
}

// ── Kern: welke stappen kunnen nu starten? ──

function getReadySteps(state: PipelineState, project: any): number[] {
  const ready: number[] = [];

  // Special: stap 65 en 9 worden door runSceneStreaming afgehandeld
  // Ze komen NIET in de ready list — de orchestrator start ze apart
  const STREAMING_STEPS = new Set([65, 9]);

  for (const stepNum of STEP_ORDER) {
    // Scene streaming stappen skippen — worden apart afgehandeld
    if (STREAMING_STEPS.has(stepNum)) continue;

    // Al bezig, klaar, of overgeslagen? → skip
    if (state.activeSteps.has(stepNum)) continue;
    if (state.completedSteps.has(stepNum)) continue;
    if (state.skippedSteps.has(stepNum)) continue;
    if (state.failedSteps.has(stepNum)) continue;

    const config = STEP_CONFIG[stepNum];
    if (!config) continue;

    // Kan deze stap overgeslagen worden?
    if (config.canSkip && config.canSkip(project)) continue;

    // Zijn alle dependencies klaar (completed of skipped)?
    const depsReady = config.dependsOn.every(
      dep => state.completedSteps.has(dep) || state.skippedSteps.has(dep)
    );
    if (!depsReady) continue;

    ready.push(stepNum);
  }

  // Special: check of scene streaming moet starten
  // Conditie: stap 6 is klaar, en 65+9 zijn nog niet gestart/klaar
  if (state.completedSteps.has(6) &&
      !state.completedSteps.has(65) && !state.completedSteps.has(9) &&
      !state.skippedSteps.has(65) && !state.skippedSteps.has(9) &&
      !state.activeSteps.has(65) && !state.activeSteps.has(9)) {
    ready.push(65); // Marker: 65 in ready = start scene streaming
  }

  return ready;
}

// ── Hoofd orchestrator loop ──

async function runPipeline(projectId: string) {
  const state = activePipelines.get(projectId);
  if (!state || state.status !== 'running') return;

  const project = await getProjectData(projectId);

  // Bepaal skip stappen
  for (const stepNum of STEP_ORDER) {
    const config = STEP_CONFIG[stepNum];
    if (config?.canSkip && config.canSkip(project)) {
      if (!state.skippedSteps.has(stepNum) && !state.completedSteps.has(stepNum)) {
        state.skippedSteps.add(stepNum);
        await updateStepInDb(projectId, stepNum, { status: 'skipped' });
        await addLog(projectId, 'info', stepNum, 'App',
          `${getStepName(stepNum)} overgeslagen (niet nodig voor dit project)`);
      }
    }
  }

  // Orchestrator loop
  while (state.status === 'running') {
    const freshProject = await getProjectData(projectId);
    const readySteps = getReadySteps(state, freshProject);

    if (readySteps.length === 0) {
      // Niets meer te doen — zijn we klaar of wachten we?
      if (state.activeSteps.size > 0) {
        // Wacht tot lopende stappen klaar zijn
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      // Check of alles klaar is
      const allDone = STEP_ORDER.every(s =>
        state.completedSteps.has(s) || state.skippedSteps.has(s)
      );
      if (allDone) {
        state.status = 'completed';
        await updateProjectStatus(projectId, 'completed');
        await prisma.project.update({
          where: { id: projectId },
          data: { completedAt: new Date() },
        });
        await addLog(projectId, 'info', 13, 'App', '🎉 Pipeline voltooid! Video is klaar.');
        activePipelines.delete(projectId);
        return;
      }

      // Er zijn gefaalde stappen → pipeline stopt
      if (state.failedSteps.size > 0) {
        state.status = 'failed';
        await updateProjectStatus(projectId, 'failed');
        const failedNames = Array.from(state.failedSteps.entries())
          .map(([num, err]) => `${getStepName(num)}: ${err}`).join('; ');
        await addLog(projectId, 'error', 0, 'App',
          `Pipeline gestopt — mislukte stappen: ${failedNames}`);
        return;
      }

      // Wachten (misschien op review)
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    // Start alle ready stappen parallel
    const stepPromises: Promise<void>[] = [];

    for (const stepNum of readySteps) {
      // Special: stap 65 = start scene streaming (65 + 9 samen)
      if (stepNum === 65) {
        state.activeSteps.add(65);
        state.activeSteps.add(9);

        const streamPromise = (async () => {
          try {
            const streamResult = await runSceneStreaming(projectId, state);
            state.activeSteps.delete(65);
            state.activeSteps.delete(9);

            if (state.status === 'review') {
              // Manual mode: 65 staat op review, 9 is nog niet gestart
              // completedSteps wordt niet gezet — wacht op approve
              return;
            }

            // Auto mode: beide stappen zijn klaar
            state.completedSteps.add(65);
            if (streamResult.videosCompleted > 0) {
              state.completedSteps.add(9);
            } else if (streamResult.totalScenes > 0) {
              state.failedSteps.set(9, 'Geen video scenes geslaagd');
            } else {
              state.skippedSteps.add(65);
              state.skippedSteps.add(9);
            }
          } catch (err: any) {
            state.activeSteps.delete(65);
            state.activeSteps.delete(9);
            state.failedSteps.set(65, err.message || 'Scene streaming mislukt');
          }
        })();

        stepPromises.push(streamPromise);
        continue;
      }

      state.activeSteps.add(stepNum);

      const promise = (async () => {
        try {
          const result = await executeStepWithRetry(projectId, stepNum, state);

          state.activeSteps.delete(stepNum);

          if (result.success) {
            if ((result as any).isCheckpoint) {
              // Pipeline pauzeert voor review
              state.status = 'review';
              await updateProjectStatus(projectId, 'review');
              await addLog(projectId, 'info', stepNum, 'App',
                `Pipeline gepauzeerd — wacht op review voor ${getStepName(stepNum)}`);
              // Stap is 'review' status, NIET completed
              // completedSteps wordt pas bijgewerkt na approve
            } else {
              state.completedSteps.add(stepNum);
            }
          } else {
            state.failedSteps.set(stepNum, result.error || 'Onbekende fout');
          }
        } catch (err: any) {
          state.activeSteps.delete(stepNum);
          state.failedSteps.set(stepNum, err.message || 'Onbekende fout');
        }
      })();

      stepPromises.push(promise);
    }

    // Wacht tot MINSTENS 1 stap klaar is voordat we opnieuw checken
    // (We willen niet wachten tot ALLE klaar zijn, want dan missen we parallelle kansen)
    await Promise.race([
      Promise.all(stepPromises),
      new Promise(r => setTimeout(r, 3000)), // Of check elke 3 seconden
    ]);

    // Korte pauze om CPU te sparen
    await new Promise(r => setTimeout(r, 500));
  }
}

// ── Public API ──

export async function startPipeline(projectId: string): Promise<{ success: boolean; error?: string }> {
  // Check of er al een pipeline draait voor dit project
  if (activePipelines.has(projectId)) {
    const existing = activePipelines.get(projectId)!;
    if (existing.status === 'running') {
      return { success: false, error: 'Pipeline draait al voor dit project' };
    }
  }

  const project = await getProjectData(projectId);

  // Bepaal welke stappen al klaar zijn (voor hervatten)
  const completedSteps = new Set<number>();
  const skippedSteps = new Set<number>();
  const failedSteps = new Map<number, string>();

  for (const step of project.steps) {
    if (step.status === 'completed') completedSteps.add(step.stepNumber);
    if (step.status === 'skipped') skippedSteps.add(step.stepNumber);
    // Reset failed stappen naar waiting zodat ze opnieuw geprobeerd worden
    if (step.status === 'failed') {
      await updateStepInDb(projectId, step.stepNumber, { status: 'waiting', error: null });
    }
    // Reset running stappen (waren bezig toen het crashte)
    if (step.status === 'running') {
      await updateStepInDb(projectId, step.stepNumber, { status: 'waiting', error: null });
    }
  }

  const state: PipelineState = {
    projectId,
    status: 'running',
    activeSteps: new Set(),
    completedSteps,
    skippedSteps,
    failedSteps: new Map(),
    sceneQueue: [],
  };

  activePipelines.set(projectId, state);

  await updateProjectStatus(projectId, 'running');
  await prisma.project.update({
    where: { id: projectId },
    data: { startedAt: project.startedAt || new Date() },
  });
  await addLog(projectId, 'info', 0, 'App', 'Pipeline gestart');

  // Start de pipeline loop op de achtergrond (niet await!)
  runPipeline(projectId).catch(async (err) => {
    console.error(`[Pipeline] Onverwachte fout voor project ${projectId}:`, err);
    await addLog(projectId, 'error', 0, 'App', `Pipeline crashte: ${err.message}`);
    await updateProjectStatus(projectId, 'failed');
    activePipelines.delete(projectId);
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
    state.status = 'running';
    await updateProjectStatus(projectId, 'running');
    await addLog(projectId, 'info', 0, 'App', 'Pipeline hervat');
    runPipeline(projectId).catch(console.error);
    return { success: true };
  }

  // Geen actieve state? Start opnieuw (hervatten na crash)
  return startPipeline(projectId);
}

export async function approveStep(projectId: string, stepNumber: number): Promise<{ success: boolean }> {
  const state = activePipelines.get(projectId);

  // Update de stap in de database
  await updateStepInDb(projectId, stepNumber, { status: 'completed' });
  await addLog(projectId, 'info', stepNumber, 'App',
    `${getStepName(stepNumber)} goedgekeurd`);

  if (state) {
    state.completedSteps.add(stepNumber);
    if (state.status === 'review') {
      state.status = 'running';
      await updateProjectStatus(projectId, 'running');
      await addLog(projectId, 'info', 0, 'App', 'Pipeline hervat na review');
      runPipeline(projectId).catch(console.error);
    }
  } else {
    // Geen actieve pipeline — start opnieuw
    await updateProjectStatus(projectId, 'running');
    return startPipeline(projectId);
  }

  return { success: true };
}

export async function submitFeedback(
  projectId: string, stepNumber: number, feedback: string
): Promise<{ success: boolean }> {
  const state = activePipelines.get(projectId);
  const project = await getProjectData(projectId);

  // Sla feedback op
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

  // Reset de stap
  await updateStepInDb(projectId, stepNumber, {
    status: 'waiting', error: null, duration: null,
    result: JSON.stringify({ feedback }),
    attemptNumber,
  });

  await addLog(projectId, 'info', stepNumber, 'App',
    `Feedback gegeven voor ${getStepName(stepNumber)} — wordt opnieuw gegenereerd (poging ${attemptNumber})`);

  if (state) {
    state.completedSteps.delete(stepNumber);
    if (state.status === 'review') {
      state.status = 'running';
      await updateProjectStatus(projectId, 'running');
      runPipeline(projectId).catch(console.error);
    }
  } else {
    return startPipeline(projectId);
  }

  return { success: true };
}

export async function approveScene(
  projectId: string, sceneId: number, imagePath: string, clipOption: string
): Promise<{ success: boolean }> {
  // Wordt aangeroepen vanuit de ImageReviewPanel wanneer gebruiker 1 scene goedkeurt
  // In manual mode: deze scene mag nu naar stap 9
  await addLog(projectId, 'info', 65, 'App',
    `Scene ${sceneId} goedgekeurd (image: ${imagePath}, clip: ${clipOption})`);

  // De image-selections.json wordt al geüpdatet door de frontend saveSelections call
  // De pipeline engine checkt bij stap 9 welke scenes goedgekeurd zijn

  return { success: true };
}

export async function skipStep(projectId: string, stepNumber: number): Promise<{ success: boolean }> {
  const state = activePipelines.get(projectId);

  await updateStepInDb(projectId, stepNumber, { status: 'skipped' });
  await addLog(projectId, 'info', stepNumber, 'App',
    `${getStepName(stepNumber)} handmatig overgeslagen`);

  if (state) {
    state.skippedSteps.add(stepNumber);
    state.failedSteps.delete(stepNumber);
    state.activeSteps.delete(stepNumber);

    if (state.status !== 'running') {
      state.status = 'running';
      await updateProjectStatus(projectId, 'running');
      runPipeline(projectId).catch(console.error);
    }
  }

  return { success: true };
}

export async function retryStep(projectId: string, stepNumber: number): Promise<{ success: boolean }> {
  const state = activePipelines.get(projectId);

  await updateStepInDb(projectId, stepNumber, {
    status: 'waiting', error: null, duration: null,
  });
  await addLog(projectId, 'info', stepNumber, 'App',
    `${getStepName(stepNumber)} handmatig opnieuw gestart`);

  if (state) {
    state.failedSteps.delete(stepNumber);
    state.completedSteps.delete(stepNumber);
    state.activeSteps.delete(stepNumber);

    if (state.status !== 'running') {
      state.status = 'running';
      await updateProjectStatus(projectId, 'running');
      runPipeline(projectId).catch(console.error);
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
  return {
    isActive: true,
    status: state.status,
    activeSteps: Array.from(state.activeSteps),
    completedSteps: Array.from(state.completedSteps),
    skippedSteps: Array.from(state.skippedSteps),
    failedSteps: Array.from(state.failedSteps.entries()).map(([step, error]) => ({ step, error })),
  };
}

export function stopPipeline(projectId: string) {
  const state = activePipelines.get(projectId);
  if (state) {
    state.status = 'paused';
    activePipelines.delete(projectId);
  }
}

// ══════════════════════════════════════════════════════════════
// SCENE STREAMING: 6b → 9 per scene
// ══════════════════════════════════════════════════════════════

import fs from 'fs/promises';
import path from 'path';

const WORKSPACE_BASE = '/root/.openclaw/workspace/projects';

/**
 * Draait stap 65 + 9 als een streaming pipeline:
 * - Auto mode: per scene → genereer 1 image → start video meteen
 * - Manual mode: genereer alle images (3 per scene) → wacht op goedkeuring per scene → start video
 * 
 * Dit vervangt de losse executeStep6b + executeStep9 voor de pipeline engine.
 * De originele functies blijven bestaan voor handmatig gebruik.
 */
export async function runSceneStreaming(projectId: string, state: PipelineState): Promise<{
  imagesCompleted: number;
  imagesFailed: number;
  videosCompleted: number;
  videosFailed: number;
  totalScenes: number;
}> {
  const project = await getProjectData(projectId);
  const settings = await getSettings();
  const projPath = path.join(WORKSPACE_BASE, project.name);

  // Lees scene prompts
  const scenePromptsPath = path.join(projPath, 'assets', 'scene-prompts.json');
  let scenePrompts: any;
  try {
    const raw = await fs.readFile(scenePromptsPath, 'utf-8');
    scenePrompts = JSON.parse(raw);
  } catch {
    throw new Error('scene-prompts.json niet gevonden. Voer eerst stap 6 uit.');
  }

  const aiScenes = (scenePrompts.scenes || []).filter(
    (s: any) => (s.asset_type === 'ai_video' || s.type === 'ai_video') &&
      s.visual_prompt_variants && s.visual_prompt_variants.length >= 1
  );

  if (aiScenes.length === 0) {
    await addLog(projectId, 'info', 65, 'App', 'Geen AI video scenes gevonden — stap 65+9 overgeslagen');
    return { imagesCompleted: 0, imagesFailed: 0, videosCompleted: 0, videosFailed: 0, totalScenes: 0 };
  }

  const isAutoMode = project.imageSelectionMode !== 'manual';
  const aspectRatio = project.output === 'youtube_short' ? 'portrait' : 'landscape';
  const n8nImageUrl = (settings.n8nBaseUrl || 'https://n8n.srv1275252.hstgr.cloud') + '/webhook/image-options-generator';
  const n8nVideoUrl = (settings.n8nBaseUrl || 'https://n8n.srv1275252.hstgr.cloud') + '/webhook/video-scene-generator';
  const imageOptionsDir = path.join(projPath, 'assets', 'image-options') + '/';
  const scenesOutputDir = path.join(projPath, 'assets', 'scenes') + '/';

  await fs.mkdir(path.join(projPath, 'assets', 'image-options'), { recursive: true });
  await fs.mkdir(path.join(projPath, 'assets', 'scenes'), { recursive: true });

  let imagesCompleted = 0;
  let imagesFailed = 0;
  let videosCompleted = 0;
  let videosFailed = 0;
  const totalScenes = aiScenes.length;

  // Markeer stap 65 als running
  await updateStepInDb(projectId, 65, { status: 'running', startedAt: new Date(), error: null });
  await addLog(projectId, 'info', 65, 'N8N',
    `Scene streaming gestart: ${totalScenes} scenes, mode: ${isAutoMode ? 'auto' : 'manual'}`);

  // Track welke video's we al gestart hebben (voor parallel video generatie)
  const activeVideoPromises: Map<number, Promise<void>> = new Map();
  const MAX_CONCURRENT_VIDEOS = 2; // Max 2 video's tegelijk (rate limits)

  // Selecties voor manual mode
  const allSelections: any[] = [];

  // ── Helper: wacht tot er plek is voor een nieuwe video ──
  async function waitForVideoSlot() {
    while (activeVideoPromises.size >= MAX_CONCURRENT_VIDEOS) {
      await Promise.race([...activeVideoPromises.values()]);
    }
  }

  // ── Helper: genereer video voor 1 scene ──
  async function generateVideo(sceneId: number, imagePath: string, visualPrompt: string, duration: number) {
    const statusPath = path.join(projPath, 'assets', 'scenes', `scene${sceneId}-status.json`);
    try { await fs.unlink(statusPath); } catch {}

    const payload = {
      project: project.name,
      scene_id: sceneId,
      visual_prompt: visualPrompt,
      duration: duration || 5,
      aspect_ratio: aspectRatio,
      output_dir: scenesOutputDir,
      elevate_api_key: settings.elevateApiKey,
      source_image_path: imagePath,
    };

    const response = await fetch(n8nVideoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Video webhook mislukt (${response.status}): ${body}`);
    }

    // Poll voor status (max 10 minuten per scene)
    const start = Date.now();
    const timeoutMs = 600_000;
    const intervalMs = 10_000;

    while (Date.now() - start < timeoutMs) {
      if (state.status !== 'running') throw new Error('Pipeline gestopt');
      try {
        const raw = await fs.readFile(statusPath, 'utf-8');
        const status = JSON.parse(raw);
        if (status.status === 'completed') {
          videosCompleted++;
          await addLog(projectId, 'info', 9, 'N8N',
            `Scene ${sceneId} video klaar (${videosCompleted}/${totalScenes})`);

          // Update stap 9 metadata
          await updateStepInDb(projectId, 9, {
            status: 'running',
            metadata: JSON.stringify({
              scenesCompleted: videosCompleted,
              scenesFailed: videosFailed,
              totalScenes,
              progress: `${videosCompleted}/${totalScenes}`,
            }),
          });
          return;
        }
        if (status.status === 'failed') {
          throw new Error(status.error || 'Video generatie mislukt');
        }
      } catch (e: any) {
        if (!e.message?.includes('ENOENT') && !e.message?.includes('Unexpected')) throw e;
      }
      await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error(`Timeout: video scene ${sceneId} niet klaar binnen ${timeoutMs / 1000}s`);
  }

  // ══ AUTO MODE: image → video streaming per scene ══
  if (isAutoMode) {
    // Markeer stap 9 ook als running
    await updateStepInDb(projectId, 9, { status: 'running', startedAt: new Date(), error: null });
    await addLog(projectId, 'info', 9, 'N8N',
      `Video generatie gestart (streaming, max ${MAX_CONCURRENT_VIDEOS} tegelijk)`);

    for (let i = 0; i < aiScenes.length; i++) {
      if (state.status !== 'running') break;

      const scene = aiScenes[i];
      const sceneId = scene.id;
      const statusPath = path.join(projPath, 'assets', 'image-options', `scene${sceneId}-status.json`);

      // 1. Genereer 1 image
      const prompts = [scene.visual_prompt_variants[0] || scene.visual_prompt];
      const imagePayload = {
        project: project.name,
        scene_id: sceneId,
        visual_prompts: prompts,
        aspect_ratio: aspectRatio,
        output_dir: imageOptionsDir,
        elevate_api_key: settings.elevateApiKey,
        status_path: statusPath,
      };

      try { await fs.unlink(statusPath); } catch {}

      try {
        const imgResponse = await fetch(n8nImageUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(imagePayload),
        });

        if (!imgResponse.ok) throw new Error(`Image webhook mislukt: ${imgResponse.status}`);

        // Poll voor image (max 3 min)
        const imgStart = Date.now();
        let imageStatus: any = null;
        while (Date.now() - imgStart < 180_000) {
          if (state.status !== 'running') break;
          try {
            const raw = await fs.readFile(statusPath, 'utf-8');
            imageStatus = JSON.parse(raw);
            if (imageStatus.status === 'completed') break;
            if (imageStatus.status === 'failed') throw new Error(imageStatus.error || 'Image mislukt');
          } catch (e: any) {
            if (!e.message?.includes('ENOENT') && !e.message?.includes('Unexpected')) throw e;
          }
          await new Promise(r => setTimeout(r, 5000));
        }

        if (!imageStatus || imageStatus.status !== 'completed') {
          throw new Error(`Image timeout voor scene ${sceneId}`);
        }

        imagesCompleted++;
        const imagePath = imageStatus.options?.[0]?.path || '';

        await addLog(projectId, 'info', 65, 'N8N',
          `Scene ${sceneId} image klaar (${imagesCompleted}/${totalScenes})`);

        // Update stap 65 metadata
        await updateStepInDb(projectId, 65, {
          metadata: JSON.stringify({
            scenesCompleted: imagesCompleted,
            scenesFailed: imagesFailed,
            totalScenes,
            progress: `${imagesCompleted}/${totalScenes}`,
          }),
        });

        // Auto-select
        allSelections.push({
          scene_id: sceneId,
          chosen_option: 1,
          chosen_path: imagePath,
        });

        // 2. Start video METEEN (wacht op slot)
        if (imagePath) {
          await waitForVideoSlot();
          const videoPromise = generateVideo(
            sceneId, imagePath, scene.visual_prompt, scene.duration
          ).catch(err => {
            videosFailed++;
            addLog(projectId, 'warn', 9, 'N8N', `Scene ${sceneId} video mislukt: ${err.message}`);
          }).finally(() => {
            activeVideoPromises.delete(sceneId);
          });
          activeVideoPromises.set(sceneId, videoPromise);
        }

      } catch (err: any) {
        imagesFailed++;
        await addLog(projectId, 'warn', 65, 'N8N',
          `Scene ${sceneId} image mislukt: ${err.message}`);
      }
    }

    // Wacht tot alle lopende video's klaar zijn
    if (activeVideoPromises.size > 0) {
      await addLog(projectId, 'info', 9, 'N8N',
        `Wachten op laatste ${activeVideoPromises.size} video(s)...`);
      await Promise.all([...activeVideoPromises.values()]);
    }

    // Schrijf image-selections.json
    const selectionsPath = path.join(projPath, 'assets', 'image-selections.json');
    await fs.writeFile(selectionsPath, JSON.stringify({
      project: project.name,
      saved_at: new Date().toISOString(),
      auto_selected: true,
      total_selections: allSelections.length,
      selections: allSelections,
    }, null, 2), 'utf-8');

    // Markeer stap 65 als klaar
    const img65Duration = Math.round((Date.now() - (await prisma.step.findUnique({
      where: { projectId_stepNumber: { projectId, stepNumber: 65 } }
    }))!.startedAt!.getTime()) / 1000);

    await updateStepInDb(projectId, 65, {
      status: 'completed',
      duration: img65Duration,
      result: JSON.stringify({ imagesCompleted, imagesFailed, totalScenes, autoSelected: true }),
    });

    // Markeer stap 9 als klaar
    await updateStepInDb(projectId, 9, {
      status: videosCompleted > 0 ? 'completed' : 'failed',
      duration: img65Duration, // Totale streaming tijd
      result: JSON.stringify({ videosCompleted, videosFailed, totalScenes }),
      error: videosFailed > 0 ? `${videosFailed} scene(s) mislukt` : null,
    });

    await addLog(projectId, 'info', 9, 'N8N',
      `Scene streaming klaar! Images: ${imagesCompleted}/${totalScenes}, Videos: ${videosCompleted}/${totalScenes}`);

  // ══ MANUAL MODE: alle images eerst, dan wacht op goedkeuring per scene ══
  } else {
    // Genereer alle 3 images per scene (stap 65)
    for (let i = 0; i < aiScenes.length; i++) {
      if (state.status !== 'running') break;

      const scene = aiScenes[i];
      const sceneId = scene.id;
      const statusPath = path.join(projPath, 'assets', 'image-options', `scene${sceneId}-status.json`);

      const prompts = scene.visual_prompt_variants.slice(0, 3);
      const imagePayload = {
        project: project.name,
        scene_id: sceneId,
        visual_prompts: prompts,
        aspect_ratio: aspectRatio,
        output_dir: imageOptionsDir,
        elevate_api_key: settings.elevateApiKey,
        status_path: statusPath,
      };

      try { await fs.unlink(statusPath); } catch {}

      try {
        const imgResponse = await fetch(n8nImageUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(imagePayload),
        });

        if (!imgResponse.ok) throw new Error(`Image webhook mislukt: ${imgResponse.status}`);

        // Poll (max 3 min)
        const imgStart = Date.now();
        let imageStatus: any = null;
        while (Date.now() - imgStart < 180_000) {
          if (state.status !== 'running') break;
          try {
            const raw = await fs.readFile(statusPath, 'utf-8');
            imageStatus = JSON.parse(raw);
            if (imageStatus.status === 'completed') break;
            if (imageStatus.status === 'failed') throw new Error(imageStatus.error || 'Image mislukt');
          } catch (e: any) {
            if (!e.message?.includes('ENOENT') && !e.message?.includes('Unexpected')) throw e;
          }
          await new Promise(r => setTimeout(r, 5000));
        }

        if (imageStatus?.status === 'completed') {
          imagesCompleted++;
          await addLog(projectId, 'info', 65, 'N8N',
            `Scene ${sceneId} images klaar (${imagesCompleted}/${totalScenes})`);
        } else {
          throw new Error(`Image timeout voor scene ${sceneId}`);
        }

      } catch (err: any) {
        imagesFailed++;
        await addLog(projectId, 'warn', 65, 'N8N', `Scene ${sceneId} images mislukt: ${err.message}`);
      }

      // Update stap 65 metadata
      await updateStepInDb(projectId, 65, {
        metadata: JSON.stringify({
          scenesCompleted: imagesCompleted,
          scenesFailed: imagesFailed,
          totalScenes,
          progress: `${imagesCompleted}/${totalScenes}`,
        }),
      });
    }

    // Schrijf image-options.json (voor de frontend)
    const imageOptionsPath = path.join(projPath, 'assets', 'image-options.json');
    // Dit wordt al geschreven door de N8N workflow per scene, maar we updaten de totalen
    await addLog(projectId, 'info', 65, 'N8N',
      `Alle images klaar! ${imagesCompleted}/${totalScenes} geslaagd`);

    // Stap 65 gaat naar review — wacht op gebruiker
    await updateStepInDb(projectId, 65, {
      status: 'review',
      result: JSON.stringify({ imagesCompleted, imagesFailed, totalScenes, autoSelected: false }),
    });

    // Pipeline pauzeert hier — gebruiker moet images goedkeuren
    // Na goedkeuring via approveStep(65) gaat de pipeline verder
    // Stap 9 wordt dan normaal gedraaid door de orchestrator (via executeStep9)
    state.status = 'review';
    await updateProjectStatus(projectId, 'review');
    await addLog(projectId, 'info', 65, 'App',
      'Images klaar — selecteer per scene een image in de app');
  }

  return { imagesCompleted, imagesFailed, videosCompleted, videosFailed, totalScenes };
}
