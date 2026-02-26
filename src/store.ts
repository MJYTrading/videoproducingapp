import { create } from 'zustand';
import { Project, Settings, Step, LogEntry, StepStatus } from './types';
import * as api from './api';

// Polling interval voor project refresh tijdens pipeline
let pollingIntervals: Map<string, NodeJS.Timeout> = new Map();

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
  // Pipeline Engine — echte server calls
  startPipeline: (projectId: string) => void;
  pausePipeline: (projectId: string) => void;
  resumePipeline: (projectId: string) => void;
  retryStep: (projectId: string, stepNumber: number) => void;
  skipStep: (projectId: string, stepNumber: number) => void;
  retryFailed: (projectId: string) => void;
  forceContinue: (projectId: string) => void;
  submitFeedback: (projectId: string, stepNumber: number, feedback: string) => void;
  approveStep: (projectId: string, stepNumber: number) => void;
  selectImage: (projectId: string, sceneId: string, optionNumber: number, chosenPath?: string, clipOption?: string) => void;
  setClipOption: (projectId: string, sceneId: string, clipOption: string) => void;
  confirmImageSelection: (projectId: string) => void;
  setSceneTransition: (projectId: string, sceneId: string, transitionId: string) => void;
  addToast: (message: string, type: 'success' | 'error' | 'info' | 'ai') => void;
  removeToast: (id: string) => void;
  startPolling: (projectId: string) => void;
  stopPolling: (projectId: string) => void;
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
    youtubeTranscriptApiKey: '',
    anthropicApiKey: '',
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

      // Start polling voor actieve projecten
      for (const p of projectsData) {
        if (p.status === 'running' || p.status === 'review') {
          get().startPolling(p.id);
        }
      }
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
    get().stopPolling(id);
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

      // Stop polling als project klaar of mislukt is
      if (project.status === 'completed' || project.status === 'failed' || project.status === 'config' || project.status === 'paused') {
        get().stopPolling(id);
      }
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

  // ── Pipeline Engine — Server-side ──

  startPipeline: async (projectId: string) => {
    try {
      await api.pipelineEngine.start(projectId);
      get().addToast('Pipeline gestart', 'info');
      get().startPolling(projectId);
      // Refresh meteen om de nieuwe status te zien
      setTimeout(() => get().refreshProject(projectId), 500);
    } catch (error: any) {
      console.error('Pipeline start failed:', error);
      get().addToast('Pipeline starten mislukt: ' + error.message, 'error');
    }
  },

  pausePipeline: async (projectId: string) => {
    try {
      await api.pipelineEngine.pause(projectId);
      get().addToast('Pipeline gepauzeerd', 'info');
      get().refreshProject(projectId);
    } catch (error: any) {
      console.error('Pipeline pause failed:', error);
      get().addToast('Pauzeren mislukt: ' + error.message, 'error');
    }
  },

  resumePipeline: async (projectId: string) => {
    try {
      await api.pipelineEngine.resume(projectId);
      get().addToast('Pipeline hervat', 'info');
      get().startPolling(projectId);
      setTimeout(() => get().refreshProject(projectId), 500);
    } catch (error: any) {
      console.error('Pipeline resume failed:', error);
      get().addToast('Hervatten mislukt: ' + error.message, 'error');
    }
  },

  retryStep: async (projectId: string, stepNumber: number) => {
    try {
      await api.pipelineEngine.retry(projectId, stepNumber);
      get().addToast(`Stap ${stepNumber} opnieuw gestart`, 'info');
      get().startPolling(projectId);
      setTimeout(() => get().refreshProject(projectId), 500);
    } catch (error: any) {
      get().addToast('Retry mislukt: ' + error.message, 'error');
    }
  },

  skipStep: async (projectId: string, stepNumber: number) => {
    try {
      await api.pipelineEngine.skip(projectId, stepNumber);
      get().addToast(`Stap ${stepNumber} overgeslagen`, 'info');
      setTimeout(() => get().refreshProject(projectId), 500);
    } catch (error: any) {
      get().addToast('Overslaan mislukt: ' + error.message, 'error');
    }
  },

  retryFailed: async (projectId: string) => {
    const project = get().getProject(projectId);
    if (!project) return;
    // Retry elke gefaalde stap via de server
    const failedSteps = project.steps.filter((s) => s.status === 'failed');
    for (const step of failedSteps) {
      try { await api.pipelineEngine.retry(projectId, step.id); } catch {}
    }
    get().addToast('Mislukte stappen opnieuw proberen', 'info');
    get().startPolling(projectId);
    setTimeout(() => get().refreshProject(projectId), 500);
  },

  forceContinue: async (projectId: string) => {
    const project = get().getProject(projectId);
    if (!project) return;
    const failedSteps = project.steps.filter((s) => s.status === 'failed');
    for (const step of failedSteps) {
      try { await api.pipelineEngine.skip(projectId, step.id); } catch {}
    }
    // Resume de pipeline
    try { await api.pipelineEngine.resume(projectId); } catch {}
    get().addToast('Force Continue: gefaalde stappen overgeslagen', 'info');
    get().startPolling(projectId);
    setTimeout(() => get().refreshProject(projectId), 500);
  },

  submitFeedback: async (projectId: string, stepNumber: number, feedback: string) => {
    try {
      await api.pipelineEngine.feedback(projectId, stepNumber, feedback);
      get().addToast('Feedback verstuurd — stap wordt opnieuw gegenereerd', 'ai');
      get().startPolling(projectId);
      setTimeout(() => get().refreshProject(projectId), 500);
    } catch (error: any) {
      get().addToast('Feedback versturen mislukt: ' + error.message, 'error');
    }
  },

  approveStep: async (projectId: string, stepNumber: number) => {
    try {
      await api.pipelineEngine.approve(projectId, stepNumber);
      get().addToast(`Stap ${stepNumber} goedgekeurd — pipeline gaat verder`, 'success');
      get().startPolling(projectId);
      setTimeout(() => get().refreshProject(projectId), 500);
    } catch (error: any) {
      get().addToast('Goedkeuren mislukt: ' + error.message, 'error');
    }
  },

  selectImage: (projectId, sceneId, optionNumber, chosenPath, clipOption) => {
    const project = get().getProject(projectId);
    if (!project) return;
    const existingSelections = project.selectedImages.filter((s) => s.sceneId !== sceneId);
    const existing = project.selectedImages.find((s) => s.sceneId === sceneId);
    get().updateProject(projectId, {
      selectedImages: [...existingSelections, {
        sceneId,
        chosenOption: optionNumber,
        chosenPath: chosenPath || existing?.chosenPath,
        clipOption: (clipOption || existing?.clipOption || 'natural') as any,
      }],
    });
  },

  setClipOption: (projectId: string, sceneId: string, clipOption: string) => {
    const project = get().getProject(projectId);
    if (!project) return;
    const existing = project.selectedImages.find((s) => s.sceneId === sceneId);
    if (!existing) return;
    const otherSelections = project.selectedImages.filter((s) => s.sceneId !== sceneId);
    get().updateProject(projectId, {
      selectedImages: [...otherSelections, { ...existing, clipOption: clipOption as any }],
    });
  },

  confirmImageSelection: async (projectId: string) => {
    try {
      // Sla selecties op via de bestaande API
      const project = get().getProject(projectId);
      if (project) {
        await api.imageOptions.saveSelections(projectId, project.selectedImages);
      }
      // Keur stap 65 goed via de pipeline engine
      await api.pipelineEngine.approve(projectId, 65);
      get().addToast('Afbeeldingen geselecteerd — video generatie start', 'success');
      get().startPolling(projectId);
      setTimeout(() => get().refreshProject(projectId), 500);
    } catch (error: any) {
      get().addToast('Bevestigen mislukt: ' + error.message, 'error');
    }
  },

  setSceneTransition: (projectId, sceneId, transitionId) => {
    const project = get().getProject(projectId);
    if (!project) return;
    const existingTransitions = project.sceneTransitions.filter((t) => t.sceneId !== sceneId);
    get().updateProject(projectId, { sceneTransitions: [...existingTransitions, { sceneId, transition: transitionId }] });
  },

  // ── Polling ──

  startPolling: (projectId: string) => {
    // Stop bestaande polling eerst
    get().stopPolling(projectId);
    // Poll elke 3 seconden
    const interval = setInterval(() => {
      get().refreshProject(projectId);
    }, 3000);
    pollingIntervals.set(projectId, interval);
  },

  stopPolling: (projectId: string) => {
    const interval = pollingIntervals.get(projectId);
    if (interval) {
      clearInterval(interval);
      pollingIntervals.delete(projectId);
    }
  },

  // ── Toasts ──

  addToast: (message, type) => {
    const id = Math.random().toString(36).substr(2, 9);
    set((state) => ({ toasts: [...state.toasts.slice(-2), { id, message, type }] }));
    setTimeout(() => get().removeToast(id), 5000);
  },

  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));
