import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Edit2, X, Tv, ChevronDown, ChevronUp, Link2, Users, Sparkles, FileText, Volume2, Layers, Clapperboard } from 'lucide-react';
import { VideoType, VIDEO_TYPE_LABELS } from '../types';
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
}

const VIDEO_TYPES: VideoType[] = ['ai', 'spokesperson_ai', 'trending', 'documentary', 'compilation', 'spokesperson'];

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelData[]>([]);
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

  const fetchChannels = async () => {
    try { const data = await api.channels.getAll(); setChannels(data); } catch (err: any) { showMsg('Laden mislukt: ' + err.message, 'error'); }
    setLoading(false);
  };

  useEffect(() => { fetchChannels(); }, []);

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
      });
      setNewName(''); setNewDrive(''); setNewDesc(''); setNewYoutubeId(''); setNewVideoType('ai');
      setShowNew(false);
      await fetchChannels();
      showMsg('Kanaal aangemaakt!', 'success');
    } catch (err: any) { showMsg(err.message, 'error'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Weet je zeker dat je dit kanaal wilt verwijderen?')) return;
    try { await api.channels.remove(id); await fetchChannels(); showMsg('Kanaal verwijderd', 'success'); } catch (err: any) { showMsg(err.message, 'error'); }
  };

  const toggleExpand = (ch: ChannelData) => {
    if (expandedId === ch.id) {
      setExpandedId(null);
      setEditData({});
    } else {
      setExpandedId(ch.id);
      setEditData({ ...ch });
    }
  };

  const updateField = (field: string, value: any) => {
    setEditData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!expandedId || !editData) return;
    setSaving(true);
    try {
      await api.channels.update(expandedId, editData);
      await fetchChannels();
      showMsg('Kanaal bijgewerkt!', 'success');
    } catch (err: any) { showMsg(err.message, 'error'); }
    setSaving(false);
  };

  // Parse JSON arrays from string fields
  const parseJsonArray = (val: string | undefined | null): string[] => {
    try { return JSON.parse(val || '[]'); } catch { return []; }
  };

  // Competitors management
  const competitors = parseJsonArray(editData.competitors);
  const addCompetitor = () => {
    const url = prompt('YouTube kanaal URL of handle:');
    if (url?.trim()) {
      updateField('competitors', JSON.stringify([...competitors, url.trim()]));
    }
  };
  const removeCompetitor = (idx: number) => {
    updateField('competitors', JSON.stringify(competitors.filter((_, i) => i !== idx)));
  };

  // Style reference URLs management
  const styleUrls = parseJsonArray(editData.styleReferenceUrls);
  const addStyleUrl = () => {
    const url = prompt('YouTube video URL als stijl-referentie:');
    if (url?.trim()) {
      updateField('styleReferenceUrls', JSON.stringify([...styleUrls, url.trim()]));
    }
  };
  const removeStyleUrl = (idx: number) => {
    updateField('styleReferenceUrls', JSON.stringify(styleUrls.filter((_, i) => i !== idx)));
  };

  // JSON editors
  const [showStyleJson, setShowStyleJson] = useState(false);
  const [showResearchJson, setShowResearchJson] = useState(false);
  const [styleJsonError, setStyleJsonError] = useState('');
  const [researchJsonError, setResearchJsonError] = useState('');

  const validateJson = (val: string): boolean => {
    try { JSON.parse(val); return true; } catch { return false; }
  };

  if (loading) return <div className="p-8 flex items-center justify-center h-[60vh]"><p className="text-zinc-500">Kanalen laden...</p></div>;

  return (
    <div className="p-8 animate-fade-in">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Kanalen</h1>
            <p className="text-sm text-zinc-500 mt-1">{channels.length} kanaal{channels.length !== 1 ? 'en' : ''} — volledig configureerbaar per kanaal</p>
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

        {/* ─── Nieuw kanaal formulier ─── */}
        {showNew && (
          <div className="mb-6 section-card border-brand-500/20 animate-fade-in-down">
            <h2 className="section-title">Nieuw Kanaal</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Naam *</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Bijv. MyCrimeChannel" className="input-base text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">YouTube Channel ID</label>
                <input type="text" value={newYoutubeId} onChange={e => setNewYoutubeId(e.target.value)} placeholder="UC... of @handle" className="input-base text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Google Drive Folder ID</label>
                <input type="text" value={newDrive} onChange={e => setNewDrive(e.target.value)} placeholder="Optioneel — voor uploads" className="input-base text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Default Video Type</label>
                <select value={newVideoType} onChange={e => setNewVideoType(e.target.value as VideoType)} className="input-base text-sm">
                  {VIDEO_TYPES.map(vt => <option key={vt} value={vt}>{VIDEO_TYPE_LABELS[vt]}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Beschrijving</label>
              <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={2} placeholder="Optioneel" className="input-base text-sm resize-none" />
            </div>
            <button onClick={handleCreate} className="btn-success text-sm">
              <Save className="w-4 h-4" /> Aanmaken
            </button>
          </div>
        )}

        {/* ─── Lege staat ─── */}
        {channels.length === 0 && !showNew && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-4 mx-auto border border-white/[0.04]">
              <Tv className="w-8 h-8 text-zinc-600" />
            </div>
            <p className="text-zinc-500 text-sm">Nog geen kanalen. Maak je eerste kanaal aan.</p>
          </div>
        )}

        {/* ─── Kanaal lijst ─── */}
        <div className="space-y-3">
          {channels.map((ch) => {
            const isExpanded = expandedId === ch.id;
            return (
              <div key={ch.id} className="glass rounded-xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/[0.02] transition-colors" onClick={() => toggleExpand(ch)}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-brand-600/15 flex items-center justify-center">
                      <Tv className="w-4 h-4 text-brand-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm">{ch.name}</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-600/15 text-brand-300 font-medium">{VIDEO_TYPE_LABELS[ch.defaultVideoType as VideoType] || ch.defaultVideoType}</span>
                        {ch.projectCount !== undefined && <span className="text-[11px] text-zinc-600">{ch.projectCount} projecten</span>}
                      </div>
                      {ch.description && <p className="text-xs text-zinc-500 mt-0.5">{ch.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(ch.id); }} className="btn-icon text-red-400/60 hover:text-red-400" title="Verwijderen">
                      <Trash2 className="w-4 h-4" />
                    </button>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                  </div>
                </div>

                {/* ─── Expanded Detail Panel ─── */}
                {isExpanded && (
                  <div className="border-t border-white/[0.06] p-5 space-y-6 animate-fade-in">

                    {/* Basis */}
                    <div>
                      <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-3 flex items-center gap-2"><Edit2 className="w-3.5 h-3.5" /> Basis</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1">Naam</label>
                          <input type="text" value={editData.name || ''} onChange={e => updateField('name', e.target.value)} className="input-base text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1">YouTube Channel ID</label>
                          <input type="text" value={editData.youtubeChannelId || ''} onChange={e => updateField('youtubeChannelId', e.target.value)} placeholder="UC... of @handle" className="input-base text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1">Google Drive Folder ID</label>
                          <input type="text" value={editData.driveFolderId || ''} onChange={e => updateField('driveFolderId', e.target.value)} className="input-base text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1">Default Video Type</label>
                          <select value={editData.defaultVideoType || 'ai'} onChange={e => updateField('defaultVideoType', e.target.value)} className="input-base text-sm">
                            {VIDEO_TYPES.map(vt => <option key={vt} value={vt}>{VIDEO_TYPE_LABELS[vt]}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1">Max Clip Duur (sec)</label>
                          <input type="number" value={editData.maxClipDurationSeconds ?? ''} onChange={e => updateField('maxClipDurationSeconds', e.target.value ? parseInt(e.target.value) : null)} placeholder="Bijv. 15" className="input-base text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1">Beschrijving</label>
                          <input type="text" value={editData.description || ''} onChange={e => updateField('description', e.target.value || null)} placeholder="Optioneel" className="input-base text-sm" />
                        </div>
                      </div>
                    </div>

                    {/* Competitors */}
                    <div>
                      <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-3 flex items-center gap-2"><Users className="w-3.5 h-3.5" /> Competitors</h3>
                      <div className="space-y-2">
                        {competitors.length === 0 && <p className="text-xs text-zinc-600">Geen competitors toegevoegd</p>}
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

                    {/* Style Profile */}
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
                          <textarea value={editData.styleExtraInstructions || ''} onChange={e => updateField('styleExtraInstructions', e.target.value)} rows={3} placeholder="Bijv. 'Gebruik altijd korte zinnen, dramatische pauzes...'" className="input-base text-sm resize-none" />
                        </div>
                        <div>
                          <button onClick={() => setShowStyleJson(!showStyleJson)} className="btn-secondary text-xs">
                            <FileText className="w-3 h-3" /> {showStyleJson ? 'Verberg' : 'Toon'} Style Profile JSON
                          </button>
                          {showStyleJson && (
                            <div className="mt-2">
                              <textarea
                                value={editData.baseStyleProfile || ''}
                                onChange={e => {
                                  updateField('baseStyleProfile', e.target.value);
                                  setStyleJsonError(e.target.value && !validateJson(e.target.value) ? 'Ongeldige JSON' : '');
                                }}
                                rows={12}
                                placeholder='{"tone": "dramatic", "pacing": "fast", ...}'
                                className="input-base text-xs font-mono resize-y"
                              />
                              {styleJsonError && <p className="text-xs text-red-400 mt-1">{styleJsonError}</p>}
                              <p className="text-[10px] text-zinc-600 mt-1">Dit wordt automatisch gegenereerd door AI op basis van referentie video's, of handmatig invullen.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Research Template */}
                    <div>
                      <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-3 flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> Research Template (kanaal-level override)</h3>
                      <button onClick={() => setShowResearchJson(!showResearchJson)} className="btn-secondary text-xs">
                        <FileText className="w-3 h-3" /> {showResearchJson ? 'Verberg' : 'Toon'} Research Template JSON
                      </button>
                      {showResearchJson && (
                        <div className="mt-2">
                          <textarea
                            value={editData.baseResearchTemplate || ''}
                            onChange={e => {
                              updateField('baseResearchTemplate', e.target.value);
                              setResearchJsonError(e.target.value && !validateJson(e.target.value) ? 'Ongeldige JSON' : '');
                            }}
                            rows={12}
                            placeholder="Leeg = default template wordt gebruikt"
                            className="input-base text-xs font-mono resize-y"
                          />
                          {researchJsonError && <p className="text-xs text-red-400 mt-1">{researchJsonError}</p>}
                          <p className="text-[10px] text-zinc-600 mt-1">Optioneel: overschrijf de standaard research template voor dit kanaal. Laat leeg om de default te gebruiken.</p>
                        </div>
                      )}
                    </div>

                    {/* Media Presets */}
                    <div>
                      <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-3 flex items-center gap-2"><Clapperboard className="w-3.5 h-3.5" /> Media & Post-productie</h3>
                      <div className="space-y-3">
                        <ToggleRow
                          label="Sound Effects Ingeschakeld"
                          description="Automatisch SFX toevoegen via Director's Cut"
                          enabled={editData.sfxEnabled ?? true}
                          onToggle={() => updateField('sfxEnabled', !(editData.sfxEnabled ?? true))}
                        />
                        <ToggleRow
                          label="Special Edits Ingeschakeld"
                          description="Python-gebaseerde video effecten toepassen"
                          enabled={editData.specialEditsEnabled ?? true}
                          onToggle={() => updateField('specialEditsEnabled', !(editData.specialEditsEnabled ?? true))}
                        />
                      </div>
                    </div>

                    {/* Save knop */}
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

// Toggle component
function ToggleRow({ label, description, enabled, onToggle }: { label: string; description: string; enabled: boolean; onToggle: () => void }) {
  return (
    <div className="bg-surface-200/40 rounded-xl p-4 flex items-center justify-between">
      <div>
        <h4 className="font-semibold text-sm">{label}</h4>
        <p className="text-xs text-zinc-500">{description}</p>
      </div>
      <button onClick={onToggle} className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-emerald-600' : 'bg-surface-400'}`}>
        <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${enabled ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );
}
