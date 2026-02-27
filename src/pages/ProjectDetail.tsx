import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Pause, RotateCcw, Copy, Trash2, FastForward, ExternalLink } from 'lucide-react';
import { useStore } from '../store';
import { ProjectStatus } from '../types';
import PipelineTab from '../components/PipelineTab';
import PreviewTab from '../components/PreviewTab';
import ScriptTab from '../components/ScriptTab';
import LogsTab from '../components/LogsTab';
import StatsTab from '../components/StatsTab';
import ConfigTab from '../components/ConfigTab';

type TabType = 'pipeline' | 'preview' | 'script' | 'logs' | 'stats' | 'config';

const TABS: Array<{ key: TabType; label: string; icon?: string }> = [
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'preview', label: 'Preview' },
  { key: 'script', label: 'Script' },
  { key: 'logs', label: 'Logs' },
  { key: 'stats', label: 'Stats', icon: '📊' },
  { key: 'config', label: 'Config', icon: '⚙️' },
];

const STEP_NAV: Array<{ id: number; label: string }> = [
  { id: 0,  label: '0. Ideation' },
  { id: 1,  label: '1. Formulier' },
  { id: 2,  label: '2. Research' },
  { id: 3,  label: '3. Transcripts' },
  { id: 4,  label: '4. Clips Research' },
  { id: 5,  label: '5. Style Profile' },
  { id: 6,  label: '6. Script Orchestrator' },
  { id: 7,  label: '7. Script' },
  { id: 8,  label: '8. Voice Over' },
  { id: 9,  label: '9. Avatar' },
  { id: 10, label: '10. Timestamps' },
  { id: 11, label: '11. Scene Prompts' },
  { id: 12, label: '12. Assets' },
  { id: 13, label: '13. Clips' },
  { id: 14, label: '14. Images' },
  { id: 15, label: '15. Video Scenes' },
  { id: 16, label: '16. Director Cut' },
  { id: 17, label: '17. Muziek' },
  { id: 18, label: '18. Color Grade' },
  { id: 19, label: '19. Subtitles' },
  { id: 20, label: '20. Overlay' },
  { id: 21, label: '21. Sound FX' },
  { id: 22, label: '22. Video FX' },
  { id: 23, label: '23. Export' },
  { id: 24, label: '24. Thumbnail' },
  { id: 25, label: '25. Drive Upload' },
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
    return () => { if (interval) clearInterval(interval); };
  }, [project?.status, project?.startedAt]);

  if (!project) {
    return (
      <div className="p-8 flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <h1 className="text-xl font-bold mb-4 text-zinc-300">Project niet gevonden</h1>
          <button onClick={() => navigate('/')} className="text-brand-400 hover:text-brand-300 text-sm font-medium">
            Terug naar overzicht
          </button>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: ProjectStatus) => {
    const map: Record<string, string> = {
      completed: 'badge-success',
      running: 'badge-running',
      failed: 'badge-error',
      paused: 'badge-warning',
      config: 'badge-neutral',
      review: 'badge-info',
      queued: 'badge-purple',
    };
    return map[status] || 'badge-neutral';
  };

  const doneSteps = project.steps.filter((s) => s.status === 'completed' || s.status === 'skipped').length;
  const totalSteps = project.steps.length;
  const progress = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;

  const formatElapsedTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartPipeline = () => startPipeline(project.id);
  const handlePausePipeline = () => pausePipeline(project.id);
  const handleResumePipeline = () => resumePipeline(project.id);
  const handleRetryFailed = () => retryFailed(project.id);

  const handleDuplicate = async () => {
    const newProject = await duplicateProject(project.id);
    if (newProject) navigate(`/project/${newProject.id}`);
  };

  const handleDelete = () => {
    deleteProject(project.id);
    navigate('/');
  };

  const handleForceContinue = () => {
    forceContinue(project.id);
    setShowForceContinueConfirm(false);
  };

  const getStepStatusIcon = (stepNumber: number) => {
    const step = project.steps.find(s => s.id === stepNumber);
    if (!step) return '⬜';
    switch (step.status) {
      case 'completed': return '✅';
      case 'running': return '⏳';
      case 'failed': return '❌';
      case 'skipped': return '⏭';
      case 'review': return '👁️';
      default: return '⬜';
    }
  };

  return (
    <div className="p-8 animate-fade-in">
      <div className="max-w-6xl mx-auto">
        {/* Header card */}
        <div className="glass rounded-2xl p-6 mb-6">
          <div className="flex items-start justify-between mb-5">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold tracking-tight mb-1">{project.name}</h1>
              <p className="text-zinc-500 text-sm">{project.title}</p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0 ml-4">
              <button onClick={handleDuplicate} className="btn-secondary text-xs py-2 px-3">
                <Copy className="w-3.5 h-3.5" />
                Dupliceer
              </button>
              {project.status === 'running' && (
                <div className="px-3 py-1.5 bg-surface-300/60 rounded-lg text-xs font-mono text-zinc-400 border border-white/[0.04]">
                  {formatElapsedTime(elapsedTime)}
                </div>
              )}
              <span className={`badge ${getStatusBadge(project.status)}`}>
                {project.status}
              </span>
            </div>
          </div>

          {/* Progress */}
          <div className="mb-5">
            <div className="flex justify-between text-xs text-zinc-500 mb-2">
              <span>Voortgang</span>
              <span className="font-mono">{doneSteps}/{totalSteps} stappen &middot; {progress}%</span>
            </div>
            <div className="w-full bg-surface-300/40 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${
                  progress >= 100
                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                    : 'progress-bar'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Drive link */}
          {project.driveUrl && (
            <div className="mb-5 p-3.5 bg-emerald-500/8 border border-emerald-500/15 rounded-xl flex items-center gap-3">
              <span className="text-lg">📁</span>
              <div className="flex-1">
                <span className="text-emerald-400 font-medium text-sm">Google Drive</span>
                <a
                  href={project.driveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-3 text-brand-400 hover:text-brand-300 text-xs inline-flex items-center gap-1"
                >
                  Open in Drive <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2.5">
            {project.status === 'config' && (
              <button onClick={handleStartPipeline} className="btn-primary">
                <Play className="w-4 h-4" /> Start Pipeline
              </button>
            )}
            {project.status === 'running' && (
              <button onClick={handlePausePipeline} className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600/90 hover:bg-amber-500 text-white font-semibold rounded-xl shadow-glow-orange transition-all duration-200">
                <Pause className="w-4 h-4" /> Pause
              </button>
            )}
            {project.status === 'paused' && (
              <button onClick={handleResumePipeline} className="btn-primary">
                <Play className="w-4 h-4" /> Resume
              </button>
            )}
            {project.status === 'failed' && (
              <>
                <button onClick={handleRetryFailed} className="btn-primary">
                  <RotateCcw className="w-4 h-4" /> Retry Failed
                </button>
                <button
                  onClick={() => setShowForceContinueConfirm(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600/90 hover:bg-amber-500 text-white font-semibold rounded-xl transition-all duration-200"
                >
                  <FastForward className="w-4 h-4" /> Force Continue
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="glass rounded-2xl overflow-hidden">
          <div className="flex border-b border-white/[0.06]">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-5 py-3.5 text-sm font-medium transition-all duration-200 relative ${
                  activeTab === tab.key
                    ? 'text-brand-300'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {tab.icon ? `${tab.icon} ${tab.label}` : tab.label}
                {activeTab === tab.key && (
                  <div className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-gradient-to-r from-brand-500 to-brand-400" />
                )}
              </button>
            ))}
          </div>

          <div className="p-6 flex gap-5">
            {/* Step navigator sidebar */}
            {activeTab === 'pipeline' && (
              <div className="w-40 shrink-0 hidden lg:block">
                <div className="sticky top-4 space-y-0.5 max-h-[75vh] overflow-y-auto pr-1 scrollbar-thin">
                  <p className="text-[10px] text-zinc-600 font-semibold mb-2 uppercase tracking-wider">Stappen</p>
                  {STEP_NAV.map((nav) => (
                    <button
                      key={nav.id}
                      onClick={() => {
                        const el = document.querySelector(`[data-step-id="${nav.id}"]`);
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                      className="w-full text-left px-2 py-1 rounded-lg text-[11px] hover:bg-white/[0.04] transition-colors flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300"
                    >
                      <span className="text-[10px]">{getStepStatusIcon(nav.id)}</span>
                      <span className="truncate">{nav.label}</span>
                    </button>
                  ))}
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

        {/* Danger zone */}
        <div className="mt-6 bg-red-500/5 border border-red-500/10 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-red-400 mb-1.5">Danger Zone</h3>
          <p className="text-xs text-zinc-600 mb-4">Wees voorzichtig — dit kan niet ongedaan worden.</p>
          <button onClick={() => setShowDeleteConfirm(true)} className="btn-danger text-xs py-2">
            <Trash2 className="w-3.5 h-3.5" /> Project Verwijderen
          </button>
        </div>
      </div>

      {/* Delete modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-8 animate-fade-in">
          <div className="glass-strong rounded-2xl max-w-md w-full animate-scale-in">
            <div className="p-6 border-b border-white/[0.06]">
              <h3 className="text-lg font-semibold">Project Verwijderen</h3>
            </div>
            <div className="p-6">
              <p className="text-zinc-300 text-sm mb-2">
                Weet je zeker dat je <strong className="text-white">'{project.name}'</strong> wilt verwijderen?
              </p>
              <p className="text-xs text-zinc-600">Dit kan niet ongedaan worden. Alle data en voortgang gaat verloren.</p>
            </div>
            <div className="p-6 border-t border-white/[0.06] flex justify-end gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="btn-secondary text-sm">Annuleren</button>
              <button onClick={handleDelete} className="btn-danger text-sm">Verwijderen</button>
            </div>
          </div>
        </div>
      )}

      {/* Force continue modal */}
      {showForceContinueConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-8 animate-fade-in">
          <div className="glass-strong rounded-2xl max-w-md w-full animate-scale-in">
            <div className="p-6 border-b border-white/[0.06]">
              <h3 className="text-lg font-semibold">Force Continue</h3>
            </div>
            <div className="p-6">
              <p className="text-zinc-300 text-sm mb-2">Alle gefaalde stappen worden overgeslagen. Wil je doorgaan?</p>
              <p className="text-xs text-zinc-600">De pipeline zal verder gaan met de volgende waiting stap.</p>
            </div>
            <div className="p-6 border-t border-white/[0.06] flex justify-end gap-3">
              <button onClick={() => setShowForceContinueConfirm(false)} className="btn-secondary text-sm">Annuleren</button>
              <button onClick={handleForceContinue} className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-xl text-sm transition-all">
                Doorgaan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
