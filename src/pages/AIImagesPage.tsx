import { useState, useEffect } from 'react';
import { Trash2, BrainCircuit, Search, Grid3x3, List, X, ExternalLink } from 'lucide-react';

const API_BASE = '/api/asset-images';

async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem('token');
  const res = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts?.headers } });
  return res;
}

export default function AIImagesPage() {
  const [images, setImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedImage, setSelectedImage] = useState<any | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const params = new URLSearchParams({ limit: '200', source: 'ai' });
      if (search) params.set('search', search);
      const res = await apiFetch(`${API_BASE}?${params}`);
      setImages(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSearch = () => { setLoading(true); load(); };

  const deleteImage = async (id: string) => {
    if (!confirm('Weet je het zeker?')) return;
    await apiFetch(`${API_BASE}/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="p-8 animate-fade-in">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">AI Images</h1>
            <p className="text-sm text-zinc-500 mt-1">{images.length} gegenereerde afbeelding{images.length !== 1 ? 'en' : ''}</p>
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
        ) : images.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-4 border border-white/[0.04]"><BrainCircuit className="w-8 h-8 text-zinc-600" /></div>
            <p className="text-zinc-400 font-medium">Nog geen AI images</p>
            <p className="text-xs text-zinc-600 mt-1">Gegenereerde afbeeldingen worden hier automatisch opgeslagen door stap 14 (Images Genereren)</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {images.map(img => (
              <div key={img.id} className="group relative bg-surface-100 rounded-xl border border-white/[0.06] overflow-hidden hover:border-white/[0.12] transition-all cursor-pointer"
                onClick={() => setSelectedImage(img)}>
                <div className="aspect-video bg-surface-200 flex items-center justify-center overflow-hidden">
                  {img.sourceUrl ? <img src={img.sourceUrl} alt={img.title} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : <BrainCircuit className="w-8 h-8 text-zinc-700" />}
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-medium truncate">{img.title}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    {img.style && <span className="text-[10px] px-1.5 py-0.5 rounded border bg-purple-500/10 text-purple-400 border-purple-500/20">{img.style}</span>}
                    {img.projectId && <span className="text-[10px] text-zinc-600">project</span>}
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); deleteImage(img.id); }}
                  className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {images.map(img => (
              <div key={img.id} className="glass rounded-xl px-4 py-3 flex items-center justify-between group hover:bg-white/[0.03] transition-colors cursor-pointer"
                onClick={() => setSelectedImage(img)}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-8 rounded-lg bg-surface-200 overflow-hidden shrink-0 border border-white/[0.04]">
                    {img.sourceUrl && <img src={img.sourceUrl} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium truncate">{img.title}</h3>
                    <p className="text-[11px] text-zinc-500 truncate">{img.style || 'AI'} · {img.timesUsed}x gebruikt</p>
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); deleteImage(img.id); }}
                  className="btn-icon !p-1.5 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedImage && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" onClick={() => setSelectedImage(null)}>
          <div className="glass-strong rounded-2xl max-w-2xl w-full animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/[0.06] flex items-center justify-between">
              <h3 className="font-semibold truncate">{selectedImage.title}</h3>
              <button onClick={() => setSelectedImage(null)} className="btn-icon !p-1.5"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5">
              <div className="aspect-video bg-surface-200 rounded-xl overflow-hidden mb-4 border border-white/[0.06]">
                {selectedImage.sourceUrl && <img src={selectedImage.sourceUrl} alt={selectedImage.title} className="w-full h-full object-contain" />}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-surface-100 rounded-lg p-3 border border-white/[0.04]"><p className="text-[10px] text-zinc-600 mb-0.5">Stijl</p><p className="text-xs font-medium">{selectedImage.style || '—'}</p></div>
                <div className="bg-surface-100 rounded-lg p-3 border border-white/[0.04]"><p className="text-[10px] text-zinc-600 mb-0.5">Gebruikt</p><p className="text-xs font-medium">{selectedImage.timesUsed}x</p></div>
                {selectedImage.width && <div className="bg-surface-100 rounded-lg p-3 border border-white/[0.04]"><p className="text-[10px] text-zinc-600 mb-0.5">Afmetingen</p><p className="text-xs font-medium">{selectedImage.width}x{selectedImage.height}</p></div>}
              </div>
              {selectedImage.description && <p className="text-xs text-zinc-400 mt-3">{selectedImage.description}</p>}
              {selectedImage.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {selectedImage.tags.map((tag: string, i: number) => <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-surface-200 text-zinc-400 border border-white/[0.04]">{tag}</span>)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
