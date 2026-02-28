import { Copy } from 'lucide-react';
import { Project } from '../types';

interface ScriptTabProps {
  project: Project;
}

export default function ScriptTab({ project }: ScriptTabProps) {
  // Script staat in stap 7 (Script Schrijven)
  const scriptStep = project.steps.find(s => s.id === 7);
  const isScriptReady = scriptStep?.status === 'completed' || scriptStep?.status === 'review';

  // Haal het echte script uit de step result
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

  if (!isScriptReady || !scriptText) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-zinc-500 text-lg">Script is nog niet gegenereerd</p>
          <p className="text-zinc-600 text-sm mt-2">
            Wacht tot stap 7 (Script Schrijven) is voltooid
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-wrap gap-3">
          <span className="px-3 py-1 bg-blue-600 text-white text-sm font-medium rounded flex items-center gap-1">
            📊 {wordCount.toLocaleString()} woorden
          </span>
          <span className="px-3 py-1 bg-purple-600 text-white text-sm font-medium rounded flex items-center gap-1">
            🎙️ ~{estimatedDuration} min VO
          </span>
          <span className="px-3 py-1 bg-zinc-700 text-white text-sm font-medium rounded flex items-center gap-1">
            🌐 {project.language}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm font-medium transition-colors"
        >
          <Copy className="w-4 h-4" />
          📋 Kopieer
        </button>
      </div>

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
