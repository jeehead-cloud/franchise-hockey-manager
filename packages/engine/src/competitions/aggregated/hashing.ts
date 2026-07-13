import { stableDigest } from '../../simulation/batch/hash.js';
import type { AggregatedSeasonConfig, AggregatedTeamStrengthSnapshot } from './types.js';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function hashAggregatedConfig(config: AggregatedSeasonConfig): string {
  return stableDigest(stableStringify(config));
}

export function hashAggregatedInput(payload: {
  competitionEditionId: string;
  competitionStageId: string;
  strengths: AggregatedTeamStrengthSnapshot[];
  balanceHash: string | null;
  seed: string;
}): string {
  return stableDigest(
    stableStringify({
      competitionEditionId: payload.competitionEditionId,
      competitionStageId: payload.competitionStageId,
      seed: payload.seed,
      balanceHash: payload.balanceHash,
      strengths: [...payload.strengths].sort((a, b) =>
        a.competitionParticipantId.localeCompare(b.competitionParticipantId),
      ),
    }),
  );
}

export function hashAggregatedResult(payload: {
  scheduleHash: string;
  gameResultHashes: string[];
  standingsHash: string;
  championParticipantId: string | null;
}): string {
  return stableDigest(
    stableStringify({
      scheduleHash: payload.scheduleHash,
      gameResultHashes: [...payload.gameResultHashes].sort(),
      standingsHash: payload.standingsHash,
      championParticipantId: payload.championParticipantId,
    }),
  );
}
