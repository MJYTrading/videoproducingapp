import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { auth } from './api';
import { useStore } from './store';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import NewProject from './pages/NewProject';
import ProjectDetail from './pages/ProjectDetail';
import ChannelDetailPage from './pages/ChannelDetailPage';
import SettingsPage from './pages/SettingsPage';
import StylePresetsPage from './pages/StylePresetsPage';
import ChannelsPage from './pages/ChannelsPage';
import VoicesPage from './pages/VoicesPage';
import IdeationPage from './pages/IdeationPage';
import MusicLibraryPage from './pages/MusicLibraryPage';
import SfxLibraryPage from './pages/SfxLibraryPage';
import OverlayLibraryPage from './pages/OverlayLibraryPage';
import SpecialEditsPage from './pages/SpecialEditsPage';
import ClipLibraryPage from './pages/ClipLibraryPage';
import ImageLibraryPage from './pages/ImageLibraryPage';
import BRollPage from './pages/BRollPage';
import AIImagesPage from './pages/AIImagesPage';
import AIScenesPage from './pages/AIScenesPage';
import ProjectsOverview from './pages/ProjectsOverview';
import PipelineAdminPage from './pages/PipelineAdminPage';
import LoginPage from './pages/LoginPage';

function AppContent() {
  const initialize = useStore((state) => state.initialize);
  const loading = useStore((state) => state.loading);
  const initialized = useStore((state) => state.initialized);

  useEffect(() => { initialize(); }, [initialize]);

  if (!initialized || loading) {
    return (
      <div className="flex h-screen bg-zinc-950 text-white items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-zinc-400">Projecten laden...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="channel/:channelId" element={<ChannelDetailPage />} />
          <Route path="channel/:channelId/project/new" element={<NewProject />} />
          <Route path="project/new" element={<NewProject />} />
          <Route path="project/:id" element={<ProjectDetail />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="styles" element={<StylePresetsPage />} />
          <Route path="channels" element={<ChannelsPage />} />
          <Route path="voices" element={<VoicesPage />} />
          <Route path="ideation" element={<IdeationPage />} />
          <Route path="music" element={<MusicLibraryPage />} />
          <Route path="sfx" element={<SfxLibraryPage />} />
          <Route path="overlays" element={<OverlayLibraryPage />} />
          <Route path="special-edits" element={<SpecialEditsPage />} />
          <Route path="clip-library" element={<ClipLibraryPage />} />
          <Route path="images" element={<ImageLibraryPage />} />
          <Route path="b-roll" element={<BRollPage />} />
          <Route path="ai-images" element={<AIImagesPage />} />
          <Route path="ai-scenes" element={<AIScenesPage />} />
          <Route path="projects" element={<ProjectsOverview />} />
          <Route path="admin/pipeline" element={<PipelineAdminPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function App() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    if (auth.isLoggedIn()) {
      fetch('/api/health', {
        headers: { Authorization: 'Bearer ' + localStorage.getItem('vp-token') },
      })
        .then((res) => { setLoggedIn(res.ok); if (!res.ok) localStorage.removeItem('vp-token'); })
        .catch(() => setLoggedIn(false));
    } else {
      setLoggedIn(false);
    }
  }, []);

  if (loggedIn === null) {
    return (
      <div className="flex h-screen bg-zinc-950 text-white items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!loggedIn) return <LoginPage onLogin={() => setLoggedIn(true)} />;
  return <AppContent />;
}

export default App;
