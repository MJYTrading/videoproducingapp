import { useState, useMemo } from 'react';
import { Project, LogLevel } from '../types';

interface LogsTabProps {
  project: Project;
}

// Dynamisch step namen opbouwen uit project.steps
function buildStepNames(steps: { id: number; name: string }[]): Record<number, string> {
  const map: Record<number, string> = {};
  for (const step of steps) {
    map[step.id] = step.name;
  }
  return map;
}

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
  'TwelveLabs': 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
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
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [showDebug, setShowDebug] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const STEP_NAMES = useMemo(() => buildStepNames(project.steps), [project.steps]);

  const logs = project.logs || [];

  const uniqueSteps = [...new Set(logs.map(l => l.step))].sort((a, b) => a - b);
  const uniqueSources = [...new Set(logs.map(l => l.source))].sort();

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (!showDebug && log.level === 'debug') return false;
      if (levelFilter !== 'all' && log.level !== levelFilter) return false;
      if (stepFilter !== 'all' && log.step !== stepFilter) return false;
      if (sourceFilter !== 'all' && log.source !== sourceFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return log.message.toLowerCase().includes(q) ||
          (log.detail && log.detail.toLowerCase().includes(q)) ||
          log.source.toLowerCase().includes(q);
      }
      return true;
    });
  }, [logs, levelFilter, stepFilter, sourceFilter, searchQuery, showDebug]);

  const formatTime = (timestamp: string) => {
    try {
      const d = new Date(timestamp);
      return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch { return ''; }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Zoek in logs..."
          className="input-base text-xs w-48"
        />
        <select value={levelFilter} onChange={e => setLevelFilter(e.target.value as any)} className="input-base text-xs w-28">
          <option value="all">Alle levels</option>
          <option value="info">Info</option>
          <option value="warn">Waarschuwing</option>
          <option value="error">Error</option>
          <option value="debug">Debug</option>
        </select>
        <select value={stepFilter} onChange={e => setStepFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))} className="input-base text-xs w-40">
          <option value="all">Alle stappen</option>
          {uniqueSteps.map(s => <option key={s} value={s}>{s}. {STEP_NAMES[s] || `Stap ${s}`}</option>)}
        </select>
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className="input-base text-xs w-36">
          <option value="all">Alle bronnen</option>
          {uniqueSources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showDebug} onChange={e => setShowDebug(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-zinc-600 bg-surface-200 text-brand-600" />
          <span className="text-[11px] text-zinc-500">Debug</span>
        </label>
        <span className="text-[11px] text-zinc-600 ml-auto">{filteredLogs.length} logs</span>
      </div>

      {/* Log entries */}
      <div className="space-y-1 max-h-[70vh] overflow-y-auto pr-1 scrollbar-thin">
        {filteredLogs.length === 0 && (
          <p className="text-center text-zinc-600 text-sm py-8">Geen logs gevonden</p>
        )}
        {filteredLogs.map(log => {
          const config = LEVEL_CONFIG[log.level] || LEVEL_CONFIG.info;
          const isExpanded = expandedLogId === log.id;
          return (
            <div
              key={log.id}
              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
              className={`px-3 py-2 rounded-lg border cursor-pointer transition-all ${config.bg} hover:bg-white/[0.04]`}
            >
              <div className="flex items-start gap-2">
                <span className="text-[11px] shrink-0 mt-0.5">{config.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-zinc-600 font-mono">{formatTime(log.timestamp)}</span>
                    <span className="text-[10px] text-zinc-700 font-mono">#{log.step}</span>
                    {STEP_NAMES[log.step] && <span className="text-[10px] text-zinc-700 truncate">{STEP_NAMES[log.step]}</span>}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${SOURCE_COLORS[log.source] || 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'}`}>
                      {log.source}
                    </span>
                  </div>
                  <p className={`text-xs mt-0.5 ${config.color}`}>{log.message}</p>
                  {isExpanded && log.detail && (
                    <pre className="text-[10px] text-zinc-500 mt-2 bg-black/20 p-2 rounded font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                      {log.detail}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
