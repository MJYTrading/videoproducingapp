export type ProjectStatus = 'config' | 'running' | 'completed' | 'failed' | 'paused' | 'review' | 'queued';

export type StepStatus = 'waiting' | 'running' | 'completed' | 'failed' | 'skipped' | 'review';

export type Executor = 'App' | 'N8N' | 'Elevate AI' | 'OpenClaw';

export type Language = 'EN' | 'NL';

export type ScriptSource = 'new' | 'existing';

export type VisualStyle = '3D Render' | 'Stickman' | '2D Animatie' | 'History' | 'Realistisch' | 'Custom';

export type ColorGrading = 'Geen' | 'Cinematic Dark' | 'History Warm' | 'Vibrant' | 'Clean Neutral' | 'Cold Blue' | 'Noir';

export type OutputFormat = 'YouTube 1080p' | 'YouTube 4K' | 'Shorts';

export type LogLevel = 'info' | 'warn' | 'error';

export interface MontageClip {
  id: string;
  url: string;
  startTime: string;
  endTime: string;
}

export interface ImageSelection {
  sceneId: string;
  chosenOption: number;
  chosenPath?: string;
  clipOption?: 'zoom_in' | 'zoom_out' | 'rotate_left' | 'rotate_right' | 'static' | 'natural';
}

export interface SceneTransition {
  sceneId: string;
  transition: string;
}

export interface FeedbackEntry {
  stepNumber: number;
  feedback: string;
  attempt: number;
  timestamp: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  step: number;
  source: Executor;
  message: string;
}

export interface AIResponse {
  problem: string;
  action: string;
  solution: string;
}

export interface Step {
  id: number;
  name: string;
  executor: Executor;
  status: StepStatus;
  duration?: number;
  error?: string;
  retryCount?: number;
  startedAt?: string;
  firstAttemptAt?: string;
  result?: any;
  aiResponse?: AIResponse;
  attemptNumber?: number;
  metadata?: {
    wordCount?: number;
    estimatedDuration?: number;
    fileSize?: number;
    sceneCount?: number;
  };
}

export interface Project {
  id: string;
  name: string;
  title: string;
  description?: string;
  language: Language;
  scriptSource: ScriptSource;
  referenceVideos?: string[];
  scriptLength?: number;
  scriptUrl?: string;
  voice: string;
  backgroundMusic: boolean;
  visualStyle: string;
  visualStyleParent: string | null;
  customVisualStyle?: string;
  imageSelectionMode: 'auto' | 'manual';
  imagesPerScene: 1 | 2 | 3;
  selectedImages: ImageSelection[];
  transitionMode: 'none' | 'uniform' | 'per-scene';
  uniformTransition: string | null;
  sceneTransitions: SceneTransition[];
  useClips: boolean;
  referenceClips: string[];
  montageClips: MontageClip[];
  stockImages: boolean;
  checkpoints: number[];
  feedbackHistory: FeedbackEntry[];
  colorGrading: ColorGrading;
  subtitles: boolean;
  output: OutputFormat;
  status: ProjectStatus;
  steps: Step[];
  logs: LogEntry[];
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  aspectRatio?: string;
  priority?: number;
  queuePosition?: number;
  channelId?: string;
  driveUrl?: string;
}

export interface Settings {
  elevateApiKey: string;
  n8nBaseUrl: string;
  assemblyAiApiKey: string;
  discordWebhookUrl: string;
  discordUserId: string;
  openClawUrl: string;
  openClawHooksToken: string;
  defaultVoice: string;
  defaultVisualStyle: string;
  defaultLanguage: Language;
  defaultScriptLength: number;
  defaultSubtitles: boolean;
  defaultColorGrading: string;
  youtubeTranscriptApiKey: string;
  anthropicApiKey: string;
  genaiProApiKey: string;
  genaiProEnabled: boolean;
  genaiProImagesEnabled: boolean;
  videoDownloadApiKey: string;
}

export interface ConnectionStatus {
  id: string;
  status: 'connected' | 'error' | 'testing' | 'untested';
  lastChecked?: string;
}
