import { computeArchiveHash } from './archive-hash.js';
import type { NormalizedCompetitionArchive } from './types.js';
import { ARCHIVE_SCHEMA_VERSION } from './types.js';

export interface ArchiveReconciliationIssue {
  code: string;
  message: string;
}

export interface ArchiveReconciliationResult {
  ok: boolean;
  issues: ArchiveReconciliationIssue[];
  recomputedArchiveHash: string | null;
}

/**
 * Validate archive contents before persistence.
 */
export function reconcileArchive(
  archive: NormalizedCompetitionArchive,
  expected: {
    participantCount: number;
    officialMatchIds: string[];
    standingHashes: string[];
    championSourceParticipantId: string | null;
    seriesCount: number;
  },
): ArchiveReconciliationResult {
  const issues: ArchiveReconciliationIssue[] = [];

  if (archive.archiveSchemaVersion !== ARCHIVE_SCHEMA_VERSION) {
    issues.push({
      code: 'UNSUPPORTED_SCHEMA',
      message: `archiveSchemaVersion ${archive.archiveSchemaVersion} is not supported`,
    });
  }

  if (archive.participants.length !== expected.participantCount) {
    issues.push({
      code: 'PARTICIPANT_COUNT',
      message: `Expected ${expected.participantCount} participants, got ${archive.participants.length}`,
    });
  }

  if (archive.participantCount !== archive.participants.length) {
    issues.push({
      code: 'PARTICIPANT_COUNT_FIELD',
      message: 'participantCount does not match participants array length',
    });
  }

  if (archive.matchCount !== archive.matches.length) {
    issues.push({
      code: 'MATCH_COUNT_FIELD',
      message: 'matchCount does not match matches array length',
    });
  }

  const matchIds = archive.matches.map((m) => m.sourceMatchId).sort();
  const expectedIds = [...expected.officialMatchIds].sort();
  if (matchIds.length !== expectedIds.length || matchIds.some((id, i) => id !== expectedIds[i])) {
    issues.push({
      code: 'MATCH_SET',
      message: 'Archived matches do not match official completed source matches',
    });
  }

  const dup = matchIds.find((id, i) => matchIds.indexOf(id) !== i);
  if (dup) {
    issues.push({ code: 'DUPLICATE_MATCH', message: `Duplicate archived match ${dup}` });
  }

  const standingHashes = archive.standings.map((s) => s.sourceSnapshotHash).sort();
  const expectedStanding = [...expected.standingHashes].sort();
  if (
    standingHashes.length !== expectedStanding.length ||
    standingHashes.some((h, i) => h !== expectedStanding[i])
  ) {
    issues.push({
      code: 'STANDINGS_MISMATCH',
      message: 'Archived standings hashes do not match source final standings',
    });
  }

  if (archive.championSourceParticipantId !== expected.championSourceParticipantId) {
    issues.push({
      code: 'CHAMPION_MISMATCH',
      message: 'Archived champion does not match source playoff champion',
    });
  }

  if (archive.series.length !== expected.seriesCount) {
    issues.push({
      code: 'SERIES_COUNT',
      message: `Expected ${expected.seriesCount} series, got ${archive.series.length}`,
    });
  }

  for (const award of archive.awards) {
    if (award.recipientType === 'TEAM' && award.sourceParticipantId) {
      const ok = archive.participants.some(
        (p) => p.sourceCompetitionParticipantId === award.sourceParticipantId,
      );
      if (!ok) {
        issues.push({
          code: 'AWARD_RECIPIENT',
          message: `Award ${award.awardType} references missing participant`,
        });
      }
    }
    if (award.recipientType === 'PLAYER' && award.sourcePlayerId) {
      const ok = archive.playerStats.some((p) => p.sourcePlayerId === award.sourcePlayerId);
      if (!ok) {
        issues.push({
          code: 'AWARD_RECIPIENT',
          message: `Award ${award.awardType} references missing player stats`,
        });
      }
    }
  }

  let recomputed: string | null = null;
  try {
    recomputed = computeArchiveHash(archive);
  } catch (err) {
    issues.push({
      code: 'HASH_ERROR',
      message: err instanceof Error ? err.message : 'Failed to compute archive hash',
    });
  }

  return { ok: issues.length === 0, issues, recomputedArchiveHash: recomputed };
}
