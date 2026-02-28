import { useState, useEffect } from 'react';
import { Trash2, Image, Search, Plus, X, ExternalLink, Grid3x3, List } from 'lucide-react';
import { assetImages, getFileUrl } from '../api';

export default function ImageLibraryPage() {
  const [images, setImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState<any | null>(null);

  // Add form
  const [addTitle, setAddTitle] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [addCategory, setAddCategory] = useState('general');
  const [addDescription, setAddDescription] = useState('');
  const [addTags, setAddTags] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { loadImages(); }, []);

  const loadImages = async () => {
    try {
      setImages(await assetImages.getAll({
        search: search || undefined,
        source: sourceFilter !== 'all' ? sourceFilter : undefined,
        limit: 200,
      }));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSearch = () => { setLoading(true); loadImages(); };

  const deleteImage = async (id: string) => {
    if (!confirm('Weet je het zeker?')) return;
    await assetImages.delete(id);
    loadImages();
  };

  const handleAdd = async () => {
    if (!addTitle || !addUrl) return;
    setSubmitting(true);
    try {
      await assetImages.create({
        title: addTitle, sourceUrl: addUrl, category: addCategory,
        description: addDescription, source: 'manual',
        tags: addTags.split(',').map(t => t.trim()).filter(Boolean),
      });
      setShowAddModal(false);
      setAddTitle(''); setAddUrl(''); setAddCategory('general'); setAddDescription(''); setAddTags('');
      loadImages();
    } catch (e) { console.error(e); }
    setSubmitting(false);
  };

  const uniqueSources = Array.from(new Set(images.map(i => i.source))).sort();

  return (
    <div className="p-8 animate-fade-in">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Image Library</h1>
            <p className="text-sm text-zinc-500 mt-1">{images.length} afbeelding{images.length !== 1 ? 'en' : ''}</p>
          </div>
          <button onClick={() => setShowAddModal(true)} className="btn-primary text-sm">
            <Plus className="w-4 h-4" /> Toevoegen
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-6">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Zoek op titel, tags, beschrijving..." className="input-base flex-1" />
          <select value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); setTimeout(handleSearch, 0); }} className="input-base !w-auto">
            <option value="all">Alle bronnen</option>
            <option value="pipeline">Pipeline</option>
            <option value="manual">Handmatig</option>
            <option value="stock">Stock</option>
            <option value="ai">AI Generated</option>
            {uniqueSources.filter(s => !['pipeline','manual','stock','ai'].includes(s)).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="flex gap-1">
            <button onClick={() => setViewMode('grid')} className={`p-2.5 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-brand-500/20 text-brand-300' : 'bg-surface-200 text-zinc-500'}`}><Grid3x3 className="w-4 h-4" /></button>
            <button onClick={() => setViewMode('list')} className={`p-2.5 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-brand-500/20 text-brand-300' : 'bg-surface-200 text-zinc-500'}`}><List className="w-4 h-4" /></button>
          </div>
          <button onClick={handleSearch} className="btn-primary text-sm"><Search className="w-4 h-4" /> Zoek</button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-500" /></div>
        ) : images.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-4 border border-white/[0.04]"><Image className="w-8 h-8 text-zinc-600" /></div>
            <p className="text-zinc-400 font-medium">Geen afbeeldingen gevonden</p>
            <p className="text-xs text-zinc-600 mt-1">Voeg handmatig toe of ze worden automatisch opgeslagen door de pipeline</p>
            <button onClick={() => setShowAddModal(true)} className="btn-secondary text-xs mt-4"><Plus className="w-3.5 h-3.5" /> Eerste afbeelding toevoegen</button>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {images.map(img => (
              <div key={img.id} className="group relative bg-surface-100 rounded-xl border border-white/[0.06] overflow-hidden hover:border-white/[0.12] transition-all cursor-pointer"
                onClick={() => setSelectedImage(img)}>
                <div className="aspect-video bg-surface-200 flex items-center justify-center overflow-hidden">
                  {img.sourceUrl ? (
                    <img src={getFileUrl(img.sourceUrl, img.localPath)} alt={img.title} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <Image className="w-8 h-8 text-zinc-700" />
                  )}
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-medium truncate">{img.title}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                      img.source === 'ai' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                      img.source === 'pipeline' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                      img.source === 'stock' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                      'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                    }`}>{img.source}</span>
                    {img.category !== 'general' && <span className="text-[10px] text-zinc-600">{img.category}</span>}
                  </div>
                </div>
                {/* Delete on hover */}
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
                    {img.sourceUrl && <img src={getFileUrl(img.sourceUrl, img.localPath)} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium truncate">{img.title}</h3>
                    <p className="text-[11px] text-zinc-500 truncate">
                      {img.source} · {img.category}{img.timesUsed > 0 ? ` · ${img.timesUsed}x gebruikt` : ''}
                      {img.tags?.length > 0 && ` · ${img.tags.slice(0, 3).join(', ')}`}
                    </p>
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

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-strong rounded-2xl max-w-md w-full animate-scale-in">
            <div className="p-5 border-b border-white/[0.06] flex items-center justify-between">
              <h3 className="font-semibold">Afbeelding Toevoegen</h3>
              <button onClick={() => setShowAddModal(false)} className="btn-icon !p-1.5"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Titel *</label>
                <input type="text" value={addTitle} onChange={e => setAddTitle(e.target.value)} className="input-base text-sm" placeholder="Beschrijvende titel" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">URL *</label>
                <input type="url" value={addUrl} onChange={e => setAddUrl(e.target.value)} className="input-base text-sm" placeholder="https://..." />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Categorie</label>
                <select value={addCategory} onChange={e => setAddCategory(e.target.value)} className="input-base text-sm">
                  <option value="general">Algemeen</option>
                  <option value="background">Achtergrond</option>
                  <option value="b-roll">B-Roll</option>
                  <option value="thumbnail">Thumbnail</option>
                  <option value="overlay">Overlay</option>
                  <option value="character">Karakter</option>
                  <option value="object">Object</option>
                  <option value="scene">Scene</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Beschrijving</label>
                <textarea value={addDescription} onChange={e => setAddDescription(e.target.value)} rows={2} className="input-base text-sm resize-none" placeholder="Optionele beschrijving" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Tags (komma-gescheiden)</label>
                <input type="text" value={addTags} onChange={e => setAddTags(e.target.value)} className="input-base text-sm" placeholder="natuur, berg, zonsondergang" />
              </div>
            </div>
            <div className="p-5 border-t border-white/[0.06] flex justify-end gap-3">
              <button onClick={() => setShowAddModal(false)} className="btn-secondary text-sm">Annuleren</button>
              <button onClick={handleAdd} disabled={!addTitle || !addUrl || submitting} className="btn-primary text-sm disabled:opacity-50">
                {submitting ? 'Toevoegen...' : 'Toevoegen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" onClick={() => setSelectedImage(null)}>
          <div className="glass-strong rounded-2xl max-w-2xl w-full animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/[0.06] flex items-center justify-between">
              <h3 className="font-semibold truncate">{selectedImage.title}</h3>
              <button onClick={() => setSelectedImage(null)} className="btn-icon !p-1.5"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5">
              <div className="aspect-video bg-surface-200 rounded-xl overflow-hidden mb-4 border border-white/[0.06]">
                {selectedImage.sourceUrl && <img src={getFileUrl(selectedImage.sourceUrl, selectedImage.localPath)} alt={selectedImage.title} className="w-full h-full object-contain" />}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface-100 rounded-lg p-3 border border-white/[0.04]">
                  <p className="text-[10px] text-zinc-600 mb-0.5">Bron</p>
                  <p className="text-xs font-medium">{selectedImage.source}</p>
                </div>
                <div className="bg-surface-100 rounded-lg p-3 border border-white/[0.04]">
                  <p className="text-[10px] text-zinc-600 mb-0.5">Categorie</p>
                  <p className="text-xs font-medium">{selectedImage.category}</p>
                </div>
                {selectedImage.width && (
                  <div className="bg-surface-100 rounded-lg p-3 border border-white/[0.04]">
                    <p className="text-[10px] text-zinc-600 mb-0.5">Afmetingen</p>
                    <p className="text-xs font-medium">{selectedImage.width}x{selectedImage.height}</p>
                  </div>
                )}
                <div className="bg-surface-100 rounded-lg p-3 border border-white/[0.04]">
                  <p className="text-[10px] text-zinc-600 mb-0.5">Gebruikt</p>
                  <p className="text-xs font-medium">{selectedImage.timesUsed}x</p>
                </div>
              </div>
              {selectedImage.description && <p className="text-xs text-zinc-400 mt-3">{selectedImage.description}</p>}
              {selectedImage.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {selectedImage.tags.map((tag: string, i: number) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-surface-200 text-zinc-400 border border-white/[0.04]">{tag}</span>
                  ))}
                </div>
              )}
              {selectedImage.sourceUrl && (
                <a href={selectedImage.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 mt-3">
                  <ExternalLink className="w-3 h-3" /> Origineel bekijken
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
