import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, FileVideo, ArrowUp, ArrowDown, X, Play, Zap } from 'lucide-react';
import { useStore } from '../store';
import { ProjectStatus } from '../types';
import * as api from '../api';

export default function ProjectsOverview() {
  const projects = useStore((state) => state.projects);
  const [queueData, setQueueData] = useState<{ running: any; queued: any[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchQueue = async () => {
    try {
      const data = await api.queue.getQueue();
      setQueueData(data);
    } catch (err) {
      console.error('Queue ophalen mislukt:', err);
    }
  };

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 5000);
    return () => clearInterval(interval);
  }, []);

  const getStatusBadge = (status: ProjectStatus) => {
    const map: Record<string, { class: string; label: string }> = {
      completed: { class: 'badge-success', label: 'Voltooid' },
      running: { class: 'badge-running', label: 'Actief' },
      failed: { class: 'badge-error', label: 'Mislukt' },
      paused: { class: 'badge-warning', label: 'Gepauzeerd' },
      queued: { class: 'badge-purple', label: 'Wachtrij' },
      review: { class: 'badge-info', label: 'Review' },
      config: { class: 'badge-neutral', label: 'Config' },
    };
    const s = map[status] || map.config;
    return <span className={`badge ${s.class}`}>{s.label}</span>;
  };

  const getProgressPercentage = (steps: any[]) => {
    const completed = steps.filter((s) => s.status === 'completed').length;
    return Math.round((completed / steps.length) * 100);
  };

  const getProgressColor = (pct: number) => {
    if (pct >= 100) return 'from-emerald-500 to-emerald-400';
    if (pct >= 50) return 'from-brand-500 to-blue-400';
    return 'from-brand-600 to-brand-400';
  };

  const handlePriority = async (projectId: string, currentPriority: number, direction: 'up' | 'down') => {
    const newPriority = direction === 'up' ? currentPriority + 1 : Math.max(0, currentPriority - 1);
    setLoading(true);
    try {
      await api.queue.setPriority(projectId, newPriority);
      await fetchQueue();
      useStore.getState().fetchProjects();
    } catch (err) {
      console.error('Prioriteit aanpassen mislukt:', err);
    }
    setLoading(false);
  };

  const handleDequeue = async (projectId: string) => {
    setLoading(true);
    try {
      await api.queue.dequeue(projectId);
      await fetchQueue();
      useStore.getState().fetchProjects();
    } catch (err) {
      console.error('Dequeue mislukt:', err);
    }
    setLoading(false);
  };

  const handleStartNext = async () => {
    setLoading(true);
    try {
      await api.queue.startNext();
      await fetchQueue();
      useStore.getState().fetchProjects();
    } catch (err) {
      console.error('Start volgende mislukt:', err);
    }
    setLoading(false);
  };

  const queuedProjects = queueData?.queued || [];
  const runningProject = queueData?.running;

  return (
    <div className="p-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projecten</h1>
          <p className="text-sm text-zinc-500 mt-1">{projects.length} project{projects.length !== 1 ? 'en' : ''}</p>
        </div>
        <Link to="/project/new" className="btn-primary">
          <Plus className="w-4 h-4" />
          Nieuw Project
        </Link>
      </div>

      {/* Queue section */}
      {(runningProject || queuedProjects.length > 0) && (
        <div className="mb-8 glass rounded-2xl p-6 animate-fade-in-up">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title">
              <Zap className="w-5 h-5 text-brand-400" />
              Wachtrij
            </h2>
            {queuedProjects.length > 0 && !runningProject && (
              <button onClick={handleStartNext} disabled={loading} className="btn-success text-sm">
                <Play className="w-4 h-4" />
                Start Wachtrij
              </button>
            )}
          </div>

          {runningProject && (
            <div className="mb-4">
              <p className="text-xs text-zinc-500 font-medium mb-2 uppercase tracking-wider">Nu actief</p>
              <Link
                to={`/project/${runningProject.id}`}
                className="flex items-center gap-3 bg-blue-500/8 border border-blue-500/15 rounded-xl p-3.5 hover:bg-blue-500/12 transition-all duration-200 group"
              >
                <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" />
                <span className="font-semibold text-sm group-hover:text-blue-300 transition-colors">{runningProject.name}</span>
                <span className="text-sm text-zinc-500">{runningProject.title}</span>
              </Link>
            </div>
          )}

          {queuedProjects.length > 0 && (
            <div>
              <p className="text-xs text-zinc-500 font-medium mb-2 uppercase tracking-wider">
                In de wachtrij ({queuedProjects.length})
              </p>
              <div className="space-y-2">
                {queuedProjects.map((qp: any, index: number) => (
                  <div key={qp.id} className="flex items-center gap-3 bg-surface-200/60 rounded-xl p-3">
                    <span className="text-zinc-600 font-mono text-xs w-6">#{index + 1}</span>
                    <Link
                      to={`/project/${qp.id}`}
                      className="flex-1 hover:text-brand-300 transition-colors text-sm"
                    >
                      <span className="font-medium">{qp.name}</span>
                      <span className="text-zinc-500 ml-2">{qp.title}</span>
                    </Link>
                    <span className="badge badge-purple text-[10px]">
                      P{qp.priority}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => handlePriority(qp.id, qp.priority, 'up')} disabled={loading} className="btn-icon !p-1">
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handlePriority(qp.id, qp.priority, 'down')} disabled={loading || qp.priority === 0} className="btn-icon !p-1">
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDequeue(qp.id)} disabled={loading} className="btn-icon !p-1 text-red-400/60 hover:text-red-400">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Projects grid */}
      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[60vh] text-center animate-fade-in">
          <div className="w-20 h-20 rounded-3xl bg-surface-100 flex items-center justify-center mb-6 border border-white/[0.04]">
            <FileVideo className="w-10 h-10 text-zinc-600" />
          </div>
          <h2 className="text-xl font-semibold mb-2 text-zinc-300">Nog geen projecten</h2>
          <p className="text-zinc-600 mb-8 text-sm">Start je eerste project om aan de slag te gaan</p>
          <Link to="/project/new" className="btn-primary">
            <Plus className="w-4 h-4" />
            Nieuw Project
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project, i) => {
            const progress = getProgressPercentage(project.steps);
            const completedSteps = project.steps.filter((s) => s.status === 'completed').length;

            return (
              <Link
                key={project.id}
                to={`/project/${project.id}`}
                className="glass glass-hover rounded-2xl p-5 group"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-[15px] mb-0.5 group-hover:text-brand-300 transition-colors truncate">
                      {project.name}
                    </h3>
                    <p className="text-xs text-zinc-500 truncate">{project.title}</p>
                  </div>
                  {getStatusBadge(project.status)}
                </div>

                {project.priority !== undefined && project.priority > 0 && (
                  <div className="mb-2.5">
                    <span className="badge badge-purple text-[10px]">Prioriteit {project.priority}</span>
                  </div>
                )}

                <div className="mt-4">
                  <div className="flex justify-between text-[11px] text-zinc-500 mb-1.5">
                    <span>Voortgang</span>
                    <span className="font-mono">{completedSteps}/{project.steps.length}</span>
                  </div>
                  <div className="w-full bg-surface-300/50 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${getProgressColor(progress)} transition-all duration-700 ease-out`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
