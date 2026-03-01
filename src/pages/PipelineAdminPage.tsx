import { useState, useEffect, useCallback } from 'react';
import {
  Settings2, GitBranch, Brain, Wrench, Bot, Check, X, Play,
  RefreshCw, Plus, Send, Trash2, TestTube, Heart, Save,
  ChevronDown, ChevronRight, Copy, Edit3, Zap, Film,
} from 'lucide-react';
import PipelineListView from '../components/pipeline-builder/PipelineListView';
import { apiJson } from '../components/pipeline-builder/types';

const legacyApiJson = apiJson;

// ═══════════════════════════════════════════════
// HOOFD PAGINA
// ═══════════════════════════════════════════════

const TABS = [
  { id: 'builder', label: 'Pipeline Builder', icon: GitBranch },
  { id: 'definitions', label: 'Stap Definities', icon: Settings2 },
  { id: 'models', label: 'LLM Modellen', icon: Brain },
  { id: 'tools', label: 'Tools & APIs', icon: Wrench },
  { id: 'videotypes', label: 'Video Types', icon: Film },
  { id: 'assistant', label: 'AI Assistent', icon: Bot },
] as const;

type TabId = typeof TABS[number]['id'];

export default function PipelineAdminPage() {
  const [activeTab, setActiveTab] = useState<TabId>('builder');

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-52 shrink-0 bg-surface-50/60 backdrop-blur-xl border-r border-white/[0.06] flex flex-col">
        <div className="p-4 pb-3">
          <h1 className="text-base font-bold text-white">Pipeline Admin</h1>
          <p className="text-[10px] text-zinc-500 mt-0.5">v4.2 &mdash; Step List Builder</p>
        </div>
        <div className="h-px bg-white/[0.06] mx-3" />
        <nav className="flex-1 p-2 space-y-0.5">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all ${active ? 'bg-brand-600/15 text-brand-300' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'}`}>
                <Icon className={`w-4 h-4 ${active ? 'text-brand-400' : 'text-zinc-500'}`} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>
      <div className="flex-1 overflow-hidden">
        {activeTab === 'builder' && <BuilderTab />}
        {activeTab === 'definitions' && <div className="overflow-auto h-full p-6"><DefinitionsTab /></div>}
        {activeTab === 'models' && <div className="overflow-auto h-full p-6"><ModelsTab /></div>}
        {activeTab === 'tools' && <div className="overflow-auto h-full p-6"><ToolsTab /></div>}
        {activeTab === 'videotypes' && <div className="overflow-auto h-full p-6"><VideoTypesTab /></div>}
        {activeTab === 'assistant' && <div className="overflow-auto h-full p-6"><AssistantTab /></div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// TAB 1: PIPELINE BUILDER
// ═══════════════════════════════════════════════

function BuilderTab() {
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [dupName, setDupName] = useState('');
  const [dupSlug, setDupSlug] = useState('');

  useEffect(() => {
    legacyApiJson('/pipelines').then(data => {
      setPipelines(data);
      if (data.length > 0 && !selectedPipelineId) setSelectedPipelineId(data[0].id);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const duplicatePipeline = async () => {
    if (!selectedPipelineId || !dupSlug) return;
    try {
      const newP = await legacyApiJson(`/pipelines/${selectedPipelineId}/duplicate`, {
        method: 'POST', body: JSON.stringify({ name: dupName, slug: dupSlug }),
      });
      const updated = await legacyApiJson('/pipelines');
      setPipelines(updated);
      setSelectedPipelineId(newP.id);
      setShowDuplicate(false);
      setDupName(''); setDupSlug('');
    } catch (err: any) { alert(err.message); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-4 py-2 border-b border-white/[0.06] flex items-center gap-2 bg-surface-50/40">
        <span className="text-[11px] text-zinc-500 font-medium">Pipeline:</span>
        <div className="flex gap-1 flex-wrap">
          {pipelines.map(p => (
            <button key={p.id} onClick={() => setSelectedPipelineId(p.id)}
              className={`px-3 py-1 rounded-lg text-[11px] font-medium transition ${selectedPipelineId === p.id ? 'bg-brand-600/20 text-brand-300' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'}`}>
              {p.name}
              <span className="text-zinc-600 ml-1">({p._count?.nodes || '?'})</span>
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button onClick={() => setShowDuplicate(!showDuplicate)} className="text-zinc-500 hover:text-zinc-300 text-[11px] flex items-center gap-1">
          <Copy className="w-3 h-3" /> Dupliceer
        </button>
      </div>
      {showDuplicate && (
        <div className="shrink-0 px-4 py-2 border-b border-white/[0.06] flex items-center gap-2 bg-surface-100/40">
          <input className="input-base text-xs !w-40" placeholder="Naam..." value={dupName} onChange={e => setDupName(e.target.value)} />
          <input className="input-base text-xs !w-32" placeholder="slug..." value={dupSlug} onChange={e => setDupSlug(e.target.value)} />
          <button onClick={duplicatePipeline} className="btn-primary text-xs !px-3 !py-1">Maak kopie</button>
          <button onClick={() => setShowDuplicate(false)} className="text-zinc-500 hover:text-zinc-300"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      <div className="flex-1 overflow-auto">
        {selectedPipelineId ? (
          <PipelineListView key={selectedPipelineId} pipelineId={selectedPipelineId} />
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-500">Selecteer een pipeline</div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// TAB 2: STEP DEFINITIES — BEWERKBAAR + SMART INPUT
// ═══════════════════════════════════════════════

function DefinitionsTab() {
  const [defs, setDefs] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editInputs, setEditInputs] = useState<any[]>([]);
  const [editOutputs, setEditOutputs] = useState<any[]>([]);
  const [newStep, setNewStep] = useState({ name: '', slug: '', category: 'setup', description: '', executorFn: 'placeholder', executorLabel: 'Placeholder', outputFormat: '' });
  const [showAddInput, setShowAddInput] = useState(false);

  const CATEGORIES = ['setup', 'research', 'script', 'audio', 'visual', 'post', 'output'];

  const loadDefs = () => { legacyApiJson('/step-definitions').then(d => { setDefs(d); setLoading(false); }).catch(() => setLoading(false)); };
  useEffect(loadDefs, []);

  const startEdit = () => {
    if (!selected) return;
    setEditInputs(JSON.parse(JSON.stringify(selected.inputSchema || [])));
    setEditOutputs(JSON.parse(JSON.stringify(selected.outputSchema || [])));
    setEditing(true);
  };

  const saveSchema = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await legacyApiJson(`/step-definitions/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ inputSchema: editInputs, outputSchema: editOutputs }),
      });
      loadDefs();
      setEditing(false);
      const updated = await legacyApiJson(`/step-definitions/${selected.id}`);
      setSelected(updated);
    } catch (err: any) { alert(err.message); }
    setSaving(false);
  };

  // Smart: get all available outputs from other steps
  const availableOutputs = defs.filter(d => d.id !== selected?.id).flatMap(d =>
    (d.outputSchema || []).map((o: any) => ({ ...o, fromStep: d.name, fromSlug: d.slug, fromCategory: d.category }))
  );

  const addInputFromOutput = (output: any) => {
    const newInput = { key: output.key, label: output.label + ' (van ' + output.fromStep + ')', type: output.type, required: false, source: 'pipeline' };
    if (!editInputs.find((i: any) => i.key === output.key)) {
      setEditInputs([...editInputs, newInput]);
    }
    setShowAddInput(false);
  };

  const addCustomInput = () => {
    setEditInputs([...editInputs, { key: 'new_input', label: 'Nieuwe Input', type: 'json', required: false, source: 'pipeline' }]);
  };

  const addOutput = () => {
    setEditOutputs([...editOutputs, { key: 'new_output', label: 'Nieuwe Output', type: 'json', filePath: '' }]);
  };

  const removeInput = (idx: number) => setEditInputs(editInputs.filter((_: any, i: number) => i !== idx));
  const removeOutput = (idx: number) => setEditOutputs(editOutputs.filter((_: any, i: number) => i !== idx));

  const updateInput = (idx: number, field: string, value: any) => {
    const copy = [...editInputs]; copy[idx] = { ...copy[idx], [field]: value }; setEditInputs(copy);
  };
  const updateOutput = (idx: number, field: string, value: any) => {
    const copy = [...editOutputs]; copy[idx] = { ...copy[idx], [field]: value }; setEditOutputs(copy);
  };

  const createStep = async () => {
    if (!newStep.name || !newStep.slug) return;
    try {
      await legacyApiJson('/step-definitions', {
        method: 'POST',
        body: JSON.stringify({ ...newStep, inputSchema: [], outputSchema: [], isReady: false }),
      });
      loadDefs();
      setShowAdd(false);
      setNewStep({ name: '', slug: '', category: 'setup', description: '', executorFn: 'placeholder', executorLabel: 'Placeholder', outputFormat: '' });
    } catch (err: any) { alert(err.message); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="flex gap-6 h-full">
      <div className="w-[380px] shrink-0 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-white">Step Definities ({defs.length})</h2>
          <button onClick={() => setShowAdd(!showAdd)} className="btn-primary text-xs !px-2.5 !py-1"><Plus className="w-3 h-3" /> Nieuw</button>
        </div>
        {showAdd && (
          <div className="glass rounded-xl p-3 mb-3 space-y-2">
            <h4 className="text-[11px] font-semibold text-white">Nieuwe Stap Definitie</h4>
            <input className="input-base text-xs" placeholder="Naam..." value={newStep.name} onChange={e => setNewStep({ ...newStep, name: e.target.value })} />
            <input className="input-base text-xs" placeholder="slug (bijv. my-new-step)..." value={newStep.slug} onChange={e => setNewStep({ ...newStep, slug: e.target.value })} />
            <select className="input-base text-xs" value={newStep.category} onChange={e => setNewStep({ ...newStep, category: e.target.value })}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <input className="input-base text-xs" placeholder="Beschrijving..." value={newStep.description} onChange={e => setNewStep({ ...newStep, description: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <input className="input-base text-xs" placeholder="executorFn" value={newStep.executorFn} onChange={e => setNewStep({ ...newStep, executorFn: e.target.value })} />
              <input className="input-base text-xs" placeholder="executorLabel" value={newStep.executorLabel} onChange={e => setNewStep({ ...newStep, executorLabel: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <button onClick={createStep} className="btn-primary text-xs !px-3 !py-1.5">Aanmaken</button>
              <button onClick={() => setShowAdd(false)} className="btn-secondary text-xs !px-3 !py-1.5">Annuleren</button>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-auto space-y-0.5 pr-1">
          {defs.map(def => (
            <button key={def.id} onClick={() => { setSelected(def); setEditing(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all ${selected?.id === def.id ? 'bg-brand-600/15 border border-brand-500/30' : 'hover:bg-white/[0.04] border border-transparent'}`}>
              <div className={`w-2 h-2 rounded-full shrink-0 ${def.isReady ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-white truncate">{def.name}</div>
                <div className="text-[10px] text-zinc-500">{def.category} &middot; {def.executorLabel}</div>
              </div>
              <span className="text-[9px] text-zinc-600">{(def.inputSchema || []).length}&rarr;{(def.outputSchema || []).length}</span>
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <div className="flex-1 glass rounded-2xl p-5 overflow-auto">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-base font-bold text-white">{selected.name}</h3>
            {!editing ? (
              <button onClick={startEdit} className="btn-secondary text-xs !px-2.5 !py-1"><Edit3 className="w-3 h-3" /> Bewerk I/O</button>
            ) : (
              <div className="flex gap-1">
                <button onClick={saveSchema} disabled={saving} className="btn-primary text-xs !px-2.5 !py-1"><Save className="w-3 h-3" /> {saving ? '...' : 'Opslaan'}</button>
                <button onClick={() => setEditing(false)} className="btn-secondary text-xs !px-2.5 !py-1">Annuleren</button>
              </div>
            )}
          </div>
          <p className="text-xs text-zinc-500 mb-4">{selected.description}</p>

          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* INPUTS */}
            <div className="bg-surface-200/50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[10px] text-zinc-500 font-semibold uppercase">Inputs ({editing ? editInputs.length : (selected.inputSchema || []).length})</h4>
                {editing && (
                  <div className="flex gap-1">
                    <button onClick={() => setShowAddInput(!showAddInput)} className="text-brand-400 hover:text-brand-300 text-[9px] flex items-center gap-0.5"><Zap className="w-3 h-3" /> Uit stap</button>
                    <button onClick={addCustomInput} className="text-zinc-400 hover:text-zinc-300"><Plus className="w-3 h-3" /></button>
                  </div>
                )}
              </div>

              {/* Smart input picker */}
              {editing && showAddInput && (
                <div className="bg-surface-300/50 rounded-lg p-2 mb-2 max-h-[200px] overflow-auto">
                  <p className="text-[9px] text-zinc-500 mb-1.5">Kies een output van een andere stap als input:</p>
                  {availableOutputs.map((o, idx) => {
                    const already = editInputs.find((i: any) => i.key === o.key);
                    return (
                      <button key={idx} onClick={() => !already && addInputFromOutput(o)} disabled={!!already}
                        className={`w-full text-left px-2 py-1 rounded text-[10px] flex items-center gap-2 ${already ? 'opacity-30' : 'hover:bg-white/[0.05]'}`}>
                        <span className="text-zinc-500 w-24 truncate">{o.fromStep}</span>
                        <span className="text-zinc-300 flex-1">{o.label}</span>
                        <code className="text-[8px] text-brand-300 font-mono">{o.key}</code>
                        {already && <span className="text-[8px] text-zinc-600">al toegevoegd</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {editing ? (
                <div className="space-y-2">
                  {editInputs.map((inp: any, idx: number) => (
                    <div key={idx} className="bg-surface-300/50 rounded-lg p-2 space-y-1">
                      <div className="flex gap-1">
                        <input className="input-base text-[10px] !py-0.5 flex-1" placeholder="key" value={inp.key} onChange={e => updateInput(idx, 'key', e.target.value)} />
                        <input className="input-base text-[10px] !py-0.5 flex-1" placeholder="label" value={inp.label} onChange={e => updateInput(idx, 'label', e.target.value)} />
                        <button onClick={() => removeInput(idx)} className="text-zinc-600 hover:text-red-400 p-0.5"><Trash2 className="w-3 h-3" /></button>
                      </div>
                      <div className="flex items-center gap-2">
                        <select className="input-base text-[9px] !py-0 w-20" value={inp.type} onChange={e => updateInput(idx, 'type', e.target.value)}>
                          {['json', 'text', 'file', 'audio', 'image', 'video'].map(t => <option key={t}>{t}</option>)}
                        </select>
                        <select className="input-base text-[9px] !py-0 w-20" value={inp.source || 'pipeline'} onChange={e => updateInput(idx, 'source', e.target.value)}>
                          <option value="pipeline">pipeline</option>
                          <option value="project">project</option>
                        </select>
                        <label className="flex items-center gap-1 text-[9px] text-zinc-400">
                          <input type="checkbox" checked={inp.required} onChange={e => updateInput(idx, 'required', e.target.checked)} className="rounded w-3 h-3" /> Verplicht
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                (selected.inputSchema || []).map((i: any) => (
                  <div key={i.key} className="text-[11px] py-0.5 flex items-center gap-1">
                    <span className={i.required ? 'text-zinc-200' : 'text-zinc-500'}>{i.label}</span>
                    <span className="text-zinc-600 font-mono text-[9px]">{i.key}</span>
                    {i.required && <span className="text-red-400 text-[9px]">*</span>}
                    {i.source === 'project' && <span className="text-blue-400 text-[8px] ml-auto">project</span>}
                  </div>
                ))
              )}
            </div>

            {/* OUTPUTS */}
            <div className="bg-surface-200/50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[10px] text-zinc-500 font-semibold uppercase">Outputs ({editing ? editOutputs.length : (selected.outputSchema || []).length})</h4>
                {editing && <button onClick={addOutput} className="text-brand-400 hover:text-brand-300"><Plus className="w-3 h-3" /></button>}
              </div>
              {editing ? (
                <div className="space-y-2">
                  {editOutputs.map((out: any, idx: number) => (
                    <div key={idx} className="bg-surface-300/50 rounded-lg p-2 space-y-1">
                      <div className="flex gap-1">
                        <input className="input-base text-[10px] !py-0.5 flex-1" placeholder="key" value={out.key} onChange={e => updateOutput(idx, 'key', e.target.value)} />
                        <input className="input-base text-[10px] !py-0.5 flex-1" placeholder="label" value={out.label} onChange={e => updateOutput(idx, 'label', e.target.value)} />
                        <button onClick={() => removeOutput(idx)} className="text-zinc-600 hover:text-red-400 p-0.5"><Trash2 className="w-3 h-3" /></button>
                      </div>
                      <div className="flex gap-1">
                        <select className="input-base text-[9px] !py-0 w-20" value={out.type} onChange={e => updateOutput(idx, 'type', e.target.value)}>
                          {['json', 'text', 'file', 'audio', 'image', 'video'].map(t => <option key={t}>{t}</option>)}
                        </select>
                        <input className="input-base text-[9px] !py-0 flex-1" placeholder="filePath" value={out.filePath || ''} onChange={e => updateOutput(idx, 'filePath', e.target.value)} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                (selected.outputSchema || []).map((o: any) => (
                  <div key={o.key} className="text-[11px] py-0.5">
                    <span className="text-zinc-200">{o.label}</span>
                    <span className="text-zinc-600 ml-1 font-mono text-[9px]">{o.filePath}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-2 text-[11px]">
            <InfoRow label="Slug" value={selected.slug} />
            <InfoRow label="Category" value={selected.category} />
            <InfoRow label="Executor" value={`${selected.executorFn}()`} />
            <InfoRow label="Output Format" value={selected.outputFormat || 'n.v.t.'} />
            <InfoRow label="LLM Model" value={selected.llmModel?.name || 'geen'} />
            <InfoRow label="Status" value={selected.isReady ? 'Ready' : 'Skeleton'} />
          </div>

          {selected.systemPrompt && (
            <div className="mt-4">
              <h4 className="text-[10px] text-zinc-500 font-semibold uppercase mb-1">System Prompt</h4>
              <pre className="text-[10px] text-zinc-400 bg-surface-200 rounded-lg p-3 font-mono whitespace-pre-wrap max-h-[200px] overflow-auto">{selected.systemPrompt}</pre>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-zinc-600">
          <div className="text-center"><Settings2 className="w-12 h-12 mx-auto mb-3 opacity-20" /><p className="text-sm">Selecteer een definitie</p></div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// TAB 3: LLM MODELLEN
// ═══════════════════════════════════════════════

function ModelsTab() {
  const [models, setModels] = useState<any[]>([]);
  const [testing, setTesting] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { legacyApiJson('/llm-models').then(setModels).catch(() => {}).finally(() => setLoading(false)); }, []);

  const testModel = async (id: number) => {
    setTesting(id); setTestResult(null);
    try { setTestResult({ id, ...(await legacyApiJson(`/llm-models/${id}/test`, { method: 'POST', body: JSON.stringify({}) })) }); }
    catch (err: any) { setTestResult({ id, error: err.message }); }
    setTesting(null);
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <h2 className="text-lg font-bold text-white mb-4">LLM Modellen ({models.length})</h2>
      <div className="space-y-2">
        {models.map(m => (
          <div key={m.id} className="glass rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">{m.name}</span>
                  <Badge color="brand" text={m.provider} />
                  <Badge color="zinc" text={m.modelType} />
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5 font-mono">{m.modelString}</div>
              </div>
              <button onClick={() => testModel(m.id)} disabled={testing === m.id} className="btn-secondary text-xs !px-3 !py-1.5">
                {testing === m.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <TestTube className="w-3 h-3" />} Test
              </button>
            </div>
            {testResult?.id === m.id && (
              <div className={`mt-3 p-3 rounded-lg text-xs ${testResult.error ? 'bg-red-500/10 text-red-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
                {testResult.error ? `Fout: ${testResult.error}` : `OK: ${testResult.content} (${testResult.durationMs}ms)`}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// TAB 4: TOOLS & APIS — BEWERKBAAR MET SUB-TOOLS
// ═══════════════════════════════════════════════

function ToolsTab() {
  const [tools, setTools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editCaps, setEditCaps] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [tp, setTp] = useState({ method: 'GET', url: '', headers: '{}', body: '' });
  const [tr, setTr] = useState<any>(null);

  const loadTools = () => { legacyApiJson('/api-tools').then(setTools).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(loadTools, []);

  const healthAll = async () => {
    setChecking(true);
    try { const results = await legacyApiJson('/api-tools/health-all', { method: 'POST' }); setTools(prev => prev.map(t => { const r = results.find((x: any) => x.id === t.id); return r ? { ...t, lastHealthOk: r.ok, lastHealthMs: r.durationMs } : t; })); } catch {}
    setChecking(false);
  };

  const startEdit = (tool: any) => {
    setEditingId(tool.id);
    setEditDesc(tool.description || '');
    setEditNotes(tool.notes || '');
    try { setEditCaps(JSON.parse(tool.capabilities || '[]').join('\n')); } catch { setEditCaps(''); }
  };

  const saveTool = async (id: number) => {
    try {
      await legacyApiJson(`/api-tools/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          description: editDesc,
          capabilities: JSON.stringify(editCaps.split('\n').filter(l => l.trim())),
          notes: editNotes,
        }),
      });
      loadTools();
      setEditingId(null);
    } catch (err: any) { alert(err.message); }
  };

  const runTest = async () => {
    setTr(null);
    try { setTr(await legacyApiJson('/api-tools/test', { method: 'POST', body: JSON.stringify({ method: tp.method, url: tp.url, headers: JSON.parse(tp.headers || '{}'), body: tp.body || undefined }) })); }
    catch (err: any) { setTr({ error: err.message }); }
  };

  const parseCaps = (tool: any): string[] => {
    try { return JSON.parse(tool.capabilities || '[]'); } catch { return []; }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Tools & APIs ({tools.length})</h2>
        <button onClick={healthAll} disabled={checking} className="btn-secondary text-xs !px-3 !py-1.5">
          <Heart className={`w-3 h-3 ${checking ? 'animate-pulse' : ''}`} /> Health All
        </button>
      </div>
      <div className="space-y-2">
        {tools.map(t => {
          const caps = parseCaps(t);
          const isOpen = expandedId === t.id;
          const isEdit = editingId === t.id;
          return (
            <div key={t.id} className="glass rounded-xl overflow-hidden">
              <div className="p-3 flex items-center gap-3 cursor-pointer" onClick={() => setExpandedId(isOpen ? null : t.id)}>
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${t.lastHealthOk === true ? 'bg-emerald-400' : t.lastHealthOk === false ? 'bg-red-400' : 'bg-zinc-600'}`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{t.name}</span>
                    <Badge color="zinc" text={t.authType} />
                    {t.lastHealthMs && <span className="text-[10px] text-emerald-400">{t.lastHealthMs}ms</span>}
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-0.5">{t.description || t.baseUrl || '(geen beschrijving)'}</p>
                </div>
                {caps.length > 0 && <span className="text-[9px] text-zinc-500">{caps.length} functies</span>}
                {isOpen ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
              </div>

              {isOpen && (
                <div className="px-4 pb-4 border-t border-white/[0.04] space-y-3">
                  {isEdit ? (
                    /* Edit mode */
                    <div className="pt-3 space-y-2">
                      <div>
                        <label className="text-[10px] text-zinc-500 block mb-0.5">Beschrijving</label>
                        <textarea className="input-base text-xs min-h-[60px]" value={editDesc} onChange={e => setEditDesc(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-500 block mb-0.5">Functies (1 per regel)</label>
                        <textarea className="input-base text-xs min-h-[100px] font-mono" value={editCaps} onChange={e => setEditCaps(e.target.value)}
                          placeholder="TTS met 10+ stemmen&#10;AI Image generatie&#10;AI Video generatie" />
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-500 block mb-0.5">Notities</label>
                        <textarea className="input-base text-xs min-h-[40px]" value={editNotes} onChange={e => setEditNotes(e.target.value)} />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => saveTool(t.id)} className="btn-primary text-xs !px-3 !py-1.5"><Save className="w-3 h-3" /> Opslaan</button>
                        <button onClick={() => setEditingId(null)} className="btn-secondary text-xs !px-3 !py-1.5">Annuleren</button>
                      </div>
                    </div>
                  ) : (
                    /* View mode */
                    <>
                      <div className="pt-3 flex items-center justify-between">
                        <div><span className="text-[10px] text-zinc-500">Base URL</span><br /><code className="text-[11px] text-brand-300 font-mono">{t.baseUrl || 'n.v.t.'}</code></div>
                        <button onClick={(e) => { e.stopPropagation(); startEdit(t); }} className="btn-secondary text-xs !px-2 !py-1"><Edit3 className="w-3 h-3" /> Bewerk</button>
                      </div>
                      {caps.length > 0 && (
                        <div>
                          <span className="text-[10px] text-zinc-500 font-semibold uppercase block mb-1.5">Functies & Mogelijkheden</span>
                          <div className="space-y-1">
                            {caps.map((cap, i) => (
                              <div key={i} className="flex items-start gap-2 text-[11px]">
                                <Zap className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                                <span className="text-zinc-300">{cap}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-3 gap-3 text-[10px]">
                        <div><span className="text-zinc-500 block">Auth Type</span><span className="text-zinc-300">{t.authType}</span></div>
                        <div><span className="text-zinc-500 block">Auth Key Ref</span><span className="text-zinc-300 font-mono">{t.authKeyRef || 'n.v.t.'}</span></div>
                        <div><span className="text-zinc-500 block">Health Endpoint</span><span className="text-zinc-300 font-mono">{t.healthEndpoint || 'n.v.t.'}</span></div>
                      </div>
                      {t.notes && <div><span className="text-[10px] text-zinc-500">Notities</span><p className="text-[11px] text-zinc-400">{t.notes}</p></div>}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="glass rounded-2xl p-5">
        <h3 className="text-sm font-bold text-white mb-3">API Test Panel</h3>
        <div className="grid grid-cols-[100px_1fr] gap-3 mb-3">
          <select className="input-base text-xs" value={tp.method} onChange={e => setTp({ ...tp, method: e.target.value })}>
            {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => <option key={m}>{m}</option>)}
          </select>
          <input className="input-base text-xs" placeholder="URL..." value={tp.url} onChange={e => setTp({ ...tp, url: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <textarea className="input-base font-mono text-xs min-h-[50px]" placeholder="Headers JSON..." value={tp.headers} onChange={e => setTp({ ...tp, headers: e.target.value })} />
          <textarea className="input-base font-mono text-xs min-h-[50px]" placeholder="Body..." value={tp.body} onChange={e => setTp({ ...tp, body: e.target.value })} />
        </div>
        <button onClick={runTest} className="btn-primary text-xs !px-4 !py-2"><Play className="w-3.5 h-3.5" /> Verstuur</button>
        {tr && (
          <div className="mt-4">
            <div className={`text-xs font-mono mb-2 ${tr.error ? 'text-red-400' : tr.statusCode < 300 ? 'text-emerald-400' : 'text-yellow-400'}`}>
              {tr.error ? `Error: ${tr.error}` : `${tr.statusCode} (${tr.durationMs}ms)`}
            </div>
            {tr.response && <pre className="bg-surface-200 rounded-lg p-3 text-xs text-zinc-300 overflow-auto max-h-[250px] font-mono">{fmtJson(tr.response)}</pre>}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// TAB 5: VIDEO TYPES BEHEER
// ═══════════════════════════════════════════════

function VideoTypesTab() {
  const [types, setTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newType, setNewType] = useState({ slug: '', name: '', description: '' });

  const loadTypes = () => {
    legacyApiJson('/video-types/list').then(data => {
      // API returns string array, convert to objects
      if (Array.isArray(data) && typeof data[0] === 'string') {
        setTypes(data.map(vt => ({ videoType: vt, name: vt, isActive: true })));
      } else {
        setTypes(data);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(loadTypes, []);

  const addType = async () => {
    if (!newType.slug || !newType.name) return;
    try {
      await legacyApiJson('/video-types/add', {
        method: 'POST',
        body: JSON.stringify({ name: newType.slug, copyFrom: '' }),
      });
      loadTypes();
      setShowAdd(false);
      setNewType({ slug: '', name: '', description: '' });
    } catch (err: any) { alert(err.message); }
  };

  const toggleType = async (videoType: string) => {
    try {
      await legacyApiJson(`/video-types/${videoType}/toggle`, { method: 'POST' });
      loadTypes();
    } catch (err: any) { alert(err.message); }
  };

  const deleteType = async (videoType: string) => {
    if (!confirm(`Video type "${videoType}" verwijderen?`)) return;
    try {
      await legacyApiJson(`/video-types/${videoType}`, { method: 'DELETE' });
      loadTypes();
    } catch (err: any) { alert(err.message); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Video Types ({types.length})</h2>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary text-xs !px-3 !py-1.5"><Plus className="w-3 h-3" /> Nieuw Type</button>
      </div>

      {showAdd && (
        <div className="glass rounded-xl p-4 space-y-2">
          <h4 className="text-[11px] font-semibold text-white">Nieuw Video Type</h4>
          <div className="grid grid-cols-2 gap-2">
            <input className="input-base text-xs" placeholder="Slug (bijv. tutorial)" value={newType.slug} onChange={e => setNewType({ ...newType, slug: e.target.value })} />
            <input className="input-base text-xs" placeholder="Naam (bijv. Tutorial Video)" value={newType.name} onChange={e => setNewType({ ...newType, name: e.target.value })} />
          </div>
          <input className="input-base text-xs" placeholder="Beschrijving..." value={newType.description} onChange={e => setNewType({ ...newType, description: e.target.value })} />
          <div className="flex gap-2">
            <button onClick={addType} className="btn-primary text-xs !px-3 !py-1.5">Aanmaken</button>
            <button onClick={() => setShowAdd(false)} className="btn-secondary text-xs !px-3 !py-1.5">Annuleren</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {types.map((t: any) => (
          <div key={t.videoType || t.slug} className="glass rounded-xl p-4 flex items-center gap-4">
            <div className={`w-3 h-3 rounded-full ${t.isActive !== false ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">{t.name || t.videoType}</span>
                <code className="text-[9px] text-zinc-500 font-mono">{t.videoType || t.slug}</code>
              </div>
              {t.description && <p className="text-[10px] text-zinc-500 mt-0.5">{t.description}</p>}
              {t._count?.steps !== undefined && <span className="text-[10px] text-zinc-600">{t._count.steps} stappen</span>}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => toggleType(t.videoType || t.slug)} className="btn-secondary text-xs !px-2 !py-1">
                {t.isActive !== false ? 'Deactiveer' : 'Activeer'}
              </button>
              <button onClick={() => deleteType(t.videoType || t.slug)} className="text-zinc-600 hover:text-red-400 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
        {types.length === 0 && <p className="text-zinc-500 text-sm">Geen video types gevonden.</p>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// TAB 6: AI ASSISTENT
// ═══════════════════════════════════════════════

function AssistantTab() {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [convId, setConvId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [convs, setConvs] = useState<any[]>([]);

  useEffect(() => { legacyApiJson('/assistant/conversations').then(setConvs).catch(() => {}); }, []);

  const send = async () => {
    if (!input.trim() || sending) return;
    const msg = input.trim(); setInput('');
    setMessages(p => [...p, { role: 'user', content: msg }]);
    setSending(true);
    try {
      const r = await legacyApiJson('/assistant/chat', { method: 'POST', body: JSON.stringify({ conversationId: convId, message: msg }) });
      setConvId(r.conversationId);
      setMessages(p => [...p, { role: 'assistant', content: r.message }]);
    } catch (err: any) {
      setMessages(p => [...p, { role: 'assistant', content: `Fout: ${err.message}` }]);
    }
    setSending(false);
  };

  return (
    <div className="flex gap-4 h-full">
      <div className="w-44 shrink-0">
        <button onClick={() => { setMessages([]); setConvId(null); }} className="btn-secondary text-xs w-full mb-3 !py-2"><Plus className="w-3 h-3" /> Nieuw</button>
        <div className="space-y-0.5">
          {convs.map(c => (
            <button key={c.id} onClick={async () => { try { const d = await legacyApiJson(`/assistant/conversations/${c.id}`); setMessages(d.messages); setConvId(c.id); } catch {} }}
              className={`w-full text-left px-2 py-1.5 rounded-lg text-[11px] truncate ${convId === c.id ? 'bg-brand-600/15 text-brand-300' : 'text-zinc-400 hover:bg-white/[0.04]'}`}>
              {c.title}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 flex flex-col glass rounded-2xl overflow-hidden">
        <div className="p-3 border-b border-white/[0.06] flex items-center gap-2">
          <Bot className="w-4 h-4 text-brand-400" /><span className="text-sm font-semibold text-white">AI Assistent</span>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-8 text-zinc-500"><Bot className="w-12 h-12 mx-auto mb-3 opacity-20" /><p className="text-xs">Stel een vraag over de pipeline</p></div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[13px] ${m.role === 'user' ? 'bg-brand-600/20 text-brand-100' : 'bg-surface-200 text-zinc-200'}`}>
                <div className="whitespace-pre-wrap">{m.content}</div>
              </div>
            </div>
          ))}
          {sending && <div className="flex justify-start"><div className="bg-surface-200 rounded-2xl px-4 py-2.5 text-[13px] text-zinc-400"><RefreshCw className="w-3.5 h-3.5 animate-spin inline mr-2" />Denken...</div></div>}
        </div>
        <div className="p-3 border-t border-white/[0.06] flex gap-2">
          <input className="input-base text-sm" placeholder="Typ je vraag..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} />
          <button onClick={send} disabled={sending || !input.trim()} className="btn-primary !px-3"><Send className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════

function fmtJson(str: string) { try { return JSON.stringify(JSON.parse(str), null, 2); } catch { return str; } }

function Badge({ color, text }: { color: string; text: string }) {
  const colors: Record<string, string> = {
    green: 'bg-emerald-500/15 text-emerald-300', amber: 'bg-amber-500/15 text-amber-300',
    brand: 'bg-brand-600/20 text-brand-300', zinc: 'bg-surface-300 text-zinc-400',
  };
  return <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${colors[color] || colors.zinc}`}>{text}</span>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between py-0.5"><span className="text-zinc-500">{label}</span><span className="text-zinc-300">{value}</span></div>;
}

function Spinner() { return <div className="flex items-center justify-center h-64"><RefreshCw className="w-6 h-6 text-brand-400 animate-spin" /></div>; }
