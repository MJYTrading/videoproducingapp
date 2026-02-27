import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lightbulb, Sparkles, Save, ArrowRight, Trash2, ChevronDown, ChevronUp, Plus, Loader2, Search, X, Edit2, ExternalLink } from 'lucide-react';
import { VideoType, VIDEO_TYPE_LABELS } from '../types';
import * as api from '../api';

interface BrainstormIdea {
  tempId: string;
  title: string;
  description: string;
  angle: string;
  videoType: VideoType;
  referenceVideos: string[];
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  source: 'ai' | 'manual';
}

interface SavedIdea {
  id: string;
  channelId: string;
  title: string;
  description: string;
  angle: string;
  videoType: string;
  referenceVideos: string;
  confidence: string;
  reasoning: string;
  source: string;
  status: string;
  projectId: string | null;
  createdAt: string;
  channel?: { name: string };
}

const CONFIDENCE_COLORS = {
  high: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  medium: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  low: 'bg-red-500/15 text-red-400 border-red-500/20',
};

export default function IdeationPage() {
  const navigate = useNavigate();
  const [channels, setChannels] = useState<any[]>([]);
  const [selectedChannel, setSelectedChannel] = useState('');
  const [brainstormResults, setBrainstormResults] = useState<BrainstormIdea[]>([]);
  const [savedIdeas, setSavedIdeas] = useState<SavedIdea[]>([]);
  const [loading, setLoading] = useState(false);
  const [brainstorming, setBrainstorming] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [showSaved, setShowSaved] = useState(true);
  const [dataStats, setDataStats] = useState<any>(null);

  // Manual idea form
  const [manualTitle, setManualTitle] = useState('');
  const [manualDesc, setManualDesc] = useState('');
  const [manualAngle, setManualAngle] = useState('');
  const [manualVideoType, setManualVideoType] = useState<VideoType>('ai');
  const [manualRefs, setManualRefs] = useState<string[]>(['']);

  useEffect(() => {
    api.channels.getAll().then(setChannels).catch(() => {});
    loadSavedIdeas();
  }, []);

  const loadSavedIdeas = async (channelFilter?: string) => {
    try {
      const ideas = await api.ideation.getIdeas(channelFilter);
      setSavedIdeas(ideas);
    } catch (err: any) { console.error(err); }
  };

  useEffect(() => {
    loadSavedIdeas(selectedChannel || undefined);
  }, [selectedChannel]);

  const showMsg = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type }); setTimeout(() => setMessage(null), 4000);
  };

  // ── Brainstorm ──
  const handleBrainstorm = async () => {
    if (!selectedChannel) { showMsg('Selecteer eerst een kanaal', 'error'); return; }
    setBrainstorming(true);
    setBrainstormResults([]);
    setDataStats(null);
    try {
      const result = await api.ideation.brainstorm(selectedChannel);
      setBrainstormResults(result.ideas);
      setDataStats(result.dataStats);
      showMsg(`${result.ideas.length} ideeën gegenereerd!`, 'success');
    } catch (err: any) {
      showMsg(err.message, 'error');
    }
    setBrainstorming(false);
  };

  // ── Save idea ──
  const handleSaveIdea = async (idea: BrainstormIdea) => {
    try {
      await api.ideation.saveIdea({
        channelId: selectedChannel,
        title: idea.title,
        description: idea.description,
        angle: idea.angle,
        videoType: idea.videoType,
        referenceVideos: idea.referenceVideos,
        confidence: idea.confidence,
        reasoning: idea.reasoning,
        source: idea.source,
      });
      setBrainstormResults(prev => prev.filter(i => i.tempId !== idea.tempId));
      await loadSavedIdeas(selectedChannel || undefined);
      showMsg(`"${idea.title}" opgeslagen!`, 'success');
    } catch (err: any) { showMsg(err.message, 'error'); }
  };

  // ── Save manual idea ──
  const handleSaveManual = async () => {
    if (!selectedChannel) { showMsg('Selecteer eerst een kanaal', 'error'); return; }
    if (!manualTitle.trim()) { showMsg('Titel is verplicht', 'error'); return; }
    try {
      await api.ideation.saveIdea({
        channelId: selectedChannel,
        title: manualTitle.trim(),
        description: manualDesc.trim(),
        angle: manualAngle.trim(),
        videoType: manualVideoType,
        referenceVideos: manualRefs.filter(r => r.trim()),
        source: 'manual',
      });
      setManualTitle(''); setManualDesc(''); setManualAngle(''); setManualVideoType('ai'); setManualRefs(['']);
      setShowManualForm(false);
      await loadSavedIdeas(selectedChannel || undefined);
      showMsg('Idee opgeslagen!', 'success');
    } catch (err: any) { showMsg(err.message, 'error'); }
  };

  // ── Convert to project ──
  const handleConvert = async (ideaId: string) => {
    try {
      const result = await api.ideation.convertToProject(ideaId);
      showMsg('Project aangemaakt!', 'success');
      await loadSavedIdeas(selectedChannel || undefined);
      setTimeout(() => navigate(`/project/${result.projectId}`), 500);
    } catch (err: any) { showMsg(err.message, 'error'); }
  };

  // ── Delete idea ──
  const handleDelete = async (ideaId: string) => {
    if (!confirm('Weet je zeker dat je dit idee wilt verwijderen?')) return;
    try {
      await api.ideation.deleteIdea(ideaId);
      await loadSavedIdeas(selectedChannel || undefined);
      showMsg('Idee verwijderd', 'success');
    } catch (err: any) { showMsg(err.message, 'error'); }
  };

  const selectedChannelData = channels.find(c => c.id === selectedChannel);

  return (
    <div className="p-8 animate-fade-in">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 flex items-center justify-center border border-amber-500/10">
              <Lightbulb className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Ideation</h1>
              <p className="text-sm text-zinc-500">Genereer video-ideeën op basis van kanaaldata en AI analyse</p>
            </div>
          </div>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-xl border text-sm animate-fade-in ${message.type === 'success' ? 'bg-emerald-500/8 border-emerald-500/15 text-emerald-400' : 'bg-red-500/8 border-red-500/15 text-red-400'}`}>
            {message.text}
          </div>
        )}

        {/* Kanaal selectie + brainstorm */}
        <div className="section-card mb-6">
          <h2 className="section-title">AI Brainstorm</h2>
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Selecteer Kanaal</label>
              <select value={selectedChannel} onChange={e => setSelectedChannel(e.target.value)} className="input-base text-sm">
                <option value="">Kies een kanaal...</option>
                {channels.map(ch => (
                  <option key={ch.id} value={ch.id}>{ch.name}{ch.youtubeChannelId ? '' : ' (geen YouTube ID)'}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleBrainstorm}
              disabled={brainstorming || !selectedChannel}
              className="btn-primary text-sm whitespace-nowrap"
            >
              {brainstorming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {brainstorming ? 'Analyseren...' : 'Brainstorm'}
            </button>
            <button
              onClick={() => setShowManualForm(!showManualForm)}
              className="btn-secondary text-sm whitespace-nowrap"
            >
              {showManualForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {showManualForm ? 'Annuleren' : 'Eigen Idee'}
            </button>
          </div>

          {brainstorming && (
            <div className="mt-4 p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                <div>
                  <p className="text-sm text-amber-300 font-medium">NexLev kanaaldata ophalen & AI brainstorm...</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Dit kan 15-30 seconden duren</p>
                </div>
              </div>
            </div>
          )}

          {dataStats && (
            <div className="mt-3 flex gap-3 flex-wrap">
              {dataStats.aboutLoaded && <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400">Kanaalinfo geladen</span>}
              {dataStats.videosLoaded && <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400">Video's geladen</span>}
              {dataStats.outliersLoaded && <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400">Outliers geladen</span>}
              {dataStats.analyticsLoaded && <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400">Analytics geladen</span>}
              {dataStats.competitorsAnalyzed > 0 && <span className="text-[10px] px-2 py-1 rounded-full bg-blue-500/10 text-blue-400">{dataStats.competitorsAnalyzed} competitors</span>}
            </div>
          )}
        </div>

        {/* Manual idea form */}
        {showManualForm && (
          <div className="section-card mb-6 border-brand-500/20 animate-fade-in-down">
            <h2 className="section-title">Eigen Idee Toevoegen</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs text-zinc-500 mb-1">Titel *</label>
                <input type="text" value={manualTitle} onChange={e => setManualTitle(e.target.value)} placeholder="Video titel" className="input-base text-sm" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-zinc-500 mb-1">Beschrijving</label>
                <textarea value={manualDesc} onChange={e => setManualDesc(e.target.value)} rows={2} placeholder="Waar gaat de video over?" className="input-base text-sm resize-none" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Invalshoek</label>
                <input type="text" value={manualAngle} onChange={e => setManualAngle(e.target.value)} placeholder="De specifieke hook" className="input-base text-sm" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Video Type</label>
                <select value={manualVideoType} onChange={e => setManualVideoType(e.target.value as VideoType)} className="input-base text-sm">
                  {(['ai', 'spokesperson_ai', 'trending', 'documentary', 'compilation', 'spokesperson'] as VideoType[]).map(vt => (
                    <option key={vt} value={vt}>{VIDEO_TYPE_LABELS[vt]}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-zinc-500 mb-1">Referentie Video URLs</label>
                {manualRefs.map((ref, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <input type="url" value={ref} onChange={e => { const n = [...manualRefs]; n[idx] = e.target.value; setManualRefs(n); }} placeholder="https://youtube.com/watch?v=..." className="input-base text-sm flex-1" />
                    {manualRefs.length > 1 && <button onClick={() => setManualRefs(manualRefs.filter((_, i) => i !== idx))} className="btn-icon text-red-400/60 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>}
                  </div>
                ))}
                <button onClick={() => setManualRefs([...manualRefs, ''])} className="text-xs text-brand-400 hover:text-brand-300">+ URL toevoegen</button>
              </div>
            </div>
            <button onClick={handleSaveManual} className="btn-success text-sm mt-2">
              <Save className="w-4 h-4" /> Opslaan
            </button>
          </div>
        )}

        {/* Brainstorm results */}
        {brainstormResults.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              AI Suggesties ({brainstormResults.length})
            </h2>
            <div className="space-y-3">
              {brainstormResults.map((idea) => (
                <IdeaCard
                  key={idea.tempId}
                  title={idea.title}
                  description={idea.description}
                  angle={idea.angle}
                  videoType={idea.videoType}
                  confidence={idea.confidence}
                  reasoning={idea.reasoning}
                  referenceVideos={idea.referenceVideos}
                  actions={
                    <button onClick={() => handleSaveIdea(idea)} className="btn-success text-xs">
                      <Save className="w-3.5 h-3.5" /> Opslaan
                    </button>
                  }
                />
              ))}
            </div>
          </div>
        )}

        {/* Saved ideas */}
        <div>
          <button onClick={() => setShowSaved(!showSaved)} className="flex items-center gap-2 text-sm font-bold text-zinc-300 uppercase tracking-wider mb-3">
            {showSaved ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            Opgeslagen Ideeën ({savedIdeas.filter(i => i.status !== 'converted').length})
          </button>

          {showSaved && (
            <div className="space-y-3">
              {savedIdeas.filter(i => i.status !== 'converted').length === 0 && (
                <p className="text-xs text-zinc-600 py-4">Geen opgeslagen ideeën{selectedChannel ? ' voor dit kanaal' : ''}. Gebruik de brainstorm of voeg handmatig een idee toe.</p>
              )}
              {savedIdeas.filter(i => i.status !== 'converted').map((idea) => (
                <IdeaCard
                  key={idea.id}
                  title={idea.title}
                  description={idea.description}
                  angle={idea.angle}
                  videoType={idea.videoType as VideoType}
                  confidence={idea.confidence as 'high' | 'medium' | 'low'}
                  reasoning={idea.reasoning}
                  referenceVideos={JSON.parse(idea.referenceVideos || '[]')}
                  channelName={idea.channel?.name}
                  createdAt={idea.createdAt}
                  actions={
                    <div className="flex gap-2">
                      <button onClick={() => handleConvert(idea.id)} className="btn-primary text-xs">
                        <ArrowRight className="w-3.5 h-3.5" /> Naar Project
                      </button>
                      <button onClick={() => handleDelete(idea.id)} className="btn-icon text-red-400/60 hover:text-red-400">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  }
                />
              ))}
            </div>
          )}

          {/* Converted ideas */}
          {savedIdeas.filter(i => i.status === 'converted').length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Omgezet naar Project ({savedIdeas.filter(i => i.status === 'converted').length})</h3>
              <div className="space-y-2">
                {savedIdeas.filter(i => i.status === 'converted').map(idea => (
                  <div key={idea.id} className="glass rounded-lg px-4 py-3 flex items-center justify-between opacity-60">
                    <div>
                      <span className="text-sm font-medium">{idea.title}</span>
                      <span className="text-[10px] ml-2 text-zinc-600">{idea.channel?.name}</span>
                    </div>
                    {idea.projectId && (
                      <button onClick={() => navigate(`/project/${idea.projectId}`)} className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" /> Bekijk Project
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Idea Card Component ──
function IdeaCard({ title, description, angle, videoType, confidence, reasoning, referenceVideos, channelName, createdAt, actions }: {
  title: string;
  description: string;
  angle?: string;
  videoType: VideoType;
  confidence?: 'high' | 'medium' | 'low';
  reasoning?: string;
  referenceVideos?: string[];
  channelName?: string;
  createdAt?: string;
  actions: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-semibold text-sm">{title}</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-600/15 text-brand-300 font-medium">
              {VIDEO_TYPE_LABELS[videoType] || videoType}
            </span>
            {confidence && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${CONFIDENCE_COLORS[confidence]}`}>
                {confidence}
              </span>
            )}
            {channelName && <span className="text-[10px] text-zinc-600">{channelName}</span>}
          </div>
          <p className="text-xs text-zinc-400 line-clamp-2">{description}</p>
          {angle && !expanded && <p className="text-xs text-zinc-500 mt-1 italic">Hook: {angle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {actions}
          <button onClick={() => setExpanded(!expanded)} className="btn-icon">
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2 animate-fade-in">
          {angle && (
            <div><span className="text-[10px] text-zinc-500 uppercase">Invalshoek:</span><p className="text-xs text-zinc-300">{angle}</p></div>
          )}
          {reasoning && (
            <div><span className="text-[10px] text-zinc-500 uppercase">Onderbouwing:</span><p className="text-xs text-zinc-300">{reasoning}</p></div>
          )}
          {referenceVideos && referenceVideos.length > 0 && (
            <div>
              <span className="text-[10px] text-zinc-500 uppercase">Referenties:</span>
              {referenceVideos.map((url, idx) => (
                <a key={idx} href={url} target="_blank" rel="noopener" className="block text-xs text-brand-400 hover:text-brand-300 truncate">{url}</a>
              ))}
            </div>
          )}
          {createdAt && <p className="text-[10px] text-zinc-600">Aangemaakt: {new Date(createdAt).toLocaleString('nl-NL')}</p>}
        </div>
      )}
    </div>
  );
}
