import { useState, useEffect, useCallback } from 'react';
import {
  Settings2, GitBranch, Brain, Wrench, Bot, Check, X, Play,
  RefreshCw, Plus, GripVertical, Send, Trash2, TestTube, Heart, Save
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
      {/* Sidebar */}
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

      {/* Content */}
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

  const loadSteps = useCallback(async () => {
    try { setSteps(await apiJson('/pipeline-steps')); } catch (err) { console.error(err); }
    setLoading(false);
  }, []);

  useEffect(() => { loadSteps(); }, [loadSteps]);

  const saveStep = async (id: number, updates: any) => {
    try {
      const updated = await apiJson(`/pipeline-steps/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
      await loadSteps();
      if (selected?.id === id) setSelected(updated);
    } catch (err: any) { alert('Opslaan mislukt: ' + err.message); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="flex gap-6 h-full">
      <div className="w-[440px] shrink-0 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Pipeline Stappen</h2>
          <span className="text-xs text-zinc-500">{steps.length} stappen</span>
        </div>
        <div className="flex-1 overflow-auto space-y-0.5 pr-1">
          {steps.map(step => (
            <button key={step.id} onClick={() => setSelected(step)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all ${selected?.id === step.id ? 'bg-brand-600/15 border border-brand-500/30' : 'hover:bg-white/[0.04] border border-transparent'}`}>
              <GripVertical className="w-3 h-3 text-zinc-700 shrink-0" />
              <span className="w-5 text-[11px] text-zinc-500 font-mono">{step.stepNumber}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-white truncate">{step.name}</div>
                <div className="text-[10px] text-zinc-500">{step.executorLabel}{step.parallelGroup ? ` · ∥ ${step.parallelGroup}` : ''}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {step.isCheckpoint && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">CP</span>}
                <div className={`w-2 h-2 rounded-full ${step.readyToUse ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <StepDetail step={selected} onSave={saveStep} />
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

function StepDetail({ step, onSave }: { step: any; onSave: (id: number, u: any) => Promise<void> }) {
  const [f, setF] = useState(step);
  const [models, setModels] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setF(step); }, [step]);
  useEffect(() => { apiJson('/llm-models').then(setModels).catch(() => {}); }, []);

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

  const parseDeps = () => { try { return JSON.parse(typeof f.dependsOn === 'string' ? f.dependsOn : JSON.stringify(f.dependsOn || [])); } catch { return []; } };
  const parseRetries = () => { try { return JSON.parse(typeof f.retryDelays === 'string' ? f.retryDelays : JSON.stringify(f.retryDelays || [])); } catch { return []; } };

  return (
    <div className="flex-1 glass rounded-2xl p-5 overflow-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-bold text-white">Stap {f.stepNumber}: {f.name}</h3>
          {f.notes && <p className="text-[11px] text-amber-400/80 mt-0.5">{f.notes}</p>}
        </div>
        <button onClick={save} disabled={saving} className="btn-primary text-xs !px-4 !py-2">
          <Save className="w-3.5 h-3.5" />{saving ? 'Opslaan...' : 'Opslaan'}
        </button>
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
            <Inp label="Tool Primair" value={f.toolPrimary} set={v => setF({ ...f, toolPrimary: v })} />
            <Inp label="Tool Fallback" value={f.toolFallback || ''} set={v => setF({ ...f, toolFallback: v })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-zinc-500 mb-1 block">LLM Model</label>
              <select className="input-base text-xs" value={f.llmModelId || ''} onChange={e => setF({ ...f, llmModelId: e.target.value ? parseInt(e.target.value) : null })}>
                <option value="">Geen</option>
                {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <Inp label="Temperature" value={String(f.temperature)} set={v => setF({ ...f, temperature: v })} />
            <Inp label="Max Tokens" value={String(f.maxTokens || '')} set={v => setF({ ...f, maxTokens: v })} />
          </div>
          <Inp label="Output Format" value={f.outputFormat} set={v => setF({ ...f, outputFormat: v })} />
        </Sec>

        <Sec title="Pipeline Config">
          <div className="grid grid-cols-3 gap-3">
            <Inp label="Wacht op (steps)" value={parseDeps().join(', ')} set={v => setF({ ...f, dependsOn: JSON.stringify(v.split(',').map((s: string) => parseInt(s.trim())).filter((n: number) => !isNaN(n))) })} />
            <Inp label="Parallel Groep" value={f.parallelGroup || ''} set={v => setF({ ...f, parallelGroup: v })} />
            <Inp label="Checkpoint Cond." value={f.checkpointCond || ''} set={v => setF({ ...f, checkpointCond: v })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Inp label="Timeout (ms)" value={String(f.timeout)} set={v => setF({ ...f, timeout: v })} />
            <Inp label="Max Retries" value={String(f.maxRetries)} set={v => setF({ ...f, maxRetries: v })} />
            <Inp label="Retry Delays (ms)" value={parseRetries().join(', ')} set={v => setF({ ...f, retryDelays: JSON.stringify(v.split(',').map((s: string) => parseInt(s.trim())).filter((n: number) => !isNaN(n))) })} />
          </div>
        </Sec>

        <Sec title="System Prompt">
          <textarea className="input-base font-mono text-xs min-h-[150px]" value={f.systemPrompt || ''} onChange={e => setF({ ...f, systemPrompt: e.target.value })} placeholder="Geen system prompt (wordt in code afgehandeld)" />
        </Sec>

        <Sec title="User Prompt Template">
          <textarea className="input-base font-mono text-xs min-h-[100px]" value={f.userPromptTpl || ''} onChange={e => setF({ ...f, userPromptTpl: e.target.value })} placeholder="Geen template" />
          <p className="text-[10px] text-zinc-600 mt-1">Variabelen: {'{title} {description} {language} {videoType} {wordCount} {sections}'}</p>
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

const VIDEO_TYPES = ['ai', 'spokesperson_ai', 'trending', 'documentary', 'compilation', 'spokesperson'];

function VideoTypesTab() {
  const [matrix, setMatrix] = useState<Record<string, Record<number, boolean>>>({});
  const [steps, setSteps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([apiJson('/video-types/matrix'), apiJson('/pipeline-steps')])
      .then(([m, s]) => { setMatrix(m); setSteps(s); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const toggle = async (vt: string, sn: number) => {
    const cur = matrix[vt]?.[sn] ?? true;
    setMatrix(p => ({ ...p, [vt]: { ...p[vt], [sn]: !cur } }));
    try { await apiJson(`/video-types/${vt}/toggle`, { method: 'POST', body: JSON.stringify({ stepNumber: sn, enabled: !cur }) }); }
    catch { setMatrix(p => ({ ...p, [vt]: { ...p[vt], [sn]: cur } })); }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <h2 className="text-lg font-bold text-white mb-4">Video Type Routes</h2>
      <p className="text-xs text-zinc-500 mb-3">Klik op ✓/✕ om een stap aan/uit te zetten voor een video type</p>
      <div className="overflow-auto glass rounded-2xl">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="text-left px-3 py-2.5 text-zinc-400 font-medium sticky left-0 bg-surface-100/80 backdrop-blur-xl z-10 min-w-[200px]">Stap</th>
              {VIDEO_TYPES.map(vt => (
                <th key={vt} className="px-2 py-2.5 text-zinc-400 font-medium text-center min-w-[70px]">
                  <span className="text-[10px]">{vt}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {steps.map(step => (
              <tr key={step.stepNumber} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                <td className="px-3 py-1.5 sticky left-0 bg-surface-100/80 backdrop-blur-xl z-10">
                  <span className="text-zinc-500 font-mono mr-2 text-[10px]">{step.stepNumber}</span>
                  <span className="text-zinc-300 text-[12px]">{step.name}</span>
                  {!step.readyToUse && <span className="text-[9px] text-zinc-600 ml-1">(skeleton)</span>}
                </td>
                {VIDEO_TYPES.map(vt => (
                  <td key={vt} className="px-2 py-1.5 text-center">
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
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-600/20 text-brand-300">{m.provider}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-300 text-zinc-400">{m.modelType}</span>
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5 font-mono">{m.modelString}</div>
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

  useEffect(() => { apiJson('/api-tools').then(setTools).catch(() => {}).finally(() => setLoading(false)); }, []);

  const healthAll = async () => {
    setChecking(true);
    try {
      const results = await apiJson('/api-tools/health-all', { method: 'POST' });
      setTools(prev => prev.map(t => { const r = results.find((x: any) => x.id === t.id); return r ? { ...t, lastHealthOk: r.ok, lastHealthMs: r.durationMs } : t; }));
    } catch {}
    setChecking(false);
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
        <button onClick={healthAll} disabled={checking} className="btn-secondary text-xs !px-3 !py-1.5">
          <Heart className={`w-3 h-3 ${checking ? 'animate-pulse' : ''}`} /> {checking ? 'Controleren...' : 'Health Check All'}
        </button>
      </div>

      <div className="space-y-2">
        {tools.map(t => (
          <div key={t.id} className="glass rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${t.lastHealthOk === true ? 'bg-emerald-400' : t.lastHealthOk === false ? 'bg-red-400' : 'bg-zinc-600'}`} />
              <div>
                <span className="text-sm font-medium text-white">{t.name}</span>
                <span className="text-[10px] text-zinc-600 font-mono ml-2">{t.baseUrl}</span>
                <div className="text-[10px] text-zinc-500">
                  {t.authType} · {t.lastHealthOk === true ? `✅ ${t.lastHealthMs}ms` : t.lastHealthOk === false ? '❌' : '⚪'} · {t.notes}
                </div>
              </div>
            </div>
          </div>
        ))}
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
            {tr.response && <pre className="bg-surface-200 rounded-lg p-3 text-xs text-zinc-300 overflow-auto max-h-[250px] font-mono">{(() => { try { return JSON.stringify(JSON.parse(tr.response), null, 2); } catch { return tr.response; } })()}</pre>}
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

  const quickQ = ['Pipeline status', 'Recente errors', 'Welke stappen zijn skeleton?', 'Dependencies uitleg'];

  return (
    <div className="flex gap-4 h-full">
      <div className="w-44 shrink-0">
        <button onClick={() => { setMessages([]); setConvId(null); }} className="btn-secondary text-xs w-full mb-3 !py-2">
          <Plus className="w-3 h-3" /> Nieuw
        </button>
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
          <span className="text-[10px] text-zinc-500 ml-auto">Claude Sonnet 4.5 via Elevate</span>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-8 text-zinc-500">
              <Bot className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-xs mb-3">Stel een vraag over de pipeline</p>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {quickQ.map(q => <button key={q} onClick={() => setInput(q)} className="btn-secondary text-[11px] !px-2.5 !py-1">{q}</button>)}
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
// SHARED
// ═══════════════════════════════════════════════

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h4 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">{title}</h4><div className="space-y-2">{children}</div></div>;
}
function Inp({ label, value, set, mono }: { label: string; value: string; set: (v: string) => void; mono?: boolean }) {
  return <div><label className="text-[11px] text-zinc-500 mb-1 block">{label}</label><input className={`input-base text-xs ${mono ? 'font-mono' : ''}`} value={value} onChange={e => set(e.target.value)} /></div>;
}
function Chk({ label, checked, set }: { label: string; checked: boolean; set: (v: boolean) => void }) {
  return <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={checked} onChange={e => set(e.target.checked)} className="rounded" /><span className="text-xs text-zinc-300">{label}</span></label>;
}
function Spinner() { return <div className="flex items-center justify-center h-64"><RefreshCw className="w-6 h-6 text-brand-400 animate-spin" /></div>; }
