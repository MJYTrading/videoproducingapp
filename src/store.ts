import { create } from 'zustand';
import { Project, Settings, Step, LogEntry, StepStatus } from './types';
import * as api from './api';

let pipelineIntervals: Map<string, NodeJS.Timeout> = new Map();

interface Store {
  projects: Project[];
  settings: Settings;
  toasts: Array<{ id: string; message: string; type: 'success' | 'error' | 'info' | 'ai' }>;
  loading: boolean;
  initialized: boolean;
  initialize: () => Promise<void>;
  addProject: (project: Omit<Project, 'id' | 'status' | 'steps' | 'logs' | 'createdAt'>) => Promise<Project>;
  getProject: (id: string) => Project | undefined;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  duplicateProject: (id: string) => Promise<Project | undefined>;
  refreshProject: (id: string) => Promise<void>;
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
  updateStepStatus: (projectId: string, stepId: number, status: StepStatus, extras?: Partial<Step>) => Promise<void>;
  addLogEntry: (projectId: string, level: 'info' | 'warn' | 'error', step: number, source: string, message: string) => Promise<void>;
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
    elevateApiKey: '', n8nBaseUrl: 'https://n8n.srv1275252.hstgr.cloud',
    assemblyAiApiKey: '', discordWebhookUrl: '', discordUserId: '1154154714699665418',
    openClawUrl: 'http://127.0.0.1:18789', openClawHooksToken: '',
    defaultVoice: 'Brody — Crime Narrator', defaultVisualStyle: 'ai-3d-render',
    defaultLanguage: 'EN', defaultScriptLength: 5000, defaultSubtitles: true,
    defaultColorGrading: 'cinematic_dark',
  },
  toasts: [],
  loading: false,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return;
    set({ loading: true });
    try {
      const [projectsData, settingsData] = await Promise.all([
        api.projects.getAll(), api.settings.get(),
      ]);
      set({ projects: projectsData, settings: settingsData, initialized: true, loading: false });
    } catch (error) {
      console.error('Failed to initialize store:', error);
      set({ loading: false, initialized: true });
    }
  },

  addProject: async (projectData) => {
    try {
      const newProject = await api.projects.create(projectData);
      set((state) => ({ projects: [newProject, ...state.projects] }));
      return newProject;
    } catch (error) {
      console.error('Failed to create project:', error);
      get().addToast('Project aanmaken mislukt', 'error');
      throw error;
    }
  },

  getProject: (id) => get().projects.find((p) => p.id === id),

  updateProject: async (id, updates) => {
    set((state) => ({ projects: state.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)) }));
    try { await api.projects.update(id, updates); } catch (error) { console.error('Failed to update project:', error); get().refreshProject(id); }
  },

  deleteProject: async (id) => {
    const interval = pipelineIntervals.get(id);
    if (interval) { clearInterval(interval); pipelineIntervals.delete(id); }
    set((state) => ({ projects: state.projects.filter((p) => p.id !== id) }));
    try { await api.projects.delete(id); } catch (error) { console.error('Failed to delete project:', error); }
  },

  duplicateProject: async (id) => {
    try {
      const newProject = await api.projects.duplicate(id);
      set((state) => ({ projects: [newProject, ...state.projects] }));
      return newProject;
    } catch (error) { console.error('Failed to duplicate project:', error); get().addToast('Dupliceren mislukt', 'error'); return undefined; }
  },

  refreshProject: async (id) => {
    try {
      const project = await api.projects.get(id);
      set((state) => ({ projects: state.projects.map((p) => (p.id === id ? project : p)) }));
    } catch (error) { console.error('Failed to refresh project:', error); }
  },

  updateSettings: async (updates) => {
    set((state) => ({ settings: { ...state.settings, ...updates } }));
    try { await api.settings.update(updates); } catch (error) { console.error('Failed to update settings:', error); }
  },

  updateStepStatus: async (projectId, stepId, status, extras = {}) => {
    set((state) => ({
      projects: state.projects.map((p) => p.id === projectId
        ? { ...p, steps: p.steps.map((s) => s.id === stepId ? { ...s, status, ...extras } : s) } : p),
    }));
    try { await api.steps.update(projectId, stepId, { status, ...extras }); } catch (error) { console.error('Failed to update step:', error); }
  },

  addLogEntry: async (projectId, level, step, source, message) => {
    const logEntry: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(), level, step, source: source as any, message,
    };
    set((state) => ({ projects: state.projects.map((p) => p.id === projectId ? { ...p, logs: [logEntry, ...p.logs] } : p) }));
    try { await api.logs.add(projectId, level, step, source, message); } catch (error) { console.error('Failed to add log:', error); }
  },

  startPipeline: (projectId) => {
    const project = get().getProject(projectId);
    if (!project) return;
    get().updateProject(projectId, { status: 'running', startedAt: new Date().toISOString() });
    get().addLogEntry(projectId, 'info', 0, 'App', 'Pipeline gestart');
    get().addToast('Pipeline gestart', 'info');
    const stepsToSkip: number[] = [];
    if (project.scriptSource === 'existing') stepsToSkip.push(1, 2, 3);
    if (!project.stockImages) stepsToSkip.push(7);
    if (!project.useClips && (!project.montageClips || project.montageClips.length === 0)) stepsToSkip.push(8);
    if (!project.colorGrading || project.colorGrading === 'Geen') stepsToSkip.push(11);
    if (!project.subtitles) stepsToSkip.push(12);
    stepsToSkip.forEach((stepId) => {
      get().updateStepStatus(projectId, stepId, 'skipped');
      get().addLogEntry(projectId, 'info', stepId, 'App', 'Stap ' + stepId + ' overgeslagen');
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
        if (interval) { clearInterval(interval); pipelineIntervals.delete(projectId); }
        return;
      }
      const firstAttempt = nextStep.firstAttemptAt || new Date().toISOString();
      get().updateStepStatus(projectId, nextStep.id, 'running', { startedAt: new Date().toISOString(), firstAttemptAt: firstAttempt });
      get().addLogEntry(projectId, 'info', nextStep.id, nextStep.executor, nextStep.name + ' gestart...');
      const duration = Math.floor(Math.random() * 3000) + 2000;
      setTimeout(() => {
        const stillRunning = get().getProject(projectId);
        if (!stillRunning || stillRunning.status !== 'running') return;
        const durationSec = Math.floor(duration / 1000);
        const currentProject2 = get().getProject(projectId);
        const isCheckpoint = currentProject2?.checkpoints?.includes(nextStep.id);
        if (isCheckpoint) {
          get().updateStepStatus(projectId, nextStep.id, 'review', { duration: durationSec, result: { status: 'success', data: 'Mock result data' } });
          get().updateProject(projectId, { status: 'review' });
          get().addLogEntry(projectId, 'info', nextStep.id, nextStep.executor, nextStep.name + ' voltooid — wacht op review');
          get().addToast('Stap ' + nextStep.id + ': ' + nextStep.name + ' klaar — wacht op je review', 'info');
          const interval = pipelineIntervals.get(projectId);
          if (interval) { clearInterval(interval); pipelineIntervals.delete(projectId); }
        } else {
          get().updateStepStatus(projectId, nextStep.id, 'completed', { duration: durationSec, result: { status: 'success', data: 'Mock result data' } });
          get().addLogEntry(projectId, 'info', nextStep.id, nextStep.executor, nextStep.name + ' voltooid (' + durationSec + 's)');
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
    if (interval) { clearInterval(interval); pipelineIntervals.delete(projectId); }
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
    get().updateStepStatus(projectId, stepId, 'waiting', { error: undefined, duration: undefined, retryCount: currentRetryCount });
    get().addLogEntry(projectId, 'info', stepId, 'App', 'Stap ' + stepId + ' handmatig opnieuw gestart (poging ' + (currentRetryCount + 1) + ')');
    get().updateProject(projectId, { status: 'running' });
    get().startPipeline(projectId);
  },

  skipStep: (projectId, stepId) => {
    get().updateStepStatus(projectId, stepId, 'skipped');
    get().addLogEntry(projectId, 'info', stepId, 'App', 'Stap ' + stepId + ' overgeslagen door gebruiker');
    get().updateProject(projectId, { status: 'running' });
    get().startPipeline(projectId);
  },

  retryFailed: (projectId) => {
    const project = get().getProject(projectId);
    if (!project) return;
    project.steps.forEach((step) => {
      if (step.status === 'failed') get().updateStepStatus(projectId, step.id, 'waiting', { error: undefined, duration: undefined, retryCount: step.retryCount || 0 });
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
        get().addLogEntry(projectId, 'info', step.id, 'App', 'Stap ' + step.id + ' overgeslagen via Force Continue');
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
    const feedbackEntry = { stepNumber, feedback, attempt: (step.attemptNumber || 1) + 1, timestamp: new Date().toISOString() };
    get().updateProject(projectId, { feedbackHistory: [...project.feedbackHistory, feedbackEntry] });
    get().updateStepStatus(projectId, stepNumber, 'waiting', { result: { feedback }, attemptNumber: feedbackEntry.attempt });
    get().updateProject(projectId, { status: 'running' });
    get().addLogEntry(projectId, 'info', stepNumber, 'App', 'Feedback gegeven, stap wordt opnieuw gegenereerd');
    get().addToast('Feedback verstuurd — stap wordt opnieuw gegenereerd', 'ai');
    setTimeout(() => get().startPipeline(projectId), 100);
  },

  approveStep: (projectId, stepNumber) => {
    get().updateStepStatus(projectId, stepNumber, 'completed');
    get().updateProject(projectId, { status: 'running' });
    get().addLogEntry(projectId, 'info', stepNumber, 'App', 'Stap ' + stepNumber + ' goedgekeurd');
    get().addToast('Stap ' + stepNumber + ' goedgekeurd — pipeline gaat verder', 'success');
    setTimeout(() => get().startPipeline(projectId), 100);
  },

  selectImage: (projectId, sceneId, optionNumber) => {
    const project = get().getProject(projectId);
    if (!project) return;
    const existingSelections = project.selectedImages.filter((s) => s.sceneId !== sceneId);
    get().updateProject(projectId, { selectedImages: [...existingSelections, { sceneId, chosenOption: optionNumber }] });
  },

  confirmImageSelection: (projectId) => {
    get().updateStepStatus(projectId, 9, 'completed');
    get().updateProject(projectId, { status: 'running' });
    get().addLogEntry(projectId, 'info', 9, 'App', 'Afbeeldingen geselecteerd, video generatie start');
    get().addToast('Afbeeldingen geselecteerd — video generatie start', 'success');
    setTimeout(() => get().startPipeline(projectId), 100);
  },

  setSceneTransition: (projectId, sceneId, transitionId) => {
    const project = get().getProject(projectId);
    if (!project) return;
    const existingTransitions = project.sceneTransitions.filter((t) => t.sceneId !== sceneId);
    get().updateProject(projectId, { sceneTransitions: [...existingTransitions, { sceneId, transition: transitionId }] });
  },

  addToast: (message, type) => {
    const id = Math.random().toString(36).substr(2, 9);
    set((state) => ({ toasts: [...state.toasts.slice(-2), { id, message, type }] }));
    setTimeout(() => get().removeToast(id), 5000);
  },

  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));
