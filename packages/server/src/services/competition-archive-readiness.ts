import type { PrismaClient } from '@prisma/client';
import {
  computeSourceSnapshotHash,
  type ArchiveReadinessCheck,
  type ArchiveReadinessResult,
} from '@fhm/engine';
import { prisma } from '../db/client.js';

type Db = PrismaClient | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/**
 * Deterministic archive readiness for a CompetitionEdition.
 */
export async function getArchiveReadiness(
  editionId: string,
  db: Db = prisma,
): Promise<ArchiveReadinessResult | null> {
  const edition = await db.competitionEdition.findUnique({
    where: { id: editionId },
    include: {
      participants: { orderBy: { participantOrder: 'asc' } },
      stages: {
        orderBy: { stageOrder: 'asc' },
        include: {
          standings: true,
          teamStats: true,
          playerStats: true,
          playoffSeries: true,
        },
      },
      matches: {
        where: { source: 'COMPETITION' },
        include: { results: true },
      },
      archives: { where: { isCurrent: true }, take: 1 },
    },
  });
  if (!edition) return null;

  const checks: ArchiveReadinessCheck[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];

  const pass = (id: string, message: string) => checks.push({ id, status: 'PASS', message });
  const warn = (id: string, message: string) => {
    checks.push({ id, status: 'WARN', message });
    warnings.push(message);
  };
  const fail = (id: string, message: string) => {
    checks.push({ id, status: 'FAIL', message });
    blockers.push(message);
  };

  if (edition.status === 'ARCHIVED' && edition.archives.length > 0) {
    pass('status', 'Edition already ARCHIVED with a current archive');
  } else if (edition.status !== 'COMPLETED') {
    fail('status', `Edition status must be COMPLETED (current: ${edition.status})`);
  } else {
    pass('status', 'Edition status is COMPLETED');
  }

  const requiredStages = edition.stages.filter((s) => s.status !== 'CANCELLED');
  const incomplete = requiredStages.filter((s) => s.status !== 'COMPLETED');
  if (incomplete.length > 0) {
    fail(
      'stages',
      `Incomplete stages: ${incomplete.map((s) => s.name).join(', ')}`,
    );
  } else {
    pass('stages', `All ${requiredStages.length} required stages are COMPLETED`);
  }

  const rsStages = requiredStages.filter((s) => s.stageType === 'REGULAR_SEASON');
  for (const stage of rsStages) {
    if (stage.standings.length === 0) {
      fail('standings', `Regular-season stage ${stage.name} has no final standings`);
    } else {
      pass('standings', `Standings present for ${stage.name}`);
    }
    if (stage.teamStats.length === 0 || stage.playerStats.length === 0) {
      fail('stats', `Final stage-stat snapshots missing for ${stage.name}`);
    } else {
      pass('stats', `Team/player stats present for ${stage.name}`);
    }
  }

  const playoffStages = requiredStages.filter(
    (s) => s.stageType === 'BEST_OF_SERIES' || s.stageType === 'KNOCKOUT',
  );
  let championParticipantId: string | null = null;
  for (const stage of playoffStages) {
    if (!stage.championParticipantId) {
      fail('champion', `Playoff stage ${stage.name} has no champion`);
    } else {
      championParticipantId = stage.championParticipantId;
      pass('champion', `Champion recorded for ${stage.name}`);
    }
  }
  if (playoffStages.length === 0) {
    warn('champion', 'No playoff stage — champion award will be omitted');
  }

  const openMatches = edition.matches.filter(
    (m) => m.status === 'PREPARED' || m.status === 'SIMULATING' || m.status === 'FAILED',
  );
  if (openMatches.length > 0) {
    fail('matches_open', `${openMatches.length} official matches are not completed`);
  } else {
    pass('matches_open', 'No unresolved official matches');
  }

  const missingResult = edition.matches.filter(
    (m) => m.status === 'COMPLETED' && !m.currentResultId,
  );
  if (missingResult.length > 0) {
    fail('matches_result', `${missingResult.length} completed matches lack currentResultId`);
  } else {
    pass('matches_result', 'Every completed official match has a current result');
  }

  const supersededCounted = edition.matches.filter((m) => {
    if (!m.currentResultId) return false;
    const current = m.results.find((r) => r.id === m.currentResultId);
    return current?.supersededAt != null;
  });
  if (supersededCounted.length > 0) {
    fail(
      'superseded',
      `${supersededCounted.length} matches point at a superseded current result`,
    );
  } else {
    pass('superseded', 'No superseded MatchResults counted as current');
  }

  if (!edition.rulesHash) {
    fail('rules', 'Edition rules hash is missing');
  } else {
    pass('rules', 'Rules hash present');
  }

  for (const p of edition.participants) {
    if (!p.teamNameSnapshot) {
      fail('participants', `Participant ${p.id} missing teamNameSnapshot`);
      break;
    }
  }
  if (!blockers.some((b) => b.includes('teamNameSnapshot'))) {
    pass('participants', 'Participant snapshots complete');
  }

  if (edition.archives.length > 0 && edition.status === 'COMPLETED') {
    fail('existing_archive', 'A current archive already exists for this edition');
  } else if (edition.archives.length > 0) {
    pass('existing_archive', 'Current archive present (idempotent archive path)');
  } else {
    pass('existing_archive', 'No current archive yet');
  }

  const engineVersions = new Set<string>();
  const balanceVersions = new Set<string>();
  const currentResultIds: string[] = [];
  const resultTraceHashes: string[] = [];
  for (const m of edition.matches) {
    if (!m.currentResultId) continue;
    const r = m.results.find((x) => x.id === m.currentResultId);
    if (!r) continue;
    engineVersions.add(r.engineVersion);
    balanceVersions.add(`${r.balancePresetId}@${r.balanceVersionNumber}`);
    currentResultIds.push(r.id);
    resultTraceHashes.push(r.traceHash);
  }
  if (engineVersions.size > 1) {
    warn('engine_versions', `Multiple engine versions used: ${[...engineVersions].join(', ')}`);
  }
  if (balanceVersions.size > 1) {
    warn(
      'balance_versions',
      `Multiple balance versions used: ${[...balanceVersions].join(', ')}`,
    );
  }
  if (engineVersions.size > 0) {
    pass('metadata', 'Engine/balance metadata collectable from official results');
  } else if (edition.matches.length === 0) {
    warn('metadata', 'No official matches — engine/balance metadata empty');
  }

  let sourceSnapshotHash: string | null = null;
  if (blockers.length === 0 || (edition.status === 'ARCHIVED' && edition.archives.length > 0)) {
    sourceSnapshotHash = computeSourceSnapshotHash({
      competitionEditionId: edition.id,
      rulesHash: edition.rulesHash,
      participantIds: edition.participants.map((p) => p.id),
      stageHashes: edition.stages.map((s) => s.configHash || s.id),
      standingHashes: edition.stages.flatMap((s) => s.standings.map((st) => st.snapshotHash)),
      teamStatHashes: edition.stages.flatMap((s) => s.teamStats.map((t) => t.snapshotHash)),
      playerStatHashes: edition.stages.flatMap((s) => s.playerStats.map((p) => p.snapshotHash)),
      bracketHashes: edition.stages.map((s) => s.bracketHash).filter(Boolean) as string[],
      championSourceParticipantId: championParticipantId,
      currentResultIds,
      resultTraceHashes,
      engineVersions: [...engineVersions],
      balanceVersions: [...balanceVersions],
    });
  }

  let status: ArchiveReadinessResult['status'] = 'READY';
  if (blockers.length > 0) status = 'NOT_READY';
  else if (warnings.length > 0) status = 'WARNING';

  return { status, checks, blockers, warnings, sourceSnapshotHash };
}
