import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { Language, ScriptSource, MontageClip } from '../types';

import { COLOR_GRADES } from '../data/color-grades';
import { OUTPUT_FORMATS } from '../data/output-formats';
import { VIDEO_STYLES, STYLE_STEP_DEFAULTS } from '../data/styles';
import StylePicker from '../components/StylePicker';
import CheckpointsSection from '../components/CheckpointsSection';
import ClipTypesSection from '../components/ClipTypesSection';
import ImageSelectionSection from '../components/ImageSelectionSection';
import TransitionsSection from '../components/TransitionsSection';
import * as api from '../api';

const STEP_DEFS: Record<number, { name: string; executor: string; icon: string; readyToUse: boolean }> = {
  0:  { name: 'Ideation',              executor: 'App',              icon: '💡', readyToUse: false },
  1:  { name: 'Project Formulier',     executor: 'App',              icon: '📋', readyToUse: true },
  2:  { name: 'Research JSON',         executor: 'Perplexity',       icon: '🔍', readyToUse: false },
  3:  { name: 'Transcripts Ophalen',   executor: 'App',              icon: '📝', readyToUse: true },
  4:  { name: 'Trending Clips Research', executor: 'Perplexity',     icon: '📊', readyToUse: false },
  5:  { name: 'Style Profile',         executor: 'Elevate AI',       icon: '🎨', readyToUse: true },
  6:  { name: 'Script Schrijven',      executor: 'Elevate AI',       icon: '✍️', readyToUse: true },
  7:  { name: 'Voice Over',            executor: 'Elevate',          icon: '🎙️', readyToUse: true },
  8:  { name: 'Avatar / Spokesperson', executor: 'HeyGen',           icon: '🧑', readyToUse: false },
  9:  { name: 'Timestamps Ophalen',    executor: 'Assembly AI',      icon: '⏱️', readyToUse: true },
  10: { name: 'Scene Prompts',         executor: 'Elevate AI',       icon: '🖼️', readyToUse: true },
  11: { name: 'Assets Zoeken',         executor: 'TwelveLabs + N8N', icon: '🔎', readyToUse: true },
  12: { name: 'Clips Downloaden',      executor: 'N8N',              icon: '⬇️', readyToUse: true },
  13: { name: 'Images Genereren',      executor: 'Elevate',          icon: '🖌️', readyToUse: true },
  14: { name: 'Video Scenes Genereren', executor: 'Elevate',         icon: '🎥', readyToUse: true },
  15: { name: 'Orchestrator',          executor: 'Claude Opus',      icon: '🎼', readyToUse: false },
  16: { name: 'Achtergrondmuziek',     executor: 'FFMPEG',           icon: '🎵', readyToUse: false },
  17: { name: 'Color Grading',         executor: 'FFMPEG',           icon: '🌈', readyToUse: true },
  18: { name: 'Subtitles',             executor: 'FFMPEG',           icon: '💬', readyToUse: true },
  19: { name: 'Overlay',               executor: 'FFMPEG',           icon: '📐', readyToUse: false },
  20: { name: 'Sound Effects',         executor: 'FFMPEG',           icon: '🔊', readyToUse: true },
  21: { name: 'Video Effects',         executor: 'FFMPEG',           icon: '✨', readyToUse: true },
  22: { name: 'Final Export',          executor: 'FFMPEG',           icon: '📦', readyToUse: true },
  23: { name: 'Thumbnail',             executor: 'App',              icon: '🖼️', readyToUse: false },
  24: { name: 'Drive Upload',          executor: 'App',              icon: '☁️', readyToUse: true },
};

export default function NewProject() {
  const navigate = useNavigate();
  const addProject = useStore((state) => state.addProject);

  const [enabledSteps, setEnabledSteps] = useState<number[]>([]);
  const [showStepToggles, setShowStepToggles] = useState(false);
  const [channels, setChannels] = useState<Array<{id: string; name: string}>>([]);
  const [channelId, setChannelId] = useState('');
  const [VOICES, setVOICES] = useState<Array<{id: string; name: string; voiceId: string; description: string; language: string}>>([]);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState<Language>('EN');
  const [scriptSource, setScriptSource] = useState<ScriptSource>('new');
  const [referenceVideos, setReferenceVideos] = useState(['', '', '']);
  const [scriptLength, setScriptLength] = useState(5000);
  const [scriptUrl, setScriptUrl] = useState('');
  const [voice, setVoice] = useState('TbEd6wZh117FdOyTGS3q');
  const [backgroundMusic, setBackgroundMusic] = useState(true);
  const [visualStyle, setVisualStyle] = useState('ai-3d-render');
  const [visualStyleParent, setVisualStyleParent] = useState<string | null>('ai');
  const [customVisualStyle, setCustomVisualStyle] = useState('');
  const [imageSelectionMode, setImageSelectionMode] = useState<'auto' | 'manual'>('auto');
  const [imagesPerScene, setImagesPerScene] = useState<1 | 2 | 3>(1);
  const [transitionMode, setTransitionMode] = useState<'none' | 'uniform' | 'per-scene'>('uniform');
  const [uniformTransition, setUniformTransition] = useState<string | null>('cross-dissolve');
  const [useClips, setUseClips] = useState(false);
  const [referenceClips, setReferenceClips] = useState<string[]>([]);
  const [montageClips, setMontageClips] = useState<MontageClip[]>([]);
  const [stockImages, setStockImages] = useState(true);
  const [colorGrading, setColorGrading] = useState('none');
  const [subtitles, setSubtitles] = useState(false);
  const [output, setOutput] = useState('youtube-1080p');
  const [aspectRatio, setAspectRatio] = useState('landscape');
  const [checkpoints, setCheckpoints] = useState<number[]>([3, 4, 6, 9]);

  useEffect(() => {
    api.channels.getAll().then(setChannels).catch(() => {});
    api.voices.getAll().then((v: any[]) => {
      setVOICES(v);
      if (v.length > 0 && !v.find((x: any) => x.voiceId === voice)) {
        setVoice(v[0].voiceId);
      }
    }).catch(() => {});
    // Initialize enabledSteps from default style
    applyStyleDefaults('ai');
  }, []);

  const applyStyleDefaults = (mainStyleId: string) => {
    const defaults = STYLE_STEP_DEFAULTS[mainStyleId];
    if (defaults) {
      const enabled = Object.entries(defaults)
        .filter(([_, v]) => v === true)
        .map(([k]) => Number(k));
      setEnabledSteps(enabled);
    }
  };

  const selectedVoice = VOICES.find((v) => v.voiceId === voice);
  const selectedColorGrade = COLOR_GRADES.find((c) => c.id === colorGrading);
  const selectedOutput = OUTPUT_FORMATS.find((o) => o.id === output);

  const getSelectedStyle = () => {
    for (const style of VIDEO_STYLES) {
      if (style.id === visualStyle) return style;
      if (style.subStyles) {
        const subStyle = style.subStyles.find((s) => s.id === visualStyle);
        if (subStyle) return subStyle;
      }
    }
    return null;
  };

  const selectedStyle = getSelectedStyle();
  const getStyleCategory = () => {
    const style = VIDEO_STYLES.find(s => s.id === visualStyle || s.id === visualStyleParent);
    return style?.category || 'real';
  };
  const styleCategory = getStyleCategory();
  const isAIStyle = styleCategory === 'ai' || styleCategory === 'spokesperson';

  // Get the main style id for step defaults lookup
  const getMainStyleId = (): string => {
    if (visualStyleParent) return visualStyleParent;
    return visualStyle;
  };

  useEffect(() => {
    if (selectedStyle) {
      if ('defaultColorGrade' in selectedStyle && selectedStyle.defaultColorGrade) {
        setColorGrading(selectedStyle.defaultColorGrade);
      }
      if ('allowsRealImages' in selectedStyle && selectedStyle.allowsRealImages === false) {
        setStockImages(false);
      }
    }
  }, [visualStyle]);

  const handleStyleChange = (styleId: string, parentId: string | null) => {
    setVisualStyle(styleId);
    setVisualStyleParent(parentId);
    // Apply step defaults for the main style
    const mainId = parentId || styleId;
    applyStyleDefaults(mainId);
  };

  const toggleStep = (stepNumber: number) => {
    setEnabledSteps(prev =>
      prev.includes(stepNumber)
        ? prev.filter(s => s !== stepNumber)
        : [...prev, stepNumber].sort((a, b) => a - b)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !title) { alert('Naam en Titel zijn verplicht'); return; }

    const project = await addProject({
      name, title, description: description || undefined, language, scriptSource,
      referenceVideos: scriptSource === 'new' ? referenceVideos.filter((v) => v) : undefined,
      scriptLength: scriptSource === 'new' ? scriptLength : undefined,
      scriptUrl: scriptSource === 'existing' ? scriptUrl : undefined,
      voice: `${selectedVoice?.name} — ${selectedVoice?.description}`,
      backgroundMusic, visualStyle, visualStyleParent, customVisualStyle: customVisualStyle || undefined,
      imageSelectionMode: isAIStyle ? imageSelectionMode : 'auto',
      imagesPerScene: isAIStyle && imageSelectionMode === 'manual' ? imagesPerScene : 1,
      selectedImages: [], transitionMode,
      uniformTransition: transitionMode === 'uniform' ? uniformTransition : null,
      sceneTransitions: [], useClips, referenceClips,
      montageClips: isAIStyle ? [] : montageClips, stockImages, checkpoints, feedbackHistory: [],
      colorGrading: (selectedColorGrade?.name || 'Geen') as any,
      subtitles, output: (selectedOutput?.name || 'YouTube 1080p') as any,
      aspectRatio, enabledSteps, channelId: channelId || undefined,
    });
    navigate(`/project/${project.id}`);
  };

  const isStockImagesDisabled = !!(selectedStyle && 'allowsRealImages' in selectedStyle && selectedStyle.allowsRealImages === false);

  // Step defaults for current style
  const currentDefaults = STYLE_STEP_DEFAULTS[getMainStyleId()] || {};
  const enabledCount = enabledSteps.length;
  const totalCount = 25;

  return (
    <div className="p-8 max-w-5xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Nieuw Project</h1>
        <p className="text-sm text-zinc-500 mt-1">Configureer alle instellingen voor je video</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Algemeen */}
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
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="input-base resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Taal</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value as Language)} className="input-base">
                <option value="EN">EN</option>
                <option value="NL">NL</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Kanaal</label>
              <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="input-base">
                <option value="">Geen kanaal</option>
                {channels.map((ch) => (<option key={ch.id} value={ch.id}>{ch.name}</option>))}
              </select>
            </div>
          </div>
        </section>

        {/* Script */}
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
                <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Script Lengte</label>
                <input type="number" value={scriptLength} onChange={(e) => setScriptLength(Number(e.target.value))} placeholder="Bijv. 5000" className="input-base" />
                <p className="text-[11px] text-zinc-600 mt-1">Aantal woorden</p>
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

        {/* Voice */}
        <section className="section-card">
          <h2 className="section-title">Voice</h2>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Voice</label>
            <select value={voice} onChange={(e) => setVoice(e.target.value)} className="input-base">
              {VOICES.map((v) => (
                <option key={v.voiceId} value={v.voiceId}>{v.name} — {v.description} ({v.language})</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={backgroundMusic} onChange={(e) => setBackgroundMusic(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-600 bg-surface-200 text-brand-600 focus:ring-2 focus:ring-brand-500/40 focus:ring-offset-0 cursor-pointer" />
            <span className="text-sm">Achtergrondmuziek</span>
          </label>
        </section>

        {/* Visuele Stijl */}
        <section className="section-card">
          <h2 className="section-title">Visuele Stijl</h2>
          <StylePicker selectedStyle={visualStyle} selectedParent={visualStyleParent} onStyleChange={handleStyleChange} onCustomStyleChange={setCustomVisualStyle} customStyle={customVisualStyle} />
        </section>

        {/* Pipeline Stappen */}
        <section className="section-card">
          <div className="flex items-center justify-between mb-1">
            <h2 className="section-title !mb-0">Pipeline Stappen</h2>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-zinc-500 font-mono">{enabledCount}/{totalCount} actief</span>
              <button type="button" onClick={() => setShowStepToggles(!showStepToggles)}
                className="text-xs text-brand-400 hover:text-brand-300 font-medium">
                {showStepToggles ? 'Verbergen' : 'Aanpassen'}
              </button>
            </div>
          </div>
          <p className="text-xs text-zinc-600 mb-3">
            Stappen worden automatisch ingesteld op basis van je gekozen stijl. Je kunt ze handmatig aan/uit zetten.
          </p>

          {/* Compact overview */}
          {!showStepToggles && (
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 25 }, (_, i) => i).map((stepNum) => {
                const step = STEP_DEFS[stepNum];
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

          {/* Full toggle list */}
          {showStepToggles && (
            <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
              {Array.from({ length: 25 }, (_, i) => i).map((stepNum) => {
                const step = STEP_DEFS[stepNum];
                const isEnabled = enabledSteps.includes(stepNum);
                const isDefault = currentDefaults[stepNum] === true;
                const isOverridden = isEnabled !== isDefault;

                return (
                  <div key={stepNum} className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all ${
                    isEnabled
                      ? 'bg-white/[0.02] border-white/[0.06]'
                      : 'bg-surface-100 border-white/[0.03] opacity-60'
                  }`}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-sm">{step.icon}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-zinc-600 font-mono w-5">{stepNum}</span>
                          <span className="text-xs font-medium truncate">{step.name}</span>
                          {isOverridden && (
                            <span className="text-[9px] px-1 py-0.5 bg-amber-500/15 text-amber-400 rounded border border-amber-500/20">
                              aangepast
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-zinc-600">{step.executor}</span>
                      </div>
                    </div>
                    <button type="button" onClick={() => toggleStep(stepNum)}
                      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
                        isEnabled ? 'bg-brand-500' : 'bg-surface-400'
                      }`}>
                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                        isEnabled ? 'translate-x-4' : ''
                      }`} />
                    </button>
                  </div>
                );
              })}
              <button type="button" onClick={() => applyStyleDefaults(getMainStyleId())}
                className="text-xs text-zinc-500 hover:text-zinc-300 mt-2">
                ↩ Reset naar standaard voor deze stijl
              </button>
            </div>
          )}
        </section>

        {isAIStyle && (
          <ImageSelectionSection mode={imageSelectionMode} imagesPerScene={imagesPerScene} onModeChange={setImageSelectionMode} onImagesPerSceneChange={setImagesPerScene} />
        )}

        {!isAIStyle && (
          <ClipTypesSection useClips={useClips} referenceClips={referenceClips} montageClips={montageClips} onUseClipsChange={setUseClips} onReferenceClipsChange={setReferenceClips} onMontageClipsChange={setMontageClips} isAIStyle={isAIStyle} />
        )}

        <TransitionsSection mode={transitionMode} uniformTransition={uniformTransition} onModeChange={setTransitionMode} onUniformTransitionChange={setUniformTransition} />

        {/* Features */}
        <section className="section-card">
          <h2 className="section-title">Features</h2>
          {!isAIStyle && (
            <label className={`flex items-center gap-2.5 ${isStockImagesDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
              <input type="checkbox" checked={stockImages} onChange={(e) => setStockImages(e.target.checked)} disabled={isStockImagesDisabled}
                className="w-4 h-4 rounded border-zinc-600 bg-surface-200 text-brand-600 focus:ring-2 focus:ring-brand-500/40 focus:ring-offset-0 cursor-pointer disabled:opacity-50" />
              <span className="text-sm">Stock afbeeldingen gebruiken</span>
              {isStockImagesDisabled && <span className="text-[11px] text-zinc-600">(Niet beschikbaar voor deze stijl)</span>}
            </label>
          )}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Color Grading</label>
            <select value={colorGrading} onChange={(e) => setColorGrading(e.target.value)} className="input-base">
              {COLOR_GRADES.map((grade) => (<option key={grade.id} value={grade.id}>{grade.name} — {grade.description}</option>))}
            </select>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={subtitles} onChange={(e) => setSubtitles(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-600 bg-surface-200 text-brand-600 focus:ring-2 focus:ring-brand-500/40 focus:ring-offset-0 cursor-pointer" />
            <span className="text-sm">Subtitles</span>
          </label>
        </section>

        <CheckpointsSection checkpoints={checkpoints} onChange={setCheckpoints} />

        {/* Output */}
        <section className="section-card">
          <h2 className="section-title">Output</h2>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Format</label>
            <select value={output} onChange={(e) => setOutput(e.target.value)} className="input-base">
              {OUTPUT_FORMATS.map((format) => (<option key={format.id} value={format.id}>{format.name} — {format.resolution} ({format.aspectRatio})</option>))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Aspect Ratio (Video Generatie)</label>
            <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="input-base">
              <option value="landscape">Landscape (16:9)</option>
              <option value="portrait">Portrait (9:16)</option>
            </select>
          </div>
        </section>

        <button type="submit" className="btn-primary w-full py-3.5 text-sm">
          Project Aanmaken
        </button>
      </form>
    </div>
  );
}
