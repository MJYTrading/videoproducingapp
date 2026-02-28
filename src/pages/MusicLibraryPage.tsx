import { useState, useEffect } from 'react';
import { Trash2, Music } from 'lucide-react';
import { mediaLibrary } from '../api';

export default function MusicLibraryPage() {
  const [tracks, setTracks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadTracks(); }, []);

  const loadTracks = async () => {
    try { setTracks(await mediaLibrary.getMusic()); }
    catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  };

  const deleteTrack = async (id: string) => {
    if (!confirm('Weet je het zeker?')) return;
    await mediaLibrary.deleteMusic(id);
    loadTracks();
  };

  return (
    <div className="p-8 animate-fade-in">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Muziekbibliotheek</h1>
          <p className="text-sm text-zinc-500 mt-1">{tracks.length} track{tracks.length !== 1 ? 's' : ''} beschikbaar</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-500" /></div>
        ) : tracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-4 border border-white/[0.04]"><Music className="w-8 h-8 text-zinc-600" /></div>
            <p className="text-zinc-400 font-medium">Nog geen muziek</p>
            <p className="text-xs text-zinc-600 mt-1">Upload muziekbestanden via de API of beheer ze hier</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tracks.map(track => (
              <div key={track.id} className="glass rounded-xl px-4 py-3 flex items-center justify-between group hover:bg-white/[0.03] transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-brand-500/10 flex items-center justify-center border border-brand-500/20 shrink-0"><Music className="w-4 h-4 text-brand-400" /></div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium truncate">{track.title}</h3>
                    <p className="text-[11px] text-zinc-500">
                      {track.genre} · {Math.round(track.duration)}s{track.bpm ? ` · ${track.bpm} BPM` : ''}
                      {track.hasVocals && ' · Vocals'}{track.loopable && ' · Loopable'}
                    </p>
                  </div>
                </div>
                <button onClick={() => deleteTrack(track.id)} className="btn-icon !p-1.5 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
