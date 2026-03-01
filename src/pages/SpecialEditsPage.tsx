import { useState, useEffect } from 'react';
import { Trash2, Wand2, ChevronDown, ChevronRight, Play, Code, Info } from 'lucide-react';
import { mediaLibrary } from '../api';

export default function SpecialEditsPage() {
  const [edits, setEdits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => { loadEdits(); }, []);

  const loadEdits = async () => {
    try { setEdits(await mediaLibrary.getSpecialEdits()); }
    catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  };

  const deleteEdit = async (id: string) => {
    if (!confirm('Weet je het zeker?')) return;
    await mediaLibrary.deleteSpecialEdit(id);
    loadEdits();
  };

  const categories = ['all', ...new Set(edits.map(e => {
    try { return JSON.parse(e.applicableFor || '[]')[0] || 'other'; } catch { return 'other'; }
  }))];

  const filtered = filter === 'all' ? edits : edits.filter(e => {
    try { return JSON.parse(e.applicableFor || '[]')[0] === filter; } catch { return false; }
  });

  const catColors: Record<string, string> = {
    data: 'bg-blue-500/15 text-blue-300',
    comparison: 'bg-purple-500/15 text-purple-300',
    location: 'bg-green-500/15 text-green-300',
    text: 'bg-amber-500/15 text-amber-300',
    person: 'bg-pink-500/15 text-pink-300',
    other: 'bg-zinc-500/15 text-zinc-300',
  };

  return (
    <div className="p-8 animate-fade-in">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Special Edits &amp; Motion Graphics</h1>
          <p className="text-sm text-zinc-500 mt-1">{edits.length} preset{edits.length !== 1 ? 's' : ''} beschikbaar</p>
        </div>

        {/* Category filter */}
        <div className="flex gap-1.5 mb-6 flex-wrap">
          {categories.map(cat => (
            <button key={cat} onClick={() => setFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filter === cat ? 'bg-brand-600/20 text-brand-300' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'}`}>
              {cat === 'all' ? `Alles (${edits.length})` : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-4 border border-white/[0.04]"><Wand2 className="w-8 h-8 text-zinc-600" /></div>
            <p className="text-zinc-400 font-medium">Geen edits in deze categorie</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(edit => {
              const isOpen = expandedId === edit.id;
              let cat = 'other';
              try { cat = JSON.parse(edit.applicableFor || '[]')[0] || 'other'; } catch {}
              const catClass = catColors[cat] || catColors.other;

              return (
                <div key={edit.id} className="glass rounded-2xl overflow-hidden group">
                  {/* 16:9 Preview */}
                  <div className="relative aspect-video bg-surface-200 overflow-hidden">
                    {edit.previewUrl ? (
                      <iframe
                        src={edit.previewUrl}
                        className="w-full h-full border-0"
                        sandbox="allow-scripts"
                        title={edit.name}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Wand2 className="w-10 h-10 text-zinc-700" />
                      </div>
                    )}
                    {/* Category badge */}
                    <div className={`absolute top-2 left-2 text-[9px] px-2 py-0.5 rounded-full font-semibold ${catClass}`}>
                      {cat}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-white truncate">{edit.name.replace('Motion: ', '')}</h3>
                        <p className="text-[10px] text-zinc-500 mt-0.5 line-clamp-2">{edit.description}</p>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={() => setExpandedId(isOpen ? null : edit.id)}
                          className="text-zinc-600 hover:text-zinc-300 p-1">
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <Info className="w-4 h-4" />}
                        </button>
                        <button onClick={() => deleteEdit(edit.id)}
                          className="text-zinc-600 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isOpen && (
                      <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2">
                        {edit.usageGuide && (
                          <div>
                            <span className="text-[9px] text-zinc-500 font-semibold uppercase">Gebruik</span>
                            <pre className="text-[10px] text-zinc-400 font-mono mt-0.5 whitespace-pre-wrap bg-surface-200 rounded-lg p-2">{edit.usageGuide}</pre>
                          </div>
                        )}
                        {edit.scriptPath && (
                          <div className="flex items-center gap-1.5 text-[10px]">
                            <Code className="w-3 h-3 text-zinc-500" />
                            <span className="text-zinc-400 font-mono">{edit.scriptPath}</span>
                          </div>
                        )}
                        {edit.parameters && edit.parameters !== '{}' && (
                          <div>
                            <span className="text-[9px] text-zinc-500 font-semibold uppercase">Parameters</span>
                            <pre className="text-[9px] text-zinc-500 font-mono mt-0.5 bg-surface-200 rounded-lg p-2 max-h-[120px] overflow-auto">{JSON.stringify(JSON.parse(edit.parameters), null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
