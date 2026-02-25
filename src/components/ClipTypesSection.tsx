import { X, Plus } from 'lucide-react';
import { MontageClip } from '../types';

interface ClipTypesSectionProps {
  useClips: boolean;
  referenceClips: string[];
  montageClips: MontageClip[];
  onUseClipsChange: (value: boolean) => void;
  onReferenceClipsChange: (clips: string[]) => void;
  onMontageClipsChange: (clips: MontageClip[]) => void;
  isAIStyle?: boolean;
}

export default function ClipTypesSection({
  useClips,
  referenceClips,
  montageClips,
  onUseClipsChange,
  onReferenceClipsChange,
  onMontageClipsChange,
  isAIStyle = false,
}: ClipTypesSectionProps) {
  const addReferenceClip = () => {
    onReferenceClipsChange([...referenceClips, '']);
  };

  const removeReferenceClip = (index: number) => {
    onReferenceClipsChange(referenceClips.filter((_, i) => i !== index));
  };

  const updateReferenceClip = (index: number, value: string) => {
    const updated = [...referenceClips];
    updated[index] = value;
    onReferenceClipsChange(updated);
  };

  const addMontageClip = () => {
    onMontageClipsChange([
      ...montageClips,
      { id: Math.random().toString(36).substr(2, 9), url: '', startTime: '00:00:00', endTime: '00:00:00' },
    ]);
  };

  const removeMontageClip = (index: number) => {
    onMontageClipsChange(montageClips.filter((_, i) => i !== index));
  };

  const updateMontageClip = (index: number, field: keyof MontageClip, value: string) => {
    const updated = [...montageClips];
    updated[index] = { ...updated[index], [field]: value };
    onMontageClipsChange(updated);
  };

  return (
    <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
      <div className="mb-4">
        <h3 className="font-semibold flex items-center gap-2 mb-3">
          <span>🎬</span>
          <span>Video Clips</span>
        </h3>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={useClips}
            onChange={(e) => onUseClipsChange(e.target.checked)}
            className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-600 focus:ring-2 focus:ring-blue-600 focus:ring-offset-0 cursor-pointer"
          />
          <span className="text-sm">Clips gebruiken</span>
        </label>
      </div>

      {useClips && (
        <div className="space-y-4">
          <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-800/50">
            <div className="mb-3">
              <h4 className="font-medium text-sm mb-1">Referentie Clips</h4>
              <p className="text-xs text-zinc-400">
                Clips die AI als inspiratie gebruikt bij het schrijven van het script. Deze komen NIET in de video.
              </p>
            </div>

            <div className="space-y-2">
              {referenceClips.map((clip, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-zinc-500">🔗</span>
                  <input
                    type="url"
                    value={clip}
                    onChange={(e) => updateReferenceClip(index, e.target.value)}
                    placeholder="https://youtube.com/watch?v=..."
                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <button
                    onClick={() => removeReferenceClip(index)}
                    className="p-2 hover:bg-zinc-700 rounded transition-colors"
                  >
                    <X className="w-4 h-4 text-zinc-400" />
                  </button>
                </div>
              ))}

              <button
                onClick={addReferenceClip}
                className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Referentie clip toevoegen
              </button>
            </div>
          </div>

          <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-800/50">
            <div className="mb-3">
              <h4 className="font-medium text-sm mb-1">Montage Clips</h4>
              <p className="text-xs text-zinc-400">
                Clips die letterlijk IN de video gemonteerd worden. De voiceover pauzeert terwijl de clip speelt.
              </p>
            </div>

            {isAIStyle ? (
              <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                <p className="text-sm text-orange-400 font-medium mb-1">⚠️ Niet beschikbaar bij AI stijlen</p>
                <p className="text-xs text-orange-300/70">
                  Bij AI gegenereerde video's worden alle visuals door AI gemaakt. Montage clips kunnen niet worden
                  ingevoegd.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {montageClips.map((clip, index) => (
                  <div key={clip.id} className="space-y-2 p-3 bg-zinc-900/50 rounded border border-zinc-700">
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500">🎬</span>
                      <input
                        type="url"
                        value={clip.url}
                        onChange={(e) => updateMontageClip(index, 'url', e.target.value)}
                        placeholder="https://youtube.com/watch?v=..."
                        className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      <button
                        onClick={() => removeMontageClip(index)}
                        className="p-2 hover:bg-zinc-700 rounded transition-colors"
                      >
                        <X className="w-4 h-4 text-zinc-400" />
                      </button>
                    </div>
                    <div className="flex items-center gap-3 pl-8">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-zinc-400">Start:</label>
                        <input
                          type="text"
                          value={clip.startTime}
                          onChange={(e) => updateMontageClip(index, 'startTime', e.target.value)}
                          placeholder="00:00:14"
                          className="w-24 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-zinc-400">Eind:</label>
                        <input
                          type="text"
                          value={clip.endTime}
                          onChange={(e) => updateMontageClip(index, 'endTime', e.target.value)}
                          placeholder="00:00:33"
                          className="w-24 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  onClick={addMontageClip}
                  className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Montage clip toevoegen
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
