import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Edit2, X, Mic } from 'lucide-react';
import * as api from '../api';

interface Voice {
  id: string;
  name: string;
  voiceId: string;
  description: string;
  language: string;
}

export default function VoicesPage() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newVoice, setNewVoice] = useState({ name: '', voiceId: '', description: '', language: 'en-US' });
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ name: '', voiceId: '', description: '', language: '' });
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchVoices = async () => {
    try {
      const data = await api.voices.getAll();
      if (data.length === 0) {
        await api.voices.seed();
        const seeded = await api.voices.getAll();
        setVoices(seeded);
      } else {
        setVoices(data);
      }
    } catch (err: any) {
      showMsg('Laden mislukt: ' + err.message, 'error');
    }
    setLoading(false);
  };

  useEffect(() => { fetchVoices(); }, []);

  const showMsg = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleCreate = async () => {
    if (!newVoice.name || !newVoice.voiceId) { showMsg('Naam en Voice ID zijn verplicht', 'error'); return; }
    try {
      await api.voices.create(newVoice);
      setNewVoice({ name: '', voiceId: '', description: '', language: 'en-US' });
      setShowNew(false);
      await fetchVoices();
      showMsg('Voice toegevoegd!', 'success');
    } catch (err: any) { showMsg(err.message, 'error'); }
  };

  const handleUpdate = async (id: string) => {
    try {
      await api.voices.update(id, editData);
      setEditId(null);
      await fetchVoices();
      showMsg('Voice bijgewerkt!', 'success');
    } catch (err: any) { showMsg(err.message, 'error'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Weet je zeker dat je deze voice wilt verwijderen?')) return;
    try {
      await api.voices.remove(id);
      await fetchVoices();
      showMsg('Voice verwijderd', 'success');
    } catch (err: any) { showMsg(err.message, 'error'); }
  };

  const startEdit = (v: Voice) => {
    setEditId(v.id);
    setEditData({ name: v.name, voiceId: v.voiceId, description: v.description, language: v.language });
  };

  const LANGUAGES = ['en-US', 'en-GB', 'en-AU', 'en-CA', 'nl-NL', 'nl-BE', 'de-DE', 'fr-FR', 'es-ES'];

  if (loading) {
    return <div className="p-8 flex items-center justify-center h-[60vh]"><p className="text-zinc-400">Voices laden...</p></div>;
  }

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Voices</h1>
          <button onClick={() => setShowNew(!showNew)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors">
            {showNew ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            {showNew ? 'Annuleren' : 'Nieuwe Voice'}
          </button>
        </div>

        {message && (
          <div className={'mb-6 p-4 rounded-lg border ' + (message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400')}>
            {message.text}
          </div>
        )}

        {showNew && (
          <div className="mb-6 bg-zinc-800 rounded-lg p-6 border border-blue-500/30 space-y-4">
            <h2 className="text-lg font-semibold">Nieuwe Voice</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-zinc-300">Naam *</label>
                <input type="text" value={newVoice.name} onChange={(e) => setNewVoice({ ...newVoice, name: e.target.value })}
                  placeholder="Bijv. John" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-zinc-300">Voice ID *</label>
                <input type="text" value={newVoice.voiceId} onChange={(e) => setNewVoice({ ...newVoice, voiceId: e.target.value })}
                  placeholder="Elevate/ElevenLabs Voice ID" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-zinc-300">Beschrijving</label>
                <input type="text" value={newVoice.description} onChange={(e) => setNewVoice({ ...newVoice, description: e.target.value })}
                  placeholder="Bijv. Deep Male, Crime Narrator" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-zinc-300">Taal</label>
                <select value={newVoice.language} onChange={(e) => setNewVoice({ ...newVoice, language: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm">
                  {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
            <button onClick={handleCreate} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 px-6 py-2 rounded-lg transition-colors">
              <Save className="w-4 h-4" /> Toevoegen
            </button>
          </div>
        )}

        <div className="space-y-3">
          {voices.map((v) => (
            <div key={v.id} className="bg-zinc-800 rounded-lg border border-zinc-700 p-4">
              {editId === v.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" value={editData.name} onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                      className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm" />
                    <input type="text" value={editData.voiceId} onChange={(e) => setEditData({ ...editData, voiceId: e.target.value })}
                      className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm" />
                    <input type="text" value={editData.description} onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                      className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm" />
                    <select value={editData.language} onChange={(e) => setEditData({ ...editData, language: e.target.value })}
                      className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm">
                      {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleUpdate(v.id)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm transition-colors">
                      <Save className="w-4 h-4" /> Opslaan
                    </button>
                    <button onClick={() => setEditId(null)} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm transition-colors">Annuleren</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Mic className="w-4 h-4 text-purple-400" />
                    <div>
                      <span className="font-semibold">{v.name}</span>
                      <span className="text-zinc-400 ml-2">— {v.description}</span>
                      <span className="text-zinc-500 ml-2 text-sm">({v.language})</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-600 font-mono">{v.voiceId.substring(0, 12)}...</span>
                    <button onClick={() => startEdit(v)} className="p-2 hover:bg-zinc-700 rounded-lg transition-colors" title="Bewerken">
                      <Edit2 className="w-4 h-4 text-zinc-400" />
                    </button>
                    <button onClick={() => handleDelete(v.id)} className="p-2 hover:bg-red-600/20 text-red-400 rounded-lg transition-colors" title="Verwijderen">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
