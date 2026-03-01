/**
 * NodeDetailPanel v3.3 — Met upstream data browser
 * 
 * Toont alle beschikbare data uit de hele upstream keten,
 * niet alleen directe inputs. Klikbaar om in prompts te plakken.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { Save, X, Trash2, ArrowLeft, ArrowRight, AlertCircle, Database } from 'lucide-react';
import { apiJson, CATEGORY_COLORS, type PipelineNodeData, type StepInput, type StepOutput } from './types';

interface ConfigField {
  key: string;
  type: 'text' | 'number' | 'range' | 'select' | 'toggle' | 'textarea' | 'json';
  label: string;
  description?: string;
  default?: any;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  source?: string;
  required?: boolean;
  group?: string;
}

interface ConfigSchema {
  stepType: 'llm' | 'api' | 'app';
  fields: ConfigField[];
}

interface UpstreamData {
  nodeId: number;
  nodeName: string;
  category: string;
  outputKey: string;
  outputLabel: string;
  outputType: string;
  filePath: string;
  depth: number; // how many hops upstream
}

interface Props {
  node: PipelineNodeData;
  allNodes: PipelineNodeData[];
  pipelineId: number;
  onClose: () => void;
  onSave: () => void;
  models: any[];
  tools: any[];
  voices: any[];
  styles: any[];
  colorGrades: any[];
}

export default function NodeDetailPanel({ node, allNodes, pipelineId, onClose, onSave, models, tools, voices, styles, colorGrades }: Props) {
  const def = node.stepDefinition;
  const inputs: StepInput[] = def.inputSchema || [];
  const outputs: StepOutput[] = def.outputSchema || [];
  const cat = CATEGORY_COLORS[def.category] || CATEGORY_COLORS.general;
  const [saving, setSaving] = useState(false);
  const systemPromptRef = useRef<HTMLTextAreaElement>(null);
  const userPromptRef = useRef<HTMLTextAreaElement>(null);

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
      isActive: node.isActive,
      isCheckpoint: node.isCheckpoint,
      timeout: node.timeout,
      maxRetries: node.maxRetries,
      llmModelOverrideId: node.llmModelOverrideId,
      systemPromptOverride: node.systemPromptOverride || '',
      userPromptOverride: node.userPromptOverride || '',
      configOverrides: node.configOverrides || {},
    });
  }, [node.id]);

  const incomingNodes = (node.incomingConnections || []).map(c => {
    const sourceNode = allNodes.find(n => n.id === c.sourceNodeId);
    return { ...c, sourceNode };
  });
  const outgoingNodes = (node.outgoingConnections || []).map(c => {
    const targetNode = allNodes.find(n => n.id === c.targetNodeId);
    return { ...c, targetNode };
  });

  const connectedInputKeys = incomingNodes.map(c => c.targetInputKey);
  const missingInputs = inputs.filter(i => i.required && i.source !== 'project' && !connectedInputKeys.includes(i.key));

  // ═══ UPSTREAM DATA BROWSER ═══
  // Walk the entire upstream chain to find all available data
  const upstreamData: UpstreamData[] = useMemo(() => {
    const result: UpstreamData[] = [];
    const visited = new Set<number>();
    const seenKeys = new Set<string>();

    function walkUpstream(nodeId: number, depth: number) {
      if (visited.has(nodeId) || depth > 20) return;
      visited.add(nodeId);

      const n = allNodes.find(x => x.id === nodeId);
      if (!n) return;

      // Add all outputs of this upstream node
      const nodeOutputs: StepOutput[] = n.stepDefinition.outputSchema || [];
      for (const out of nodeOutputs) {
        if (!seenKeys.has(out.key)) {
          seenKeys.add(out.key);
          result.push({
            nodeId: n.id,
            nodeName: n.stepDefinition.name,
            category: n.stepDefinition.category,
            outputKey: out.key,
            outputLabel: out.label,
            outputType: out.type,
            filePath: out.filePath || '',
            depth,
          });
        }
      }

      // Walk further upstream
      const incoming = n.incomingConnections || [];
      for (const conn of incoming) {
        walkUpstream(conn.sourceNodeId, depth + 1);
      }
    }

    // Start from all direct upstream nodes
    for (const conn of (node.incomingConnections || [])) {
      walkUpstream(conn.sourceNodeId, 1);
    }

    // Sort: closest first, then alphabetically
    result.sort((a, b) => a.depth - b.depth || a.outputKey.localeCompare(b.outputKey));
    return result;
  }, [node, allNodes]);

  // Insert variable tag into active prompt textarea
  const insertVariable = (key: string) => {
    const tag = '{upstream:' + key + '}';
    const ref = userPromptRef.current;
    if (ref) {
      const start = ref.selectionStart;
      const end = ref.selectionEnd;
      const val = f.userPromptOverride;
      const newVal = val.slice(0, start) + tag + val.slice(end);
      setF(prev => ({ ...prev, userPromptOverride: newVal }));
      setTimeout(() => {
        ref.selectionStart = ref.selectionEnd = start + tag.length;
        ref.focus();
      }, 10);
    } else {
      setF(prev => ({ ...prev, userPromptOverride: prev.userPromptOverride + ' ' + tag }));
    }
  };

  const getConfigValue = (key: string, defaultVal: any) => f.configOverrides[key] ?? defaultVal;
  const setConfigValue = (key: string, value: any) => {
    setF(prev => ({ ...prev, configOverrides: { ...prev.configOverrides, [key]: value } }));
  };

  const getSourceOptions = (source: string): { value: string; label: string }[] => {
    switch (source) {
      case 'voices': return voices.map((v: any) => ({ value: v.voiceId || v.voice_id, label: v.name + ' \u2014 ' + v.description }));
      case 'styles': return styles.map((s: any) => ({ value: s.id, label: s.name }));
      case 'colorGrades': return colorGrades.map((c: any) => ({ value: c.id, label: c.name + ' \u2014 ' + c.description }));
      default: return [];
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiJson('/pipelines/' + pipelineId + '/nodes/' + node.id, {
        method: 'PATCH',
        body: JSON.stringify({
          isActive: f.isActive, isCheckpoint: f.isCheckpoint, timeout: f.timeout, maxRetries: f.maxRetries,
          llmModelOverrideId: f.llmModelOverrideId || null,
          systemPromptOverride: f.systemPromptOverride || null,
          userPromptOverride: f.userPromptOverride || null,
          configOverrides: f.configOverrides,
        }),
      });
      onSave();
    } catch (err: any) { alert('Opslaan mislukt: ' + err.message); }
    setSaving(false);
  };

  const deleteNode = async () => {
    if (!confirm('Node "' + def.name + '" verwijderen?')) return;
    try {
      await apiJson('/pipelines/' + pipelineId + '/nodes/' + node.id, { method: 'DELETE' });
      onSave(); onClose();
    } catch (err: any) { alert(err.message); }
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
    <div className="w-[340px] shrink-0 bg-surface-50/80 backdrop-blur-xl border-l border-white/[0.06] flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className={'p-4 pb-3 border-b border-white/[0.06] ' + cat.bg}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className={'w-2.5 h-2.5 rounded-full ' + (!def.isReady ? 'bg-amber-400' : missingInputs.length > 0 ? 'bg-red-400' : 'bg-emerald-400')} />
            <h3 className={'text-sm font-bold ' + cat.text}>{def.name}</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 p-1"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-[10px] text-zinc-500">{def.description}</p>
        <div className="flex flex-wrap gap-1 mt-2">
          <Badge color={def.isReady ? 'green' : 'amber'} text={def.isReady ? 'Ready' : 'Skeleton'} />
          <Badge color={isLLM ? 'purple' : configSchema.stepType === 'api' ? 'blue' : 'zinc'} text={configSchema.stepType.toUpperCase()} />
          <Badge color="zinc" text={def.executorLabel} />
          {f.isCheckpoint && <Badge color="amber" text="Checkpoint" />}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">

        {missingInputs.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-red-300 text-[11px] font-semibold mb-1">
              <AlertCircle className="w-3.5 h-3.5" /> Ontbrekende inputs
            </div>
            {missingInputs.map(i => (
              <div key={i.key} className="text-[10px] text-red-300/80 ml-5">- {i.label}</div>
            ))}
          </div>
        )}

        {/* Direct connections */}
        <Section title={'Verbindingen (' + (incomingNodes.length + outgoingNodes.length) + ')'}>
          {incomingNodes.length > 0 && (
            <div className="mb-2">
              <p className="text-[9px] text-zinc-500 mb-1">Inkomend:</p>
              {incomingNodes.map(c => (
                <div key={c.id} className="flex items-center gap-1.5 py-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span className="text-[10px] text-zinc-300">{c.sourceNode?.stepDefinition?.name}</span>
                  <span className="text-[8px] text-zinc-600 font-mono">[{c.sourceOutputKey}]</span>
                </div>
              ))}
            </div>
          )}
          {outgoingNodes.length > 0 && (
            <div>
              <p className="text-[9px] text-zinc-500 mb-1">Uitgaand:</p>
              {outgoingNodes.map(c => (
                <div key={c.id} className="flex items-center gap-1.5 py-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[10px] text-zinc-300">{c.targetNode?.stepDefinition?.name}</span>
                  <span className="text-[8px] text-zinc-600 font-mono">[{c.targetInputKey}]</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Execution config */}
        <Section title="Uitvoering">
          <div className="flex items-center gap-4 mb-2">
            <Chk label="Actief" checked={f.isActive} set={v => setF({ ...f, isActive: v })} />
            <Chk label="Checkpoint" checked={f.isCheckpoint} set={v => setF({ ...f, isCheckpoint: v })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Inp label="Timeout (ms)" value={String(f.timeout)} set={v => setF({ ...f, timeout: parseInt(v) || 300000 })} />
            <Inp label="Max Retries" value={String(f.maxRetries)} set={v => setF({ ...f, maxRetries: parseInt(v) || 3 })} />
          </div>
        </Section>

        {/* LLM: Model + Prompts */}
        {isLLM && (
          <>
            <Section title="LLM Model">
              <Sel label="Model" value={String(f.llmModelOverrideId || '')}
                set={v => setF({ ...f, llmModelOverrideId: v ? parseInt(v) : null })}
                options={[
                  { value: '', label: def.llmModel ? 'Default: ' + def.llmModel.name : '-- Selecteer --' },
                  ...models.map(m => ({ value: String(m.id), label: m.name + ' (' + m.provider + ')' })),
                ]} />
            </Section>

            <Section title="System Prompt">
              <textarea
                ref={systemPromptRef}
                className="input-base font-mono text-[10px] min-h-[100px]"
                placeholder="System prompt voor deze stap..."
                value={f.systemPromptOverride}
                onChange={e => setF({ ...f, systemPromptOverride: e.target.value })}
              />
              {def.systemPrompt && !f.systemPromptOverride && (
                <div className="mt-1 bg-surface-200/50 rounded p-2">
                  <p className="text-[9px] text-zinc-400 font-mono whitespace-pre-wrap max-h-[50px] overflow-auto">
                    {def.systemPrompt.length > 200 ? def.systemPrompt.slice(0, 200) + '...' : def.systemPrompt}
                  </p>
                </div>
              )}
            </Section>

            <Section title="User Prompt Template">
              <textarea
                ref={userPromptRef}
                className="input-base font-mono text-[10px] min-h-[100px]"
                placeholder={'Prompt template...\nKlik op variabelen hieronder om in te voegen.'}
                value={f.userPromptOverride}
                onChange={e => setF({ ...f, userPromptOverride: e.target.value })}
              />
            </Section>

            {/* ═══ UPSTREAM DATA BROWSER ═══ */}
            <Section title={'Beschikbare Data (' + upstreamData.length + ')'} icon={<Database className="w-3 h-3" />}>
              <p className="text-[9px] text-zinc-500 mb-2">
                Klik om in te voegen in de user prompt. Alle data van upstream nodes is beschikbaar.
              </p>
              {upstreamData.length === 0 && (
                <p className="text-[9px] text-zinc-600">Geen upstream data gevonden. Verbind eerst nodes.</p>
              )}
              {/* Group by source node */}
              {(() => {
                const byNode: Record<number, UpstreamData[]> = {};
                for (const d of upstreamData) {
                  if (!byNode[d.nodeId]) byNode[d.nodeId] = [];
                  byNode[d.nodeId].push(d);
                }
                return Object.entries(byNode).map(([nodeId, items]) => {
                  const catColor = CATEGORY_COLORS[items[0].category] || CATEGORY_COLORS.general;
                  return (
                    <div key={nodeId} className="mb-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className={'w-1.5 h-1.5 rounded-full ' + catColor.dot} />
                        <span className={'text-[9px] font-semibold ' + catColor.text}>{items[0].nodeName}</span>
                        <span className="text-[8px] text-zinc-600">({items[0].depth} stap{'pen'.slice(0, items[0].depth > 1 ? 3 : 0)} terug)</span>
                      </div>
                      <div className="ml-3 flex flex-wrap gap-1">
                        {items.map(d => (
                          <button key={d.outputKey} onClick={() => insertVariable(d.outputKey)}
                            className="text-[8px] px-1.5 py-0.5 rounded bg-surface-300 text-brand-300 font-mono hover:bg-brand-600/20 hover:text-brand-200 transition cursor-pointer"
                            title={d.outputLabel + ' (' + d.outputType + ') \u2014 ' + d.filePath}>
                            {'{upstream:' + d.outputKey + '}'}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                });
              })()}

              {/* Also show direct input variables */}
              {inputs.filter(i => i.source !== 'project').length > 0 && (
                <div className="mt-3 pt-2 border-t border-white/[0.04]">
                  <p className="text-[9px] text-zinc-500 mb-1">Directe inputs (verbonden):</p>
                  <div className="flex flex-wrap gap-1">
                    {inputs.filter(i => i.source !== 'project').map(i => (
                      <button key={i.key} onClick={() => insertVariable(i.key)}
                        className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-mono hover:bg-emerald-500/20 transition cursor-pointer">
                        {'{input:' + i.key + '}'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Section>
          </>
        )}

        {/* Dynamic config fields */}
        {Object.entries(groupedFields).map(([groupName, fields]) => (
          <Section key={groupName} title={groupName}>
            <div className="space-y-2.5">
              {fields.map(field => (
                <DynamicField
                  key={field.key}
                  field={field}
                  value={getConfigValue(field.key, field.default)}
                  onChange={v => setConfigValue(field.key, v)}
                  sourceOptions={field.source ? getSourceOptions(field.source) : undefined}
                />
              ))}
            </div>
          </Section>
        ))}

        {/* Step info */}
        <Section title="Stap Info">
          <div className="space-y-1 text-[10px]">
            <Info label="Slug" value={def.slug} />
            <Info label="Executor" value={def.executorFn + '()'} />
            <Info label="Type" value={configSchema.stepType} />
          </div>
        </Section>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-white/[0.06] flex items-center justify-between">
        <button onClick={deleteNode} className="text-zinc-600 hover:text-red-400 p-1.5"><Trash2 className="w-4 h-4" /></button>
        <button onClick={save} disabled={saving} className="btn-primary text-xs !px-4 !py-2">
          <Save className="w-3.5 h-3.5" />{saving ? 'Opslaan...' : 'Opslaan'}
        </button>
      </div>
    </div>
  );
}

// ── Dynamic Field Renderer ──

function DynamicField({ field, value, onChange, sourceOptions }: {
  field: ConfigField; value: any; onChange: (v: any) => void; sourceOptions?: { value: string; label: string }[];
}) {
  const options = sourceOptions || field.options || [];
  switch (field.type) {
    case 'text':
      return <div><label className="text-[10px] text-zinc-500 mb-0.5 block">{field.label}</label><input className="input-base text-xs" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={field.description} /></div>;
    case 'number':
      return <div><label className="text-[10px] text-zinc-500 mb-0.5 block">{field.label}</label><input className="input-base text-xs" type="number" value={value ?? field.default ?? ''} onChange={e => onChange(parseFloat(e.target.value))} min={field.min} max={field.max} step={field.step} />{field.description && <p className="text-[9px] text-zinc-600 mt-0.5">{field.description}</p>}</div>;
    case 'range':
      return <div><div className="flex items-center justify-between mb-0.5"><label className="text-[10px] text-zinc-500">{field.label}</label><span className="text-[10px] text-brand-300 font-mono">{value ?? field.default}</span></div><input type="range" className="w-full accent-brand-500 h-1.5" value={value ?? field.default ?? 0} onChange={e => onChange(parseFloat(e.target.value))} min={field.min ?? 0} max={field.max ?? 1} step={field.step ?? 0.1} /></div>;
    case 'select':
      return <div><label className="text-[10px] text-zinc-500 mb-0.5 block">{field.label}</label><select className="input-base text-xs" value={value ?? field.default ?? ''} onChange={e => onChange(e.target.value)}><option value="">-- Selecteer --</option>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>;
    case 'toggle':
      return <div className="flex items-center justify-between py-0.5"><div><span className="text-[11px] text-zinc-300">{field.label}</span>{field.description && <p className="text-[9px] text-zinc-600">{field.description}</p>}</div><button onClick={() => onChange(!(value ?? field.default))} className={'w-8 h-4.5 rounded-full transition-colors relative ' + ((value ?? field.default) ? 'bg-brand-500' : 'bg-zinc-700')}><div className={'w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ' + ((value ?? field.default) ? 'translate-x-4' : 'translate-x-0.5')} /></button></div>;
    case 'textarea':
      return <div><label className="text-[10px] text-zinc-500 mb-0.5 block">{field.label}</label><textarea className="input-base font-mono text-[10px] min-h-[60px]" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={field.description} /></div>;
    case 'json':
      return <div><label className="text-[10px] text-zinc-500 mb-0.5 block">{field.label}</label><textarea className="input-base font-mono text-[10px] min-h-[50px]" value={typeof value === 'string' ? value : JSON.stringify(value || field.default, null, 2)} onChange={e => onChange(e.target.value)} /></div>;
    default: return null;
  }
}

// ── Utility Components ──

function Badge({ color, text }: { color: string; text: string }) {
  const c: Record<string, string> = { green: 'bg-emerald-500/15 text-emerald-300', amber: 'bg-amber-500/15 text-amber-300', purple: 'bg-purple-500/15 text-purple-300', blue: 'bg-blue-500/15 text-blue-300', zinc: 'bg-surface-300 text-zinc-400' };
  return <span className={'text-[8px] px-1.5 py-0.5 rounded-full font-medium ' + (c[color] || c.zinc)}>{text}</span>;
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return <div><div className="flex items-center gap-1.5 mb-2">{icon && <span className="text-zinc-500">{icon}</span>}<h4 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">{title}</h4></div>{children}</div>;
}

function Inp({ label, value, set }: { label: string; value: string; set: (v: string) => void }) {
  return <div><label className="text-[10px] text-zinc-500 mb-0.5 block">{label}</label><input className="input-base text-xs" value={value} onChange={e => set(e.target.value)} /></div>;
}

function Sel({ label, value, set, options }: { label: string; value: string; set: (v: string) => void; options: { value: string; label: string }[] }) {
  return <div><label className="text-[10px] text-zinc-500 mb-0.5 block">{label}</label><select className="input-base text-xs" value={value} onChange={e => set(e.target.value)}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>;
}

function Chk({ label, checked, set }: { label: string; checked: boolean; set: (v: boolean) => void }) {
  return <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={checked} onChange={e => set(e.target.checked)} className="rounded" /><span className="text-[11px] text-zinc-300">{label}</span></label>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-zinc-500 text-[10px]">{label}</span><span className="text-zinc-300 font-mono text-[10px]">{value}</span></div>;
}
