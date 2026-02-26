interface CheckpointsSectionProps {
  checkpoints: number[];
  onChange: (checkpoints: number[]) => void;
}


interface CheckpointStep {
  id: number;
  name: string;
  recommended?: boolean;
  displayLabel?: string;
}

const CHECKPOINT_STEPS: CheckpointStep[] = [
  { id: 1, name: 'Transcripts ophalen' },
  { id: 2, name: 'Style profile maken' },
  { id: 3, name: 'Script schrijven', recommended: true },
  { id: 4, name: 'Voiceover genereren', recommended: true },
  { id: 5, name: 'Timestamps genereren' },
  { id: 6, name: 'Scene prompts genereren', recommended: true },
  { id: 65, name: 'Scene images genereren', displayLabel: '6b' },
  { id: 7, name: 'Assets zoeken' },
  { id: 8, name: 'YouTube clips ophalen' },
  { id: 9, name: 'Video scenes genereren', recommended: true },
  { id: 10, name: 'Video editing' },
  { id: 11, name: 'Color grading' },
  { id: 12, name: 'Subtitles' },
  { id: 13, name: 'Final export' },
  { id: 14, name: 'Google Drive upload' },
];

export default function CheckpointsSection({ checkpoints, onChange }: CheckpointsSectionProps) {
  const handleToggle = (stepId: number) => {
    if (checkpoints.includes(stepId)) {
      onChange(checkpoints.filter((id) => id !== stepId));
    } else {
      onChange([...checkpoints, stepId].sort((a, b) => a - b));
    }
  };

  const handleSetRecommended = () => {
    const recommended = CHECKPOINT_STEPS.filter((s) => s.recommended).map((s) => s.id);
    onChange(recommended);
  };

  return (
    <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <span>🔍</span>
            <span>Checkpoints</span>
          </h3>
          <p className="text-sm text-zinc-400 mt-1">
            De pipeline pauzeert bij deze stappen zodat je het resultaat kunt checken. Je krijgt een melding.
          </p>
        </div>
        <button
          onClick={handleSetRecommended}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors whitespace-nowrap"
        >
          Aanbevolen instellen
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {CHECKPOINT_STEPS.map((step) => (
          <label
            key={step.id}
            className="flex items-center gap-3 p-2 rounded hover:bg-zinc-800/50 cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={checkpoints.includes(step.id)}
              onChange={() => handleToggle(step.id)}
              className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-600 focus:ring-2 focus:ring-blue-600 focus:ring-offset-0 cursor-pointer"
            />
            <span className="flex-1 text-sm">
              {step.displayLabel || step.id}. {step.name}
            </span>
            {step.recommended && (
              <span className="text-xs text-blue-400">← aanbevolen</span>
            )}
          </label>
        ))}
      </div>

      {checkpoints.length > 0 && (
        <div className="mt-3 pt-3 border-t border-zinc-800">
          <p className="text-xs text-zinc-500">
            {checkpoints.length} checkpoint{checkpoints.length !== 1 ? 's' : ''} actief:{' '}
            {checkpoints.map((id) => `#${id}`).join(', ')}
          </p>
        </div>
      )}
    </div>
  );
}
