import { useState, useMemo, useEffect } from 'react';
import { Search, RefreshCw, Download, ChevronUp, ChevronDown, List, Activity } from 'lucide-react';
import { Project } from '../types';
import * as api from '../api';

interface LogsTabProps {
  project: Project;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type SortField = 'timestamp' | 'level' | 'step' | 'source' | 'message';
type SortDirection = 'asc' | 'desc';
type ViewMode = 'feed' | 'table';

const STEP_NAMES: Record<number, string> = {
  0: 'Ideation', 1: 'Project Formulier', 2: 'Research JSON', 3: 'Transcripts',
  4: 'Trending Clips', 5: 'Style Profile', 6: 'Script Orchestrator', 7: 'Script',
  8: 'Voice Over', 9: 'Avatar', 10: 'Timestamps', 11: 'Scene Prompts',
  12: 'Assets Zoeken', 13: 'Clips Downloaden', 14: 'Images Genereren',
  15: 'Video Scenes', 16: "Director's Cut", 17: 'Muziek', 18: 'Color Grading',
  19: 'Subtitles', 20: 'Overlay', 21: 'Sound Effects', 22: 'Video Effects',
  23: 'Final Export', 24: 'Thumbnail', 25: 'Drive Upload',
};

const SOURCE_COLORS: Record<string, string> = {
  'App': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Elevate': 'bg-green-500/10 text-green-400 border-green-500/20',
  'Elevate AI': 'bg-green-500/10 text-green-400 border-green-500/20',
  'Elevate Sonar': 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  'Elevate Opus': 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  'Assembly AI': 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  'Claude Opus': 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  'FFMPEG': 'bg-red-500/10 text-red-400 border-red-500/20',
  'HeyGen': 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  'N8N': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  'GenAIPro': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Pexels': 'bg-lime-500/10 text-lime-400 border-lime-500/20',
  'Sonar': 'bg-teal-500/10 text-teal-400 border-teal-500/20',
};

const LEVEL_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  debug: { icon: '🔍', color: 'text-zinc-400', bg: 'bg-zinc-500/8 border-zinc-500/15' },
  info: { icon: 'ℹ️', color: 'text-blue-400', bg: 'bg-blue-500/8 border-blue-500/15' },
  warn: { icon: '⚠️', color: 'text-amber-400', bg: 'bg-amber-500/8 border-amber-500/15' },
  error: { icon: '❌', color: 'text-red-400', bg: 'bg-red-500/8 border-red-500/15' },
};

export default function LogsTab({ project }: LogsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<LogLevel | 'all'>('all');
  const [stepFilter, setStepFilter] = useState<number | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<string | 'all'>('all');
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>('feed');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [logs, setLogs] = useState(project.logs || []);
  const itemsPerPage = 50;

  // Sync logs from project prop
  useEffect(() => {
    setLogs(project.logs || []);
  }, [project.logs]);

  // Auto-refresh elke 5 seconden als pipeline draait
  useEffect(() => {
    if (!autoRefresh) return;
    const isRunning = project.steps?.some((s: any) => s.status === 'running' || s.status === 'processing');
    if (!isRunning) return;

    const interval = setInterval(async () => {
      try {
        const freshProject = await api.projects.get(project.id);
        if (freshProject?.logs) setLogs(freshProject.logs);
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, project.id, project.steps]);

  const filteredLogs = useMemo(() => {
    let filtered = [...logs];
    if (searchQuery) filtered = filtered.filter(l => l.message.toLowerCase().includes(searchQuery.toLowerCase()));
    if (levelFilter !== 'all') filtered = filtered.filter(l => l.level === levelFilter);
    if (stepFilter !== 'all') filtered = filtered.filter(l => l.step === stepFilter);
    if (sourceFilter !== 'all') filtered = filtered.filter(l => l.source === sourceFilter);

    filtered.sort((a, b) => {
      let aVal: any = (a as any)[sortField];
      let bVal: any = (b as any)[sortField];
      if (sortField === 'timestamp') { aVal = new Date(aVal).getTime(); bVal = new Date(bVal).getTime(); }
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return filtered;
  }, [logs, searchQuery, levelFilter, stepFilter, sourceFilter, sortField, sortDirection]);

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const paginatedLogs = filteredLogs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const uniqueSteps = Array.from(new Set(logs.map(l => l.step))).sort((a, b) => a - b);
  const uniqueSources = Array.from(new Set(logs.map(l => l.source))).sort();

  const handleSort = (field: SortField) => {
    if (sortField === field) { setSortDirection(d => d === 'asc' ? 'desc' : 'asc'); }
    else { setSortField(field); setSortDirection('asc'); }
  };

  const handleExportCSV = () => {
    const headers = ['Timestamp', 'Level', 'Step', 'Source', 'Message', 'Duration (ms)', 'Detail'];
    const rows = filteredLogs.map(l => [
      new Date(l.timestamp).toLocaleString('nl-NL'), l.level, l.step.toString(), l.source,
      l.message.replace(/,/g, ';'), (l as any).durationMs?.toString() || '', ((l as any).detail || '').replace(/,/g, ';'),
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `${project.name}-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setSearchQuery(''); setLevelFilter('all'); setStepFilter('all'); setSourceFilter('all');
  };

  const formatTime = (ts: string) => new Date(ts).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const formatDate = (ts: string) => new Date(ts).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' });
  const formatDuration = (ms: number | null | undefined) => {
    if (ms == null) return null;
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };
  const formatDetail = (detail: string | null | undefined) => {
    if (!detail) return null;
    try { return JSON.stringify(JSON.parse(detail), null, 2); }
    catch { return detail; }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  };

  const groupedByDate = useMemo(() => {
    const groups: Record<string, typeof paginatedLogs> = {};
    paginatedLogs.forEach(log => {
      const date = formatDate(log.timestamp);
      if (!groups[date]) groups[date] = [];
      groups[date].push(log);
    });
    return groups;
  }, [paginatedLogs]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="glass rounded-xl p-4">
        <div className="flex flex-wrap gap-2.5 items-center">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Zoek in logs..." className="input-base !pl-10 text-sm" />
          </div>

          <select value={levelFilter} onChange={e => setLevelFilter(e.target.value as LogLevel | 'all')} className="input-base text-sm !w-auto !py-2">
            <option value="all">Alle levels</option>
            <option value="debug">🔍 Debug</option>
            <option value="info">ℹ️ Info</option>
            <option value="warn">⚠️ Waarschuwing</option>
            <option value="error">❌ Error</option>
          </select>

          <select value={stepFilter} onChange={e => setStepFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))} className="input-base text-sm !w-auto !py-2">
            <option value="all">Alle stappen</option>
            {uniqueSteps.map(s => <option key={s} value={s}>{s}. {STEP_NAMES[s] || `Stap ${s}`}</option>)}
          </select>

          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className="input-base text-sm !w-auto !py-2">
            <option value="all">Alle bronnen</option>
            {uniqueSources.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <div className="flex gap-1.5">
            <button onClick={() => setViewMode('feed')} className={`p-2 rounded-lg transition-colors ${viewMode === 'feed' ? 'bg-brand-500/20 text-brand-300' : 'bg-surface-200 text-zinc-500 hover:text-zinc-300'}`} title="Activity Feed">
              <Activity className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('table')} className={`p-2 rounded-lg transition-colors ${viewMode === 'table' ? 'bg-brand-500/20 text-brand-300' : 'bg-surface-200 text-zinc-500 hover:text-zinc-300'}`} title="Tabel">
              <List className="w-4 h-4" />
            </button>
          </div>

          <button onClick={resetFilters} className="btn-secondary text-xs !py-2"><RefreshCw className="w-3.5 h-3.5" /> Reset</button>
          <button onClick={handleExportCSV} className="btn-primary text-xs !py-2"><Download className="w-3.5 h-3.5" /> CSV</button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="flex gap-3">
        {(['debug', 'info', 'warn', 'error'] as LogLevel[]).map(level => {
          const count = logs.filter(l => l.level === level).length;
          const cfg = LEVEL_CONFIG[level];
          return (
            <button key={level} onClick={() => setLevelFilter(levelFilter === level ? 'all' : level)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                levelFilter === level ? cfg.bg + ' border' : 'bg-surface-100 border-white/[0.04] text-zinc-500 hover:text-zinc-300'
              }`}>
              <span>{cfg.icon}</span>
              <span>{count}</span>
            </button>
          );
        })}
        <div className="flex-1" />
        <button onClick={() => setAutoRefresh(!autoRefresh)}
          className={`text-[10px] px-2 py-1 rounded-md transition-colors ${autoRefresh ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-surface-200 text-zinc-600 border border-white/[0.04]'}`}>
          {autoRefresh ? '● Live' : '○ Paused'}
        </button>
        <span className="text-[11px] text-zinc-600 self-center">{filteredLogs.length} logs</span>
      </div>

      {/* Content */}
      {paginatedLogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Activity className="w-10 h-10 text-zinc-700 mb-3" />
          <p className="text-zinc-500 text-sm">Geen logs gevonden</p>
          <p className="text-zinc-600 text-xs mt-1">Logs verschijnen zodra de pipeline stappen uitvoert</p>
        </div>
      ) : viewMode === 'feed' ? (
        <div className="space-y-4">
          {Object.entries(groupedByDate).map(([date, dateLogs]) => (
            <div key={date}>
              <div className="sticky top-0 z-10 py-1.5 mb-2">
                <span className="text-[11px] text-zinc-600 font-medium bg-surface px-2 py-0.5 rounded">{date}</span>
              </div>
              <div className="space-y-1">
                {dateLogs.map(log => {
                  const cfg = LEVEL_CONFIG[log.level] || LEVEL_CONFIG.info;
                  const srcColor = SOURCE_COLORS[log.source] || 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
                  const isExpanded = expandedRow === log.id;
                  const duration = formatDuration((log as any).durationMs);
                  const detail = formatDetail((log as any).detail);
                  return (
                    <div key={log.id} onClick={() => setExpandedRow(isExpanded ? null : log.id)}
                      className={`flex gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all hover:bg-white/[0.02] ${
                        log.level === 'error' ? 'bg-red-500/[0.03]' : log.level === 'warn' ? 'bg-amber-500/[0.02]' : ''
                      }`}>
                      <div className="flex flex-col items-center pt-1 shrink-0">
                        <div className={`w-2 h-2 rounded-full ${
                          log.level === 'error' ? 'bg-red-500' : log.level === 'warn' ? 'bg-amber-500' : log.level === 'debug' ? 'bg-zinc-600' : 'bg-brand-500/60'
                        }`} />
                        <div className="w-px flex-1 bg-white/[0.04] mt-1" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[11px] text-zinc-600 font-mono shrink-0">{formatTime(log.timestamp)}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0 ${srcColor}`}>{log.source}</span>
                          <span className="text-[10px] text-zinc-600 shrink-0">stap {log.step}</span>
                          {STEP_NAMES[log.step] && <span className="text-[10px] text-zinc-700 truncate">{STEP_NAMES[log.step]}</span>}
                          {duration && <span className="text-[10px] text-zinc-600 font-mono shrink-0">{duration}</span>}
                          {detail && <span className="text-[10px] text-brand-500/60 shrink-0">📎</span>}
                        </div>
                        <p className={`text-sm leading-relaxed ${
                          log.level === 'error' ? 'text-red-300' : log.level === 'warn' ? 'text-amber-300' : log.level === 'debug' ? 'text-zinc-500' : 'text-zinc-300'
                        } ${isExpanded ? '' : 'truncate'}`}>
                          {log.message}
                        </p>
                        {isExpanded && detail && (
                          <pre className="mt-2 p-3 rounded-lg bg-surface-200/60 border border-white/[0.04] text-[11px] text-zinc-400 font-mono overflow-x-auto max-h-48 whitespace-pre-wrap">
                            {detail}
                          </pre>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {[
                  { field: 'timestamp' as SortField, label: 'Tijd' },
                  { field: 'level' as SortField, label: 'Level' },
                  { field: 'step' as SortField, label: 'Stap' },
                  { field: 'source' as SortField, label: 'Bron' },
                ].map(col => (
                  <th key={col.field} onClick={() => handleSort(col.field)}
                    className="text-left px-3 py-2.5 text-[11px] font-semibold text-zinc-500 uppercase cursor-pointer hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-center gap-1">{col.label}<SortIcon field={col.field} /></div>
                  </th>
                ))}
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-zinc-500 uppercase">Bericht</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-zinc-500 uppercase w-20">Duur</th>
              </tr>
            </thead>
            <tbody>
              {paginatedLogs.map(log => {
                const srcColor = SOURCE_COLORS[log.source] || 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
                const isExpanded = expandedRow === log.id;
                const duration = formatDuration((log as any).durationMs);
                const detail = formatDetail((log as any).detail);
                return (
                  <tr key={log.id} onClick={() => setExpandedRow(isExpanded ? null : log.id)}
                    className={`border-b border-white/[0.03] cursor-pointer transition-colors ${
                      log.level === 'error' ? 'bg-red-500/[0.03] hover:bg-red-500/[0.06]' : 'hover:bg-white/[0.02]'
                    }`}>
                    <td className="px-3 py-2 text-[11px] text-zinc-500 font-mono">{formatTime(log.timestamp)}</td>
                    <td className="px-3 py-2 text-sm">{LEVEL_CONFIG[log.level]?.icon || '•'}</td>
                    <td className="px-3 py-2 text-[11px] text-zinc-400 font-mono">{log.step}</td>
                    <td className="px-3 py-2"><span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${srcColor}`}>{log.source}</span></td>
                    <td className={`px-3 py-2 text-xs ${log.level === 'error' ? 'text-red-300' : log.level === 'debug' ? 'text-zinc-500' : 'text-zinc-300'}`}>
                      <div className={isExpanded ? '' : 'truncate max-w-lg'}>
                        {log.message}
                        {detail && <span className="text-brand-500/60 ml-1">📎</span>}
                      </div>
                      {isExpanded && detail && (
                        <pre className="mt-2 p-2 rounded-lg bg-surface-200/60 border border-white/[0.04] text-[11px] text-zinc-400 font-mono overflow-x-auto max-h-48 whitespace-pre-wrap">
                          {detail}
                        </pre>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[10px] text-zinc-600 font-mono">{duration || ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-zinc-600">Pagina {currentPage} van {totalPages}</p>
          <div className="flex gap-2">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              className="btn-secondary text-xs !py-1.5 disabled:opacity-30">Vorige</button>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
              className="btn-secondary text-xs !py-1.5 disabled:opacity-30">Volgende</button>
          </div>
        </div>
      )}
    </div>
  );
}
