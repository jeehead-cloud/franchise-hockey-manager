/**
 * F16 Simulation Lab — pure batch analysis types (no Prisma / I/O).
 */

export type LabSimulationCount = 1 | 10 | 100 | 1000;

export type LabSideMode = 'FIXED' | 'ALTERNATE';

export type LabWinner = 'TEAM_A' | 'TEAM_B' | 'TIE';

export type LabDecisionType = 'REGULATION' | 'OVERTIME' | 'SHOOTOUT' | 'TIE';

export type AnomalySeverity = 'INFO' | 'WARNING' | 'ERROR';

export interface LabTeamSideStats {
  goals: number;
  shotAttempts: number;
  shotsOnGoal: number;
  saves: number;
  shootingPercentage: number;
  faceoffWins: number;
  possessionSeconds: number;
  offensiveZoneSeconds: number;
  defensiveZoneSeconds: number;
  penalties: number;
  penaltyMinutes: number;
  powerPlayOpportunities: number;
  powerPlayGoals: number;
  powerPlayPercentage: number;
  penaltyKillOpportunities: number;
  penaltyKills: number;
  penaltyKillPercentage: number;
  shortHandedGoals: number;
  shootoutAttempts: number;
  shootoutGoals: number;
}

export interface LabPlayerContribution {
  playerId: string;
  teamSide: 'TEAM_A' | 'TEAM_B';
  firstName: string;
  lastName: string;
  position: string;
  lineupSlot: string;
  goals: number;
  assists: number;
  points: number;
  shotsOnGoal: number;
  shotAttempts: number;
  penaltyMinutes: number;
  powerPlayGoals: number;
  shortHandedGoals: number;
  // goalie fields (0 for skaters)
  shotsAgainst: number;
  saves: number;
  goalsAgainst: number;
  isGoalie: boolean;
}

export interface LabUnitContribution {
  unitKey: string;
  teamSide: 'TEAM_A' | 'TEAM_B';
  playerIds: string[];
  shiftCount: number;
  goalsFor: number;
  goalsAgainst: number;
  effectivePerformance: number;
}

export interface LabGameSummary {
  gameIndex: number;
  seed: string;
  teamAWasHome: boolean;
  winner: LabWinner;
  decisionType: LabDecisionType;
  teamAScore: number;
  teamBScore: number;
  teamARegulationScore: number;
  teamBRegulationScore: number;
  overtimeOccurred: boolean;
  shootoutOccurred: boolean;
  teamAStats: LabTeamSideStats;
  teamBStats: LabTeamSideStats;
  playerContributions: LabPlayerContribution[];
  unitContributions: LabUnitContribution[];
  traceHash: string;
  reconciliationPassed: boolean;
  preMatchStronger: 'TEAM_A' | 'TEAM_B' | 'EVEN';
  preMatchStrengthGap: number;
  isUpset: boolean;
}

export interface LabHistogramBucket {
  label: string;
  min: number;
  max: number | null;
  count: number;
}

export interface LabExactScoreFrequency {
  teamAScore: number;
  teamBScore: number;
  count: number;
}

export interface LabPlayerAggregate {
  playerId: string;
  teamSide: 'TEAM_A' | 'TEAM_B';
  firstName: string;
  lastName: string;
  position: string;
  lineupSlot: string;
  games: number;
  goals: number;
  assists: number;
  points: number;
  shotsOnGoal: number;
  shotAttempts: number;
  penaltyMinutes: number;
  powerPlayGoals: number;
  shortHandedGoals: number;
  pointsPerGame: number;
  shootingPercentage: number | null;
  // goalie
  isGoalie: boolean;
  wins: number;
  shotsAgainst: number;
  saves: number;
  goalsAgainst: number;
  savePercentage: number | null;
  shutouts: number;
}

export interface LabUnitAggregate {
  unitKey: string;
  teamSide: 'TEAM_A' | 'TEAM_B';
  playerIds: string[];
  games: number;
  shiftCount: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifferential: number;
  averageEffectivePerformance: number;
}

export interface LabOutcomeAggregate {
  games: number;
  teamAWins: number;
  teamBWins: number;
  ties: number;
  teamAWinRate: number;
  teamBWinRate: number;
  homeWins: number;
  homeWinRate: number;
  teamAHomeGames: number;
  teamBHomeGames: number;
  regulationDecisions: number;
  overtimeDecisions: number;
  shootoutDecisions: number;
  tieDecisions: number;
}

export interface LabScoringAggregate {
  teamAAverageGoals: number;
  teamBAverageGoals: number;
  combinedAverageGoals: number;
  medianCombinedGoals: number;
  minCombinedGoals: number;
  maxCombinedGoals: number;
  averageScoreDifferential: number;
  shutouts: number;
  oneGoalGames: number;
  highScoringGames: number;
  combinedGoalsHistogram: LabHistogramBucket[];
  exactScoreFrequencies: LabExactScoreFrequency[];
}

export interface LabShootingAggregate {
  teamAAverageShotsOnGoal: number;
  teamBAverageShotsOnGoal: number;
  teamAAverageShotAttempts: number;
  teamBAverageShotAttempts: number;
  teamAShootingPercentage: number;
  teamBShootingPercentage: number;
  teamASavePercentage: number;
  teamBSavePercentage: number;
}

export interface LabSpecialTeamsAggregate {
  teamAPenaltiesPerGame: number;
  teamBPenaltiesPerGame: number;
  teamAPimPerGame: number;
  teamBPimPerGame: number;
  teamAPpOpportunitiesPerGame: number;
  teamBPpOpportunitiesPerGame: number;
  teamAPowerPlayPercentage: number;
  teamBPowerPlayPercentage: number;
  teamAPenaltyKillPercentage: number;
  teamBPenaltyKillPercentage: number;
  teamAShortHandedGoalsPerGame: number;
  teamBShortHandedGoalsPerGame: number;
}

export interface LabPossessionAggregate {
  teamAPossessionShare: number;
  teamBPossessionShare: number;
  teamAOffensiveZoneShare: number;
  teamBOffensiveZoneShare: number;
  teamAFaceoffShare: number;
  teamBFaceoffShare: number;
}

export interface LabUpsetAggregate {
  expectedStronger: 'TEAM_A' | 'TEAM_B' | 'EVEN' | 'MIXED';
  averageStrengthGap: number;
  evenGames: number;
  upsetWins: number;
  upsetRate: number;
  upsetsByDecision: Record<string, number>;
}

export interface LabAggregate {
  outcomes: LabOutcomeAggregate;
  scoring: LabScoringAggregate;
  shooting: LabShootingAggregate;
  specialTeams: LabSpecialTeamsAggregate;
  possession: LabPossessionAggregate;
  upsets: LabUpsetAggregate;
  players: LabPlayerAggregate[];
  units: LabUnitAggregate[];
  failedGames: number;
  reconciliationFailures: number;
}

export interface LabAnomaly {
  code: string;
  severity: AnomalySeverity;
  message: string;
  metric: string;
  observedValue: number | string | null;
  guardrail: string;
}

export interface LabComparisonDelta {
  metric: string;
  baseline: number;
  comparison: number;
  delta: number;
}

export interface LabComparisonResult {
  baseline: LabAggregate;
  comparison: LabAggregate;
  deltas: LabComparisonDelta[];
  pairedOutcomeChanges: number;
  gamesCompared: number;
}

export interface LabBatchResult {
  metadata: {
    engineVersion: string;
    simulationMode: string;
    baseSeed: string;
    simulationCount: number;
    completedGames: number;
    sideMode: LabSideMode;
    isPartial: boolean;
    baselineBalance: {
      versionId: string;
      versionNumber: number;
      configHash: string;
      presetName: string;
    };
    comparisonBalance: {
      versionId: string;
      versionNumber: number;
      configHash: string;
      presetName: string;
    } | null;
  };
  aggregate: LabAggregate;
  comparison: LabComparisonResult | null;
  anomalies: LabAnomaly[];
  gameSummaries: LabGameSummary[] | null;
  batchHash: string;
}

/** Development guardrails — not NHL-calibrated. */
export interface LabAnomalyGuardrails {
  minGoalsPerGame: number;
  maxGoalsPerGame: number;
  minShotsOnGoalPerGame: number;
  maxShotsOnGoalPerGame: number;
  minSavePercentage: number;
  maxSavePercentage: number;
  minPenaltiesPerGame: number;
  maxPenaltiesPerGame: number;
  minPowerPlayPercentage: number;
  maxPowerPlayPercentage: number;
  maxHomeWinRate: number;
  minHomeWinRate: number;
  maxShootoutRate: number;
  highScoringCombinedGoals: number;
  evenStrengthGapThreshold: number;
  smallSampleWarningBelow: number;
}

export const DEFAULT_LAB_ANOMALY_GUARDRAILS: LabAnomalyGuardrails = {
  minGoalsPerGame: 3,
  maxGoalsPerGame: 16,
  minShotsOnGoalPerGame: 10,
  maxShotsOnGoalPerGame: 80,
  minSavePercentage: 0.4,
  maxSavePercentage: 0.95,
  minPenaltiesPerGame: 1,
  maxPenaltiesPerGame: 14,
  minPowerPlayPercentage: 0.05,
  maxPowerPlayPercentage: 0.45,
  maxHomeWinRate: 0.75,
  minHomeWinRate: 0.25,
  maxShootoutRate: 0.35,
  highScoringCombinedGoals: 12,
  evenStrengthGapThreshold: 2,
  smallSampleWarningBelow: 100,
};

export const SUPPORTED_LAB_COUNTS: readonly LabSimulationCount[] = [1, 10, 100, 1000];

export const COMBINED_GOALS_HISTOGRAM_BUCKETS: ReadonlyArray<{ label: string; min: number; max: number | null }> = [
  { label: '0–2', min: 0, max: 2 },
  { label: '3–5', min: 3, max: 5 },
  { label: '6–8', min: 6, max: 8 },
  { label: '9–11', min: 9, max: 11 },
  { label: '12+', min: 12, max: null },
];
