import { useState, useEffect } from 'react';
import { Plus, Trash2, Music } from 'lucide-react';
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
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Music className="w-7 h-7 text-brand-400" /> Muziekbibliotheek
          </h1>
          <p className="text-zinc-400 mt-1">{tracks.length} tracks beschikbaar</p>
        </div>
      </div>

      {loading ? (
        <div className="text-zinc-500 text-center py-20">Laden...</div>
      ) : tracks.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">
          <Music className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>Nog geen muziek toegevoegd</p>
          <p className="text-sm mt-1">Upload muziekbestanden via de API of beheer ze hier</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tracks.map(track => (
            <div key={track.id} className="card p-4 flex items-center justify-between">
              <div>
                <h3 className="font-medium text-white">{track.title}</h3>
                <p className="text-xs text-zinc-500">
                  {track.genre} · {Math.round(track.duration)}s · {track.bpm ? `${track.bpm} BPM` : 'Geen BPM'}
                  {track.hasVocals && ' · Met vocals'} {track.loopable && ' · Loopable'}
                </p>
              </div>
              <button onClick={() => deleteTrack(track.id)} className="btn-icon text-zinc-600 hover:text-red-400">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
