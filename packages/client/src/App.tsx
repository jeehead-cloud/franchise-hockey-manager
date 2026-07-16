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
import { YouthGenerationPage } from './pages/YouthGenerationPage';
import { YouthGenerationRunDetailPage } from './pages/YouthGenerationRunDetailPage';
import { CommissionerProvider } from './lib/commissioner';
import { ScoutDetailPage, ScoutsPage, ScoutingAssignmentPage, ScoutingLandingPage, ScoutingPage, ScoutingProspectPage } from './pages/ScoutingPage';
import { DraftDetailPage, DraftsLandingPage } from './pages/DraftsPage';
import { ContractDetailPage, ContractsPage, TeamContractsPage } from './pages/ContractsPage';
import { FreeAgencyPage } from './pages/FreeAgencyPage';
import { CompletedTradeDetailPage, TradeProposalDetailPage, TradesPage, TeamTradeCenterPage } from './pages/TradesPage';
import { OffseasonPage } from './pages/OffseasonPage';
import { OffseasonRunDetailPage } from './pages/OffseasonRunDetailPage';
import { OffseasonTeamPage } from './pages/OffseasonTeamPage';
import { SeasonsPage } from './pages/SeasonsPage';
import { SeasonDetailPage } from './pages/SeasonDetailPage';
import { SeasonTransitionPage } from './pages/SeasonTransitionPage';
import { SeasonTransitionRunDetailPage } from './pages/SeasonTransitionRunDetailPage';

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
            <Route path="/teams/:teamId/scouting" element={<ScoutingPage />} />
            <Route path="/teams/:teamId/contracts" element={<TeamContractsPage />} />
            <Route path="/teams/:teamId/scouting/assignments/:assignmentId" element={<ScoutingAssignmentPage />} />
            <Route path="/teams/:teamId/scouting/prospects/:playerId" element={<ScoutingProspectPage />} />
            <Route path="/scouting" element={<ScoutingLandingPage />} />
            <Route path="/scouts" element={<ScoutsPage />} />
            <Route path="/scouts/:id" element={<ScoutDetailPage />} />
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
            <Route path="/youth-generation" element={<YouthGenerationPage />} />
            <Route path="/youth-generation/runs/:runId" element={<YouthGenerationRunDetailPage />} />
            <Route path="/drafts" element={<DraftsLandingPage />} />
            <Route path="/drafts/:draftEventId" element={<DraftDetailPage />} />
            <Route path="/drafts/:draftEventId/room" element={<DraftDetailPage />} />
            <Route path="/drafts/:draftEventId/teams/:teamId/board" element={<DraftDetailPage />} />
            <Route path="/contracts" element={<ContractsPage />} />
            <Route path="/contracts/:id" element={<ContractDetailPage />} />
            <Route path="/free-agency" element={<FreeAgencyPage />} />
            <Route path="/trades" element={<TradesPage />} />
            <Route path="/trades/:tradeId" element={<CompletedTradeDetailPage />} />
            <Route path="/trade-proposals/:proposalId" element={<TradeProposalDetailPage />} />
            <Route path="/teams/:teamId/trade-center" element={<TeamTradeCenterPage />} />
            <Route path="/offseason" element={<OffseasonPage />} />
            <Route path="/offseason/runs/:runId" element={<OffseasonRunDetailPage />} />
            <Route path="/offseason/runs/:runId/teams/:teamId" element={<OffseasonTeamPage />} />
            <Route path="/seasons" element={<SeasonsPage />} />
            <Route path="/seasons/:worldSeasonId" element={<SeasonDetailPage />} />
            <Route path="/season-transition" element={<SeasonTransitionPage />} />
            <Route path="/season-transition/runs/:runId" element={<SeasonTransitionRunDetailPage />} />
            <Route path="/contract-expiration" element={<Navigate to="/contracts?tab=expiration" replace />} />
            <Route path="/simulation-lab" element={<SimulationLabPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </CommissionerProvider>
    </BrowserRouter>
  );
}
