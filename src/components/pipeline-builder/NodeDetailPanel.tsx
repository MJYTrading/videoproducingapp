/**
 * NodeDetailPanel v3.1 — Dynamische config velden per stap type
 * 
 * - LLM stappen: system prompt + user prompt + LLM config
 * - API stappen: API-specifieke velden (voice_id, aspect_ratio, etc.)
 * - App stappen: app-specifieke velden (thresholds, toggles, etc.)
 */

import { useState, useEffect, useMemo } from 'react';
import { Save, X, Trash2, ArrowLeft, ArrowRight, AlertCircle } from 'lucide-react';
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

  // Parse configSchema
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

  const getConfigValue = (key: string, defaultVal: any) => {
    return f.configOverrides[key] ?? defaultVal;
  };
  const setConfigValue = (key: string, value: any) => {
    setF(prev => ({ ...prev, configOverrides: { ...prev.configOverrides, [key]: value } }));
  };

  // Resolve dynamic source options
  const getSourceOptions = (source: string): { value: string; label: string }[] => {
    switch (source) {
      case 'voices': return voices.map((v: any) => ({ value: v.voiceId || v.voice_id, label: v.name + ' — ' + v.description }));
      case 'styles': return styles.map((s: any) => ({ value: s.id, label: s.name }));
      case 'colorGrades': return colorGrades.map((c: any) => ({ value: c.id, label: c.name + ' — ' + c.description }));
      default: return [];
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiJson('/pipelines/' + pipelineId + '/nodes/' + node.id, {
        method: 'PATCH',
        body: JSON.stringify({
          isActive: f.isActive,
          isCheckpoint: f.isCheckpoint,
          timeout: f.timeout,
          maxRetries: f.maxRetries,
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
      onSave();
      onClose();
    } catch (err: any) { alert(err.message); }
  };

  // Group fields
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

        {/* Validation errors */}
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

        {/* Data Flow: Inputs */}
        <Section title={'Inputs (' + inputs.length + ')'} icon={<ArrowLeft className="w-3 h-3" />}>
          {inputs.filter(i => i.source !== 'project').map(input => {
            const conn = incomingNodes.find(c => c.targetInputKey === input.key);
            return (
              <div key={input.key} className="flex items-center gap-2 py-1">
                <div className={'w-2 h-2 rounded-full shrink-0 ' + (conn ? 'bg-emerald-400' : input.required ? 'bg-red-400' : 'bg-zinc-600')} />
                <span className="text-[11px] text-zinc-300 flex-1 truncate">{input.label}</span>
                <span className="text-[9px] text-zinc-500 shrink-0">
                  {conn ? '\u2190 ' + (conn.sourceNode?.stepDefinition?.name || '?') : input.required ? 'NIET verbonden' : 'optioneel'}
                </span>
              </div>
            );
          })}
        </Section>

        {/* Data Flow: Outputs */}
        <Section title={'Outputs (' + outputs.length + ')'} icon={<ArrowRight className="w-3 h-3" />}>
          {outputs.map(output => {
            const usedBy = outgoingNodes.filter(c => c.sourceOutputKey === output.key);
            return (
              <div key={output.key} className="py-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-[11px] text-zinc-300 flex-1">{output.label}</span>
                  <span className="text-[9px] text-zinc-600">{output.filePath}</span>
                </div>
                {usedBy.length > 0 && (
                  <div className="ml-4 mt-0.5 flex flex-wrap gap-1">
                    {usedBy.map(c => (
                      <span key={c.id} className="text-[9px] text-zinc-500">{'\u2192 ' + (c.targetNode?.stepDefinition?.name || '?')}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
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

        {/* LLM stappen: Model + Prompts */}
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
                className="input-base font-mono text-[10px] min-h-[100px]"
                placeholder="System prompt voor deze stap..."
                value={f.systemPromptOverride}
                onChange={e => setF({ ...f, systemPromptOverride: e.target.value })}
              />
              {def.systemPrompt && !f.systemPromptOverride && (
                <div className="mt-1 bg-surface-200/50 rounded p-2">
                  <p className="text-[9px] text-zinc-500">Default: {def.systemPrompt.length > 200 ? def.systemPrompt.slice(0, 200) + '...' : def.systemPrompt}</p>
                </div>
              )}
            </Section>

            <Section title="User Prompt Template">
              <textarea
                className="input-base font-mono text-[10px] min-h-[100px]"
                placeholder={'Prompt template...\nGebruik {input:key} voor data.'}
                value={f.userPromptOverride}
                onChange={e => setF({ ...f, userPromptOverride: e.target.value })}
              />
              <div className="mt-1 bg-surface-200/30 rounded p-2">
                <p className="text-[9px] text-zinc-500 mb-1">Input variabelen:</p>
                <div className="flex flex-wrap gap-1">
                  {inputs.map(i => (
                    <code key={i.key} className="text-[8px] px-1 py-0.5 rounded bg-surface-300 text-brand-300 font-mono">
                      {'{input:' + i.key + '}'}
                    </code>
                  ))}
                </div>
              </div>
            </Section>
          </>
        )}

        {/* Dynamic config fields per group */}
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
      return (
        <div>
          <label className="text-[10px] text-zinc-500 mb-0.5 block">{field.label}</label>
          <input className="input-base text-xs" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={field.description} />
        </div>
      );

    case 'number':
      return (
        <div>
          <label className="text-[10px] text-zinc-500 mb-0.5 block">{field.label}</label>
          <input className="input-base text-xs" type="number" value={value ?? field.default ?? ''} onChange={e => onChange(parseFloat(e.target.value))}
            min={field.min} max={field.max} step={field.step} />
          {field.description && <p className="text-[9px] text-zinc-600 mt-0.5">{field.description}</p>}
        </div>
      );

    case 'range':
      return (
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <label className="text-[10px] text-zinc-500">{field.label}</label>
            <span className="text-[10px] text-brand-300 font-mono">{value ?? field.default}</span>
          </div>
          <input type="range" className="w-full accent-brand-500 h-1.5"
            value={value ?? field.default ?? 0} onChange={e => onChange(parseFloat(e.target.value))}
            min={field.min ?? 0} max={field.max ?? 1} step={field.step ?? 0.1} />
          {field.description && <p className="text-[9px] text-zinc-600 mt-0.5">{field.description}</p>}
        </div>
      );

    case 'select':
      return (
        <div>
          <label className="text-[10px] text-zinc-500 mb-0.5 block">{field.label}</label>
          <select className="input-base text-xs" value={value ?? field.default ?? ''} onChange={e => onChange(e.target.value)}>
            <option value="">-- Selecteer --</option>
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {field.description && <p className="text-[9px] text-zinc-600 mt-0.5">{field.description}</p>}
        </div>
      );

    case 'toggle':
      return (
        <div className="flex items-center justify-between py-0.5">
          <div>
            <span className="text-[11px] text-zinc-300">{field.label}</span>
            {field.description && <p className="text-[9px] text-zinc-600">{field.description}</p>}
          </div>
          <button onClick={() => onChange(!(value ?? field.default))}
            className={'w-8 h-4.5 rounded-full transition-colors relative ' + ((value ?? field.default) ? 'bg-brand-500' : 'bg-zinc-700')}>
            <div className={'w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ' + ((value ?? field.default) ? 'translate-x-4' : 'translate-x-0.5')} />
          </button>
        </div>
      );

    case 'textarea':
      return (
        <div>
          <label className="text-[10px] text-zinc-500 mb-0.5 block">{field.label}</label>
          <textarea className="input-base font-mono text-[10px] min-h-[60px]" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={field.description} />
        </div>
      );

    case 'json':
      return (
        <div>
          <label className="text-[10px] text-zinc-500 mb-0.5 block">{field.label}</label>
          <textarea className="input-base font-mono text-[10px] min-h-[50px]"
            value={typeof value === 'string' ? value : JSON.stringify(value || field.default, null, 2)}
            onChange={e => onChange(e.target.value)} placeholder={field.description} />
        </div>
      );

    default:
      return null;
  }
}

// ── Utility Components ──

function Badge({ color, text }: { color: string; text: string }) {
  const c: Record<string, string> = {
    green: 'bg-emerald-500/15 text-emerald-300', amber: 'bg-amber-500/15 text-amber-300',
    purple: 'bg-purple-500/15 text-purple-300', blue: 'bg-blue-500/15 text-blue-300',
    zinc: 'bg-surface-300 text-zinc-400',
  };
  return <span className={'text-[8px] px-1.5 py-0.5 rounded-full font-medium ' + (c[color] || c.zinc)}>{text}</span>;
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        {icon && <span className="text-zinc-500">{icon}</span>}
        <h4 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">{title}</h4>
      </div>
      {children}
    </div>
  );
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
