import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Edit2, X, Tv } from 'lucide-react';
import * as api from '../api';

interface Channel {
  id: string;
  name: string;
  driveFolderId: string;
  description: string | null;
  projectCount?: number;
  createdAt: string;
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
    try {
      const data = await api.channels.getAll();
      setChannels(data);
    } catch (err: any) {
      showMsg('Laden mislukt: ' + err.message, 'error');
    }
    setLoading(false);
  };

  useEffect(() => { fetchChannels(); }, []);

  const showMsg = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleCreate = async () => {
    if (!newName.trim()) { showMsg('Naam is verplicht', 'error'); return; }
    try {
      await api.channels.create({ name: newName.trim(), driveFolderId: newDrive.trim(), description: newDesc.trim() || null });
      setNewName(''); setNewDrive(''); setNewDesc(''); setShowNew(false);
      await fetchChannels();
      showMsg('Kanaal aangemaakt!', 'success');
    } catch (err: any) {
      showMsg(err.message, 'error');
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      await api.channels.update(id, { name: editName, driveFolderId: editDrive, description: editDesc || null });
      setEditId(null);
      await fetchChannels();
      showMsg('Kanaal bijgewerkt!', 'success');
    } catch (err: any) {
      showMsg(err.message, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Weet je zeker dat je dit kanaal wilt verwijderen?')) return;
    try {
      await api.channels.remove(id);
      await fetchChannels();
      showMsg('Kanaal verwijderd', 'success');
    } catch (err: any) {
      showMsg(err.message, 'error');
    }
  };

  const startEdit = (ch: Channel) => {
    setEditId(ch.id);
    setEditName(ch.name);
    setEditDrive(ch.driveFolderId);
    setEditDesc(ch.description || '');
  };

  if (loading) {
    return <div className="p-8 flex items-center justify-center h-[60vh]"><p className="text-zinc-400">Kanalen laden...</p></div>;
  }

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Kanalen</h1>
          <button
            onClick={() => setShowNew(!showNew)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors"
          >
            {showNew ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            {showNew ? 'Annuleren' : 'Nieuw Kanaal'}
          </button>
        </div>

        {message && (
          <div className={'mb-6 p-4 rounded-lg border ' + (message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400')}>
            {message.text}
          </div>
        )}

        {showNew && (
          <div className="mb-6 bg-zinc-800 rounded-lg p-6 border border-blue-500/30 space-y-4">
            <h2 className="text-lg font-semibold">Nieuw Kanaal</h2>
            <div>
              <label className="block text-sm font-medium mb-1 text-zinc-300">Naam *</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Bijv. MyCrimeChannel"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-zinc-300">Google Drive Folder ID</label>
              <input type="text" value={newDrive} onChange={(e) => setNewDrive(e.target.value)} placeholder="Optioneel — voor uploads"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-zinc-300">Beschrijving</label>
              <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={2} placeholder="Optioneel"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm resize-none" />
            </div>
            <button onClick={handleCreate} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 px-6 py-2 rounded-lg transition-colors">
              <Save className="w-4 h-4" /> Aanmaken
            </button>
          </div>
        )}

        {channels.length === 0 && !showNew && (
          <div className="text-center py-16 text-zinc-500">
            <Tv className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Nog geen kanalen. Maak je eerste kanaal aan.</p>
          </div>
        )}

        <div className="space-y-3">
          {channels.map((ch) => (
            <div key={ch.id} className="bg-zinc-800 rounded-lg border border-zinc-700 p-4">
              {editId === ch.id ? (
                <div className="space-y-3">
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm" />
                  <input type="text" value={editDrive} onChange={(e) => setEditDrive(e.target.value)} placeholder="Google Drive Folder ID"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm" />
                  <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={2} placeholder="Beschrijving"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm resize-none" />
                  <div className="flex gap-2">
                    <button onClick={() => handleUpdate(ch.id)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm transition-colors">
                      <Save className="w-4 h-4" /> Opslaan
                    </button>
                    <button onClick={() => setEditId(null)} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm transition-colors">
                      Annuleren
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Tv className="w-4 h-4 text-blue-400" />
                      <h3 className="font-semibold">{ch.name}</h3>
                      {ch.projectCount !== undefined && (
                        <span className="text-xs text-zinc-500">{ch.projectCount} projecten</span>
                      )}
                    </div>
                    {ch.description && <p className="text-sm text-zinc-400 mt-1">{ch.description}</p>}
                    {ch.driveFolderId && <p className="text-xs text-zinc-500 mt-1">Drive: {ch.driveFolderId}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => startEdit(ch)} className="p-2 hover:bg-zinc-700 rounded-lg transition-colors" title="Bewerken">
                      <Edit2 className="w-4 h-4 text-zinc-400" />
                    </button>
                    <button onClick={() => handleDelete(ch.id)} className="p-2 hover:bg-red-600/20 text-red-400 rounded-lg transition-colors" title="Verwijderen">
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
