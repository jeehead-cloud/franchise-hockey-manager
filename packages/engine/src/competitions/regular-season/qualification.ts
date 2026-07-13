import type { StandingRow } from './types.js';

export function buildQualificationPreview(rows: StandingRow[]): {
  qualifiedParticipantIds: string[];
  seedingOrder: Array<{ seed: number; participantId: string; teamId: string; rank: number }>;
} {
  const qualified = rows.filter((r) => r.qualified).sort((a, b) => a.rank - b.rank);
  return {
    qualifiedParticipantIds: qualified.map((r) => r.participantId),
    seedingOrder: qualified.map((r, i) => ({
      seed: i + 1,
      participantId: r.participantId,
      teamId: r.teamId,
      rank: r.rank,
    })),
  };
}
