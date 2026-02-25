import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { Language, ScriptSource, MontageClip } from '../types';
import { VOICES } from '../data/voices';
import { COLOR_GRADES } from '../data/color-grades';
import { OUTPUT_FORMATS } from '../data/output-formats';
import { VIDEO_STYLES } from '../data/styles';
import StylePicker from '../components/StylePicker';
import CheckpointsSection from '../components/CheckpointsSection';
import ClipTypesSection from '../components/ClipTypesSection';
import ImageSelectionSection from '../components/ImageSelectionSection';
import TransitionsSection from '../components/TransitionsSection';

export default function NewProject() {
  const navigate = useNavigate();
  const addProject = useStore((state) => state.addProject);

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
  const [imagesPerScene, setImagesPerScene] = useState<1 | 2 | 3 | 4>(1);
  const [transitionMode, setTransitionMode] = useState<'none' | 'uniform' | 'per-scene'>('uniform');
  const [uniformTransition, setUniformTransition] = useState<string | null>('cross-dissolve');
  const [useClips, setUseClips] = useState(false);
  const [referenceClips, setReferenceClips] = useState<string[]>([]);
  const [montageClips, setMontageClips] = useState<MontageClip[]>([]);
  const [stockImages, setStockImages] = useState(true);
  const [colorGrading, setColorGrading] = useState('cinematic_dark');
  const [subtitles, setSubtitles] = useState(true);
  const [output, setOutput] = useState('youtube-1080p');
  const [checkpoints, setCheckpoints] = useState<number[]>([3, 4, 6, 9]);

  const selectedVoice = VOICES.find((v) => v.id === voice);
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
  const isAIStyle = visualStyleParent === 'ai';

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
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !title) {
      alert('Naam en Titel zijn verplicht');
      return;
    }

    const project = await addProject({
      name,
      title,
      description: description || undefined,
      language,
      scriptSource,
      referenceVideos: scriptSource === 'new' ? referenceVideos.filter((v) => v) : undefined,
      scriptLength: scriptSource === 'new' ? scriptLength : undefined,
      scriptUrl: scriptSource === 'existing' ? scriptUrl : undefined,
      voice: `${selectedVoice?.name} — ${selectedVoice?.description}`,
      backgroundMusic,
      visualStyle,
      visualStyleParent,
      customVisualStyle: customVisualStyle || undefined,
      imageSelectionMode: isAIStyle ? imageSelectionMode : 'auto',
      imagesPerScene: isAIStyle && imageSelectionMode === 'manual' ? imagesPerScene : 1,
      selectedImages: [],
      transitionMode,
      uniformTransition: transitionMode === 'uniform' ? uniformTransition : null,
      sceneTransitions: [],
      useClips,
      referenceClips,
      montageClips: isAIStyle ? [] : montageClips,
      stockImages,
      checkpoints,
      feedbackHistory: [],
      colorGrading: (selectedColorGrade?.name || 'Geen') as any,
      subtitles,
      output: (selectedOutput?.name || 'YouTube 1080p') as any,
    });

    navigate(`/project/${project.id}`);
  };

  const isStockImagesDisabled = !!(selectedStyle && 'allowsRealImages' in selectedStyle && selectedStyle.allowsRealImages === false);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Nieuw Project</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="bg-zinc-800 rounded-lg p-6 space-y-4">
          <h2 className="text-xl font-semibold mb-4">Algemeen</h2>

          <div>
            <label className="block text-sm font-medium mb-2">
              Project Naam <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Titel <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Beschrijving</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Taal</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="EN">EN</option>
              <option value="NL">NL</option>
            </select>
          </div>
        </section>

        <section className="bg-zinc-800 rounded-lg p-6 space-y-4">
          <h2 className="text-xl font-semibold mb-4">Script</h2>

          <div>
            <label className="block text-sm font-medium mb-2">Script Bron</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="new"
                  checked={scriptSource === 'new'}
                  onChange={(e) => setScriptSource(e.target.value as ScriptSource)}
                  className="w-4 h-4"
                />
                <span>Nieuw schrijven</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="existing"
                  checked={scriptSource === 'existing'}
                  onChange={(e) => setScriptSource(e.target.value as ScriptSource)}
                  className="w-4 h-4"
                />
                <span>Bestaand script</span>
              </label>
            </div>
          </div>

          {scriptSource === 'new' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2">Referentie Video URLs</label>
                {referenceVideos.map((video, index) => (
                  <input
                    key={index}
                    type="url"
                    value={video}
                    onChange={(e) => {
                      const newVideos = [...referenceVideos];
                      newVideos[index] = e.target.value;
                      setReferenceVideos(newVideos);
                    }}
                    placeholder={`Referentie video ${index + 1}`}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Script Lengte</label>
                <select
                  value={scriptLength}
                  onChange={(e) => setScriptLength(Number(e.target.value))}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value={2000}>2000 woorden</option>
                  <option value={5000}>5000 woorden</option>
                  <option value={8000}>8000 woorden</option>
                  <option value={10000}>10000 woorden</option>
                </select>
              </div>
            </>
          )}

          {scriptSource === 'existing' && (
            <div>
              <label className="block text-sm font-medium mb-2">Script URL</label>
              <input
                type="url"
                value={scriptUrl}
                onChange={(e) => setScriptUrl(e.target.value)}
                placeholder="https://..."
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          )}
        </section>

        <section className="bg-zinc-800 rounded-lg p-6 space-y-4">
          <h2 className="text-xl font-semibold mb-4">Voice</h2>

          <div>
            <label className="block text-sm font-medium mb-2">Voice</label>
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} — {v.description} ({v.language})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={backgroundMusic}
                onChange={(e) => setBackgroundMusic(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-600 focus:ring-2 focus:ring-blue-600 focus:ring-offset-0 cursor-pointer"
              />
              <span>Achtergrondmuziek</span>
            </label>
          </div>
        </section>

        <section className="bg-zinc-800 rounded-lg p-6 space-y-4">
          <h2 className="text-xl font-semibold mb-4">Visuele Stijl</h2>
          <StylePicker
            selectedStyle={visualStyle}
            selectedParent={visualStyleParent}
            onStyleChange={handleStyleChange}
            onCustomStyleChange={setCustomVisualStyle}
            customStyle={customVisualStyle}
          />
        </section>

        {isAIStyle && (
          <ImageSelectionSection
            mode={imageSelectionMode}
            imagesPerScene={imagesPerScene}
            onModeChange={setImageSelectionMode}
            onImagesPerSceneChange={setImagesPerScene}
          />
        )}

        <ClipTypesSection
          useClips={useClips}
          referenceClips={referenceClips}
          montageClips={montageClips}
          onUseClipsChange={setUseClips}
          onReferenceClipsChange={setReferenceClips}
          onMontageClipsChange={setMontageClips}
          isAIStyle={isAIStyle}
        />

        <TransitionsSection
          mode={transitionMode}
          uniformTransition={uniformTransition}
          onModeChange={setTransitionMode}
          onUniformTransitionChange={setUniformTransition}
        />

        <section className="bg-zinc-800 rounded-lg p-6 space-y-4">
          <h2 className="text-xl font-semibold mb-4">Features</h2>

          <div>
            <label className={`flex items-center gap-2 ${isStockImagesDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                checked={stockImages}
                onChange={(e) => setStockImages(e.target.checked)}
                disabled={isStockImagesDisabled}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-600 focus:ring-2 focus:ring-blue-600 focus:ring-offset-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              />
              <span>Stock afbeeldingen gebruiken</span>
              {isStockImagesDisabled && (
                <span className="text-xs text-zinc-500">(Niet beschikbaar voor deze stijl)</span>
              )}
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Color Grading</label>
            <select
              value={colorGrading}
              onChange={(e) => setColorGrading(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {COLOR_GRADES.map((grade) => (
                <option key={grade.id} value={grade.id}>
                  {grade.name} — {grade.description}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={subtitles}
                onChange={(e) => setSubtitles(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-600 focus:ring-2 focus:ring-blue-600 focus:ring-offset-0 cursor-pointer"
              />
              <span>Subtitles</span>
            </label>
          </div>
        </section>

        <CheckpointsSection checkpoints={checkpoints} onChange={setCheckpoints} />

        <section className="bg-zinc-800 rounded-lg p-6 space-y-4">
          <h2 className="text-xl font-semibold mb-4">Output</h2>

          <div>
            <label className="block text-sm font-medium mb-2">Format</label>
            <select
              value={output}
              onChange={(e) => setOutput(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {OUTPUT_FORMATS.map((format) => (
                <option key={format.id} value={format.id}>
                  {format.name} — {format.resolution} ({format.aspectRatio})
                </option>
              ))}
            </select>
          </div>
        </section>

        <button
          type="submit"
          className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded-lg font-semibold transition-colors"
        >
          Project Aanmaken
        </button>
      </form>
    </div>
  );
}
