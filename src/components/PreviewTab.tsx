import { useState } from 'react';
import { Copy, Play, Pause, Download, Volume2, X, Grid3x3, List } from 'lucide-react';
import { Project } from '../types';

interface PreviewTabProps {
  project: Project;
}

const fullMockScript = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.

Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.

Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem.`;

const mockScenePrompts = [
  "A dark cyber room with glowing screens showing code",
  "Hacker typing furiously on multiple keyboards",
  "Digital world map with connection lines",
  "Close-up of terminal window with scrolling text",
  "Server room with blue LED lights",
  "Anonymous mask in dramatic lighting",
  "Binary code flowing like a waterfall",
  "Satellite view of city at night",
  "FBI office with agents working",
  "Dark web marketplace interface",
  "Encrypted message being decoded",
  "Network traffic visualization",
  "Cybersecurity breach animation",
  "Hooded figure in a dark room",
  "Server rack with blinking lights",
  "Digital fingerprint analysis",
  "Code compilation progress bar",
  "Underground hacker collective meeting",
  "Firewall breach visualization",
  "Data packets traveling through network",
  "Cryptocurrency transaction flow",
  "Password cracking algorithm",
  "Dark alley with neon signs",
  "Laptop screen reflecting in glasses",
  "Digital explosion effect",
  "Matrix-style code rain",
  "Security camera footage being hacked",
  "Final reveal of the hacker's identity"
];

const mockScenes = mockScenePrompts.map((prompt, i) => ({
  id: i + 1,
  prompt,
  duration: Math.floor(Math.random() * 8) + 3,
  status: i < 24 ? 'completed' : i < 26 ? 'running' : 'failed'
}));

export default function PreviewTab({ project }: PreviewTabProps) {
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [sceneViewMode, setSceneViewMode] = useState<'grid' | 'list'>('grid');

  const isStepCompleted = (stepId: number) => {
    return project.steps[stepId]?.status === 'completed';
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const wordCount = fullMockScript.split(/\s+/).length;
  const previewText = fullMockScript.slice(0, 300) + '...';

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
    return '❌';
  };

  return (
    <div className="space-y-6">
      <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              📝 Script
            </h3>
            {isStepCompleted(3) && (
              <div className="flex gap-2">
                <span className="px-2 py-1 bg-blue-600 text-white text-xs font-medium rounded">
                  {wordCount} woorden
                </span>
                <span className="px-2 py-1 bg-zinc-700 text-white text-xs font-medium rounded">
                  {project.language}
                </span>
              </div>
            )}
          </div>
          {isStepCompleted(3) && (
            <button
              onClick={() => handleCopy(fullMockScript)}
              className="flex items-center gap-2 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm transition-colors"
            >
              <Copy className="w-4 h-4" />
              Kopieer
            </button>
          )}
        </div>

        {isStepCompleted(3) ? (
          <>
            <div className="flex gap-2 mb-3">
              <span className="px-2 py-1 bg-purple-600/20 text-purple-400 text-xs font-medium rounded border border-purple-600/30">
                Dramatic
              </span>
              <span className="px-2 py-1 bg-purple-600/20 text-purple-400 text-xs font-medium rounded border border-purple-600/30">
                First Person
              </span>
              <span className="px-2 py-1 bg-purple-600/20 text-purple-400 text-xs font-medium rounded border border-purple-600/30">
                Fast Paced
              </span>
            </div>
            <div className="bg-zinc-900 rounded-lg p-4 text-sm text-zinc-300 leading-relaxed mb-3">
              {previewText}
            </div>
            <button
              onClick={() => setShowScriptModal(true)}
              className="text-blue-500 hover:text-blue-400 text-sm font-medium"
            >
              Lees meer...
            </button>
          </>
        ) : (
          <p className="text-zinc-500 text-sm italic">
            Script wordt gegenereerd in stap 3...
          </p>
        )}
      </div>

      <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          🎙️ Voiceover
        </h3>

        {isStepCompleted(4) ? (
          <>
            <div className="bg-zinc-900 rounded-lg p-6 mb-4">
              <div className="flex items-center gap-4 mb-4">
                <button
                  onClick={toggleAudioPlay}
                  className="w-16 h-16 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center transition-colors flex-shrink-0"
                >
                  {isAudioPlaying ? (
                    <Pause className="w-8 h-8" />
                  ) : (
                    <Play className="w-8 h-8 ml-1" />
                  )}
                </button>
                <div className="flex-1">
                  <div
                    className="w-full bg-zinc-700 rounded-full h-2 mb-2 cursor-pointer"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const percentage = (x / rect.width) * 100;
                      setAudioProgress(percentage);
                    }}
                  >
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${audioProgress}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-zinc-400">
                    <span>{Math.floor((audioProgress / 100) * 765)}s</span>
                    <span className="font-medium">12:45</span>
                  </div>
                </div>
                <Volume2 className="w-5 h-5 text-zinc-400" />
                <button className="p-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors">
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1 bg-zinc-900 rounded-lg p-3 border border-zinc-700">
                <p className="text-xs text-zinc-500 mb-1">Voice</p>
                <p className="text-sm font-medium">Brody — Crime Narrator</p>
              </div>
              <div className="flex-1 bg-zinc-900 rounded-lg p-3 border border-zinc-700">
                <p className="text-xs text-zinc-500 mb-1">Model</p>
                <p className="text-sm font-medium">eleven_flash_v2_5</p>
              </div>
              <div className="flex-1 bg-zinc-900 rounded-lg p-3 border border-zinc-700">
                <p className="text-xs text-zinc-500 mb-1">Grootte</p>
                <p className="text-sm font-medium">18.4 MB</p>
              </div>
            </div>
          </>
        ) : (
          <p className="text-zinc-500 text-sm italic">
            Voiceover wordt gegenereerd in stap 4...
          </p>
        )}
      </div>

      <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            🎬 Video Scenes ({mockScenes.length} scenes)
          </h3>
          {isStepCompleted(9) && (
            <div className="flex gap-2">
              <button
                onClick={() => setSceneViewMode('grid')}
                className={`p-2 rounded-lg transition-colors ${
                  sceneViewMode === 'grid'
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
                }`}
              >
                <Grid3x3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setSceneViewMode('list')}
                className={`p-2 rounded-lg transition-colors ${
                  sceneViewMode === 'list'
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {isStepCompleted(9) ? (
          sceneViewMode === 'grid' ? (
            <div className="grid grid-cols-4 gap-3">
              {mockScenes.map((scene) => (
                <div
                  key={scene.id}
                  className="aspect-video bg-zinc-900 rounded-lg border border-zinc-700 relative group hover:border-zinc-500 transition-colors cursor-pointer"
                  title={scene.prompt}
                >
                  <div className="absolute top-2 left-2 px-2 py-1 bg-black/70 rounded text-xs font-medium">
                    Scene {scene.id}
                  </div>
                  <div className="absolute top-2 right-2 text-lg">
                    {getSceneStatusIcon(scene.status)}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/90 to-transparent">
                    <p className="text-xs text-zinc-300 truncate">
                      {scene.prompt}
                    </p>
                    <span className="text-xs text-zinc-500">{scene.duration}s</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-zinc-900 rounded-lg border border-zinc-700 overflow-hidden">
              <table className="w-full">
                <thead className="bg-zinc-800 border-b border-zinc-700">
                  <tr>
                    <th className="text-left px-4 py-2 text-sm font-semibold w-16">#</th>
                    <th className="text-left px-4 py-2 text-sm font-semibold">Prompt</th>
                    <th className="text-left px-4 py-2 text-sm font-semibold w-20">Duur</th>
                    <th className="text-left px-4 py-2 text-sm font-semibold w-24">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-700">
                  {mockScenes.map((scene) => (
                    <tr key={scene.id} className="hover:bg-zinc-800/50">
                      <td className="px-4 py-3 text-sm text-zinc-400">{scene.id}</td>
                      <td className="px-4 py-3 text-sm text-zinc-300 truncate max-w-md">
                        {scene.prompt}
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-400">{scene.duration}s</td>
                      <td className="px-4 py-3 text-sm">{getSceneStatusIcon(scene.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <p className="text-zinc-500 text-sm italic">
            Video scenes worden gegenereerd in stap 9...
          </p>
        )}
      </div>

      <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          🎥 Final Video
        </h3>

        {isStepCompleted(13) ? (
          <div>
            <div className="aspect-video bg-zinc-900 rounded-lg flex items-center justify-center border border-zinc-700 mb-4">
              <button className="w-24 h-24 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center transition-colors">
                <Play className="w-12 h-12 ml-2" />
              </button>
            </div>
            <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-semibold transition-colors mb-4">
              <Download className="w-5 h-5" />
              Download Final Video
            </button>
            <div className="flex gap-3">
              <div className="flex-1 bg-zinc-900 rounded-lg p-3 border border-zinc-700">
                <p className="text-xs text-zinc-500 mb-1">Formaat</p>
                <p className="text-sm font-medium">{project.output}</p>
              </div>
              <div className="flex-1 bg-zinc-900 rounded-lg p-3 border border-zinc-700">
                <p className="text-xs text-zinc-500 mb-1">Duur</p>
                <p className="text-sm font-medium">12:45</p>
              </div>
              <div className="flex-1 bg-zinc-900 rounded-lg p-3 border border-zinc-700">
                <p className="text-xs text-zinc-500 mb-1">Grootte</p>
                <p className="text-sm font-medium">847 MB</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-zinc-500 text-sm italic">
            Final video wordt geëxporteerd in stap 13...
          </p>
        )}
      </div>

      {showScriptModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8">
          <div className="bg-zinc-800 rounded-lg max-w-4xl w-full max-h-[80vh] flex flex-col border border-zinc-700">
            <div className="flex items-center justify-between p-6 border-b border-zinc-700">
              <h3 className="text-xl font-semibold">Volledig Script</h3>
              <button
                onClick={() => setShowScriptModal(false)}
                className="p-2 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="prose prose-invert max-w-none">
                <div className="text-zinc-300 leading-relaxed whitespace-pre-line">
                  {fullMockScript}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-zinc-700 flex justify-end gap-3">
              <button
                onClick={() => handleCopy(fullMockScript)}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
              >
                <Copy className="w-4 h-4" />
                Kopieer
              </button>
              <button
                onClick={() => setShowScriptModal(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Sluiten
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
