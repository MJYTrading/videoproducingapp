import { Project, Step } from '../types';

interface StatsTabProps {
  project: Project;
}

export default function StatsTab({ project }: StatsTabProps) {
  const completedSteps = project.steps.filter((s) => s.status === 'completed').length;
  const totalSteps = project.steps.filter((s) => s.status !== 'skipped').length;
  const totalRetries = project.steps.reduce((sum, s) => sum + (s.retryCount || 0), 0);
  const aiHelpUsed = project.steps.filter((s) => s.aiResponse).length;

  const totalDuration = project.startedAt && project.completedAt
    ? Math.floor((new Date(project.completedAt).getTime() - new Date(project.startedAt).getTime()) / 1000)
    : project.steps.reduce((sum, s) => sum + (s.duration || 0), 0);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getStepColor = (step: Step) => {
    switch (step.status) {
      case 'completed':
        return 'bg-green-500';
      case 'failed':
        return 'bg-red-500';
      case 'skipped':
        return 'bg-zinc-600';
      case 'running':
        return 'bg-blue-500';
      default:
        return 'bg-zinc-700';
    }
  };

  const getStatusIcon = (step: Step) => {
    switch (step.status) {
      case 'completed':
        return '✅';
      case 'failed':
        return '❌';
      case 'skipped':
        return '⏭';
      default:
        return '⏳';
    }
  };

  const maxDuration = Math.max(...project.steps.map((s) => s.duration || 0), 1);

  const stepsWithDuration = project.steps.filter((s) => s.duration && s.duration > 0);
  const longestStep = stepsWithDuration.reduce((max, s) =>
    (s.duration || 0) > (max.duration || 0) ? s : max
  , stepsWithDuration[0] || project.steps[0]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
          <div className="text-3xl mb-2">⏱</div>
          <p className="text-sm text-zinc-400 mb-1">Totaal</p>
          <p className="text-2xl font-bold">{formatDuration(totalDuration)}</p>
        </div>

        <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
          <div className="text-3xl mb-2">✅</div>
          <p className="text-sm text-zinc-400 mb-1">Voltooid</p>
          <p className="text-2xl font-bold">
            {completedSteps}/{totalSteps}
          </p>
        </div>

        <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
          <div className="text-3xl mb-2">↻</div>
          <p className="text-sm text-zinc-400 mb-1">Retries</p>
          <p className="text-2xl font-bold">{totalRetries}</p>
        </div>

        <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
          <div className="text-3xl mb-2">🤖</div>
          <p className="text-sm text-zinc-400 mb-1">AI Hulp</p>
          <p className="text-2xl font-bold">{aiHelpUsed}</p>
        </div>
      </div>

      <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
        <h3 className="text-lg font-semibold mb-4">Stap Duur Grafiek</h3>
        <div className="space-y-3">
          {project.steps
            .filter((s) => s.status !== 'waiting')
            .map((step) => (
              <div key={step.id}>
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-sm text-zinc-400 w-6">{step.id}</span>
                  <span className="text-sm flex-1">{step.name}</span>
                  <span className="text-sm text-zinc-400">
                    {step.duration ? `${step.duration}s` : '-'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-zinc-800 rounded-full h-6 overflow-hidden">
                    <div
                      className={`h-full ${getStepColor(step)} transition-all flex items-center justify-end pr-2`}
                      style={{
                        width: step.duration ? `${(step.duration / maxDuration) * 100}%` : '0%',
                      }}
                    >
                      {step.duration && step.duration > maxDuration * 0.1 && (
                        <span className="text-xs font-medium text-white">
                          {step.duration}s
                        </span>
                      )}
                    </div>
                  </div>
                  {longestStep?.id === step.id && step.duration && step.duration > 0 && (
                    <span className="text-xs text-orange-500">Langste</span>
                  )}
                </div>
              </div>
            ))}
        </div>
      </div>

      <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
        <h3 className="text-lg font-semibold mb-4">Tijdlijn</h3>
        <div className="flex gap-1 h-12">
          {project.steps
            .filter((s) => s.status !== 'waiting' && s.duration && s.duration > 0)
            .map((step) => {
              const width = totalDuration > 0 ? ((step.duration || 0) / totalDuration) * 100 : 0;
              return (
                <div
                  key={step.id}
                  className={`${getStepColor(step)} rounded hover:opacity-80 transition-opacity cursor-pointer relative group`}
                  style={{ width: `${width}%` }}
                  title={`${step.name} - ${step.duration}s`}
                >
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-black text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10">
                    {step.name}<br />{step.duration}s
                  </div>
                </div>
              );
            })}
        </div>
        <div className="flex justify-between text-xs text-zinc-500 mt-2">
          <span>0s</span>
          <span>{formatDuration(totalDuration)}</span>
        </div>
      </div>

      <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left px-4 py-3 text-sm font-medium text-zinc-400">Stap</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-zinc-400">Duur</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-zinc-400">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-zinc-400">Retries</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-zinc-400">Executor</th>
              </tr>
            </thead>
            <tbody>
              {project.steps.map((step) => (
                <tr key={step.id} className="border-b border-zinc-800">
                  <td className="px-4 py-3 text-sm text-zinc-300">
                    {step.id}. {step.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-300">
                    {step.duration ? `${step.duration}s` : '<1s'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="flex items-center gap-2">
                      {getStatusIcon(step)}
                      {step.status === 'failed' && step.retryCount && step.retryCount > 0 && (
                        <span className="text-zinc-400">→ ✅</span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-300">{step.retryCount || 0}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className="px-2 py-1 rounded text-xs font-medium bg-zinc-800 text-zinc-300">
                      {step.executor}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
