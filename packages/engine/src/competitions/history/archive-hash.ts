import { stableDigest } from '../../simulation/batch/hash.js';
import { normalizeArchiveForHash } from './normalize.js';
import type { NormalizedCompetitionArchive } from './types.js';
import { ARCHIVE_SCHEMA_VERSION } from './types.js';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** Deterministic archive hash from normalized archive contents (excludes DB ids/timestamps). */
export function computeArchiveHash(archive: NormalizedCompetitionArchive): string {
  if (archive.archiveSchemaVersion !== ARCHIVE_SCHEMA_VERSION) {
    throw new Error(`Unsupported archiveSchemaVersion: ${archive.archiveSchemaVersion}`);
  }
  const normalized = normalizeArchiveForHash(archive);
  // Exclude sourceSnapshotHash circularity? Spec includes it in archive contents.
  return stableDigest(stableStringify(normalized));
}

/** Deterministic hash of the live completed source state that was archived. */
export function computeSourceSnapshotHash(input: {
  competitionEditionId: string;
  rulesHash: string;
  participantIds: string[];
  stageHashes: string[];
  standingHashes: string[];
  teamStatHashes: string[];
  playerStatHashes: string[];
  bracketHashes: string[];
  championSourceParticipantId: string | null;
  currentResultIds: string[];
  resultTraceHashes: string[];
  engineVersions: string[];
  balanceVersions: string[];
}): string {
  const payload = {
    competitionEditionId: input.competitionEditionId,
    rulesHash: input.rulesHash,
    participantIds: [...input.participantIds].sort(),
    stageHashes: [...input.stageHashes].sort(),
    standingHashes: [...input.standingHashes].sort(),
    teamStatHashes: [...input.teamStatHashes].sort(),
    playerStatHashes: [...input.playerStatHashes].sort(),
    bracketHashes: [...input.bracketHashes].sort(),
    championSourceParticipantId: input.championSourceParticipantId,
    currentResultIds: [...input.currentResultIds].sort(),
    resultTraceHashes: [...input.resultTraceHashes].sort(),
    engineVersions: [...input.engineVersions].sort(),
    balanceVersions: [...input.balanceVersions].sort(),
  };
  return stableDigest(stableStringify(payload));
}
