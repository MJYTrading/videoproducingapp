/**
 * PipelineNode — Custom React Flow node
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertCircle, CheckCircle2, Pause, Zap } from 'lucide-react';
import { CATEGORY_COLORS, type StepInput, type StepOutput } from './types';

interface PipelineNodePayload {
  label: string;
  stepDefinition: any;
  nodeData: any;
  isSelected: boolean;
  validation: { errors: string[]; warnings: string[] };
}

function PipelineFlowNode({ data, selected }: NodeProps & { data: PipelineNodePayload }) {
  const def = data.stepDefinition;
  const node = data.nodeData;
  const inputs: StepInput[] = def?.inputSchema || [];
  const outputs: StepOutput[] = def?.outputSchema || [];
  const cat = CATEGORY_COLORS[def?.category] || CATEGORY_COLORS.general;
  const hasErrors = data.validation?.errors?.length > 0;
  const hasWarnings = data.validation?.warnings?.length > 0;
  const isSkeleton = !def?.isReady;

  return (
    <div className={`rounded-xl border-2 min-w-[200px] max-w-[240px] shadow-lg transition-all
      ${selected ? 'border-brand-400 shadow-brand-500/20 scale-[1.02]' : hasErrors ? 'border-red-500/60' : isSkeleton ? 'border-amber-500/40' : cat.border}
      ${node?.isActive === false ? 'opacity-40' : ''}
      bg-surface-100`}>
      
      {/* Header */}
      <div className={`px-3 py-2 rounded-t-[10px] flex items-center gap-2 ${cat.bg}`}>
        <div className={`w-2 h-2 rounded-full shrink-0 ${hasErrors ? 'bg-red-400' : isSkeleton ? 'bg-amber-400' : 'bg-emerald-400'}`} />
        <span className={`text-[11px] font-semibold truncate flex-1 ${cat.text}`}>{def?.name || 'Onbekend'}</span>
        <div className="flex items-center gap-0.5 shrink-0">
          {node?.isCheckpoint && <Pause className="w-3 h-3 text-amber-400" />}
          {hasErrors && <AlertCircle className="w-3 h-3 text-red-400" />}
          {!hasErrors && !isSkeleton && <CheckCircle2 className="w-3 h-3 text-emerald-400/60" />}
        </div>
      </div>

      {/* Inputs */}
      {inputs.length > 0 && (
        <div className="px-1.5 py-1 border-b border-white/[0.04]">
          {inputs.filter(i => i.source !== 'project').map((input, idx) => (
            <div key={input.key} className="relative flex items-center gap-1.5 py-0.5 pr-2">
              <Handle
                type="target"
                position={Position.Left}
                id={input.key}
                className="!w-2.5 !h-2.5 !border-2 !border-surface-100 !bg-zinc-500 hover:!bg-brand-400 !-left-[7px]"
                style={{ top: 'auto' }}
              />
              <span className={`text-[9px] truncate ${input.required ? 'text-zinc-400' : 'text-zinc-600'}`}>
                {input.required && <span className="text-red-400 mr-0.5">*</span>}
                {input.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Body — compact info */}
      <div className="px-3 py-1.5">
        <div className="flex items-center gap-1.5 text-[9px] text-zinc-500">
          <Zap className="w-2.5 h-2.5" />
          <span className="truncate">{def?.executorLabel || 'App'}</span>
          {node?.timeout && <span>· {Math.round(node.timeout / 1000)}s</span>}
        </div>
        {def?.llmModel && (
          <div className="text-[9px] text-purple-400/60 truncate mt-0.5">
            {def.llmModel.name}
          </div>
        )}
      </div>

      {/* Outputs */}
      {outputs.length > 0 && (
        <div className="px-1.5 py-1 border-t border-white/[0.04]">
          {outputs.map((output, idx) => (
            <div key={output.key} className="relative flex items-center justify-end gap-1.5 py-0.5 pl-2">
              <span className="text-[9px] text-zinc-500 truncate">{output.label}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={output.key}
                className="!w-2.5 !h-2.5 !border-2 !border-surface-100 !bg-emerald-500 hover:!bg-emerald-300 !-right-[7px]"
                style={{ top: 'auto' }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Skeleton badge */}
      {isSkeleton && (
        <div className="px-3 py-1 bg-amber-500/10 rounded-b-[10px]">
          <span className="text-[8px] text-amber-400 font-bold uppercase">Skeleton — niet gebouwd</span>
        </div>
      )}
    </div>
  );
}

export default memo(PipelineFlowNode);
