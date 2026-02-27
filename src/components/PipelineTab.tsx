import { useState } from 'react';
import { ChevronDown, ChevronUp, RotateCcw, SkipForward, Bot, CheckCircle, X } from 'lucide-react';
import { Project, Step, StepStatus } from '../types';
import { useStore } from '../store';
import ReviewPanel from './ReviewPanel';
import ImageReviewPanel from './ImageReviewPanel';

interface PipelineTabProps {
  project: Project;
}

export default function PipelineTab({ project }: PipelineTabProps) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [aiContext, setAiContext] = useState<{ [key: number]: string }>({});
  const [showAiPanel, setShowAiPanel] = useState<{ [key: number]: boolean }>({});
  const [aiThinking, setAiThinking] = useState<{ [key: number]: boolean }>({});
  const [aiResponse, setAiResponse] = useState<{ [key: number]: any }>({});
  const retryStep = useStore((state) => state.retryStep);
  const skipStep = useStore((state) => state.skipStep);

  const getStepStatusIcon = (status: StepStatus) => {
    switch (status) {
      case 'completed': return '✅';
      case 'running': return '⏳';
      case 'failed': return '❌';
      case 'skipped': return '⏭';
      case 'review': return '👁️';
      default: return '⬜';
    }
  };

  const getStepStatusText = (step: Step) => {
    switch (step.status) {
      case 'completed': return `Voltooid in ${step.duration || 0}s`;
      case 'running': return 'Bezig...';
      case 'failed': return `Mislukt: ${step.error || 'Onbekende fout'}`;
      case 'skipped': return 'Overgeslagen';
      case 'review': return 'Wacht op review';
      default: return 'Wachtend';
    }
  };

  const getExecutorBadge = (executor: string) => {
    const map: Record<string, string> = {
      // Elevate = donkerblauw/wit
      'Elevate':        'bg-blue-900/60 text-blue-100 border-blue-700/40',
      'Elevate AI':     'bg-blue-900/60 text-blue-100 border-blue-700/40',
      // Perplexity = zwart/wit
      'Perplexity':     'bg-zinc-900/80 text-zinc-100 border-zinc-600/40',
      // Claude Opus = oranje/wit
      'Claude Opus':    'bg-orange-600/25 text-orange-200 border-orange-500/30',
      // App = blauw/wit
      'App':            'bg-sky-600/20 text-sky-200 border-sky-500/25',
      // Assembly AI = rood/wit
      'Assembly AI':    'bg-red-600/25 text-red-200 border-red-500/30',
      // TwelveLabs = zwart/wit
      'TwelveLabs':     'bg-zinc-900/80 text-zinc-100 border-zinc-600/40',
      'TwelveLabs + N8N': 'bg-zinc-900/80 text-zinc-100 border-zinc-600/40',
      // N8N = oranje/zwart
      'N8N':            'bg-orange-500/25 text-orange-900 border-orange-400/40',
      // FFMPEG = geel/wit
      'FFMPEG':         'bg-yellow-500/20 text-yellow-200 border-yellow-400/30',
      // HeyGen = paars/wit
      'HeyGen':         'bg-purple-600/25 text-purple-200 border-purple-500/30',
    };
    return map[executor] || 'bg-zinc-700/30 text-zinc-300 border-zinc-600/30';
  };

  const getStepBorderColor = (status: StepStatus) => {
    switch (status) {
      case 'completed': return 'border-emerald-500/15 bg-emerald-500/[0.03]';
      case 'running': return 'border-brand-500/25 bg-brand-500/[0.04] shadow-glow-blue';
      case 'failed': return 'border-red-500/20 bg-red-500/[0.04]';
      case 'review': return 'border-amber-500/20 bg-amber-500/[0.04]';
      case 'skipped': return 'border-white/[0.04] bg-white/[0.01] opacity-50';
      default: return 'border-white/[0.06] bg-white/[0.02]';
    }
  };

  const totalDuration = project.steps
    .filter((s) => s.status === 'completed' && s.duration)
    .reduce((sum, s) => sum + (s.duration || 0), 0);

  const formatTotalTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const completedCount = project.steps.filter((s) => s.status === 'completed').length;
  const failedCount = project.steps.filter((s) => s.status === 'failed').length;
  const skippedCount = project.steps.filter((s) => s.status === 'skipped').length;
  const isAllDone = project.steps.every((s) => s.status === 'completed' || s.status === 'skipped');

  return (
    <div className="space-y-2.5">
      {/* Summary banner */}
      {isAllDone && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-sm text-emerald-400 font-medium animate-fade-in">
          ✅ Pipeline voltooid in {formatTotalTime(totalDuration)}!
        </div>
      )}
      {failedCount > 0 && !isAllDone && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400 font-medium animate-fade-in">
          ❌ {failedCount} stap(pen) mislukt
        </div>
      )}

      {/* Steps */}
      {project.steps.map((step) => (
        <div
          key={step.id}
          data-step-id={step.id}
          className={`rounded-xl border transition-all duration-300 ${getStepBorderColor(step.status)}`}
        >
          {/* Step header */}
          <div
            className="flex items-center justify-between px-4 py-3.5 cursor-pointer"
            onClick={() => setExpandedStep(expandedStep === step.id ? null : step.id)}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-lg">{getStepStatusIcon(step.status)}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-zinc-600 font-mono">
                    {step.id.toString().padStart(2, '0')}
                  </span>
                  <span className="font-semibold text-sm">{step.name}</span>
                  <span className="text-[11px] text-zinc-600">{getStepStatusIcon(step.status) === '⬜' ? '' : ''}</span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">{getStepStatusText(step)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <span className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${getExecutorBadge(step.executor)}`}>
                {step.executor}
              </span>
              {expandedStep === step.id ? (
                <ChevronUp className="w-4 h-4 text-zinc-600" />
              ) : (
                <ChevronDown className="w-4 h-4 text-zinc-600" />
              )}
            </div>
          </div>

          {/* Expanded content */}
          {expandedStep === step.id && (
            <div className="px-4 pb-4 border-t border-white/[0.04] pt-3 animate-fade-in-down">
              {/* Metadata */}
              {step.metadata && (
                <div className="flex gap-3 mb-3 flex-wrap">
                  {step.metadata.wordCount && (
                    <span className="text-xs px-2.5 py-1 bg-surface-200 rounded-lg text-zinc-400 border border-white/[0.04]">
                      {step.metadata.wordCount} woorden
                    </span>
                  )}
                  {step.metadata.estimatedDuration && (
                    <span className="text-xs px-2.5 py-1 bg-surface-200 rounded-lg text-zinc-400 border border-white/[0.04]">
                      ~{Math.round(step.metadata.estimatedDuration / 60)}min
                    </span>
                  )}
                  {step.metadata.sceneCount && (
                    <span className="text-xs px-2.5 py-1 bg-surface-200 rounded-lg text-zinc-400 border border-white/[0.04]">
                      {step.metadata.sceneCount} scenes
                    </span>
                  )}
                  {step.metadata.fileSize && (
                    <span className="text-xs px-2.5 py-1 bg-surface-200 rounded-lg text-zinc-400 border border-white/[0.04]">
                      {(step.metadata.fileSize / 1024 / 1024).toFixed(1)} MB
                    </span>
                  )}
                </div>
              )}

              {/* Duration info */}
              {step.duration && (
                <p className="text-xs text-zinc-600 mb-3">
                  Duur: {step.duration}s
                  {step.retryCount && step.retryCount > 0 && ` · ${step.retryCount} retries`}
                  {step.attemptNumber && step.attemptNumber > 1 && ` · Poging ${step.attemptNumber}`}
                </p>
              )}

              {/* Error details */}
              {step.status === 'failed' && step.error && (
                <div className="p-3 bg-red-500/8 border border-red-500/15 rounded-lg mb-3">
                  <p className="text-xs text-red-400 font-mono">{step.error}</p>
                </div>
              )}

              {/* AI Response */}
              {step.aiResponse && (
                <div className="p-3 bg-brand-500/8 border border-brand-500/15 rounded-lg mb-3">
                  <p className="text-[11px] text-brand-400 font-semibold mb-1">🤖 AI Analyse</p>
                  <p className="text-xs text-zinc-400"><strong>Probleem:</strong> {step.aiResponse.problem}</p>
                  <p className="text-xs text-zinc-400"><strong>Actie:</strong> {step.aiResponse.action}</p>
                  <p className="text-xs text-zinc-400"><strong>Oplossing:</strong> {step.aiResponse.solution}</p>
                </div>
              )}

              {/* Result preview */}
              {step.result && (
                <div className="p-3 bg-surface-200 border border-white/[0.04] rounded-lg mb-3">
                  <p className="text-[11px] text-zinc-500 font-semibold mb-1">Resultaat</p>
                  <pre className="text-xs text-zinc-400 overflow-x-auto max-h-32 overflow-y-auto font-mono">
                    {typeof step.result === 'string' ? step.result : JSON.stringify(step.result, null, 2)}
                  </pre>
                </div>
              )}

              {/* Review panel */}
              {step.status === 'review' && step.id !== 13 && (
                <ReviewPanel project={project} step={step} />
              )}
              {step.status === 'review' && step.id === 13 && (
                <ImageReviewPanel project={project} step={step} />
              )}

              {/* Action buttons */}
              <div className="flex gap-2 mt-3">
                {(step.status === 'failed' || step.status === 'completed') && (
                  <button
                    onClick={() => retryStep(project.id, step.id)}
                    className="btn-secondary text-xs py-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Retry
                  </button>
                )}
                {(step.status === 'failed' || step.status === 'waiting') && (
                  <button
                    onClick={() => skipStep(project.id, step.id)}
                    className="btn-secondary text-xs py-1.5"
                  >
                    <SkipForward className="w-3.5 h-3.5" /> Skip
                  </button>
                )}
              </div>

              {/* AI context panel */}
              {showAiPanel[step.id] && (
                <div className="mt-3 p-3 bg-brand-500/5 border border-brand-500/15 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-brand-400 font-semibold">🤖 AI Feedback</span>
                    <button onClick={() => setShowAiPanel({ ...showAiPanel, [step.id]: false })} className="text-zinc-600 hover:text-zinc-400">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <textarea
                    value={aiContext[step.id] || ''}
                    onChange={(e) => setAiContext({ ...aiContext, [step.id]: e.target.value })}
                    placeholder="Beschrijf wat er anders moet..."
                    className="input-base text-xs resize-none h-20 mb-2"
                  />
                  <button
                    onClick={() => {
                      if (aiContext[step.id]?.trim()) {
                        useStore.getState().submitFeedback(project.id, step.id, aiContext[step.id]);
                        setAiContext({ ...aiContext, [step.id]: '' });
                        setShowAiPanel({ ...showAiPanel, [step.id]: false });
                      }
                    }}
                    className="btn-primary text-xs py-1.5"
                    disabled={!aiContext[step.id]?.trim()}
                  >
                    <Bot className="w-3.5 h-3.5" /> Verstuur Feedback
                  </button>
                </div>
              )}

              {/* Toggle AI panel button */}
              {(step.status === 'completed' || step.status === 'review') && !showAiPanel[step.id] && (
                <button
                  onClick={() => setShowAiPanel({ ...showAiPanel, [step.id]: true })}
                  className="mt-2 text-xs text-brand-400 hover:text-brand-300 font-medium flex items-center gap-1"
                >
                  <Bot className="w-3.5 h-3.5" /> AI Feedback geven
                </button>
              )}

              {/* Approve button for review steps */}
              {step.status === 'review' && step.id !== 13 && (
                <button
                  onClick={() => useStore.getState().approveStep(project.id, step.id)}
                  className="mt-2 btn-success text-xs py-1.5"
                >
                  <CheckCircle className="w-3.5 h-3.5" /> Goedkeuren
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
