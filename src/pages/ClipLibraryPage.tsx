// === ClipLibraryPage.tsx ===
import { useState, useEffect } from 'react';
import { Trash2, Scissors, Search } from 'lucide-react';
import { assetClips } from '../api';

export default function ClipLibraryPage() {
  const [clips, setClips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { loadClips(); }, []);

  const loadClips = async () => {
    try { setClips(await assetClips.getAll({ search: search || undefined, limit: 100 })); }
    catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSearch = () => { setLoading(true); loadClips(); };

  const deleteClip = async (id: string) => {
    if (!confirm('Weet je het zeker?')) return;
    await assetClips.delete(id);
    loadClips();
  };

  return (
    <div className="p-8 animate-fade-in">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Clip Library</h1>
            <p className="text-sm text-zinc-500 mt-1">{clips.length} clip{clips.length !== 1 ? 's' : ''} beschikbaar</p>
          </div>
        </div>

        <div className="flex gap-3 mb-6">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Zoek op tags, beschrijving, categorie..." className="input-base flex-1" />
          <button onClick={handleSearch} className="btn-primary text-sm"><Search className="w-4 h-4" /> Zoek</button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-500" /></div>
        ) : clips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-4 border border-white/[0.04]"><Scissors className="w-8 h-8 text-zinc-600" /></div>
            <p className="text-zinc-400 font-medium">Geen clips gevonden</p>
            <p className="text-xs text-zinc-600 mt-1">Clips worden automatisch toegevoegd wanneer de pipeline B-roll downloadt</p>
          </div>
        ) : (
          <div className="space-y-2">
            {clips.map(clip => (
              <div key={clip.id} className="glass rounded-xl px-4 py-3 flex items-center justify-between group hover:bg-white/[0.03] transition-colors">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium truncate">{clip.title}</h3>
                  <p className="text-[11px] text-zinc-500 truncate">
                    {clip.category} · {clip.timesUsed}x gebruikt
                    {clip.tags?.length > 0 && ` · ${clip.tags.slice(0, 3).join(', ')}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  {clip.quality && (
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-brand-500/15 text-brand-300 border border-brand-500/20">
                      {Math.round(clip.quality * 100)}%
                    </span>
                  )}
                  <button onClick={() => deleteClip(clip.id)} className="btn-icon !p-1.5 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
