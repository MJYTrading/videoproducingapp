import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Edit2, X, Tv } from 'lucide-react';
import * as api from '../api';

interface Channel {
  id: string; name: string; driveFolderId: string; description: string | null; projectCount?: number; createdAt: string;
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDrive, setNewDrive] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDrive, setEditDrive] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchChannels = async () => {
    try { const data = await api.channels.getAll(); setChannels(data); } catch (err: any) { showMsg('Laden mislukt: ' + err.message, 'error'); }
    setLoading(false);
  };

  useEffect(() => { fetchChannels(); }, []);

  const showMsg = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type }); setTimeout(() => setMessage(null), 3000);
  };

  const handleCreate = async () => {
    if (!newName.trim()) { showMsg('Naam is verplicht', 'error'); return; }
    try {
      await api.channels.create({ name: newName.trim(), driveFolderId: newDrive.trim(), description: newDesc.trim() || null });
      setNewName(''); setNewDrive(''); setNewDesc(''); setShowNew(false);
      await fetchChannels(); showMsg('Kanaal aangemaakt!', 'success');
    } catch (err: any) { showMsg(err.message, 'error'); }
  };

  const handleUpdate = async (id: string) => {
    try {
      await api.channels.update(id, { name: editName, driveFolderId: editDrive, description: editDesc || null });
      setEditId(null); await fetchChannels(); showMsg('Kanaal bijgewerkt!', 'success');
    } catch (err: any) { showMsg(err.message, 'error'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Weet je zeker dat je dit kanaal wilt verwijderen?')) return;
    try { await api.channels.remove(id); await fetchChannels(); showMsg('Kanaal verwijderd', 'success'); } catch (err: any) { showMsg(err.message, 'error'); }
  };

  const startEdit = (ch: Channel) => { setEditId(ch.id); setEditName(ch.name); setEditDrive(ch.driveFolderId); setEditDesc(ch.description || ''); };

  if (loading) return <div className="p-8 flex items-center justify-center h-[60vh]"><p className="text-zinc-500">Kanalen laden...</p></div>;

  return (
    <div className="p-8 animate-fade-in">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Kanalen</h1>
            <p className="text-sm text-zinc-500 mt-1">{channels.length} kanaal{channels.length !== 1 ? 'en' : ''}</p>
          </div>
          <button onClick={() => setShowNew(!showNew)} className={showNew ? 'btn-secondary' : 'btn-primary'}>
            {showNew ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showNew ? 'Annuleren' : 'Nieuw Kanaal'}
          </button>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-xl border text-sm animate-fade-in ${message.type === 'success' ? 'bg-emerald-500/8 border-emerald-500/15 text-emerald-400' : 'bg-red-500/8 border-red-500/15 text-red-400'}`}>
            {message.text}
          </div>
        )}

        {showNew && (
          <div className="mb-6 section-card border-brand-500/20 animate-fade-in-down">
            <h2 className="section-title">Nieuw Kanaal</h2>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Naam *</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Bijv. MyCrimeChannel" className="input-base text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Google Drive Folder ID</label>
              <input type="text" value={newDrive} onChange={(e) => setNewDrive(e.target.value)} placeholder="Optioneel — voor uploads" className="input-base text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Beschrijving</label>
              <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={2} placeholder="Optioneel" className="input-base text-sm resize-none" />
            </div>
            <button onClick={handleCreate} className="btn-success text-sm">
              <Save className="w-4 h-4" /> Aanmaken
            </button>
          </div>
        )}

        {channels.length === 0 && !showNew && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-4 mx-auto border border-white/[0.04]">
              <Tv className="w-8 h-8 text-zinc-600" />
            </div>
            <p className="text-zinc-500 text-sm">Nog geen kanalen. Maak je eerste kanaal aan.</p>
          </div>
        )}

        <div className="space-y-2.5">
          {channels.map((ch) => (
            <div key={ch.id} className="glass glass-hover rounded-xl p-4">
              {editId === ch.id ? (
                <div className="space-y-3">
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="input-base text-sm" />
                  <input type="text" value={editDrive} onChange={(e) => setEditDrive(e.target.value)} placeholder="Google Drive Folder ID" className="input-base text-sm" />
                  <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={2} placeholder="Beschrijving" className="input-base text-sm resize-none" />
                  <div className="flex gap-2">
                    <button onClick={() => handleUpdate(ch.id)} className="btn-primary text-xs"><Save className="w-3.5 h-3.5" /> Opslaan</button>
                    <button onClick={() => setEditId(null)} className="btn-secondary text-xs">Annuleren</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Tv className="w-4 h-4 text-brand-400" />
                      <h3 className="font-semibold text-sm">{ch.name}</h3>
                      {ch.projectCount !== undefined && <span className="text-[11px] text-zinc-600">{ch.projectCount} projecten</span>}
                    </div>
                    {ch.description && <p className="text-xs text-zinc-500 mt-1">{ch.description}</p>}
                    {ch.driveFolderId && <p className="text-[11px] text-zinc-600 mt-0.5 font-mono">Drive: {ch.driveFolderId}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEdit(ch)} className="btn-icon" title="Bewerken"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(ch.id)} className="btn-icon text-red-400/60 hover:text-red-400" title="Verwijderen"><Trash2 className="w-4 h-4" /></button>
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
