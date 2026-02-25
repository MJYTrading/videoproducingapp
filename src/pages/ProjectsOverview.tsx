import { Link } from 'react-router-dom';
import { Plus, FileVideo } from 'lucide-react';
import { useStore } from '../store';
import { ProjectStatus } from '../types';

export default function ProjectsOverview() {
  const projects = useStore((state) => state.projects);

  const getStatusColor = (status: ProjectStatus) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'running':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'failed':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'paused':
        return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      default:
        return 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20';
    }
  };

  const getProgressPercentage = (steps: any[]) => {
    const completed = steps.filter((s) => s.status === 'completed').length;
    return Math.round((completed / steps.length) * 100);
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Projecten</h1>
        <Link
          to="/project/new"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-5 h-5" />
          Nieuw Project
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[60vh] text-center">
          <FileVideo className="w-16 h-16 text-zinc-600 mb-4" />
          <h2 className="text-2xl font-semibold mb-2 text-zinc-300">
            Nog geen projecten
          </h2>
          <p className="text-zinc-500 mb-6">
            Start je eerste project om aan de slag te gaan
          </p>
          <Link
            to="/project/new"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            Nieuw Project
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => {
            const progress = getProgressPercentage(project.steps);
            const completedSteps = project.steps.filter(
              (s) => s.status === 'completed'
            ).length;

            return (
              <Link
                key={project.id}
                to={`/project/${project.id}`}
                className="bg-zinc-800 rounded-lg p-6 hover:bg-zinc-750 transition-colors border border-zinc-700 hover:border-zinc-600"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-1">
                      {project.name}
                    </h3>
                    <p className="text-sm text-zinc-400 line-clamp-1">
                      {project.title}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded border ${getStatusColor(
                      project.status
                    )}`}
                  >
                    {project.status}
                  </span>
                </div>

                <div className="mt-4">
                  <div className="flex justify-between text-sm text-zinc-400 mb-2">
                    <span>Voortgang</span>
                    <span>
                      {completedSteps}/{project.steps.length}
                    </span>
                  </div>
                  <div className="w-full bg-zinc-700 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
