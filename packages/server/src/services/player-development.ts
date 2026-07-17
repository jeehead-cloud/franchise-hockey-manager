import { createHash } from 'node:crypto';
import {
  ageOnEffectiveDate,
  assertReconciliation,
  developPlayers,
  evaluateDevelopmentReadiness,
  hashDevelopmentPlayerInput,
  hashDevelopmentRunInput,
  hashPlayerDevelopmentConfig,
  PlayerDevelopmentError,
  type DevelopmentPlayerInput,
  type DevelopmentPlayerResult,
  type PlayerDevelopmentConfig,
} from '@fhm/engine';
import type { CommissionerAuditSource, Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { createSqliteSafetyBackup } from './sqlite-backup.js';
import {
  derivePublicPlayerModel,
  resolveModelStatus,
  type PlayerModelRow,
} from './player-model.js';
import {
  getActiveDevelopmentSnapshot,
  getDevelopmentPresetVersion,
} from './player-development-config.js';
import {
  birthDateUtcString,
  mapPreviewResult,
  mapResultRow,
  mapRunRow,
  mapRunSummary,
  playerDisplayName,
  type PlayerRowForDevelopment,
} from './player-development-dto.js';

export class DevelopmentHttpError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;
  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = code;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function wrapEngineError(err: unknown): never {
  if (err instanceof DevelopmentHttpError) throw err;
  if (err instanceof PlayerDevelopmentError) {
    const status =
      err.code === 'InvalidDevelopmentConfiguration' ||
      err.code === 'InvalidPlayerDevelopmentInput' ||
      err.code === 'DevelopmentReconciliationFailed'
        ? 422
        : 500;
    throw new DevelopmentHttpError(status, err.code, err.message, err.details);
  }
  throw err;
}

const PLAYER_INCLUDE = {
  currentTeam: { select: { name: true } },
  skaterAttributes: true,
  goalieAttributes: true,
} as const;

function stripAttrRow(
  row: { playerId?: string; createdAt?: Date; updatedAt?: Date } | null | undefined,
): Record<string, number> | null {
  if (!row) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'playerId' || k === 'createdAt' || k === 'updatedAt') continue;
    if (typeof v === 'number') out[k] = v;
  }
  return out;
}

function toModelRow(row: PlayerRowForDevelopment): PlayerModelRow {
  return {
    primaryPosition: row.primaryPosition,
    preferredCoachingStyle: row.preferredCoachingStyle,
    preferredTactics: row.preferredTactics,
    personality: row.personality,
    heroRating: row.heroRating,
    stability: row.stability,
    developmentRate: row.developmentRate,
    developmentRisk: row.developmentRisk,
    potentialFloor: row.potentialFloor,
    potentialCeiling: row.potentialCeiling,
    publicPotentialEstimate: row.publicPotentialEstimate,
    skaterAttributes: stripAttrRow(row.skaterAttributes ?? null) ?? undefined,
    goalieAttributes: stripAttrRow(row.goalieAttributes ?? null) ?? undefined,
  };
}

function hashAttributes(attrs: Record<string, number>): string {
  const keys = Object.keys(attrs).sort();
  const payload = keys.map((k) => `${k}:${attrs[k]}`).join('|');
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

export function mapPlayerToDevelopmentInput(
  row: PlayerRowForDevelopment,
  opts?: { includeRetired?: boolean },
): DevelopmentPlayerInput | null {
  if (row.rosterStatus === 'RETIRED' && !opts?.includeRetired) return null;
  const modelRow = toModelRow(row);
  if (resolveModelStatus(modelRow) !== 'COMPLETE') return null;

  const derived = derivePublicPlayerModel(modelRow);
  if (!derived) return null;

  const attrs =
    row.primaryPosition === 'G'
      ? (stripAttrRow(row.goalieAttributes ?? null) ?? {})
      : (stripAttrRow(row.skaterAttributes ?? null) ?? {});

  return {
    playerId: row.id,
    playerType: row.primaryPosition === 'G' ? 'GOALIE' : 'SKATER',
    birthDate: birthDateUtcString(row.dateOfBirth),
    position: row.primaryPosition,
    currentRole: derived.role.role,
    lifecycleStatus: row.rosterStatus,
    currentTeamId: row.currentTeamId,
    currentTeamName: row.currentTeam?.name ?? null,
    currentAbility: derived.ratings.currentAbility,
    potentialCeiling: row.potentialCeiling!,
    potentialFloor: row.potentialFloor!,
    form: row.form,
    attributes: attrs,
    contractStatus: 'UNKNOWN',
    sourceType: row.sourceType,
    developmentRate: row.developmentRate,
  };
}

async function loadEligiblePlayers(opts?: {
  includeRetired?: boolean;
  worldSeasonId?: string;
}): Promise<PlayerRowForDevelopment[]> {
  const rows = await prisma.player.findMany({
    where: opts?.includeRetired ? {} : { rosterStatus: { not: 'RETIRED' } },
    include: PLAYER_INCLUDE,
    orderBy: { id: 'asc' },
  });
  return rows;
}

function buildDevelopmentInputs(
  rows: PlayerRowForDevelopment[],
  opts?: { includeRetired?: boolean },
): DevelopmentPlayerInput[] {
  const inputs: DevelopmentPlayerInput[] = [];
  for (const row of rows) {
    const mapped = mapPlayerToDevelopmentInput(row, opts);
    if (mapped) inputs.push(mapped);
  }
  return inputs;
}

async function writeDevelopmentAudit(
  tx: Prisma.TransactionClient,
  entityId: string,
  action:
    | 'DEVELOPMENT_RUN_PREPARED'
    | 'DEVELOPMENT_RUN_CANCELLED'
    | 'DEVELOPMENT_RUN_STARTED'
    | 'DEVELOPMENT_RUN_COMPLETED'
    | 'DEVELOPMENT_RUN_FAILED',
  reason: string,
  before: unknown,
  after: unknown,
  changedFields: string[],
  source: CommissionerAuditSource,
) {
  await tx.commissionerAuditLog.create({
    data: {
      entityType: 'PLAYER_DEVELOPMENT_RUN',
      entityId,
      action,
      reason,
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(after),
      changedFieldsJson: JSON.stringify(changedFields),
      source,
      schemaVersion: 1,
    },
  });
}

async function assertNoCompletedRun(worldSeasonId: string) {
  const completed = await prisma.playerDevelopmentRun.findFirst({
    where: { worldSeasonId, status: 'COMPLETED', isCurrent: true },
  });
  if (completed) {
    throw new DevelopmentHttpError(
      409,
      'DevelopmentAlreadyApplied',
      'Official development already applied for this WorldSeason',
      { runId: completed.id },
    );
  }
}

async function assertNoActiveRun(worldSeasonId: string) {
  const active = await prisma.playerDevelopmentRun.findFirst({
    where: {
      worldSeasonId,
      status: { in: ['PREPARED', 'RUNNING'] },
    },
  });
  if (active) {
    throw new DevelopmentHttpError(
      409,
      active.status === 'RUNNING'
        ? 'DevelopmentRunAlreadyRunning'
        : 'DevelopmentRunAlreadyPrepared',
      `A ${active.status} development run already exists for this WorldSeason`,
      { runId: active.id },
    );
  }
}

async function resolveConfig(configVersionId?: string): Promise<{
  config: PlayerDevelopmentConfig;
  versionId: string;
  configHash: string;
}> {
  if (configVersionId) {
    const version = await getDevelopmentPresetVersion(configVersionId);
    if (!version) {
      throw new DevelopmentHttpError(
        404,
        'DevelopmentConfigVersionNotFound',
        'Development config version not found',
      );
    }
    return {
      config: version.config,
      versionId: version.id,
      configHash: version.configHash,
    };
  }
  const active = await getActiveDevelopmentSnapshot();
  return {
    config: active.config,
    versionId: active.version.id,
    configHash: active.version.configHash,
  };
}

function snapshotFromInput(
  row: PlayerRowForDevelopment,
  input: DevelopmentPlayerInput,
  effectiveDate: string,
): {
  attributesText: string;
  attributesHash: string;
  playerUpdatedAtSnapshot: Date;
  inputHash: string;
  roleSnapshot: string | null;
  currentAbilitySnapshot: number | null;
} {
  const attrs = input.attributes;
  return {
    attributesText: JSON.stringify(attrs),
    attributesHash: hashAttributes(attrs),
    playerUpdatedAtSnapshot: row.updatedAt,
    inputHash: hashDevelopmentPlayerInput(input),
    roleSnapshot: input.currentRole,
    currentAbilitySnapshot: input.currentAbility,
  };
}

function inputsFromPreSnapshots(
  snapshots: Array<{
    playerId: string;
    attributesText: string;
    formSnapshot: number;
    playerStatusSnapshot: string;
    roleSnapshot: string | null;
    currentAbilitySnapshot: number | null;
    potentialSnapshot: number | null;
    teamIdSnapshot: string | null;
    teamNameSnapshot: string | null;
    positionSnapshot: string;
    playerNameSnapshot: string;
    inputHash: string;
    player: {
      dateOfBirth: Date;
      sourceType: string;
      developmentRate: number | null;
      potentialFloor: number | null;
      potentialCeiling: number | null;
    };
  }>,
): DevelopmentPlayerInput[] {
  return snapshots.map((s) => {
    const attrs = JSON.parse(s.attributesText) as Record<string, number>;
    const isGoalie = s.positionSnapshot === 'G';
    return {
      playerId: s.playerId,
      playerType: isGoalie ? 'GOALIE' : 'SKATER',
      birthDate: birthDateUtcString(s.player.dateOfBirth),
      position: s.positionSnapshot,
      currentRole: s.roleSnapshot ?? 'UNKNOWN',
      lifecycleStatus: s.playerStatusSnapshot,
      currentTeamId: s.teamIdSnapshot,
      currentTeamName: s.teamNameSnapshot,
      currentAbility: s.currentAbilitySnapshot ?? 0,
      potentialCeiling: s.potentialSnapshot ?? s.player.potentialCeiling ?? 0,
      potentialFloor: s.player.potentialFloor ?? 0,
      form: s.formSnapshot,
      attributes: attrs,
      contractStatus: 'UNKNOWN' as const,
      sourceType: s.player.sourceType,
      developmentRate: s.player.developmentRate,
    };
  });
}

async function verifyLiveMatchesPreSnapshots(
  runId: string,
  db: typeof prisma | Prisma.TransactionClient = prisma,
): Promise<void> {
  const preSnaps = await db.playerSeasonSnapshot.findMany({
    where: { runId, snapshotType: 'PRE_DEVELOPMENT' },
    include: {
      player: {
        include: { skaterAttributes: true, goalieAttributes: true },
      },
    },
  });

  const stale: Array<{ playerId: string; reason: string }> = [];
  for (const snap of preSnaps) {
    const player = snap.player;
    if (!player) {
      stale.push({ playerId: snap.playerId, reason: 'player_missing' });
      continue;
    }
    if (player.updatedAt.getTime() !== snap.playerUpdatedAtSnapshot.getTime()) {
      stale.push({ playerId: snap.playerId, reason: 'updatedAt_changed' });
      continue;
    }
    const modelRow = toModelRow(player as PlayerRowForDevelopment);
    const input = mapPlayerToDevelopmentInput(player as PlayerRowForDevelopment, {
      includeRetired: snap.playerStatusSnapshot === 'RETIRED',
    });
    if (!input) {
      stale.push({ playerId: snap.playerId, reason: 'model_incomplete' });
      continue;
    }
    const liveHash = hashAttributes(input.attributes);
    if (liveHash !== snap.attributesHash) {
      stale.push({ playerId: snap.playerId, reason: 'attributes_changed' });
      continue;
    }
    if (player.form !== snap.formSnapshot) {
      stale.push({ playerId: snap.playerId, reason: 'form_changed' });
      continue;
    }
    if (player.rosterStatus !== snap.playerStatusSnapshot) {
      stale.push({ playerId: snap.playerId, reason: 'status_changed' });
      continue;
    }
    if (hashDevelopmentPlayerInput(input) !== snap.inputHash) {
      stale.push({ playerId: snap.playerId, reason: 'input_hash_changed' });
      continue;
    }
    void modelRow;
  }

  if (stale.length > 0) {
    throw new DevelopmentHttpError(
      409,
      'DevelopmentInputStale',
      'Player state changed after preparation; discard and re-prepare',
      { stalePlayers: stale },
    );
  }
}

export async function getDevelopmentStatus(worldSeasonId?: string) {
  const season =
    worldSeasonId != null
      ? await prisma.worldSeason.findUnique({ where: { id: worldSeasonId } })
      : await prisma.worldSeason.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!season) return null;

  const currentRun = await prisma.playerDevelopmentRun.findFirst({
    where: { worldSeasonId: season.id, isCurrent: true, status: 'COMPLETED' },
    orderBy: { completedAt: 'desc' },
  });
  const preparedRun = await prisma.playerDevelopmentRun.findFirst({
    where: { worldSeasonId: season.id, status: { in: ['PREPARED', 'RUNNING'] } },
    orderBy: { createdAt: 'desc' },
  });

  const activeConfig = await getActiveDevelopmentSnapshot();

  return {
    worldSeason: {
      id: season.id,
      label: season.label,
      status: season.status,
      phase: season.phase,
      updatedAt: season.updatedAt.toISOString(),
    },
    activeConfig: {
      presetName: activeConfig.preset.name,
      versionId: activeConfig.version.id,
      versionNumber: activeConfig.version.versionNumber,
      configHash: activeConfig.version.configHash,
    },
    currentCompletedRun: currentRun ? mapRunRow(currentRun) : null,
    activeRun: preparedRun ? mapRunRow(preparedRun) : null,
    developmentApplied: Boolean(currentRun),
  };
}

export async function getDevelopmentReadiness(input: {
  worldSeasonId: string;
  effectiveDate?: string;
  configVersionId?: string;
}) {
  const season = await prisma.worldSeason.findUnique({ where: { id: input.worldSeasonId } });
  if (!season) {
    throw new DevelopmentHttpError(404, 'WorldSeasonNotFound', 'WorldSeason not found');
  }

  const completed = await prisma.playerDevelopmentRun.findFirst({
    where: { worldSeasonId: season.id, status: 'COMPLETED', isCurrent: true },
  });
  const activeRun = await prisma.playerDevelopmentRun.findFirst({
    where: { worldSeasonId: season.id, status: { in: ['PREPARED', 'RUNNING'] } },
  });

  let config: PlayerDevelopmentConfig | null = null;
  try {
    const resolved = await resolveConfig(input.configVersionId);
    config = resolved.config;
  } catch (err) {
    if (!(err instanceof DevelopmentHttpError)) throw err;
    if (err.code !== 'DevelopmentConfigVersionNotFound') throw err;
  }

  const rows = await loadEligiblePlayers();
  const players = buildDevelopmentInputs(rows);

  let backupAvailable = true;
  try {
    const url = process.env.DATABASE_URL ?? '';
    if (!url.startsWith('file:')) backupAvailable = false;
  } catch {
    backupAvailable = false;
  }

  const readiness = evaluateDevelopmentReadiness({
    worldSeasonExists: true,
    hasCompletedOfficialRun: Boolean(completed),
    hasPreparedOrRunningRun: Boolean(activeRun),
    config,
    effectiveDate: input.effectiveDate ?? null,
    players,
    backupAvailable,
  });

  return {
    worldSeasonId: season.id,
    effectiveDate: input.effectiveDate ?? null,
    ...readiness,
  };
}

export async function previewDevelopment(input: {
  worldSeasonId: string;
  effectiveDate: string;
  baseSeed: string;
  configVersionId?: string;
  includeRetiredPlayers?: boolean;
  page?: number;
  pageSize?: number;
  includePotential?: boolean;
}) {
  const season = await prisma.worldSeason.findUnique({ where: { id: input.worldSeasonId } });
  if (!season) {
    throw new DevelopmentHttpError(404, 'WorldSeasonNotFound', 'WorldSeason not found');
  }
  if (!input.effectiveDate || !input.baseSeed) {
    throw new DevelopmentHttpError(
      400,
      'InvalidPlayerDevelopmentRequest',
      'effectiveDate and baseSeed are required',
    );
  }

  const { config, configHash } = await resolveConfig(input.configVersionId);
  const rows = await loadEligiblePlayers({ includeRetired: input.includeRetiredPlayers });
  const players = buildDevelopmentInputs(rows, { includeRetired: input.includeRetiredPlayers });

  if (players.length === 0) {
    throw new DevelopmentHttpError(
      422,
      'PlayerDevelopmentNotReady',
      'No eligible players for development preview',
    );
  }

  let output;
  try {
    output = developPlayers({
      players,
      config,
      worldSeasonId: season.id,
      effectiveDate: input.effectiveDate,
      baseSeed: input.baseSeed,
      includeRetiredPlayers: input.includeRetiredPlayers,
    });
  } catch (err) {
    wrapEngineError(err);
  }

  const byId = new Map(rows.map((r) => [r.id, r]));
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, input.pageSize ?? 50));
  const skip = (page - 1) * pageSize;
  const slice = output.results.slice(skip, skip + pageSize);

  return {
    preview: true,
    worldSeasonId: season.id,
    effectiveDate: input.effectiveDate,
    baseSeed: input.baseSeed,
    configHash,
    summary: mapRunSummary(output.summary),
    items: slice.map((r) => {
      const row = byId.get(r.playerId);
      return mapPreviewResult(
        r,
        row ? playerDisplayName(row) : r.playerId,
        row?.currentTeamId ?? null,
        row?.currentTeam?.name ?? null,
        { includePotential: input.includePotential },
      );
    }),
    page,
    pageSize,
    total: output.results.length,
  };
}

export async function prepareDevelopmentRun(
  input: {
    worldSeasonId: string;
    expectedWorldSeasonUpdatedAt: string;
    effectiveDate: string;
    baseSeed: string;
    configVersionId?: string;
    reason: string;
    includeRetiredPlayers?: boolean;
  },
  source: CommissionerAuditSource,
) {
  const season = await prisma.worldSeason.findUnique({ where: { id: input.worldSeasonId } });
  if (!season) {
    throw new DevelopmentHttpError(404, 'WorldSeasonNotFound', 'WorldSeason not found');
  }
  if (season.updatedAt.toISOString() !== input.expectedWorldSeasonUpdatedAt) {
    throw new DevelopmentHttpError(
      409,
      'InvalidPlayerDevelopmentRequest',
      'WorldSeason was modified elsewhere; reload and retry',
      { currentUpdatedAt: season.updatedAt.toISOString() },
    );
  }

  await assertNoCompletedRun(season.id);
  await assertNoActiveRun(season.id);

  const { config, versionId, configHash } = await resolveConfig(input.configVersionId);
  const rows = await loadEligiblePlayers({ includeRetired: input.includeRetiredPlayers });
  const players = buildDevelopmentInputs(rows, { includeRetired: input.includeRetiredPlayers });

  if (players.length === 0) {
    throw new DevelopmentHttpError(
      422,
      'PlayerDevelopmentNotReady',
      'No eligible players to prepare',
    );
  }

  const configHashCheck = hashPlayerDevelopmentConfig(config);
  const playerInputHashes = players.map((p) => hashDevelopmentPlayerInput(p));
  const inputHash = hashDevelopmentRunInput({
    worldSeasonId: season.id,
    effectiveDate: input.effectiveDate,
    baseSeed: input.baseSeed,
    configHash: configHashCheck,
    playerInputHashes,
  });

  const latest = await prisma.playerDevelopmentRun.findFirst({
    where: { worldSeasonId: season.id },
    orderBy: { runVersion: 'desc' },
  });
  const runVersion = (latest?.runVersion ?? 0) + 1;

  const byInput = new Map(players.map((p) => [p.playerId, p]));

  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.playerDevelopmentRun.create({
      data: {
        worldSeasonId: season.id,
        status: 'PREPARED',
        runVersion,
        effectiveDate: input.effectiveDate,
        baseSeed: input.baseSeed,
        configVersionId: versionId,
        configHash: configHashCheck,
        inputHash,
        totalPlayers: players.length,
        isCurrent: false,
      },
    });

    for (const row of rows) {
      const mapped = mapPlayerToDevelopmentInput(row, {
        includeRetired: input.includeRetiredPlayers,
      });
      if (!mapped) continue;
      const snap = snapshotFromInput(row, mapped, input.effectiveDate);
      await tx.playerSeasonSnapshot.create({
        data: {
          playerId: row.id,
          worldSeasonId: season.id,
          runId: created.id,
          snapshotType: 'PRE_DEVELOPMENT',
          snapshotDate: input.effectiveDate,
          playerNameSnapshot: playerDisplayName(row),
          teamIdSnapshot: row.currentTeamId,
          teamNameSnapshot: row.currentTeam?.name ?? null,
          playerStatusSnapshot: row.rosterStatus,
          positionSnapshot: row.primaryPosition,
          roleSnapshot: snap.roleSnapshot,
          currentAbilitySnapshot: snap.currentAbilitySnapshot,
          potentialSnapshot: row.potentialCeiling,
          formSnapshot: row.form,
          attributesText: snap.attributesText,
          attributesHash: snap.attributesHash,
          playerUpdatedAtSnapshot: snap.playerUpdatedAtSnapshot,
          inputHash: snap.inputHash,
        },
      });
      void byInput;
    }

    await writeDevelopmentAudit(
      tx,
      created.id,
      'DEVELOPMENT_RUN_PREPARED',
      input.reason,
      null,
      {
        runId: created.id,
        inputHash,
        configHash: configHashCheck,
        totalPlayers: players.length,
      },
      ['run', 'snapshots'],
      source,
    );

    return created;
  });

  return {
    run: mapRunRow(run),
    eligiblePlayers: players.length,
    inputHash,
    configHash: configHashCheck,
  };
}

export async function discardPreparedDevelopmentRun(
  runId: string,
  body: { reason: string },
  source: CommissionerAuditSource,
) {
  const run = await prisma.playerDevelopmentRun.findUnique({ where: { id: runId } });
  if (!run) {
    throw new DevelopmentHttpError(
      404,
      'PlayerDevelopmentRunNotFound',
      'Development run not found',
    );
  }
  if (run.status === 'COMPLETED') {
    throw new DevelopmentHttpError(
      409,
      'DevelopmentRunCompleted',
      'Completed development runs cannot be discarded',
    );
  }
  if (run.status !== 'PREPARED' && run.status !== 'RUNNING') {
    throw new DevelopmentHttpError(
      409,
      'DevelopmentCorrectionNotAllowed',
      `Run status ${run.status} cannot be discarded`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.playerSeasonSnapshot.deleteMany({
      where: { runId, snapshotType: 'PRE_DEVELOPMENT' },
    });
    await tx.playerDevelopmentRun.update({
      where: { id: runId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    await writeDevelopmentAudit(
      tx,
      runId,
      'DEVELOPMENT_RUN_CANCELLED',
      body.reason,
      { status: run.status },
      { status: 'CANCELLED' },
      ['status'],
      source,
    );
  });

  return { discarded: true, runId };
}

async function publishPlayerUpdates(
  tx: Prisma.TransactionClient,
  result: DevelopmentPlayerResult,
  row: PlayerRowForDevelopment,
) {
  const data = result.attributesAfter;
  if (result.playerType === 'GOALIE') {
    await tx.goalieAttributes.update({
      where: { playerId: result.playerId },
      data: {
        reflexes: data.reflexes!,
        positioning: data.positioning!,
        reboundControl: data.reboundControl!,
        glove: data.glove!,
        blocker: data.blocker!,
        movement: data.movement!,
        puckHandling: data.puckHandling!,
        consistency: data.consistency!,
        stamina: data.stamina!,
      },
    });
  } else {
    await tx.skaterAttributes.update({
      where: { playerId: result.playerId },
      data: {
        stickhandling: data.stickhandling!,
        shooting: data.shooting!,
        passing: data.passing!,
        strength: data.strength!,
        speed: data.speed!,
        balance: data.balance!,
        aggression: data.aggression!,
        offensiveAwareness: data.offensiveAwareness!,
        defensiveAwareness: data.defensiveAwareness!,
      },
    });
  }

  await tx.player.update({
    where: { id: result.playerId },
    data: {
      form: result.form.formAfter,
      rosterStatus: result.retired ? 'RETIRED' : (row.rosterStatus as never),
    },
  });
}

export async function executeDevelopmentRun(
  runId: string,
  body: { confirmation?: boolean; reason: string },
  source: CommissionerAuditSource,
) {
  if (!body.confirmation) {
    throw new DevelopmentHttpError(
      400,
      'InvalidPlayerDevelopmentRequest',
      'confirmation: true is required',
    );
  }

  const run = await prisma.playerDevelopmentRun.findUnique({ where: { id: runId } });
  if (!run) {
    throw new DevelopmentHttpError(
      404,
      'PlayerDevelopmentRunNotFound',
      'Development run not found',
    );
  }
  if (run.status === 'COMPLETED') {
    throw new DevelopmentHttpError(
      409,
      'DevelopmentRunCompleted',
      'Development run already completed',
    );
  }
  if (run.status !== 'PREPARED') {
    throw new DevelopmentHttpError(
      409,
      'DevelopmentCorrectionNotAllowed',
      `Run status ${run.status} cannot be executed`,
    );
  }

  await assertNoCompletedRun(run.worldSeasonId);

  let backupPath: string | null = null;
  try {
    const backup = await createSqliteSafetyBackup({ label: 'f24-development', sourceOperationType: 'PLAYER_DEVELOPMENT', sourceOperationId: run.id });
    backupPath = backup.relativeDisplayPath;
  } catch (err) {
    throw new DevelopmentHttpError(
      503,
      'BackupFailed',
      err instanceof Error ? err.message : 'Backup failed',
    );
  }

  await verifyLiveMatchesPreSnapshots(runId);

  const version = await getDevelopmentPresetVersion(run.configVersionId);
  if (!version) {
    throw new DevelopmentHttpError(
      404,
      'DevelopmentConfigVersionNotFound',
      'Development config version not found',
    );
  }
  const config = version.config;

  const preSnaps = await prisma.playerSeasonSnapshot.findMany({
    where: { runId, snapshotType: 'PRE_DEVELOPMENT' },
    include: {
      player: {
        include: PLAYER_INCLUDE,
      },
    },
    orderBy: { playerId: 'asc' },
  });

  const players = inputsFromPreSnapshots(preSnaps);
  const eligiblePlayerIds = players.map((p) => p.playerId);
  const inputsByPlayerId = new Map(players.map((p) => [p.playerId, p]));

  await prisma.playerDevelopmentRun.update({
    where: { id: runId },
    data: { status: 'RUNNING', startedAt: new Date(), backupPath },
  });

  let output;
  try {
    output = developPlayers({
      players,
      config,
      worldSeasonId: run.worldSeasonId,
      effectiveDate: run.effectiveDate,
      baseSeed: run.baseSeed,
    });
  } catch (err) {
    await prisma.playerDevelopmentRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        failureReason: err instanceof Error ? err.message : 'Development failed',
      },
    });
    wrapEngineError(err);
  }

  if (output.summary.inputHash !== run.inputHash) {
    await prisma.playerDevelopmentRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        failureReason: 'Prepared input hash mismatch on execution',
      },
    });
    throw new DevelopmentHttpError(
      422,
      'DevelopmentReconciliationFailed',
      'Prepared input hash mismatch on execution',
    );
  }

  try {
    assertReconciliation({
      eligiblePlayerIds,
      results: output.results,
      inputsByPlayerId,
      config,
    });
  } catch (err) {
    await prisma.playerDevelopmentRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        failureReason: err instanceof Error ? err.message : 'Reconciliation failed',
      },
    });
    wrapEngineError(err);
  }

  const playerRows = new Map(
    preSnaps.map((s) => [s.playerId, s.player as PlayerRowForDevelopment]),
  );

  try {
    const published = await prisma.$transaction(async (tx) => {
      await verifyLiveMatchesPreSnapshots(runId, tx);

      for (const result of output.results) {
        const row = playerRows.get(result.playerId);
        if (!row) {
          throw new DevelopmentHttpError(
            422,
            'DevelopmentReconciliationFailed',
            `Missing player row for ${result.playerId}`,
          );
        }
        await publishPlayerUpdates(tx, result, row);

        await tx.playerSeasonSnapshot.create({
          data: {
            playerId: result.playerId,
            worldSeasonId: run.worldSeasonId,
            runId,
            snapshotType: 'POST_DEVELOPMENT',
            snapshotDate: run.effectiveDate,
            playerNameSnapshot: playerDisplayName(row),
            teamIdSnapshot: row.currentTeamId,
            teamNameSnapshot: row.currentTeam?.name ?? null,
            playerStatusSnapshot: result.retired ? 'RETIRED' : row.rosterStatus,
            positionSnapshot: row.primaryPosition,
            roleSnapshot: result.roleAfter,
            currentAbilitySnapshot: result.currentAbilityAfter,
            potentialSnapshot: row.potentialCeiling,
            formSnapshot: result.form.formAfter,
            attributesText: JSON.stringify(result.attributesAfter),
            attributesHash: hashAttributes(result.attributesAfter),
            playerUpdatedAtSnapshot: new Date(),
            inputHash: result.resultHash,
          },
        });

        await tx.playerDevelopmentResult.create({
          data: {
            runId,
            playerId: result.playerId,
            playerNameSnapshot: playerDisplayName(row),
            playerType: result.playerType,
            positionSnapshot: row.primaryPosition,
            teamIdSnapshot: row.currentTeamId,
            teamNameSnapshot: row.currentTeam?.name ?? null,
            ageBefore: ageOnEffectiveDate(
              birthDateUtcString(row.dateOfBirth),
              run.effectiveDate,
            ),
            ageOnEffectiveDate: result.ageOnEffectiveDate,
            lifecycleBefore: result.lifecycleBefore,
            lifecycleAfter: result.lifecycleAfter,
            currentAbilityBefore: result.currentAbilityBefore,
            currentAbilityAfter: result.currentAbilityAfter,
            potentialSnapshot: row.potentialCeiling!,
            roleBefore: result.roleBefore,
            roleAfter: result.roleAfter,
            formBefore: result.form.formBefore,
            formAfter: result.form.formAfter,
            developmentBudget: result.budget.finalBudget,
            usedBudget: result.usedBudget,
            unusedBudget: result.unusedBudget,
            outcome: result.outcome,
            retired: result.retired,
            retirementReasonText: result.retirement?.reasonText ?? null,
            attributeChangesText: JSON.stringify(result.attributeChanges),
            diagnosticsText: JSON.stringify({
              budget: result.budget,
              direction: result.direction,
              warnings: result.warnings,
              retirement: result.retirement,
            }),
            inputHash: hashDevelopmentPlayerInput(inputsByPlayerId.get(result.playerId)!),
            resultHash: result.resultHash,
          },
        });
      }

      const updated = await tx.playerDevelopmentRun.update({
        where: { id: runId },
        data: {
          status: 'COMPLETED',
          isCurrent: true,
          completedAt: new Date(),
          resultHash: output.summary.resultHash,
          developedCount: output.summary.developedCount,
          declinedCount: output.summary.declinedCount,
          stableCount: output.summary.stableCount,
          retiredCount: output.summary.retiredCount,
          warningCount: output.summary.warningCount,
          totalPlayers: output.summary.totalPlayers,
        },
      });

      await writeDevelopmentAudit(
        tx,
        runId,
        'DEVELOPMENT_RUN_COMPLETED',
        body.reason,
        { status: 'RUNNING', inputHash: run.inputHash },
        {
          status: 'COMPLETED',
          resultHash: output.summary.resultHash,
          totalPlayers: output.summary.totalPlayers,
        },
        ['players', 'results', 'snapshots'],
        source,
      );

      return updated;
    });

    return {
      run: mapRunRow(published),
      summary: mapRunSummary(output.summary),
      backupPath,
    };
  } catch (err) {
    if (err instanceof DevelopmentHttpError && err.code === 'DevelopmentInputStale') {
      await prisma.playerDevelopmentRun.update({
        where: { id: runId },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          failureReason: 'DevelopmentInputStale',
        },
      });
      await prisma.commissionerAuditLog.create({
        data: {
          entityType: 'PLAYER_DEVELOPMENT_RUN',
          entityId: runId,
          action: 'DEVELOPMENT_RUN_FAILED',
          reason: body.reason,
          beforeJson: JSON.stringify({ status: 'RUNNING' }),
          afterJson: JSON.stringify({ status: 'FAILED', failureReason: 'DevelopmentInputStale' }),
          changedFieldsJson: JSON.stringify(['status']),
          source,
          schemaVersion: 1,
        },
      });
    }
    throw err;
  }
}

export async function listDevelopmentRuns(worldSeasonId: string) {
  const season = await prisma.worldSeason.findUnique({ where: { id: worldSeasonId } });
  if (!season) return null;
  const runs = await prisma.playerDevelopmentRun.findMany({
    where: { worldSeasonId },
    orderBy: { runVersion: 'desc' },
  });
  return { items: runs.map(mapRunRow) };
}

export async function getDevelopmentRun(runId: string) {
  const run = await prisma.playerDevelopmentRun.findUnique({ where: { id: runId } });
  if (!run) return null;
  return mapRunRow(run);
}

export async function listDevelopmentResults(
  runId: string,
  query?: { page?: number; pageSize?: number; outcome?: string; includePotential?: boolean },
) {
  const run = await prisma.playerDevelopmentRun.findUnique({ where: { id: runId } });
  if (!run) return null;

  const page = Math.max(1, query?.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, query?.pageSize ?? 50));
  const where = {
    runId,
    ...(query?.outcome ? { outcome: query.outcome as never } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.playerDevelopmentResult.count({ where }),
    prisma.playerDevelopmentResult.findMany({
      where,
      orderBy: [{ outcome: 'asc' }, { playerNameSnapshot: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    items: rows.map((r) =>
      mapResultRow(r, {
        includePotential: query?.includePotential,
        potentialSnapshot: r.potentialSnapshot,
      }),
    ),
    page,
    pageSize,
    total,
  };
}

export async function listDevelopmentRetirements(runId: string) {
  const run = await prisma.playerDevelopmentRun.findUnique({ where: { id: runId } });
  if (!run) return null;
  const rows = await prisma.playerDevelopmentResult.findMany({
    where: { runId, retired: true },
    orderBy: { playerNameSnapshot: 'asc' },
  });
  return {
    items: rows.map((r) => ({
      playerId: r.playerId,
      playerName: r.playerNameSnapshot,
      teamId: r.teamIdSnapshot,
      teamName: r.teamNameSnapshot,
      ageOnEffectiveDate: r.ageOnEffectiveDate,
      currentAbilityBefore: r.currentAbilityBefore,
      currentAbilityAfter: r.currentAbilityAfter,
      retirementReason: r.retirementReasonText,
      outcome: r.outcome,
    })),
    total: rows.length,
  };
}

export async function getPlayerDevelopmentHistory(
  playerId: string,
  opts?: { includePotential?: boolean },
) {
  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player) return null;

  const results = await prisma.playerDevelopmentResult.findMany({
    where: { playerId },
    include: { run: true },
    orderBy: { createdAt: 'desc' },
  });

  const snapshots = await prisma.playerSeasonSnapshot.findMany({
    where: { playerId },
    orderBy: { createdAt: 'desc' },
  });

  return {
    playerId,
    playerName: playerDisplayName(player),
    results: results.map((r) => ({
      ...mapResultRow(r, {
        includePotential: opts?.includePotential,
        potentialSnapshot: r.potentialSnapshot,
      }),
      effectiveDate: r.run.effectiveDate,
      runStatus: r.run.status,
      runCompletedAt: r.run.completedAt?.toISOString() ?? null,
    })),
    snapshots: snapshots.map((s) => ({
      id: s.id,
      runId: s.runId,
      worldSeasonId: s.worldSeasonId,
      snapshotType: s.snapshotType,
      snapshotDate: s.snapshotDate,
      role: s.roleSnapshot,
      currentAbility: s.currentAbilitySnapshot,
      form: s.formSnapshot,
      playerStatus: s.playerStatusSnapshot,
      attributesHash: s.attributesHash,
      createdAt: s.createdAt.toISOString(),
      ...(opts?.includePotential && s.potentialSnapshot != null
        ? { potentialCeiling: s.potentialSnapshot }
        : {}),
    })),
  };
}

export async function getDevelopmentRunDiagnostics(runId: string) {
  const run = await prisma.playerDevelopmentRun.findUnique({
    where: { id: runId },
    include: {
      configVersion: { include: { preset: true } },
      results: { take: 5, orderBy: { currentAbilityAfter: 'desc' } },
    },
  });
  if (!run) return null;

  return {
    run: mapRunRow(run),
    config: {
      presetName: run.configVersion.preset.name,
      versionNumber: run.configVersion.versionNumber,
      configHash: run.configVersion.configHash,
    },
    sampleTopChanges: run.results.map((r) => ({
      playerId: r.playerId,
      playerName: r.playerNameSnapshot,
      abilityDelta: r.currentAbilityAfter - r.currentAbilityBefore,
      outcome: r.outcome,
      retired: r.retired,
      diagnostics: JSON.parse(r.diagnosticsText),
    })),
  };
}
