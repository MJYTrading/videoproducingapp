import { useState, useEffect } from 'react';
import { CheckCircle, Send } from 'lucide-react';
import { Project, Step } from '../types';
import { useStore } from '../store';
import { TRANSITIONS } from '../data/transitions';

interface ReviewPanelProps {
  project: Project;
  step: Step;
}

export default function ReviewPanel({ project, step }: ReviewPanelProps) {
  const [reviewAction, setReviewAction] = useState<'approve' | 'feedback' | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const submitFeedback = useStore((state) => state.submitFeedback);
  const approveStep = useStore((state) => state.approveStep);
  const selectImage = useStore((state) => state.selectImage);
  const confirmImageSelection = useStore((state) => state.confirmImageSelection);
  const setSceneTransition = useStore((state) => state.setSceneTransition);

  const previousFeedback = project.feedbackHistory.filter((f) => f.stepNumber === step.id);

  const isAIStyle = project.visualStyleParent === 'ai';
  const isManualImageSelection = isAIStyle && project.imageSelectionMode === 'manual';
  const isPerSceneTransition = project.transitionMode === 'per-scene';

  const mockScenes = Array.from({ length: 28 }, (_, i) => ({
    id: `scene-${i + 1}`,
    number: i + 1,
    prompt: i === 0
      ? 'A white mannequin standing in a dark alley, rain falling, cinematic lighting'
      : i === 1
      ? 'Two mannequins facing each other in an abandoned warehouse'
      : `Scene ${i + 1} with dramatic 3D rendered mannequins`,
  }));

  useEffect(() => {
    if (step.id === 9 && isManualImageSelection) {
      mockScenes.forEach((scene) => {
        const existing = project.selectedImages.find((s) => s.sceneId === scene.id);
        if (!existing) {
          selectImage(project.id, scene.id, 1);
        }
      });
    }
  }, [step.id]);

  const handleSelectAllFirst = () => {
    mockScenes.forEach((scene) => {
      selectImage(project.id, scene.id, 1);
    });
  };

  const canConfirmImages = project.selectedImages.length === mockScenes.length;

  const handleSubmit = () => {
    if (reviewAction === 'approve') {
      approveStep(project.id, step.id);
    } else if (reviewAction === 'feedback' && feedbackText.trim()) {
      submitFeedback(project.id, step.id, feedbackText);
      setFeedbackText('');
      setReviewAction(null);
    }
  };

  const renderPreview = () => {
    const metadata = step.metadata || {};

    switch (step.id) {
      case 2:
        return (
          <div className="space-y-2">
            <p className="text-zinc-400 text-sm mb-3">Style Profile</p>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm">Tone: Dramatic</span>
              <span className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full text-sm">POV: First Person</span>
              <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm">Pacing: Fast</span>
              <span className="px-3 py-1 bg-orange-500/20 text-orange-400 rounded-full text-sm">Narration: Active</span>
            </div>
          </div>
        );
      case 3: {
        const scriptResult = step.result || {};
        const scriptText = scriptResult.script || "";
        const wordCount = scriptResult.wordCount || scriptText.split(/\s+/).length || 0;
        const estimatedMin = Math.round(wordCount / 150);
        const previewText = scriptText.slice(0, 1500) || "Script wordt geladen...";
        const targetWords = project.scriptLength || 5000;
        return (
          <div className="space-y-3">
            <div className="text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto bg-zinc-800 rounded-lg p-4 text-sm">
              {previewText}
              {scriptText.length > 1500 && (
                <p className="text-zinc-500 italic mt-2">... [preview van eerste ~300 woorden]</p>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-zinc-400">📊 {wordCount.toLocaleString()} woorden</span>
              <span className="text-zinc-400">🎯 Target: {targetWords.toLocaleString()}</span>
              <span className="text-zinc-400">🎙️ ~{estimatedMin} min VO</span>
              <span className="text-zinc-400">🌐 {project.language}</span>
            </div>
          </div>
        );
      }

      case 4:
        const duration = metadata.estimatedDuration || 765;
        const fileSize = metadata.fileSize || 18.4;
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        return (
          <div className="space-y-3">
            <div className="bg-zinc-800 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <button className="w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center transition-colors">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                  </svg>
                </button>
                <div className="flex-1">
                  <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 w-0" />
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">0:00 / {minutes}:{seconds.toString().padStart(2, '0')}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-zinc-400">
                <span>Voice: {project.voice}</span>
                <span>🎙️ {minutes}:{seconds.toString().padStart(2, '0')}</span>
                <span>📦 {fileSize.toFixed(1)} MB</span>
              </div>
            </div>
          </div>
        );

      case 6:
        return (
          <div className="space-y-3">
            <p className="text-zinc-400 text-sm mb-2">Scene Prompts (eerste 5 van 28)</p>
            <div className="space-y-2">
              {[
                'Wide shot of Silicon Valley office building at dawn, cinematic lighting',
                'Close-up of engineer typing on keyboard, blue screen glow on face',
                'Dramatic reveal of AI model training visualization on monitors',
                'Team gathered around table with laptop, excited expressions',
                'Overhead shot of sprawling tech campus, golden hour'
              ].map((prompt, i) => (
                <div key={i} className="bg-zinc-800 rounded p-2 text-sm">
                  <span className="text-zinc-500 mr-2">#{i + 1}</span>
                  <span className="text-zinc-300">{prompt}</span>
                </div>
              ))}
            </div>
            <button className="text-blue-400 hover:text-blue-300 text-sm">
              Alle 28 prompts bekijken →
            </button>
          </div>
        );

      case 9:
        if (isManualImageSelection) {
          return (
            <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
              <div className="flex items-center justify-between sticky top-0 bg-zinc-900 py-2 z-10">
                <h4 className="font-medium text-violet-300">🖼️ Kies de beste afbeelding per scene</h4>
                <button
                  onClick={handleSelectAllFirst}
                  className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-sm transition-colors"
                >
                  Alle automatisch kiezen (optie 1)
                </button>
              </div>

              {mockScenes.map((scene, sceneIndex) => {
                const selectedOption = project.selectedImages.find((s) => s.sceneId === scene.id)?.chosenOption || 1;
                const transition = project.sceneTransitions.find((t) => t.sceneId === scene.id)?.transition || 'cross-dissolve';
                const isLastScene = sceneIndex === mockScenes.length - 1;

                return (
                  <div key={scene.id} className="space-y-2 pb-4 border-b border-zinc-800">
                    <p className="text-sm text-zinc-300 font-medium">
                      Scene {scene.number}: <span className="text-zinc-400 font-normal">{scene.prompt}</span>
                    </p>

                    <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${project.imagesPerScene}, minmax(0, 1fr))` }}>
                      {Array.from({ length: project.imagesPerScene }).map((_, optionIndex) => {
                        const optionNumber = optionIndex + 1;
                        const isSelected = selectedOption === optionNumber;
                        const bgColor = ['from-blue-500/15 to-blue-600/20', 'from-purple-500/15 to-purple-600/20', 'from-green-500/15 to-green-600/20', 'from-orange-500/15 to-orange-600/20'][optionIndex];

                        return (
                          <button
                            key={optionNumber}
                            onClick={() => selectImage(project.id, scene.id, optionNumber)}
                            className={`aspect-video rounded-lg border-2 transition-all relative overflow-hidden ${
                              isSelected ? 'border-blue-500' : 'border-zinc-700 hover:border-zinc-600'
                            }`}
                          >
                            <div className={`absolute inset-0 bg-gradient-to-br ${bgColor}`} />
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <p className="text-xs text-zinc-400 mb-1">Optie {optionNumber}</p>
                              {isSelected && (
                                <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                                  <CheckCircle className="w-4 h-4 text-white" />
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {isPerSceneTransition && !isLastScene && (
                      <div className="flex items-center gap-2 mt-2 ml-2">
                        <label className="text-xs text-zinc-400">Transitie naar scene {scene.number + 1}:</label>
                        <select
                          value={transition}
                          onChange={(e) => setSceneTransition(project.id, scene.id, e.target.value)}
                          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                        >
                          {TRANSITIONS.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.icon} {t.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="sticky bottom-0 bg-zinc-900 pt-3 flex items-center justify-between border-t border-zinc-800">
                <p className="text-sm text-zinc-400">
                  Geselecteerd: {project.selectedImages.length}/{mockScenes.length} scenes
                </p>
                <button
                  onClick={() => confirmImageSelection(project.id)}
                  disabled={!canConfirmImages}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                    canConfirmImages
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                  }`}
                >
                  <CheckCircle className="w-4 h-4" />
                  Bevestig & start video
                </button>
              </div>
            </div>
          );
        }

        const sceneCount = metadata.sceneCount || 28;
        return (
          <div className="space-y-3">
            <p className="text-zinc-400 text-sm mb-2">Video Scenes: {sceneCount} scenes gegenereerd</p>
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-video bg-zinc-800 rounded-lg flex items-center justify-center relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-purple-500/20" />
                  <div className="relative z-10">
                    <p className="text-xs text-zinc-400">Scene {i + 1}</p>
                    <p className="text-green-400 text-xs">✓</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-sm text-zinc-400">{sceneCount}/28 scenes klaar</p>
          </div>
        );

      default:
        return (
          <p className="text-zinc-400">Preview voor stap {step.id}: {step.name}</p>
        );
    }
  };

  return (
    <div className="bg-violet-500/10 border-2 border-violet-500/50 rounded-lg p-6 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-3xl">👁️</span>
        <div>
          <h3 className="text-xl font-semibold text-violet-400">
            Stap {step.id}: {step.name} — WACHT OP REVIEW
          </h3>
          {previousFeedback.length > 0 && (
            <p className="text-sm text-violet-300">Poging {step.attemptNumber || 1}</p>
          )}
        </div>
      </div>

      <div className="bg-zinc-900 rounded-lg p-4 mb-4 border border-zinc-800">
        <h4 className="font-semibold mb-3 flex items-center gap-2">
          📝 Preview
        </h4>
        {renderPreview()}
      </div>

      {previousFeedback.length > 0 && (
        <div className="bg-zinc-900 rounded-lg p-4 mb-4 border border-zinc-800">
          <h4 className="font-semibold mb-3">📋 Feedback geschiedenis</h4>
          <div className="space-y-3">
            {previousFeedback.map((fb, idx) => (
              <div key={idx} className="border-l-2 border-zinc-700 pl-3">
                <p className="text-xs text-zinc-500 mb-1">Poging {fb.attempt}</p>
                <p className="text-sm text-zinc-400 italic">"{fb.feedback}"</p>
                {idx < previousFeedback.length - 1 && (
                  <p className="text-xs text-zinc-500 mt-1">↓ opnieuw gegenereerd</p>
                )}
              </div>
            ))}
            {step.attemptNumber && (
              <div className="border-l-2 border-violet-500 pl-3">
                <p className="text-xs text-violet-400 mb-1">Poging {step.attemptNumber} (huidige)</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
        <h4 className="font-semibold mb-3">Wat wil je doen?</h4>

        <div className="space-y-3 mb-4">
          <label className="flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors hover:bg-zinc-800/50"
            style={{ borderColor: reviewAction === 'approve' ? 'rgb(34 197 94)' : 'rgb(39 39 42)' }}>
            <input
              type="radio"
              name="reviewAction"
              checked={reviewAction === 'approve'}
              onChange={() => setReviewAction('approve')}
              className="mt-1"
            />
            <div>
              <div className="font-medium flex items-center gap-2">
                <span>✅</span>
                <span>Goedkeuren en doorgaan</span>
              </div>
              <p className="text-sm text-zinc-400 mt-1">
                Het resultaat is goed, de pipeline gaat verder naar de volgende stap
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors hover:bg-zinc-800/50"
            style={{ borderColor: reviewAction === 'feedback' ? 'rgb(139 92 246)' : 'rgb(39 39 42)' }}>
            <input
              type="radio"
              name="reviewAction"
              checked={reviewAction === 'feedback'}
              onChange={() => setReviewAction('feedback')}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="font-medium flex items-center gap-2">
                <span>🤖</span>
                <span>Feedback geven — AI past het aan</span>
              </div>
              <p className="text-sm text-zinc-400 mt-1">
                Het resultaat moet anders, geef feedback en de stap wordt opnieuw gegenereerd
              </p>
            </div>
          </label>
        </div>

        {reviewAction === 'feedback' && (
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <label className="block text-sm font-medium mb-2">💬 Wat moet er anders?</label>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Bijvoorbeeld: Het script is te lang, maak het korter rond 4000 woorden. De hook in het begin is te zwak, begin met een schokkend feit. Meer spanning opbouwen..."
              className="w-full h-32 bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-600 resize-none"
            />
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!reviewAction || (reviewAction === 'feedback' && !feedbackText.trim())}
          className="mt-4 w-full px-4 py-3 bg-violet-600 hover:bg-violet-700 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
        >
          {reviewAction === 'approve' ? (
            <>
              <CheckCircle className="w-5 h-5" />
              Goedkeuren & Doorgaan
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              Verstuur Feedback & Genereer Opnieuw
            </>
          )}
        </button>
      </div>
    </div>
  );
}
