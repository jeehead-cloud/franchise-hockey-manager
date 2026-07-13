import {
  defaultRuntimeSimulationSettings,
  isF14CompatibleBalanceConfig,
  SUPPORTED_LAB_COUNTS,
  validateRuntimeSimulationSettings,
  type LabBatchResult,
  type LabSideMode,
  type LabSimulationCount,
} from '@fhm/engine';
import { prisma } from '../db/client.js';
import {
  getActiveBalanceSnapshot,
  getBalancePresetVersion,
} from './balance-config.js';
import {
  assertSimulationLabEnabled,
  isSimulationLabEnabled,
  SIMULATION_LAB_LIMITS,
} from './simulation-lab-config.js';
import {
  cancelRun,
  createRun,
  getRun,
  type LabRunRecord,
} from './simulation-lab-runs.js';
import {
  buildValidationForTeam,
  lineupPresenceFromValidation,
  serializeAssignments,
  type LineupPlayerRow,
} from './lineup-helpers.js';
import { SimulationHttpError } from './simulation-input.js';
import { buildTeamReadiness, type TeamReadinessPlayerRow } from './team-readiness.js';

const SIDE_MODES: LabSideMode[] = ['FIXED', 'ALTERNATE'];

function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>): string {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','));
  }
  return `${lines.join('\n')}\n`;
}

export async function getLabOptions() {
  assertSimulationLabEnabled();

  const teams = await prisma.team.findMany({
    orderBy: { name: 'asc' },
    include: {
      coach: true,
      lineup: { include: { assignments: true } },
      players: {
        include: { skaterAttributes: true, goalieAttributes: true, secondaryPositions: true },
      },
    },
  });

  const eligibleTeams = teams
    .map((team) => {
      const assignments = team.lineup ? serializeAssignments(team.lineup.assignments) : [];
      const validation = buildValidationForTeam(team.players as LineupPlayerRow[], assignments);
      const presence = lineupPresenceFromValidation(Boolean(team.lineup), team.lineup ? validation : null);
      const readiness = buildTeamReadiness({
        hasHeadCoach: Boolean(team.coach),
        tacticalStyle: team.tacticalStyle,
        players: team.players as TeamReadinessPlayerRow[],
        lineupPresence: presence,
      });
      return {
        id: team.id,
        name: team.name,
        readiness: readiness.status,
      };
    })
    .filter((t) => t.readiness === 'READY');

  const active = await getActiveBalanceSnapshot();
  const versions = await prisma.balancePresetVersion.findMany({
    include: { preset: true, activeFor: true },
    orderBy: [{ preset: { name: 'asc' } }, { versionNumber: 'desc' }],
  });

  const balanceVersions = versions
    .map((row) => {
      let config;
      try {
        config = JSON.parse(row.configJson);
      } catch {
        return null;
      }
      if (!isF14CompatibleBalanceConfig(config)) return null;
      return {
        id: row.id,
        presetId: row.presetId,
        presetName: row.preset.name,
        versionNumber: row.versionNumber,
        schemaVersion: row.schemaVersion,
        configHash: row.configHash,
        isActive: Boolean(row.activeFor),
        changeReason: row.changeReason,
        createdAt: row.createdAt.toISOString(),
      };
    })
    .filter((v): v is NonNullable<typeof v> => v != null);

  return {
    enabled: isSimulationLabEnabled(),
    teams: eligibleTeams,
    activeBalance: {
      presetId: active.preset.id,
      presetName: active.preset.name,
      versionId: active.version.id,
      versionNumber: active.version.versionNumber,
      schemaVersion: active.version.schemaVersion,
      configHash: active.version.configHash,
      runtimeDefaults: active.runtimeDefaults,
    },
    balanceVersions,
    supportedCounts: [...SUPPORTED_LAB_COUNTS],
    sideModes: SIDE_MODES,
    limits: { ...SIMULATION_LAB_LIMITS },
  };
}

function publicRunView(run: LabRunRecord) {
  return {
    id: run.id,
    runId: run.id,
    status: run.status,
    progress: run.progress,
    result: run.result,
    error: run.error,
    isPartial: run.isPartial,
    startedAt: run.startedAt ? new Date(run.startedAt).toISOString() : null,
    completedAt: run.completedAt ? new Date(run.completedAt).toISOString() : null,
    createdAt: new Date(run.createdAt).toISOString(),
    request: run.request,
    baselineBalance: run.baselineBalance,
    comparisonBalance: run.comparisonBalance,
  };
}

async function resolveBalanceForLab(versionId: string | undefined) {
  if (versionId) {
    const version = await getBalancePresetVersion(versionId);
    if (!version) {
      throw new SimulationHttpError(404, 'BalanceVersionNotFound', 'Balance preset version not found', {
        balanceVersionId: versionId,
      });
    }
    if (!isF14CompatibleBalanceConfig(version.config)) {
      throw new SimulationHttpError(
        409,
        'IncompatibleBalanceConfiguration',
        'Balance configuration is not F14-compatible',
        { versionId: version.id, schemaVersion: version.schemaVersion },
      );
    }
    return {
      versionId: version.id,
      meta: {
        versionId: version.id,
        versionNumber: version.versionNumber,
        configHash: version.configHash,
        presetName: version.preset?.name ?? 'Unknown',
      },
      config: version.config,
      runtimeDefaults: version.runtimeDefaults,
    };
  }

  const active = await getActiveBalanceSnapshot();
  if (!isF14CompatibleBalanceConfig(active.config)) {
    throw new SimulationHttpError(
      409,
      'IncompatibleBalanceConfiguration',
      'Active balance configuration is not F14-compatible',
      { versionId: active.version.id, schemaVersion: active.version.schemaVersion },
    );
  }
  return {
    versionId: active.version.id,
    meta: {
      versionId: active.version.id,
      versionNumber: active.version.versionNumber,
      configHash: active.version.configHash,
      presetName: active.preset.name,
    },
    config: active.config,
    runtimeDefaults: active.runtimeDefaults,
  };
}

export async function createLabRun(body: unknown) {
  assertSimulationLabEnabled();

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new SimulationHttpError(400, 'InvalidSimulationLabRequest', 'Request body must be an object');
  }
  const raw = body as Record<string, unknown>;

  const teamAId = typeof raw.teamAId === 'string' ? raw.teamAId : '';
  const teamBId = typeof raw.teamBId === 'string' ? raw.teamBId : '';
  if (!teamAId || !teamBId) {
    throw new SimulationHttpError(400, 'InvalidSimulationLabRequest', 'teamAId and teamBId are required');
  }
  if (teamAId === teamBId) {
    throw new SimulationHttpError(400, 'InvalidSimulationLabRequest', 'Team A and Team B must differ');
  }

  const baseSeed = typeof raw.baseSeed === 'string' ? raw.baseSeed : '';
  if (!baseSeed) {
    throw new SimulationHttpError(400, 'InvalidSimulationLabRequest', 'baseSeed is required');
  }

  const simulationCount = raw.simulationCount as LabSimulationCount;
  if (!(SUPPORTED_LAB_COUNTS as readonly number[]).includes(simulationCount as number)) {
    throw new SimulationHttpError(
      400,
      'InvalidSimulationLabRequest',
      `simulationCount must be one of: ${SUPPORTED_LAB_COUNTS.join(', ')}`,
    );
  }

  const sideMode = raw.sideMode as LabSideMode;
  if (!SIDE_MODES.includes(sideMode)) {
    throw new SimulationHttpError(400, 'InvalidSimulationLabRequest', 'sideMode must be FIXED or ALTERNATE');
  }

  if (simulationCount > SIMULATION_LAB_LIMITS.maxCount) {
    throw new SimulationHttpError(
      400,
      'InvalidSimulationLabRequest',
      `simulationCount exceeds maxCount ${SIMULATION_LAB_LIMITS.maxCount}`,
    );
  }

  const baseline = await resolveBalanceForLab(
    typeof raw.baselineBalanceVersionId === 'string' ? raw.baselineBalanceVersionId : undefined,
  );
  const comparison =
    typeof raw.comparisonBalanceVersionId === 'string' && raw.comparisonBalanceVersionId
      ? await resolveBalanceForLab(raw.comparisonBalanceVersionId)
      : null;

  const defaults = defaultRuntimeSimulationSettings(baseline.config);
  let simulationRandomness: number | null = null;
  if (raw.runtimeSettings != null) {
    if (typeof raw.runtimeSettings !== 'object' || Array.isArray(raw.runtimeSettings)) {
      throw new SimulationHttpError(400, 'InvalidSimulationLabRequest', 'runtimeSettings must be an object');
    }
    const rs = raw.runtimeSettings as Record<string, unknown>;
    const merged = {
      simulationRandomness:
        typeof rs.simulationRandomness === 'number' ? rs.simulationRandomness : defaults.simulationRandomness,
      randomSeed: typeof rs.randomSeed === 'number' || rs.randomSeed === null ? rs.randomSeed : defaults.randomSeed,
      loggingLevel:
        typeof rs.loggingLevel === 'string' ? rs.loggingLevel : defaults.loggingLevel,
    };
    const validated = validateRuntimeSimulationSettings(merged);
    if (!validated.ok) {
      throw new SimulationHttpError(400, 'InvalidSimulationLabRequest', 'Invalid runtimeSettings', {
        errors: validated.errors,
      });
    }
    simulationRandomness = validated.settings.simulationRandomness;
  }

  const includeGameSummaries =
    typeof raw.includeGameSummaries === 'boolean' ? raw.includeGameSummaries : simulationCount <= 100;
  const includePlayerAggregates =
    typeof raw.includePlayerAggregates === 'boolean' ? raw.includePlayerAggregates : true;
  const includeLineAggregates =
    typeof raw.includeLineAggregates === 'boolean' ? raw.includeLineAggregates : true;

  // Readiness is enforced inside buildSimulationInput when the run starts;
  // fail fast here for obvious missing teams.
  const [teamA, teamB] = await Promise.all([
    prisma.team.findUnique({ where: { id: teamAId }, select: { id: true } }),
    prisma.team.findUnique({ where: { id: teamBId }, select: { id: true } }),
  ]);
  if (!teamA || !teamB) {
    throw new SimulationHttpError(404, 'TeamNotFound', 'Team A or Team B not found');
  }

  const run = createRun({
    teamAId,
    teamBId,
    baseSeed,
    simulationCount,
    sideMode,
    baselineBalanceVersionId: baseline.versionId,
    baselineBalance: baseline.meta,
    baselineConfig: baseline.config,
    comparisonBalanceVersionId: comparison?.versionId ?? null,
    comparisonBalance: comparison?.meta ?? null,
    comparisonConfig: comparison?.config ?? null,
    includeGameSummaries,
    includePlayerAggregates,
    includeLineAggregates,
    simulationRandomness,
  });

  return { runId: run.id, status: run.status };
}

export function getLabRun(runId: string) {
  assertSimulationLabEnabled();
  const run = getRun(runId);
  if (!run) {
    throw new SimulationHttpError(404, 'SimulationLabRunNotFound', 'Simulation Lab run not found', {
      runId,
    });
  }
  return publicRunView(run);
}

export function cancelLabRun(runId: string) {
  assertSimulationLabEnabled();
  return publicRunView(cancelRun(runId));
}

export function exportLabRunJson(run: LabRunRecord): string {
  if (!run.result) {
    throw new SimulationHttpError(409, 'InvalidSimulationLabRequest', 'Run has no result to export');
  }
  return JSON.stringify(
    {
      runId: run.id,
      status: run.status,
      request: run.request,
      result: run.result,
    },
    null,
    2,
  );
}

export function exportLabGamesCsv(result: LabBatchResult): string {
  const games = result.gameSummaries ?? [];
  return toCsv(
    [
      'gameIndex',
      'seed',
      'teamAWasHome',
      'winner',
      'decisionType',
      'teamAScore',
      'teamBScore',
      'teamARegulationScore',
      'teamBRegulationScore',
      'overtimeOccurred',
      'shootoutOccurred',
      'teamAShotsOnGoal',
      'teamBShotsOnGoal',
      'traceHash',
      'reconciliationPassed',
      'isUpset',
    ],
    games.map((g) => [
      g.gameIndex,
      g.seed,
      g.teamAWasHome,
      g.winner,
      g.decisionType,
      g.teamAScore,
      g.teamBScore,
      g.teamARegulationScore,
      g.teamBRegulationScore,
      g.overtimeOccurred,
      g.shootoutOccurred,
      g.teamAStats.shotsOnGoal,
      g.teamBStats.shotsOnGoal,
      g.traceHash,
      g.reconciliationPassed,
      g.isUpset,
    ]),
  );
}

export function exportLabPlayersCsv(result: LabBatchResult): string {
  return toCsv(
    [
      'playerId',
      'teamSide',
      'firstName',
      'lastName',
      'position',
      'lineupSlot',
      'games',
      'goals',
      'assists',
      'points',
      'shotsOnGoal',
      'shotAttempts',
      'penaltyMinutes',
      'powerPlayGoals',
      'shortHandedGoals',
      'pointsPerGame',
      'shootingPercentage',
      'isGoalie',
      'wins',
      'shotsAgainst',
      'saves',
      'goalsAgainst',
      'savePercentage',
      'shutouts',
    ],
    result.aggregate.players.map((p) => [
      p.playerId,
      p.teamSide,
      p.firstName,
      p.lastName,
      p.position,
      p.lineupSlot,
      p.games,
      p.goals,
      p.assists,
      p.points,
      p.shotsOnGoal,
      p.shotAttempts,
      p.penaltyMinutes,
      p.powerPlayGoals,
      p.shortHandedGoals,
      p.pointsPerGame,
      p.shootingPercentage,
      p.isGoalie,
      p.wins,
      p.shotsAgainst,
      p.saves,
      p.goalsAgainst,
      p.savePercentage,
      p.shutouts,
    ]),
  );
}

export function exportLabLinesCsv(result: LabBatchResult): string {
  return toCsv(
    [
      'unitKey',
      'teamSide',
      'games',
      'shiftCount',
      'goalsFor',
      'goalsAgainst',
      'goalDifferential',
      'averageEffectivePerformance',
      'playerIds',
    ],
    result.aggregate.units.map((u) => [
      u.unitKey,
      u.teamSide,
      u.games,
      u.shiftCount,
      u.goalsFor,
      u.goalsAgainst,
      u.goalDifferential,
      u.averageEffectivePerformance,
      u.playerIds.join('|'),
    ]),
  );
}

export function exportLabComparisonCsv(result: LabBatchResult): string {
  const deltas = result.comparison?.deltas ?? [];
  return toCsv(
    ['metric', 'baseline', 'comparison', 'delta'],
    deltas.map((d) => [d.metric, d.baseline, d.comparison, d.delta]),
  );
}

export function exportLabRun(runId: string, format: string): { contentType: string; body: string; filename: string } {
  assertSimulationLabEnabled();
  const run = getRun(runId);
  if (!run) {
    throw new SimulationHttpError(404, 'SimulationLabRunNotFound', 'Simulation Lab run not found', {
      runId,
    });
  }
  if (run.status !== 'COMPLETED' && run.status !== 'CANCELLED') {
    throw new SimulationHttpError(409, 'InvalidSimulationLabRequest', 'Run is not ready for export');
  }
  if (!run.result) {
    throw new SimulationHttpError(409, 'InvalidSimulationLabRequest', 'Run has no result to export');
  }

  switch (format) {
    case 'json':
      return {
        contentType: 'application/json; charset=utf-8',
        body: exportLabRunJson(run),
        filename: `lab-run-${runId}.json`,
      };
    case 'games-csv':
      return {
        contentType: 'text/csv; charset=utf-8',
        body: exportLabGamesCsv(run.result),
        filename: `lab-run-${runId}-games.csv`,
      };
    case 'players-csv':
      return {
        contentType: 'text/csv; charset=utf-8',
        body: exportLabPlayersCsv(run.result),
        filename: `lab-run-${runId}-players.csv`,
      };
    case 'lines-csv':
      return {
        contentType: 'text/csv; charset=utf-8',
        body: exportLabLinesCsv(run.result),
        filename: `lab-run-${runId}-lines.csv`,
      };
    case 'comparison-csv':
      return {
        contentType: 'text/csv; charset=utf-8',
        body: exportLabComparisonCsv(run.result),
        filename: `lab-run-${runId}-comparison.csv`,
      };
    default:
      throw new SimulationHttpError(
        400,
        'InvalidSimulationLabRequest',
        'format must be json, games-csv, players-csv, lines-csv, or comparison-csv',
      );
  }
}
