import { useState, useEffect } from 'react';
import { Lightbulb, Sparkles, ArrowRight, Trash2 } from 'lucide-react';
import { ideation, channels as channelsApi } from '../api';

export default function IdeationPage() {
  const [ideas, setIdeas] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState('');
  const [topic, setTopic] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [ideasData, channelsData] = await Promise.all([
        ideation.getAll(),
        channelsApi.getAll(),
      ]);
      setIdeas(ideasData);
      setChannels(channelsData);
      if (channelsData.length > 0 && !selectedChannel) {
        setSelectedChannel(channelsData[0].id);
      }
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  };

  const generateIdeas = async () => {
    if (!selectedChannel) return;
    setGenerating(true);
    try {
      await ideation.brainstorm({ channelId: selectedChannel, topic: topic || undefined });
      await loadData();
    } catch (e: any) { alert(e.message); }
    finally { setGenerating(false); }
  };

  const deleteIdea = async (id: string) => {
    if (!confirm('Idee verwijderen?')) return;
    await ideation.delete(id);
    loadData();
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Lightbulb className="w-7 h-7 text-yellow-400" /> Ideation
          </h1>
          <p className="text-zinc-400 mt-1">Genereer video ideeën met AI + NexLev analyse</p>
        </div>
      </div>

      {/* Generate section */}
      <div className="card p-6 mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">Nieuwe ideeën genereren</h2>
        <div className="flex gap-3">
          <select
            value={selectedChannel}
            onChange={e => setSelectedChannel(e.target.value)}
            className="input w-64"
          >
            <option value="">Selecteer kanaal...</option>
            {channels.map(ch => (
              <option key={ch.id} value={ch.id}>{ch.name}</option>
            ))}
          </select>
          <input
            type="text"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="Optioneel: specifiek topic..."
            className="input flex-1"
          />
          <button
            onClick={generateIdeas}
            disabled={generating || !selectedChannel}
            className="btn btn-primary"
          >
            {generating ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span> Genereren...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Brainstorm
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Ideas list */}
      {loading ? (
        <div className="text-zinc-500 text-center py-20">Laden...</div>
      ) : ideas.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">
          <Lightbulb className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>Nog geen ideeën gegenereerd</p>
          <p className="text-sm mt-1">Selecteer een kanaal en klik op Brainstorm</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ideas.map(idea => (
            <div key={idea.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-white text-lg">{idea.title}</h3>
                  <p className="text-zinc-400 mt-1 text-sm">{idea.description}</p>
                  <div className="flex gap-2 mt-3">
                    <span className="text-xs px-2 py-0.5 rounded bg-brand-600/20 text-brand-300">{idea.videoType}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${idea.status === 'converted' ? 'bg-green-600/20 text-green-300' : 'bg-zinc-700 text-zinc-400'}`}>
                      {idea.status === 'converted' ? 'Omgezet' : 'Opgeslagen'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  {idea.status !== 'converted' && (
                    <button className="btn btn-sm btn-primary flex items-center gap-1">
                      <ArrowRight className="w-3 h-3" /> Project
                    </button>
                  )}
                  <button onClick={() => deleteIdea(idea.id)} className="btn-icon text-zinc-600 hover:text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
