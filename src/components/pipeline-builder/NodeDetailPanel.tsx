/**
 * NodeDetailPanel — Detail panel rechts bij klik op node
 */

import { useState, useEffect } from 'react';
import { Save, X, Trash2, Zap, ArrowLeft, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { apiJson, CATEGORY_COLORS, type PipelineNodeData, type StepInput, type StepOutput } from './types';

interface Props {
  node: PipelineNodeData;
  allNodes: PipelineNodeData[];
  pipelineId: number;
  onClose: () => void;
  onSave: () => void;
  models: any[];
  tools: any[];
}

export default function NodeDetailPanel({ node, allNodes, pipelineId, onClose, onSave, models, tools }: Props) {
  const def = node.stepDefinition;
  const inputs: StepInput[] = def.inputSchema || [];
  const outputs: StepOutput[] = def.outputSchema || [];
  const cat = CATEGORY_COLORS[def.category] || CATEGORY_COLORS.general;
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    isActive: node.isActive,
    isCheckpoint: node.isCheckpoint,
    checkpointCond: node.checkpointCond || '',
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
      checkpointCond: node.checkpointCond || '',
      timeout: node.timeout,
      maxRetries: node.maxRetries,
      llmModelOverrideId: node.llmModelOverrideId,
      systemPromptOverride: node.systemPromptOverride || '',
      userPromptOverride: node.userPromptOverride || '',
      configOverrides: node.configOverrides || {},
    });
  }, [node.id]);

  // Find connected nodes
  const incomingNodes = (node.incomingConnections || []).map(c => {
    const sourceNode = allNodes.find(n => n.id === c.sourceNodeId);
    return { ...c, sourceNode };
  });
  const outgoingNodes = (node.outgoingConnections || []).map(c => {
    const targetNode = allNodes.find(n => n.id === c.targetNodeId);
    return { ...c, targetNode };
  });

  // Check missing required inputs
  const connectedInputKeys = incomingNodes.map(c => c.targetInputKey);
  const missingInputs = inputs.filter(i => i.required && i.source !== 'project' && !connectedInputKeys.includes(i.key));

  const save = async () => {
    setSaving(true);
    try {
      await apiJson(`/pipelines/${pipelineId}/nodes/${node.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          isActive: f.isActive,
          isCheckpoint: f.isCheckpoint,
          checkpointCond: f.checkpointCond || null,
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
    if (!confirm(`Node "${def.name}" verwijderen uit deze pipeline?`)) return;
    try {
      await apiJson(`/pipelines/${pipelineId}/nodes/${node.id}`, { method: 'DELETE' });
      onSave();
      onClose();
    } catch (err: any) { alert(err.message); }
  };

  return (
    <div className="w-[380px] shrink-0 bg-surface-50/80 backdrop-blur-xl border-l border-white/[0.06] flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className={`p-4 pb-3 border-b border-white/[0.06] ${cat.bg}`}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${!def.isReady ? 'bg-amber-400' : missingInputs.length > 0 ? 'bg-red-400' : 'bg-emerald-400'}`} />
            <h3 className={`text-sm font-bold ${cat.text}`}>{def.name}</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 p-1"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-[10px] text-zinc-500">{def.description}</p>
        <div className="flex flex-wrap gap-1 mt-2">
          <Badge color={def.isReady ? 'green' : 'amber'} text={def.isReady ? 'Ready' : 'Skeleton'} />
          <Badge color="zinc" text={def.category} />
          <Badge color="zinc" text={def.executorLabel} />
          {def.outputFormat && <Badge color="zinc" text={`→ ${def.outputFormat}`} />}
          {f.isCheckpoint && <Badge color="amber" text="Checkpoint" />}
        </div>
      </div>

      {/* Content - scrollable */}
      <div className="flex-1 overflow-auto p-4 space-y-4">

        {/* Validation errors */}
        {missingInputs.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-red-300 text-[11px] font-semibold mb-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> Ontbrekende inputs
            </div>
            {missingInputs.map(i => (
              <div key={i.key} className="text-[10px] text-red-300/80 ml-5">• {i.label} ({i.key})</div>
            ))}
          </div>
        )}

        {/* Inputs */}
        <Section title={`Inputs (${inputs.length})`} icon={<ArrowLeft className="w-3 h-3" />}>
          {inputs.filter(i => i.source !== 'project').map(input => {
            const connected = incomingNodes.find(c => c.targetInputKey === input.key);
            return (
              <div key={input.key} className="flex items-center gap-2 py-1">
                <div className={`w-2 h-2 rounded-full shrink-0 ${connected ? 'bg-emerald-400' : input.required ? 'bg-red-400' : 'bg-zinc-600'}`} />
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] text-zinc-300">{input.label}</span>
                  <span className="text-[9px] text-zinc-600 ml-1">({input.key})</span>
                </div>
                {connected ? (
                  <span className="text-[9px] text-emerald-400/80 shrink-0">
                    ← {connected.sourceNode?.stepDefinition?.name || '?'}
                  </span>
                ) : (
                  <span className="text-[9px] text-zinc-600 shrink-0">
                    {input.required ? '❌ niet verbonden' : 'optioneel'}
                  </span>
                )}
              </div>
            );
          })}
          {inputs.filter(i => i.source === 'project').map(input => (
            <div key={input.key} className="flex items-center gap-2 py-1 opacity-50">
              <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
              <span className="text-[11px] text-zinc-400">{input.label}</span>
              <span className="text-[9px] text-blue-400/60 ml-auto">project data</span>
            </div>
          ))}
        </Section>

        {/* Outputs */}
        <Section title={`Outputs (${outputs.length})`} icon={<ArrowRight className="w-3 h-3" />}>
          {outputs.map(output => {
            const usedBy = outgoingNodes.filter(c => c.sourceOutputKey === output.key);
            return (
              <div key={output.key} className="py-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-[11px] text-zinc-300">{output.label}</span>
                  <span className="text-[9px] text-zinc-600 ml-auto">{output.filePath || output.type}</span>
                </div>
                {usedBy.length > 0 && (
                  <div className="ml-4 mt-0.5">
                    {usedBy.map(c => (
                      <span key={c.id} className="text-[9px] text-zinc-500 mr-2">
                        → {c.targetNode?.stepDefinition?.name || '?'}
                      </span>
                    ))}
                  </div>
                )}
                {usedBy.length === 0 && (
                  <span className="text-[9px] text-zinc-600 ml-4">⚠ niet gebruikt</span>
                )}
              </div>
            );
          })}
        </Section>

        {/* Node config */}
        <Section title="Node Configuratie">
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <Chk label="Actief" checked={f.isActive} set={v => setF({ ...f, isActive: v })} />
              <Chk label="Checkpoint" checked={f.isCheckpoint} set={v => setF({ ...f, isCheckpoint: v })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Inp label="Timeout (ms)" value={String(f.timeout)} set={v => setF({ ...f, timeout: parseInt(v) || 300000 })} />
              <Inp label="Max Retries" value={String(f.maxRetries)} set={v => setF({ ...f, maxRetries: parseInt(v) || 3 })} />
            </div>
          </div>
        </Section>

        {/* LLM Override */}
        {def.llmModelId && (
          <Section title="LLM Model Override">
            <Sel label="Model (leeg = default)" value={String(f.llmModelOverrideId || '')}
              set={v => setF({ ...f, llmModelOverrideId: v ? parseInt(v) : null })}
              options={[
                { value: '', label: `Default: ${def.llmModel?.name || 'geen'}` },
                ...models.map(m => ({ value: String(m.id), label: `${m.name} (${m.modelType})` })),
              ]} />
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Inp label="Temperature" value={String(f.configOverrides.temperature ?? def.defaultConfig?.temperature ?? 0.7)}
                set={v => setF({ ...f, configOverrides: { ...f.configOverrides, temperature: parseFloat(v) } })} />
              <Inp label="Max Tokens" value={String(f.configOverrides.maxTokens ?? def.defaultConfig?.maxTokens ?? '')}
                set={v => setF({ ...f, configOverrides: { ...f.configOverrides, maxTokens: parseInt(v) || undefined } })} />
            </div>
          </Section>
        )}

        {/* Prompt overrides */}
        {def.systemPrompt && (
          <Section title="System Prompt Override">
            <textarea
              className="input-base font-mono text-[10px] min-h-[80px]"
              placeholder={def.systemPrompt ? `Default: ${def.systemPrompt.slice(0, 100)}...` : 'Geen default'}
              value={f.systemPromptOverride}
              onChange={e => setF({ ...f, systemPromptOverride: e.target.value })}
            />
            <p className="text-[9px] text-zinc-600 mt-1">Leeg = gebruik default uit StepDefinition</p>
          </Section>
        )}

        {def.userPromptTpl && (
          <Section title="User Prompt Override">
            <textarea
              className="input-base font-mono text-[10px] min-h-[80px]"
              placeholder={def.userPromptTpl ? `Default: ${def.userPromptTpl.slice(0, 100)}...` : 'Geen default'}
              value={f.userPromptOverride}
              onChange={e => setF({ ...f, userPromptOverride: e.target.value })}
            />
            <p className="text-[9px] text-zinc-600 mt-1">
              Variabelen: {inputs.map(i => `{input:${i.key}}`).join(', ')}
            </p>
          </Section>
        )}

        {/* StepDefinition info (read-only) */}
        <Section title="Stap Definitie (read-only)">
          <div className="space-y-1 text-[10px]">
            <Info label="Slug" value={def.slug} />
            <Info label="Executor" value={`${def.executorFn}()`} />
            <Info label="Tool" value={def.toolPrimaryId ? `ID: ${def.toolPrimaryId}` : 'geen'} />
            <Info label="Fallback" value={def.toolFallbackId ? `ID: ${def.toolFallbackId}` : 'geen'} />
            {def.notes && <Info label="Notities" value={def.notes} />}
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

// ── Utility components ──

function Badge({ color, text }: { color: string; text: string }) {
  const colors: Record<string, string> = {
    green: 'bg-emerald-500/15 text-emerald-300', amber: 'bg-amber-500/15 text-amber-300',
    blue: 'bg-blue-500/15 text-blue-300', zinc: 'bg-surface-300 text-zinc-400', red: 'bg-red-500/15 text-red-300',
  };
  return <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-medium ${colors[color] || colors.zinc}`}>{text}</span>;
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
  return (
    <div>
      <label className="text-[10px] text-zinc-500 mb-0.5 block">{label}</label>
      <input className="input-base text-xs" value={value} onChange={e => set(e.target.value)} />
    </div>
  );
}

function Sel({ label, value, set, options }: { label: string; value: string; set: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label className="text-[10px] text-zinc-500 mb-0.5 block">{label}</label>
      <select className="input-base text-xs" value={value} onChange={e => set(e.target.value)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Chk({ label, checked, set }: { label: string; checked: boolean; set: (v: boolean) => void }) {
  return <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={checked} onChange={e => set(e.target.checked)} className="rounded" /><span className="text-[11px] text-zinc-300">{label}</span></label>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-zinc-500">{label}</span><span className="text-zinc-300 font-mono">{value}</span></div>;
}
