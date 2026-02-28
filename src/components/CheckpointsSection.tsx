interface CheckpointsSectionProps {
  checkpoints: number[];
  onChange: (checkpoints: number[]) => void;
  enabledSteps: number[];
}

const STEP_NAMES: Record<number, string> = {
  0: 'Ideation',
  1: 'Project Formulier',
  2: 'Research JSON',
  3: 'Transcripts Ophalen',
  4: 'Trending Clips Research',
  5: 'Style Profile',
  6: 'Script Orchestrator',
  7: 'Script Schrijven',
  8: 'Voice Over',
  9: 'Avatar / Spokesperson',
  10: 'Timestamps Ophalen',
  11: 'Scene Prompts',
  12: 'Assets Zoeken',
  13: 'Clips Downloaden',
  14: 'Images Genereren',
  15: 'Video Scenes Genereren',
  16: "Director's Cut",
  17: 'Achtergrondmuziek',
  18: 'Color Grading',
  19: 'Subtitles',
  20: 'Overlay',
  21: 'Sound Effects',
  22: 'Video Effects',
  23: 'Final Export',
  24: 'Thumbnail',
  25: 'Drive Upload',
};

// Aanbevolen checkpoints — stappen waar je normaal wilt reviewen
const RECOMMENDED = [7, 11, 14, 16];

export default function CheckpointsSection({ checkpoints, onChange, enabledSteps }: CheckpointsSectionProps) {
  // Alleen enabled stappen tonen als checkpoint optie
  const availableSteps = enabledSteps.filter(id => STEP_NAMES[id]);

  const handleToggle = (stepId: number) => {
    if (checkpoints.includes(stepId)) {
      onChange(checkpoints.filter((id) => id !== stepId));
    } else {
      onChange([...checkpoints, stepId].sort((a, b) => a - b));
    }
  };

  const handleSetRecommended = () => {
    // Alleen aanbevolen stappen die ook enabled zijn
    const rec = RECOMMENDED.filter(id => enabledSteps.includes(id));
    onChange(rec);
  };

  return (
    <section className="section-card">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="section-title !mb-1">Checkpoints</h2>
          <p className="text-xs text-zinc-600">
            De pipeline pauzeert bij deze stappen zodat je het resultaat kunt reviewen.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSetRecommended}
          className="btn-secondary text-xs"
        >
          Aanbevolen
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
        {availableSteps.map((stepId) => {
          const isChecked = checkpoints.includes(stepId);
          const isRecommended = RECOMMENDED.includes(stepId);
          return (
            <label
              key={stepId}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                isChecked
                  ? 'bg-brand-500/8 border-brand-500/20'
                  : 'bg-surface-200/30 border-white/[0.04] hover:border-white/[0.08]'
              }`}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => handleToggle(stepId)}
                className="w-4 h-4 rounded border-zinc-600 bg-surface-200 text-brand-600 focus:ring-2 focus:ring-brand-500/40 focus:ring-offset-0 cursor-pointer"
              />
              <span className="text-[11px] text-zinc-600 font-mono w-5">{stepId}</span>
              <span className="flex-1 text-sm">{STEP_NAMES[stepId]}</span>
              {isRecommended && (
                <span className="text-[10px] text-brand-400 font-medium">aanbevolen</span>
              )}
            </label>
          );
        })}
      </div>

      {checkpoints.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/[0.04]">
          <p className="text-[11px] text-zinc-500">
            {checkpoints.length} checkpoint{checkpoints.length !== 1 ? 's' : ''}: stap {checkpoints.join(', ')}
          </p>
        </div>
      )}
    </section>
  );
}
