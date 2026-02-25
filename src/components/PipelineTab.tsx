import { useState } from 'react';
import { ChevronDown, ChevronUp, RotateCcw, SkipForward, Bot, CheckCircle, X } from 'lucide-react';
import { Project, Step, StepStatus } from '../types';
import { useStore } from '../store';
import ReviewPanel from './ReviewPanel';

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
      case 'completed':
        return '✅';
      case 'running':
        return '⏳';
      case 'failed':
        return '❌';
      case 'skipped':
        return '⏭';
      case 'review':
        return '👁️';
      default:
        return '⬜';
    }
  };

  const getStepStatusText = (step: Step) => {
    switch (step.status) {
      case 'completed':
        return `Voltooid in ${step.duration || 0}s`;
      case 'running':
        return `Bezig...`;
      case 'failed':
        return `Mislukt: ${step.error || 'Onbekende fout'}`;
      case 'skipped':
        return 'Overgeslagen';
      case 'review':
        return 'Wacht op review';
      default:
        return 'Wachtend';
    }
  };

  const getExecutorColor = (executor: string) => {
    switch (executor) {
      case 'App':
        return 'bg-zinc-600 text-white';
      case 'N8N':
        return 'bg-blue-600 text-white';
      case 'Elevate AI':
        return 'bg-purple-600 text-white';
      case 'OpenClaw':
        return 'bg-orange-600 text-white';
      default:
        return 'bg-zinc-600 text-white';
    }
  };

  const getStepBorderClass = (status: StepStatus) => {
    switch (status) {
      case 'running':
        return 'border-blue-500/50 shadow-lg shadow-blue-500/20';
      case 'failed':
        return 'border-red-500/50 shadow-lg shadow-red-500/20';
      case 'review':
        return 'border-violet-500/50 shadow-lg shadow-violet-500/20';
      default:
        return 'border-zinc-700';
    }
  };

  const handleShowAiPanel = (stepId: number) => {
    setShowAiPanel({ ...showAiPanel, [stepId]: true });
  };

  const handleAskAI = (stepId: number) => {
    setAiThinking({ ...aiThinking, [stepId]: true });
    setTimeout(() => {
      setAiThinking({ ...aiThinking, [stepId]: false });
      setAiResponse({
        ...aiResponse,
        [stepId]: {
          problem: 'De VEO 3 prompt voor scene 14 is te abstract. De prompt "ethereal consciousness expanding through dimensions" bevat geen concrete visuele elementen.',
          action: 'modify_and_retry',
          solution: 'Ik heb de prompt aangepast naar iets concreter: "A white mannequin figure standing in a vast dark void with glowing particles expanding outward like a shockwave". Dit geeft VEO 3 meer houvast.',
        },
      });
    }, 3000);
  };

  const handleAcceptAI = (stepId: number) => {
    retryStep(project.id, stepId);
    setShowAiPanel({ ...showAiPanel, [stepId]: false });
    setAiResponse({ ...aiResponse, [stepId]: undefined });
    setAiContext({ ...aiContext, [stepId]: '' });
  };

  const handleRejectAI = (stepId: number) => {
    setAiResponse({ ...aiResponse, [stepId]: undefined });
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('nl-NL', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const renderEditingStepDetails = (step: Step) => {
    if (step.status !== 'completed') return null;

    switch (step.id) {
      case 10:
        return (
          <div>
            <p className="text-sm text-zinc-300 mb-3">28 scenes + voiceover samengevoegd</p>
            <div className="bg-zinc-900 rounded-lg p-4">
              <p className="text-xs text-zinc-500 mb-2">Timeline Preview</p>
              <div className="flex gap-1">
                {Array.from({ length: 28 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-1 h-8 rounded"
                    style={{
                      backgroundColor: `hsl(${(i * 13) % 360}, 60%, 45%)`,
                    }}
                  ></div>
                ))}
              </div>
            </div>
          </div>
        );
      case 11:
        if (project.colorGrading === 'Geen' || !project.colorGrading) return null;
        return (
          <div>
            <p className="text-sm text-zinc-300 mb-3">Applied: {project.colorGrading}</p>
            <div className="flex gap-4">
              <div className="flex-1">
                <p className="text-xs text-zinc-500 mb-2">Before</p>
                <div className="aspect-video bg-gradient-to-br from-zinc-600 to-zinc-700 rounded-lg border border-zinc-600"></div>
              </div>
              <div className="flex-1">
                <p className="text-xs text-zinc-500 mb-2">After</p>
                <div
                  className={`aspect-video rounded-lg border ${
                    project.colorGrading === 'Cinematic Dark'
                      ? 'bg-gradient-to-br from-zinc-800 via-zinc-900 to-black border-zinc-800'
                      : project.colorGrading === 'History Warm'
                      ? 'bg-gradient-to-br from-amber-900 via-orange-900 to-red-900 border-amber-800'
                      : project.colorGrading === 'Vibrant'
                      ? 'bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 border-blue-500'
                      : project.colorGrading === 'Cold Blue'
                      ? 'bg-gradient-to-br from-blue-900 via-cyan-900 to-slate-900 border-blue-800'
                      : project.colorGrading === 'Noir'
                      ? 'bg-gradient-to-br from-black via-zinc-900 to-zinc-800 border-black'
                      : 'bg-gradient-to-br from-zinc-600 to-zinc-700 border-zinc-600'
                  }`}
                ></div>
              </div>
            </div>
          </div>
        );
      case 12:
        if (!project.subtitles) return null;
        return (
          <div>
            <p className="text-sm text-zinc-300 mb-2">SRT bestand gegenereerd</p>
            <div className="bg-zinc-900 rounded-lg p-3 border border-zinc-700">
              <p className="text-xs text-zinc-500">247 regels subtitles</p>
            </div>
          </div>
        );
      case 13:
        return (
          <div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-zinc-900 rounded-lg p-3 border border-zinc-700">
                <p className="text-xs text-zinc-500 mb-1">Formaat</p>
                <p className="text-sm font-medium">{project.output}</p>
              </div>
              <div className="bg-zinc-900 rounded-lg p-3 border border-zinc-700">
                <p className="text-xs text-zinc-500 mb-1">Duur</p>
                <p className="text-sm font-medium">12:45</p>
              </div>
              <div className="bg-zinc-900 rounded-lg p-3 border border-zinc-700">
                <p className="text-xs text-zinc-500 mb-1">Grootte</p>
                <p className="text-sm font-medium">847 MB</p>
              </div>
            </div>
            <button className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors">
              <span>⬇</span>
              Download
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  const getStatusBanner = () => {
    const totalSteps = project.steps.filter((s) => s.status !== 'skipped').length;
    const runningStep = project.steps.find((s) => s.status === 'running');
    const reviewStep = project.steps.find((s) => s.status === 'review');
    const failedStep = project.steps.find((s) => s.status === 'failed');

    if (project.status === 'review' && reviewStep) {
      return null;
    }

    if (project.status === 'running' && runningStep) {
      return (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-4">
          <p className="text-sm text-blue-400">
            Pipeline draait — stap {runningStep.id} van {totalSteps} bezig...
          </p>
        </div>
      );
    }

    if (project.status === 'paused' && runningStep) {
      return (
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4 mb-4">
          <p className="text-sm text-orange-400">
            Pipeline gepauzeerd bij stap {runningStep.id}. Klik Resume om door te gaan.
          </p>
        </div>
      );
    }

    if (project.status === 'failed' && failedStep) {
      return (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-400">
            Pipeline gestopt bij stap {failedStep.id}. 3 acties beschikbaar: Retry, Skip, of Ask AI.
          </p>
        </div>
      );
    }

    if (project.status === 'completed') {
      const duration = project.startedAt && project.completedAt
        ? Math.floor((new Date(project.completedAt).getTime() - new Date(project.startedAt).getTime()) / 1000)
        : 0;
      const minutes = Math.floor(duration / 60);
      const seconds = duration % 60;
      return (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mb-4">
          <p className="text-sm text-green-400">
            ✅ Pipeline voltooid in {minutes}m {seconds}s!
          </p>
        </div>
      );
    }

    return null;
  };

  const reviewStep = project.steps.find((s) => s.status === 'review');

  return (
    <div className="space-y-3">
      {getStatusBanner()}

      {reviewStep && <ReviewPanel project={project} step={reviewStep} />}

      {project.steps.map((step) => (
        <div key={step.id}>
          <div
            className={`bg-zinc-900 rounded-lg p-4 border ${getStepBorderClass(
              step.status
            )} cursor-pointer hover:bg-zinc-800/50 transition-all`}
            onClick={() =>
              setExpandedStep(expandedStep === step.id ? null : step.id)
            }
          >
            <div className="flex items-start gap-4">
              <div className="text-2xl">{getStepStatusIcon(step.status)}</div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-zinc-500 font-mono text-sm">
                    {step.id.toString().padStart(2, '0')}
                  </span>
                  <span className="font-medium">{step.name}</span>
                  {step.retryCount && step.retryCount > 0 && (
                    <span className="text-xs text-orange-500 font-medium">
                      ↻{step.retryCount}
                    </span>
                  )}
                </div>
                <p className="text-sm text-zinc-400">{getStepStatusText(step)}</p>
                {(step.status === 'completed' || step.status === 'review') && step.metadata && (
                  <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
                    {step.id === 3 && step.metadata.wordCount && (
                      <>
                        <span>📊 {step.metadata.wordCount.toLocaleString()} woorden</span>
                        <span>🎙️ ~{step.metadata.estimatedDuration} min VO</span>
                      </>
                    )}
                    {step.id === 4 && step.metadata.estimatedDuration && (
                      <>
                        <span>🎙️ {Math.floor(step.metadata.estimatedDuration / 60)}:{(step.metadata.estimatedDuration % 60).toString().padStart(2, '0')}</span>
                        <span>📦 {step.metadata.fileSize?.toFixed(1)} MB</span>
                      </>
                    )}
                    {step.id === 9 && step.metadata.sceneCount && (
                      <span>🎬 {step.metadata.sceneCount} scenes</span>
                    )}
                    {step.duration && <span>⏱️ {step.duration}s</span>}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`px-3 py-1 text-xs font-medium rounded ${getExecutorColor(
                    step.executor
                  )}`}
                >
                  {step.executor}
                </span>
                {expandedStep === step.id ? (
                  <ChevronUp className="w-5 h-5 text-zinc-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-zinc-400" />
                )}
              </div>
            </div>
          </div>

          {expandedStep === step.id && (
            <div className="bg-zinc-800 border-x border-b border-zinc-700 rounded-b-lg p-4 mt-[-8px] animate-slide-down">
              {step.status === 'completed' && (
                <div>
                  {renderEditingStepDetails(step) || (
                    <>
                      <h4 className="text-sm font-semibold mb-2">Resultaat</h4>
                      <pre className="bg-zinc-900 p-3 rounded text-xs text-zinc-400 overflow-x-auto">
                        {JSON.stringify(step.result, null, 2)}
                      </pre>
                    </>
                  )}
                </div>
              )}

              {step.status === 'failed' && (
                <div>
                  <h4 className="text-sm font-semibold mb-3 text-red-400">
                    ❌ Stap {step.id}: {step.name} — MISLUKT
                  </h4>

                  <div className="mb-4">
                    <p className="text-xs text-zinc-500 mb-2">Error:</p>
                    <div className="bg-red-950 border border-red-800 rounded-lg p-3">
                      <p className="text-sm text-red-300 font-mono">{step.error}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                    <div>
                      <span className="text-zinc-500">Pogingen:</span>
                      <span className="ml-2 text-white font-medium">{step.retryCount || 1}/3</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Duur laatste poging:</span>
                      <span className="ml-2 text-white font-medium">{step.duration || 0}s</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Executor:</span>
                      <span className="ml-2 text-white font-medium">{step.executor}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Eerste poging:</span>
                      <span className="ml-2 text-white font-medium">
                        {step.firstAttemptAt ? formatTime(step.firstAttemptAt) : '-'}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        retryStep(project.id, step.id);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Retry
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        skipStep(project.id, step.id);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm font-medium transition-colors"
                    >
                      <SkipForward className="w-4 h-4" />
                      Skip
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleShowAiPanel(step.id);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-medium transition-colors"
                    >
                      <Bot className="w-4 h-4" />
                      Ask AI
                    </button>
                  </div>

                  {showAiPanel[step.id] && (
                    <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-4">
                      <h5 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Bot className="w-4 h-4" />
                        AI Hulp
                      </h5>

                      <div className="mb-4">
                        <p className="text-xs text-zinc-500 mb-2">Context die naar AI gestuurd wordt:</p>
                        <div className="bg-zinc-900 rounded-lg p-3 text-xs text-zinc-400 space-y-1">
                          <p>• Project: {project.name}</p>
                          <p>• Stap: {step.id} — {step.name}</p>
                          <p>• Error: {step.error?.substring(0, 50)}...</p>
                          <p>• Pogingen: {step.retryCount || 1}</p>
                          <p>• Stijl: {project.visualStyle}</p>
                        </div>
                      </div>

                      <div className="mb-3">
                        <label className="block text-xs text-zinc-500 mb-2">
                          Extra context (optioneel):
                        </label>
                        <textarea
                          value={aiContext[step.id] || ''}
                          onChange={(e) =>
                            setAiContext({ ...aiContext, [step.id]: e.target.value })
                          }
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-sm focus:outline-none focus:border-purple-500 transition-colors"
                          rows={3}
                          placeholder="Typ hier extra info voor de AI..."
                        />
                      </div>

                      {!aiResponse[step.id] ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAskAI(step.id);
                          }}
                          disabled={aiThinking[step.id]}
                          className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          {aiThinking[step.id] ? (
                            <>
                              <Bot className="w-4 h-4 animate-pulse" />
                              ⏳ AI is aan het nadenken...
                            </>
                          ) : (
                            <>
                              <Bot className="w-4 h-4" />
                              Verstuur naar AI
                            </>
                          )}
                        </button>
                      ) : (
                        <div className="bg-zinc-900 border border-purple-500/30 rounded-lg p-4">
                          <h6 className="text-sm font-semibold mb-3 flex items-center gap-2 text-purple-400">
                            <Bot className="w-4 h-4" />
                            AI Analyse
                          </h6>
                          <p className="text-sm text-zinc-300 mb-3">
                            <strong className="text-white">Probleem:</strong> {aiResponse[step.id].problem}
                          </p>
                          <p className="text-sm text-zinc-300 mb-3">
                            <strong className="text-white">Aanbevolen actie:</strong>{' '}
                            <span className="text-purple-400">{aiResponse[step.id].action}</span>
                          </p>
                          <p className="text-sm text-zinc-300 mb-4">
                            "{aiResponse[step.id].solution}"
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAcceptAI(step.id);
                              }}
                              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition-colors"
                            >
                              <CheckCircle className="w-4 h-4" />
                              Accepteer & Retry
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRejectAI(step.id);
                              }}
                              className="flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm font-medium transition-colors"
                            >
                              <X className="w-4 h-4" />
                              Negeer
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {step.status === 'running' && (
                <div>
                  <p className="text-sm text-zinc-400">
                    Bezig met verwerken...
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
