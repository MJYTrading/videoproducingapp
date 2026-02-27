import { useState, useEffect } from 'react';
import { Trash2, Volume2 } from 'lucide-react';
import { mediaLibrary } from '../api';

export default function SfxLibraryPage() {
  const [effects, setEffects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadEffects(); }, []);

  const loadEffects = async () => {
    try { setEffects(await mediaLibrary.getSfx()); }
    catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  };

  const deleteEffect = async (id: string) => {
    if (!confirm('Weet je het zeker?')) return;
    await mediaLibrary.deleteSfx(id);
    loadEffects();
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Volume2 className="w-7 h-7 text-brand-400" /> Sound Effects Library
        </h1>
      </div>

      {loading ? (
        <div className="text-zinc-500 text-center py-20">Laden...</div>
      ) : effects.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">
          <Volume2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>Nog geen sound effects toegevoegd</p>
        </div>
      ) : (
        <div className="space-y-2">
          {effects.map(sfx => (
            <div key={sfx.id} className="card p-4 flex items-center justify-between">
              <div>
                <h3 className="font-medium text-white">{sfx.name}</h3>
                <p className="text-xs text-zinc-500">{sfx.category} · {Math.round(sfx.duration * 100) / 100}s</p>
              </div>
              <button onClick={() => deleteEffect(sfx.id)} className="btn-icon text-zinc-600 hover:text-red-400">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
