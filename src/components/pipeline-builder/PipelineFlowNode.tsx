/**
 * PipelineNode — Custom React Flow node with centered handles
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
  const isSkeleton = !def?.isReady;
  const nonProjectInputs = inputs.filter(i => i.source !== 'project');

  return (
    <div className={`rounded-xl border-2 min-w-[190px] max-w-[220px] shadow-lg transition-all
      ${selected ? 'border-brand-400 shadow-brand-500/20 scale-[1.02]' : hasErrors ? 'border-red-500/60' : isSkeleton ? 'border-amber-500/40' : cat.border}
      ${node?.isActive === false ? 'opacity-40' : ''}
      bg-surface-100 relative`}>

      {/* Single centered input handle (left) */}
      {nonProjectInputs.length > 0 && (
        <Handle
          type="target"
          position={Position.Left}
          id="input"
          className="!w-3 !h-3 !border-2 !border-surface-100 !bg-zinc-500 hover:!bg-brand-400 !-left-[8px]"
          style={{ top: '50%' }}
        />
      )}

      {/* Single centered output handle (right) */}
      {outputs.length > 0 && (
        <Handle
          type="source"
          position={Position.Right}
          id="output"
          className="!w-3 !h-3 !border-2 !border-surface-100 !bg-emerald-500 hover:!bg-emerald-300 !-right-[8px]"
          style={{ top: '50%' }}
        />
      )}

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

      {/* Body */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-1.5 text-[9px] text-zinc-500">
          <Zap className="w-2.5 h-2.5" />
          <span className="truncate">{def?.executorLabel || 'App'}</span>
        </div>
        {def?.llmModel && (
          <div className="text-[9px] text-purple-400/60 truncate mt-0.5">
            {def.llmModel.name}
          </div>
        )}
        {/* Compact I/O summary */}
        <div className="flex items-center justify-between mt-1.5 text-[8px]">
          <span className="text-zinc-600">{nonProjectInputs.length} in</span>
          <span className="text-zinc-700">{'-->'}</span>
          <span className="text-zinc-600">{outputs.length} out</span>
        </div>
      </div>

      {/* Skeleton badge */}
      {isSkeleton && (
        <div className="px-3 py-1 bg-amber-500/10 rounded-b-[10px]">
          <span className="text-[8px] text-amber-400 font-bold uppercase">Skeleton</span>
        </div>
      )}
    </div>
  );
}

export default memo(PipelineFlowNode);
