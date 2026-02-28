import { useState, useEffect, useRef } from 'react';
import { Trash2, Scissors, Search, Play, Pause, X, ExternalLink, Filter, ChevronDown, Video, Image } from 'lucide-react';
import { assetClips, getFileUrl } from '../api';

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function isVideoFile(path: string): boolean {
  if (!path) return false;
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext);
}

function isImageFile(path: string): boolean {
  if (!path) return false;
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
}

function MediaPreview({ clip, size = 'small' }: { clip: any; size?: 'small' | 'large' }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const localPath = clip.localPath || '';
  const sourceUrl = clip.sourceUrl || '';
  const isVideo = isVideoFile(localPath);
  const isImage = isImageFile(localPath) || isImageFile(sourceUrl);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.pause();
      setPlaying(false);
    } else {
      videoRef.current.play().catch(() => {});
      setPlaying(true);
    }
  };

  const sizeClasses = size === 'large'
    ? 'w-full aspect-video'
    : 'w-20 h-14';

  if (isVideo && localPath) {
    const url = getFileUrl(localPath);
    return (
      <div className={`${sizeClasses} relative rounded-lg overflow-hidden bg-surface-200 border border-white/[0.04] shrink-0 group/media`}>
        <video
          ref={videoRef}
          src={url}
          className="w-full h-full object-cover"
          onEnded={() => setPlaying(false)}
          muted={size === 'small'}
          controls={size === 'large'}
          preload="metadata"
        />
        {size === 'small' && (
          <button onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover/media:opacity-100 transition-opacity">
            {playing ? <Pause className="w-5 h-5 text-white" /> : <Play className="w-5 h-5 text-white ml-0.5" />}
          </button>
        )}
        <div className="absolute top-1 left-1">
          <Video className="w-3 h-3 text-white/70" />
        </div>
      </div>
    );
  }

  if (isImage) {
    const url = localPath ? getFileUrl(localPath) : sourceUrl;
    return (
      <div className={`${sizeClasses} rounded-lg overflow-hidden bg-surface-200 border border-white/[0.04] shrink-0 relative`}>
        <img src={url} alt={clip.title} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        <div className="absolute top-1 left-1">
          <Image className="w-3 h-3 text-white/70" />
        </div>
      </div>
    );
  }

  // Fallback: thumbnail of icoon
  if (clip.thumbnailPath) {
    return (
      <div className={`${sizeClasses} rounded-lg overflow-hidden bg-surface-200 border border-white/[0.04] shrink-0`}>
        <img src={getFileUrl(clip.thumbnailPath)} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      </div>
    );
  }

  return (
    <div className={`${sizeClasses} rounded-lg bg-surface-200 border border-white/[0.04] shrink-0 flex items-center justify-center`}>
      <Scissors className="w-4 h-4 text-zinc-600" />
    </div>
  );
}

export default function ClipLibraryPage() {
  const [clips, setClips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showCatDropdown, setShowCatDropdown] = useState(false);
  const [selectedClip, setSelectedClip] = useState<any | null>(null);

  useEffect(() => { loadClips(); }, []);

  const loadClips = async () => {
    try {
      const data = await assetClips.getAll({ search: search || undefined, limit: 200 });
      setClips(data.map((c: any) => ({
        ...c,
        tags: typeof c.tags === 'string' ? (c.tags.startsWith('[') ? JSON.parse(c.tags) : []) : (c.tags || []),
        subjects: typeof c.subjects === 'string' ? (c.subjects.startsWith('[') ? JSON.parse(c.subjects) : []) : (c.subjects || []),
      })));
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSearch = () => { setLoading(true); loadClips(); };

  const deleteClip = async (id: string) => {
    if (!confirm('Weet je het zeker?')) return;
    await assetClips.delete(id);
    if (selectedClip?.id === id) setSelectedClip(null);
    loadClips();
  };

  const categories = [...new Set(clips.map(c => c.category).filter(Boolean))].sort();

  const filtered = clips.filter(c => {
    if (categoryFilter && c.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.title?.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        c.category?.toLowerCase().includes(q) ||
        (Array.isArray(c.tags) && c.tags.some((t: string) => t.toLowerCase().includes(q)));
    }
    return true;
  });

  return (
    <div className="p-8 animate-fade-in">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Clip Library</h1>
            <p className="text-sm text-zinc-500 mt-1">
              {filtered.length} van {clips.length} clip{clips.length !== 1 ? 's' : ''}
              {categories.length > 0 && ` · ${categories.length} categorieën`}
            </p>
          </div>
        </div>

        {/* Zoek en filter */}
        <div className="flex gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Zoek op tags, beschrijving, categorie..." className="input-base pl-10 w-full" />
          </div>
          <div className="relative">
            <button onClick={() => setShowCatDropdown(!showCatDropdown)}
              className={`btn-secondary text-sm gap-1.5 ${categoryFilter ? 'border-brand-500/40 text-brand-300' : ''}`}>
              <Filter className="w-3.5 h-3.5" />{categoryFilter || 'Categorie'}<ChevronDown className="w-3 h-3" />
            </button>
            {showCatDropdown && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-surface-100 border border-white/[0.08] rounded-xl shadow-xl z-20 py-1 max-h-64 overflow-y-auto">
                <button onClick={() => { setCategoryFilter(''); setShowCatDropdown(false); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-white/[0.04] ${!categoryFilter ? 'text-brand-300' : 'text-zinc-400'}`}>
                  Alle categorieën
                </button>
                {categories.map(c => (
                  <button key={c} onClick={() => { setCategoryFilter(c); setShowCatDropdown(false); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-white/[0.04] ${categoryFilter === c ? 'text-brand-300' : 'text-zinc-400'}`}>
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={handleSearch} className="btn-primary text-sm"><Search className="w-4 h-4" /> Zoek</button>
        </div>

        {/* Clip list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-4 border border-white/[0.04]">
              <Scissors className="w-8 h-8 text-zinc-600" />
            </div>
            <p className="text-zinc-400 font-medium">{clips.length === 0 ? 'Geen clips gevonden' : 'Geen resultaten'}</p>
            <p className="text-xs text-zinc-600 mt-1">
              {clips.length === 0
                ? 'Clips worden automatisch toegevoegd wanneer de pipeline B-roll downloadt'
                : 'Pas je zoekterm of filter aan'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(clip => (
              <div key={clip.id}
                onClick={() => setSelectedClip(clip)}
                className="glass rounded-xl px-4 py-3 flex items-center gap-4 group hover:bg-white/[0.03] transition-colors cursor-pointer">
                
                {/* Preview */}
                <MediaPreview clip={clip} size="small" />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium truncate">{clip.title}</h3>
                  <p className="text-[11px] text-zinc-500 truncate">
                    {clip.category}
                    {clip.startTime && clip.endTime && ` · ${clip.startTime} → ${clip.endTime}`}
                    {` · ${clip.timesUsed}x gebruikt`}
                  </p>
                  {clip.tags?.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {clip.tags.slice(0, 4).map((tag: string, i: number) => (
                        <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-surface-200 text-zinc-500 border border-white/[0.04]">{tag}</span>
                      ))}
                      {clip.tags.length > 4 && <span className="text-[9px] text-zinc-600">+{clip.tags.length - 4}</span>}
                    </div>
                  )}
                </div>

                {/* Status badges */}
                <div className="flex items-center gap-2 shrink-0">
                  {clip.reviewStatus && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-md border ${
                      clip.reviewStatus === 'approved' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                      clip.reviewStatus === 'rejected' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                      'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    }`}>
                      {clip.reviewStatus}
                    </span>
                  )}
                  {clip.quality && (
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-brand-500/15 text-brand-300 border border-brand-500/20">
                      {Math.round(clip.quality * 100)}%
                    </span>
                  )}
                  <button onClick={e => { e.stopPropagation(); deleteClip(clip.id); }}
                    className="btn-icon !p-1.5 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selectedClip && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
          onClick={() => setSelectedClip(null)}>
          <div className="glass-strong rounded-2xl max-w-2xl w-full animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/[0.06] flex items-center justify-between">
              <h3 className="font-semibold truncate">{selectedClip.title}</h3>
              <div className="flex items-center gap-2">
                {selectedClip.sourceUrl && (
                  <a href={selectedClip.sourceUrl} target="_blank" rel="noopener noreferrer"
                    className="btn-icon !p-1.5 text-zinc-400 hover:text-brand-300">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                <button onClick={() => setSelectedClip(null)} className="btn-icon !p-1.5"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="p-5">
              {/* Large preview */}
              <div className="mb-4">
                <MediaPreview clip={selectedClip} size="large" />
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-surface-100 rounded-lg p-3 border border-white/[0.04]">
                  <p className="text-[10px] text-zinc-600 mb-0.5">Categorie</p>
                  <p className="text-xs font-medium">{selectedClip.category || '—'}</p>
                </div>
                <div className="bg-surface-100 rounded-lg p-3 border border-white/[0.04]">
                  <p className="text-[10px] text-zinc-600 mb-0.5">Timestamps</p>
                  <p className="text-xs font-medium">{selectedClip.startTime && selectedClip.endTime ? `${selectedClip.startTime} → ${selectedClip.endTime}` : '—'}</p>
                </div>
                <div className="bg-surface-100 rounded-lg p-3 border border-white/[0.04]">
                  <p className="text-[10px] text-zinc-600 mb-0.5">Gebruikt</p>
                  <p className="text-xs font-medium">{selectedClip.timesUsed}x</p>
                </div>
              </div>

              {selectedClip.description && (
                <p className="text-xs text-zinc-400 mb-3">{selectedClip.description}</p>
              )}

              {selectedClip.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {selectedClip.tags.map((tag: string, i: number) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-surface-200 text-zinc-400 border border-white/[0.04]">{tag}</span>
                  ))}
                </div>
              )}

              {selectedClip.sourceUrl && (
                <a href={selectedClip.sourceUrl} target="_blank" rel="noopener noreferrer"
                  className="text-[11px] text-brand-400 hover:text-brand-300 truncate block">
                  {selectedClip.sourceUrl}
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Click-away voor dropdown */}
      {showCatDropdown && <div className="fixed inset-0 z-10" onClick={() => setShowCatDropdown(false)} />}
    </div>
  );
}
