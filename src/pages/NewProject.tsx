import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { Language, ScriptSource, MontageClip, VideoType, VIDEO_TYPE_LABELS } from '../types';

import { VIDEO_STYLES } from '../data/styles';
import StylePicker from '../components/StylePicker';
import ImageSelectionSection from '../components/ImageSelectionSection';
import * as api from '../api';

interface PipelineNodeInfo {
  sortOrder: number;
  name: string;
  slug: string;
  executor: string;
  isCheckpoint: boolean;
  category: string;
}

export default function NewProject() {
  const navigate = useNavigate();
  const { channelId: routeChannelId } = useParams<{ channelId?: string }>();
  const addProject = useStore((state) => state.addProject);

  const [channels, setChannels] = useState<Array<any>>([]);
  const [channelId, setChannelId] = useState(routeChannelId || '');
  const [channelLoaded, setChannelLoaded] = useState(false);
  const [videoType, setVideoType] = useState<VideoType>('ai');
  const [VOICES, setVOICES] = useState<Array<{id: string; name: string; voiceId: string; description: string; language: string}>>([]);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState<Language>('EN');
  const [scriptSource, setScriptSource] = useState<ScriptSource>('new');
  const [referenceVideos, setReferenceVideos] = useState(['', '', '']);
  const [scriptLengthMinutes, setScriptLengthMinutes] = useState(8);
  const [scriptUrl, setScriptUrl] = useState('');
  const [voice, setVoice] = useState('');
  const [backgroundMusic, setBackgroundMusic] = useState(true);
  const [visualStyle, setVisualStyle] = useState('ai-3d-render');
  const [visualStyleParent, setVisualStyleParent] = useState<string | null>('ai');
  const [customVisualStyle, setCustomVisualStyle] = useState('');
  const [imageSelectionMode, setImageSelectionMode] = useState<'auto' | 'manual'>('auto');
  const [imagesPerScene, setImagesPerScene] = useState<1 | 2 | 3>(1);
  const [useClips, setUseClips] = useState(false);
  const [referenceClips, setReferenceClips] = useState<string[]>([]);
  const [montageClips, setMontageClips] = useState<MontageClip[]>([]);
  const [stockImages, setStockImages] = useState(true);
  const [subtitles, setSubtitles] = useState(true);
  const [output, setOutput] = useState('youtube-1080p');
  const [aspectRatio, setAspectRatio] = useState('landscape');
  const [checkpoints, setCheckpoints] = useState<number[]>([]);

  // Pipeline nodes voor het geselecteerde videoType
  const [pipelineNodes, setPipelineNodes] = useState<PipelineNodeInfo[]>([]);
  const [loadingPipeline, setLoadingPipeline] = useState(false);

  // Laad pipeline nodes wanneer videoType verandert
  const loadPipelineNodes = async (vt: string) => {
    setLoadingPipeline(true);
    try {
      const res = await fetch(`/api/pipelines/${vt}/nodes`);
      if (res.ok) {
        const data = await res.json();
        setPipelineNodes(data.nodes || []);
        // Zet default checkpoints op nodes die isCheckpoint=true hebben
        const defaultCheckpoints = (data.nodes || [])
          .filter((n: PipelineNodeInfo) => n.isCheckpoint)
          .map((n: PipelineNodeInfo) => n.sortOrder);
        setCheckpoints(defaultCheckpoints);
      }
    } catch (err) {
      console.error('Pipeline nodes laden mislukt:', err);
    }
    setLoadingPipeline(false);
  };

  useEffect(() => {
    api.channels.getAll().then(setChannels).catch(() => {});
    api.voices.getAll().then((v: any[]) => {
      setVOICES(v);
      if (v.length > 0 && !voice) setVoice(v[0].voiceId);
    }).catch(() => {});
    loadPipelineNodes('ai');
  }, []);

  // Kanaal defaults laden
  useEffect(() => {
    if (!channelId || channelLoaded) return;
    const channel = channels.find(ch => ch.id === channelId);
    if (!channel) return;
    applyChannelDefaults(channel);
    setChannelLoaded(true);
  }, [channelId, channels]);

  const applyChannelDefaults = (channel: any) => {
    if (channel.defaultVideoType) {
      setVideoType(channel.defaultVideoType);
      loadPipelineNodes(channel.defaultVideoType);
    }
    if (channel.defaultVoiceId) setVoice(channel.defaultVoiceId);
    if (channel.defaultScriptLengthMinutes) setScriptLengthMinutes(channel.defaultScriptLengthMinutes);
    if (channel.defaultOutputFormat) setOutput(channel.defaultOutputFormat);
    if (channel.defaultAspectRatio) setAspectRatio(channel.defaultAspectRatio);
    if (channel.defaultLanguage) setLanguage(channel.defaultLanguage as Language);
    if (channel.defaultSubtitles !== undefined) setSubtitles(channel.defaultSubtitles);
    if (channel.defaultVisualStyle) {
      const isAi = channel.defaultVideoType === 'ai' || channel.defaultVideoType === 'spokesperson_ai';
      if (isAi) {
        const subStyleId = channel.defaultVisualStyle.startsWith('ai-')
          ? channel.defaultVisualStyle
          : `ai-${channel.defaultVisualStyle}`;
        setVisualStyle(subStyleId);
        setVisualStyleParent('ai');
      }
    }
  };

  const handleChannelChange = (newChannelId: string) => {
    setChannelId(newChannelId);
    setChannelLoaded(false);
  };

  const handleVideoTypeChange = (vt: VideoType) => {
    setVideoType(vt);
    loadPipelineNodes(vt);
  };

  const selectedVoice = VOICES.find((v) => v.voiceId === voice);

  const getSelectedStyle = () => {
    for (const style of VIDEO_STYLES) {
      if (style.id === visualStyle) return style;
      if (style.subStyles) {
        const sub = style.subStyles.find((s) => s.id === visualStyle);
        if (sub) return sub;
      }
    }
    return null;
  };

  const selectedStyle = getSelectedStyle();
  const isAiVideoType = videoType === 'ai' || videoType === 'spokesperson_ai';

  const handleStyleChange = (styleId: string, parentId: string | null) => {
    setVisualStyle(styleId);
    setVisualStyleParent(parentId);
  };

  const toggleCheckpoint = (sortOrder: number) => {
    setCheckpoints(prev =>
      prev.includes(sortOrder)
        ? prev.filter(s => s !== sortOrder)
        : [...prev, sortOrder].sort((a, b) => a - b)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !title) { alert('Naam en Titel zijn verplicht'); return; }

    const scriptLengthWords = Math.round(scriptLengthMinutes * 150);

    const project = await addProject({
      name, title, description: description || undefined, language, scriptSource,
      referenceVideos: scriptSource === 'new' ? referenceVideos.filter((v) => v) : undefined,
      scriptLength: scriptSource === 'new' ? scriptLengthWords : undefined,
      scriptUrl: scriptSource === 'existing' ? scriptUrl : undefined,
      voice: selectedVoice ? `${selectedVoice.name} — ${selectedVoice.description}` : '',
      backgroundMusic, visualStyle, visualStyleParent, customVisualStyle: customVisualStyle || undefined,
      imageSelectionMode: isAiVideoType ? imageSelectionMode : 'auto',
      imagesPerScene: isAiVideoType && imageSelectionMode === 'manual' ? imagesPerScene : 1,
      selectedImages: [],
      transitionMode: 'none', uniformTransition: null, sceneTransitions: [],
      useClips, referenceClips,
      montageClips: isAiVideoType ? [] : montageClips, stockImages, checkpoints, feedbackHistory: [],
      colorGrading: 'auto' as any,
      subtitles, output: output as any,
      aspectRatio, channelId: channelId || undefined,
      videoType,
    });
    navigate(`/project/${project.id}`);
  };

  const selectedChannel = channels.find(ch => ch.id === channelId);

  return (
    <div className="p-8 max-w-5xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Nieuw Project</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {selectedChannel ? `voor ${selectedChannel.name}` : 'Configureer alle instellingen voor je video'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* ═══ KANAAL ═══ */}
        <section className="section-card">
          <h2 className="section-title">Kanaal</h2>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Selecteer Kanaal</label>
            <select value={channelId} onChange={(e) => handleChannelChange(e.target.value)} className="input-base">
              <option value="">— Geen kanaal —</option>
              {channels.map((ch) => (<option key={ch.id} value={ch.id}>{ch.name}</option>))}
            </select>
            {channelId && selectedChannel && (
              <p className="text-[11px] text-brand-400 mt-2">
                Standaard instellingen van {selectedChannel.name} geladen.
              </p>
            )}
          </div>
        </section>

        {/* ═══ ALGEMEEN ═══ */}
        <section className="section-card">
          <h2 className="section-title">Algemeen</h2>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">
              Project Naam <span className="text-red-400">*</span>
            </label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value.replace(/\s/g, "_"))} className="input-base" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">
              Titel <span className="text-red-400">*</span>
            </label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="input-base" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Beschrijving</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="input-base resize-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Video Type</label>
            <select value={videoType} onChange={(e) => handleVideoTypeChange(e.target.value as VideoType)} className="input-base">
              {(['ai', 'spokesperson_ai', 'trending', 'documentary', 'compilation', 'spokesperson'] as VideoType[]).map(vt => (
                <option key={vt} value={vt}>{VIDEO_TYPE_LABELS[vt]}</option>
              ))}
            </select>
          </div>
        </section>

        {/* ═══ SCRIPT ═══ */}
        <section className="section-card">
          <h2 className="section-title">Script</h2>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-3 uppercase tracking-wider">Script Bron</label>
            <div className="flex gap-4">
              {(['new', 'existing'] as const).map((src) => (
                <label key={src} className="flex items-center gap-2.5 cursor-pointer group">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                    scriptSource === src ? 'border-brand-500 bg-brand-500' : 'border-zinc-600 group-hover:border-zinc-500'
                  }`}>
                    {scriptSource === src && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                  </div>
                  <span className="text-sm">{src === 'new' ? 'Nieuw schrijven' : 'Bestaand script'}</span>
                </label>
              ))}
            </div>
          </div>
          {scriptSource === 'new' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Referentie Video URLs</label>
                {referenceVideos.map((video, index) => (
                  <input key={index} type="url" value={video}
                    onChange={(e) => { const nv = [...referenceVideos]; nv[index] = e.target.value; setReferenceVideos(nv); }}
                    placeholder={`Referentie video ${index + 1}`} className="input-base mb-2" />
                ))}
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Script Lengte (minuten)</label>
                <input type="number" step="0.5" min="1" max="60" value={scriptLengthMinutes} onChange={(e) => setScriptLengthMinutes(parseFloat(e.target.value) || 8)} className="input-base" />
                <p className="text-[11px] text-zinc-600 mt-1">≈ {Math.round(scriptLengthMinutes * 150)} woorden (150 WPM)</p>
              </div>
            </>
          )}
          {scriptSource === 'existing' && (
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Script URL</label>
              <input type="url" value={scriptUrl} onChange={(e) => setScriptUrl(e.target.value)} placeholder="https://..." className="input-base" />
            </div>
          )}
        </section>

        {/* ═══ VOICE ═══ */}
        <section className="section-card">
          <h2 className="section-title">Voice</h2>
          <div>
            <select value={voice} onChange={(e) => setVoice(e.target.value)} className="input-base">
              {VOICES.map((v) => (
                <option key={v.voiceId} value={v.voiceId}>{v.name} — {v.description} ({v.language})</option>
              ))}
            </select>
          </div>
        </section>

        {/* ═══ AI VISUELE STIJL — alleen bij AI types ═══ */}
        {isAiVideoType && (
          <section className="section-card">
            <h2 className="section-title">AI Visuele Stijl</h2>
            <StylePicker selectedStyle={visualStyle} selectedParent={visualStyleParent} onStyleChange={handleStyleChange} onCustomStyleChange={setCustomVisualStyle} customStyle={customVisualStyle} />
          </section>
        )}

        {/* ═══ PIPELINE STAPPEN — uit database ═══ */}
        <section className="section-card">
          <h2 className="section-title">Pipeline Stappen</h2>
          <p className="text-xs text-zinc-600 mb-3">
            Pipeline voor <strong className="text-zinc-400">{VIDEO_TYPE_LABELS[videoType]}</strong> — {pipelineNodes.length} stappen
          </p>

          {loadingPipeline ? (
            <p className="text-xs text-zinc-500">Pipeline laden...</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {pipelineNodes.map((node) => (
                <span key={node.sortOrder} className="text-[10px] px-2 py-1 rounded-md border bg-brand-500/10 border-brand-500/20 text-brand-300">
                  {node.sortOrder}. {node.name}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* ═══ AI IMAGE SELECTIE — alleen bij AI types ═══ */}
        {isAiVideoType && (
          <ImageSelectionSection mode={imageSelectionMode} imagesPerScene={imagesPerScene} onModeChange={setImageSelectionMode} onImagesPerSceneChange={setImagesPerScene} />
        )}

        {/* ═══ CHECKPOINTS ═══ */}
        <section className="section-card">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="section-title !mb-1">Checkpoints</h2>
              <p className="text-xs text-zinc-600">
                De pipeline pauzeert bij deze stappen zodat je het resultaat kunt reviewen.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const defaults = pipelineNodes.filter(n => n.isCheckpoint).map(n => n.sortOrder);
                setCheckpoints(defaults);
              }}
              className="btn-secondary text-xs"
            >
              Standaard
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {pipelineNodes.map((node) => {
              const isChecked = checkpoints.includes(node.sortOrder);
              const isDefault = node.isCheckpoint;
              return (
                <label
                  key={node.sortOrder}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                    isChecked
                      ? 'bg-brand-500/8 border-brand-500/20'
                      : 'bg-surface-200/30 border-white/[0.04] hover:border-white/[0.08]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleCheckpoint(node.sortOrder)}
                    className="w-4 h-4 rounded border-zinc-600 bg-surface-200 text-brand-600 focus:ring-2 focus:ring-brand-500/40 focus:ring-offset-0 cursor-pointer"
                  />
                  <span className="text-[11px] text-zinc-600 font-mono w-5">{node.sortOrder}</span>
                  <span className="flex-1 text-sm">{node.name}</span>
                  {isDefault && (
                    <span className="text-[10px] text-brand-400 font-medium">standaard</span>
                  )}
                </label>
              );
            })}
          </div>

          {checkpoints.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/[0.04]">
              <p className="text-[11px] text-zinc-500">
                {checkpoints.length} checkpoint{checkpoints.length !== 1 ? 's' : ''}: stap {checkpoints.join(', ')}
              </p>
            </div>
          )}
        </section>

        <button type="submit" className="btn-primary w-full py-3.5 text-sm">
          Project Aanmaken
        </button>
      </form>
    </div>
  );
}
