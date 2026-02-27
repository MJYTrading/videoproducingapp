import { useState, useEffect } from 'react';
import { Trash2, Layers } from 'lucide-react';
import { mediaLibrary } from '../api';

export default function OverlayLibraryPage() {
  const [presets, setPresets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadPresets(); }, []);

  const loadPresets = async () => {
    try { setPresets(await mediaLibrary.getOverlays()); }
    catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  };

  const deletePreset = async (id: string) => {
    if (!confirm('Weet je het zeker?')) return;
    await mediaLibrary.deleteOverlay(id);
    loadPresets();
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-white flex items-center gap-3 mb-8">
        <Layers className="w-7 h-7 text-brand-400" /> Overlay Presets
      </h1>

      {loading ? (
        <div className="text-zinc-500 text-center py-20">Laden...</div>
      ) : presets.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">
          <Layers className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>Nog geen overlay presets</p>
        </div>
      ) : (
        <div className="space-y-2">
          {presets.map(preset => (
            <div key={preset.id} className="card p-4 flex items-center justify-between">
              <div>
                <h3 className="font-medium text-white">{preset.name}</h3>
                <p className="text-xs text-zinc-500">{preset.layers?.length || 0} layers</p>
              </div>
              <button onClick={() => deletePreset(preset.id)} className="btn-icon text-zinc-600 hover:text-red-400">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
