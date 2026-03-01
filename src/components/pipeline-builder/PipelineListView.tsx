/**
 * PipelineListView v4.4
 * 
 * Fixes:
 * 1. User prompt textarea was missing - FIXED (both system + user shown)
 * 2. Variable dropdowns always expanded - FIXED (defaultOpen={true} for all)
 * 3. Textarea cursor becomes drag cursor - FIXED (draggable only on handle)
 * 4. Test output shown in expandable panel per step
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ChevronDown, ChevronRight, Plus, Trash2, GripVertical, Save,
  AlertCircle, RefreshCw, ArrowUp, ArrowDown, Database,
  Zap, Pause, X, Settings2, Hash, FolderOpen, Calendar,
  Play, ToggleLeft, ToggleRight, Copy,
} from 'lucide-react';
import { apiJson, CATEGORY_COLORS, type PipelineData, type PipelineNodeData, type StepInput, type StepOutput } from './types';

interface ConfigField {
  key: string; type: string; label: string; description?: string;
  default?: any; min?: number; max?: number; step?: number;
  options?: { value: string; label: string }[];
  source?: string; required?: boolean; group?: string;
}
interface ConfigSchema { stepType: 'llm' | 'api' | 'app'; fields: ConfigField[]; }

const PROJECT_VARS = [
  { key: 'title', label: 'Video Titel' },
  { key: 'description', label: 'Beschrijving' },
  { key: 'videoType', label: 'Video Type' },
  { key: 'language', label: 'Taal' },
  { key: 'visualStyle', label: 'Visuele Stijl' },
  { key: 'voice', label: 'Stem ID' },
  { key: 'scriptLength', label: 'Script Lengte' },
  { key: 'aspectRatio', label: 'Aspect Ratio' },
  { key: 'output', label: 'Output Format' },
  { key: 'colorGrading', label: 'Color Grading' },
  { key: 'subtitles', label: 'Ondertiteling' },
  { key: 'subtitleStyle', label: 'Subtitle Stijl' },
  { key: 'useClips', label: 'Gebruik Clips' },
  { key: 'referenceVideos', label: 'Referentie Videos' },
  { key: 'referenceClips', label: 'Referentie Clips' },
  { key: 'montageClips', label: 'Montage Clips' },
];

const CHANNEL_VARS = [
  { key: 'name', label: 'Kanaal Naam' },
  { key: 'description', label: 'Beschrijving' },
  { key: 'defaultVideoType', label: 'Video Type' },
  { key: 'defaultLanguage', label: 'Taal' },
  { key: 'defaultVisualStyle', label: 'Visuele Stijl' },
  { key: 'defaultScriptLengthMinutes', label: 'Script Lengte (min)' },
  { key: 'defaultVoiceId', label: 'Stem ID' },
  { key: 'defaultAspectRatio', label: 'Aspect Ratio' },
  { key: 'defaultOutputFormat', label: 'Output Format' },
  { key: 'maxClipDurationSeconds', label: 'Max Clip Duur (sec)' },
  { key: 'baseStyleProfile', label: 'Style Profile' },
  { key: 'baseResearchTemplate', label: 'Research Template' },
  { key: 'styleExtraInstructions', label: 'Style Instructies' },
  { key: 'competitors', label: 'Concurrenten' },
  { key: 'sfxLevel', label: 'SFX Niveau' },
  { key: 'motionGraphicsLevel', label: 'Motion Graphics Niveau' },
];

const DATE_VARS = [
  { key: 'today', label: 'Vandaag (YYYY-MM-DD)' },
  { key: 'now', label: 'Nu (ISO datetime)' },
  { key: 'timestamp', label: 'Unix Timestamp' },
];

interface Props { pipelineId: number; }

export default function PipelineListView({ pipelineId }: Props) {
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [openNodeId, setOpenNodeId] = useState<number | null>(null);
  const [models, setModels] = useState<any[]>([]);
  const [voices, setVoices] = useState<any[]>([]);
  const [styles, setStyles] = useState<any[]>([]);
  const [colorGrades, setColorGrades] = useState<any[]>([]);
  const [showAddStep, setShowAddStep] = useState(false);
  const [stepDefs, setStepDefs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  const loadPipeline = useCallback(async () => {
    try {
      const [p, m] = await Promise.all([apiJson('/pipelines/' + pipelineId), apiJson('/llm-models')]);
      setPipeline(p); setModels(m);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [pipelineId]);

  useEffect(() => { loadPipeline(); }, [loadPipeline]);
  useEffect(() => {
    fetch('/voices.json').then(r => r.json()).then(setVoices).catch(() => {});
    fetch('/styles.json').then(r => r.json()).then(setStyles).catch(() => {});
    fetch('/color-grades.json').then(r => r.json()).then(setColorGrades).catch(() => {});
    apiJson('/step-definitions').then(setStepDefs).catch(() => {});
  }, []);

  const sortedNodes = useMemo(() => {
    if (!pipeline) return [];
    return [...pipeline.nodes].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [pipeline]);

  const upstreamDataMap = useMemo(() => {
    const map: Record<number, { nodeId: number; nodeName: string; category: string; key: string; label: string; type: string; filePath: string }[]> = {};
    for (let i = 0; i < sortedNodes.length; i++) {
      const available: typeof map[0] = [];
      for (let j = 0; j < i; j++) {
        const prev = sortedNodes[j];
        const outputs: StepOutput[] = prev.stepDefinition.outputSchema || [];
        for (const out of outputs) {
          if (!available.find(a => a.key === out.key)) {
            available.push({ nodeId: prev.id, nodeName: prev.stepDefinition.name, category: prev.stepDefinition.category, key: out.key, label: out.label, type: out.type, filePath: out.filePath || '' });
          }
        }
      }
      map[sortedNodes[i].id] = available;
    }
    return map;
  }, [sortedNodes]);

  const moveNode = async (nodeId: number, direction: 'up' | 'down') => {
    const idx = sortedNodes.findIndex(n => n.id === nodeId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sortedNodes.length) return;
    const positions = sortedNodes.map((n, i) => ({ id: n.id, sortOrder: i === idx ? swapIdx : i === swapIdx ? idx : i }));
    try {
      for (const p of positions) await apiJson('/pipelines/' + pipelineId + '/nodes/' + p.id, { method: 'PATCH', body: JSON.stringify({ sortOrder: p.sortOrder }) });
      loadPipeline();
    } catch (err) { console.error(err); }
  };

  // FIX 3: Only the drag handle initiates drag, not the whole card
  const handleDragStart = (e: React.DragEvent, nodeId: number) => {
    setDragId(nodeId);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e: React.DragEvent, nodeId: number) => { e.preventDefault(); setDragOverId(nodeId); };
  const handleDragLeave = () => setDragOverId(null);
  const handleDrop = async (targetNodeId: number) => {
    if (!dragId || dragId === targetNodeId) { setDragId(null); setDragOverId(null); return; }
    const fromIdx = sortedNodes.findIndex(n => n.id === dragId);
    const toIdx = sortedNodes.findIndex(n => n.id === targetNodeId);
    if (fromIdx < 0 || toIdx < 0) { setDragId(null); setDragOverId(null); return; }
    const reordered = [...sortedNodes]; const [moved] = reordered.splice(fromIdx, 1); reordered.splice(toIdx, 0, moved);
    try {
      for (let i = 0; i < reordered.length; i++) { if (reordered[i].sortOrder !== i) await apiJson('/pipelines/' + pipelineId + '/nodes/' + reordered[i].id, { method: 'PATCH', body: JSON.stringify({ sortOrder: i }) }); }
      loadPipeline();
    } catch (err) { console.error(err); }
    setDragId(null); setDragOverId(null);
  };
  const handleDragEnd = () => { setDragId(null); setDragOverId(null); };

  const addStep = async (stepDefId: number) => {
    try {
      await apiJson('/pipelines/' + pipelineId + '/nodes', { method: 'POST', body: JSON.stringify({ stepDefinitionId: stepDefId, positionX: 0, positionY: 0, sortOrder: sortedNodes.length }) });
      setShowAddStep(false); loadPipeline();
    } catch (err: any) { alert(err.message); }
  };

  const removeStep = async (nodeId: number, name: string) => {
    if (!confirm('Stap "' + name + '" verwijderen?')) return;
    try {
      await apiJson('/pipelines/' + pipelineId + '/nodes/' + nodeId, { method: 'DELETE' });
      if (openNodeId === nodeId) setOpenNodeId(null); loadPipeline();
    } catch (err: any) { alert(err.message); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-6 h-6 text-brand-400 animate-spin" /></div>;
  if (!pipeline) return <div className="text-center py-12 text-zinc-500">Pipeline niet gevonden</div>;

  const existingDefIds = sortedNodes.map(n => n.stepDefinitionId);

  return (
    <div className="max-w-5xl mx-auto py-6 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-white">{pipeline.name}</h2>
          <p className="text-xs text-zinc-500">{sortedNodes.length} stappen &middot; {pipeline.connections.length} verbindingen</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAddStep(!showAddStep)} className="btn-primary text-xs !px-3 !py-1.5"><Plus className="w-3.5 h-3.5" /> Stap toevoegen</button>
          <button onClick={loadPipeline} className="btn-secondary text-xs !px-2 !py-1.5"><RefreshCw className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {showAddStep && (
        <div className="glass rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Stap Toevoegen</h3>
            <button onClick={() => setShowAddStep(false)} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-1.5 max-h-[300px] overflow-auto">
            {stepDefs.filter(d => !existingDefIds.includes(d.id)).map(d => {
              const cat = CATEGORY_COLORS[d.category] || CATEGORY_COLORS.general;
              return (
                <button key={d.id} onClick={() => addStep(d.id)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-white/[0.04] transition">
                  <div className={'w-2 h-2 rounded-full ' + (d.isReady ? cat.dot : 'bg-amber-400')} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium text-zinc-200 truncate">{d.name}</div>
                    <div className="text-[9px] text-zinc-500">{d.category} {!d.isReady ? '· skeleton' : ''}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {sortedNodes.map((node, idx) => (
          <StepCard key={node.id} node={node} index={idx} total={sortedNodes.length}
            isOpen={openNodeId === node.id} dragId={dragId}
            onToggle={() => setOpenNodeId(openNodeId === node.id ? null : node.id)}
            onMove={dir => moveNode(node.id, dir)}
            onRemove={() => removeStep(node.id, node.stepDefinition.name)}
            onDragStart={e => handleDragStart(e, node.id)}
            onDragOver={e => handleDragOver(e, node.id)}
            onDragLeave={handleDragLeave}
            onDrop={() => handleDrop(node.id)}
            onDragEnd={handleDragEnd}
            isDragOver={dragOverId === node.id && dragId !== node.id}
            upstreamData={upstreamDataMap[node.id] || []}
            models={models} voices={voices} styles={styles} colorGrades={colorGrades}
            pipelineId={pipelineId} onSave={loadPipeline} saving={saving === node.id} setSaving={setSaving} />
        ))}
      </div>

      {sortedNodes.length === 0 && (
        <div className="text-center py-12 text-zinc-600"><Settings2 className="w-12 h-12 mx-auto mb-3 opacity-20" /><p>Geen stappen. Voeg een stap toe.</p></div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// STEP CARD - FIX 3: draggable ONLY on handle
// ═══════════════════════════════════════════════

interface StepCardProps {
  node: PipelineNodeData; index: number; total: number; isOpen: boolean; dragId: number | null;
  onToggle: () => void; onMove: (dir: 'up' | 'down') => void; onRemove: () => void;
  onDragStart: (e: React.DragEvent) => void; onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void; onDrop: () => void; onDragEnd: () => void; isDragOver: boolean;
  upstreamData: { nodeId: number; nodeName: string; category: string; key: string; label: string; type: string; filePath: string }[];
  models: any[]; voices: any[]; styles: any[]; colorGrades: any[];
  pipelineId: number; onSave: () => void; saving: boolean; setSaving: (id: number | null) => void;
}

function StepCard({ node, index, total, isOpen, dragId, onToggle, onMove, onRemove, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd, isDragOver, upstreamData, models, voices, styles, colorGrades, pipelineId, onSave, saving, setSaving }: StepCardProps) {
  const def = node.stepDefinition;
  const cat = CATEGORY_COLORS[def.category] || CATEGORY_COLORS.general;
  const inputs: StepInput[] = def.inputSchema || [];
  const outputs: StepOutput[] = def.outputSchema || [];
  const systemRef = useRef<HTMLTextAreaElement>(null);
  const userRef = useRef<HTMLTextAreaElement>(null);
  const [activePrompt, setActivePrompt] = useState<'system' | 'user'>('user');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const configSchema: ConfigSchema = useMemo(() => {
    try { const raw = def.configSchema; if (raw && typeof raw === 'string') return JSON.parse(raw); if (raw && typeof raw === 'object') return raw; } catch {}
    return { stepType: 'app', fields: [] };
  }, [def.configSchema]);

  const isLLM = configSchema.stepType === 'llm';

  const [f, setF] = useState({
    isActive: node.isActive, isCheckpoint: node.isCheckpoint,
    timeout: node.timeout, maxRetries: node.maxRetries,
    llmModelOverrideId: node.llmModelOverrideId,
    systemPromptOverride: node.systemPromptOverride || '',
    userPromptOverride: node.userPromptOverride || '',
    configOverrides: node.configOverrides || {},
  });

  useEffect(() => {
    setF({ isActive: node.isActive, isCheckpoint: node.isCheckpoint, timeout: node.timeout, maxRetries: node.maxRetries,
      llmModelOverrideId: node.llmModelOverrideId, systemPromptOverride: node.systemPromptOverride || '',
      userPromptOverride: node.userPromptOverride || '', configOverrides: node.configOverrides || {} });
  }, [node.id, node.isActive, node.configOverrides]);

  const getConfigValue = (key: string, defaultVal: any) => f.configOverrides[key] ?? defaultVal;
  const setConfigValue = (key: string, value: any) => setF(prev => ({ ...prev, configOverrides: { ...prev.configOverrides, [key]: value } }));

  const getSourceOptions = (source: string) => {
    switch (source) {
      case 'voices': return voices.map((v: any) => ({ value: v.voice_id, label: v.name + ' — ' + v.description }));
      case 'styles': return styles.map((s: any) => ({ value: s.id, label: s.name }));
      case 'colorGrades': return colorGrades.map((c: any) => ({ value: c.id, label: c.name }));
      default: return [];
    }
  };

  const insertAtCursor = (varStr: string) => {
    const ref = activePrompt === 'system' ? systemRef : userRef;
    const field = activePrompt === 'system' ? 'systemPromptOverride' : 'userPromptOverride';
    const el = ref.current;
    if (el) {
      const start = el.selectionStart || 0;
      const end = el.selectionEnd || 0;
      const current = f[field];
      const newVal = current.slice(0, start) + varStr + current.slice(end);
      setF(prev => ({ ...prev, [field]: newVal }));
      setTimeout(() => { el.selectionStart = el.selectionEnd = start + varStr.length; el.focus(); }, 10);
    } else {
      setF(prev => ({ ...prev, [field]: prev[field] + ' ' + varStr }));
    }
  };

  const save = async () => {
    setSaving(node.id);
    try {
      await apiJson('/pipelines/' + pipelineId + '/nodes/' + node.id, {
        method: 'PATCH', body: JSON.stringify({
          isActive: f.isActive, isCheckpoint: f.isCheckpoint, timeout: f.timeout, maxRetries: f.maxRetries,
          llmModelOverrideId: f.llmModelOverrideId || null,
          systemPromptOverride: f.systemPromptOverride || null,
          userPromptOverride: f.userPromptOverride || null,
          configOverrides: f.configOverrides,
        }),
      });
      onSave();
    } catch (err: any) { alert(err.message); }
    setSaving(null);
  };

  // FIX 4: Test step with output display
  const testStep = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await apiJson(`/pipelines/${pipelineId}/nodes/${node.id}/test`, { method: 'POST', body: JSON.stringify({}) });
      setTestResult(JSON.stringify(r, null, 2));
    } catch (err: any) { setTestResult('Error: ' + err.message); }
    setTesting(false);
  };

  const toggleReady = async () => {
    try {
      await apiJson(`/step-definitions/${def.id}`, { method: 'PATCH', body: JSON.stringify({ isReady: !def.isReady }) });
      onSave();
    } catch (err: any) { alert(err.message); }
  };

  const groupedFields = useMemo(() => {
    const groups: Record<string, ConfigField[]> = {};
    for (const field of configSchema.fields) { const g = field.group || 'Configuratie'; if (!groups[g]) groups[g] = []; groups[g].push(field); }
    return groups;
  }, [configSchema.fields]);

  return (
    // FIX 3: NOT draggable on the card level — only on the handle
    <div
      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} onDragEnd={onDragEnd}
      className={isDragOver ? 'border-t-2 border-brand-400' : ''}>
      <div className={'rounded-xl border transition-all ' + (dragId === node.id ? 'opacity-40 border-brand-400/50 ' : '') +
        (isOpen ? 'border-brand-500/30 bg-surface-100' : node.isActive ? 'border-white/[0.06] bg-surface-50/60 hover:bg-surface-100/60' : 'border-white/[0.04] bg-surface-50/30 opacity-50')}>
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none" onClick={onToggle}>
          {/* FIX 3: ONLY the grip handle is draggable */}
          <div draggable onDragStart={onDragStart}
            className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 shrink-0"
            onClick={e => e.stopPropagation()}>
            <GripVertical className="w-4 h-4" />
          </div>
          <span className="text-[10px] text-zinc-600 font-mono w-5 text-center shrink-0">{index + 1}</span>
          <div className={'w-2.5 h-2.5 rounded-full shrink-0 ' + (!def.isReady ? 'bg-amber-400' : 'bg-emerald-400')} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-white truncate">{def.name}</span>
              <span className={'text-[8px] px-1.5 py-0.5 rounded-full font-medium ' + cat.bg + ' ' + cat.text}>{def.category}</span>
              {node.isCheckpoint && <Pause className="w-3 h-3 text-amber-400" />}
              {!def.isReady && <span className="text-[8px] text-amber-400">skeleton</span>}
            </div>
            <div className="text-[10px] text-zinc-500 flex items-center gap-2 mt-0.5">
              <span>{configSchema.stepType.toUpperCase()}</span><span>&middot;</span><span>{def.executorLabel}</span>
              {def.llmModel && <><span>&middot;</span><span className="text-purple-400">{def.llmModel.name}</span></>}
              <span>&middot;</span><span>{inputs.filter(i => i.source !== 'project').length} in &rarr; {outputs.length} out</span>
            </div>
          </div>
          <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
            <button onClick={testStep} disabled={testing} className="text-zinc-600 hover:text-brand-400 p-1" title="Test stap">
              {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => onMove('up')} disabled={index === 0} className="text-zinc-600 hover:text-zinc-300 p-1 disabled:opacity-20"><ArrowUp className="w-3.5 h-3.5" /></button>
            <button onClick={() => onMove('down')} disabled={index === total - 1} className="text-zinc-600 hover:text-zinc-300 p-1 disabled:opacity-20"><ArrowDown className="w-3.5 h-3.5" /></button>
            <button onClick={onRemove} className="text-zinc-600 hover:text-red-400 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
          {isOpen ? <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />}
        </div>

        {/* Expanded */}
        {isOpen && (
          <div className="px-4 pb-4 pt-1 border-t border-white/[0.04] space-y-4">
            {/* Controls row */}
            <div className="flex items-center gap-4 flex-wrap">
              <Chk label="Actief" checked={f.isActive} set={v => setF({ ...f, isActive: v })} />
              <Chk label="Checkpoint" checked={f.isCheckpoint} set={v => setF({ ...f, isCheckpoint: v })} />
              <button onClick={toggleReady} className={'flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg transition ' + (def.isReady ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20')}>
                {def.isReady ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                {def.isReady ? 'Ready' : 'Skeleton'}
              </button>
              <div className="flex-1" />
              <MiniInp label="Timeout (ms)" value={String(f.timeout)} set={v => setF({ ...f, timeout: parseInt(v) || 300000 })} w="w-28" />
              <MiniInp label="Retries" value={String(f.maxRetries)} set={v => setF({ ...f, maxRetries: parseInt(v) || 3 })} w="w-20" />
            </div>

            {/* FIX 4: Test result with copy button */}
            {testResult && (
              <div className="bg-surface-200 rounded-xl p-4 max-h-[250px] overflow-auto">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-zinc-500 font-semibold uppercase">Test Resultaat — Stap {index + 1}: {def.name}</span>
                  <div className="flex gap-1">
                    <button onClick={() => navigator.clipboard.writeText(testResult)} className="text-zinc-600 hover:text-zinc-300 p-1" title="Kopieer"><Copy className="w-3 h-3" /></button>
                    <button onClick={() => setTestResult(null)} className="text-zinc-600 hover:text-zinc-300 p-1"><X className="w-3 h-3" /></button>
                  </div>
                </div>
                <pre className="text-[11px] text-zinc-400 font-mono whitespace-pre-wrap leading-relaxed">{testResult}</pre>
              </div>
            )}

            {/* LLM Section */}
            {isLLM && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-zinc-400 mb-1.5 block font-medium">LLM Model</label>
                  <select className="input-base text-sm !py-2.5" value={String(f.llmModelOverrideId || '')}
                    onChange={e => setF({ ...f, llmModelOverrideId: e.target.value ? parseInt(e.target.value) : null })}>
                    <option value="">{def.llmModel ? 'Default: ' + def.llmModel.name : '-- Selecteer --'}</option>
                    {models.map(m => <option key={m.id} value={m.id}>{m.name} ({m.provider}) — {m.modelType}</option>)}
                  </select>
                </div>

                {/* FIX 1: BOTH prompts visible, with tabs to switch active one for variable insertion */}
                <div className="flex gap-4">
                  {/* Left: Both prompts stacked */}
                  <div className="flex-1 min-w-0 space-y-4">
                    {/* System prompt */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold text-zinc-300">System Prompt</label>
                        <button onClick={() => setActivePrompt('system')}
                          className={`text-[9px] px-2 py-0.5 rounded-full transition ${activePrompt === 'system' ? 'bg-brand-600/20 text-brand-300 ring-1 ring-brand-500/30' : 'text-zinc-600 hover:text-zinc-400'}`}>
                          {activePrompt === 'system' ? 'Actief voor variabelen' : 'Klik voor variabelen'}
                        </button>
                      </div>
                      <textarea ref={systemRef}
                        className="input-base font-mono text-[12px] min-h-[200px] w-full !py-4 !px-4 leading-relaxed resize-y"
                        placeholder="System prompt — definieert de rol en regels voor de LLM..."
                        value={f.systemPromptOverride}
                        onChange={e => setF({ ...f, systemPromptOverride: e.target.value })}
                        onFocus={() => setActivePrompt('system')} />
                      {def.systemPrompt && !f.systemPromptOverride && (
                        <p className="text-[11px] text-zinc-600 mt-1">
                          Default beschikbaar ({def.systemPrompt.length} chars) —{' '}
                          <button className="text-brand-400 hover:underline" onClick={() => setF({ ...f, systemPromptOverride: def.systemPrompt || '' })}>laden</button>
                        </p>
                      )}
                    </div>

                    {/* FIX 1: User prompt - was missing, now always visible */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold text-zinc-300">User Prompt</label>
                        <button onClick={() => setActivePrompt('user')}
                          className={`text-[9px] px-2 py-0.5 rounded-full transition ${activePrompt === 'user' ? 'bg-brand-600/20 text-brand-300 ring-1 ring-brand-500/30' : 'text-zinc-600 hover:text-zinc-400'}`}>
                          {activePrompt === 'user' ? 'Actief voor variabelen' : 'Klik voor variabelen'}
                        </button>
                      </div>
                      <textarea ref={userRef}
                        className="input-base font-mono text-[12px] min-h-[250px] w-full !py-4 !px-4 leading-relaxed resize-y"
                        placeholder={"User prompt template — gebruik variabelen uit het panel rechts...\n\nVoorbeeld:\nVIDEO ONDERWERP: {project:title}\nBESCHRIJVING: {project:description}\n\nRESEARCH DATA:\n{upstream:research_json}"}
                        value={f.userPromptOverride}
                        onChange={e => setF({ ...f, userPromptOverride: e.target.value })}
                        onFocus={() => setActivePrompt('user')} />
                    </div>
                  </div>

                  {/* Right: Variables panel - FIX 2: ALL groups always expanded */}
                  <div className="w-[260px] shrink-0 bg-surface-200/50 rounded-xl border border-white/[0.04] overflow-hidden">
                    <div className="px-3 py-2.5 border-b border-white/[0.06] bg-surface-200/50">
                      <p className="text-[10px] text-zinc-400 font-medium">Klik om in te voegen op cursor positie</p>
                      <p className="text-[9px] text-zinc-600 mt-0.5">Actief: <span className="text-brand-300 font-medium">{activePrompt === 'system' ? 'System Prompt' : 'User Prompt'}</span></p>
                    </div>
                    <div className="p-3 max-h-[520px] overflow-auto space-y-3">
                      {/* Upstream data - FIX 2: always open */}
                      {upstreamData.length > 0 && (
                        <VarGroup icon={<Database className="w-3 h-3" />} title="Pipeline Data" color="text-brand-400">
                          {(() => {
                            const byNode: Record<number, typeof upstreamData> = {};
                            for (const d of upstreamData) { if (!byNode[d.nodeId]) byNode[d.nodeId] = []; byNode[d.nodeId].push(d); }
                            return Object.entries(byNode).map(([nid, items]) => (
                              <div key={nid} className="space-y-0.5">
                                <span className="text-[8px] text-zinc-500 font-semibold uppercase">{items[0].nodeName}</span>
                                {items.map(d => (
                                  <VarBtn key={d.key} label={d.label} varStr={'{upstream:' + d.key + '}'} onClick={insertAtCursor}
                                    className="bg-brand-600/10 text-brand-300 hover:bg-brand-600/25" />
                                ))}
                              </div>
                            ));
                          })()}
                        </VarGroup>
                      )}

                      {/* Project data - FIX 2: always open */}
                      <VarGroup icon={<FolderOpen className="w-3 h-3" />} title="Project Data" color="text-emerald-400">
                        {PROJECT_VARS.map(v => (
                          <VarBtn key={v.key} label={v.label} varStr={'{project:' + v.key + '}'} onClick={insertAtCursor}
                            className="bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/25" />
                        ))}
                      </VarGroup>

                      {/* Channel data - FIX 2: always open */}
                      <VarGroup icon={<Hash className="w-3 h-3" />} title="Kanaal Data" color="text-blue-400">
                        {CHANNEL_VARS.map(v => (
                          <VarBtn key={v.key} label={v.label} varStr={'{channel:' + v.key + '}'} onClick={insertAtCursor}
                            className="bg-blue-500/10 text-blue-300 hover:bg-blue-500/25" />
                        ))}
                      </VarGroup>

                      {/* Date/time - FIX 2: always open */}
                      <VarGroup icon={<Calendar className="w-3 h-3" />} title="Datum & Tijd" color="text-amber-400">
                        {DATE_VARS.map(v => (
                          <VarBtn key={v.key} label={v.label} varStr={'{date:' + v.key + '}'} onClick={insertAtCursor}
                            className="bg-amber-500/10 text-amber-300 hover:bg-amber-500/25" />
                        ))}
                      </VarGroup>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Config fields */}
            {Object.entries(groupedFields).map(([groupName, fields]) => (
              <div key={groupName}>
                <h4 className="text-xs text-zinc-400 font-semibold uppercase tracking-wider mb-3">{groupName}</h4>
                <div className="grid grid-cols-2 gap-4">
                  {fields.map(field => (
                    <DynField key={field.key} field={field} value={getConfigValue(field.key, field.default)}
                      onChange={v => setConfigValue(field.key, v)}
                      sourceOptions={field.source ? getSourceOptions(field.source) : undefined} />
                  ))}
                </div>
              </div>
            ))}

            {/* Footer */}
            <div className="flex items-center gap-4 text-[10px] text-zinc-500 pt-3 border-t border-white/[0.04]">
              <span>Slug: <span className="font-mono text-zinc-400">{def.slug}</span></span>
              <span>Executor: <span className="font-mono text-zinc-400">{def.executorFn}()</span></span>
              <span>Outputs: {outputs.map(o => o.key).join(', ')}</span>
            </div>

            <div className="flex justify-end pt-1">
              <button onClick={save} disabled={saving} className="btn-primary text-sm !px-8 !py-2.5 font-medium">
                <Save className="w-4 h-4" />{saving ? 'Opslaan...' : 'Opslaan'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// HELPERS — FIX 2: VarGroup is always open (no toggle)
// ═══════════════════════════════════════════════

function VarGroup({ icon, title, color, children }: { icon: React.ReactNode; title: string; color: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={color}>{icon}</span>
        <span className={'text-[9px] font-bold uppercase tracking-wider ' + color}>{title}</span>
      </div>
      <div className="space-y-0.5 ml-0.5">{children}</div>
    </div>
  );
}

function VarBtn({ label, varStr, onClick, className }: { label: string; varStr: string; onClick: (v: string) => void; className: string }) {
  return (
    <button onClick={() => onClick(varStr)} title={'Klik om in te voegen: ' + varStr}
      className={'w-full text-left text-[10px] px-2.5 py-1.5 rounded-lg font-mono transition truncate ' + className}>
      <span className="opacity-60">{varStr.split(':')[0]}:</span>{varStr.split(':').slice(1).join(':').replace('}', '')}<span className="opacity-60">{'}'}</span>
    </button>
  );
}

function DynField({ field, value, onChange, sourceOptions }: {
  field: ConfigField; value: any; onChange: (v: any) => void; sourceOptions?: { value: string; label: string }[];
}) {
  const opts = sourceOptions || field.options || [];
  switch (field.type) {
    case 'text':
      return <div><label className="text-xs text-zinc-400 mb-1.5 block font-medium">{field.label}</label><input className="input-base text-sm !py-2.5" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={field.description} /></div>;
    case 'number':
      return <div><label className="text-xs text-zinc-400 mb-1.5 block font-medium">{field.label}</label><input className="input-base text-sm !py-2.5" type="number" value={value ?? field.default ?? ''} onChange={e => onChange(parseFloat(e.target.value))} min={field.min} max={field.max} step={field.step} /></div>;
    case 'range':
      return <div><div className="flex justify-between mb-1.5"><label className="text-xs text-zinc-400 font-medium">{field.label}</label><span className="text-xs text-brand-300 font-mono">{value ?? field.default}</span></div><input type="range" className="w-full accent-brand-500 h-2" value={value ?? field.default ?? 0} onChange={e => onChange(parseFloat(e.target.value))} min={field.min ?? 0} max={field.max ?? 1} step={field.step ?? 0.1} /></div>;
    case 'select':
      return <div><label className="text-xs text-zinc-400 mb-1.5 block font-medium">{field.label}</label><select className="input-base text-sm !py-2.5" value={value ?? field.default ?? ''} onChange={e => onChange(e.target.value)}><option value="">-- Kies --</option>{opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>;
    case 'toggle':
      return <div className="flex items-center justify-between col-span-2 py-2"><div><span className="text-sm text-zinc-300">{field.label}</span>{field.description && <p className="text-[10px] text-zinc-600 mt-0.5">{field.description}</p>}</div><button onClick={() => onChange(!(value ?? field.default))} className={'w-11 h-6 rounded-full relative transition ' + ((value ?? field.default) ? 'bg-brand-500' : 'bg-zinc-700')}><div className={'w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ' + ((value ?? field.default) ? 'translate-x-5' : 'translate-x-0.5')} /></button></div>;
    case 'textarea':
      return <div className="col-span-2"><label className="text-xs text-zinc-400 mb-1.5 block font-medium">{field.label}</label><textarea className="input-base font-mono text-xs min-h-[120px] !py-3 !px-4 resize-y" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={field.description} /></div>;
    case 'json':
      return <div className="col-span-2"><label className="text-xs text-zinc-400 mb-1.5 block font-medium">{field.label}</label><textarea className="input-base font-mono text-xs min-h-[100px] !py-3 !px-4 resize-y" value={typeof value === 'string' ? value : JSON.stringify(value || field.default, null, 2)} onChange={e => onChange(e.target.value)} /></div>;
    default: return null;
  }
}

function Chk({ label, checked, set }: { label: string; checked: boolean; set: (v: boolean) => void }) {
  return <label className="flex items-center gap-2.5 cursor-pointer group"><input type="checkbox" checked={checked} onChange={e => set(e.target.checked)} className="rounded w-4 h-4 border-zinc-600 bg-surface-200 text-brand-500 focus:ring-brand-500/30" /><span className="text-sm text-zinc-300 group-hover:text-white transition">{label}</span></label>;
}

function MiniInp({ label, value, set, w }: { label: string; value: string; set: (v: string) => void; w: string }) {
  return <div><label className="text-[10px] text-zinc-500 block mb-1">{label}</label><input className={'input-base text-sm !py-2 ' + w} value={value} onChange={e => set(e.target.value)} /></div>;
}
