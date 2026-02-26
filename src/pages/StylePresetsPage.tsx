import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, ChevronDown, ChevronUp, X } from 'lucide-react';
import * as api from '../api';

interface StylePreset {
  id: string;
  name: string;
  allows_real_images: boolean;
  style_prefix: string;
  style_suffix: string;
  character_description: string;
  color_grade: string;
  example_prompt: string;
}

const COLOR_GRADES = [
  'cinematic_dark', 'history_warm', 'vibrant', 'clean_neutral',
  'cold_blue', 'noir', 'none',
];

const EMPTY_STYLE: Omit<StylePreset, 'id'> & { id: string } = {
  id: '',
  name: '',
  allows_real_images: false,
  style_prefix: '',
  style_suffix: '',
  character_description: '',
  color_grade: 'clean_neutral',
  example_prompt: '',
};

export default function StylePresetsPage() {
  const [styles, setStyles] = useState<StylePreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editData, setEditData] = useState<StylePreset | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newStyle, setNewStyle] = useState<StylePreset>({ ...EMPTY_STYLE });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchStyles = async () => {
    try {
      const data = await api.styles.getAll();
      setStyles(data);
    } catch (err: any) {
      setMessage({ text: 'Laden mislukt: ' + err.message, type: 'error' });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStyles();
  }, []);

  const showMsg = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setEditData(null);
    } else {
      setExpandedId(id);
      const style = styles.find((s) => s.id === id);
      if (style) setEditData({ ...style });
    }
  };

  const handleSave = async () => {
    if (!editData) return;
    setSaving(true);
    try {
      await api.styles.update(editData.id, editData);
      await fetchStyles();
      showMsg('Style opgeslagen!', 'success');
    } catch (err: any) {
      showMsg('Opslaan mislukt: ' + err.message, 'error');
    }
    setSaving(false);
  };

  const handleCreate = async () => {
    if (!newStyle.id || !newStyle.name) {
      showMsg('ID en naam zijn verplicht', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.styles.create(newStyle);
      await fetchStyles();
      setNewStyle({ ...EMPTY_STYLE });
      setShowNew(false);
      showMsg('Style aangemaakt!', 'success');
    } catch (err: any) {
      showMsg('Aanmaken mislukt: ' + err.message, 'error');
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Weet je zeker dat je deze style wilt verwijderen?')) return;
    try {
      await api.styles.remove(id);
      await fetchStyles();
      if (expandedId === id) {
        setExpandedId(null);
        setEditData(null);
      }
      showMsg('Style verwijderd', 'success');
    } catch (err: any) {
      showMsg('Verwijderen mislukt: ' + err.message, 'error');
    }
  };

  const TextArea = ({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) => (
    <div>
      <label className="block text-sm font-medium mb-1 text-zinc-300">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm resize-y"
      />
    </div>
  );

  const StyleForm = ({ data, setData }: { data: StylePreset; setData: (d: StylePreset) => void }) => (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-zinc-300">Naam</label>
          <input
            type="text"
            value={data.name}
            onChange={(e) => setData({ ...data, name: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-zinc-300">Color Grade</label>
          <select
            value={data.color_grade}
            onChange={(e) => setData({ ...data, color_grade: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
          >
            {COLOR_GRADES.map((cg) => (
              <option key={cg} value={cg}>{cg}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-zinc-300">Gebruikt echte afbeeldingen</label>
        <button
          type="button"
          onClick={() => setData({ ...data, allows_real_images: !data.allows_real_images })}
          className={'relative w-10 h-5 rounded-full transition-colors ' + (data.allows_real_images ? 'bg-green-600' : 'bg-zinc-700')}
        >
          <div className={'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ' + (data.allows_real_images ? 'translate-x-5' : '')} />
        </button>
      </div>

      <TextArea label="Style Prefix" value={data.style_prefix} onChange={(v) => setData({ ...data, style_prefix: v })} rows={3} />
      <TextArea label="Style Suffix" value={data.style_suffix} onChange={(v) => setData({ ...data, style_suffix: v })} rows={3} />
      <TextArea label="Character Description" value={data.character_description} onChange={(v) => setData({ ...data, character_description: v })} rows={4} />
      <TextArea label="Example Prompt" value={data.example_prompt} onChange={(v) => setData({ ...data, example_prompt: v })} rows={4} />
    </div>
  );

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-[60vh]">
        <p className="text-zinc-400">Styles laden...</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Style Presets</h1>
          <button
            onClick={() => setShowNew(!showNew)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors"
          >
            {showNew ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            {showNew ? 'Annuleren' : 'Nieuwe Style'}
          </button>
        </div>

        {message && (
          <div className={'mb-6 p-4 rounded-lg border ' + (message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400')}>
            {message.text}
          </div>
        )}

        {showNew && (
          <div className="mb-6 bg-zinc-800 rounded-lg p-6 border border-blue-500/30">
            <h2 className="text-lg font-semibold mb-2">Niuwe Style</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1 text-zinc-300">ID (uniek, geen spaties)</label>
              <input
                type="text"
                value={newStyle.id}
                onChange={(e) => setNewStyle({ ...newStyle, id: e.target.value.replace(/\s/g, '-').toLowerCase() })}
                placeholder="bijv. ai-cartoon"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
              />
            </div>
            <StyleForm data={newStyle} setData={setNewStyle} />
            <button
              onClick={handleCreate}
              disabled={saving}
              className="mt-4 flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 px-6 py-2 rounded-lg transition-colors"
            >
              <Save className="w-4 h-4" />
              Aanmaken
            </button>
          </div>
        )}

        <div className="space-y-3">
          {styles.map((style) => (
            <div key={style.id} className="bg-zinc-800 rounded-lg border border-zinc-700">
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-750 transition-colors"
                onClick={() => handleExpand(style.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{style.allows_real_images ? '\uD83D\uDCF7' : '\uD83E\uDD16'}</span>
                  <div>
                    <h3 className="font-semibold">{style.name}</h3>
                    <p className="text-sm text-zinc-400">{style.id} — {style.color_grade}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(style.id); }}
                    className="p-2 hover:bg-red-600/20 text-red-400 rounded-lg transition-colors"
                    title="Verwijderen"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  {expandedId === style.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </div>
              </div>

              {expandedId === style.id && editData && (
                <div className="px-4 pb-4 border-t border-zinc-700">
                  <StyleForm data={editData} setData={setEditData as any} />
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="mt-4 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-6 py-2 rounded-lg transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Opslaan...' : 'Opslaan'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
