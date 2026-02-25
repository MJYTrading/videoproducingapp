import { create } from 'zustand';
import { Project, Settings, Step, LogEntry, StepStatus } from './types';

const defaultSteps: Step[] = [
  { id: 0, name: 'Config validatie', executor: 'App', status: 'waiting' },
  { id: 1, name: 'Transcripts ophalen', executor: 'App', status: 'waiting' },
  { id: 2, name: 'Style profile maken', executor: 'Elevate AI', status: 'waiting' },
  { id: 3, name: 'Script schrijven', executor: 'Elevate AI', status: 'waiting' },
  { id: 4, name: 'Voiceover genereren', executor: 'N8N', status: 'waiting' },
  { id: 5, name: 'Timestamps genereren', executor: 'N8N', status: 'waiting' },
  { id: 6, name: 'Scene prompts genereren', executor: 'Elevate AI', status: 'waiting' },
  { id: 7, name: 'Assets zoeken', executor: 'N8N', status: 'waiting' },
  { id: 8, name: 'YouTube clips ophalen', executor: 'N8N', status: 'waiting' },
  { id: 9, name: 'Video scenes genereren', executor: 'N8N', status: 'waiting' },
  { id: 10, name: 'Video editing', executor: 'N8N', status: 'waiting' },
  { id: 11, name: 'Color grading', executor: 'N8N', status: 'waiting' },
  { id: 12, name: 'Subtitles', executor: 'App', status: 'waiting' },
  { id: 13, name: 'Final export', executor: 'N8N', status: 'waiting' },
];

let pipelineIntervals: Map<string, NodeJS.Timeout> = new Map();

interface Store {
  projects: Project[];
  settings: Settings;
  toasts: Array<{ id: string; message: string; type: 'success' | 'error' | 'info' | 'ai' }>;
  addProject: (project: Omit<Project, 'id' | 'status' | 'steps' | 'logs' | 'createdAt'>) => Project;
  getProject: (id: string) => Project | undefined;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  duplicateProject: (id: string) => Project | undefined;
  updateSettings: (updates: Partial<Settings>) => void;
  updateStepStatus: (projectId: string, stepId: number, status: StepStatus, extras?: Partial<Step>) => void;
  addLogEntry: (projectId: string, level: 'info' | 'warn' | 'error', step: number, source: string, message: string) => void;
  startPipeline: (projectId: string) => void;
  pausePipeline: (projectId: string) => void;
  resumePipeline: (projectId: string) => void;
  retryStep: (projectId: string, stepId: number) => void;
  skipStep: (projectId: string, stepId: number) => void;
  retryFailed: (projectId: string) => void;
  forceContinue: (projectId: string) => void;
  submitFeedback: (projectId: string, stepNumber: number, feedback: string) => void;
  approveStep: (projectId: string, stepNumber: number) => void;
  selectImage: (projectId: string, sceneId: string, optionNumber: number) => void;
  confirmImageSelection: (projectId: string) => void;
  setSceneTransition: (projectId: string, sceneId: string, transitionId: string) => void;
  addToast: (message: string, type: 'success' | 'error' | 'info' | 'ai') => void;
  removeToast: (id: string) => void;
}

export const useStore = create<Store>((set, get) => ({
  projects: [],
  settings: {
    elevateApiKey: '',
    n8nBaseUrl: 'https://n8n.srv1275252.hstgr.cloud',
    assemblyAiApiKey: '',
    discordWebhookUrl: '',
    discordUserId: '1154154714699665418',
    openClawUrl: 'http://127.0.0.1:18789',
    openClawHooksToken: '',
    defaultVoice: 'Brody — Crime Narrator',
    defaultVisualStyle: 'ai-3d-render',
    defaultLanguage: 'EN',
    defaultScriptLength: 5000,
    defaultSubtitles: true,
    defaultColorGrading: 'cinematic_dark',
  },
  toasts: [],

  addProject: (project) => {
    const newProject: Project = {
      ...project,
      id: Math.random().toString(36).substr(2, 9),
      status: 'config',
      steps: JSON.parse(JSON.stringify(defaultSteps)),
      logs: [],
      createdAt: new Date().toISOString(),
    };
    set((state) => ({ projects: [...state.projects, newProject] }));
    return newProject;
  },

  getProject: (id) => {
    return get().projects.find((p) => p.id === id);
  },

  updateProject: (id, updates) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    }));
  },

  deleteProject: (id) => {
    const interval = pipelineIntervals.get(id);
    if (interval) {
      clearInterval(interval);
      pipelineIntervals.delete(id);
    }
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
    }));
  },

  duplicateProject: (id) => {
    const project = get().getProject(id);
    if (!project) return undefined;

    const newProject: Project = {
      ...project,
      id: Math.random().toString(36).substr(2, 9),
      name: `${project.name}-copy`,
      status: 'config',
      steps: JSON.parse(JSON.stringify(defaultSteps)),
      logs: [],
      startedAt: undefined,
      completedAt: undefined,
      createdAt: new Date().toISOString(),
    };

    set((state) => ({ projects: [...state.projects, newProject] }));
    return newProject;
  },

  updateSettings: (updates) => {
    set((state) => ({
      settings: { ...state.settings, ...updates },
    }));
  },

  updateStepStatus: (projectId, stepId, status, extras = {}) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              steps: p.steps.map((s) =>
                s.id === stepId ? { ...s, status, ...extras } : s
              ),
            }
          : p
      ),
    }));
  },

  addLogEntry: (projectId, level, step, source, message) => {
    const logEntry: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      level,
      step,
      source: source as any,
      message,
    };

    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId ? { ...p, logs: [...p.logs, logEntry] } : p
      ),
    }));
  },

  startPipeline: (projectId) => {
    const project = get().getProject(projectId);
    if (!project) return;

    get().updateProject(projectId, { status: 'running', startedAt: new Date().toISOString() });
    get().addLogEntry(projectId, 'info', 0, 'App', 'Pipeline gestart');
    get().addToast('Pipeline gestart', 'info');

    const stepsToSkip: number[] = [];
    if (project.scriptSource === 'existing') {
      stepsToSkip.push(1, 2, 3);
    }
    if (!project.stockImages) {
      stepsToSkip.push(7);
    }
    if (!project.useClips && (!project.montageClips || project.montageClips.length === 0)) {
      stepsToSkip.push(8);
    }
    if (!project.colorGrading || project.colorGrading === 'Geen') {
      stepsToSkip.push(11);
    }
    if (!project.subtitles) {
      stepsToSkip.push(12);
    }

    stepsToSkip.forEach((stepId) => {
      get().updateStepStatus(projectId, stepId, 'skipped');
      get().addLogEntry(projectId, 'info', stepId, 'App', `Stap ${stepId} overgeslagen`);
    });

    const runNextStep = () => {
      const currentProject = get().getProject(projectId);
      if (!currentProject || currentProject.status !== 'running') return;

      const nextStep = currentProject.steps.find((s) => s.status === 'waiting');
      if (!nextStep) {
        get().updateProject(projectId, { status: 'completed', completedAt: new Date().toISOString() });
        get().addLogEntry(projectId, 'info', 13, 'App', 'Pipeline voltooid!');
        get().addToast('Video klaar!', 'success');
        const interval = pipelineIntervals.get(projectId);
        if (interval) {
          clearInterval(interval);
          pipelineIntervals.delete(projectId);
        }
        return;
      }

      const currentRetryCount = nextStep.retryCount || 0;
      const firstAttempt = nextStep.firstAttemptAt || new Date().toISOString();

      get().updateStepStatus(projectId, nextStep.id, 'running', {
        startedAt: new Date().toISOString(),
        firstAttemptAt: firstAttempt,
      });
      get().addLogEntry(projectId, 'info', nextStep.id, nextStep.executor, `${nextStep.name} gestart...`);

      const isStep9 = nextStep.id === 9;
      const duration = isStep9 ? 4000 : Math.floor(Math.random() * 3000) + 2000;

      setTimeout(() => {
        const stillRunning = get().getProject(projectId);
        if (!stillRunning || stillRunning.status !== 'running') return;

        if (isStep9 && currentRetryCount < 3) {
          const newRetryCount = currentRetryCount + 1;
          const durationSec = Math.floor(duration / 1000);
          get().updateStepStatus(projectId, nextStep.id, 'failed', {
            error: 'VEO 3 API returned empty video for scene 14. HTTP 500: Internal server error after 45s timeout.',
            retryCount: newRetryCount,
            duration: durationSec,
          });
          get().addLogEntry(projectId, 'error', nextStep.id, nextStep.executor, `${nextStep.name} mislukt (poging ${newRetryCount}/3)`);

          if (newRetryCount < 3) {
            get().addToast(`Stap ${nextStep.id} mislukt, automatisch retry...`, 'error');
            setTimeout(() => {
              get().updateStepStatus(projectId, nextStep.id, 'waiting', { retryCount: newRetryCount });
              get().addLogEntry(projectId, 'info', nextStep.id, 'App', `↻ Automatische retry ${newRetryCount + 1}/3`);
            }, 2000);
          } else {
            get().updateProject(projectId, { status: 'failed' });
            get().addToast(`❌ Stap ${nextStep.id} mislukt na 3 pogingen`, 'error');
            const interval = pipelineIntervals.get(projectId);
            if (interval) {
              clearInterval(interval);
              pipelineIntervals.delete(projectId);
            }
          }
        } else if (isStep9 && currentRetryCount >= 3) {
          const durationSec = Math.floor(duration / 1000);
          get().updateStepStatus(projectId, nextStep.id, 'failed', {
            error: 'VEO 3 API returned empty video for scene 14. HTTP 500: Internal server error after 45s timeout.',
            retryCount: 3,
            duration: durationSec,
          });
          get().updateProject(projectId, { status: 'failed' });
          get().addToast(`❌ Stap ${nextStep.id} mislukt na 3 pogingen`, 'error');
          const interval = pipelineIntervals.get(projectId);
          if (interval) {
            clearInterval(interval);
            pipelineIntervals.delete(projectId);
          }
        } else {
          const durationSec = Math.floor(duration / 1000);
          const currentProject = get().getProject(projectId);
          const isCheckpoint = currentProject?.checkpoints?.includes(nextStep.id);

          let metadata: any = {};
          if (nextStep.id === 3) {
            const wordCount = Math.floor(Math.random() * 5000) + 3000;
            metadata = { wordCount, estimatedDuration: Math.round(wordCount / 150) };
          } else if (nextStep.id === 4) {
            const voiceDuration = Math.floor(Math.random() * 600) + 300;
            metadata = { estimatedDuration: voiceDuration, fileSize: Math.floor(voiceDuration * 0.3) };
          } else if (nextStep.id === 9) {
            metadata = { sceneCount: Math.floor(Math.random() * 15) + 15 };
          }

          if (isCheckpoint) {
            get().updateStepStatus(projectId, nextStep.id, 'review', {
              duration: durationSec,
              result: { status: 'success', data: 'Mock result data' },
              metadata,
            });
            get().updateProject(projectId, { status: 'review' });
            get().addLogEntry(projectId, 'info', nextStep.id, nextStep.executor, `${nextStep.name} voltooid — wacht op review`);
            get().addToast(`👁️ Stap ${nextStep.id}: ${nextStep.name} klaar — wacht op je review`, 'info');
            get().addToast(`📨 Discord melding verstuurd`, 'info');

            const interval = pipelineIntervals.get(projectId);
            if (interval) {
              clearInterval(interval);
              pipelineIntervals.delete(projectId);
            }
          } else {
            get().updateStepStatus(projectId, nextStep.id, 'completed', {
              duration: durationSec,
              result: { status: 'success', data: 'Mock result data' },
              metadata,
            });
            get().addLogEntry(projectId, 'info', nextStep.id, nextStep.executor, `${nextStep.name} voltooid (${durationSec}s)`);

            if (nextStep.id === 4) {
              get().addToast(`✅ Voiceover klaar (${durationSec}s)`, 'success');
            }
          }
        }
      }, duration);
    };

    const interval = setInterval(runNextStep, 2000);
    pipelineIntervals.set(projectId, interval);
    runNextStep();
  },

  pausePipeline: (projectId) => {
    get().updateProject(projectId, { status: 'paused' });
    get().addLogEntry(projectId, 'info', 0, 'App', 'Pipeline gepauzeerd');
    const interval = pipelineIntervals.get(projectId);
    if (interval) {
      clearInterval(interval);
      pipelineIntervals.delete(projectId);
    }
  },

  resumePipeline: (projectId) => {
    get().updateProject(projectId, { status: 'running' });
    get().addLogEntry(projectId, 'info', 0, 'App', 'Pipeline hervat');
    get().startPipeline(projectId);
  },

  retryStep: (projectId, stepId) => {
    const project = get().getProject(projectId);
    if (!project) return;

    const step = project.steps.find((s) => s.id === stepId);
    const currentRetryCount = step?.retryCount || 0;

    get().updateStepStatus(projectId, stepId, 'waiting', {
      error: undefined,
      duration: undefined,
      retryCount: currentRetryCount,
    });
    get().addLogEntry(projectId, 'info', stepId, 'App', `↻ Stap ${stepId} handmatig opnieuw gestart (poging ${currentRetryCount + 1})`);
    get().updateProject(projectId, { status: 'running' });
    get().startPipeline(projectId);
  },

  skipStep: (projectId, stepId) => {
    get().updateStepStatus(projectId, stepId, 'skipped');
    get().addLogEntry(projectId, 'info', stepId, 'App', `Stap ${stepId} overgeslagen door gebruiker`);
    get().updateProject(projectId, { status: 'running' });
    get().startPipeline(projectId);
  },

  retryFailed: (projectId) => {
    const project = get().getProject(projectId);
    if (!project) return;

    project.steps.forEach((step) => {
      if (step.status === 'failed') {
        get().updateStepStatus(projectId, step.id, 'waiting', {
          error: undefined,
          duration: undefined,
          retryCount: step.retryCount || 0,
        });
      }
    });

    get().addLogEntry(projectId, 'info', 0, 'App', 'Mislukte stappen opnieuw proberen');
    get().updateProject(projectId, { status: 'running' });
    get().startPipeline(projectId);
  },

  forceContinue: (projectId) => {
    const project = get().getProject(projectId);
    if (!project) return;

    project.steps.forEach((step) => {
      if (step.status === 'failed') {
        get().updateStepStatus(projectId, step.id, 'skipped');
        get().addLogEntry(projectId, 'info', step.id, 'App', `Stap ${step.id} overgeslagen via Force Continue`);
      }
    });

    get().updateProject(projectId, { status: 'running' });
    get().addLogEntry(projectId, 'info', 0, 'App', 'Force Continue: gefaalde stappen overgeslagen');
    get().startPipeline(projectId);
  },

  submitFeedback: (projectId, stepNumber, feedback) => {
    const project = get().getProject(projectId);
    if (!project) return;

    const step = project.steps.find((s) => s.id === stepNumber);
    if (!step) return;

    const feedbackEntry = {
      stepNumber,
      feedback,
      attempt: (step.attemptNumber || 1) + 1,
      timestamp: new Date().toISOString(),
    };

    get().updateProject(projectId, {
      feedbackHistory: [...project.feedbackHistory, feedbackEntry],
    });

    get().updateStepStatus(projectId, stepNumber, 'waiting', {
      result: { feedback },
      attemptNumber: feedbackEntry.attempt,
    });

    get().updateProject(projectId, { status: 'running' });
    get().addLogEntry(projectId, 'info', stepNumber, 'App', `Feedback gegeven, stap wordt opnieuw gegenereerd`);
    get().addToast('🤖 Feedback verstuurd — stap wordt opnieuw gegenereerd', 'ai');

    setTimeout(() => {
      get().startPipeline(projectId);
    }, 100);
  },

  approveStep: (projectId, stepNumber) => {
    const project = get().getProject(projectId);
    if (!project) return;

    get().updateStepStatus(projectId, stepNumber, 'completed');
    get().updateProject(projectId, { status: 'running' });
    get().addLogEntry(projectId, 'info', stepNumber, 'App', `Stap ${stepNumber} goedgekeurd`);
    get().addToast(`✅ Stap ${stepNumber} goedgekeurd — pipeline gaat verder`, 'success');

    setTimeout(() => {
      get().startPipeline(projectId);
    }, 100);
  },

  selectImage: (projectId, sceneId, optionNumber) => {
    const project = get().getProject(projectId);
    if (!project) return;

    const existingSelections = project.selectedImages.filter((s) => s.sceneId !== sceneId);
    const newSelections = [...existingSelections, { sceneId, chosenOption: optionNumber }];

    get().updateProject(projectId, { selectedImages: newSelections });
  },

  confirmImageSelection: (projectId) => {
    const project = get().getProject(projectId);
    if (!project) return;

    get().updateStepStatus(projectId, 9, 'completed');
    get().updateProject(projectId, { status: 'running' });
    get().addLogEntry(projectId, 'info', 9, 'App', `Afbeeldingen geselecteerd, video generatie start`);
    get().addToast('✅ Afbeeldingen geselecteerd — video generatie start', 'success');

    setTimeout(() => {
      get().startPipeline(projectId);
    }, 100);
  },

  setSceneTransition: (projectId, sceneId, transitionId) => {
    const project = get().getProject(projectId);
    if (!project) return;

    const existingTransitions = project.sceneTransitions.filter((t) => t.sceneId !== sceneId);
    const newTransitions = [...existingTransitions, { sceneId, transition: transitionId }];

    get().updateProject(projectId, { sceneTransitions: newTransitions });
  },

  addToast: (message, type) => {
    const id = Math.random().toString(36).substr(2, 9);
    set((state) => ({
      toasts: [...state.toasts.slice(-2), { id, message, type }],
    }));
    setTimeout(() => {
      get().removeToast(id);
    }, 5000);
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));
