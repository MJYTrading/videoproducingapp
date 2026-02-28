import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { Language, ScriptSource, MontageClip, VideoType, VIDEO_TYPE_LABELS } from '../types';

import { VIDEO_STYLES, STYLE_STEP_DEFAULTS } from '../data/styles';
import StylePicker from '../components/StylePicker';
import CheckpointsSection from '../components/CheckpointsSection';
// ClipTypesSection removed - pipeline handles clips
import ImageSelectionSection from '../components/ImageSelectionSection';
import * as api from '../api';

const STEP_DEFS: Record<number, { name: string; executor: string; icon: string }> = {
  0:  { name: 'Ideation',              executor: 'App',              icon: '💡' },
  1:  { name: 'Project Formulier',     executor: 'App',              icon: '📋' },
  2:  { name: 'Research JSON',         executor: 'Elevate Sonar',    icon: '🔍' },
  3:  { name: 'Transcripts Ophalen',   executor: 'App',              icon: '📝' },
  4:  { name: 'Trending Clips Research', executor: 'Elevate Sonar',  icon: '📊' },
  5:  { name: 'Style Profile',         executor: 'Elevate AI',       icon: '🎨' },
  6:  { name: 'Script Orchestrator',   executor: 'Elevate Opus',     icon: '🎯' },
  7:  { name: 'Script Schrijven',      executor: 'Elevate AI',       icon: '✍️' },
  8:  { name: 'Voice Over',            executor: 'Elevate',          icon: '🎙️' },
  9:  { name: 'Avatar / Spokesperson', executor: 'HeyGen',           icon: '🧑' },
  10: { name: 'Timestamps Ophalen',    executor: 'Assembly AI',      icon: '⏱️' },
  11: { name: 'Scene Prompts',         executor: 'Elevate AI',       icon: '🖼️' },
  12: { name: 'Assets Zoeken',         executor: 'App',              icon: '🔎' },
  13: { name: 'Clips Downloaden',      executor: 'App',              icon: '⬇️' },
  14: { name: 'Images Genereren',      executor: 'Elevate',          icon: '🖌️' },
  15: { name: 'Video Scenes Genereren', executor: 'Elevate',         icon: '🎥' },
  16: { name: "Director's Cut",        executor: 'Claude Opus',      icon: '🎼' },
  17: { name: 'Achtergrondmuziek',     executor: 'FFMPEG',           icon: '🎵' },
  18: { name: 'Color Grading',         executor: 'FFMPEG',           icon: '🌈' },
  19: { name: 'Subtitles',             executor: 'FFMPEG',           icon: '💬' },
  20: { name: 'Overlay',               executor: 'FFMPEG',           icon: '📐' },
  21: { name: 'Sound Effects',         executor: 'FFMPEG',           icon: '🔊' },
  22: { name: 'Video Effects',         executor: 'FFMPEG',           icon: '✨' },
  23: { name: 'Final Export',          executor: 'FFMPEG',           icon: '📦' },
  24: { name: 'Thumbnail',             executor: 'App',              icon: '🖼️' },
  25: { name: 'Drive Upload',          executor: 'App',              icon: '☁️' },
};

// Map videoType naar STYLE_STEP_DEFAULTS key
const VIDEO_TYPE_TO_STYLE_KEY: Record<string, string> = {
  ai: 'ai',
  spokesperson_ai: 'spokesperson-ai',
  trending: 'trending',
  documentary: 'documentary',
  compilation: 'compilatie',
  spokesperson: 'spokesperson-trending',
};

export default function NewProject() {
  const navigate = useNavigate();
  const { channelId: routeChannelId } = useParams<{ channelId?: string }>();
  const addProject = useStore((state) => state.addProject);

  const [enabledSteps, setEnabledSteps] = useState<number[]>([]);
  const [showStepToggles, setShowStepToggles] = useState(false);
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
  const [checkpoints, setCheckpoints] = useState<number[]>([7, 11, 14, 16]);

  useEffect(() => {
    api.channels.getAll().then(setChannels).catch(() => {});
    api.voices.getAll().then((v: any[]) => {
      setVOICES(v);
      if (v.length > 0 && !voice) setVoice(v[0].voiceId);
    }).catch(() => {});
    applyStepDefaults('ai');
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
      applyStepDefaults(channel.defaultVideoType);
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

  // Pipeline stappen baseren op videoType
  const applyStepDefaults = (vt: string) => {
    const styleKey = VIDEO_TYPE_TO_STYLE_KEY[vt] || vt;
    const defaults = STYLE_STEP_DEFAULTS[styleKey];
    if (defaults) {
      const enabled = Object.entries(defaults).filter(([_, v]) => v === true).map(([k]) => Number(k));
      setEnabledSteps(enabled);
    }
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

  const handleVideoTypeChange = (vt: VideoType) => {
    setVideoType(vt);
    applyStepDefaults(vt);
  };

  const toggleStep = (stepNumber: number) => {
    setEnabledSteps(prev =>
      prev.includes(stepNumber) ? prev.filter(s => s !== stepNumber) : [...prev, stepNumber].sort((a, b) => a - b)
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
      aspectRatio, enabledSteps, channelId: channelId || undefined,
      videoType,
    });
    navigate(`/project/${project.id}`);
  };

  const isStockImagesDisabled = !!(selectedStyle && 'allowsRealImages' in selectedStyle && selectedStyle.allowsRealImages === false);

  const currentDefaults = STYLE_STEP_DEFAULTS[VIDEO_TYPE_TO_STYLE_KEY[videoType] || videoType] || {};
  const enabledCount = enabledSteps.length;

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

        {/* ═══ PIPELINE STAPPEN — gebaseerd op videoType ═══ */}
        <section className="section-card">
          <div className="flex items-center justify-between mb-1">
            <h2 className="section-title !mb-0">Pipeline Stappen</h2>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-zinc-500 font-mono">{enabledCount}/26 actief</span>
              <button type="button" onClick={() => setShowStepToggles(!showStepToggles)}
                className="text-xs text-brand-400 hover:text-brand-300 font-medium">
                {showStepToggles ? 'Verbergen' : 'Aanpassen'}
              </button>
            </div>
          </div>
          <p className="text-xs text-zinc-600 mb-3">
            Gebaseerd op video type: <strong className="text-zinc-400">{VIDEO_TYPE_LABELS[videoType]}</strong>
          </p>

          {!showStepToggles && (
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 26 }, (_, i) => i).map((stepNum) => {
                const step = STEP_DEFS[stepNum];
                if (!step) return null;
                const isEnabled = enabledSteps.includes(stepNum);
                return (
                  <span key={stepNum} className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
                    isEnabled
                      ? 'bg-brand-500/10 border-brand-500/20 text-brand-300'
                      : 'bg-surface-200 border-white/[0.04] text-zinc-600 line-through'
                  }`}>
                    {step.icon} {stepNum}
                  </span>
                );
              })}
            </div>
          )}

          {showStepToggles && (
            <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
              {Array.from({ length: 26 }, (_, i) => i).map((stepNum) => {
                const step = STEP_DEFS[stepNum];
                if (!step) return null;
                const isEnabled = enabledSteps.includes(stepNum);
                const isDefault = currentDefaults[stepNum] === true;
                const isOverridden = isEnabled !== isDefault;

                return (
                  <div key={stepNum} className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all ${
                    isEnabled ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-surface-100 border-white/[0.03] opacity-60'
                  }`}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-sm">{step.icon}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-zinc-600 font-mono w-5">{stepNum}</span>
                          <span className="text-xs font-medium truncate">{step.name}</span>
                          {isOverridden && <span className="text-[9px] px-1 py-0.5 bg-amber-500/15 text-amber-400 rounded border border-amber-500/20">aangepast</span>}
                        </div>
                        <span className="text-[10px] text-zinc-600">{step.executor}</span>
                      </div>
                    </div>
                    <button type="button" onClick={() => toggleStep(stepNum)}
                      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${isEnabled ? 'bg-brand-500' : 'bg-surface-400'}`}>
                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${isEnabled ? 'translate-x-4' : ''}`} />
                    </button>
                  </div>
                );
              })}
              <button type="button" onClick={() => applyStepDefaults(videoType)}
                className="text-xs text-zinc-500 hover:text-zinc-300 mt-2">
                ↩ Reset naar standaard voor {VIDEO_TYPE_LABELS[videoType]}
              </button>
            </div>
          )}
        </section>

        {/* ═══ AI IMAGE SELECTIE — alleen bij AI types ═══ */}
        {isAiVideoType && (
          <ImageSelectionSection mode={imageSelectionMode} imagesPerScene={imagesPerScene} onModeChange={setImageSelectionMode} onImagesPerSceneChange={setImagesPerScene} />
        )}


        {/* ═══ CHECKPOINTS — gefilterd op enabledSteps ═══ */}
        <CheckpointsSection checkpoints={checkpoints} onChange={setCheckpoints} enabledSteps={enabledSteps} />

        <button type="submit" className="btn-primary w-full py-3.5 text-sm">
          Project Aanmaken
        </button>
      </form>
    </div>
  );
}
