import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Plus, FileVideo, Settings, ArrowLeft, Tv } from 'lucide-react';
import { useStore } from '../store';
import { Channel, ProjectStatus } from '../types';
import * as api from '../api';

export default function ChannelDetailPage() {
  const { channelId } = useParams<{ channelId: string }>();
  const projects = useStore((state) => state.projects);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (channelId) loadChannel();
  }, [channelId]);

  const loadChannel = async () => {
    try {
      const data = await api.channels.getOne(channelId!);
      setChannel(data);
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  };

  const channelProjects = projects.filter(p => p.channelId === channelId);

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
    if (!steps || steps.length === 0) return 0;
    const completed = steps.filter((s) => s.status === 'completed').length;
    return Math.round((completed / steps.length) * 100);
  };

  const getProgressColor = (pct: number) => {
    if (pct >= 100) return 'from-emerald-500 to-emerald-400';
    if (pct >= 50) return 'from-brand-500 to-blue-400';
    return 'from-brand-600 to-brand-400';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-500" />
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="p-8 text-center">
        <p className="text-zinc-500">Kanaal niet gevonden</p>
        <Link to="/" className="text-brand-400 hover:text-brand-300 text-sm mt-2 inline-block">← Terug naar Dashboard</Link>
      </div>
    );
  }

  return (
    <div className="p-8 animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <Link to="/" className="text-zinc-500 hover:text-zinc-300 text-sm flex items-center gap-1 mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-600/20 to-purple-600/20 flex items-center justify-center border border-white/[0.06]">
              <Tv className="w-6 h-6 text-brand-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{channel.name}</h1>
              <p className="text-sm text-zinc-500 mt-0.5">
                {channelProjects.length} project{channelProjects.length !== 1 ? 'en' : ''}
                {channel.description && <span> · {channel.description}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link to={`/channels`} className="btn-icon !p-2.5 text-zinc-500 hover:text-zinc-300" title="Kanaal beheren">
              <Settings className="w-4 h-4" />
            </Link>
            <Link to={`/channel/${channelId}/project/new`} className="btn-primary">
              <Plus className="w-4 h-4" /> Nieuw Project
            </Link>
          </div>
        </div>
      </div>

      {/* Channel quick stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Totaal', value: channelProjects.length, color: 'text-zinc-300' },
          { label: 'Actief', value: channelProjects.filter(p => p.status === 'running').length, color: 'text-blue-400' },
          { label: 'Voltooid', value: channelProjects.filter(p => p.status === 'completed').length, color: 'text-emerald-400' },
          { label: 'Mislukt', value: channelProjects.filter(p => p.status === 'failed').length, color: 'text-red-400' },
        ].map(stat => (
          <div key={stat.label} className="glass rounded-xl p-4 text-center">
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-zinc-500 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Projects grid */}
      {channelProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[40vh] text-center">
          <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-4 border border-white/[0.04]">
            <FileVideo className="w-8 h-8 text-zinc-600" />
          </div>
          <h2 className="text-lg font-semibold mb-2 text-zinc-300">Nog geen projecten</h2>
          <p className="text-zinc-600 mb-6 text-sm">Start je eerste project voor {channel.name}</p>
          <Link to={`/channel/${channelId}/project/new`} className="btn-primary">
            <Plus className="w-4 h-4" /> Nieuw Project
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {channelProjects.map((project, i) => {
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
