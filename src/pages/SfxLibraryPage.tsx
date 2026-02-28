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
    <div className="p-8 animate-fade-in">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Sound Effects</h1>
          <p className="text-sm text-zinc-500 mt-1">{effects.length} effect{effects.length !== 1 ? 's' : ''} beschikbaar</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-500" /></div>
        ) : effects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-4 border border-white/[0.04]"><Volume2 className="w-8 h-8 text-zinc-600" /></div>
            <p className="text-zinc-400 font-medium">Nog geen sound effects</p>
            <p className="text-xs text-zinc-600 mt-1">Sound effects worden automatisch beheerd door de pipeline</p>
          </div>
        ) : (
          <div className="space-y-2">
            {effects.map(sfx => (
              <div key={sfx.id} className="glass rounded-xl px-4 py-3 flex items-center justify-between group hover:bg-white/[0.03] transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center border border-purple-500/20 shrink-0"><Volume2 className="w-4 h-4 text-purple-400" /></div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium truncate">{sfx.name}</h3>
                    <p className="text-[11px] text-zinc-500">{sfx.category} · {Math.round(sfx.duration * 100) / 100}s</p>
                  </div>
                </div>
                <button onClick={() => deleteEffect(sfx.id)} className="btn-icon !p-1.5 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
