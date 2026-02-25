import { useState } from 'react';
import { Save, Eye, EyeOff, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useStore } from '../store';
import { VisualStyle, Language, ColorGrading } from '../types';

const VOICES = [
  'Brody — Crime Narrator',
  'Sarah — Professional',
  'Mike — Energetic',
  'Emma — Calm',
  'David — Deep',
  'Lisa — Friendly',
];

export default function SettingsPage() {
  const settings = useStore((state) => state.settings);
  const updateSettings = useStore((state) => state.updateSettings);
  const projects = useStore((state) => state.projects);

  const [localSettings, setLocalSettings] = useState(settings);
  const [showPassword, setShowPassword] = useState<{ [key: string]: boolean }>({});
  const [testStatus, setTestStatus] = useState<{ [key: string]: 'connected' | 'error' | 'testing' | 'untested' }>({});
  const [saved, setSaved] = useState<{ [key: string]: boolean }>({});

  const handleSave = (field: string, value: any) => {
    updateSettings({ [field]: value });
    setSaved({ ...saved, [field]: true });
    setTimeout(() => {
      setSaved((prev) => ({ ...prev, [field]: false }));
    }, 2000);
  };

  const handleTest = (id: string) => {
    setTestStatus({ ...testStatus, [id]: 'testing' });
    setTimeout(() => {
      setTestStatus({ ...testStatus, [id]: 'connected' });
    }, 1000);
  };

  const ConnectionField = ({
    id,
    label,
    description,
    field,
    value,
    type = 'text',
  }: {
    id: string;
    label: string;
    description: string;
    field: string;
    value: string;
    type?: 'text' | 'password';
  }) => {
    const status = testStatus[id] || 'untested';
    const isPassword = type === 'password';
    const showValue = showPassword[id];

    return (
      <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
        <div className="mb-3">
          <h3 className="font-semibold">{label}</h3>
          <p className="text-sm text-zinc-400">{description}</p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex-1 relative">
            <input
              type={isPassword && !showValue ? 'password' : 'text'}
              value={value}
              onChange={(e) => setLocalSettings({ ...localSettings, [field]: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder={isPassword ? '••••••••••••••••••••' : ''}
            />
            {isPassword && (
              <button
                onClick={() => setShowPassword({ ...showPassword, [id]: !showValue })}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
              >
                {showValue ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            )}
          </div>
          <button
            onClick={() => handleTest(id)}
            disabled={status === 'testing'}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            {status === 'testing' && <Loader2 className="w-4 h-4 animate-spin" />}
            Test
          </button>
          <button
            onClick={() => handleSave(field, localSettings[field as keyof typeof localSettings])}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              saved[field]
                ? 'bg-green-600 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            <Save className="w-4 h-4" />
            {saved[field] ? 'Opgeslagen' : 'Opslaan'}
          </button>
        </div>
        {status !== 'untested' && (
          <div className="mt-2 flex items-center gap-2 text-sm">
            {status === 'connected' && (
              <>
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-green-500">Verbonden</span>
              </>
            )}
            {status === 'error' && (
              <>
                <XCircle className="w-4 h-4 text-red-500" />
                <span className="text-red-500">Niet bereikbaar</span>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const runningCount = projects.filter((p) => p.status === 'running').length;

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Instellingen</h1>

        <div className="space-y-6">
          <section>
            <h2 className="text-xl font-semibold mb-4">API Connecties</h2>
            <div className="space-y-4">
              <ConnectionField
                id="elevate"
                label="Elevate API"
                description="AI voor scripts, style profiles en prompts"
                field="elevateApiKey"
                value={localSettings.elevateApiKey}
                type="password"
              />
              <ConnectionField
                id="n8n"
                label="N8N"
                description="Workflow automation"
                field="n8nBaseUrl"
                value={localSettings.n8nBaseUrl}
              />
              <ConnectionField
                id="assembly"
                label="AssemblyAI"
                description="Audio transcriptie"
                field="assemblyAiApiKey"
                value={localSettings.assemblyAiApiKey}
                type="password"
              />
              <ConnectionField
                id="discord-webhook"
                label="Discord Webhook"
                description="Meldingen"
                field="discordWebhookUrl"
                value={localSettings.discordWebhookUrl}
              />
              <ConnectionField
                id="discord-user"
                label="Discord User ID"
                description="Je Discord ID"
                field="discordUserId"
                value={localSettings.discordUserId}
              />
              <ConnectionField
                id="openclaw"
                label="OpenClaw"
                description="AI agent"
                field="openClawUrl"
                value={localSettings.openClawUrl}
              />
              <ConnectionField
                id="openclaw-token"
                label="OpenClaw Token"
                description="Hooks authenticatie"
                field="openClawHooksToken"
                value={localSettings.openClawHooksToken}
                type="password"
              />
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Default Instellingen</h2>
            <div className="bg-zinc-900 rounded-lg p-6 space-y-4 border border-zinc-800">
              <div>
                <label className="block text-sm font-medium mb-2">Default voice</label>
                <select
                  value={localSettings.defaultVoice}
                  onChange={(e) => setLocalSettings({ ...localSettings, defaultVoice: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {VOICES.map((voice) => (
                    <option key={voice} value={voice}>
                      {voice}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Default visuele stijl</label>
                <select
                  value={localSettings.defaultVisualStyle}
                  onChange={(e) => setLocalSettings({ ...localSettings, defaultVisualStyle: e.target.value as VisualStyle })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="3D Render">3D Render</option>
                  <option value="Stickman">Stickman</option>
                  <option value="2D Animatie">2D Animatie</option>
                  <option value="History">History</option>
                  <option value="Realistisch">Realistisch</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Default taal</label>
                <select
                  value={localSettings.defaultLanguage}
                  onChange={(e) => setLocalSettings({ ...localSettings, defaultLanguage: e.target.value as Language })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="EN">EN</option>
                  <option value="NL">NL</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Default scriptlengte</label>
                <select
                  value={localSettings.defaultScriptLength}
                  onChange={(e) => setLocalSettings({ ...localSettings, defaultScriptLength: Number(e.target.value) })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value={2000}>2000</option>
                  <option value={5000}>5000</option>
                  <option value={8000}>8000</option>
                  <option value={10000}>10000</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Default subtitles</label>
                <button
                  onClick={() => setLocalSettings({ ...localSettings, defaultSubtitles: !localSettings.defaultSubtitles })}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    localSettings.defaultSubtitles ? 'bg-blue-600' : 'bg-zinc-700'
                  }`}
                >
                  <div
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      localSettings.defaultSubtitles ? 'translate-x-6' : ''
                    }`}
                  />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Default color grading</label>
                <select
                  value={localSettings.defaultColorGrading}
                  onChange={(e) => setLocalSettings({ ...localSettings, defaultColorGrading: e.target.value as ColorGrading })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="Geen">Geen</option>
                  <option value="Cinematic Dark">Cinematic Dark</option>
                  <option value="History Warm">History Warm</option>
                  <option value="Vibrant">Vibrant</option>
                  <option value="Clean Neutral">Clean Neutral</option>
                  <option value="Cold Blue">Cold Blue</option>
                  <option value="Noir">Noir</option>
                </select>
              </div>

              <button
                onClick={() => {
                  updateSettings({
                    defaultVoice: localSettings.defaultVoice,
                    defaultVisualStyle: localSettings.defaultVisualStyle,
                    defaultLanguage: localSettings.defaultLanguage,
                    defaultScriptLength: localSettings.defaultScriptLength,
                    defaultSubtitles: localSettings.defaultSubtitles,
                    defaultColorGrading: localSettings.defaultColorGrading,
                  });
                  setSaved({ ...saved, defaults: true });
                  setTimeout(() => setSaved((prev) => ({ ...prev, defaults: false })), 2000);
                }}
                className={`w-full px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                  saved.defaults
                    ? 'bg-green-600 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                <Save className="w-4 h-4" />
                {saved.defaults ? 'Opgeslagen' : 'Opslaan'}
              </button>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Systeem Info</h2>
            <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm text-zinc-400">App versie</p>
                  <p className="text-lg font-semibold">v1.0.0</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-400">Projecten in database</p>
                  <p className="text-lg font-semibold">{projects.length}</p>
                </div>
              </div>
              <div className="border-t border-zinc-800 pt-4">
                <p className="text-sm text-zinc-400 mb-3">Status indicators</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    <span className="text-sm">App</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    <span className="text-sm">N8N</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    <span className="text-sm">Elevate</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-zinc-500"></span>
                    <span className="text-sm">OpenClaw</span>
                  </div>
                </div>
              </div>
              {runningCount > 0 && (
                <div className="border-t border-zinc-800 mt-4 pt-4">
                  <p className="text-sm text-blue-400">
                    {runningCount} {runningCount === 1 ? 'project draait' : 'projecten draaien'}
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
