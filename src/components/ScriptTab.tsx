import { useState } from 'react';
import { Copy, CheckCircle2, AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import { Project } from '../types';
import * as api from '../api';

interface ScriptTabProps {
  project: Project;
}

interface ScriptCheckResult {
  overall_score: number;
  categories: Record<string, { score: number; feedback: string }>;
  top_strengths: string[];
  top_improvements: string[];
  rewrite_suggestions: { original: string; suggested: string; reason: string }[];
}

const CATEGORY_LABELS: Record<string, string> = {
  hook: 'Hook', pacing: 'Pacing', retention: 'Retentie',
  structure: 'Structuur', language: 'Taalgebruik', cta: 'CTA', engagement: 'Engagement',
};

function ScoreBar({ score, label }: { score: number; label: string }) {
  const color = score >= 8 ? 'bg-emerald-500' : score >= 6 ? 'bg-amber-500' : 'bg-red-500';
  const textColor = score >= 8 ? '#10b981' : score >= 6 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] text-zinc-400 w-20 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-surface-200/60 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${score * 10}%` }} />
      </div>
      <span className="text-[11px] font-mono font-bold w-6 text-right" style={{ color: textColor }}>
        {score}
      </span>
    </div>
  );
}

export default function ScriptTab({ project }: ScriptTabProps) {
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<ScriptCheckResult | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  const scriptStep = project.steps.find((s: any) => s.id === 7 || s.stepNumber === 6);
  const isScriptReady = scriptStep?.status === 'completed' || scriptStep?.status === 'review';

  let scriptText = '';
  if (scriptStep?.result) {
    try {
      const parsed = typeof scriptStep.result === 'string' ? JSON.parse(scriptStep.result) : scriptStep.result;
      scriptText = parsed?.script || parsed?.text || (typeof parsed === 'string' ? parsed : '');
    } catch {
      scriptText = typeof scriptStep.result === 'string' ? scriptStep.result : '';
    }
  }

  const wordCount = scriptText ? scriptText.split(/\s+/).filter(Boolean).length : 0;
  const estimatedDuration = wordCount > 0 ? Math.round(wordCount / 150) : 0;

  const handleCopy = () => {
    if (scriptText) navigator.clipboard.writeText(scriptText);
  };

  const handleCheck = async () => {
    setChecking(true);
    setCheckError(null);
    try {
      const result = await (api as any).scriptChecker.check(project.id);
      setCheckResult(result);
    } catch (err: any) {
      setCheckError(err.message || 'Script check mislukt');
    }
    setChecking(false);
  };

  if (!isScriptReady || !scriptText) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-zinc-500 text-lg">Script is nog niet gegenereerd</p>
          <p className="text-zinc-600 text-sm mt-2">Wacht tot het script is geschreven</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-wrap gap-3">
          <span className="px-3 py-1 bg-blue-600 text-white text-sm font-medium rounded flex items-center gap-1">
            {wordCount.toLocaleString()} woorden
          </span>
          <span className="px-3 py-1 bg-purple-600 text-white text-sm font-medium rounded flex items-center gap-1">
            ~{estimatedDuration} min VO
          </span>
          <span className="px-3 py-1 bg-zinc-700 text-white text-sm font-medium rounded flex items-center gap-1">
            {project.language}
          </span>
          {checkResult && (
            <span className={`px-3 py-1 text-white text-sm font-bold rounded flex items-center gap-1 ${
              checkResult.overall_score >= 8 ? 'bg-emerald-600' : checkResult.overall_score >= 6 ? 'bg-amber-600' : 'bg-red-600'
            }`}>
              Score: {checkResult.overall_score}/10
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={handleCheck} disabled={checking}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors">
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {checking ? 'Checken...' : 'AI Script Check'}
          </button>
          <button onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm font-medium transition-colors">
            <Copy className="w-4 h-4" /> Kopieer
          </button>
        </div>
      </div>

      {checkError && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {checkError}
        </div>
      )}

      {checkResult && (
        <div className="mb-6 glass rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-5 h-5 text-brand-400" />
            <h3 className="text-sm font-semibold">AI Script Analyse</h3>
          </div>

          <div className="space-y-2">
            {Object.entries(checkResult.categories || {}).map(([key, cat]) => (
              <div key={key}>
                <ScoreBar score={cat.score} label={CATEGORY_LABELS[key] || key} />
                {cat.feedback && <p className="text-[10px] text-zinc-600 ml-[92px] mt-0.5">{cat.feedback}</p>}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            {checkResult.top_strengths?.length > 0 && (
              <div>
                <p className="text-[11px] text-emerald-400 font-medium mb-2">Sterktes</p>
                {checkResult.top_strengths.map((s, i) => (
                  <p key={i} className="text-xs text-zinc-400 mb-1">{s}</p>
                ))}
              </div>
            )}
            {checkResult.top_improvements?.length > 0 && (
              <div>
                <p className="text-[11px] text-amber-400 font-medium mb-2">Verbeterpunten</p>
                {checkResult.top_improvements.map((s, i) => (
                  <p key={i} className="text-xs text-zinc-400 mb-1">{s}</p>
                ))}
              </div>
            )}
          </div>

          {checkResult.rewrite_suggestions?.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] text-brand-400 font-medium mb-2">Herschrijf suggesties</p>
              {checkResult.rewrite_suggestions.map((s, i) => (
                <div key={i} className="mb-3 p-3 rounded-lg bg-surface-200/40 border border-white/[0.04]">
                  <p className="text-xs text-red-400 line-through mb-1">{s.original}</p>
                  <p className="text-xs text-emerald-400 mb-1">{s.suggested}</p>
                  <p className="text-[10px] text-zinc-600">{s.reason}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
        <div className="prose prose-invert max-w-none">
          <div className="text-zinc-300 leading-relaxed whitespace-pre-line">
            {scriptText}
          </div>
        </div>
      </div>
    </div>
  );
}
