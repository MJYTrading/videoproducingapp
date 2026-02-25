interface ImageSelectionSectionProps {
  mode: 'auto' | 'manual';
  imagesPerScene: 1 | 2 | 3 | 4;
  onModeChange: (mode: 'auto' | 'manual') => void;
  onImagesPerSceneChange: (count: 1 | 2 | 3 | 4) => void;
}

export default function ImageSelectionSection({
  mode,
  imagesPerScene,
  onModeChange,
  onImagesPerSceneChange,
}: ImageSelectionSectionProps) {
  return (
    <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
      <h3 className="font-semibold flex items-center gap-2 mb-3">
        <span>🖼️</span>
        <span>AI Image Selectie</span>
      </h3>

      <p className="text-sm text-zinc-400 mb-4">
        Per scene genereert de AI eerst afbeeldingen die daarna tot video geanimeerd worden. Hoe wil je de beste
        kiezen?
      </p>

      <div className="space-y-3">
        <label className="flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors hover:bg-zinc-800/50"
          style={{ borderColor: mode === 'auto' ? 'rgb(59 130 246)' : 'rgb(39 39 42)' }}>
          <input
            type="radio"
            name="imageSelectionMode"
            checked={mode === 'auto'}
            onChange={() => onModeChange('auto')}
            className="mt-1"
          />
          <div>
            <div className="font-medium">Automatisch (standaard)</div>
            <p className="text-sm text-zinc-400 mt-1">
              AI genereert 1 afbeelding per scene en gaat direct door naar video generatie. Snelste optie.
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors hover:bg-zinc-800/50"
          style={{ borderColor: mode === 'manual' ? 'rgb(59 130 246)' : 'rgb(39 39 42)' }}>
          <input
            type="radio"
            name="imageSelectionMode"
            checked={mode === 'manual'}
            onChange={() => onModeChange('manual')}
            className="mt-1"
          />
          <div className="flex-1">
            <div className="font-medium">Handmatig kiezen</div>
            <p className="text-sm text-zinc-400 mt-1 mb-3">
              AI genereert meerdere afbeeldingen per scene. Jij kiest de beste. Meer controle, duurt langer.
            </p>

            {mode === 'manual' && (
              <div className="flex items-center gap-2 ml-1">
                <span className="text-sm text-zinc-400">Aantal opties per scene:</span>
                <div className="flex gap-2">
                  {([2, 3, 4] as const).map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        onImagesPerSceneChange(count);
                      }}
                      className={`w-10 h-10 rounded-lg border-2 font-medium transition-colors ${
                        imagesPerScene === count
                          ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                          : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600'
                      }`}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </label>
      </div>
    </div>
  );
}
