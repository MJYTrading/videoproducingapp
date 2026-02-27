import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Pause, RotateCcw, Copy, Trash2, FastForward } from 'lucide-react';
import { useStore } from '../store';
import { ProjectStatus } from '../types';
import PipelineTab from '../components/PipelineTab';
import PreviewTab from '../components/PreviewTab';
import ScriptTab from '../components/ScriptTab';
import LogsTab from '../components/LogsTab';
import StatsTab from '../components/StatsTab';
import ConfigTab from '../components/ConfigTab';

type TabType = 'pipeline' | 'preview' | 'script' | 'logs' | 'stats' | 'config';


const STEP_NAV: Array<{ id: number; label: string }> = [
  { id: 0, label: '0. Config' },
  { id: 1, label: '1. Transcripts' },
  { id: 2, label: '2. Style' },
  { id: 3, label: '3. Script' },
  { id: 4, label: '4. Voiceover' },
  { id: 5, label: '5. Timestamps' },
  { id: 6, label: '6. Prompts' },
  { id: 7, label: '7. Assets' },
  { id: 8, label: '8. Clips' },
  { id: 9, label: '9. Video' },
  { id: 10, label: '10. Editing' },
  { id: 11, label: '11. Color' },
  { id: 12, label: '12. Subs' },
  { id: 13, label: '13. Export' },
  { id: 14, label: '14. Upload' },
];

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const project = useStore((state) => state.getProject(id || ''));
  const startPipeline = useStore((state) => state.startPipeline);
  const pausePipeline = useStore((state) => state.pausePipeline);
  const resumePipeline = useStore((state) => state.resumePipeline);
  const retryFailed = useStore((state) => state.retryFailed);
  const forceContinue = useStore((state) => state.forceContinue);
  const deleteProject = useStore((state) => state.deleteProject);
  const duplicateProject = useStore((state) => state.duplicateProject);

  const [activeTab, setActiveTab] = useState<TabType>('pipeline');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showForceContinueConfirm, setShowForceContinueConfirm] = useState(false);

  useEffect(() => {
    if (!project) return;

    let interval: NodeJS.Timeout;
    if (project.status === 'running' && project.startedAt) {
      interval = setInterval(() => {
        const start = new Date(project.startedAt!).getTime();
        const now = new Date().getTime();
        setElapsedTime(Math.floor((now - start) / 1000));
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [project?.status, project?.startedAt]);

  if (!project) {
    return (
      <div className="p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Project niet gevonden</h1>
          <button
            onClick={() => navigate('/')}
            className="text-blue-500 hover:text-blue-400"
          >
            Terug naar overzicht
          </button>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: ProjectStatus) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'running':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'failed':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'paused':
        return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      default:
        return 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20';
    }
  };

  const doneSteps = project.steps.filter(
    (s) => s.status === 'completed' || s.status === 'skipped'
  ).length;
  const totalSteps = project.steps.length;
  const progress = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;

  const formatElapsedTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartPipeline = () => {
    startPipeline(project.id);
  };

  const handlePausePipeline = () => {
    pausePipeline(project.id);
  };

  const handleResumePipeline = () => {
    resumePipeline(project.id);
  };

  const handleRetryFailed = () => {
    retryFailed(project.id);
  };

  const handleDuplicate = () => {
    const newProject = duplicateProject(project.id);
    if (newProject) {
      navigate(`/project/${newProject.id}`);
    }
  };

  const handleDelete = () => {
    deleteProject(project.id);
    navigate('/');
  };

  const handleForceContinue = () => {
    forceContinue(project.id);
    setShowForceContinueConfirm(false);
  };

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-zinc-800 rounded-lg p-6 mb-6 border border-zinc-700">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-2">{project.name}</h1>
              <p className="text-zinc-400 text-lg">{project.title}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleDuplicate}
                className="flex items-center gap-2 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm transition-colors"
                title="Dupliceer project"
              >
                <Copy className="w-4 h-4" />
                Dupliceer
              </button>
              {project.status === 'running' && (
                <div className="px-3 py-1 bg-zinc-900 rounded text-sm font-mono text-zinc-400">
                  {formatElapsedTime(elapsedTime)}
                </div>
              )}
              <span
                className={`px-3 py-1 text-sm font-medium rounded border ${getStatusColor(
                  project.status
                )}`}
              >
                {project.status}
              </span>
            </div>
          </div>

          <div className="mb-4">
            <div className="flex justify-between text-sm text-zinc-400 mb-2">
              <span>Voortgang</span>
              <span>
                {doneSteps}/{totalSteps} stappen
              </span>
            </div>
            <div className="w-full bg-zinc-700 rounded-full h-3">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {project.driveUrl && (
            <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-3">
              <span className="text-green-400 text-lg">📁</span>
              <div className="flex-1">
                <span className="text-green-400 font-medium">Google Drive</span>
                <a
                  href={project.driveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-3 text-blue-400 hover:text-blue-300 underline text-sm"
                >
                  Open in Drive →
                </a>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            {project.status === 'config' && (
              <button
                onClick={handleStartPipeline}
                className="flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
              >
                <Play className="w-5 h-5" />
                Start Pipeline
              </button>
            )}

            {project.status === 'running' && (
              <button
                onClick={handlePausePipeline}
                className="flex items-center gap-2 px-4 py-3 bg-orange-600 hover:bg-orange-700 rounded-lg font-semibold transition-colors"
              >
                <Pause className="w-5 h-5" />
                Pause
              </button>
            )}

            {project.status === 'paused' && (
              <button
                onClick={handleResumePipeline}
                className="flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
              >
                <Play className="w-5 h-5" />
                Resume
              </button>
            )}

            {project.status === 'failed' && (
              <>
                <button
                  onClick={handleRetryFailed}
                  className="flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
                >
                  <RotateCcw className="w-5 h-5" />
                  Retry Failed
                </button>
                <button
                  onClick={() => setShowForceContinueConfirm(true)}
                  className="flex items-center gap-2 px-4 py-3 bg-orange-600 hover:bg-orange-700 rounded-lg font-semibold transition-colors"
                >
                  <FastForward className="w-5 h-5" />
                  Force Continue
                </button>
              </>
            )}
          </div>
        </div>

        <div className="bg-zinc-800 rounded-lg border border-zinc-700 overflow-hidden">
          <div className="flex border-b border-zinc-700">
            {[
              { key: 'pipeline', label: 'Pipeline' },
              { key: 'preview', label: 'Preview' },
              { key: 'script', label: 'Script' },
              { key: 'logs', label: 'Logs' },
              { key: 'stats', label: '📊 Stats' },
              { key: 'config', label: '⚙️ Config' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as TabType)}
                className={`px-6 py-4 font-medium transition-colors relative ${
                  activeTab === tab.key
                    ? 'text-blue-500'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"></div>
                )}
              </button>
            ))}
          </div>

          <div className="p-6 flex gap-4">
            {activeTab === 'pipeline' && (
              <div className="w-40 shrink-0 hidden lg:block">
                <div className="sticky top-4 space-y-1">
                  <p className="text-xs text-zinc-500 font-medium mb-2 uppercase">Stappen</p>
                  {STEP_NAV.map((nav) => {
                    const step = project.steps.find(s => s.id === nav.id);
                    const statusIcon = !step ? '⬜' : step.status === 'completed' ? '✅' : step.status === 'running' ? '⏳' : step.status === 'failed' ? '❌' : step.status === 'skipped' ? '⏭' : step.status === 'review' ? '👁️' : '⬜';
                    return (
                      <button
                        key={nav.id}
                        onClick={() => {
                          const el = document.querySelector(`[data-step-id="${nav.id}"]`);
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }}
                        className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-zinc-700/50 transition-colors flex items-center gap-1.5 text-zinc-400 hover:text-white"
                      >
                        <span className="text-[10px]">{statusIcon}</span>
                        <span className="truncate">{nav.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="flex-1 min-w-0">
            {activeTab === 'pipeline' && <PipelineTab project={project} />}
            {activeTab === 'preview' && <PreviewTab project={project} />}
            {activeTab === 'script' && <ScriptTab project={project} />}
            {activeTab === 'logs' && <LogsTab project={project} />}
            {activeTab === 'stats' && <StatsTab project={project} />}
            {activeTab === 'config' && <ConfigTab project={project} />}
            </div>
          </div>
        </div>

        <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-red-500 mb-2">Danger Zone</h3>
          <p className="text-sm text-zinc-400 mb-4">
            Wees voorzichtig met deze actie. Dit kan niet ongedaan worden.
          </p>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Project Verwijderen
          </button>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8">
          <div className="bg-zinc-800 rounded-lg max-w-md w-full border border-zinc-700">
            <div className="p-6 border-b border-zinc-700">
              <h3 className="text-xl font-semibold">Project Verwijderen</h3>
            </div>
            <div className="p-6">
              <p className="text-zinc-300 mb-2">
                Weet je zeker dat je <strong>'{project.name}'</strong> wilt verwijderen?
              </p>
              <p className="text-sm text-zinc-500">
                Dit kan niet ongedaan worden. Alle data en voortgang gaat verloren.
              </p>
            </div>
            <div className="p-6 border-t border-zinc-700 flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
              >
                Annuleren
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors"
              >
                Verwijderen
              </button>
            </div>
          </div>
        </div>
      )}

      {showForceContinueConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8">
          <div className="bg-zinc-800 rounded-lg max-w-md w-full border border-zinc-700">
            <div className="p-6 border-b border-zinc-700">
              <h3 className="text-xl font-semibold">Force Continue</h3>
            </div>
            <div className="p-6">
              <p className="text-zinc-300 mb-2">
                Alle gefaalde stappen worden overgeslagen. Wil je doorgaan?
              </p>
              <p className="text-sm text-zinc-500">
                De pipeline zal verder gaan met de volgende waiting stap.
              </p>
            </div>
            <div className="p-6 border-t border-zinc-700 flex justify-end gap-3">
              <button
                onClick={() => setShowForceContinueConfirm(false)}
                className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
              >
                Annuleren
              </button>
              <button
                onClick={handleForceContinue}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg font-medium transition-colors"
              >
                Doorgaan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
