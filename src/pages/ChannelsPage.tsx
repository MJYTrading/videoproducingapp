import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, X, Tv, ChevronDown, ChevronUp, Link2, Users, Sparkles, FileText, Clapperboard, Mic, Monitor, Globe, Type } from 'lucide-react';
import { VideoType, VIDEO_TYPE_LABELS, Language } from '../types';
import * as api from '../api';

interface ChannelData {
  id: string;
  name: string;
  driveFolderId: string;
  description: string | null;
  projectCount?: number;
  createdAt: string;
  youtubeChannelId: string;
  defaultVideoType: VideoType;
  competitors: string;
  maxClipDurationSeconds: number | null;
  baseStyleProfile: string | null;
  baseResearchTemplate: string | null;
  styleReferenceUrls: string;
  styleExtraInstructions: string;
  usedClips: string;
  overlayPresetId: string | null;
  sfxEnabled: boolean;
  specialEditsEnabled: boolean;
  defaultScriptLengthMinutes: number;
  defaultVoiceId: string;
  defaultOutputFormat: string;
  defaultAspectRatio: string;
  defaultSubtitles: boolean;
  defaultLanguage: string;
  defaultVisualStyle: string;
  defaultVisualStyleParent: string | null;
  referenceScriptUrls: string;
}

interface VoiceData { id: string; name: string; voiceId: string; description: string; language: string; }
interface StyleData { id: string; name: string; }

const VIDEO_TYPES: VideoType[] = ['ai', 'spokesperson_ai', 'trending', 'documentary', 'compilation', 'spokesperson'];
const AI_SUBSTYLES = [
  { value: '3d-render', label: '3D Render' },
  { value: 'stickman', label: 'Stickman' },
  { value: '2d-animation', label: '2D Animatie' },
  { value: 'history', label: 'History' },
  { value: 'realistic', label: 'Realistisch' },
];
const OUTPUT_FORMATS = [
  { value: 'youtube-1080p', label: 'YouTube 1080p' },
  { value: 'youtube-4k', label: 'YouTube 4K' },
  { value: 'shorts', label: 'Shorts' },
];
const ASPECT_RATIOS = [
  { value: 'landscape', label: 'Landscape (16:9)' },
  { value: 'portrait', label: 'Portrait (9:16)' },
  { value: 'square', label: 'Square (1:1)' },
];
const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'EN', label: 'English' },
  { value: 'NL', label: 'Nederlands' },
];

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelData[]>([]);
  const [voices, setVoices] = useState<VoiceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<ChannelData>>({});
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [saving, setSaving] = useState(false);

  // New channel form
  const [newName, setNewName] = useState('');
  const [newDrive, setNewDrive] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newYoutubeId, setNewYoutubeId] = useState('');
  const [newVideoType, setNewVideoType] = useState<VideoType>('ai');
  const [newVisualStyle, setNewVisualStyle] = useState('3d-render');
  const [newVoiceId, setNewVoiceId] = useState('');
  const [newScriptLength, setNewScriptLength] = useState(8);
  const [newOutputFormat, setNewOutputFormat] = useState('youtube-1080p');
  const [newAspectRatio, setNewAspectRatio] = useState('landscape');
  const [newLanguage, setNewLanguage] = useState<Language>('EN');
  const [newSubtitles, setNewSubtitles] = useState(true);

  const fetchAll = async () => {
    try {
      const [channelsData, voicesData] = await Promise.all([
        api.channels.getAll(),
        api.voices.getAll().catch(() => []),
      ]);
      setChannels(channelsData);
      setVoices(voicesData);
    } catch (err: any) { showMsg('Laden mislukt: ' + err.message, 'error'); }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const showMsg = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type }); setTimeout(() => setMessage(null), 4000);
  };

  const handleCreate = async () => {
    if (!newName.trim()) { showMsg('Naam is verplicht', 'error'); return; }
    try {
      await api.channels.create({
        name: newName.trim(),
        driveFolderId: newDrive.trim(),
        description: newDesc.trim() || null,
        youtubeChannelId: newYoutubeId.trim(),
        defaultVideoType: newVideoType,
        defaultVisualStyle: newVideoType === 'ai' ? newVisualStyle : '',
        defaultVoiceId: newVoiceId,
        defaultScriptLengthMinutes: newScriptLength,
        defaultOutputFormat: newOutputFormat,
        defaultAspectRatio: newAspectRatio,
        defaultLanguage: newLanguage,
        defaultSubtitles: newSubtitles,
      });
      // Reset
      setNewName(''); setNewDrive(''); setNewDesc(''); setNewYoutubeId(''); setNewVideoType('ai');
      setNewVisualStyle('3d-render'); setNewVoiceId(''); setNewScriptLength(8);
      setNewOutputFormat('youtube-1080p'); setNewAspectRatio('landscape'); setNewLanguage('EN'); setNewSubtitles(true);
      setShowNew(false);
      await fetchAll();
      showMsg('Kanaal aangemaakt!', 'success');
    } catch (err: any) { showMsg(err.message, 'error'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Weet je zeker dat je dit kanaal wilt verwijderen?')) return;
    try { await api.channels.remove(id); await fetchAll(); showMsg('Kanaal verwijderd', 'success'); } catch (err: any) { showMsg(err.message, 'error'); }
  };

  const toggleExpand = (ch: ChannelData) => {
    if (expandedId === ch.id) { setExpandedId(null); setEditData({}); }
    else { setExpandedId(ch.id); setEditData({ ...ch }); }
  };

  const updateField = (field: string, value: any) => setEditData(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!expandedId || !editData) return;
    setSaving(true);
    try {
      await api.channels.update(expandedId, editData);
      await fetchAll();
      showMsg('Kanaal bijgewerkt!', 'success');
    } catch (err: any) { showMsg(err.message, 'error'); }
    setSaving(false);
  };

  const parseJsonArray = (val: string | undefined | null): string[] => { try { return JSON.parse(val || '[]'); } catch { return []; } };

  const competitors = parseJsonArray(editData.competitors);
  const addCompetitor = () => { const url = prompt('YouTube kanaal URL of handle:'); if (url?.trim()) updateField('competitors', JSON.stringify([...competitors, url.trim()])); };
  const removeCompetitor = (idx: number) => updateField('competitors', JSON.stringify(competitors.filter((_, i) => i !== idx)));

  const styleUrls = parseJsonArray(editData.styleReferenceUrls);
  const addStyleUrl = () => { const url = prompt('YouTube video URL als stijl-referentie:'); if (url?.trim()) updateField('styleReferenceUrls', JSON.stringify([...styleUrls, url.trim()])); };
  const removeStyleUrl = (idx: number) => updateField('styleReferenceUrls', JSON.stringify(styleUrls.filter((_, i) => i !== idx)));

  const refScriptUrls = parseJsonArray(editData.referenceScriptUrls);
  const addRefScript = () => { const url = prompt('YouTube video URL als script referentie:'); if (url?.trim()) updateField('referenceScriptUrls', JSON.stringify([...refScriptUrls, url.trim()])); };
  const removeRefScript = (idx: number) => updateField('referenceScriptUrls', JSON.stringify(refScriptUrls.filter((_, i) => i !== idx)));

  const [showStyleJson, setShowStyleJson] = useState(false);
  const [showResearchJson, setShowResearchJson] = useState(false);
  const [styleJsonError, setStyleJsonError] = useState('');
  const [researchJsonError, setResearchJsonError] = useState('');
  const validateJson = (val: string): boolean => { try { JSON.parse(val); return true; } catch { return false; } };

  // Helpers
  const isAiType = (vt: string) => vt === 'ai' || vt === 'spokesperson_ai';
  const editIsAi = isAiType(editData.defaultVideoType || 'ai');

  if (loading) return <div className="p-8 flex items-center justify-center h-[60vh]"><p className="text-zinc-500">Kanalen laden...</p></div>;

  return (
    <div className="p-8 animate-fade-in">
      <div className="max-w-5xl mx-auto">
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
          <div className={`mb-6 p-4 rounded-xl text-sm font-medium animate-fade-in ${message.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
            {message.text}
          </div>
        )}

        {/* ═══════ NIEUW KANAAL FORMULIER ═══════ */}
        {showNew && (
          <div className="glass rounded-2xl p-6 mb-6 animate-fade-in-down">
            <h3 className="font-semibold mb-5 text-lg">Nieuw Kanaal</h3>

            {/* Basis info */}
            <div className="mb-5">
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Basis Info</p>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs text-zinc-500 mb-1">Naam *</label><input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Kanaalnaam" className="input-base text-sm" /></div>
                <div><label className="block text-xs text-zinc-500 mb-1">YouTube Channel ID</label><input type="text" value={newYoutubeId} onChange={e => setNewYoutubeId(e.target.value)} placeholder="UC..." className="input-base text-sm" /></div>
                <div><label className="block text-xs text-zinc-500 mb-1">Beschrijving</label><input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Optioneel" className="input-base text-sm" /></div>
                <div><label className="block text-xs text-zinc-500 mb-1">Drive Folder ID</label><input type="text" value={newDrive} onChange={e => setNewDrive(e.target.value)} placeholder="Optioneel" className="input-base text-sm" /></div>
              </div>
            </div>

            {/* Video type + substijl */}
            <div className="mb-5">
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Video Type & Stijl</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Video Type</label>
                  <select value={newVideoType} onChange={e => setNewVideoType(e.target.value as VideoType)} className="input-base text-sm">
                    {VIDEO_TYPES.map(vt => <option key={vt} value={vt}>{VIDEO_TYPE_LABELS[vt]}</option>)}
                  </select>
                </div>
                {isAiType(newVideoType) && (
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">AI Visuele Stijl</label>
                    <select value={newVisualStyle} onChange={e => setNewVisualStyle(e.target.value)} className="input-base text-sm">
                      {AI_SUBSTYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Standaard instellingen */}
            <div className="mb-5">
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Standaard Instellingen</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Voice</label>
                  <select value={newVoiceId} onChange={e => setNewVoiceId(e.target.value)} className="input-base text-sm">
                    <option value="">— Geen standaard —</option>
                    {voices.map(v => <option key={v.id} value={v.voiceId}>{v.name} — {v.description}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Script Lengte (min)</label>
                  <input type="number" step="0.5" min="1" max="60" value={newScriptLength} onChange={e => setNewScriptLength(parseFloat(e.target.value) || 8)} className="input-base text-sm" />
                  <p className="text-[10px] text-zinc-600 mt-1">≈ {Math.round(newScriptLength * 150)} woorden</p>
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Output Formaat</label>
                  <select value={newOutputFormat} onChange={e => setNewOutputFormat(e.target.value)} className="input-base text-sm">
                    {OUTPUT_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Aspect Ratio</label>
                  <select value={newAspectRatio} onChange={e => setNewAspectRatio(e.target.value)} className="input-base text-sm">
                    {ASPECT_RATIOS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Taal</label>
                  <select value={newLanguage} onChange={e => setNewLanguage(e.target.value as Language)} className="input-base text-sm">
                    {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-3 pt-5">
                  <button onClick={() => setNewSubtitles(!newSubtitles)} className={`relative w-11 h-6 rounded-full transition-colors ${newSubtitles ? 'bg-emerald-600' : 'bg-surface-400'}`}>
                    <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${newSubtitles ? 'translate-x-5' : ''}`} />
                  </button>
                  <span className="text-sm text-zinc-300">Ondertiteling</span>
                </div>
              </div>
            </div>

            <button onClick={handleCreate} disabled={!newName.trim()} className="btn-primary text-sm">Kanaal Aanmaken</button>
          </div>
        )}

        {/* ═══════ KANAAL LIJST ═══════ */}
        <div className="space-y-3">
          {channels.map(ch => {
            const isExpanded = expandedId === ch.id;
            return (
              <div key={ch.id} className="glass rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 cursor-pointer" onClick={() => toggleExpand(ch)}>
                  <div className="flex items-center gap-3 min-w-0">
                    <Tv className="w-5 h-5 text-brand-400 shrink-0" />
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm truncate">{ch.name}</h3>
                      <p className="text-[11px] text-zinc-600">{ch.projectCount || 0} projecten · {VIDEO_TYPE_LABELS[ch.defaultVideoType]}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <button onClick={e => { e.stopPropagation(); handleDelete(ch.id); }} className="btn-icon !p-1.5 text-red-400/50 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-5 pb-5 space-y-6 border-t border-white/[0.04] pt-5 animate-fade-in-down">

                    {/* ═══ BASIS CONFIGURATIE ═══ */}
                    <div>
                      <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-3 flex items-center gap-2"><Tv className="w-3.5 h-3.5" /> Basis Configuratie</h3>
                      <div className="grid grid-cols-3 gap-4">
                        <div><label className="block text-xs text-zinc-500 mb-1">YouTube Channel ID</label><input type="text" value={editData.youtubeChannelId || ''} onChange={e => updateField('youtubeChannelId', e.target.value)} placeholder="UC..." className="input-base text-sm" /></div>
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1">Video Type</label>
                          <select value={editData.defaultVideoType || 'ai'} onChange={e => { updateField('defaultVideoType', e.target.value); if (!isAiType(e.target.value)) updateField('defaultVisualStyle', ''); }} className="input-base text-sm">
                            {VIDEO_TYPES.map(vt => <option key={vt} value={vt}>{VIDEO_TYPE_LABELS[vt]}</option>)}
                          </select>
                        </div>
                        <div><label className="block text-xs text-zinc-500 mb-1">Max Clip Duur (sec)</label><input type="number" value={editData.maxClipDurationSeconds ?? ''} onChange={e => updateField('maxClipDurationSeconds', e.target.value ? parseInt(e.target.value) : null)} placeholder="15" className="input-base text-sm" /></div>
                        {editIsAi && (
                          <div>
                            <label className="block text-xs text-zinc-500 mb-1">AI Visuele Stijl</label>
                            <select value={editData.defaultVisualStyle || '3d-render'} onChange={e => updateField('defaultVisualStyle', e.target.value)} className="input-base text-sm">
                              {AI_SUBSTYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                          </div>
                        )}
                        <div><label className="block text-xs text-zinc-500 mb-1">Drive Folder ID</label><input type="text" value={editData.driveFolderId || ''} onChange={e => updateField('driveFolderId', e.target.value)} placeholder="Optioneel" className="input-base text-sm" /></div>
                        <div><label className="block text-xs text-zinc-500 mb-1">Beschrijving</label><input type="text" value={editData.description || ''} onChange={e => updateField('description', e.target.value || null)} placeholder="Optioneel" className="input-base text-sm" /></div>
                      </div>
                    </div>

                    {/* ═══ STANDAARD PROJECT INSTELLINGEN ═══ */}
                    <div>
                      <h3 className="text-xs font-bold text-brand-300 uppercase tracking-wider mb-3 flex items-center gap-2"><Monitor className="w-3.5 h-3.5" /> Standaard Project Instellingen</h3>
                      <p className="text-[11px] text-zinc-600 mb-4">Worden automatisch ingevuld bij nieuwe projecten.</p>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1.5 flex items-center gap-1"><Mic className="w-3 h-3" /> Voice</label>
                          <select value={editData.defaultVoiceId || ''} onChange={e => updateField('defaultVoiceId', e.target.value)} className="input-base text-sm">
                            <option value="">— Geen standaard —</option>
                            {voices.map(v => <option key={v.id} value={v.voiceId}>{v.name} — {v.description}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1.5 flex items-center gap-1"><FileText className="w-3 h-3" /> Script Lengte (min)</label>
                          <input type="number" step="0.5" min="1" max="60" value={editData.defaultScriptLengthMinutes ?? 8} onChange={e => updateField('defaultScriptLengthMinutes', parseFloat(e.target.value) || 8)} className="input-base text-sm" />
                          <p className="text-[10px] text-zinc-600 mt-1">≈ {Math.round((editData.defaultScriptLengthMinutes || 8) * 150)} woorden (150 WPM)</p>
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1.5"><Monitor className="w-3 h-3 inline mr-1" />Output Formaat</label>
                          <select value={editData.defaultOutputFormat || 'youtube-1080p'} onChange={e => updateField('defaultOutputFormat', e.target.value)} className="input-base text-sm">
                            {OUTPUT_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1.5">Aspect Ratio</label>
                          <select value={editData.defaultAspectRatio || 'landscape'} onChange={e => updateField('defaultAspectRatio', e.target.value)} className="input-base text-sm">
                            {ASPECT_RATIOS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1.5 flex items-center gap-1"><Globe className="w-3 h-3" /> Taal</label>
                          <select value={editData.defaultLanguage || 'EN'} onChange={e => updateField('defaultLanguage', e.target.value)} className="input-base text-sm">
                            {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                          </select>
                        </div>
                      </div>
                      <ToggleRow label="Ondertiteling" description="Standaard ondertiteling aan voor nieuwe projecten" enabled={editData.defaultSubtitles ?? true} onToggle={() => updateField('defaultSubtitles', !(editData.defaultSubtitles ?? true))} />
                    </div>

                    {/* ═══ REFERENTIE SCRIPTS ═══ */}
                    <div>
                      <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-3 flex items-center gap-2"><Type className="w-3.5 h-3.5" /> Referentie Scripts</h3>
                      <p className="text-[10px] text-zinc-600 mb-3">YouTube URL's als stijlreferentie voor script generatie.</p>
                      <div className="space-y-2">
                        {refScriptUrls.length === 0 && <p className="text-xs text-zinc-600">Geen referentie scripts</p>}
                        {refScriptUrls.map((url, idx) => (
                          <div key={idx} className="flex items-center gap-2 bg-surface-200/40 rounded-lg px-3 py-2">
                            <Link2 className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                            <span className="text-xs text-zinc-300 flex-1 truncate font-mono">{url}</span>
                            <button onClick={() => removeRefScript(idx)} className="text-red-400/60 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        ))}
                        <button onClick={addRefScript} className="btn-secondary text-xs"><Plus className="w-3 h-3" /> Script URL toevoegen</button>
                      </div>
                    </div>

                    {/* ═══ COMPETITORS ═══ */}
                    <div>
                      <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-3 flex items-center gap-2"><Users className="w-3.5 h-3.5" /> Competitors</h3>
                      <div className="space-y-2">
                        {competitors.length === 0 && <p className="text-xs text-zinc-600">Geen competitors</p>}
                        {competitors.map((url, idx) => (
                          <div key={idx} className="flex items-center gap-2 bg-surface-200/40 rounded-lg px-3 py-2">
                            <Link2 className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                            <span className="text-xs text-zinc-300 flex-1 truncate font-mono">{url}</span>
                            <button onClick={() => removeCompetitor(idx)} className="text-red-400/60 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        ))}
                        <button onClick={addCompetitor} className="btn-secondary text-xs"><Plus className="w-3 h-3" /> Competitor toevoegen</button>
                      </div>
                    </div>

                    {/* ═══ STYLE PROFILE ═══ */}
                    <div>
                      <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-3 flex items-center gap-2"><Sparkles className="w-3.5 h-3.5" /> Style Profile</h3>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1">Stijl Referentie Video's</label>
                          <div className="space-y-2">
                            {styleUrls.length === 0 && <p className="text-xs text-zinc-600">Geen referentie URLs</p>}
                            {styleUrls.map((url, idx) => (
                              <div key={idx} className="flex items-center gap-2 bg-surface-200/40 rounded-lg px-3 py-2">
                                <Link2 className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                                <span className="text-xs text-zinc-300 flex-1 truncate font-mono">{url}</span>
                                <button onClick={() => removeStyleUrl(idx)} className="text-red-400/60 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                              </div>
                            ))}
                            <button onClick={addStyleUrl} className="btn-secondary text-xs"><Plus className="w-3 h-3" /> URL toevoegen</button>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1">Extra Stijl Instructies</label>
                          <textarea value={editData.styleExtraInstructions || ''} onChange={e => updateField('styleExtraInstructions', e.target.value)} rows={3} placeholder="Bijv. 'Gebruik altijd korte zinnen...'" className="input-base text-sm resize-none" />
                        </div>
                        <div>
                          <button onClick={() => setShowStyleJson(!showStyleJson)} className="btn-secondary text-xs"><FileText className="w-3 h-3" /> {showStyleJson ? 'Verberg' : 'Toon'} Style Profile JSON</button>
                          {showStyleJson && (
                            <div className="mt-2">
                              <textarea value={editData.baseStyleProfile || ''} onChange={e => { updateField('baseStyleProfile', e.target.value); setStyleJsonError(e.target.value && !validateJson(e.target.value) ? 'Ongeldige JSON' : ''); }} rows={12} placeholder='{"tone": "dramatic", ...}' className="input-base text-xs font-mono resize-y" />
                              {styleJsonError && <p className="text-xs text-red-400 mt-1">{styleJsonError}</p>}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ═══ RESEARCH TEMPLATE ═══ */}
                    <div>
                      <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-3 flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> Research Template</h3>
                      <button onClick={() => setShowResearchJson(!showResearchJson)} className="btn-secondary text-xs"><FileText className="w-3 h-3" /> {showResearchJson ? 'Verberg' : 'Toon'} Research Template JSON</button>
                      {showResearchJson && (
                        <div className="mt-2">
                          <textarea value={editData.baseResearchTemplate || ''} onChange={e => { updateField('baseResearchTemplate', e.target.value); setResearchJsonError(e.target.value && !validateJson(e.target.value) ? 'Ongeldige JSON' : ''); }} rows={12} placeholder="Leeg = default template" className="input-base text-xs font-mono resize-y" />
                          {researchJsonError && <p className="text-xs text-red-400 mt-1">{researchJsonError}</p>}
                        </div>
                      )}
                    </div>

                    {/* ═══ MEDIA & POST-PRODUCTIE ═══ */}
                    <div>
                      <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-3 flex items-center gap-2"><Clapperboard className="w-3.5 h-3.5" /> Media & Post-productie</h3>
                      <div className="space-y-3">
                        <ToggleRow label="Sound Effects" description="Automatisch SFX toevoegen" enabled={editData.sfxEnabled ?? true} onToggle={() => updateField('sfxEnabled', !(editData.sfxEnabled ?? true))} />
                        <ToggleRow label="Special Edits" description="Python video effecten" enabled={editData.specialEditsEnabled ?? true} onToggle={() => updateField('specialEditsEnabled', !(editData.specialEditsEnabled ?? true))} />
                      </div>
                    </div>

                    {/* Save */}
                    <div className="flex items-center gap-3 pt-2 border-t border-white/[0.06]">
                      <button onClick={handleSave} disabled={saving || !!styleJsonError || !!researchJsonError} className="btn-primary text-sm">
                        <Save className="w-4 h-4" /> {saving ? 'Opslaan...' : 'Opslaan'}
                      </button>
                      <button onClick={() => { setExpandedId(null); setEditData({}); }} className="btn-secondary text-sm">Annuleren</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, description, enabled, onToggle }: { label: string; description: string; enabled: boolean; onToggle: () => void }) {
  return (
    <div className="bg-surface-200/40 rounded-xl p-4 flex items-center justify-between">
      <div><h4 className="font-semibold text-sm">{label}</h4><p className="text-xs text-zinc-500">{description}</p></div>
      <button onClick={onToggle} className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-emerald-600' : 'bg-surface-400'}`}>
        <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${enabled ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );
}
