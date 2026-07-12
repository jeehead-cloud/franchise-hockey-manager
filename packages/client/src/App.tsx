import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { CompetitionDetailPage } from './pages/CompetitionDetailPage';
import { CompetitionsPage } from './pages/CompetitionsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PlayerDetailPage } from './pages/PlayerDetailPage';
import { PlayersPage } from './pages/PlayersPage';
import { SettingsPage } from './pages/SettingsPage';
import { SetupPage } from './pages/SetupPage';
import { SimulationLabPage } from './pages/SimulationLabPage';
import { TeamDetailPage } from './pages/TeamDetailPage';
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
          <Route path="/competitions/:competitionId" element={<CompetitionDetailPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/teams/:teamId" element={<TeamDetailPage />} />
          <Route path="/players" element={<PlayersPage />} />
          <Route path="/players/:playerId" element={<PlayerDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/simulation-lab" element={<SimulationLabPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
