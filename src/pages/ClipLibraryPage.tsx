import { useState, useEffect } from 'react';
import { Trash2, Library, Search } from 'lucide-react';
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
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Library className="w-7 h-7 text-brand-400" /> Clip Library
        </h1>
        <p className="text-zinc-400">{clips.length} clips</p>
      </div>

      <div className="flex gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Zoek op tags, beschrijving, categorie..."
          className="input flex-1"
        />
        <button onClick={handleSearch} className="btn btn-primary">
          <Search className="w-4 h-4" /> Zoek
        </button>
      </div>

      {loading ? (
        <div className="text-zinc-500 text-center py-20">Laden...</div>
      ) : clips.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">
          <Library className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>Geen clips gevonden</p>
          <p className="text-sm mt-1">Clips worden automatisch toegevoegd wanneer de pipeline B-roll downloadt</p>
        </div>
      ) : (
        <div className="space-y-2">
          {clips.map(clip => (
            <div key={clip.id} className="card p-4 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-white truncate">{clip.title}</h3>
                <p className="text-xs text-zinc-500 truncate">
                  {clip.category} · {clip.timesUsed}x gebruikt
                  {clip.tags?.length > 0 && ` · ${clip.tags.slice(0, 3).join(', ')}`}
                </p>
              </div>
              <div className="flex items-center gap-2 ml-4">
                {clip.quality && (
                  <span className="text-xs px-2 py-0.5 rounded bg-brand-600/20 text-brand-300">
                    {Math.round(clip.quality * 100)}%
                  </span>
                )}
                <button onClick={() => deleteClip(clip.id)} className="btn-icon text-zinc-600 hover:text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
