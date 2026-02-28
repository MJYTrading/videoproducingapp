import { Project, Step } from '../types';

interface StatsTabProps {
  project: Project;
}

export default function StatsTab({ project }: StatsTabProps) {
  const enabledSteps = project.enabledSteps || [];
  // Only show steps that are in enabledSteps
  const activeSteps = project.steps.filter(s => enabledSteps.includes(s.id));
  
  const completedSteps = activeSteps.filter((s) => s.status === 'completed').length;
  const totalSteps = activeSteps.filter((s) => s.status !== 'skipped').length;
  const totalRetries = activeSteps.reduce((sum, s) => sum + (s.retryCount || 0), 0);
  const failedSteps = activeSteps.filter(s => s.status === 'failed').length;

  const totalDuration = project.startedAt && project.completedAt
    ? Math.floor((new Date(project.completedAt).getTime() - new Date(project.startedAt).getTime()) / 1000)
    : activeSteps.reduce((sum, s) => sum + (s.duration || 0), 0);

  const formatDuration = (seconds: number) => {
    if (seconds === 0) return '0s';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const getStepColor = (step: Step) => {
    switch (step.status) {
      case 'completed': return 'bg-emerald-500';
      case 'failed': return 'bg-red-500';
      case 'skipped': return 'bg-zinc-600';
      case 'running': return 'bg-blue-500';
      case 'review': return 'bg-amber-500';
      default: return 'bg-zinc-700';
    }
  };

  const getStatusIcon = (step: Step) => {
    switch (step.status) {
      case 'completed': return '✅';
      case 'failed': return '❌';
      case 'skipped': return '⏭';
      case 'running': return '⏳';
      case 'review': return '🔍';
      default: return '⬜';
    }
  };

  const stepsWithDuration = activeSteps.filter((s) => s.duration && s.duration > 0);
  const maxDuration = Math.max(...stepsWithDuration.map((s) => s.duration || 0), 1);
  const longestStep = stepsWithDuration.length > 0
    ? stepsWithDuration.reduce((max, s) => (s.duration || 0) > (max.duration || 0) ? s : max, stepsWithDuration[0])
    : null;

  return (
    <div className="space-y-5">
      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="glass rounded-xl p-4">
          <div className="text-2xl mb-1">⏱</div>
          <p className="text-[11px] text-zinc-500">Totaal</p>
          <p className="text-xl font-bold">{formatDuration(totalDuration)}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="text-2xl mb-1">✅</div>
          <p className="text-[11px] text-zinc-500">Voltooid</p>
          <p className="text-xl font-bold">{completedSteps}/{totalSteps}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="text-2xl mb-1">↻</div>
          <p className="text-[11px] text-zinc-500">Retries</p>
          <p className="text-xl font-bold">{totalRetries}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="text-2xl mb-1">❌</div>
          <p className="text-[11px] text-zinc-500">Mislukt</p>
          <p className="text-xl font-bold text-red-400">{failedSteps}</p>
        </div>
      </div>

      {/* Duration chart */}
      {stepsWithDuration.length > 0 && (
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">Stap Duur</h3>
          <div className="space-y-2.5">
            {activeSteps.filter((s) => s.status !== 'waiting').map((step) => (
              <div key={step.id}>
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-[11px] text-zinc-500 font-mono w-5">{step.id}</span>
                  <span className="text-xs flex-1 truncate">{step.name}</span>
                  <span className="text-xs text-zinc-500 font-mono">{step.duration ? formatDuration(step.duration) : '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-surface-200 rounded-full h-5 overflow-hidden">
                    <div className={`h-full ${getStepColor(step)} transition-all rounded-full flex items-center justify-end pr-2`}
                      style={{ width: step.duration ? `${Math.max((step.duration / maxDuration) * 100, 2)}%` : '0%' }}>
                      {step.duration && step.duration > maxDuration * 0.15 && (
                        <span className="text-[10px] font-medium text-white">{step.duration}s</span>
                      )}
                    </div>
                  </div>
                  {longestStep?.id === step.id && step.duration && step.duration > 0 && (
                    <span className="text-[10px] text-amber-400 font-medium">langste</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      {stepsWithDuration.length > 0 && (
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-3">Tijdlijn</h3>
          <div className="flex gap-0.5 h-10 rounded-lg overflow-hidden">
            {activeSteps.filter((s) => s.status !== 'waiting' && s.duration && s.duration > 0).map((step) => {
              const width = totalDuration > 0 ? ((step.duration || 0) / totalDuration) * 100 : 0;
              return (
                <div key={step.id} className={`${getStepColor(step)} hover:opacity-80 transition-opacity cursor-pointer relative group`}
                  style={{ width: `${Math.max(width, 0.5)}%` }} title={`${step.name} — ${step.duration}s`}>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-black/90 text-white text-[11px] rounded-lg py-1.5 px-2.5 whitespace-nowrap z-10 border border-white/10">
                    {step.id}. {step.name}<br />{formatDuration(step.duration || 0)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[11px] text-zinc-600 mt-2">
            <span>0s</span>
            <span>{formatDuration(totalDuration)}</span>
          </div>
        </div>
      )}

      {/* Step table */}
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-zinc-500 uppercase">#</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-zinc-500 uppercase">Stap</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-zinc-500 uppercase">Duur</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-zinc-500 uppercase">Status</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-zinc-500 uppercase">Retries</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-zinc-500 uppercase">Executor</th>
            </tr>
          </thead>
          <tbody>
            {activeSteps.map((step) => (
              <tr key={step.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                <td className="px-4 py-2.5 text-xs text-zinc-500 font-mono">{step.id}</td>
                <td className="px-4 py-2.5 text-xs text-zinc-300">{step.name}</td>
                <td className="px-4 py-2.5 text-xs text-zinc-400 font-mono">{step.duration ? formatDuration(step.duration) : '—'}</td>
                <td className="px-4 py-2.5 text-sm">{getStatusIcon(step)}</td>
                <td className="px-4 py-2.5 text-xs text-zinc-400">{step.retryCount || 0}</td>
                <td className="px-4 py-2.5"><span className="text-[11px] px-2 py-0.5 rounded bg-surface-200 text-zinc-400 border border-white/[0.04]">{step.executor}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
