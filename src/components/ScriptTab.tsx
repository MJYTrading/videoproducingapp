import { Copy } from 'lucide-react';
import { Project } from '../types';

interface ScriptTabProps {
  project: Project;
}

const fullMockScript = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.

Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.

Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem.

Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur. Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur, vel illum qui dolorem eum fugiat quo voluptas nulla pariatur.

At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident, similique sunt in culpa qui officia deserunt mollitia animi, id est laborum et dolorum fuga.`;

export default function ScriptTab({ project }: ScriptTabProps) {
  const scriptStep = project.steps[3];
  const isScriptReady = scriptStep?.status === 'completed' || scriptStep?.status === 'review';
  const wordCount = scriptStep?.metadata?.wordCount || fullMockScript.split(/\s+/).length;
  const estimatedDuration = scriptStep?.metadata?.estimatedDuration || Math.round(wordCount / 150);

  const handleCopy = () => {
    navigator.clipboard.writeText(fullMockScript);
  };

  if (!isScriptReady) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-zinc-500 text-lg">Script is nog niet gegenereerd</p>
          <p className="text-zinc-600 text-sm mt-2">
            Wacht tot stap 3 is voltooid
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
            {fullMockScript}
          </div>
        </div>
      </div>
    </div>
  );
}
