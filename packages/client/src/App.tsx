import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { CompetitionDetailPage } from './pages/CompetitionDetailPage';
import { CompetitionEditionPage } from './pages/CompetitionEditionPage';
import { CompetitionsPage } from './pages/CompetitionsPage';
import { MatchDetailPage } from './pages/MatchDetailPage';
import { MatchesPage } from './pages/MatchesPage';
import { NewMatchPage } from './pages/NewMatchPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PlayerDetailPage } from './pages/PlayerDetailPage';
import { PlayerEditPage } from './pages/PlayerEditPage';
import { PlayersPage } from './pages/PlayersPage';
import { SettingsPage } from './pages/SettingsPage';
import { SetupPage } from './pages/SetupPage';
import { SimulationLabPage } from './pages/SimulationLabPage';
import { TeamDetailPage } from './pages/TeamDetailPage';
import { TeamLinesEditPage } from './pages/TeamLinesEditPage';
import { TeamsPage } from './pages/TeamsPage';
import { WorldPage } from './pages/WorldPage';
import { CoachesPage } from './pages/CoachesPage';
import { CoachDetailPage } from './pages/CoachDetailPage';
import { CoachEditPage } from './pages/CoachEditPage';
import { CoachNewPage } from './pages/CoachNewPage';
import { HistoryArchivePage } from './pages/HistoryArchivePage';
import { HistoryPage } from './pages/HistoryPage';
import { PlayerHistoryPage } from './pages/PlayerHistoryPage';
import { TeamHistoryPage } from './pages/TeamHistoryPage';
import { NationalTeamsPage } from './pages/NationalTeamsPage';
import { NationalTeamDetailPage } from './pages/NationalTeamDetailPage';
import { InternationalTournamentsPage } from './pages/InternationalTournamentsPage';
import { DevelopmentPage } from './pages/DevelopmentPage';
import { DevelopmentRunDetailPage } from './pages/DevelopmentRunDetailPage';
import { CommissionerProvider } from './lib/commissioner';

export function App() {
  return (
    <BrowserRouter>
      <CommissionerProvider>
        <Routes>
          <Route path="/setup" element={<SetupPage />} />
          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to="/world" replace />} />
            <Route path="/world" element={<WorldPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/history/seasons" element={<Navigate to="/history" replace />} />
            <Route path="/history/competitions" element={<Navigate to="/history?tab=competitions" replace />} />
            <Route path="/history/competitions/:archiveId" element={<HistoryArchivePage />} />
            <Route path="/history/champions" element={<Navigate to="/history?tab=champions" replace />} />
            <Route path="/history/records" element={<Navigate to="/history?tab=records" replace />} />
            <Route path="/competitions" element={<CompetitionsPage />} />
            <Route path="/competitions/:competitionId" element={<CompetitionDetailPage />} />
            <Route
              path="/competitions/:competitionId/editions/:editionId"
              element={<CompetitionEditionPage />}
            />
            <Route path="/international-tournaments" element={<InternationalTournamentsPage />} />
            <Route path="/teams" element={<TeamsPage />} />
            <Route path="/teams/:teamId" element={<TeamDetailPage />} />
            <Route path="/teams/:teamId/history" element={<TeamHistoryPage />} />
            <Route path="/teams/:teamId/lines/edit" element={<TeamLinesEditPage />} />
            <Route path="/national-teams" element={<NationalTeamsPage />} />
            <Route path="/national-teams/:nationalTeamId" element={<NationalTeamDetailPage />} />
            <Route path="/coaches" element={<CoachesPage />} />
            <Route path="/coaches/new" element={<CoachNewPage />} />
            <Route path="/coaches/:coachId" element={<CoachDetailPage />} />
            <Route path="/coaches/:coachId/edit" element={<CoachEditPage />} />
            <Route path="/players" element={<PlayersPage />} />
            <Route path="/players/:playerId" element={<PlayerDetailPage />} />
            <Route path="/players/:playerId/history" element={<PlayerHistoryPage />} />
            <Route path="/players/:playerId/edit" element={<PlayerEditPage />} />
            <Route path="/matches" element={<MatchesPage />} />
            <Route path="/matches/new" element={<NewMatchPage />} />
            <Route path="/matches/:matchId" element={<MatchDetailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/development" element={<DevelopmentPage />} />
            <Route path="/development/runs/:runId" element={<DevelopmentRunDetailPage />} />
            <Route path="/simulation-lab" element={<SimulationLabPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </CommissionerProvider>
    </BrowserRouter>
  );
}
