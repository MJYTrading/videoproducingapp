import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProjectsOverview from './pages/ProjectsOverview';
import NewProject from './pages/NewProject';
import ProjectDetail from './pages/ProjectDetail';
import SettingsPage from './pages/SettingsPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<ProjectsOverview />} />
          <Route path="project/new" element={<NewProject />} />
          <Route path="project/:id" element={<ProjectDetail />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
