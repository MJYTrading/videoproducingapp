import { useState, useEffect } from 'react';
import { Save, Pencil } from 'lucide-react';
import { Project, VIDEO_TYPE_LABELS } from '../types';
import { useStore } from '../store';
import * as api from '../api';

interface ConfigTabProps {
  project: Project;
}

export default function ConfigTab({ project }: ConfigTabProps) {
  const updateProject = useStore((state) => state.updateProject);
  const canEdit = project.status === 'config';
  const [editing, setEditing] = useState(false);
  const [channelName, setChannelName] = useState('');

  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description || '');
  const [scriptLengthMinutes, setScriptLengthMinutes] = useState(
    project.scriptLength ? Math.round(project.scriptLength / 150) : 8
  );
  const [voices, setVoices] = useState<Array<{id: string; name: string; voiceId: string; description: string; language: string}>>([]);
  const [voice, setVoice] = useState(project.voice);

  useEffect(() => {
    api.voices.getAll().then(setVoices).catch(() => {});
    if (project.channelId) {
      api.channels.getAll().then((channels: any[]) => {
        const ch = channels.find(c => c.id === project.channelId);
        if (ch) setChannelName(ch.name);
      }).catch(() => {});
    }
  }, []);

  const handleSave = async () => {
    await updateProject(project.id, {
      title,
      description: description || undefined,
      scriptLength: Math.round(scriptLengthMinutes * 150),
      voice,
    });
    setEditing(false);
  };

  const Row = ({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) => (
    <div className="flex justify-between items-center py-2 border-b border-white/[0.04] last:border-0">
      <span className="text-xs text-zinc-500">{label}</span>
      {editing && children ? children : <span className="text-sm font-medium text-zinc-300 text-right max-w-md truncate">{value || '—'}</span>}
    </div>
  );

  const isAiVideoType = project.videoType === 'ai' || project.videoType === 'spokesperson_ai';

  return (
    <div className="space-y-5">
      {canEdit && (
        <div className="flex justify-end">
          {editing ? (
            <button onClick={handleSave} className="btn-primary text-sm"><Save className="w-4 h-4" /> Opslaan</button>
          ) : (
            <button onClick={() => setEditing(true)} className="btn-secondary text-sm"><Pencil className="w-4 h-4" /> Bewerken</button>
          )}
        </div>
      )}

      {/* Algemeen */}
      <div className="glass rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">📋 Algemeen</h3>
        <div>
          <Row label="Naam" value={project.name} />
          <Row label="Titel" value={title}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input-base text-sm !py-1 w-64 text-right" />
          </Row>
          <Row label="Beschrijving" value={description}>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className="input-base text-sm !py-1 w-64 text-right" />
          </Row>
          <Row label="Taal" value={project.language} />
          <Row label="Video Type" value={VIDEO_TYPE_LABELS[project.videoType] || project.videoType} />
          {channelName && <Row label="Kanaal" value={channelName} />}
        </div>
      </div>

      {/* Script */}
      <div className="glass rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">✍️ Script</h3>
        <div>
          <Row label="Bron" value={project.scriptSource === 'new' ? 'Nieuw schrijven' : 'Bestaand script'} />
          {project.scriptSource === 'new' ? (
            <>
              <Row label="Referenties" value={`${project.referenceVideos?.length || 0} video's`} />
              <Row label="Lengte" value={`${scriptLengthMinutes} min (≈${Math.round(scriptLengthMinutes * 150)} woorden)`}>
                <div className="flex items-center gap-2">
                  <input type="number" step="0.5" min="1" max="60" value={scriptLengthMinutes} onChange={(e) => setScriptLengthMinutes(parseFloat(e.target.value) || 8)} className="input-base text-sm !py-1 w-20 text-right" />
                  <span className="text-xs text-zinc-500">min</span>
                </div>
              </Row>
            </>
          ) : (
            <Row label="Script URL" value={project.scriptUrl} />
          )}
        </div>
      </div>

      {/* Voice */}
      <div className="glass rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">🎙️ Voice</h3>
        <div>
          <Row label="Voice" value={voice}>
            <select value={voice} onChange={(e) => setVoice(e.target.value)} className="input-base text-sm !py-1">
              {voices.map((v) => <option key={v.voiceId} value={`${v.name} — ${v.description}`}>{v.name} — {v.description}</option>)}
            </select>
          </Row>
        </div>
      </div>

      {/* Visuele Stijl */}
      <div className="glass rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">🎨 Visuele Stijl</h3>
        <div>
          <Row label="Stijl" value={project.visualStyle} />
          {project.customVisualStyle && <Row label="Custom" value={project.customVisualStyle} />}
          {!isAiVideoType && <Row label="Stock images" value={project.stockImages ? 'Ja' : 'Nee'} />}
        </div>
      </div>

      {/* Pipeline Info */}
      <div className="glass rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">⚙️ Pipeline</h3>
        <div>
          <Row label="Actieve stappen" value={`${project.enabledSteps?.length || 0} van 26`} />
          <Row label="Checkpoints" value={project.checkpoints?.length ? `Stap ${project.checkpoints.join(', ')}` : 'Geen'} />
          <Row label="Subtitles" value={project.subtitles ? 'Ja' : 'Nee'} />
          <Row label="Output" value={project.output} />
          <Row label="Aspect Ratio" value={project.aspectRatio || 'landscape'} />
        </div>
      </div>

      {/* Enabled Steps Overview */}
      {project.enabledSteps && project.enabledSteps.length > 0 && (
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">📊 Actieve Stappen</h3>
          <div className="flex flex-wrap gap-1.5">
            {project.enabledSteps.map((stepNum) => (
              <span key={stepNum} className="text-[10px] px-2 py-1 rounded-md bg-brand-500/10 border border-brand-500/20 text-brand-300">
                {stepNum}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
