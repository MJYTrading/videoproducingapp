import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Tv, FileVideo, Settings, Zap, Play, X, Mic, BarChart3, DollarSign, Eye, RefreshCw, TrendingUp, Clock } from 'lucide-react';
import { useStore } from '../store';
import { Channel, ProjectStatus, VideoType, VIDEO_TYPE_LABELS, Language } from '../types';
import * as api from '../api';

const VIDEO_TYPES: VideoType[] = ['ai', 'spokesperson_ai', 'trending', 'documentary', 'compilation', 'spokesperson'];
const AI_SUBSTYLES = [
  { value: '3d-render', label: '3D Render' },
  { value: 'stickman', label: 'Stickman' },
  { value: '2d-animation', label: '2D Animatie' },
  { value: 'history', label: 'History' },
  { value: 'realistic', label: 'Realistisch' },
];
const OUTPUT_FORMATS = [
  { value: 'youtube-1080p', label: 'YouTube 1080p' },
  { value: 'youtube-4k', label: 'YouTube 4K' },
  { value: 'shorts', label: 'Shorts' },
];
const ASPECT_RATIOS = [
  { value: 'landscape', label: 'Landscape (16:9)' },
  { value: 'portrait', label: 'Portrait (9:16)' },
  { value: 'square', label: 'Square (1:1)' },
];
const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'EN', label: 'English' },
  { value: 'NL', label: 'Nederlands' },
];

const isAiType = (vt: string) => vt === 'ai' || vt === 'spokesperson_ai';

// ── Formatteer getal (1234 → 1.2K) ──
function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString('nl-NL');
}

function formatCurrency(n: number): string {
  return '€' + n.toFixed(2);
}

// ── Analytics Panel Component ──

function AnalyticsPanel() {
  const [summary, setSummary] = useState<any>(null);
  const [revenue, setRevenue] = useState<any>(null);
  const [revenuePeriod, setRevenuePeriod] = useState('day');
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [editRpm, setEditRpm] = useState<{ id: string; rpm: string } | null>(null);

  const loadAnalytics = useCallback(async () => {
    try {
      const [summaryData, revenueData] = await Promise.all([
        api.analytics.getSummary().catch(() => null),
        api.analytics.getRevenue(revenuePeriod).catch(() => null),
      ]);
      if (summaryData) setSummary(summaryData);
      if (revenueData) setRevenue(revenueData);
    } catch {}
    setLoading(false);
  }, [revenuePeriod]);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  const handleFetchViews = async () => {
    setFetching(true);
    try {
      await api.analytics.fetchViews();
      await loadAnalytics();
    } catch (err: any) {
      alert(err.message || 'Views ophalen mislukt');
    }
    setFetching(false);
  };

  const handleSaveRpm = async () => {
    if (!editRpm) return;
    try {
      await api.analytics.updateRpm(editRpm.id, parseFloat(editRpm.rpm) || 0);
      setEditRpm(null);
      await loadAnalytics();
    } catch (err: any) {
      alert(err.message || 'RPM opslaan mislukt');
    }
  };

  if (loading) {
    return (
      <div className="glass rounded-2xl p-6 mb-8 animate-fade-in-up">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-brand-400" />
          <h2 className="section-title !mb-0">Analytics</h2>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-brand-500" />
        </div>
      </div>
    );
  }

  if (!summary || !summary.channels || summary.channels.length === 0) {
    return (
      <div className="glass rounded-2xl p-6 mb-8 animate-fade-in-up">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-brand-400" />
            <h2 className="section-title !mb-0">Analytics</h2>
          </div>
          <button onClick={handleFetchViews} disabled={fetching} className="btn-secondary text-xs">
            <RefreshCw className={`w-3.5 h-3.5 ${fetching ? 'animate-spin' : ''}`} />
            {fetching ? 'Ophalen...' : 'Views Ophalen'}
          </button>
        </div>
        <p className="text-zinc-500 text-sm text-center py-4">
          Geen analytics data. Stel YouTube Channel IDs in bij je kanalen en een RapidAPI key in Settings, klik dan op "Views Ophalen".
        </p>
      </div>
    );
  }

  // Bereken max views voor chart schaal
  const maxViews = Math.max(1, ...summary.hourlyData.map((h: any) => h.views));
  const channelColors = ['#6366f1', '#22d3ee', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6'];

  return (
    <div className="glass rounded-2xl p-6 mb-8 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-brand-400" />
          <h2 className="section-title !mb-0">Analytics</h2>
        </div>
        <button onClick={handleFetchViews} disabled={fetching} className="btn-secondary text-xs">
          <RefreshCw className={`w-3.5 h-3.5 ${fetching ? 'animate-spin' : ''}`} />
          {fetching ? 'Ophalen...' : 'Vernieuwen'}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-surface-200/60 rounded-xl p-4 border border-white/[0.04]">
          <div className="flex items-center gap-2 mb-1">
            <Eye className="w-4 h-4 text-blue-400" />
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Views 24u</span>
          </div>
          <p className="text-xl font-bold">{formatNumber(summary.totalViews24h)}</p>
        </div>
        <div className="bg-surface-200/60 rounded-xl p-4 border border-white/[0.04]">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Inkomsten 24u</span>
          </div>
          <p className="text-xl font-bold text-emerald-400">{formatCurrency(summary.totalRevenue24h)}</p>
        </div>
        <div className="bg-surface-200/60 rounded-xl p-4 border border-white/[0.04]">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Per uur</span>
          </div>
          <p className="text-xl font-bold text-amber-400">{formatCurrency(summary.revenuePerHourAvg)}</p>
        </div>
        <div className="bg-surface-200/60 rounded-xl p-4 border border-white/[0.04]">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-purple-400" />
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
              {revenuePeriod === 'hour' ? 'Per uur' : revenuePeriod === 'day' ? 'Per dag' : revenuePeriod === 'week' ? 'Per week' : 'Per maand'}
            </span>
          </div>
          <p className="text-xl font-bold text-purple-400">{revenue ? formatCurrency(revenue.totalRevenue) : '—'}</p>
          <div className="flex gap-1 mt-2">
            {['hour', 'day', 'week', 'month'].map(p => (
              <button key={p} onClick={() => setRevenuePeriod(p)}
                className={`text-[9px] px-1.5 py-0.5 rounded ${revenuePeriod === p ? 'bg-purple-500/20 text-purple-300' : 'bg-surface-300/50 text-zinc-600'}`}>
                {p === 'hour' ? 'Uur' : p === 'day' ? 'Dag' : p === 'week' ? 'Week' : 'Maand'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Views Chart — 24 uur staafdiagram */}
      <div className="mb-5">
        <p className="text-xs text-zinc-500 font-medium mb-3">Views per uur (afgelopen 24 uur)</p>
        <div className="flex items-end gap-[3px] h-32 bg-surface-200/30 rounded-xl p-3 border border-white/[0.04]">
          {summary.hourlyData.map((h: any, i: number) => {
            const height = maxViews > 0 ? Math.max(2, (h.views / maxViews) * 100) : 2;
            const hourDate = new Date(h.hour);
            const hourLabel = hourDate.getHours().toString().padStart(2, '0') + ':00';
            return (
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                {/* Stacked bar per channel */}
                <div className="w-full rounded-t-sm overflow-hidden flex flex-col-reverse" style={{ height: `${height}%` }}>
                  {summary.channels.map((ch: any, ci: number) => {
                    const chViews = h.byChannel[ch.id] || 0;
                    const chPct = h.views > 0 ? (chViews / h.views) * 100 : 0;
                    return (
                      <div key={ch.id} style={{ height: `${chPct}%`, backgroundColor: channelColors[ci % channelColors.length] }}
                        className="w-full min-h-0 transition-all" />
                    );
                  })}
                  {summary.channels.length === 0 && (
                    <div className="w-full h-full bg-brand-500/60 rounded-t-sm" />
                  )}
                </div>
                {/* Tooltip */}
                <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                  <div className="bg-surface-50 border border-white/[0.1] rounded-lg p-2 text-[10px] whitespace-nowrap shadow-xl">
                    <p className="font-medium">{hourLabel}</p>
                    <p className="text-zinc-400">{formatNumber(h.views)} views</p>
                  </div>
                </div>
                {/* Uur label (elke 3 uur) */}
                {i % 3 === 0 && (
                  <span className="text-[8px] text-zinc-600 mt-1 font-mono">{hourLabel}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Per kanaal breakdown */}
      <div className="space-y-2">
        <p className="text-xs text-zinc-500 font-medium">Per kanaal</p>
        {summary.channels.map((ch: any, ci: number) => (
          <div key={ch.id} className="flex items-center gap-3 bg-surface-200/40 rounded-lg px-3 py-2 border border-white/[0.04]">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: channelColors[ci % channelColors.length] }} />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium truncate">{ch.name}</span>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="text-zinc-400">{formatNumber(ch.views24h)} views</span>
              <span className="text-emerald-400 font-medium">{formatCurrency(ch.revenue24h)}</span>
              {/* RPM */}
              {editRpm?.id === ch.id ? (
                <div className="flex items-center gap-1">
                  <input type="number" step="0.01" value={editRpm.rpm}
                    onChange={e => setEditRpm({ ...editRpm, rpm: e.target.value })}
                    className="input-base !w-16 text-xs !py-1" autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveRpm(); if (e.key === 'Escape') setEditRpm(null); }} />
                  <button onClick={handleSaveRpm} className="text-emerald-400 hover:text-emerald-300 text-[10px]">OK</button>
                </div>
              ) : (
                <button onClick={() => setEditRpm({ id: ch.id, rpm: String(ch.rpm) })}
                  className="text-zinc-500 hover:text-zinc-300 transition-colors" title="RPM aanpassen">
                  RPM: €{ch.rpm.toFixed(2)}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Dashboard ──

export default function DashboardPage() {
  const projects = useStore((state) => state.projects);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [voices, setVoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [queueData, setQueueData] = useState<{ running: any; queued: any[] } | null>(null);

  // Nieuw kanaal modal
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newYoutubeId, setNewYoutubeId] = useState('');
  const [newVideoType, setNewVideoType] = useState<VideoType>('ai');
  const [newVisualStyle, setNewVisualStyle] = useState('3d-render');
  const [newDrive, setNewDrive] = useState('');
  const [newVoiceId, setNewVoiceId] = useState('');
  const [newScriptLength, setNewScriptLength] = useState(8);
  const [newOutputFormat, setNewOutputFormat] = useState('youtube-1080p');
  const [newAspectRatio, setNewAspectRatio] = useState('landscape');
  const [newLanguage, setNewLanguage] = useState<Language>('EN');
  const [newSubtitles, setNewSubtitles] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadData();
    const interval = setInterval(fetchQueue, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [channelsData, queueResult, voicesData] = await Promise.all([
        api.channels.getAll(),
        api.queue.getQueue().catch(() => null),
        api.voices.getAll().catch(() => []),
      ]);
      setChannels(channelsData);
      setQueueData(queueResult);
      setVoices(voicesData);
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchQueue = async () => { try { setQueueData(await api.queue.getQueue()); } catch {} };

  const handleCreateChannel = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.channels.create({
        name: newName.trim(),
        description: newDesc.trim() || null,
        youtubeChannelId: newYoutubeId.trim(),
        defaultVideoType: newVideoType,
        defaultVisualStyle: isAiType(newVideoType) ? newVisualStyle : '',
        driveFolderId: newDrive.trim(),
        defaultVoiceId: newVoiceId,
        defaultScriptLengthMinutes: newScriptLength,
        defaultOutputFormat: newOutputFormat,
        defaultAspectRatio: newAspectRatio,
        defaultLanguage: newLanguage,
        defaultSubtitles: newSubtitles,
      });
      setNewName(''); setNewDesc(''); setNewYoutubeId(''); setNewVideoType('ai'); setNewVisualStyle('3d-render');
      setNewDrive(''); setNewVoiceId(''); setNewScriptLength(8); setNewOutputFormat('youtube-1080p');
      setNewAspectRatio('landscape'); setNewLanguage('EN'); setNewSubtitles(true);
      setShowNewChannel(false);
      await loadData();
      useStore.getState().fetchProjects();
    } catch (err: any) { alert(err.message || 'Aanmaken mislukt'); }
    setCreating(false);
  };

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
    return Math.round((steps.filter(s => s.status === 'completed').length / steps.length) * 100);
  };

  const getProgressColor = (pct: number) => {
    if (pct >= 100) return 'from-emerald-500 to-emerald-400';
    if (pct >= 50) return 'from-brand-500 to-blue-400';
    return 'from-brand-600 to-brand-400';
  };

  const runningProject = queueData?.running;
  const queuedProjects = queueData?.queued || [];
  const channelProjects = (channelId: string) => projects.filter(p => p.channelId === channelId);
  const unassignedProjects = projects.filter(p => !p.channelId);

  if (loading) {
    return <div className="flex items-center justify-center h-[60vh]"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-500" /></div>;
  }

  const ProjectCard = ({ project }: { project: any }) => {
    const progress = getProgressPercentage(project.steps);
    const completedSteps = project.steps.filter((s: any) => s.status === 'completed').length;
    return (
      <Link to={`/project/${project.id}`} className="bg-surface-100/50 hover:bg-surface-200/50 border border-white/[0.04] hover:border-white/[0.08] rounded-xl p-4 transition-all duration-200 group">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0"><h4 className="font-medium text-sm group-hover:text-brand-300 transition-colors truncate">{project.name}</h4><p className="text-[11px] text-zinc-600 truncate">{project.title}</p></div>
          {getStatusBadge(project.status)}
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-[10px] text-zinc-600 mb-1"><span>Voortgang</span><span className="font-mono">{completedSteps}/{project.steps.length}</span></div>
          <div className="w-full bg-surface-300/50 rounded-full h-1 overflow-hidden"><div className={`h-full rounded-full bg-gradient-to-r ${getProgressColor(progress)} transition-all duration-700`} style={{ width: `${progress}%` }} /></div>
        </div>
      </Link>
    );
  };

  return (
    <div className="p-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-1">{channels.length} kanaal{channels.length !== 1 ? 'en' : ''} · {projects.length} project{projects.length !== 1 ? 'en' : ''}</p>
        </div>
        <button onClick={() => setShowNewChannel(true)} className="btn-primary"><Plus className="w-4 h-4" /> Nieuw Kanaal</button>
      </div>

      {/* ═══ ANALYTICS PANEL ═══ */}
      <AnalyticsPanel />

      {/* Queue */}
      {(runningProject || queuedProjects.length > 0) && (
        <div className="mb-8 glass rounded-2xl p-6 animate-fade-in-up">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title !mb-0 flex items-center gap-2"><Zap className="w-5 h-5 text-brand-400" />Wachtrij</h2>
            {queuedProjects.length > 0 && !runningProject && <button onClick={async () => { await api.queue.startNext(); loadData(); }} className="btn-success text-sm"><Play className="w-4 h-4" /> Start</button>}
          </div>
          {runningProject && (
            <div className="mb-4"><p className="text-xs text-zinc-500 font-medium mb-2 uppercase tracking-wider">Nu actief</p>
              <Link to={`/project/${runningProject.id}`} className="flex items-center gap-3 bg-blue-500/8 border border-blue-500/15 rounded-xl p-3.5 hover:bg-blue-500/12 transition-all group">
                <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" /><span className="font-semibold text-sm group-hover:text-blue-300">{runningProject.name}</span><span className="text-sm text-zinc-500">{runningProject.title}</span>
              </Link></div>
          )}
          {queuedProjects.length > 0 && (
            <div><p className="text-xs text-zinc-500 font-medium mb-2 uppercase tracking-wider">Wachtrij ({queuedProjects.length})</p>
              <div className="space-y-2">{queuedProjects.map((qp: any, i: number) => (
                <div key={qp.id} className="flex items-center gap-3 bg-surface-200/60 rounded-xl p-3"><span className="text-zinc-600 font-mono text-xs w-6">#{i+1}</span>
                  <Link to={`/project/${qp.id}`} className="flex-1 hover:text-brand-300 text-sm"><span className="font-medium">{qp.name}</span><span className="text-zinc-500 ml-2">{qp.title}</span></Link>
                  <span className="badge badge-purple text-[10px]">P{qp.priority}</span></div>
              ))}</div></div>
          )}
        </div>
      )}

      {/* Kanalen */}
      {channels.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[50vh] text-center animate-fade-in">
          <div className="w-20 h-20 rounded-3xl bg-surface-100 flex items-center justify-center mb-6 border border-white/[0.04]"><Tv className="w-10 h-10 text-zinc-600" /></div>
          <h2 className="text-xl font-semibold mb-2 text-zinc-300">Nog geen kanalen</h2>
          <p className="text-zinc-600 mb-8 text-sm">Maak een kanaal aan om te beginnen</p>
          <button onClick={() => setShowNewChannel(true)} className="btn-primary"><Plus className="w-4 h-4" /> Kanaal Aanmaken</button>
        </div>
      ) : (
        <div className="space-y-6">
          {channels.map(channel => {
            const chProjects = channelProjects(channel.id);
            const activeCount = chProjects.filter(p => p.status === 'running' || p.status === 'review').length;
            return (
              <div key={channel.id} className="glass rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b border-white/[0.04]">
                  <Link to={`/channel/${channel.id}`} className="flex items-center gap-3 group flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-600/20 to-purple-600/20 flex items-center justify-center border border-white/[0.06] shrink-0"><Tv className="w-5 h-5 text-brand-400" /></div>
                    <div className="min-w-0"><h3 className="font-semibold text-[15px] group-hover:text-brand-300 transition-colors truncate">{channel.name}</h3>
                      <p className="text-xs text-zinc-500">{channel.projectCount || 0} project{(channel.projectCount || 0) !== 1 ? 'en' : ''}{activeCount > 0 && <span className="text-brand-400 ml-2">· {activeCount} actief</span>}</p></div>
                  </Link>
                  <div className="flex items-center gap-2">
                    <Link to="/channels" className="btn-icon !p-2 text-zinc-500 hover:text-zinc-300" title="Instellingen"><Settings className="w-4 h-4" /></Link>
                    <Link to={`/channel/${channel.id}/project/new`} className="btn-primary text-xs !py-2 !px-3"><Plus className="w-3.5 h-3.5" /> Nieuw Project</Link>
                  </div>
                </div>
                {chProjects.length > 0 ? (
                  <div className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{chProjects.slice(0, 6).map(p => <ProjectCard key={p.id} project={p} />)}</div>
                    {chProjects.length > 6 && <Link to={`/channel/${channel.id}`} className="block text-center text-xs text-brand-400 hover:text-brand-300 mt-3 py-2">Alle {chProjects.length} projecten →</Link>}
                  </div>
                ) : <div className="p-6 text-center"><p className="text-zinc-600 text-sm">Nog geen projecten</p></div>}
              </div>
            );
          })}
          {unassignedProjects.length > 0 && (
            <div className="glass rounded-2xl overflow-hidden">
              <div className="flex items-center gap-3 p-5 border-b border-white/[0.04]"><div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center border border-white/[0.06]"><FileVideo className="w-5 h-5 text-zinc-500" /></div><div><h3 className="font-semibold text-[15px] text-zinc-400">Zonder kanaal</h3><p className="text-xs text-zinc-600">{unassignedProjects.length} project{unassignedProjects.length !== 1 ? 'en' : ''}</p></div></div>
              <div className="p-4"><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{unassignedProjects.slice(0, 6).map(p => <ProjectCard key={p.id} project={p} />)}</div></div>
            </div>
          )}
        </div>
      )}

      {/* ═══ NIEUW KANAAL MODAL ═══ */}
      {showNewChannel && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-strong rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-scale-in">
            <div className="p-6 border-b border-white/[0.06] flex items-center justify-between sticky top-0 bg-surface-50/95 backdrop-blur-xl z-10 rounded-t-2xl">
              <h3 className="text-lg font-semibold">Nieuw Kanaal</h3>
              <button onClick={() => setShowNewChannel(false)} className="btn-icon !p-1.5"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Basis Info</p>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs text-zinc-500 mb-1">Naam *</label><input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Kanaalnaam" className="input-base text-sm" autoFocus /></div>
                  <div><label className="block text-xs text-zinc-500 mb-1">YouTube Channel ID</label><input type="text" value={newYoutubeId} onChange={e => setNewYoutubeId(e.target.value)} placeholder="UC..." className="input-base text-sm" /></div>
                  <div><label className="block text-xs text-zinc-500 mb-1">Beschrijving</label><input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Optioneel" className="input-base text-sm" /></div>
                  <div><label className="block text-xs text-zinc-500 mb-1">Drive Folder ID</label><input type="text" value={newDrive} onChange={e => setNewDrive(e.target.value)} placeholder="Optioneel" className="input-base text-sm" /></div>
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Video Type & Stijl</p>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs text-zinc-500 mb-1">Video Type</label>
                    <select value={newVideoType} onChange={e => setNewVideoType(e.target.value as VideoType)} className="input-base text-sm">{VIDEO_TYPES.map(vt => <option key={vt} value={vt}>{VIDEO_TYPE_LABELS[vt]}</option>)}</select></div>
                  {isAiType(newVideoType) && (
                    <div><label className="block text-xs text-zinc-500 mb-1">AI Visuele Stijl</label>
                      <select value={newVisualStyle} onChange={e => setNewVisualStyle(e.target.value)} className="input-base text-sm">{AI_SUBSTYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Standaard Instellingen</p>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs text-zinc-500 mb-1 flex items-center gap-1"><Mic className="w-3 h-3" /> Voice</label>
                    <select value={newVoiceId} onChange={e => setNewVoiceId(e.target.value)} className="input-base text-sm"><option value="">— Geen standaard —</option>{voices.map(v => <option key={v.id} value={v.voiceId}>{v.name} — {v.description}</option>)}</select></div>
                  <div><label className="block text-xs text-zinc-500 mb-1">Script Lengte (min)</label>
                    <input type="number" step="0.5" min="1" max="60" value={newScriptLength} onChange={e => setNewScriptLength(parseFloat(e.target.value) || 8)} className="input-base text-sm" />
                    <p className="text-[10px] text-zinc-600 mt-1">≈ {Math.round(newScriptLength * 150)} woorden</p></div>
                  <div><label className="block text-xs text-zinc-500 mb-1">Output Formaat</label>
                    <select value={newOutputFormat} onChange={e => setNewOutputFormat(e.target.value)} className="input-base text-sm">{OUTPUT_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</select></div>
                  <div><label className="block text-xs text-zinc-500 mb-1">Aspect Ratio</label>
                    <select value={newAspectRatio} onChange={e => setNewAspectRatio(e.target.value)} className="input-base text-sm">{ASPECT_RATIOS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}</select></div>
                  <div><label className="block text-xs text-zinc-500 mb-1">Taal</label>
                    <select value={newLanguage} onChange={e => setNewLanguage(e.target.value as Language)} className="input-base text-sm">{LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}</select></div>
                  <div className="flex items-center gap-3 pt-5">
                    <button onClick={() => setNewSubtitles(!newSubtitles)} className={`relative w-11 h-6 rounded-full transition-colors ${newSubtitles ? 'bg-emerald-600' : 'bg-surface-400'}`}>
                      <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${newSubtitles ? 'translate-x-5' : ''}`} /></button>
                    <span className="text-sm text-zinc-300">Ondertiteling</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-white/[0.06] flex justify-end gap-3 sticky bottom-0 bg-surface-50/95 backdrop-blur-xl rounded-b-2xl">
              <button onClick={() => setShowNewChannel(false)} className="btn-secondary text-sm">Annuleren</button>
              <button onClick={handleCreateChannel} disabled={!newName.trim() || creating} className="btn-primary text-sm">{creating ? 'Aanmaken...' : 'Kanaal Aanmaken'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
