import { AggregatedLeagueError, AGGREGATED_CONFIG_SCHEMA_VERSION, type AggregatedSeasonConfig } from './types.js';

export const DEFAULT_AGGREGATED_SEASON_CONFIG: AggregatedSeasonConfig = {
  schemaVersion: AGGREGATED_CONFIG_SCHEMA_VERSION,
  simulationMode: 'AGGREGATED',
  scheduleFormat: 'DOUBLE_ROUND_ROBIN',
  homeAdvantage: 0.04,
  strengthRandomness: 0.12,
  scoreVariance: 0.18,
  overtimeRateTarget: 0.22,
  shootoutRateTarget: 0.08,
  statAllocation: {
    topLineShare: 0.36,
    secondaryScoringShare: 0.42,
    depthShare: 0.22,
    goalieStartShare: 0.75,
  },
  minimumTeamGoalsPerGame: 1.5,
  maximumTeamGoalsPerGame: 4.5,
  qualifiersCount: 0,
};

function assertUnit(name: string, value: number, min = 0, max = 1) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new AggregatedLeagueError(
      'InvalidAggregatedConfiguration',
      `${name} must be between ${min} and ${max}`,
    );
  }
}

export function validateAggregatedSeasonConfig(raw: unknown): AggregatedSeasonConfig {
  if (!raw || typeof raw !== 'object') {
    throw new AggregatedLeagueError('InvalidAggregatedConfiguration', 'Config must be an object');
  }
  const c = raw as Record<string, unknown>;
  const unknown = Object.keys(c).filter(
    (k) =>
      ![
        'schemaVersion',
        'simulationMode',
        'scheduleFormat',
        'gamesPerTeam',
        'homeAdvantage',
        'strengthRandomness',
        'scoreVariance',
        'overtimeRateTarget',
        'shootoutRateTarget',
        'statAllocation',
        'minimumTeamGoalsPerGame',
        'maximumTeamGoalsPerGame',
        'qualifiersCount',
        'seed',
      ].includes(k),
  );
  if (unknown.length > 0) {
    throw new AggregatedLeagueError(
      'InvalidAggregatedConfiguration',
      `Unknown config fields: ${unknown.join(', ')}`,
    );
  }

  const schemaVersion = c.schemaVersion ?? AGGREGATED_CONFIG_SCHEMA_VERSION;
  if (schemaVersion !== AGGREGATED_CONFIG_SCHEMA_VERSION) {
    throw new AggregatedLeagueError(
      'InvalidAggregatedConfiguration',
      `Unsupported aggregated config schemaVersion ${String(schemaVersion)}`,
    );
  }
  if (c.simulationMode !== 'AGGREGATED') {
    throw new AggregatedLeagueError(
      'InvalidAggregatedConfiguration',
      'simulationMode must be AGGREGATED',
    );
  }

  const scheduleFormat = c.scheduleFormat ?? DEFAULT_AGGREGATED_SEASON_CONFIG.scheduleFormat;
  if (
    scheduleFormat !== 'ROUND_ROBIN' &&
    scheduleFormat !== 'DOUBLE_ROUND_ROBIN' &&
    scheduleFormat !== 'BALANCED_CUSTOM'
  ) {
    throw new AggregatedLeagueError('InvalidAggregatedConfiguration', 'Invalid scheduleFormat');
  }

  const gamesPerTeam =
    c.gamesPerTeam === undefined || c.gamesPerTeam === null
      ? undefined
      : Number(c.gamesPerTeam);
  if (gamesPerTeam !== undefined) {
    if (!Number.isInteger(gamesPerTeam) || gamesPerTeam < 1 || gamesPerTeam > 200) {
      throw new AggregatedLeagueError(
        'InvalidAggregatedConfiguration',
        'gamesPerTeam must be an integer between 1 and 200',
      );
    }
  }
  if (scheduleFormat === 'BALANCED_CUSTOM' && gamesPerTeam === undefined) {
    throw new AggregatedLeagueError(
      'InvalidAggregatedConfiguration',
      'gamesPerTeam is required for BALANCED_CUSTOM',
    );
  }

  const homeAdvantage = Number(c.homeAdvantage ?? DEFAULT_AGGREGATED_SEASON_CONFIG.homeAdvantage);
  const strengthRandomness = Number(
    c.strengthRandomness ?? DEFAULT_AGGREGATED_SEASON_CONFIG.strengthRandomness,
  );
  const scoreVariance = Number(c.scoreVariance ?? DEFAULT_AGGREGATED_SEASON_CONFIG.scoreVariance);
  const overtimeRateTarget = Number(
    c.overtimeRateTarget ?? DEFAULT_AGGREGATED_SEASON_CONFIG.overtimeRateTarget,
  );
  const shootoutRateTarget = Number(
    c.shootoutRateTarget ?? DEFAULT_AGGREGATED_SEASON_CONFIG.shootoutRateTarget,
  );
  assertUnit('homeAdvantage', homeAdvantage, 0, 0.25);
  assertUnit('strengthRandomness', strengthRandomness);
  assertUnit('scoreVariance', scoreVariance);
  assertUnit('overtimeRateTarget', overtimeRateTarget);
  assertUnit('shootoutRateTarget', shootoutRateTarget);

  const allocRaw =
    (c.statAllocation as Record<string, unknown> | undefined) ??
    DEFAULT_AGGREGATED_SEASON_CONFIG.statAllocation;
  const topLineShare = Number(allocRaw.topLineShare);
  const secondaryScoringShare = Number(allocRaw.secondaryScoringShare);
  const depthShare = Number(allocRaw.depthShare);
  const goalieStartShare = Number(allocRaw.goalieStartShare);
  assertUnit('statAllocation.topLineShare', topLineShare);
  assertUnit('statAllocation.secondaryScoringShare', secondaryScoringShare);
  assertUnit('statAllocation.depthShare', depthShare);
  assertUnit('statAllocation.goalieStartShare', goalieStartShare);
  const shareSum = topLineShare + secondaryScoringShare + depthShare;
  if (Math.abs(shareSum - 1) > 1e-6) {
    throw new AggregatedLeagueError(
      'InvalidAggregatedConfiguration',
      'statAllocation skater shares must sum to 1',
    );
  }

  const minimumTeamGoalsPerGame = Number(
    c.minimumTeamGoalsPerGame ?? DEFAULT_AGGREGATED_SEASON_CONFIG.minimumTeamGoalsPerGame,
  );
  const maximumTeamGoalsPerGame = Number(
    c.maximumTeamGoalsPerGame ?? DEFAULT_AGGREGATED_SEASON_CONFIG.maximumTeamGoalsPerGame,
  );
  if (
    !Number.isFinite(minimumTeamGoalsPerGame) ||
    !Number.isFinite(maximumTeamGoalsPerGame) ||
    minimumTeamGoalsPerGame < 0 ||
    maximumTeamGoalsPerGame < minimumTeamGoalsPerGame ||
    maximumTeamGoalsPerGame > 12
  ) {
    throw new AggregatedLeagueError(
      'InvalidAggregatedConfiguration',
      'Invalid goals-per-game bounds',
    );
  }

  const qualifiersCount = Number(c.qualifiersCount ?? 0);
  if (!Number.isInteger(qualifiersCount) || qualifiersCount < 0) {
    throw new AggregatedLeagueError(
      'InvalidAggregatedConfiguration',
      'qualifiersCount must be a non-negative integer',
    );
  }

  return {
    schemaVersion: AGGREGATED_CONFIG_SCHEMA_VERSION,
    simulationMode: 'AGGREGATED',
    scheduleFormat,
    gamesPerTeam,
    homeAdvantage,
    strengthRandomness,
    scoreVariance,
    overtimeRateTarget,
    shootoutRateTarget,
    statAllocation: {
      topLineShare,
      secondaryScoringShare,
      depthShare,
      goalieStartShare,
    },
    minimumTeamGoalsPerGame,
    maximumTeamGoalsPerGame,
    qualifiersCount,
  };
}

export function parseAggregatedSeasonConfig(raw: unknown): AggregatedSeasonConfig {
  if (raw == null || (typeof raw === 'object' && Object.keys(raw as object).length === 0)) {
    return { ...DEFAULT_AGGREGATED_SEASON_CONFIG };
  }
  return validateAggregatedSeasonConfig(raw);
}
