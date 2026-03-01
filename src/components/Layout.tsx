import { Link, Outlet, useLocation } from 'react-router-dom';
import { Film, FolderOpen, Settings, LogOut, Palette, Tv, Mic, Sparkles, Lightbulb, Music, Volume2, Layers, Wand2, Scissors, Image, Video, Clapperboard, BrainCircuit, Radio, FileVideo, Settings2 } from 'lucide-react';
import Toast from './Toast';
import { auth } from '../api';

const NAV_ITEMS = [
  { path: '/', icon: Tv, label: 'Dashboard', exact: true },
  { path: '/channels', icon: Radio, label: 'Channels' },
  { path: '/projects', icon: FileVideo, label: 'Projects' },
  { path: '/ideation', icon: Lightbulb, label: 'Ideation' },
  { type: 'divider' as const },
  { path: '/styles', icon: Palette, label: 'Styles' },
  { type: 'divider' as const },
  { path: '/voices', icon: Mic, label: 'Voices' },
  { path: '/music', icon: Music, label: 'Background Music' },
  { path: '/sfx', icon: Volume2, label: 'Sound Effects' },
  { type: 'divider' as const },
  { path: '/images', icon: Image, label: 'Images' },
  { path: '/b-roll', icon: Video, label: 'B-Roll Footage' },
  { path: '/clip-library', icon: Scissors, label: 'Clips' },
  { path: '/ai-images', icon: BrainCircuit, label: 'AI Images' },
  { path: '/ai-scenes', icon: Clapperboard, label: 'AI Scenes' },
  { type: 'divider' as const },
  { path: '/overlays', icon: Layers, label: 'Overlays' },
  { path: '/special-edits', icon: Wand2, label: 'Special Edits' },
  { type: 'divider' as const },
  { path: '/admin/pipeline', icon: Settings2, label: 'Pipeline Admin' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export default function Layout() {
  const location = useLocation();

  const isActive = (path: string, exact?: boolean) => {
    if (exact) return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  const handleLogout = async () => {
    await auth.logout();
    window.location.reload();
  };

  return (
    <div className="flex h-screen bg-surface text-white overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[260px] shrink-0 flex flex-col fixed h-screen z-30 bg-surface-50/80 backdrop-blur-xl border-r border-white/[0.06]">
        {/* Logo */}
        <div className="p-5 pb-4">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-glow-sm group-hover:shadow-glow transition-shadow duration-300">
              <Film className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-[15px] font-bold tracking-tight text-white">Video Producer</h1>
              <p className="text-[10px] text-zinc-500 font-medium tracking-wider uppercase">Pipeline Studio</p>
            </div>
          </Link>
        </div>

        <div className="divider mx-4" />

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto">
          <div className="space-y-0.5">
            {NAV_ITEMS.map((item, i) => {
              if ('type' in item && item.type === 'divider') {
                return <div key={`div-${i}`} className="divider my-2.5 mx-2" />;
              }
              const navItem = item as { path: string; icon: any; label: string; exact?: boolean };
              const Icon = navItem.icon;
              const active = isActive(navItem.path, navItem.exact);

              return (
                <Link
                  key={navItem.path}
                  to={navItem.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 group relative ${
                    active
                      ? 'bg-brand-600/15 text-brand-300 shadow-inner-glow'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                  }`}
                >
                  {active && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gradient-to-b from-brand-400 to-brand-600" />
                  )}
                  <Icon className={`w-[18px] h-[18px] transition-colors duration-200 ${
                    active ? 'text-brand-400' : 'text-zinc-500 group-hover:text-zinc-400'
                  }`} />
                  {navItem.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* User section */}
        <div className="p-3 border-t border-white/[0.06]">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-600/30 to-purple-600/30 flex items-center justify-center border border-white/[0.06]">
                <Sparkles className="w-3.5 h-3.5 text-brand-400" />
              </div>
              <span className="text-xs font-medium text-zinc-400">{auth.getUsername()}</span>
            </div>
            <button
              onClick={handleLogout}
              className="btn-icon !p-1.5 text-zinc-600 hover:text-red-400"
              title="Uitloggen"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-[260px] overflow-auto bg-surface">
        <Outlet />
      </main>

      <Toast />
    </div>
  );
}
