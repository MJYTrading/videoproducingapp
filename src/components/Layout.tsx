import { Link, Outlet, useLocation } from 'react-router-dom';
import { Film, FolderOpen, PlusCircle, Settings } from 'lucide-react';
import Toast from './Toast';

export default function Layout() {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex h-screen bg-zinc-950 text-white">
      <aside className="w-[260px] bg-zinc-900 border-r border-zinc-800 flex flex-col fixed h-screen">
        <div className="p-6 border-b border-zinc-800">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Film className="w-6 h-6" />
            Video Producer
          </h1>
        </div>

        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            <li>
              <Link
                to="/"
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive('/')
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                }`}
              >
                <FolderOpen className="w-5 h-5" />
                Projecten
              </Link>
            </li>
            <li>
              <Link
                to="/project/new"
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive('/project/new')
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                }`}
              >
                <PlusCircle className="w-5 h-5" />
                Nieuw Project
              </Link>
            </li>
            <li>
              <Link
                to="/settings"
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive('/settings')
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                }`}
              >
                <Settings className="w-5 h-5" />
                Settings
              </Link>
            </li>
          </ul>
        </nav>
      </aside>

      <main className="flex-1 ml-[260px] overflow-auto">
        <Outlet />
      </main>

      <Toast />
    </div>
  );
}
