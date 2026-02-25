import { Project } from '../types';

interface ConfigTabProps {
  project: Project;
}

export default function ConfigTab({ project }: ConfigTabProps) {
  return (
    <div className="space-y-6">
      <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
        <h3 className="text-lg font-semibold mb-4">Algemeen</h3>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-zinc-400">Naam</span>
            <span className="font-medium">{project.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Titel</span>
            <span className="font-medium">{project.title}</span>
          </div>
          {project.description && (
            <div className="flex justify-between">
              <span className="text-zinc-400">Beschrijving</span>
              <span className="font-medium text-right max-w-md">
                {project.description}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-zinc-400">Taal</span>
            <span className="font-medium">{project.language}</span>
          </div>
        </div>
      </div>

      <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
        <h3 className="text-lg font-semibold mb-4">Script</h3>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-zinc-400">Bron</span>
            <span className="font-medium">
              {project.scriptSource === 'new' ? 'Nieuw schrijven' : 'Bestaand script'}
            </span>
          </div>
          {project.scriptSource === 'new' ? (
            <>
              <div className="flex justify-between">
                <span className="text-zinc-400">Referenties</span>
                <span className="font-medium">
                  {project.referenceVideos?.length || 0} video's
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Lengte</span>
                <span className="font-medium">{project.scriptLength} woorden</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between">
              <span className="text-zinc-400">Script URL</span>
              <span className="font-medium text-right max-w-md truncate">
                {project.scriptUrl}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
        <h3 className="text-lg font-semibold mb-4">Voice & Audio</h3>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-zinc-400">Voice</span>
            <span className="font-medium">{project.voice}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Muziek</span>
            <span className="font-medium">{project.backgroundMusic ? 'Aan' : 'Uit'}</span>
          </div>
        </div>
      </div>

      <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
        <h3 className="text-lg font-semibold mb-4">Visuele Stijl</h3>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-zinc-400">Stijl</span>
            <span className="font-medium">{project.visualStyle}</span>
          </div>
          {project.visualStyle === 'Custom' && project.customVisualStyle && (
            <div className="flex justify-between">
              <span className="text-zinc-400">Custom beschrijving</span>
              <span className="font-medium text-right max-w-md">
                {project.customVisualStyle}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-zinc-400">Stock images</span>
            <span className="font-medium">{project.stockImages ? 'Ja' : 'Nee'}</span>
          </div>
        </div>
      </div>

      <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
        <h3 className="text-lg font-semibold mb-4">Features</h3>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-zinc-400">Clips</span>
            <span className="font-medium">
              {project.useClips ? `${project.referenceClips.length} referentie, ${project.montageClips.length} montage` : 'Nee'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Color grading</span>
            <span className="font-medium">{project.colorGrading}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Subtitles</span>
            <span className="font-medium">{project.subtitles ? 'Ja' : 'Nee'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Output</span>
            <span className="font-medium">{project.output}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
