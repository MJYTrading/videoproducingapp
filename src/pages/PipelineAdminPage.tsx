import { useState, useEffect, useCallback } from 'react';
import {
  Settings2, GitBranch, Brain, Wrench, Bot, Check, X, Play,
  RefreshCw, Plus, GripVertical, Send, Trash2, TestTube, Heart, Save,
  ChevronDown, ChevronRight, ArrowRight
} from 'lucide-react';

const API = '/api/admin';

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('vp-token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as any || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${API}${path}`, { ...options, headers });
}

async function apiJson(path: string, options: RequestInit = {}) {
  const res = await apiFetch(path, options);
  if (!res.ok) { const err = await res.json().catch(() => ({ error: 'Fout' })); throw new Error(err.error || `HTTP ${res.status}`); }
  return res.json();
}

// ═══════════════════════════════════════════════
// HOOFD PAGINA
// ═══════════════════════════════════════════════

const TABS = [
  { id: 'steps', label: 'Pipeline Stappen', icon: Settings2 },
  { id: 'types', label: 'Video Type Routes', icon: GitBranch },
  { id: 'models', label: 'LLM Modellen', icon: Brain },
  { id: 'tools', label: 'Tools & APIs', icon: Wrench },
  { id: 'assistant', label: 'AI Assistent', icon: Bot },
] as const;

type TabId = typeof TABS[number]['id'];

export default function PipelineAdminPage() {
  const [activeTab, setActiveTab] = useState<TabId>('steps');

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden -m-6 -mt-4">
      <div className="w-52 shrink-0 bg-surface-50/60 backdrop-blur-xl border-r border-white/[0.06] flex flex-col">
        <div className="p-4 pb-3">
          <h1 className="text-base font-bold text-white">Pipeline Admin</h1>
          <p className="text-[10px] text-zinc-500 mt-0.5">v2.0 — 24 stappen</p>
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
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'steps' && <StepsTab />}
        {activeTab === 'types' && <VideoTypesTab />}
        {activeTab === 'models' && <ModelsTab />}
        {activeTab === 'tools' && <ToolsTab />}
        {activeTab === 'assistant' && <AssistantTab />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// TAB 1: PIPELINE STAPPEN
// ═══════════════════════════════════════════════

function StepsTab() {
  const [steps, setSteps] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setSteps(await apiJson('/pipeline-steps')); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveStep = async (id: number, updates: any) => {
    try {
      const updated = await apiJson(`/pipeline-steps/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
      await load();
      if (selected?.id === id) setSelected(updated);
    } catch (err: any) { alert('Opslaan mislukt: ' + err.message); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="flex gap-6 h-full">
      <div className="w-[440px] shrink-0 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Pipeline Stappen</h2>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-emerald-400">{steps.filter(s => s.readyToUse).length} ready</span>
            <span className="text-[10px] text-zinc-500">·</span>
            <span className="text-[10px] text-zinc-500">{steps.filter(s => !s.readyToUse).length} skeleton</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto space-y-0.5 pr-1">
          {steps.map(step => {
            const deps = safeJson(step.dependsOn, []);
            return (
              <button key={step.id} onClick={() => setSelected(step)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all ${selected?.id === step.id ? 'bg-brand-600/15 border border-brand-500/30' : 'hover:bg-white/[0.04] border border-transparent'}`}>
                <GripVertical className="w-3 h-3 text-zinc-700 shrink-0" />
                <span className="w-5 text-[10px] text-zinc-500 font-mono">{step.stepNumber}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-white truncate">{step.name}</div>
                  <div className="text-[10px] text-zinc-500 flex items-center gap-1.5">
                    <span>{step.executorLabel}</span>
                    {step.parallelGroup && <><span className="text-zinc-600">·</span><span className="text-blue-400/60">∥ {step.parallelGroup}</span></>}
                    {deps.length > 0 && <><span className="text-zinc-600">·</span><span className="text-zinc-600">← {deps.join(',')}</span></>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {step.isCheckpoint && <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">CP</span>}
                  {step.llmModel && <span className="text-[8px] px-1 py-0.5 rounded bg-purple-500/15 text-purple-300">{step.llmModel.name.split(' ').pop()}</span>}
                  <div className={`w-2 h-2 rounded-full ${step.readyToUse ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selected ? (
        <StepDetail step={selected} onSave={saveStep} allSteps={steps} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-zinc-600">
          <div className="text-center">
            <Settings2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Selecteer een stap om te bewerken</p>
          </div>
        </div>
      )}
    </div>
  );
}

function StepDetail({ step, onSave, allSteps }: { step: any; onSave: (id: number, u: any) => Promise<void>; allSteps: any[] }) {
  const [f, setF] = useState(step);
  const [models, setModels] = useState<any[]>([]);
  const [tools, setTools] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setF(step); }, [step]);
  useEffect(() => {
    apiJson('/llm-models').then(setModels).catch(() => {});
    apiJson('/api-tools').then(setTools).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    await onSave(f.id, {
      name: f.name, description: f.description, executorLabel: f.executorLabel, executorFn: f.executorFn,
      toolPrimary: f.toolPrimary, toolFallback: f.toolFallback || null,
      llmModelId: f.llmModelId || null, systemPrompt: f.systemPrompt, userPromptTpl: f.userPromptTpl,
      outputFormat: f.outputFormat, temperature: parseFloat(f.temperature) || 0.7,
      maxTokens: f.maxTokens ? parseInt(f.maxTokens) : null,
      dependsOn: typeof f.dependsOn === 'string' ? f.dependsOn : JSON.stringify(f.dependsOn || []),
      parallelGroup: f.parallelGroup || null, isCheckpoint: f.isCheckpoint, checkpointCond: f.checkpointCond || null,
      timeout: parseInt(f.timeout) || 300000, maxRetries: parseInt(f.maxRetries) || 3,
      readyToUse: f.readyToUse, notes: f.notes,
    });
    setSaving(false);
  };

  const deps = safeJson(f.dependsOn, []);
  const retries = safeJson(f.retryDelays, []);
  const vtConfigs = f.videoTypeConfigs || [];
  const enabledTypes = vtConfigs.filter((c: any) => c.enabled).map((c: any) => c.videoType);
  const disabledTypes = vtConfigs.filter((c: any) => !c.enabled).map((c: any) => c.videoType);
  const dependents = allSteps.filter(s => { const d = safeJson(s.dependsOn, []); return d.includes(f.stepNumber); });

  return (
    <div className="flex-1 glass rounded-2xl p-5 overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-white">Stap {f.stepNumber}: {f.name}</h3>
          {f.notes && <p className="text-[11px] text-amber-400/80 mt-0.5">{f.notes}</p>}
        </div>
        <button onClick={save} disabled={saving} className="btn-primary text-xs !px-4 !py-2">
          <Save className="w-3.5 h-3.5" />{saving ? 'Opslaan...' : 'Opslaan'}
        </button>
      </div>

      {/* Quick info badges */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <Badge color={f.readyToUse ? 'green' : 'zinc'} text={f.readyToUse ? 'Ready' : 'Skeleton'} />
        {f.isCheckpoint && <Badge color="amber" text="Checkpoint" />}
        {f.parallelGroup && <Badge color="blue" text={`∥ ${f.parallelGroup}`} />}
        <Badge color="zinc" text={`Timeout: ${Math.round(f.timeout / 1000)}s`} />
        <Badge color="zinc" text={`Retries: ${f.maxRetries}`} />
        {f.llmModel && <Badge color="purple" text={f.llmModel.name} />}
        <Badge color="zinc" text={`Output: ${f.outputFormat || 'n.v.t.'}`} />
      </div>

      {/* Dependencies info */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-surface-200/50 rounded-lg p-3">
          <div className="text-[10px] text-zinc-500 font-semibold uppercase mb-1.5">Wacht op</div>
          <div className="flex flex-wrap gap-1">
            {deps.length === 0 ? <span className="text-[11px] text-zinc-600">Geen</span> :
              deps.map((d: number) => {
                const ds = allSteps.find(s => s.stepNumber === d);
                return <span key={d} className="text-[10px] px-2 py-0.5 rounded bg-surface-300 text-zinc-300">{d}: {ds?.name || '?'}</span>;
              })}
          </div>
        </div>
        <div className="bg-surface-200/50 rounded-lg p-3">
          <div className="text-[10px] text-zinc-500 font-semibold uppercase mb-1.5">Wordt gebruikt door</div>
          <div className="flex flex-wrap gap-1">
            {dependents.length === 0 ? <span className="text-[11px] text-zinc-600">Niemand</span> :
              dependents.map(s => <span key={s.id} className="text-[10px] px-2 py-0.5 rounded bg-surface-300 text-zinc-300">{s.stepNumber}: {s.name}</span>)}
          </div>
        </div>
      </div>

      {/* Video types info */}
      <div className="bg-surface-200/50 rounded-lg p-3 mb-5">
        <div className="text-[10px] text-zinc-500 font-semibold uppercase mb-1.5">Video Types</div>
        <div className="flex flex-wrap gap-1.5">
          {enabledTypes.map((vt: string) => <span key={vt} className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300">{vt}</span>)}
          {disabledTypes.map((vt: string) => <span key={vt} className="text-[10px] px-2 py-0.5 rounded bg-surface-400 text-zinc-500 line-through">{vt}</span>)}
        </div>
      </div>

      <div className="space-y-5">
        <Sec title="Basis">
          <div className="grid grid-cols-2 gap-3">
            <Inp label="Naam" value={f.name} set={v => setF({ ...f, name: v })} />
            <Inp label="Executor Label" value={f.executorLabel} set={v => setF({ ...f, executorLabel: v })} />
          </div>
          <Inp label="Beschrijving" value={f.description} set={v => setF({ ...f, description: v })} />
          <Inp label="Executor Functie" value={f.executorFn} set={v => setF({ ...f, executorFn: v })} mono />
          <div className="flex items-center gap-6 mt-2">
            <Chk label="Ready to Use" checked={f.readyToUse} set={v => setF({ ...f, readyToUse: v })} />
            <Chk label="Checkpoint" checked={f.isCheckpoint} set={v => setF({ ...f, isCheckpoint: v })} />
          </div>
        </Sec>

        <Sec title="Tools & LLM">
          <div className="grid grid-cols-2 gap-3">
            <Sel label="Tool Primair" value={f.toolPrimary} set={v => setF({ ...f, toolPrimary: v })}
              options={[{ value: '', label: '— Geen —' }, ...tools.map(t => ({ value: t.name, label: t.name })),
                ...(f.toolPrimary && !tools.find(t => t.name === f.toolPrimary) ? [{ value: f.toolPrimary, label: `${f.toolPrimary} (custom)` }] : [])]} />
            <Sel label="Tool Fallback" value={f.toolFallback || ''} set={v => setF({ ...f, toolFallback: v })}
              options={[{ value: '', label: '— Geen —' }, ...tools.map(t => ({ value: t.name, label: t.name })),
                ...(f.toolFallback && !tools.find(t => t.name === f.toolFallback) ? [{ value: f.toolFallback, label: `${f.toolFallback} (custom)` }] : [])]} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Sel label="LLM Model" value={String(f.llmModelId || '')} set={v => setF({ ...f, llmModelId: v ? parseInt(v) : null })}
              options={[{ value: '', label: 'Geen' }, ...models.map(m => ({ value: String(m.id), label: `${m.name} (${m.modelType})` }))]} />
            <Inp label="Temperature" value={String(f.temperature)} set={v => setF({ ...f, temperature: v })} />
            <Inp label="Max Tokens" value={String(f.maxTokens || '')} set={v => setF({ ...f, maxTokens: v })} />
          </div>
          <Inp label="Output Format" value={f.outputFormat} set={v => setF({ ...f, outputFormat: v })} />
        </Sec>

        <Sec title="Pipeline Config">
          <div className="grid grid-cols-3 gap-3">
            <Inp label="Wacht op (steps)" value={deps.join(', ')} set={v => setF({ ...f, dependsOn: JSON.stringify(v.split(',').map((s: string) => parseInt(s.trim())).filter((n: number) => !isNaN(n))) })} />
            <Inp label="Parallel Groep" value={f.parallelGroup || ''} set={v => setF({ ...f, parallelGroup: v })} />
            <Inp label="Checkpoint Cond." value={f.checkpointCond || ''} set={v => setF({ ...f, checkpointCond: v })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Inp label="Timeout (ms)" value={String(f.timeout)} set={v => setF({ ...f, timeout: v })} />
            <Inp label="Max Retries" value={String(f.maxRetries)} set={v => setF({ ...f, maxRetries: v })} />
            <Inp label="Retry Delays (ms)" value={retries.join(', ')} set={v => setF({ ...f, retryDelays: JSON.stringify(v.split(',').map((s: string) => parseInt(s.trim())).filter((n: number) => !isNaN(n))) })} />
          </div>
        </Sec>

        <Sec title="System Prompt">
          <textarea className="input-base font-mono text-xs min-h-[150px]" value={f.systemPrompt || ''} onChange={e => setF({ ...f, systemPrompt: e.target.value })} placeholder="Geen system prompt" />
          {f.systemPrompt && <p className="text-[10px] text-zinc-600 mt-1">{f.systemPrompt.length} tekens</p>}
        </Sec>

        <Sec title="User Prompt Template">
          <textarea className="input-base font-mono text-xs min-h-[100px]" value={f.userPromptTpl || ''} onChange={e => setF({ ...f, userPromptTpl: e.target.value })} placeholder="Geen template" />
          <p className="text-[10px] text-zinc-600 mt-1">Variabelen: {'{title} {description} {language} {videoType} {wordCount} {sections} {styleProfile} {researchData}'}</p>
        </Sec>

        <Sec title="Notities">
          <textarea className="input-base text-xs min-h-[60px]" value={f.notes || ''} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="Interne notities..." />
        </Sec>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// TAB 2: VIDEO TYPE ROUTES
// ═══════════════════════════════════════════════

function VideoTypesTab() {
  const [matrix, setMatrix] = useState<Record<string, Record<number, boolean>>>({});
  const [steps, setSteps] = useState<any[]>([]);
  const [videoTypes, setVideoTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [copyFrom, setCopyFrom] = useState('');

  const loadAll = useCallback(async () => {
    try {
      const [m, s, vt] = await Promise.all([apiJson('/video-types/matrix'), apiJson('/pipeline-steps'), apiJson('/video-types/list')]);
      setMatrix(m); setSteps(s); setVideoTypes(vt);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const toggle = async (vt: string, sn: number) => {
    const cur = matrix[vt]?.[sn] ?? true;
    setMatrix(p => ({ ...p, [vt]: { ...p[vt], [sn]: !cur } }));
    try { await apiJson(`/video-types/${vt}/toggle`, { method: 'POST', body: JSON.stringify({ stepNumber: sn, enabled: !cur }) }); }
    catch { setMatrix(p => ({ ...p, [vt]: { ...p[vt], [sn]: cur } })); }
  };

  const addType = async () => {
    const slug = newName.trim().toLowerCase().replace(/\s+/g, '_');
    if (!slug) return;
    try {
      await apiJson('/video-types/add', { method: 'POST', body: JSON.stringify({ name: slug, copyFrom: copyFrom || undefined }) });
      await loadAll();
      setNewName(''); setCopyFrom(''); setShowAdd(false);
    } catch (err: any) { alert(err.message); }
  };

  const deleteType = async (vt: string) => {
    if (!confirm(`Video type "${vt}" verwijderen?`)) return;
    try { await apiJson(`/video-types/${vt}`, { method: 'DELETE' }); await loadAll(); }
    catch (err: any) { alert(err.message); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Video Type Routes</h2>
          <p className="text-xs text-zinc-500 mt-0.5">{videoTypes.length} types · {steps.length} stappen</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-secondary text-xs !px-3 !py-1.5"><Plus className="w-3 h-3" /> Type toevoegen</button>
      </div>

      {showAdd && (
        <div className="glass rounded-xl p-4">
          <h4 className="text-sm font-semibold text-white mb-3">Nieuw video type</h4>
          <div className="grid grid-cols-3 gap-3">
            <Inp label="Naam (lowercase)" value={newName} set={setNewName} />
            <Sel label="Kopieer van" value={copyFrom} set={setCopyFrom}
              options={[{ value: '', label: '— Leeg (alles uit) —' }, ...videoTypes.map(vt => ({ value: vt, label: vt }))]} />
            <div className="flex items-end"><button onClick={addType} className="btn-primary text-xs !px-4 !py-2">Toevoegen</button></div>
          </div>
        </div>
      )}

      {/* Matrix table */}
      <div className="overflow-auto glass rounded-2xl">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="text-left px-3 py-2.5 text-zinc-400 font-medium sticky left-0 bg-surface-100/80 backdrop-blur-xl z-10 min-w-[200px]">Stap</th>
              {videoTypes.map(vt => (
                <th key={vt} className="px-1.5 py-2.5 text-center min-w-[65px]">
                  <div className="text-[10px] text-zinc-400 font-medium">{vt}</div>
                  <div className="text-[9px] text-zinc-600">{Object.values(matrix[vt] || {}).filter(Boolean).length}/{steps.length}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {steps.map(step => (
              <tr key={step.stepNumber} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                <td className="px-3 py-1.5 sticky left-0 bg-surface-100/80 backdrop-blur-xl z-10">
                  <span className="text-zinc-500 font-mono mr-1.5 text-[10px]">{step.stepNumber}</span>
                  <span className={`text-[11px] ${step.readyToUse ? 'text-zinc-300' : 'text-zinc-500'}`}>{step.name}</span>
                  {!step.readyToUse && <span className="text-[8px] text-zinc-600 ml-1">(skel)</span>}
                </td>
                {videoTypes.map(vt => (
                  <td key={vt} className="px-1.5 py-1.5 text-center">
                    <button onClick={() => toggle(vt, step.stepNumber)} className="inline-flex p-0.5 rounded hover:bg-white/[0.05]">
                      {matrix[vt]?.[step.stepNumber] ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <X className="w-3.5 h-3.5 text-zinc-700" />}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* In-depth per type */}
      <div>
        <h3 className="text-sm font-bold text-white mb-3">In-depth per video type</h3>
        <div className="space-y-2">
          {videoTypes.map(vt => {
            const expanded = expandedType === vt;
            const enabledSteps = steps.filter(s => matrix[vt]?.[s.stepNumber]);
            const skeletonCount = enabledSteps.filter(s => !s.readyToUse).length;
            return (
              <div key={vt} className="glass rounded-xl overflow-hidden">
                <button onClick={() => setExpandedType(expanded ? null : vt)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02]">
                  <div className="flex items-center gap-3">
                    {expanded ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />}
                    <span className="text-sm font-semibold text-white">{vt}</span>
                    <span className="text-[10px] text-zinc-500">{enabledSteps.length} stappen</span>
                    {skeletonCount > 0 && <span className="text-[10px] text-amber-400">{skeletonCount} skeleton</span>}
                  </div>
                  <button onClick={e => { e.stopPropagation(); deleteType(vt); }} className="text-zinc-600 hover:text-red-400 p-1"><Trash2 className="w-3 h-3" /></button>
                </button>
                {expanded && (
                  <div className="px-4 pb-4">
                    {/* Flow */}
                    <div className="flex flex-wrap items-center gap-1 mb-3">
                      {enabledSteps.map((s, i) => (
                        <div key={s.id} className="flex items-center gap-1">
                          <span className={`text-[10px] px-2 py-1 rounded-lg ${s.readyToUse ? 'bg-surface-300 text-zinc-200' : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'}`}>
                            {s.stepNumber}. {s.name}
                          </span>
                          {i < enabledSteps.length - 1 && <ArrowRight className="w-3 h-3 text-zinc-600" />}
                        </div>
                      ))}
                    </div>
                    {/* Detail list */}
                    <div className="space-y-0.5">
                      {enabledSteps.map(s => {
                        const sDeps = safeJson(s.dependsOn, []);
                        return (
                          <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.02] text-[11px]">
                            <span className="w-5 text-zinc-500 font-mono shrink-0">{s.stepNumber}</span>
                            <span className={`w-36 truncate ${s.readyToUse ? 'text-zinc-200' : 'text-zinc-500'}`}>{s.name}</span>
                            <span className="text-zinc-600 w-28 truncate">{s.executorLabel}</span>
                            <span className="text-zinc-600 w-32 truncate">{s.toolPrimary || '—'}</span>
                            {s.llmModel ? <span className="text-purple-400/60 text-[10px] w-16 truncate">{s.llmModel.name.split(' ').pop()}</span> : <span className="w-16" />}
                            <span className="text-zinc-600 flex-1 text-right">{sDeps.length > 0 ? `← ${sDeps.join(',')}` : ''}</span>
                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.readyToUse ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
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

  useEffect(() => { apiJson('/llm-models').then(setModels).catch(() => {}).finally(() => setLoading(false)); }, []);

  const testModel = async (id: number) => {
    setTesting(id); setTestResult(null);
    try { setTestResult({ id, ...(await apiJson(`/llm-models/${id}/test`, { method: 'POST', body: JSON.stringify({}) })) }); }
    catch (err: any) { setTestResult({ id, error: err.message }); }
    setTesting(null);
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white">LLM Modellen</h2>
        <span className="text-xs text-zinc-500">{models.length} modellen</span>
      </div>
      <div className="space-y-2">
        {models.map(m => (
          <div key={m.id} className="glass rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">{m.name}</span>
                  <Badge color="brand" text={m.provider} />
                  <Badge color="zinc" text={m.modelType} />
                  {m.supportsStream && <Badge color="blue" text="stream" />}
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5 font-mono">{m.modelString}</div>
                {m.maxTokens && <span className="text-[10px] text-zinc-600">Max: {m.maxTokens.toLocaleString()} tokens</span>}
              </div>
              <button onClick={() => testModel(m.id)} disabled={testing === m.id} className="btn-secondary text-xs !px-3 !py-1.5">
                {testing === m.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <TestTube className="w-3 h-3" />} Test
              </button>
            </div>
            {testResult?.id === m.id && (
              <div className={`mt-3 p-3 rounded-lg text-xs ${testResult.error ? 'bg-red-500/10 text-red-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
                {testResult.error ? `❌ ${testResult.error}` : `✅ ${testResult.content} (${testResult.durationMs}ms)`}
              </div>
            )}
            {m.notes && <p className="text-[10px] text-zinc-600 mt-2">{m.notes}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// TAB 4: TOOLS & APIS
// ═══════════════════════════════════════════════

function ToolsTab() {
  const [tools, setTools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [tp, setTp] = useState({ method: 'GET', url: '', headers: '{}', body: '' });
  const [tr, setTr] = useState<any>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [nt, setNt] = useState({ name: '', category: 'api', baseUrl: '', authType: 'bearer', authKeyRef: '', healthEndpoint: '', notes: '' });

  const loadTools = useCallback(async () => {
    try { setTools(await apiJson('/api-tools')); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadTools(); }, [loadTools]);

  const healthAll = async () => {
    setChecking(true);
    try {
      const results = await apiJson('/api-tools/health-all', { method: 'POST' });
      setTools(prev => prev.map(t => { const r = results.find((x: any) => x.id === t.id); return r ? { ...t, lastHealthOk: r.ok, lastHealthMs: r.durationMs } : t; }));
    } catch {}
    setChecking(false);
  };

  const addTool = async () => {
    if (!nt.name.trim()) return;
    try {
      await apiJson('/api-tools', { method: 'POST', body: JSON.stringify(nt) });
      await loadTools();
      setNt({ name: '', category: 'api', baseUrl: '', authType: 'bearer', authKeyRef: '', healthEndpoint: '', notes: '' });
      setShowAdd(false);
    } catch (err: any) { alert(err.message); }
  };

  const deleteTool = async (id: number, name: string) => {
    if (!confirm(`Tool "${name}" verwijderen?`)) return;
    try { await apiJson(`/api-tools/${id}`, { method: 'DELETE' }); await loadTools(); }
    catch (err: any) { alert(err.message); }
  };

  const runTest = async () => {
    setTr(null);
    try {
      setTr(await apiJson('/api-tools/test', { method: 'POST', body: JSON.stringify({ method: tp.method, url: tp.url, headers: JSON.parse(tp.headers || '{}'), body: tp.body || undefined }) }));
    } catch (err: any) { setTr({ error: err.message }); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Tools & APIs</h2>
        <div className="flex gap-2">
          <button onClick={() => setShowAdd(!showAdd)} className="btn-secondary text-xs !px-3 !py-1.5"><Plus className="w-3 h-3" /> Tool</button>
          <button onClick={healthAll} disabled={checking} className="btn-secondary text-xs !px-3 !py-1.5">
            <Heart className={`w-3 h-3 ${checking ? 'animate-pulse' : ''}`} /> {checking ? 'Checken...' : 'Health All'}
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="glass rounded-xl p-4">
          <h4 className="text-sm font-semibold text-white mb-3">Nieuwe tool toevoegen</h4>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <Inp label="Naam" value={nt.name} set={v => setNt({ ...nt, name: v })} />
            <Inp label="Base URL" value={nt.baseUrl} set={v => setNt({ ...nt, baseUrl: v })} />
            <Sel label="Auth Type" value={nt.authType} set={v => setNt({ ...nt, authType: v })}
              options={[{ value: 'bearer', label: 'Bearer' }, { value: 'api-key', label: 'API Key' }, { value: 'none', label: 'None' }]} />
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <Inp label="Auth Key Ref (Settings veld)" value={nt.authKeyRef} set={v => setNt({ ...nt, authKeyRef: v })} />
            <Inp label="Health Endpoint" value={nt.healthEndpoint} set={v => setNt({ ...nt, healthEndpoint: v })} />
            <Inp label="Notities" value={nt.notes} set={v => setNt({ ...nt, notes: v })} />
          </div>
          <button onClick={addTool} className="btn-primary text-xs !px-4 !py-2">Toevoegen</button>
        </div>
      )}

      <div className="space-y-2">
        {tools.map(t => (
          <div key={t.id} className="glass rounded-xl p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${t.lastHealthOk === true ? 'bg-emerald-400' : t.lastHealthOk === false ? 'bg-red-400' : 'bg-zinc-600'}`} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{t.name}</span>
                    <Badge color="zinc" text={t.authType} />
                    {t.lastHealthOk === true && <span className="text-[10px] text-emerald-400">{t.lastHealthMs}ms</span>}
                    {t.lastHealthOk === false && <span className="text-[10px] text-red-400">offline</span>}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                    <span className="font-mono">{t.baseUrl || '(geen URL)'}</span>
                    {t.authKeyRef && <span>· key: {t.authKeyRef}</span>}
                    {t.notes && <span>· {t.notes}</span>}
                  </div>
                </div>
              </div>
              <button onClick={() => deleteTool(t.id, t.name)} className="text-zinc-600 hover:text-red-400 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
      </div>

      {/* Test Panel */}
      <div className="glass rounded-2xl p-5">
        <h3 className="text-sm font-bold text-white mb-3">API Test Panel</h3>
        <div className="grid grid-cols-[100px_1fr] gap-3 mb-3">
          <select className="input-base text-xs" value={tp.method} onChange={e => setTp({ ...tp, method: e.target.value })}>
            {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => <option key={m}>{m}</option>)}
          </select>
          <input className="input-base text-xs" placeholder="URL..." value={tp.url} onChange={e => setTp({ ...tp, url: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-[10px] text-zinc-500 mb-1 block">Headers (JSON)</label>
            <textarea className="input-base font-mono text-xs min-h-[50px]" value={tp.headers} onChange={e => setTp({ ...tp, headers: e.target.value })} />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 mb-1 block">Body</label>
            <textarea className="input-base font-mono text-xs min-h-[50px]" value={tp.body} onChange={e => setTp({ ...tp, body: e.target.value })} />
          </div>
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
// TAB 5: AI ASSISTENT
// ═══════════════════════════════════════════════

function AssistantTab() {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [convId, setConvId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [convs, setConvs] = useState<any[]>([]);

  useEffect(() => { apiJson('/assistant/conversations').then(setConvs).catch(() => {}); }, []);

  const loadConv = async (id: string) => {
    try { const d = await apiJson(`/assistant/conversations/${id}`); setMessages(d.messages); setConvId(id); } catch {}
  };

  const send = async () => {
    if (!input.trim() || sending) return;
    const msg = input.trim(); setInput('');
    setMessages(p => [...p, { role: 'user', content: msg, timestamp: new Date().toISOString() }]);
    setSending(true);
    try {
      const r = await apiJson('/assistant/chat', { method: 'POST', body: JSON.stringify({ conversationId: convId, message: msg }) });
      setConvId(r.conversationId);
      setMessages(p => [...p, { role: 'assistant', content: r.message, timestamp: new Date().toISOString() }]);
    } catch (err: any) {
      setMessages(p => [...p, { role: 'assistant', content: `Fout: ${err.message}`, timestamp: new Date().toISOString() }]);
    }
    setSending(false);
  };

  return (
    <div className="flex gap-4 h-full">
      <div className="w-44 shrink-0">
        <button onClick={() => { setMessages([]); setConvId(null); }} className="btn-secondary text-xs w-full mb-3 !py-2"><Plus className="w-3 h-3" /> Nieuw</button>
        <div className="space-y-0.5">
          {convs.map(c => (
            <button key={c.id} onClick={() => loadConv(c.id)}
              className={`w-full text-left px-2 py-1.5 rounded-lg text-[11px] truncate transition ${convId === c.id ? 'bg-brand-600/15 text-brand-300' : 'text-zinc-400 hover:bg-white/[0.04]'}`}>
              {c.title}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 flex flex-col glass rounded-2xl overflow-hidden">
        <div className="p-3 border-b border-white/[0.06] flex items-center gap-2">
          <Bot className="w-4 h-4 text-brand-400" />
          <span className="text-sm font-semibold text-white">AI Assistent</span>
          <span className="text-[10px] text-zinc-500 ml-auto">Claude Sonnet 4.5</span>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-8 text-zinc-500">
              <Bot className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-xs mb-3">Stel een vraag over de pipeline</p>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {['Pipeline status', 'Recente errors', 'Welke stappen zijn skeleton?', 'Dependencies uitleg'].map(q => (
                  <button key={q} onClick={() => setInput(q)} className="btn-secondary text-[11px] !px-2.5 !py-1">{q}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[13px] ${m.role === 'user' ? 'bg-brand-600/20 text-brand-100' : 'bg-surface-200 text-zinc-200'}`}>
                <div className="whitespace-pre-wrap">{m.content}</div>
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-surface-200 rounded-2xl px-4 py-2.5 text-[13px] text-zinc-400">
                <RefreshCw className="w-3.5 h-3.5 animate-spin inline mr-2" />Denken...
              </div>
            </div>
          )}
        </div>
        <div className="p-3 border-t border-white/[0.06]">
          <div className="flex gap-2">
            <input className="input-base text-sm" placeholder="Typ je vraag..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} />
            <button onClick={send} disabled={sending || !input.trim()} className="btn-primary !px-3"><Send className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// SHARED COMPONENTS & UTILS
// ═══════════════════════════════════════════════

function safeJson(val: any, fallback: any) {
  try { return JSON.parse(typeof val === 'string' ? val : JSON.stringify(val || fallback)); } catch { return fallback; }
}

function fmtJson(str: string) {
  try { return JSON.stringify(JSON.parse(str), null, 2); } catch { return str; }
}

function Badge({ color, text }: { color: string; text: string }) {
  const colors: Record<string, string> = {
    green: 'bg-emerald-500/15 text-emerald-300', amber: 'bg-amber-500/15 text-amber-300',
    blue: 'bg-blue-500/15 text-blue-300', purple: 'bg-purple-500/15 text-purple-300',
    brand: 'bg-brand-600/20 text-brand-300', zinc: 'bg-surface-300 text-zinc-400', red: 'bg-red-500/15 text-red-300',
  };
  return <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${colors[color] || colors.zinc}`}>{text}</span>;
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h4 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">{title}</h4><div className="space-y-2">{children}</div></div>;
}

function Inp({ label, value, set, mono }: { label: string; value: string; set: (v: string) => void; mono?: boolean }) {
  return <div><label className="text-[11px] text-zinc-500 mb-1 block">{label}</label><input className={`input-base text-xs ${mono ? 'font-mono' : ''}`} value={value} onChange={e => set(e.target.value)} /></div>;
}

function Sel({ label, value, set, options }: { label: string; value: string; set: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label className="text-[11px] text-zinc-500 mb-1 block">{label}</label>
      <select className="input-base text-xs" value={value} onChange={e => set(e.target.value)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Chk({ label, checked, set }: { label: string; checked: boolean; set: (v: boolean) => void }) {
  return <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={checked} onChange={e => set(e.target.checked)} className="rounded" /><span className="text-xs text-zinc-300">{label}</span></label>;
}

function Spinner() { return <div className="flex items-center justify-center h-64"><RefreshCw className="w-6 h-6 text-brand-400 animate-spin" /></div>; }
