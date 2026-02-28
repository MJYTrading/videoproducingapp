import { useState, useEffect, useRef, useCallback } from 'react';
import { Trash2, Volume2, Search, Play, Pause, Square, Filter, ChevronDown } from 'lucide-react';
import { mediaLibrary, getFileUrl } from '../api';

interface SoundFx {
  id: string;
  name: string;
  filePath: string;
  duration: number;
  category: string;
  intensity: string;
  tags: string[];
  usageGuide: string | null;
}

function formatMs(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0.0s';
  return seconds < 1 ? `${Math.round(seconds * 1000)}ms` : `${Math.round(seconds * 10) / 10}s`;
}

function SfxPlayer({ sfx, isPlaying, onPlay, onStop }: {
  sfx: SoundFx;
  isPlaying: boolean;
  onPlay: () => void;
  onStop: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onEnded = () => onStop();
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, [onStop]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } else {
      audio.pause();
      audio.currentTime = 0;
      setCurrentTime(0);
    }
  }, [isPlaying]);

  const progress = sfx.duration > 0 ? (currentTime / sfx.duration) * 100 : 0;
  const audioUrl = getFileUrl(sfx.filePath);

  return (
    <div className="flex items-center gap-2">
      <audio ref={audioRef} src={audioUrl} preload="none" />
      <button
        onClick={isPlaying ? onStop : onPlay}
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all ${
          isPlaying
            ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/30'
            : 'bg-surface-200 text-zinc-400 hover:bg-purple-500/20 hover:text-purple-300'
        }`}
      >
        {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
      </button>
      {/* Mini progress bar */}
      <div className="w-16 h-1 bg-surface-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-purple-500 rounded-full transition-[width] duration-100"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export default function SfxLibraryPage() {
  const [effects, setEffects] = useState<SoundFx[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showCatDropdown, setShowCatDropdown] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => { loadEffects(); }, []);

  const loadEffects = async () => {
    try {
      const data = await mediaLibrary.getSfx();
      setEffects(data.map((s: any) => ({
        ...s,
        tags: typeof s.tags === 'string' ? (s.tags.startsWith('[') ? JSON.parse(s.tags) : []) : (s.tags || []),
      })));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const deleteEffect = async (id: string) => {
    if (!confirm('Weet je het zeker?')) return;
    if (playingId === id) setPlayingId(null);
    await mediaLibrary.deleteSfx(id);
    loadEffects();
  };

  const categories = [...new Set(effects.map(s => s.category).filter(Boolean))].sort();

  const filtered = effects.filter(s => {
    if (categoryFilter && s.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.name.toLowerCase().includes(q) ||
        s.category?.toLowerCase().includes(q) ||
        s.intensity?.toLowerCase().includes(q);
    }
    return true;
  });

  const stopAll = () => setPlayingId(null);

  // Groepeer per categorie voor overzichtelijkheid
  const grouped = categoryFilter
    ? { [categoryFilter]: filtered }
    : filtered.reduce((acc, sfx) => {
        const cat = sfx.category || 'Overig';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(sfx);
        return acc;
      }, {} as Record<string, SoundFx[]>);

  const sortedCategories = Object.keys(grouped).sort();

  return (
    <div className="p-8 animate-fade-in">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Sound Effects</h1>
            <p className="text-sm text-zinc-500 mt-1">
              {filtered.length} van {effects.length} effect{effects.length !== 1 ? 's' : ''}
              {categories.length > 0 && ` · ${categories.length} categorieën`}
            </p>
          </div>
          {playingId && (
            <button onClick={stopAll} className="btn-secondary text-xs gap-1.5">
              <Square className="w-3 h-3" /> Stop
            </button>
          )}
        </div>

        {/* Zoek en filter */}
        <div className="flex gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Zoek op naam, categorie..."
              className="input-base pl-10 w-full"
            />
          </div>
          <div className="relative">
            <button
              onClick={() => setShowCatDropdown(!showCatDropdown)}
              className={`btn-secondary text-sm gap-1.5 ${categoryFilter ? 'border-purple-500/40 text-purple-300' : ''}`}
            >
              <Filter className="w-3.5 h-3.5" />
              {categoryFilter || 'Categorie'}
              <ChevronDown className="w-3 h-3" />
            </button>
            {showCatDropdown && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-surface-100 border border-white/[0.08] rounded-xl shadow-xl z-20 py-1 max-h-64 overflow-y-auto">
                <button
                  onClick={() => { setCategoryFilter(''); setShowCatDropdown(false); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-white/[0.04] transition-colors ${!categoryFilter ? 'text-purple-300' : 'text-zinc-400'}`}
                >
                  Alle categorieën
                </button>
                {categories.map(c => (
                  <button
                    key={c}
                    onClick={() => { setCategoryFilter(c); setShowCatDropdown(false); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-white/[0.04] transition-colors ${categoryFilter === c ? 'text-purple-300' : 'text-zinc-400'}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* SFX list gegroepeerd per categorie */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-4 border border-white/[0.04]">
              <Volume2 className="w-8 h-8 text-zinc-600" />
            </div>
            <p className="text-zinc-400 font-medium">
              {effects.length === 0 ? 'Nog geen sound effects' : 'Geen resultaten'}
            </p>
            <p className="text-xs text-zinc-600 mt-1">
              {effects.length === 0
                ? 'Sound effects worden automatisch beheerd door de pipeline'
                : 'Pas je zoekterm of filter aan'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {sortedCategories.map(cat => (
              <div key={cat}>
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-1">
                  {cat} <span className="text-zinc-600 font-normal">({grouped[cat].length})</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {grouped[cat].map(sfx => (
                    <div
                      key={sfx.id}
                      className={`glass rounded-xl px-3 py-2.5 flex items-center justify-between group transition-all ${
                        playingId === sfx.id
                          ? 'bg-purple-500/[0.06] border-purple-500/20 ring-1 ring-purple-500/10'
                          : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <SfxPlayer
                          sfx={sfx}
                          isPlaying={playingId === sfx.id}
                          onPlay={() => setPlayingId(sfx.id)}
                          onStop={() => setPlayingId(null)}
                        />
                        <div className="min-w-0 flex-1">
                          <h3 className="text-xs font-medium truncate">{sfx.name}</h3>
                          <p className="text-[10px] text-zinc-600">
                            {formatMs(sfx.duration)}
                            {sfx.intensity && sfx.intensity !== 'medium' && ` · ${sfx.intensity}`}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => deleteEffect(sfx.id)}
                        className="btn-icon !p-1 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Click-away voor dropdown */}
      {showCatDropdown && (
        <div className="fixed inset-0 z-10" onClick={() => setShowCatDropdown(false)} />
      )}
    </div>
  );
}
