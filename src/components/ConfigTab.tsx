import { useState, useEffect } from 'react';
import { Save, Pencil } from 'lucide-react';
import { Project } from '../types';
import { useStore } from '../store';
import * as api from '../api';
import { COLOR_GRADES } from '../data/color-grades';
import { OUTPUT_FORMATS } from '../data/output-formats';

interface ConfigTabProps {
  project: Project;
}

export default function ConfigTab({ project }: ConfigTabProps) {
  const updateProject = useStore((state) => state.updateProject);
  const canEdit = project.status === 'config';
  const [editing, setEditing] = useState(false);

  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description || '');
  const [scriptLength, setScriptLength] = useState(project.scriptLength || 5000);
  const [voices, setVoices] = useState<Array<{id: string; name: string; voiceId: string; description: string; language: string}>>([]);
  const [voice, setVoice] = useState(project.voice);

  useEffect(() => {
    api.voices.getAll().then(setVoices).catch(() => {});
  }, []);
  const [backgroundMusic, setBackgroundMusic] = useState(project.backgroundMusic);
  const [stockImages, setStockImages] = useState(project.stockImages);
  const [colorGrading, setColorGrading] = useState(project.colorGrading);
  const [subtitles, setSubtitles] = useState(project.subtitles);
  const [output, setOutput] = useState(project.output);

  const handleSave = async () => {
    await updateProject(project.id, {
      title,
      description: description || undefined,
      scriptLength,
      voice,
      backgroundMusic,
      stockImages,
      colorGrading: colorGrading as any,
      subtitles,
      output: output as any,
    });
    setEditing(false);
  };

  const Row = ({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) => (
    <div className="flex justify-between items-center">
      <span className="text-zinc-400">{label}</span>
      {editing && children ? children : <span className="font-medium text-right max-w-md">{value}</span>}
    </div>
  );

  return (
    <div className="space-y-6">
      {canEdit && (
        <div className="flex justify-end">
          {editing ? (
            <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition-colors">
              <Save className="w-4 h-4" /> Opslaan
            </button>
          ) : (
            <button onClick={() => setEditing(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors">
              <Pencil className="w-4 h-4" /> Bewerken
            </button>
          )}
        </div>
      )}

      <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
        <h3 className="text-lg font-semibold mb-4">Algemeen</h3>
        <div className="space-y-3">
          <Row label="Naam" value={project.name} />
          <Row label="Titel" value={title}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded px-3 py-1 text-sm w-64 text-right" />
          </Row>
          <Row label="Beschrijving" value={description || '-'}>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded px-3 py-1 text-sm w-64 text-right" />
          </Row>
          <Row label="Taal" value={project.language} />
        </div>
      </div>

      <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
        <h3 className="text-lg font-semibold mb-4">Script</h3>
        <div className="space-y-3">
          <Row label="Bron" value={project.scriptSource === 'new' ? 'Nieuw schrijven' : 'Bestaand script'} />
          {project.scriptSource === 'new' ? (
            <>
              <Row label="Referenties" value={`${project.referenceVideos?.length || 0} video's`} />
              <Row label="Lengte" value={`${scriptLength} woorden`}>
                <input type="number" value={scriptLength} onChange={(e) => setScriptLength(Math.max(500, Number(e.target.value)))} min={500} max={20000} step={100} className="bg-zinc-900 border border-zinc-700 rounded px-3 py-1 text-sm w-32 text-right" />
              </Row>
            </>
          ) : (
            <Row label="Script URL" value={project.scriptUrl || '-'} />
          )}
        </div>
      </div>

      <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
        <h3 className="text-lg font-semibold mb-4">Voice & Audio</h3>
        <div className="space-y-3">
          <Row label="Voice" value={voice}>
            <select value={voice} onChange={(e) => setVoice(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded px-3 py-1 text-sm">
              {voices.map((v) => <option key={v.voiceId} value={`${v.name} — ${v.description}`}>{v.name} — {v.description}</option>)}
            </select>
          </Row>
          <Row label="Muziek" value={backgroundMusic ? 'Aan' : 'Uit'}>
            <input type="checkbox" checked={backgroundMusic} onChange={(e) => setBackgroundMusic(e.target.checked)} className="w-4 h-4" />
          </Row>
        </div>
      </div>

      <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
        <h3 className="text-lg font-semibold mb-4">Visuele Stijl</h3>
        <div className="space-y-3">
          <Row label="Stijl" value={project.visualStyle} />
          {project.customVisualStyle && <Row label="Custom" value={project.customVisualStyle} />}
          <Row label="Stock images" value={stockImages ? 'Ja' : 'Nee'}>
            <input type="checkbox" checked={stockImages} onChange={(e) => setStockImages(e.target.checked)} className="w-4 h-4" />
          </Row>
        </div>
      </div>

      <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
        <h3 className="text-lg font-semibold mb-4">Features</h3>
        <div className="space-y-3">
          <Row label="Clips" value={project.useClips ? `${project.referenceClips.length} referentie, ${project.montageClips.length} montage` : 'Nee'} />
          <Row label="Color grading" value={String(colorGrading)}>
            <select value={colorGrading} onChange={(e) => setColorGrading(e.target.value as any)} className="bg-zinc-900 border border-zinc-700 rounded px-3 py-1 text-sm">
              {COLOR_GRADES.map((g) => <option key={g.id} value={g.name}>{g.name}</option>)}
            </select>
          </Row>
          <Row label="Subtitles" value={subtitles ? 'Ja' : 'Nee'}>
            <input type="checkbox" checked={subtitles} onChange={(e) => setSubtitles(e.target.checked)} className="w-4 h-4" />
          </Row>
          <Row label="Output" value={String(output)}>
            <select value={output} onChange={(e) => setOutput(e.target.value as any)} className="bg-zinc-900 border border-zinc-700 rounded px-3 py-1 text-sm">
              {OUTPUT_FORMATS.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
            </select>
          </Row>
        </div>
      </div>
    </div>
  );
}
