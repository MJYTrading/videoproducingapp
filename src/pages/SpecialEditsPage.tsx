import { useState, useEffect } from 'react';
import { Trash2, Wand2 } from 'lucide-react';
import { mediaLibrary } from '../api';

export default function SpecialEditsPage() {
  const [edits, setEdits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadEdits(); }, []);

  const loadEdits = async () => {
    try { setEdits(await mediaLibrary.getSpecialEdits()); }
    catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  };

  const deleteEdit = async (id: string) => {
    if (!confirm('Weet je het zeker?')) return;
    await mediaLibrary.deleteSpecialEdit(id);
    loadEdits();
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-white flex items-center gap-3 mb-8">
        <Wand2 className="w-7 h-7 text-brand-400" /> Special Edits
      </h1>

      {loading ? (
        <div className="text-zinc-500 text-center py-20">Laden...</div>
      ) : edits.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">
          <Wand2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>Nog geen special edits geregistreerd</p>
        </div>
      ) : (
        <div className="space-y-2">
          {edits.map(edit => (
            <div key={edit.id} className="card p-4 flex items-center justify-between">
              <div>
                <h3 className="font-medium text-white">{edit.name}</h3>
                <p className="text-xs text-zinc-500">{edit.category} · {edit.description?.slice(0, 60)}</p>
              </div>
              <button onClick={() => deleteEdit(edit.id)} className="btn-icon text-zinc-600 hover:text-red-400">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
