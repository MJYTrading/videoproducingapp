/**
 * Pipeline Builder — Shared types & API helpers
 */

export interface StepInput {
  key: string;
  type: string;
  label: string;
  required: boolean;
  source?: string;
}

export interface StepOutput {
  key: string;
  type: string;
  label: string;
  filePath: string;
}

export interface StepDefinitionData {
  id: number;
  name: string;
  slug: string;
  category: string;
  description: string;
  executorFn: string;
  executorLabel: string;
  toolPrimaryId: number | null;
  toolFallbackId: number | null;
  llmModelId: number | null;
  llmModel: any;
  inputSchema: StepInput[];
  outputSchema: StepOutput[];
  defaultConfig: Record<string, any>;
  systemPrompt: string;
  userPromptTpl: string;
  outputFormat: string;
  isReady: boolean;
  notes: string;
}

export interface PipelineNodeData {
  id: number;
  pipelineId: number;
  stepDefinitionId: number;
  stepDefinition: StepDefinitionData;
  positionX: number;
  positionY: number;
  sortOrder: number;
  configOverrides: Record<string, any>;
  systemPromptOverride: string | null;
  userPromptOverride: string | null;
  llmModelOverrideId: number | null;
  llmModelOverride: any;
  isActive: boolean;
  isCheckpoint: boolean;
  checkpointCond: string | null;
  timeout: number;
  maxRetries: number;
  retryDelays: string;
  outgoingConnections: PipelineConnectionData[];
  incomingConnections: PipelineConnectionData[];
}

export interface PipelineConnectionData {
  id: number;
  pipelineId: number;
  sourceNodeId: number;
  sourceOutputKey: string;
  targetNodeId: number;
  targetInputKey: string;
}

export interface PipelineData {
  id: number;
  name: string;
  slug: string;
  description: string;
  isDefault: boolean;
  isActive: boolean;
  nodes: PipelineNodeData[];
  connections: PipelineConnectionData[];
}

export interface ValidationResult {
  valid: boolean;
  errors: { nodeId: number; nodeName: string; type: string; message: string }[];
  warnings: { nodeId: number; nodeName: string; type: string; message: string }[];
}

const API = '/api/admin';

export async function apiJson(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('vp-token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as any || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Fout' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Category kleuren
export const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  setup:    { bg: 'bg-zinc-800',     border: 'border-zinc-600',    text: 'text-zinc-300',    dot: 'bg-zinc-400' },
  research: { bg: 'bg-blue-900/40',  border: 'border-blue-500/40', text: 'text-blue-300',    dot: 'bg-blue-400' },
  script:   { bg: 'bg-purple-900/40',border: 'border-purple-500/40',text: 'text-purple-300', dot: 'bg-purple-400' },
  audio:    { bg: 'bg-amber-900/40', border: 'border-amber-500/40',text: 'text-amber-300',   dot: 'bg-amber-400' },
  visual:   { bg: 'bg-emerald-900/40',border: 'border-emerald-500/40',text: 'text-emerald-300',dot: 'bg-emerald-400' },
  post:     { bg: 'bg-red-900/40',   border: 'border-red-500/40',  text: 'text-red-300',     dot: 'bg-red-400' },
  output:   { bg: 'bg-cyan-900/40',  border: 'border-cyan-500/40', text: 'text-cyan-300',    dot: 'bg-cyan-400' },
  general:  { bg: 'bg-zinc-800',     border: 'border-zinc-600',    text: 'text-zinc-300',    dot: 'bg-zinc-400' },
};
