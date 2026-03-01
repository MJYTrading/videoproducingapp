import { useState, useEffect, useCallback } from 'react';
import {
  Settings2, GitBranch, Brain, Wrench, Bot, Check, X, Play,
  RefreshCw, Plus, GripVertical, Send, Trash2, TestTube, Heart, Save,
  ChevronDown, ChevronRight, ArrowRight, Copy,
} from 'lucide-react';
import PipelineCanvas from '../components/pipeline-builder/PipelineCanvas';
import { apiJson } from '../components/pipeline-builder/types';

// Re-export for backward compat
const API = '/api/admin';
async function legacyApiJson(path: string, options: RequestInit = {}) {
  return apiJson(path, options);
}

// ═══════════════════════════════════════════════
// HOOFD PAGINA
// ═══════════════════════════════════════════════

const TABS = [
  { id: 'builder', label: 'Pipeline Builder', icon: GitBranch },
  { id: 'definitions', label: 'Stap Definities', icon: Settings2 },
  { id: 'models', label: 'LLM Modellen', icon: Brain },
  { id: 'tools', label: 'Tools & APIs', icon: Wrench },
  { id: 'assistant', label: 'AI Assistent', icon: Bot },
] as const;

type TabId = typeof TABS[number]['id'];

export default function PipelineAdminPage() {
  const [activeTab, setActiveTab] = useState<TabId>('builder');

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden -m-6 -mt-4">
      <div className="w-52 shrink-0 bg-surface-50/60 backdrop-blur-xl border-r border-white/[0.06] flex flex-col">
        <div className="p-4 pb-3">
          <h1 className="text-base font-bold text-white">Pipeline Admin</h1>
          <p className="text-[10px] text-zinc-500 mt-0.5">v3.0 — Visual Builder</p>
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
        {activeTab === 'assistant' && <div className="overflow-auto h-full p-6"><AssistantTab /></div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// TAB 1: PIPELINE BUILDER (NIEUW)
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
      {/* Pipeline selector bar */}
      <div className="shrink-0 px-4 py-2 border-b border-white/[0.06] flex items-center gap-2 bg-surface-50/40">
        <span className="text-[11px] text-zinc-500 font-medium">Pipeline:</span>
        <div className="flex gap-1">
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

      {/* Duplicate form */}
      {showDuplicate && (
        <div className="shrink-0 px-4 py-2 border-b border-white/[0.06] flex items-center gap-2 bg-surface-100/40">
          <input className="input-base text-xs !w-40" placeholder="Naam..." value={dupName} onChange={e => setDupName(e.target.value)} />
          <input className="input-base text-xs !w-32" placeholder="slug..." value={dupSlug} onChange={e => setDupSlug(e.target.value)} />
          <button onClick={duplicatePipeline} className="btn-primary text-xs !px-3 !py-1">Maak kopie</button>
          <button onClick={() => setShowDuplicate(false)} className="text-zinc-500 hover:text-zinc-300"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 overflow-hidden">
        {selectedPipelineId ? (
          <PipelineCanvas key={selectedPipelineId} pipelineId={selectedPipelineId} />
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-500">Selecteer een pipeline</div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// TAB 2: STEP DEFINITIES (was Pipeline Stappen)
// ═══════════════════════════════════════════════

function DefinitionsTab() {
  const [defs, setDefs] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { legacyApiJson('/step-definitions').then(setDefs).catch(() => {}).finally(() => setLoading(false)); }, []);

  if (loading) return <Spinner />;

  return (
    <div className="flex gap-6 h-full">
      <div className="w-[380px] shrink-0 flex flex-col">
        <h2 className="text-lg font-bold text-white mb-3">Step Definities ({defs.length})</h2>
        <div className="flex-1 overflow-auto space-y-0.5 pr-1">
          {defs.map(def => (
            <button key={def.id} onClick={() => setSelected(def)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all ${selected?.id === def.id ? 'bg-brand-600/15 border border-brand-500/30' : 'hover:bg-white/[0.04] border border-transparent'}`}>
              <div className={`w-2 h-2 rounded-full shrink-0 ${def.isReady ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-white truncate">{def.name}</div>
                <div className="text-[10px] text-zinc-500">{def.category} · {def.executorLabel}</div>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-zinc-600">{def.inputSchema.length}→{def.outputSchema.length}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <div className="flex-1 glass rounded-2xl p-5 overflow-auto">
          <h3 className="text-base font-bold text-white mb-1">{selected.name}</h3>
          <p className="text-xs text-zinc-500 mb-4">{selected.description}</p>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-surface-200/50 rounded-lg p-3">
              <h4 className="text-[10px] text-zinc-500 font-semibold uppercase mb-2">Inputs</h4>
              {selected.inputSchema.map((i: any) => (
                <div key={i.key} className="text-[11px] py-0.5">
                  <span className={i.required ? 'text-zinc-200' : 'text-zinc-500'}>{i.label}</span>
                  <span className="text-zinc-600 ml-1 font-mono text-[9px]">{i.key}</span>
                  {i.required && <span className="text-red-400 ml-1 text-[9px]">*</span>}
                </div>
              ))}
            </div>
            <div className="bg-surface-200/50 rounded-lg p-3">
              <h4 className="text-[10px] text-zinc-500 font-semibold uppercase mb-2">Outputs</h4>
              {selected.outputSchema.map((o: any) => (
                <div key={o.key} className="text-[11px] py-0.5">
                  <span className="text-zinc-200">{o.label}</span>
                  <span className="text-zinc-600 ml-1 font-mono text-[9px]">{o.filePath}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2 text-[11px]">
            <InfoRow label="Slug" value={selected.slug} />
            <InfoRow label="Category" value={selected.category} />
            <InfoRow label="Executor" value={`${selected.executorFn}()`} />
            <InfoRow label="Executor Label" value={selected.executorLabel} />
            <InfoRow label="Output Format" value={selected.outputFormat || 'n.v.t.'} />
            <InfoRow label="LLM Model" value={selected.llmModel?.name || 'geen'} />
            <InfoRow label="Status" value={selected.isReady ? '✅ Ready' : '⚠️ Skeleton'} />
            {selected.notes && <InfoRow label="Notities" value={selected.notes} />}
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
                {testResult.error ? `❌ ${testResult.error}` : `✅ ${testResult.content} (${testResult.durationMs}ms)`}
              </div>
            )}
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

  useEffect(() => { legacyApiJson('/api-tools').then(setTools).catch(() => {}).finally(() => setLoading(false)); }, []);

  const healthAll = async () => {
    setChecking(true);
    try { const results = await legacyApiJson('/api-tools/health-all', { method: 'POST' }); setTools(prev => prev.map(t => { const r = results.find((x: any) => x.id === t.id); return r ? { ...t, lastHealthOk: r.ok, lastHealthMs: r.durationMs } : t; })); } catch {}
    setChecking(false);
  };

  const runTest = async () => {
    setTr(null);
    try { setTr(await legacyApiJson('/api-tools/test', { method: 'POST', body: JSON.stringify({ method: tp.method, url: tp.url, headers: JSON.parse(tp.headers || '{}'), body: tp.body || undefined }) })); }
    catch (err: any) { setTr({ error: err.message }); }
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
        {tools.map(t => (
          <div key={t.id} className="glass rounded-xl p-3 flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${t.lastHealthOk === true ? 'bg-emerald-400' : t.lastHealthOk === false ? 'bg-red-400' : 'bg-zinc-600'}`} />
            <div className="flex-1">
              <span className="text-sm font-medium text-white">{t.name}</span>
              <span className="text-[10px] text-zinc-500 ml-2">{t.baseUrl || '(geen URL)'}</span>
              {t.lastHealthMs && <span className="text-[10px] text-emerald-400 ml-2">{t.lastHealthMs}ms</span>}
            </div>
            <Badge color="zinc" text={t.authType} />
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
// TAB 5: AI ASSISTENT
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
            <div className="text-center py-8 text-zinc-500">
              <Bot className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-xs">Stel een vraag over de pipeline</p>
            </div>
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
