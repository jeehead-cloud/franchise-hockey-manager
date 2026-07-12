import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { CompetitionsPage } from './pages/CompetitionsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PlayersPage } from './pages/PlayersPage';
import { SettingsPage } from './pages/SettingsPage';
import { SetupPage } from './pages/SetupPage';
import { SimulationLabPage } from './pages/SimulationLabPage';
import { TeamsPage } from './pages/TeamsPage';
import { WorldPage } from './pages/WorldPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/world" replace />} />
          <Route path="/world" element={<WorldPage />} />
          <Route path="/competitions" element={<CompetitionsPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/players" element={<PlayersPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/simulation-lab" element={<SimulationLabPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
