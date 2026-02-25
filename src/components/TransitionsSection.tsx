import { TRANSITIONS } from '../data/transitions';

interface TransitionsSectionProps {
  mode: 'none' | 'uniform' | 'per-scene';
  uniformTransition: string | null;
  onModeChange: (mode: 'none' | 'uniform' | 'per-scene') => void;
  onUniformTransitionChange: (transitionId: string) => void;
}

export default function TransitionsSection({
  mode,
  uniformTransition,
  onModeChange,
  onUniformTransitionChange,
}: TransitionsSectionProps) {
  return (
    <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
      <h3 className="font-semibold flex items-center gap-2 mb-4">
        <span>🔀</span>
        <span>Scene Transities</span>
      </h3>

      <div className="space-y-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="transitionMode"
            checked={mode === 'none'}
            onChange={() => onModeChange('none')}
            className="w-4 h-4"
          />
          <span>Geen transitie (harde cut)</span>
        </label>

        <div>
          <label className="flex items-center gap-2 cursor-pointer mb-3">
            <input
              type="radio"
              name="transitionMode"
              checked={mode === 'uniform'}
              onChange={() => onModeChange('uniform')}
              className="w-4 h-4"
            />
            <span>Eén transitie voor alle scenes</span>
          </label>

          {mode === 'uniform' && (
            <div className="ml-6 grid grid-cols-3 gap-3">
              {TRANSITIONS.map((transition) => (
                <button
                  key={transition.id}
                  type="button"
                  onClick={() => onUniformTransitionChange(transition.id)}
                  className={`p-3 rounded-lg border-2 transition-all text-center ${
                    uniformTransition === transition.id
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600 hover:bg-zinc-800'
                  }`}
                >
                  <div className="text-2xl mb-1">{transition.icon}</div>
                  <div className="text-xs font-medium">{transition.name}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="radio"
            name="transitionMode"
            checked={mode === 'per-scene'}
            onChange={() => onModeChange('per-scene')}
            className="w-4 h-4 mt-1"
          />
          <div>
            <span className="block">Per scene kiezen</span>
            <span className="text-sm text-zinc-400 block mt-1">
              Transitie per scene kiezen bij de scene review.
            </span>
          </div>
        </label>
      </div>
    </div>
  );
}
