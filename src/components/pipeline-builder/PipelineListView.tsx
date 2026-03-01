/**
 * PipelineListView v4.2 — Verticale stappen-lijst
 * 
 * Nieuw in v4.2:
 * - Drag & drop reordering (HTML5 native)
 * - Kanaal data variabelen in prompts ({channel:name}, {channel:style}, etc.)
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ChevronDown, ChevronRight, Plus, Trash2, GripVertical, Save,
  AlertCircle, RefreshCw, ArrowUp, ArrowDown, Database,
  Zap, Pause, X, Settings2, Hash,
} from 'lucide-react';
import { apiJson, CATEGORY_COLORS, type PipelineData, type PipelineNodeData, type StepInput, type StepOutput } from './types';

interface ConfigField {
  key: string; type: string; label: string; description?: string;
  default?: any; min?: number; max?: number; step?: number;
  options?: { value: string; label: string }[];
  source?: string; required?: boolean; group?: string;
}
interface ConfigSchema { stepType: 'llm' | 'api' | 'app'; fields: ConfigField[]; }

// Channel data keys available for prompt insertion
const CHANNEL_VARS = [
  { key: 'name', label: 'Kanaal Naam' },
  { key: 'description', label: 'Beschrijving' },
  { key: 'defaultVideoType', label: 'Video Type' },
  { key: 'defaultLanguage', label: 'Taal' },
  { key: 'defaultVisualStyle', label: 'Visuele Stijl' },
  { key: 'defaultScriptLengthMinutes', label: 'Script Lengte (min)' },
  { key: 'baseStyleProfile', label: 'Style Profile' },
  { key: 'baseResearchTemplate', label: 'Research Template' },
  { key: 'styleExtraInstructions', label: 'Style Instructies' },
  { key: 'defaultVoiceId', label: 'Stem ID' },
  { key: 'defaultAspectRatio', label: 'Aspect Ratio' },
  { key: 'defaultOutputFormat', label: 'Output Format' },
  { key: 'competitors', label: 'Concurrenten' },
];

interface Props {
  pipelineId: number;
}

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

  // Drag & drop state
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  const loadPipeline = useCallback(async () => {
    try {
      const [p, m] = await Promise.all([
        apiJson('/pipelines/' + pipelineId),
        apiJson('/llm-models'),
      ]);
      setPipeline(p);
      setModels(m);
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

  // Sort nodes by sortOrder
  const sortedNodes = useMemo(() => {
    if (!pipeline) return [];
    return [...pipeline.nodes].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [pipeline]);

  // Compute upstream data for each node
  const upstreamDataMap = useMemo(() => {
    const map: Record<number, { nodeId: number; nodeName: string; category: string; key: string; label: string; type: string; filePath: string }[]> = {};
    for (let i = 0; i < sortedNodes.length; i++) {
      const available: typeof map[0] = [];
      for (let j = 0; j < i; j++) {
        const prev = sortedNodes[j];
        const outputs: StepOutput[] = prev.stepDefinition.outputSchema || [];
        for (const out of outputs) {
          if (!available.find(a => a.key === out.key)) {
            available.push({
              nodeId: prev.id, nodeName: prev.stepDefinition.name,
              category: prev.stepDefinition.category, key: out.key,
              label: out.label, type: out.type, filePath: out.filePath || '',
            });
          }
        }
      }
      map[sortedNodes[i].id] = available;
    }
    return map;
  }, [sortedNodes]);

  // Move node up/down (fallback for non-drag)
  const moveNode = async (nodeId: number, direction: 'up' | 'down') => {
    const idx = sortedNodes.findIndex(n => n.id === nodeId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sortedNodes.length) return;
    const positions = sortedNodes.map((n, i) => {
      let order = i;
      if (i === idx) order = swapIdx;
      if (i === swapIdx) order = idx;
      return { id: n.id, sortOrder: order };
    });
    try {
      for (const p of positions) {
        await apiJson('/pipelines/' + pipelineId + '/nodes/' + p.id, {
          method: 'PATCH', body: JSON.stringify({ sortOrder: p.sortOrder }),
        });
      }
      loadPipeline();
    } catch (err) { console.error(err); }
  };

  // Drag & drop handlers
  const handleDragStart = (nodeId: number) => setDragId(nodeId);
  const handleDragOver = (e: React.DragEvent, nodeId: number) => { e.preventDefault(); setDragOverId(nodeId); };
  const handleDragLeave = () => setDragOverId(null);
  const handleDrop = async (targetNodeId: number) => {
    if (!dragId || dragId === targetNodeId) { setDragId(null); setDragOverId(null); return; }
    const fromIdx = sortedNodes.findIndex(n => n.id === dragId);
    const toIdx = sortedNodes.findIndex(n => n.id === targetNodeId);
    if (fromIdx < 0 || toIdx < 0) { setDragId(null); setDragOverId(null); return; }

    // Reorder: remove from fromIdx, insert at toIdx
    const reordered = [...sortedNodes];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    // Update all sortOrders
    try {
      for (let i = 0; i < reordered.length; i++) {
        if (reordered[i].sortOrder !== i) {
          await apiJson('/pipelines/' + pipelineId + '/nodes/' + reordered[i].id, {
            method: 'PATCH', body: JSON.stringify({ sortOrder: i }),
          });
        }
      }
      loadPipeline();
    } catch (err) { console.error(err); }
    setDragId(null);
    setDragOverId(null);
  };
  const handleDragEnd = () => { setDragId(null); setDragOverId(null); };

  // Add step
  const addStep = async (stepDefId: number) => {
    try {
      await apiJson('/pipelines/' + pipelineId + '/nodes', {
        method: 'POST',
        body: JSON.stringify({ stepDefinitionId: stepDefId, positionX: 0, positionY: 0, sortOrder: sortedNodes.length }),
      });
      setShowAddStep(false);
      loadPipeline();
    } catch (err: any) { alert(err.message); }
  };

  // Remove step
  const removeStep = async (nodeId: number, name: string) => {
    if (!confirm('Stap "' + name + '" verwijderen?')) return;
    try {
      await apiJson('/pipelines/' + pipelineId + '/nodes/' + nodeId, { method: 'DELETE' });
      if (openNodeId === nodeId) setOpenNodeId(null);
      loadPipeline();
    } catch (err: any) { alert(err.message); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-6 h-6 text-brand-400 animate-spin" /></div>;
  if (!pipeline) return <div className="text-center py-12 text-zinc-500">Pipeline niet gevonden</div>;

  const existingDefIds = sortedNodes.map(n => n.stepDefinitionId);

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-white">{pipeline.name}</h2>
          <p className="text-xs text-zinc-500">{sortedNodes.length} stappen &middot; {pipeline.connections.length} verbindingen</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAddStep(!showAddStep)} className="btn-primary text-xs !px-3 !py-1.5">
            <Plus className="w-3.5 h-3.5" /> Stap toevoegen
          </button>
          <button onClick={loadPipeline} className="btn-secondary text-xs !px-2 !py-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Add step dropdown */}
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
                <button key={d.id} onClick={() => addStep(d.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-white/[0.04] transition">
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

      {/* Step list with drag & drop */}
      <div className="space-y-1.5">
        {sortedNodes.map((node, idx) => (
          <div
            key={node.id}
            draggable
            onDragStart={() => handleDragStart(node.id)}
            onDragOver={(e) => handleDragOver(e, node.id)}
            onDragLeave={handleDragLeave}
            onDrop={() => handleDrop(node.id)}
            onDragEnd={handleDragEnd}
            className={dragOverId === node.id && dragId !== node.id ? 'border-t-2 border-brand-400' : ''}
          >
            <StepCard
              node={node}
              index={idx}
              total={sortedNodes.length}
              isOpen={openNodeId === node.id}
              isDragging={dragId === node.id}
              onToggle={() => setOpenNodeId(openNodeId === node.id ? null : node.id)}
              onMove={dir => moveNode(node.id, dir)}
              onRemove={() => removeStep(node.id, node.stepDefinition.name)}
              upstreamData={upstreamDataMap[node.id] || []}
              models={models}
              voices={voices}
              styles={styles}
              colorGrades={colorGrades}
              pipelineId={pipelineId}
              onSave={loadPipeline}
              saving={saving === node.id}
              setSaving={setSaving}
            />
          </div>
        ))}
      </div>

      {sortedNodes.length === 0 && (
        <div className="text-center py-12 text-zinc-600">
          <Settings2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p>Geen stappen. Voeg een stap toe om te beginnen.</p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// STEP CARD — Accordion kaart per stap
// ═══════════════════════════════════════════════

interface StepCardProps {
  node: PipelineNodeData;
  index: number;
  total: number;
  isOpen: boolean;
  isDragging: boolean;
  onToggle: () => void;
  onMove: (dir: 'up' | 'down') => void;
  onRemove: () => void;
  upstreamData: { nodeId: number; nodeName: string; category: string; key: string; label: string; type: string; filePath: string }[];
  models: any[];
  voices: any[];
  styles: any[];
  colorGrades: any[];
  pipelineId: number;
  onSave: () => void;
  saving: boolean;
  setSaving: (id: number | null) => void;
}

function StepCard({ node, index, total, isOpen, isDragging, onToggle, onMove, onRemove, upstreamData, models, voices, styles, colorGrades, pipelineId, onSave, saving, setSaving }: StepCardProps) {
  const def = node.stepDefinition;
  const cat = CATEGORY_COLORS[def.category] || CATEGORY_COLORS.general;
  const inputs: StepInput[] = def.inputSchema || [];
  const outputs: StepOutput[] = def.outputSchema || [];

  const configSchema: ConfigSchema = useMemo(() => {
    try {
      const raw = def.configSchema;
      if (raw && typeof raw === 'string') return JSON.parse(raw);
      if (raw && typeof raw === 'object') return raw;
    } catch {}
    return { stepType: 'app', fields: [] };
  }, [def.configSchema]);

  const isLLM = configSchema.stepType === 'llm';

  const [f, setF] = useState({
    isActive: node.isActive,
    isCheckpoint: node.isCheckpoint,
    timeout: node.timeout,
    maxRetries: node.maxRetries,
    llmModelOverrideId: node.llmModelOverrideId,
    systemPromptOverride: node.systemPromptOverride || '',
    userPromptOverride: node.userPromptOverride || '',
    configOverrides: node.configOverrides || {},
  });

  useEffect(() => {
    setF({
      isActive: node.isActive, isCheckpoint: node.isCheckpoint,
      timeout: node.timeout, maxRetries: node.maxRetries,
      llmModelOverrideId: node.llmModelOverrideId,
      systemPromptOverride: node.systemPromptOverride || '',
      userPromptOverride: node.userPromptOverride || '',
      configOverrides: node.configOverrides || {},
    });
  }, [node.id, node.isActive, node.configOverrides]);

  const getConfigValue = (key: string, defaultVal: any) => f.configOverrides[key] ?? defaultVal;
  const setConfigValue = (key: string, value: any) => setF(prev => ({ ...prev, configOverrides: { ...prev.configOverrides, [key]: value } }));

  const getSourceOptions = (source: string) => {
    switch (source) {
      case 'voices': return voices.map((v: any) => ({ value: v.voice_id, label: v.name + ' \u2014 ' + v.description }));
      case 'styles': return styles.map((s: any) => ({ value: s.id, label: s.name }));
      case 'colorGrades': return colorGrades.map((c: any) => ({ value: c.id, label: c.name }));
      default: return [];
    }
  };

  const save = async () => {
    setSaving(node.id);
    try {
      await apiJson('/pipelines/' + pipelineId + '/nodes/' + node.id, {
        method: 'PATCH',
        body: JSON.stringify({
          isActive: f.isActive, isCheckpoint: f.isCheckpoint,
          timeout: f.timeout, maxRetries: f.maxRetries,
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

  const insertVar = (varStr: string) => {
    setF(prev => ({ ...prev, userPromptOverride: prev.userPromptOverride + ' ' + varStr }));
  };

  const groupedFields = useMemo(() => {
    const groups: Record<string, ConfigField[]> = {};
    for (const field of configSchema.fields) {
      const g = field.group || 'Configuratie';
      if (!groups[g]) groups[g] = [];
      groups[g].push(field);
    }
    return groups;
  }, [configSchema.fields]);

  return (
    <div className={'rounded-xl border transition-all ' +
      (isDragging ? 'opacity-40 border-brand-400/50 ' : '') +
      (isOpen ? 'border-brand-500/30 bg-surface-100' : node.isActive ? 'border-white/[0.06] bg-surface-50/60 hover:bg-surface-100/60' : 'border-white/[0.04] bg-surface-50/30 opacity-50')}>
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none" onClick={onToggle}>
        {/* Drag handle */}
        <div className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 shrink-0" onClick={e => e.stopPropagation()}>
          <GripVertical className="w-4 h-4" />
        </div>

        {/* Step number */}
        <span className="text-[10px] text-zinc-600 font-mono w-5 text-center shrink-0">{index + 1}</span>

        {/* Status dot */}
        <div className={'w-2.5 h-2.5 rounded-full shrink-0 ' + (!def.isReady ? 'bg-amber-400' : 'bg-emerald-400')} />

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-white truncate">{def.name}</span>
            <span className={'text-[8px] px-1.5 py-0.5 rounded-full font-medium ' + cat.bg + ' ' + cat.text}>{def.category}</span>
            {node.isCheckpoint && <Pause className="w-3 h-3 text-amber-400" />}
            {!def.isReady && <span className="text-[8px] text-amber-400">skeleton</span>}
          </div>
          <div className="text-[10px] text-zinc-500 flex items-center gap-2 mt-0.5">
            <span>{configSchema.stepType.toUpperCase()}</span>
            <span>&middot;</span>
            <span>{def.executorLabel}</span>
            {def.llmModel && <><span>&middot;</span><span className="text-purple-400">{def.llmModel.name}</span></>}
            <span>&middot;</span>
            <span>{inputs.filter(i => i.source !== 'project').length} in &rarr; {outputs.length} out</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={() => onMove('up')} disabled={index === 0} className="text-zinc-600 hover:text-zinc-300 p-1 disabled:opacity-20"><ArrowUp className="w-3.5 h-3.5" /></button>
          <button onClick={() => onMove('down')} disabled={index === total - 1} className="text-zinc-600 hover:text-zinc-300 p-1 disabled:opacity-20"><ArrowDown className="w-3.5 h-3.5" /></button>
          <button onClick={onRemove} className="text-zinc-600 hover:text-red-400 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>

        {/* Chevron */}
        {isOpen ? <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />}
      </div>

      {/* Expanded content */}
      {isOpen && (
        <div className="px-4 pb-4 pt-1 border-t border-white/[0.04] space-y-4">
          {/* Execution */}
          <div className="flex items-center gap-4">
            <Chk label="Actief" checked={f.isActive} set={v => setF({ ...f, isActive: v })} />
            <Chk label="Checkpoint" checked={f.isCheckpoint} set={v => setF({ ...f, isCheckpoint: v })} />
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <MiniInp label="Timeout" value={String(f.timeout)} set={v => setF({ ...f, timeout: parseInt(v) || 300000 })} w="w-20" />
              <MiniInp label="Retries" value={String(f.maxRetries)} set={v => setF({ ...f, maxRetries: parseInt(v) || 3 })} w="w-14" />
            </div>
          </div>

          {/* LLM: Model + Prompts */}
          {isLLM && (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-zinc-500 mb-0.5 block">LLM Model</label>
                <select className="input-base text-xs" value={String(f.llmModelOverrideId || '')}
                  onChange={e => setF({ ...f, llmModelOverrideId: e.target.value ? parseInt(e.target.value) : null })}>
                  <option value="">{def.llmModel ? 'Default: ' + def.llmModel.name : '-- Selecteer --'}</option>
                  {models.map(m => <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 mb-0.5 block">System Prompt</label>
                <textarea className="input-base font-mono text-[10px] min-h-[80px]"
                  placeholder="System prompt..." value={f.systemPromptOverride}
                  onChange={e => setF({ ...f, systemPromptOverride: e.target.value })} />
                {def.systemPrompt && !f.systemPromptOverride && (
                  <p className="text-[9px] text-zinc-600 mt-0.5">Default: {def.systemPrompt.slice(0, 100)}...</p>
                )}
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 mb-0.5 block">User Prompt Template</label>
                <textarea className="input-base font-mono text-[10px] min-h-[80px]"
                  placeholder="Prompt template... Klik hieronder op variabelen om in te voegen."
                  value={f.userPromptOverride}
                  onChange={e => setF({ ...f, userPromptOverride: e.target.value })} />
              </div>

              {/* Upstream data */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Database className="w-3 h-3 text-zinc-500" />
                  <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Beschikbare Data ({upstreamData.length})</span>
                </div>
                <p className="text-[9px] text-zinc-600 mb-2">Klik om in te voegen in de user prompt.</p>
                <div className="bg-surface-200/30 rounded-lg p-2.5 max-h-[200px] overflow-auto space-y-2">
                  {(() => {
                    const byNode: Record<number, typeof upstreamData> = {};
                    for (const d of upstreamData) {
                      if (!byNode[d.nodeId]) byNode[d.nodeId] = [];
                      byNode[d.nodeId].push(d);
                    }
                    return Object.entries(byNode).map(([nid, items]) => {
                      const c = CATEGORY_COLORS[items[0].category] || CATEGORY_COLORS.general;
                      return (
                        <div key={nid}>
                          <span className={'text-[9px] font-semibold ' + c.text}>{items[0].nodeName}</span>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {items.map(d => (
                              <button key={d.key} onClick={() => insertVar('{upstream:' + d.key + '}')}
                                className="text-[8px] px-1.5 py-0.5 rounded bg-surface-300 text-brand-300 font-mono hover:bg-brand-600/20 transition">
                                {'{upstream:' + d.key + '}'}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    });
                  })()}
                  {upstreamData.length === 0 && <p className="text-[9px] text-zinc-600">Eerste stap — geen upstream data.</p>}
                </div>
              </div>

              {/* Channel data variables */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Hash className="w-3 h-3 text-blue-400" />
                  <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">Kanaal Data</span>
                </div>
                <p className="text-[9px] text-zinc-600 mb-2">Wordt automatisch ingevuld met kanaalinstellingen van het project.</p>
                <div className="bg-blue-500/5 rounded-lg p-2.5 border border-blue-500/10">
                  <div className="flex flex-wrap gap-1">
                    {CHANNEL_VARS.map(cv => (
                      <button key={cv.key} onClick={() => insertVar('{channel:' + cv.key + '}')}
                        className="text-[8px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 font-mono hover:bg-blue-500/20 transition"
                        title={cv.label}>
                        {'{channel:' + cv.key + '}'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Dynamic config fields */}
          {Object.entries(groupedFields).map(([groupName, fields]) => (
            <div key={groupName}>
              <h4 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">{groupName}</h4>
              <div className="grid grid-cols-2 gap-2">
                {fields.map(field => (
                  <DynField key={field.key} field={field}
                    value={getConfigValue(field.key, field.default)}
                    onChange={v => setConfigValue(field.key, v)}
                    sourceOptions={field.source ? getSourceOptions(field.source) : undefined} />
                ))}
              </div>
            </div>
          ))}

          {/* Data flow info */}
          <div className="flex items-center gap-4 text-[9px] text-zinc-500 pt-2 border-t border-white/[0.04]">
            <span>Slug: <span className="font-mono text-zinc-400">{def.slug}</span></span>
            <span>Executor: <span className="font-mono text-zinc-400">{def.executorFn}()</span></span>
            <span>Outputs: {outputs.map(o => o.key).join(', ')}</span>
          </div>

          {/* Save */}
          <div className="flex justify-end">
            <button onClick={save} disabled={saving} className="btn-primary text-xs !px-4 !py-2">
              <Save className="w-3.5 h-3.5" />{saving ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Dynamic Field ──

function DynField({ field, value, onChange, sourceOptions }: {
  field: ConfigField; value: any; onChange: (v: any) => void; sourceOptions?: { value: string; label: string }[];
}) {
  const opts = sourceOptions || field.options || [];
  switch (field.type) {
    case 'text':
      return <div><label className="text-[10px] text-zinc-500 mb-0.5 block">{field.label}</label><input className="input-base text-xs" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={field.description} /></div>;
    case 'number':
      return <div><label className="text-[10px] text-zinc-500 mb-0.5 block">{field.label}</label><input className="input-base text-xs" type="number" value={value ?? field.default ?? ''} onChange={e => onChange(parseFloat(e.target.value))} min={field.min} max={field.max} step={field.step} /></div>;
    case 'range':
      return <div><div className="flex justify-between mb-0.5"><label className="text-[10px] text-zinc-500">{field.label}</label><span className="text-[10px] text-brand-300 font-mono">{value ?? field.default}</span></div><input type="range" className="w-full accent-brand-500 h-1.5" value={value ?? field.default ?? 0} onChange={e => onChange(parseFloat(e.target.value))} min={field.min ?? 0} max={field.max ?? 1} step={field.step ?? 0.1} /></div>;
    case 'select':
      return <div><label className="text-[10px] text-zinc-500 mb-0.5 block">{field.label}</label><select className="input-base text-xs" value={value ?? field.default ?? ''} onChange={e => onChange(e.target.value)}><option value="">-- Kies --</option>{opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>;
    case 'toggle':
      return <div className="flex items-center justify-between col-span-2 py-1"><div><span className="text-[11px] text-zinc-300">{field.label}</span>{field.description && <p className="text-[9px] text-zinc-600">{field.description}</p>}</div><button onClick={() => onChange(!(value ?? field.default))} className={'w-8 h-4 rounded-full relative transition ' + ((value ?? field.default) ? 'bg-brand-500' : 'bg-zinc-700')}><div className={'w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ' + ((value ?? field.default) ? 'translate-x-4.5' : 'translate-x-0.5')} /></button></div>;
    case 'textarea':
      return <div className="col-span-2"><label className="text-[10px] text-zinc-500 mb-0.5 block">{field.label}</label><textarea className="input-base font-mono text-[10px] min-h-[50px]" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={field.description} /></div>;
    case 'json':
      return <div className="col-span-2"><label className="text-[10px] text-zinc-500 mb-0.5 block">{field.label}</label><textarea className="input-base font-mono text-[10px] min-h-[40px]" value={typeof value === 'string' ? value : JSON.stringify(value || field.default, null, 2)} onChange={e => onChange(e.target.value)} /></div>;
    default: return null;
  }
}

// ── Utilities ──

function Chk({ label, checked, set }: { label: string; checked: boolean; set: (v: boolean) => void }) {
  return <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={checked} onChange={e => set(e.target.checked)} className="rounded" /><span className="text-[11px] text-zinc-300">{label}</span></label>;
}

function MiniInp({ label, value, set, w }: { label: string; value: string; set: (v: string) => void; w: string }) {
  return <div><label className="text-[9px] text-zinc-600 block">{label}</label><input className={'input-base text-[10px] ' + w} value={value} onChange={e => set(e.target.value)} /></div>;
}
