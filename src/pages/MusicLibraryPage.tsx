import { useState, useEffect, useRef, useCallback } from 'react';
import { Trash2, Music, Search, Play, Pause, Square, Volume2, VolumeX, Filter, ChevronDown } from 'lucide-react';
import { mediaLibrary, getFileUrl } from '../api';

interface Track {
  id: string;
  title: string;
  filePath: string;
  duration: number;
  mood: string;
  genre: string;
  bpm: number | null;
  energyProfile: string | null;
  hasVocals: boolean;
  loopable: boolean;
  tags: string[];
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function AudioPlayer({ track, isPlaying, onPlay, onStop }: {
  track: Track;
  isPlaying: boolean;
  onPlay: () => void;
  onStop: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(track.duration || 0);
  const [volume, setVolume] = useState(0.7);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration || track.duration);
    const onEnded = () => onStop();

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, [track.duration, onStop]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = muted ? 0 : volume;
    }
  }, [volume, muted]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressRef.current;
    const audio = audioRef.current;
    if (!bar || !audio) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * (duration || track.duration);
  }, [duration, track.duration]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const audioUrl = getFileUrl(track.filePath);

  return (
    <div className="flex items-center gap-3 flex-1 min-w-0">
      <audio ref={audioRef} src={audioUrl} preload="none" />
      
      {/* Play/Stop */}
      <button
        onClick={isPlaying ? onStop : onPlay}
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all ${
          isPlaying 
            ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30' 
            : 'bg-surface-200 text-zinc-400 hover:bg-brand-500/20 hover:text-brand-300'
        }`}
      >
        {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
      </button>

      {/* Progress bar */}
      <div className="flex-1 min-w-0">
        <div
          ref={progressRef}
          onClick={handleSeek}
          className="h-1.5 bg-surface-200 rounded-full cursor-pointer group relative"
        >
          <div
            className="h-full bg-brand-500 rounded-full transition-[width] duration-100 relative"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-zinc-600 tabular-nums">{formatTime(currentTime)}</span>
          <span className="text-[10px] text-zinc-600 tabular-nums">{formatTime(duration || track.duration)}</span>
        </div>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button onClick={() => setMuted(!muted)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
          {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={muted ? 0 : volume}
          onChange={e => { setVolume(parseFloat(e.target.value)); setMuted(false); }}
          className="w-16 h-1 accent-brand-500 cursor-pointer"
        />
      </div>
    </div>
  );
}

export default function MusicLibraryPage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [genreFilter, setGenreFilter] = useState('');
  const [showGenreDropdown, setShowGenreDropdown] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => { loadTracks(); }, []);

  const loadTracks = async () => {
    try {
      const data = await mediaLibrary.getMusic();
      setTracks(data.map((t: any) => ({
        ...t,
        mood: typeof t.mood === 'string' ? (t.mood.startsWith('[') ? JSON.parse(t.mood) : t.mood) : t.mood,
        tags: typeof t.tags === 'string' ? (t.tags.startsWith('[') ? JSON.parse(t.tags) : []) : (t.tags || []),
      })));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const deleteTrack = async (id: string) => {
    if (!confirm('Weet je het zeker?')) return;
    if (playingId === id) setPlayingId(null);
    await mediaLibrary.deleteMusic(id);
    loadTracks();
  };

  // Filter en zoek
  const genres = [...new Set(tracks.map(t => t.genre).filter(Boolean))].sort();
  
  const filtered = tracks.filter(t => {
    if (genreFilter && t.genre !== genreFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return t.title.toLowerCase().includes(q) ||
        t.genre?.toLowerCase().includes(q) ||
        (Array.isArray(t.mood) ? t.mood.some((m: string) => m.toLowerCase().includes(q)) : String(t.mood || '').toLowerCase().includes(q));
    }
    return true;
  });

  const stopAll = () => setPlayingId(null);

  return (
    <div className="p-8 animate-fade-in">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Muziekbibliotheek</h1>
            <p className="text-sm text-zinc-500 mt-1">
              {filtered.length} van {tracks.length} track{tracks.length !== 1 ? 's' : ''}
              {playingId && ' · Nu aan het afspelen'}
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
              placeholder="Zoek op titel, genre, mood..."
              className="input-base pl-10 w-full"
            />
          </div>
          <div className="relative">
            <button
              onClick={() => setShowGenreDropdown(!showGenreDropdown)}
              className={`btn-secondary text-sm gap-1.5 ${genreFilter ? 'border-brand-500/40 text-brand-300' : ''}`}
            >
              <Filter className="w-3.5 h-3.5" />
              {genreFilter || 'Genre'}
              <ChevronDown className="w-3 h-3" />
            </button>
            {showGenreDropdown && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-surface-100 border border-white/[0.08] rounded-xl shadow-xl z-20 py-1 max-h-64 overflow-y-auto">
                <button
                  onClick={() => { setGenreFilter(''); setShowGenreDropdown(false); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-white/[0.04] transition-colors ${!genreFilter ? 'text-brand-300' : 'text-zinc-400'}`}
                >
                  Alle genres
                </button>
                {genres.map(g => (
                  <button
                    key={g}
                    onClick={() => { setGenreFilter(g); setShowGenreDropdown(false); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-white/[0.04] transition-colors ${genreFilter === g ? 'text-brand-300' : 'text-zinc-400'}`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Track list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-4 border border-white/[0.04]">
              <Music className="w-8 h-8 text-zinc-600" />
            </div>
            <p className="text-zinc-400 font-medium">
              {tracks.length === 0 ? 'Nog geen muziek' : 'Geen resultaten'}
            </p>
            <p className="text-xs text-zinc-600 mt-1">
              {tracks.length === 0
                ? 'Upload muziekbestanden om de library te vullen'
                : 'Pas je zoekterm of filter aan'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(track => (
              <div
                key={track.id}
                className={`glass rounded-xl px-4 py-3 transition-all ${
                  playingId === track.id
                    ? 'bg-brand-500/[0.06] border-brand-500/20 ring-1 ring-brand-500/10'
                    : 'hover:bg-white/[0.03]'
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Icon */}
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center border shrink-0 transition-colors ${
                    playingId === track.id
                      ? 'bg-brand-500/20 border-brand-500/30'
                      : 'bg-brand-500/10 border-brand-500/20'
                  }`}>
                    <Music className={`w-4 h-4 ${playingId === track.id ? 'text-brand-300' : 'text-brand-400'}`} />
                  </div>

                  {/* Info */}
                  <div className="min-w-0 w-48 shrink-0">
                    <h3 className="text-sm font-medium truncate">{track.title}</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-200 text-zinc-500 border border-white/[0.04]">
                        {track.genre || 'Onbekend'}
                      </span>
                      {track.bpm && (
                        <span className="text-[10px] text-zinc-600">{track.bpm} BPM</span>
                      )}
                      <span className="text-[10px] text-zinc-600">·</span>
                      <span className="text-[10px] text-zinc-600">{formatTime(track.duration)}</span>
                      {track.hasVocals && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">Vocals</span>
                      )}
                      {track.loopable && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">Loop</span>
                      )}
                    </div>
                  </div>

                  {/* Player */}
                  <AudioPlayer
                    track={track}
                    isPlaying={playingId === track.id}
                    onPlay={() => setPlayingId(track.id)}
                    onStop={() => setPlayingId(null)}
                  />

                  {/* Delete */}
                  <button
                    onClick={() => deleteTrack(track.id)}
                    className="btn-icon !p-1.5 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Click-away voor genre dropdown */}
      {showGenreDropdown && (
        <div className="fixed inset-0 z-10" onClick={() => setShowGenreDropdown(false)} />
      )}
    </div>
  );
}
