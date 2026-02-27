import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Edit2, X, Mic } from 'lucide-react';
import * as api from '../api';

interface Voice { id: string; name: string; voiceId: string; description: string; language: string; }

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
      if (data.length === 0) { await api.voices.seed(); const seeded = await api.voices.getAll(); setVoices(seeded); }
      else setVoices(data);
    } catch (err: any) { showMsg('Laden mislukt: ' + err.message, 'error'); }
    setLoading(false);
  };

  useEffect(() => { fetchVoices(); }, []);

  const showMsg = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type }); setTimeout(() => setMessage(null), 3000);
  };

  const handleCreate = async () => {
    if (!newVoice.name || !newVoice.voiceId) { showMsg('Naam en Voice ID zijn verplicht', 'error'); return; }
    try {
      await api.voices.create(newVoice);
      setNewVoice({ name: '', voiceId: '', description: '', language: 'en-US' }); setShowNew(false);
      await fetchVoices(); showMsg('Voice toegevoegd!', 'success');
    } catch (err: any) { showMsg(err.message, 'error'); }
  };

  const handleUpdate = async (id: string) => {
    try { await api.voices.update(id, editData); setEditId(null); await fetchVoices(); showMsg('Voice bijgewerkt!', 'success'); }
    catch (err: any) { showMsg(err.message, 'error'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Weet je zeker dat je deze voice wilt verwijderen?')) return;
    try { await api.voices.remove(id); await fetchVoices(); showMsg('Voice verwijderd', 'success'); }
    catch (err: any) { showMsg(err.message, 'error'); }
  };

  const startEdit = (v: Voice) => { setEditId(v.id); setEditData({ name: v.name, voiceId: v.voiceId, description: v.description, language: v.language }); };

  const LANGUAGES = ['en-US', 'en-GB', 'en-AU', 'en-CA', 'nl-NL', 'nl-BE', 'de-DE', 'fr-FR', 'es-ES'];

  if (loading) return <div className="p-8 flex items-center justify-center h-[60vh]"><p className="text-zinc-500">Voices laden...</p></div>;

  return (
    <div className="p-8 animate-fade-in">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Voices</h1>
            <p className="text-sm text-zinc-500 mt-1">{voices.length} voice{voices.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={() => setShowNew(!showNew)} className={showNew ? 'btn-secondary' : 'btn-primary'}>
            {showNew ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showNew ? 'Annuleren' : 'Nieuwe Voice'}
          </button>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-xl border text-sm animate-fade-in ${message.type === 'success' ? 'bg-emerald-500/8 border-emerald-500/15 text-emerald-400' : 'bg-red-500/8 border-red-500/15 text-red-400'}`}>
            {message.text}
          </div>
        )}

        {showNew && (
          <div className="mb-6 section-card border-brand-500/20 animate-fade-in-down">
            <h2 className="section-title">Nieuwe Voice</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Naam *</label>
                <input type="text" value={newVoice.name} onChange={(e) => setNewVoice({ ...newVoice, name: e.target.value })} placeholder="Bijv. John" className="input-base text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Voice ID *</label>
                <input type="text" value={newVoice.voiceId} onChange={(e) => setNewVoice({ ...newVoice, voiceId: e.target.value })} placeholder="Elevate/ElevenLabs Voice ID" className="input-base text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Beschrijving</label>
                <input type="text" value={newVoice.description} onChange={(e) => setNewVoice({ ...newVoice, description: e.target.value })} placeholder="Bijv. Deep Male, Crime Narrator" className="input-base text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Taal</label>
                <select value={newVoice.language} onChange={(e) => setNewVoice({ ...newVoice, language: e.target.value })} className="input-base text-sm">
                  {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
            <button onClick={handleCreate} className="btn-success text-sm">
              <Save className="w-4 h-4" /> Toevoegen
            </button>
          </div>
        )}

        <div className="space-y-2.5">
          {voices.map((v) => (
            <div key={v.id} className="glass glass-hover rounded-xl p-4">
              {editId === v.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" value={editData.name} onChange={(e) => setEditData({ ...editData, name: e.target.value })} className="input-base text-sm" />
                    <input type="text" value={editData.voiceId} onChange={(e) => setEditData({ ...editData, voiceId: e.target.value })} className="input-base text-sm" />
                    <input type="text" value={editData.description} onChange={(e) => setEditData({ ...editData, description: e.target.value })} className="input-base text-sm" />
                    <select value={editData.language} onChange={(e) => setEditData({ ...editData, language: e.target.value })} className="input-base text-sm">
                      {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleUpdate(v.id)} className="btn-primary text-xs"><Save className="w-3.5 h-3.5" /> Opslaan</button>
                    <button onClick={() => setEditId(null)} className="btn-secondary text-xs">Annuleren</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center border border-purple-500/15">
                      <Mic className="w-4 h-4 text-purple-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{v.name}</span>
                        <span className="text-zinc-500 text-xs">— {v.description}</span>
                      </div>
                      <span className="text-zinc-600 text-[11px]">{v.language}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-700 font-mono">{v.voiceId.substring(0, 12)}...</span>
                    <button onClick={() => startEdit(v)} className="btn-icon" title="Bewerken"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(v.id)} className="btn-icon text-red-400/60 hover:text-red-400" title="Verwijderen"><Trash2 className="w-4 h-4" /></button>
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
