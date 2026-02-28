export type ProjectStatus = 'config' | 'running' | 'completed' | 'failed' | 'paused' | 'review' | 'queued';

export type StepStatus = 'waiting' | 'running' | 'completed' | 'failed' | 'skipped' | 'review';

export type Executor = 'App' | 'N8N' | 'Elevate AI' | 'Elevate Opus' | 'Elevate Sonar' | 'Elevate' | 'Assembly AI' | 'Claude Opus' | 'HeyGen' | 'TwelveLabs + N8N' | 'FFMPEG';

export type Language = 'EN' | 'NL';

export type ScriptSource = 'new' | 'existing';

export type VideoType = 'ai' | 'spokesperson_ai' | 'trending' | 'documentary' | 'compilation' | 'spokesperson';

export type VisualStyle = '3D Render' | 'Stickman' | '2D Animatie' | 'History' | 'Realistisch' | 'Custom';

export type ColorGrading = 'Geen' | 'Cinematic Dark' | 'History Warm' | 'Vibrant' | 'Clean Neutral' | 'Cold Blue' | 'Noir';

export type OutputFormat = 'YouTube 1080p' | 'YouTube 4K' | 'Shorts';

export type SubtitleStyle = 'classic' | 'modern' | 'karaoke' | 'minimal' | 'bold';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

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
  detail?: string | null;
  durationMs?: number | null;
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
  subtitleStyle: SubtitleStyle;
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
  videoType: VideoType;
  enabledSteps?: number[];
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
  perplexityApiKey: string;
  twelveLabsApiKey: string;
  nexlevApiKey: string;
}

export interface Channel {
  id: string;
  name: string;
  driveFolderId: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  projectCount?: number;
  youtubeChannelId: string;
  defaultVideoType: VideoType;
  competitors: string;
  maxClipDurationSeconds?: number;
  baseStyleProfile?: string;
  baseResearchTemplate?: string;
  styleReferenceUrls: string;
  styleExtraInstructions: string;
  usedClips: string;
  overlayPresetId?: string;
  sfxEnabled: boolean;
  specialEditsEnabled: boolean;
  // Standaard project instellingen
  defaultScriptLengthMinutes: number;
  defaultVoiceId: string;
  defaultOutputFormat: string;
  defaultAspectRatio: string;
  defaultSubtitles: boolean;
  defaultLanguage: Language;
  defaultVisualStyle: string;
  defaultVisualStyleParent?: string;
  referenceScriptUrls: string;
  // Inclusief projecten (bij getOne)
  projects?: Project[];
}

export interface ConnectionStatus {
  id: string;
  status: 'connected' | 'error' | 'testing' | 'untested';
  lastChecked?: string;
}

export interface Idea {
  id: string;
  title: string;
  description: string;
  videoType: VideoType;
  channelId: string;
  sourceData: string;
  referenceVideos: string;
  status: 'saved' | 'converted';
  projectId?: string;
  createdAt: string;
}

export interface ResearchTemplate {
  id: string;
  name: string;
  videoType: VideoType;
  template: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AssetClip {
  id: string;
  sourceUrl: string;
  videoId: string;
  title: string;
  startTime: string;
  endTime: string;
  localPath: string;
  thumbnailPath?: string;
  tags: string;
  description: string;
  category: string;
  subjects: string;
  mood?: string;
  quality?: number;
  timesUsed: number;
  lastUsedAt?: string;
  createdAt: string;
}

export interface MusicTrack {
  id: string;
  title: string;
  filePath: string;
  duration: number;
  mood: string;
  genre: string;
  bpm?: number;
  energyProfile?: string;
  hasVocals: boolean;
  loopable: boolean;
  tags: string;
  createdAt: string;
}

export interface OverlayFile {
  id: string;
  name: string;
  filePath: string;
  resolution?: string;
  framerate?: number;
  duration?: number;
  category: string;
  tags: string;
  previewUrl?: string;
  createdAt: string;
}

export interface OverlayPreset {
  id: string;
  name: string;
  description?: string;
  layers: string;
  isDefault: boolean;
  createdAt: string;
}

export interface SoundEffect {
  id: string;
  name: string;
  filePath: string;
  duration: number;
  category: string;
  intensity: string;
  tags: string;
  usageGuide?: string;
  createdAt: string;
}

export interface SfxUsageRule {
  id: string;
  name: string;
  description: string;
  sfxCategory: string;
  triggerCondition: string;
  isDefault: boolean;
  createdAt: string;
}

export interface SpecialEdit {
  id: string;
  name: string;
  description: string;
  scriptPath: string;
  parameters: string;
  applicableFor: string;
  usageGuide?: string;
  previewUrl?: string;
  createdAt: string;
}

export const VIDEO_TYPE_LABELS: Record<VideoType, string> = {
  ai: 'AI',
  spokesperson_ai: 'Spokesperson AI',
  trending: 'Trending',
  documentary: 'Documentary',
  compilation: 'Compilatie',
  spokesperson: 'Spokesperson',
};

export const SUBTITLE_STYLE_LABELS: Record<SubtitleStyle, string> = {
  classic: 'Classic — Wit met zwarte outline',
  modern: 'Modern — Animated word highlighting',
  karaoke: 'Karaoke — Woord voor woord oplichten',
  minimal: 'Minimal — Klein, semi-transparant',
  bold: 'Bold — Groot, gecentreerd',
};
