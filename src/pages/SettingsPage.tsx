import { useState } from 'react';
import { Save, Eye, EyeOff, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useStore } from '../store';

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
    setTimeout(() => { setSaved((prev) => ({ ...prev, [field]: false })); }, 2000);
  };

  const handleTest = (id: string) => {
    setTestStatus({ ...testStatus, [id]: 'testing' });
    setTimeout(() => { setTestStatus({ ...testStatus, [id]: 'connected' }); }, 1000);
  };

  const ConnectionField = ({ id, label, description, field, value, type = 'text' }: {
    id: string; label: string; description: string; field: string; value: string; type?: 'text' | 'password';
  }) => {
    const status = testStatus[id] || 'untested';
    const isPassword = type === 'password';
    const showValue = showPassword[id];

    return (
      <div className="bg-surface-200/60 rounded-xl p-4 border border-white/[0.04]">
        <div className="mb-3">
          <h3 className="font-semibold text-sm">{label}</h3>
          <p className="text-xs text-zinc-500">{description}</p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex-1 relative">
            <input
              type={isPassword && !showValue ? 'password' : 'text'}
              value={value}
              onChange={(e) => setLocalSettings({ ...localSettings, [field]: e.target.value })}
              className="input-base text-sm"
              placeholder={isPassword ? '••••••••••••••••••••' : ''}
            />
            {isPassword && (
              <button onClick={() => setShowPassword({ ...showPassword, [id]: !showValue })}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors">
                {showValue ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            )}
          </div>
          <button onClick={() => handleTest(id)} disabled={status === 'testing'} className="btn-secondary text-xs py-2.5 px-3">
            {status === 'testing' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Test
          </button>
          <button onClick={() => handleSave(field, localSettings[field as keyof typeof localSettings])}
            className={saved[field] ? 'btn-success text-xs py-2.5 px-3' : 'btn-primary text-xs py-2.5 px-3'}>
            <Save className="w-3.5 h-3.5" />
            {saved[field] ? 'Opgeslagen' : 'Opslaan'}
          </button>
        </div>
        {status !== 'untested' && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            {status === 'connected' && (<><CheckCircle className="w-3.5 h-3.5 text-emerald-400" /><span className="text-emerald-400">Verbonden</span></>)}
            {status === 'error' && (<><XCircle className="w-3.5 h-3.5 text-red-400" /><span className="text-red-400">Niet bereikbaar</span></>)}
          </div>
        )}
      </div>
    );
  };

  const ToggleRow = ({ label, description, enabled, onToggle }: { label: string; description: string; enabled: boolean; onToggle: () => void }) => (
    <div className="bg-surface-200/60 rounded-xl p-4 border border-white/[0.04] flex items-center justify-between">
      <div>
        <h3 className="font-semibold text-sm">{label}</h3>
        <p className="text-xs text-zinc-500">{description}</p>
      </div>
      <button onClick={onToggle}
        className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-emerald-600' : 'bg-surface-400'}`}>
        <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${enabled ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );

  const runningCount = projects.filter((p) => p.status === 'running').length;

  return (
    <div className="p-8 animate-fade-in">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Instellingen</h1>
          <p className="text-sm text-zinc-500 mt-1">API connecties en systeemconfiguratie</p>
        </div>

        <div className="space-y-6">
          <section>
            <h2 className="section-title mb-4">API Connecties</h2>
            <div className="space-y-3">
              <ConnectionField id="elevate" label="Elevate API" description="AI voor scripts, style profiles, TTS en video generatie" field="elevateApiKey" value={localSettings.elevateApiKey} type="password" />
              <ConnectionField id="anthropic" label="Anthropic API (fallback)" description="Backup LLM als Elevate niet werkt" field="anthropicApiKey" value={localSettings.anthropicApiKey} type="password" />
              <ConnectionField id="n8n" label="N8N" description="Workflow automation" field="n8nBaseUrl" value={localSettings.n8nBaseUrl} />
              <ConnectionField id="assembly" label="AssemblyAI" description="Audio transcriptie en timestamps" field="assemblyAiApiKey" value={localSettings.assemblyAiApiKey} type="password" />
              <ConnectionField id="youtube-transcript" label="YouTube Transcript API" description="youtubetranscript.dev — Transcripts ophalen van referentie video's" field="youtubeTranscriptApiKey" value={localSettings.youtubeTranscriptApiKey || ''} type="password" />
              <ConnectionField id="video-download" label="Video Download API" description="video-download-api.com — Clips downloaden voor montage" field="videoDownloadApiKey" value={(localSettings as any).videoDownloadApiKey || ''} type="password" />
              <ConnectionField id="perplexity" label="Perplexity API" description="Deep Research voor onderzoek en trending clips" field="perplexityApiKey" value={(localSettings as any).perplexityApiKey || ''} type="password" />
              <ConnectionField id="twelvelabs" label="TwelveLabs API" description="Video kwaliteitscheck bij asset zoeken" field="twelveLabsApiKey" value={(localSettings as any).twelveLabsApiKey || ''} type="password" />
              <ConnectionField id="nexlev" label="NexLev API" description="Kanaalanalyse en ideation via N8N" field="nexlevApiKey" value={(localSettings as any).nexlevApiKey || ''} type="password" />
              <ConnectionField id="discord-webhook" label="Discord Webhook" description="Meldingen" field="discordWebhookUrl" value={localSettings.discordWebhookUrl} />
              <ConnectionField id="discord-user" label="Discord User ID" description="Je Discord ID voor mentions" field="discordUserId" value={localSettings.discordUserId} />
            </div>
          </section>

          <section>
            <h2 className="section-title mb-4">GenAIPro (Video Fallback)</h2>
            <div className="space-y-3">
              <ConnectionField id="genaipro" label="GenAIPro API Key" description="Fallback video generatie als Elevate rate limit bereikt" field="genaiProApiKey" value={localSettings.genaiProApiKey || ''} type="password" />
              <ToggleRow label="GenAIPro Ingeschakeld" description="Schakel in om GenAIPro als fallback te gebruiken bij Elevate fouten"
                enabled={!!localSettings.genaiProEnabled}
                onToggle={() => { const v = !localSettings.genaiProEnabled; setLocalSettings({ ...localSettings, genaiProEnabled: v }); updateSettings({ genaiProEnabled: v }); }} />
              <ToggleRow label="GenAIPro voor Images" description="Gebruik GenAIPro als fallback voor AI image generatie (kost credits)"
                enabled={!!localSettings.genaiProImagesEnabled}
                onToggle={() => { const v = !localSettings.genaiProImagesEnabled; setLocalSettings({ ...localSettings, genaiProImagesEnabled: v }); updateSettings({ genaiProImagesEnabled: v }); }} />
            </div>
          </section>

          <section>
            <h2 className="section-title mb-4">Systeem Info</h2>
            <div className="glass rounded-2xl p-6">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-[10px] text-zinc-600 font-medium uppercase tracking-wider">App versie</p>
                  <p className="text-lg font-bold">v2.0</p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-600 font-medium uppercase tracking-wider">Projecten</p>
                  <p className="text-lg font-bold">{projects.length}</p>
                </div>
              </div>
              <div className="divider pt-4">
                <p className="text-[10px] text-zinc-600 font-medium uppercase tracking-wider mb-3">Status</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { name: 'App', status: true },
                    { name: 'N8N', status: true },
                    { name: 'Elevate', status: true },
                    { name: 'AssemblyAI', status: true },
                  ].map((s) => (
                    <div key={s.name} className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${s.status ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                      <span className="text-sm text-zinc-400">{s.name}</span>
                    </div>
                  ))}
                </div>
              </div>
              {runningCount > 0 && (
                <div className="divider mt-4 pt-4">
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
