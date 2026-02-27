import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, ChevronDown, ChevronUp, X } from 'lucide-react';
import * as api from '../api';

interface StylePreset {
  id: string; name: string; allows_real_images: boolean; style_prefix: string; style_suffix: string;
  character_description: string; color_grade: string; example_prompt: string;
}

const COLOR_GRADES = ['cinematic_dark', 'history_warm', 'vibrant', 'clean_neutral', 'cold_blue', 'noir', 'none'];

const EMPTY_STYLE: Omit<StylePreset, 'id'> & { id: string } = {
  id: '', name: '', allows_real_images: false, style_prefix: '', style_suffix: '',
  character_description: '', color_grade: 'clean_neutral', example_prompt: '',
};

const TEMPLATE_STYLE: Omit<StylePreset, 'id'> & { id: string } = {
  id: '', name: '', allows_real_images: false,
  style_prefix: 'A [STIJL] render of [KARAKTER BESCHRIJVING] in a [SCENE CONTEXT].',
  style_suffix: 'Cinematic lighting, [RENDER ENGINE] style, 8K detail, hyper-realistic materials, depth of field. No text, words, letters, numbers, subtitles visible anywhere.',
  character_description: 'Beschrijf hier het type karakter: uiterlijk, kleding, houding, hoe emotie wordt uitgedrukt.',
  color_grade: 'clean_neutral',
  example_prompt: 'A [STIJL] render of [KARAKTER] standing in [LOCATIE] with [BELICHTING]. Camera [HOEK/BEWEGING]. [RENDER ENGINE], 8K detail.',
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
    try { const data = await api.styles.getAll(); setStyles(data); } catch (err: any) { setMessage({ text: 'Laden mislukt: ' + err.message, type: 'error' }); }
    setLoading(false);
  };

  useEffect(() => { fetchStyles(); }, []);

  const showMsg = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type }); setTimeout(() => setMessage(null), 3000);
  };

  const handleExpand = (id: string) => {
    if (expandedId === id) { setExpandedId(null); setEditData(null); }
    else { setExpandedId(id); const style = styles.find((s) => s.id === id); if (style) setEditData({ ...style }); }
  };

  const handleSave = async () => {
    if (!editData) return;
    setSaving(true);
    try { await api.styles.update(editData.id, editData); await fetchStyles(); showMsg('Style opgeslagen!', 'success'); }
    catch (err: any) { showMsg('Opslaan mislukt: ' + err.message, 'error'); }
    setSaving(false);
  };

  const handleCreate = async () => {
    if (!newStyle.id || !newStyle.name) { showMsg('ID en naam zijn verplicht', 'error'); return; }
    setSaving(true);
    try { await api.styles.create(newStyle); await fetchStyles(); setNewStyle({ ...EMPTY_STYLE }); setShowNew(false); showMsg('Style aangemaakt!', 'success'); }
    catch (err: any) { showMsg('Aanmaken mislukt: ' + err.message, 'error'); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Weet je zeker dat je deze style wilt verwijderen?')) return;
    try { await api.styles.remove(id); await fetchStyles(); if (expandedId === id) { setExpandedId(null); setEditData(null); } showMsg('Style verwijderd', 'success'); }
    catch (err: any) { showMsg('Verwijderen mislukt: ' + err.message, 'error'); }
  };

  const TextArea = ({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) => (
    <div>
      <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className="input-base text-sm resize-y" />
    </div>
  );

  const StyleForm = ({ data, setData }: { data: StylePreset; setData: (d: StylePreset) => void }) => (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Naam</label>
          <input type="text" value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} className="input-base text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Color Grade</label>
          <select value={data.color_grade} onChange={(e) => setData({ ...data, color_grade: e.target.value })} className="input-base text-sm">
            {COLOR_GRADES.map((cg) => (<option key={cg} value={cg}>{cg}</option>))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Gebruikt echte afbeeldingen</label>
        <button type="button" onClick={() => setData({ ...data, allows_real_images: !data.allows_real_images })}
          className={`relative w-11 h-6 rounded-full transition-colors ${data.allows_real_images ? 'bg-emerald-600' : 'bg-surface-400'}`}>
          <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${data.allows_real_images ? 'translate-x-5' : ''}`} />
        </button>
      </div>

      <TextArea label="Style Prefix" value={data.style_prefix} onChange={(v) => setData({ ...data, style_prefix: v })} rows={3} />
      <TextArea label="Style Suffix" value={data.style_suffix} onChange={(v) => setData({ ...data, style_suffix: v })} rows={3} />
      <TextArea label="Character Description" value={data.character_description} onChange={(v) => setData({ ...data, character_description: v })} rows={4} />
      <TextArea label="Example Prompt" value={data.example_prompt} onChange={(v) => setData({ ...data, example_prompt: v })} rows={4} />
    </div>
  );

  if (loading) return <div className="p-8 flex items-center justify-center h-[60vh]"><p className="text-zinc-500">Styles laden...</p></div>;

  return (
    <div className="p-8 animate-fade-in">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Style Presets</h1>
            <p className="text-sm text-zinc-500 mt-1">{styles.length} style{styles.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setNewStyle({ ...TEMPLATE_STYLE }); setShowNew(true); }} className="btn-secondary text-sm">
              📋 Template
            </button>
            <button onClick={() => { if (showNew) { setShowNew(false); } else { setNewStyle({ ...EMPTY_STYLE }); setShowNew(true); } }}
              className={showNew ? 'btn-secondary text-sm' : 'btn-primary text-sm'}>
              {showNew ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {showNew ? 'Annuleren' : 'Nieuwe Style'}
            </button>
          </div>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-xl border text-sm animate-fade-in ${message.type === 'success' ? 'bg-emerald-500/8 border-emerald-500/15 text-emerald-400' : 'bg-red-500/8 border-red-500/15 text-red-400'}`}>
            {message.text}
          </div>
        )}

        {showNew && (
          <div className="mb-6 section-card border-brand-500/20 animate-fade-in-down">
            <h2 className="section-title">Nieuwe Style</h2>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">ID (uniek, geen spaties)</label>
              <input type="text" value={newStyle.id} onChange={(e) => setNewStyle({ ...newStyle, id: e.target.value.replace(/\s/g, '-').toLowerCase() })}
                placeholder="bijv. ai-cartoon" className="input-base text-sm" />
            </div>
            <StyleForm data={newStyle} setData={setNewStyle} />
            <button onClick={handleCreate} disabled={saving} className="btn-success text-sm mt-2">
              <Save className="w-4 h-4" /> Aanmaken
            </button>
          </div>
        )}

        <div className="space-y-2.5">
          {styles.map((style) => (
            <div key={style.id} className="glass rounded-xl overflow-hidden">
              <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                onClick={() => handleExpand(style.id)}>
                <div className="flex items-center gap-3">
                  <span className="text-lg">{style.allows_real_images ? '\uD83D\uDCF7' : '\uD83E\uDD16'}</span>
                  <div>
                    <h3 className="font-semibold text-sm">{style.name}</h3>
                    <p className="text-[11px] text-zinc-600">{style.id} — {style.color_grade}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(style.id); }}
                    className="btn-icon text-red-400/60 hover:text-red-400" title="Verwijderen">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  {expandedId === style.id ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-600" />}
                </div>
              </div>

              {expandedId === style.id && editData && (
                <div className="px-4 pb-4 border-t border-white/[0.06] animate-fade-in-down">
                  <StyleForm data={editData} setData={setEditData as any} />
                  <button onClick={handleSave} disabled={saving} className="btn-primary text-sm mt-4">
                    <Save className="w-4 h-4" /> {saving ? 'Opslaan...' : 'Opslaan'}
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
