import { useState, useMemo } from 'react';
import { Search, RefreshCw, Download, ChevronUp, ChevronDown } from 'lucide-react';
import { Project, LogLevel, Executor } from '../types';

interface LogsTabProps {
  project: Project;
}

type SortField = 'timestamp' | 'level' | 'step' | 'source' | 'message';
type SortDirection = 'asc' | 'desc';

export default function LogsTab({ project }: LogsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<LogLevel | 'all'>('all');
  const [stepFilter, setStepFilter] = useState<number | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<Executor | 'all'>('all');
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const getLevelIcon = (level: LogLevel) => {
    switch (level) {
      case 'info':
        return <span className="text-blue-500">ℹ️</span>;
      case 'warn':
        return <span className="text-orange-500">⚠️</span>;
      case 'error':
        return <span className="text-red-500">❌</span>;
    }
  };

  const getSourceColor = (source: Executor) => {
    switch (source) {
      case 'App':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      case 'N8N':
        return 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
      case 'Elevate AI':
        return 'bg-green-500/10 text-green-400 border border-green-500/20';
      case 'OpenClaw':
        return 'bg-orange-500/10 text-orange-400 border border-orange-500/20';
    }
  };

  const filteredLogs = useMemo(() => {
    let logs = [...project.logs];

    if (searchQuery) {
      logs = logs.filter((log) =>
        log.message.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (levelFilter !== 'all') {
      logs = logs.filter((log) => log.level === levelFilter);
    }

    if (stepFilter !== 'all') {
      logs = logs.filter((log) => log.step === stepFilter);
    }

    if (sourceFilter !== 'all') {
      logs = logs.filter((log) => log.source === sourceFilter);
    }

    logs.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (sortField === 'timestamp') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return logs;
  }, [project.logs, searchQuery, levelFilter, stepFilter, sourceFilter, sortField, sortDirection]);

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const uniqueSteps = Array.from(new Set(project.logs.map((log) => log.step))).sort(
    (a, b) => a - b
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleExportCSV = () => {
    const headers = ['Timestamp', 'Level', 'Step', 'Source', 'Message'];
    const rows = filteredLogs.map((log) => [
      new Date(log.timestamp).toLocaleString('nl-NL'),
      log.level,
      log.step.toString(),
      log.source,
      log.message.replace(/,/g, ';'),
    ]);

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name}-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ChevronUp className="w-4 h-4" />
    ) : (
      <ChevronDown className="w-4 h-4" />
    );
  };

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Zoek in logs..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value as LogLevel | 'all')}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="all">Alle levels</option>
            <option value="info">Info</option>
            <option value="warn">Waarschuwing</option>
            <option value="error">Error</option>
          </select>

          <select
            value={stepFilter}
            onChange={(e) =>
              setStepFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
            }
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="all">Alle stappen</option>
            {uniqueSteps.map((step) => (
              <option key={step} value={step}>
                Stap {step}
              </option>
            ))}
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as Executor | 'all')}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="all">Alle bronnen</option>
            <option value="App">App</option>
            <option value="N8N">N8N</option>
            <option value="Elevate AI">Elevate AI</option>
            <option value="OpenClaw">OpenClaw</option>
          </select>

          <button
            onClick={() => {
              setSearchQuery('');
              setLevelFilter('all');
              setStepFilter('all');
              setSourceFilter('all');
            }}
            className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Reset
          </button>

          <button
            onClick={handleExportCSV}
            className="px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th
                  onClick={() => handleSort('timestamp')}
                  className="text-left px-4 py-3 text-sm font-medium text-zinc-400 cursor-pointer hover:bg-zinc-800/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    Tijd
                    <SortIcon field="timestamp" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('level')}
                  className="text-left px-4 py-3 text-sm font-medium text-zinc-400 cursor-pointer hover:bg-zinc-800/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    Level
                    <SortIcon field="level" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('step')}
                  className="text-left px-4 py-3 text-sm font-medium text-zinc-400 cursor-pointer hover:bg-zinc-800/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    Stap
                    <SortIcon field="step" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('source')}
                  className="text-left px-4 py-3 text-sm font-medium text-zinc-400 cursor-pointer hover:bg-zinc-800/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    Bron
                    <SortIcon field="source" />
                  </div>
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-zinc-400">
                  Bericht
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-zinc-500">
                    Geen logs gevonden
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log) => (
                  <tr
                    key={log.id}
                    onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                    className="border-b border-zinc-800 hover:bg-zinc-800/30 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-zinc-300 font-mono">
                      {new Date(log.timestamp).toLocaleTimeString('nl-NL', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">{getLevelIcon(log.level)}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-300">{log.step}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getSourceColor(log.source)}`}>
                        {log.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-300">
                      <div className={expandedRow === log.id ? '' : 'truncate max-w-md'}>
                        {log.message}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-400">
            Pagina {currentPage} van {totalPages} ({filteredLogs.length} logs)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-600 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
            >
              Vorige
            </button>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-600 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
            >
              Volgende
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
