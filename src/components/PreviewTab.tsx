import { useState } from 'react';
import { Project, Step } from '../types';
import { useStore } from '../store';
import * as api from '../api';

interface PreviewTabProps {
  project: Project;
}

// Dynamisch: bouw step names map uit project.steps
function buildStepNames(steps: Step[]): Record<number, { name: string; icon: string }> {
  const CATEGORY_ICONS: Record<string, string> = {
    'Config Validatie': '⚙️', 'Research JSON': '🔍', 'Transcripts Ophalen': '📝',
    'Style Profile Genereren': '🎨', 'Script Orchestrator': '🎯', 'Script Schrijven': '✍️',
    'Script Checker': '✅', 'Voice Over Genereren': '🎙️', 'Timestamps Ophalen': '⏱️',
    'Creative Director': '🎬', 'Clip Posities Berekenen': '📐', 'Scene Prompts Genereren': '🖼️',
    "Director's Cut (Montageplan)": '🎼', 'Muziek Selectie & Preparatie': '🎵',
    'Final Assembly': '📦', 'Google Drive Upload': '☁️', 'AI Images Genereren': '🖌️',
    'AI Video Scenes (Image-to-Video)': '🎥', 'Motion Graphics Genereren': '📊',
    'Trending Clips Research': '📊', 'B-Roll Zoekquery\'s Genereren': '🔎',
    'Stock Footage Zoeken': '🔎', 'B-Roll Downloaden': '⬇️',
    'YouTube Clips Zoeken': '🔎', 'YouTube Clips Downloaden & Trimmen': '⬇️',
    'TwelveLabs Quality Check': '🔬',
  };

  const map: Record<number, { name: string; icon: string }> = {};
  for (const step of steps) {
    map[step.id] = {
      name: step.name,
      icon: CATEGORY_ICONS[step.name] || '📋',
    };
  }
  return map;
}

const REJECT_REASONS = [
  { id: 'quality', label: 'Kwaliteit te laag' },
  { id: 'tone', label: 'Verkeerde toon/stijl' },
  { id: 'content', label: 'Inhoud niet kloppend' },
  { id: 'too_long', label: 'Te lang' },
  { id: 'too_short', label: 'Te kort' },
  { id: 'missing', label: 'Onderdelen missen' },
  { id: 'other', label: 'Anders' },
];

export default function PreviewTab({ project }: PreviewTabProps) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [showRejectModal, setShowRejectModal] = useState<number | null>(null);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [customFeedback, setCustomFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Audio state
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [sceneViewMode, setSceneViewMode] = useState<'grid' | 'list'>('grid');

  const STEP_NAMES = buildStepNames(project.steps);

  const getStep = (stepNumber: number) => project.steps.find(s => s.id === stepNumber);
  const showMsg = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleApprove = async (stepNumber: number) => {
    try {
      await api.pipelineEngine.approve(project.id, stepNumber);
      showMsg(`Stap ${stepNumber} goedgekeurd!`, 'success');
    } catch (err: any) {
      showMsg(err.message || 'Fout bij goedkeuren', 'error');
    }
  };

  const handleReject = async (stepNumber: number) => {
    if (selectedReasons.length === 0 && !customFeedback.trim()) {
      showMsg('Selecteer minimaal een reden of geef feedback', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const feedbackText = [
        ...selectedReasons.map(id => REJECT_REASONS.find(r => r.id === id)?.label),
        customFeedback.trim(),
      ].filter(Boolean).join('. ');
      await api.pipelineEngine.feedback(project.id, stepNumber, feedbackText);
      showMsg(`Feedback verstuurd voor stap ${stepNumber}`, 'success');
      setShowRejectModal(null);
      setSelectedReasons([]);
      setCustomFeedback('');
    } catch (err: any) {
      showMsg(err.message || 'Fout bij versturen', 'error');
    }
    setSubmitting(false);
  };

  // Vind review stappen
  const reviewSteps = project.steps.filter(s => s.status === 'review');
  const completedSteps = project.steps.filter(s => s.status === 'completed' && s.result);

  // Interessante stappen voor preview (hebben resultaten)
  const previewSteps = [...reviewSteps, ...completedSteps];

  if (previewSteps.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-500 text-sm">Nog geen preview beschikbaar.</p>
        <p className="text-zinc-600 text-xs mt-1">Start de pipeline om resultaten te zien.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {message && (
        <div className={`p-3 rounded-lg text-sm font-medium ${
          message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
        }`}>
          {message.text}
        </div>
      )}

      {/* Review stappen bovenaan */}
      {reviewSteps.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-amber-400">Wacht op Review ({reviewSteps.length})</h3>
          {reviewSteps.map(step => {
            const stepInfo = STEP_NAMES[step.id];
            return (
              <div key={step.id} className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span>{stepInfo?.icon || '📋'}</span>
                    <span className="font-semibold text-sm">{stepInfo?.name || step.name}</span>
                    <span className="text-[10px] text-zinc-600 font-mono">#{step.id}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleApprove(step.id)} className="btn-success text-xs py-1.5">
                      ✅ Goedkeuren
                    </button>
                    <button onClick={() => setShowRejectModal(step.id)} className="btn-danger text-xs py-1.5">
                      ❌ Afkeuren
                    </button>
                  </div>
                </div>
                {/* Result preview */}
                {step.result && (
                  <pre className="text-xs text-zinc-400 bg-surface-200 p-3 rounded-lg max-h-[300px] overflow-y-auto font-mono whitespace-pre-wrap">
                    {typeof step.result === 'object' ? JSON.stringify(step.result, null, 2) : String(step.result).slice(0, 5000)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Completed stappen met resultaten */}
      {completedSteps.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-400">Voltooide Stappen</h3>
          {completedSteps.map(step => {
            const stepInfo = STEP_NAMES[step.id];
            const isExpanded = expandedStep === step.id;
            return (
              <div key={step.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <button
                  onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span>{stepInfo?.icon || '✅'}</span>
                    <span className="text-sm font-medium">{stepInfo?.name || step.name}</span>
                    <span className="text-[10px] text-zinc-600 font-mono">#{step.id}</span>
                    {step.duration && <span className="text-[10px] text-zinc-600">{step.duration}s</span>}
                  </div>
                  <span className="text-zinc-600 text-xs">{isExpanded ? '▲' : '▼'}</span>
                </button>
                {isExpanded && step.result && (
                  <div className="px-4 pb-4">
                    <pre className="text-xs text-zinc-400 bg-surface-200 p-3 rounded-lg max-h-[400px] overflow-y-auto font-mono whitespace-pre-wrap">
                      {typeof step.result === 'object' ? JSON.stringify(step.result, null, 2) : String(step.result).slice(0, 10000)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Reject modal */}
      {showRejectModal !== null && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-8">
          <div className="glass-strong rounded-2xl max-w-md w-full">
            <div className="p-6 border-b border-white/[0.06]">
              <h3 className="text-lg font-semibold">Stap {showRejectModal} Afkeuren</h3>
            </div>
            <div className="p-6 space-y-3">
              {REJECT_REASONS.map(reason => (
                <label key={reason.id} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedReasons.includes(reason.id)}
                    onChange={() => setSelectedReasons(prev =>
                      prev.includes(reason.id) ? prev.filter(r => r !== reason.id) : [...prev, reason.id]
                    )}
                    className="w-4 h-4 rounded border-zinc-600 bg-surface-200 text-brand-600"
                  />
                  <span className="text-sm">{reason.label}</span>
                </label>
              ))}
              <textarea
                value={customFeedback}
                onChange={(e) => setCustomFeedback(e.target.value)}
                placeholder="Extra feedback..."
                className="input-base text-xs resize-none h-20"
              />
            </div>
            <div className="p-6 border-t border-white/[0.06] flex justify-end gap-3">
              <button onClick={() => { setShowRejectModal(null); setSelectedReasons([]); setCustomFeedback(''); }} className="btn-secondary text-sm">
                Annuleren
              </button>
              <button onClick={() => handleReject(showRejectModal)} disabled={submitting} className="btn-danger text-sm">
                {submitting ? 'Versturen...' : 'Feedback Versturen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
