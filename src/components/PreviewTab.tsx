import { useState } from 'react';
import { Copy, Play, Pause, Download, Volume2, X, Grid3x3, List } from 'lucide-react';
import { Project } from '../types';

interface PreviewTabProps {
  project: Project;
}

export default function PreviewTab({ project }: PreviewTabProps) {
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [sceneViewMode, setSceneViewMode] = useState<'grid' | 'list'>('grid');

  // Step numbers mapping (new pipeline)
  const STEP = {
    SCRIPT: 6,
    VOICEOVER: 7,
    TIMESTAMPS: 9,
    SCENE_PROMPTS: 10,
    ASSETS: 11,
    CLIPS: 12,
    IMAGES: 13,
    VIDEO_SCENES: 14,
    ORCHESTRATOR: 15,
    COLOR_GRADING: 17,
    SUBTITLES: 18,
    VIDEO_FX: 21,
    FINAL_EXPORT: 22,
    DRIVE_UPLOAD: 24,
  };

  const getStep = (stepNumber: number) => project.steps.find(s => s.id === stepNumber);
  const isStepCompleted = (stepNumber: number) => getStep(stepNumber)?.status === 'completed';
  const isStepRunning = (stepNumber: number) => getStep(stepNumber)?.status === 'running';

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Get real script from step result
  const scriptStep = getStep(STEP.SCRIPT);
  const scriptText = scriptStep?.result?.script || scriptStep?.result?.text || scriptStep?.result || '';
  const scriptString = typeof scriptText === 'string' ? scriptText : JSON.stringify(scriptText);
  const wordCount = scriptString ? scriptString.split(/\s+/).filter(Boolean).length : 0;
  const previewText = scriptString ? (scriptString.length > 400 ? scriptString.slice(0, 400) + '...' : scriptString) : '';

  // Get voice info from project
  const voiceStep = getStep(STEP.VOICEOVER);
  const voiceDuration = voiceStep?.metadata?.estimatedDuration || voiceStep?.duration || 0;
  const voiceFileSize = voiceStep?.metadata?.fileSize || 0;

  // Get scene data from step results
  const scenePromptsStep = getStep(STEP.SCENE_PROMPTS);
  const videoScenesStep = getStep(STEP.VIDEO_SCENES);
  const scenes: Array<{ id: number; prompt: string; duration: number; status: string }> = [];

  if (scenePromptsStep?.result) {
    const promptsData = Array.isArray(scenePromptsStep.result) ? scenePromptsStep.result : scenePromptsStep.result?.scenes || [];
    promptsData.forEach((scene: any, i: number) => {
      scenes.push({
        id: i + 1,
        prompt: scene.prompt || scene.description || scene.text || (typeof scene === 'string' ? scene : `Scene ${i + 1}`),
        duration: scene.duration || 5,
        status: isStepCompleted(STEP.VIDEO_SCENES) ? 'completed' : isStepRunning(STEP.VIDEO_SCENES) ? 'running' : 'waiting',
      });
    });
  }

  // Export info
  const exportStep = getStep(STEP.FINAL_EXPORT);

  const toggleAudioPlay = () => {
    setIsAudioPlaying(!isAudioPlaying);
    if (!isAudioPlaying) {
      const interval = setInterval(() => {
        setAudioProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            setIsAudioPlaying(false);
            return 0;
          }
          return prev + 0.5;
        });
      }, 100);
    }
  };

  const getSceneStatusIcon = (status: string) => {
    if (status === 'completed') return '✅';
    if (status === 'running') return '⏳';
    if (status === 'failed') return '❌';
    return '⬜';
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-5">
      {/* Script card */}
      <div className="glass rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              📝 Script
            </h3>
            {isStepCompleted(STEP.SCRIPT) && (
              <div className="flex gap-2">
                <span className="text-[11px] px-2 py-0.5 bg-brand-500/15 text-brand-300 rounded-md border border-brand-500/20">
                  {wordCount} woorden
                </span>
                <span className="text-[11px] px-2 py-0.5 bg-surface-200 text-zinc-400 rounded-md border border-white/[0.04]">
                  {project.language}
                </span>
              </div>
            )}
          </div>
          {isStepCompleted(STEP.SCRIPT) && (
            <button
              onClick={() => handleCopy(scriptString)}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              <Copy className="w-3.5 h-3.5" /> Kopieer
            </button>
          )}
        </div>

        {isStepCompleted(STEP.SCRIPT) && scriptString ? (
          <>
            <div className="bg-surface-100 rounded-lg p-4 text-sm text-zinc-300 leading-relaxed mb-3 max-h-40 overflow-y-auto border border-white/[0.04]">
              {previewText}
            </div>
            {scriptString.length > 400 && (
              <button
                onClick={() => setShowScriptModal(true)}
                className="text-brand-400 hover:text-brand-300 text-xs font-medium"
              >
                Volledig script bekijken →
              </button>
            )}
          </>
        ) : (
          <p className="text-zinc-600 text-sm">
            Script wordt gegenereerd in stap {STEP.SCRIPT}...
          </p>
        )}
      </div>

      {/* Voiceover card */}
      <div className="glass rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          🎙️ Voiceover
        </h3>

        {isStepCompleted(STEP.VOICEOVER) ? (
          <>
            <div className="bg-surface-100 rounded-lg p-4 mb-3 border border-white/[0.04]">
              <div className="flex items-center gap-4">
                <button
                  onClick={toggleAudioPlay}
                  className="w-12 h-12 bg-gradient-to-br from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 rounded-full flex items-center justify-center transition-all flex-shrink-0 shadow-glow-blue"
                >
                  {isAudioPlaying ? (
                    <Pause className="w-5 h-5" />
                  ) : (
                    <Play className="w-5 h-5 ml-0.5" />
                  )}
                </button>
                <div className="flex-1">
                  <div
                    className="w-full bg-surface-300 rounded-full h-1.5 mb-2 cursor-pointer"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      setAudioProgress((x / rect.width) * 100);
                    }}
                  >
                    <div className="bg-brand-500 h-1.5 rounded-full transition-all" style={{ width: `${audioProgress}%` }} />
                  </div>
                  <div className="flex justify-between text-[11px] text-zinc-500">
                    <span>{formatDuration((audioProgress / 100) * voiceDuration)}</span>
                    <span className="font-mono">{formatDuration(voiceDuration)}</span>
                  </div>
                </div>
                <Volume2 className="w-4 h-4 text-zinc-500" />
              </div>
            </div>
            <div className="flex gap-2.5">
              <div className="flex-1 bg-surface-100 rounded-lg p-2.5 border border-white/[0.04]">
                <p className="text-[10px] text-zinc-600 mb-0.5">Voice</p>
                <p className="text-xs font-medium text-zinc-300">{project.voice}</p>
              </div>
              <div className="flex-1 bg-surface-100 rounded-lg p-2.5 border border-white/[0.04]">
                <p className="text-[10px] text-zinc-600 mb-0.5">Duur</p>
                <p className="text-xs font-medium text-zinc-300">{formatDuration(voiceDuration)}</p>
              </div>
              {voiceFileSize > 0 && (
                <div className="flex-1 bg-surface-100 rounded-lg p-2.5 border border-white/[0.04]">
                  <p className="text-[10px] text-zinc-600 mb-0.5">Grootte</p>
                  <p className="text-xs font-medium text-zinc-300">{(voiceFileSize / 1024 / 1024).toFixed(1)} MB</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="text-zinc-600 text-sm">
            Voiceover wordt gegenereerd in stap {STEP.VOICEOVER}...
          </p>
        )}
      </div>

      {/* Video Scenes card */}
      <div className="glass rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            🎬 Video Scenes {scenes.length > 0 && `(${scenes.length} scenes)`}
          </h3>
          {scenes.length > 0 && (
            <div className="flex gap-1.5">
              <button
                onClick={() => setSceneViewMode('grid')}
                className={`p-1.5 rounded-lg transition-colors ${
                  sceneViewMode === 'grid' ? 'bg-brand-500/20 text-brand-300' : 'bg-surface-200 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Grid3x3 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setSceneViewMode('list')}
                className={`p-1.5 rounded-lg transition-colors ${
                  sceneViewMode === 'list' ? 'bg-brand-500/20 text-brand-300' : 'bg-surface-200 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {scenes.length > 0 ? (
          sceneViewMode === 'grid' ? (
            <div className="grid grid-cols-4 gap-2.5">
              {scenes.map((scene) => (
                <div
                  key={scene.id}
                  className="aspect-video bg-surface-100 rounded-lg border border-white/[0.06] relative group hover:border-white/[0.12] transition-colors cursor-pointer"
                  title={scene.prompt}
                >
                  <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-black/60 rounded text-[10px] font-medium">
                    {scene.id}
                  </div>
                  <div className="absolute top-1.5 right-1.5 text-sm">
                    {getSceneStatusIcon(scene.status)}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent rounded-b-lg">
                    <p className="text-[10px] text-zinc-300 truncate">{scene.prompt}</p>
                    <span className="text-[10px] text-zinc-500">{scene.duration}s</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-surface-100 rounded-lg border border-white/[0.04] overflow-hidden">
              <table className="w-full">
                <thead className="bg-surface-200 border-b border-white/[0.04]">
                  <tr>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold text-zinc-500 w-12">#</th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold text-zinc-500">Prompt</th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold text-zinc-500 w-16">Duur</th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold text-zinc-500 w-16">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {scenes.map((scene) => (
                    <tr key={scene.id} className="hover:bg-white/[0.02]">
                      <td className="px-3 py-2 text-xs text-zinc-500">{scene.id}</td>
                      <td className="px-3 py-2 text-xs text-zinc-300 truncate max-w-md">{scene.prompt}</td>
                      <td className="px-3 py-2 text-xs text-zinc-500">{scene.duration}s</td>
                      <td className="px-3 py-2 text-sm">{getSceneStatusIcon(scene.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : isStepCompleted(STEP.SCENE_PROMPTS) ? (
          <p className="text-zinc-600 text-sm">Geen scene data beschikbaar.</p>
        ) : (
          <p className="text-zinc-600 text-sm">
            Video scenes worden gegenereerd in stap {STEP.VIDEO_SCENES}...
          </p>
        )}
      </div>

      {/* Final Video card */}
      <div className="glass rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          🎥 Final Video
        </h3>

        {isStepCompleted(STEP.FINAL_EXPORT) ? (
          <div>
            <div className="aspect-video bg-surface-100 rounded-lg flex items-center justify-center border border-white/[0.06] mb-3">
              <button className="w-16 h-16 bg-gradient-to-br from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 rounded-full flex items-center justify-center transition-all shadow-glow-blue">
                <Play className="w-8 h-8 ml-1" />
              </button>
            </div>
            <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600/90 hover:bg-emerald-500 rounded-xl font-semibold text-sm transition-colors mb-3">
              <Download className="w-4 h-4" /> Download Final Video
            </button>
            <div className="flex gap-2.5">
              <div className="flex-1 bg-surface-100 rounded-lg p-2.5 border border-white/[0.04]">
                <p className="text-[10px] text-zinc-600 mb-0.5">Formaat</p>
                <p className="text-xs font-medium text-zinc-300">{project.output}</p>
              </div>
              <div className="flex-1 bg-surface-100 rounded-lg p-2.5 border border-white/[0.04]">
                <p className="text-[10px] text-zinc-600 mb-0.5">Aspect Ratio</p>
                <p className="text-xs font-medium text-zinc-300">{project.aspectRatio || 'landscape'}</p>
              </div>
              {exportStep?.metadata?.fileSize && (
                <div className="flex-1 bg-surface-100 rounded-lg p-2.5 border border-white/[0.04]">
                  <p className="text-[10px] text-zinc-600 mb-0.5">Grootte</p>
                  <p className="text-xs font-medium text-zinc-300">{(exportStep.metadata.fileSize / 1024 / 1024).toFixed(0)} MB</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-zinc-600 text-sm">
            Final video wordt geëxporteerd in stap {STEP.FINAL_EXPORT}...
          </p>
        )}
      </div>

      {/* Script modal */}
      {showScriptModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-8 animate-fade-in">
          <div className="glass-strong rounded-2xl max-w-4xl w-full max-h-[80vh] flex flex-col animate-scale-in">
            <div className="flex items-center justify-between p-6 border-b border-white/[0.06]">
              <h3 className="text-lg font-semibold">Volledig Script</h3>
              <button onClick={() => setShowScriptModal(false)} className="btn-icon">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="text-zinc-300 text-sm leading-relaxed whitespace-pre-line">
                {scriptString}
              </div>
            </div>
            <div className="p-6 border-t border-white/[0.06] flex justify-end gap-3">
              <button onClick={() => handleCopy(scriptString)} className="btn-secondary text-sm">
                <Copy className="w-3.5 h-3.5" /> Kopieer
              </button>
              <button onClick={() => setShowScriptModal(false)} className="btn-primary text-sm">
                Sluiten
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
