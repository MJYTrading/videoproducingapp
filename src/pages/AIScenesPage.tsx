import { useState, useEffect } from 'react';
import { Trash2, Clapperboard, Search, Grid3x3, List, X } from 'lucide-react';
import { assetImages } from '../api';

export default function AIScenesPage() {
  const [scenes, setScenes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedScene, setSelectedScene] = useState<any | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setScenes(await assetImages.getAll({ category: 'ai-scene', search: search || undefined, limit: 200 }));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSearch = () => { setLoading(true); load(); };

  const deleteScene = async (id: string) => {
    if (!confirm('Weet je het zeker?')) return;
    await assetImages.delete(id);
    load();
  };

  return (
    <div className="p-8 animate-fade-in">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">AI Scenes</h1>
            <p className="text-sm text-zinc-500 mt-1">{scenes.length} gegenereerde video scene{scenes.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        <div className="flex gap-3 mb-6">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Zoek op prompt, tags..." className="input-base flex-1" />
          <div className="flex gap-1">
            <button onClick={() => setViewMode('grid')} className={`p-2.5 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-brand-500/20 text-brand-300' : 'bg-surface-200 text-zinc-500'}`}><Grid3x3 className="w-4 h-4" /></button>
            <button onClick={() => setViewMode('list')} className={`p-2.5 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-brand-500/20 text-brand-300' : 'bg-surface-200 text-zinc-500'}`}><List className="w-4 h-4" /></button>
          </div>
          <button onClick={handleSearch} className="btn-primary text-sm"><Search className="w-4 h-4" /> Zoek</button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-500" /></div>
        ) : scenes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-4 border border-white/[0.04]"><Clapperboard className="w-8 h-8 text-zinc-600" /></div>
            <p className="text-zinc-400 font-medium">Nog geen AI scenes</p>
            <p className="text-xs text-zinc-600 mt-1">Gegenereerde video scenes worden hier automatisch opgeslagen door stap 15 (Video Scenes Genereren)</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {scenes.map(scene => (
              <div key={scene.id} className="group relative bg-surface-100 rounded-xl border border-white/[0.06] overflow-hidden hover:border-white/[0.12] transition-all cursor-pointer"
                onClick={() => setSelectedScene(scene)}>
                <div className="aspect-video bg-surface-200 flex items-center justify-center overflow-hidden">
                  {scene.thumbnailPath ? <img src={scene.thumbnailPath} alt={scene.title} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : <Clapperboard className="w-8 h-8 text-zinc-700" />}
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-medium truncate">{scene.title}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    {scene.style && <span className="text-[10px] px-1.5 py-0.5 rounded border bg-indigo-500/10 text-indigo-400 border-indigo-500/20">{scene.style}</span>}
                    {scene.projectId && <span className="text-[10px] text-zinc-600">project</span>}
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); deleteScene(scene.id); }}
                  className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {scenes.map(scene => (
              <div key={scene.id} className="glass rounded-xl px-4 py-3 flex items-center justify-between group hover:bg-white/[0.03] transition-colors cursor-pointer"
                onClick={() => setSelectedScene(scene)}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shrink-0"><Clapperboard className="w-4 h-4 text-indigo-400" /></div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium truncate">{scene.title}</h3>
                    <p className="text-[11px] text-zinc-500 truncate">{scene.style || 'AI'} · {scene.timesUsed}x gebruikt</p>
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); deleteScene(scene.id); }}
                  className="btn-icon !p-1.5 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedScene && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" onClick={() => setSelectedScene(null)}>
          <div className="glass-strong rounded-2xl max-w-2xl w-full animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/[0.06] flex items-center justify-between">
              <h3 className="font-semibold truncate">{selectedScene.title}</h3>
              <button onClick={() => setSelectedScene(null)} className="btn-icon !p-1.5"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5">
              <div className="aspect-video bg-surface-200 rounded-xl overflow-hidden mb-4 border border-white/[0.06] flex items-center justify-center">
                {selectedScene.sourceUrl ? <video src={selectedScene.sourceUrl} controls className="w-full h-full" /> : <Clapperboard className="w-12 h-12 text-zinc-700" />}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-surface-100 rounded-lg p-3 border border-white/[0.04]"><p className="text-[10px] text-zinc-600 mb-0.5">Stijl</p><p className="text-xs font-medium">{selectedScene.style || '—'}</p></div>
                <div className="bg-surface-100 rounded-lg p-3 border border-white/[0.04]"><p className="text-[10px] text-zinc-600 mb-0.5">Gebruikt</p><p className="text-xs font-medium">{selectedScene.timesUsed}x</p></div>
                <div className="bg-surface-100 rounded-lg p-3 border border-white/[0.04]"><p className="text-[10px] text-zinc-600 mb-0.5">Bron</p><p className="text-xs font-medium">{selectedScene.source}</p></div>
              </div>
              {selectedScene.description && <p className="text-xs text-zinc-400 mt-3">{selectedScene.description}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
