import { useState, useEffect } from 'react';
import { Trash2, Video, Search, Plus, X, ExternalLink, Grid3x3, List } from 'lucide-react';

const API_BASE = '/api/asset-images';

async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem('token');
  const res = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts?.headers } });
  return res;
}

export default function BRollPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [addDescription, setAddDescription] = useState('');
  const [addTags, setAddTags] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const params = new URLSearchParams({ limit: '200', category: 'b-roll' });
      if (search) params.set('search', search);
      const res = await apiFetch(`${API_BASE}?${params}`);
      setItems(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSearch = () => { setLoading(true); load(); };

  const deleteItem = async (id: string) => {
    if (!confirm('Weet je het zeker?')) return;
    await apiFetch(`${API_BASE}/${id}`, { method: 'DELETE' });
    load();
  };

  const handleAdd = async () => {
    if (!addTitle || !addUrl) return;
    setSubmitting(true);
    try {
      await apiFetch(API_BASE, {
        method: 'POST',
        body: JSON.stringify({
          title: addTitle, sourceUrl: addUrl, category: 'b-roll',
          description: addDescription, source: 'manual',
          tags: addTags.split(',').map(t => t.trim()).filter(Boolean),
        }),
      });
      setShowAddModal(false);
      setAddTitle(''); setAddUrl(''); setAddDescription(''); setAddTags('');
      load();
    } catch (e) { console.error(e); }
    setSubmitting(false);
  };

  return (
    <div className="p-8 animate-fade-in">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">B-Roll Footage</h1>
            <p className="text-sm text-zinc-500 mt-1">{items.length} video{items.length !== 1 ? "'s" : ''} beschikbaar</p>
          </div>
          <button onClick={() => setShowAddModal(true)} className="btn-primary text-sm"><Plus className="w-4 h-4" /> Toevoegen</button>
        </div>

        <div className="flex gap-3 mb-6">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Zoek op titel, tags..." className="input-base flex-1" />
          <div className="flex gap-1">
            <button onClick={() => setViewMode('grid')} className={`p-2.5 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-brand-500/20 text-brand-300' : 'bg-surface-200 text-zinc-500'}`}><Grid3x3 className="w-4 h-4" /></button>
            <button onClick={() => setViewMode('list')} className={`p-2.5 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-brand-500/20 text-brand-300' : 'bg-surface-200 text-zinc-500'}`}><List className="w-4 h-4" /></button>
          </div>
          <button onClick={handleSearch} className="btn-primary text-sm"><Search className="w-4 h-4" /> Zoek</button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-500" /></div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-4 border border-white/[0.04]"><Video className="w-8 h-8 text-zinc-600" /></div>
            <p className="text-zinc-400 font-medium">Geen B-roll footage</p>
            <p className="text-xs text-zinc-600 mt-1">Voeg video's toe voor gebruik als achtergrond footage in je projecten</p>
            <button onClick={() => setShowAddModal(true)} className="btn-secondary text-xs mt-4"><Plus className="w-3.5 h-3.5" /> Eerste video toevoegen</button>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {items.map(item => (
              <div key={item.id} className="group relative bg-surface-100 rounded-xl border border-white/[0.06] overflow-hidden hover:border-white/[0.12] transition-all">
                <div className="aspect-video bg-surface-200 flex items-center justify-center">
                  <Video className="w-8 h-8 text-zinc-700" />
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-medium truncate">{item.title}</p>
                  <p className="text-[10px] text-zinc-600 truncate mt-0.5">{item.tags?.slice(0, 3).join(', ') || 'Geen tags'}</p>
                </div>
                <button onClick={() => deleteItem(item.id)} className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(item => (
              <div key={item.id} className="glass rounded-xl px-4 py-3 flex items-center justify-between group hover:bg-white/[0.03] transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shrink-0"><Video className="w-4 h-4 text-blue-400" /></div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium truncate">{item.title}</h3>
                    <p className="text-[11px] text-zinc-500">{item.timesUsed}x gebruikt · {item.tags?.slice(0, 3).join(', ') || 'Geen tags'}</p>
                  </div>
                </div>
                <button onClick={() => deleteItem(item.id)} className="btn-icon !p-1.5 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-strong rounded-2xl max-w-md w-full animate-scale-in">
            <div className="p-5 border-b border-white/[0.06] flex items-center justify-between">
              <h3 className="font-semibold">B-Roll Toevoegen</h3>
              <button onClick={() => setShowAddModal(false)} className="btn-icon !p-1.5"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div><label className="block text-xs text-zinc-500 mb-1">Titel *</label><input type="text" value={addTitle} onChange={e => setAddTitle(e.target.value)} className="input-base text-sm" /></div>
              <div><label className="block text-xs text-zinc-500 mb-1">URL *</label><input type="url" value={addUrl} onChange={e => setAddUrl(e.target.value)} className="input-base text-sm" placeholder="https://..." /></div>
              <div><label className="block text-xs text-zinc-500 mb-1">Beschrijving</label><textarea value={addDescription} onChange={e => setAddDescription(e.target.value)} rows={2} className="input-base text-sm resize-none" /></div>
              <div><label className="block text-xs text-zinc-500 mb-1">Tags (komma-gescheiden)</label><input type="text" value={addTags} onChange={e => setAddTags(e.target.value)} className="input-base text-sm" /></div>
            </div>
            <div className="p-5 border-t border-white/[0.06] flex justify-end gap-3">
              <button onClick={() => setShowAddModal(false)} className="btn-secondary text-sm">Annuleren</button>
              <button onClick={handleAdd} disabled={!addTitle || !addUrl || submitting} className="btn-primary text-sm disabled:opacity-50">{submitting ? 'Toevoegen...' : 'Toevoegen'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
