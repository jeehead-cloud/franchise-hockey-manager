import type {
  GeneratedKnockoutBracket,
  GroupStandingRow,
  InternationalTournamentTemplate,
  KnockoutMatchupSpec,
  QualificationEntry,
} from './types.js';
import { InternationalTournamentError } from './types.js';
import { hashKnockoutBracket } from './hashing.js';

/**
 * Build knockout bracket from final group standings.
 *
 * Cross-group seeding (2 groups, 4 qualifiers each):
 * A1 vs B4, A2 vs B3, B1 vs A4, B2 vs A3
 *
 * Single-group (test): seeds 1–4 → SF (1v4, 2v3), then bronze/final.
 */
export function buildQualificationAndKnockout(input: {
  groupStandings: Record<string, GroupStandingRow[]>;
  template: InternationalTournamentTemplate;
}): GeneratedKnockoutBracket {
  const { template } = input;
  if (!template.knockout.enabled) {
    throw new InternationalTournamentError(
      'QualificationFailed',
      'Knockout disabled in template',
    );
  }

  const groupKeys = Object.keys(input.groupStandings).sort();
  const qualifiersPerGroup = template.groupStage.qualifiersPerGroup;
  const qualification: QualificationEntry[] = [];
  const seeds: Array<{
    participantId: string;
    sourceGroupKey: string;
    sourceRank: number;
    knockoutSeed: number;
  }> = [];

  let seedCounter = 0;
  if (template.groupStage.crossGroupSeeding && groupKeys.length === 2) {
    // Interleave by rank across groups for pairing later
    for (let rank = 1; rank <= qualifiersPerGroup; rank += 1) {
      for (const gk of groupKeys) {
        const row = input.groupStandings[gk]?.find((r) => r.rank === rank && r.qualified);
        if (!row) {
          throw new InternationalTournamentError(
            'QualificationFailed',
            `Missing qualified rank ${rank} in group ${gk}`,
          );
        }
        seedCounter += 1;
        seeds.push({
          participantId: row.participantId,
          sourceGroupKey: gk,
          sourceRank: rank,
          knockoutSeed: seedCounter,
        });
      }
    }
  } else {
    for (const gk of groupKeys) {
      const rows = [...(input.groupStandings[gk] ?? [])]
        .filter((r) => r.qualified)
        .sort((a, b) => a.rank - b.rank);
      if (rows.length !== qualifiersPerGroup) {
        throw new InternationalTournamentError(
          'QualificationFailed',
          `Group ${gk} has ${rows.length} qualifiers (expected ${qualifiersPerGroup})`,
        );
      }
      for (const row of rows) {
        seedCounter += 1;
        seeds.push({
          participantId: row.participantId,
          sourceGroupKey: gk,
          sourceRank: row.rank,
          knockoutSeed: seedCounter,
        });
      }
    }
  }

  const seen = new Set<string>();
  for (const s of seeds) {
    if (seen.has(s.participantId)) {
      throw new InternationalTournamentError(
        'QualificationFailed',
        `Duplicate qualifier ${s.participantId}`,
      );
    }
    seen.add(s.participantId);
  }

  const byGroupRank = new Map<string, string>();
  for (const s of seeds) {
    byGroupRank.set(`${s.sourceGroupKey}:${s.sourceRank}`, s.participantId);
  }

  const matchups: KnockoutMatchupSpec[] = [];
  let seriesOrder = 0;

  if (template.knockout.quarterfinals && groupKeys.length === 2) {
    const [gA, gB] = groupKeys;
    const pairs: Array<[string, string, number]> = [
      [`${gA}:1`, `${gB}:4`, 1],
      [`${gA}:2`, `${gB}:3`, 2],
      [`${gB}:1`, `${gA}:4`, 3],
      [`${gB}:2`, `${gA}:3`, 4],
    ];
    for (const [aKey, bKey, slot] of pairs) {
      const p1 = byGroupRank.get(aKey);
      const p2 = byGroupRank.get(bKey);
      if (!p1 || !p2) {
        throw new InternationalTournamentError(
          'QualificationFailed',
          `Cannot map quarterfinal ${aKey} vs ${bKey}`,
        );
      }
      seriesOrder += 1;
      const s1 = seeds.find((x) => x.participantId === p1)!;
      const s2 = seeds.find((x) => x.participantId === p2)!;
      matchups.push({
        roundName: 'QUARTERFINAL',
        roundNumber: 1,
        seriesOrder,
        bracketSlot: slot,
        participant1Id: p1,
        participant2Id: p2,
        participant1Seed: s1.knockoutSeed,
        participant2Seed: s2.knockoutSeed,
        nextSeriesSlot: Math.ceil(slot / 2) + 100,
        isBronze: false,
        isFinal: false,
      });
      qualification.push({
        participantId: p1,
        sourceGroupKey: s1.sourceGroupKey,
        sourceRank: s1.sourceRank,
        knockoutSeed: s1.knockoutSeed,
        homeParticipantId: p1,
        awayParticipantId: p2,
        bracketSlot: slot,
        roundName: 'QUARTERFINAL',
      });
    }
    // Semifinal placeholders (winners of QF 1/2 and 3/4)
    for (let i = 0; i < 2; i += 1) {
      seriesOrder += 1;
      matchups.push({
        roundName: 'SEMIFINAL',
        roundNumber: 2,
        seriesOrder,
        bracketSlot: 101 + i,
        participant1Id: null,
        participant2Id: null,
        participant1Seed: null,
        participant2Seed: null,
        nextSeriesSlot: 200,
        isBronze: false,
        isFinal: false,
      });
    }
  } else if (template.knockout.semifinals) {
    // Direct SF from ranked seeds: 1v4, 2v3
    const ordered = [...seeds].sort((a, b) => a.knockoutSeed - b.knockoutSeed);
    if (ordered.length < 4) {
      throw new InternationalTournamentError(
        'QualificationFailed',
        'Need at least 4 qualifiers for semifinals',
      );
    }
    const sfPairs: Array<[number, number, number]> = [
      [0, 3, 1],
      [1, 2, 2],
    ];
    for (const [i1, i2, slot] of sfPairs) {
      const a = ordered[i1]!;
      const b = ordered[i2]!;
      seriesOrder += 1;
      matchups.push({
        roundName: 'SEMIFINAL',
        roundNumber: 1,
        seriesOrder,
        bracketSlot: slot,
        participant1Id: a.participantId,
        participant2Id: b.participantId,
        participant1Seed: a.knockoutSeed,
        participant2Seed: b.knockoutSeed,
        nextSeriesSlot: 200,
        isBronze: false,
        isFinal: false,
      });
      qualification.push({
        participantId: a.participantId,
        sourceGroupKey: a.sourceGroupKey,
        sourceRank: a.sourceRank,
        knockoutSeed: a.knockoutSeed,
        homeParticipantId: a.participantId,
        awayParticipantId: b.participantId,
        bracketSlot: slot,
        roundName: 'SEMIFINAL',
      });
    }
  }

  if (template.knockout.bronzeGame) {
    seriesOrder += 1;
    matchups.push({
      roundName: 'BRONZE',
      roundNumber: 90,
      seriesOrder,
      bracketSlot: 190,
      participant1Id: null,
      participant2Id: null,
      participant1Seed: null,
      participant2Seed: null,
      nextSeriesSlot: null,
      isBronze: true,
      isFinal: false,
    });
  }

  if (template.knockout.final) {
    seriesOrder += 1;
    matchups.push({
      roundName: 'FINAL',
      roundNumber: 99,
      seriesOrder,
      bracketSlot: 200,
      participant1Id: null,
      participant2Id: null,
      participant1Seed: null,
      participant2Seed: null,
      nextSeriesSlot: null,
      isBronze: false,
      isFinal: true,
    });
  }

  return {
    matchups,
    qualification,
    bracketHash: hashKnockoutBracket(matchups),
  };
}

export function deriveInternationalKnockoutMatchSeed(
  baseSeed: string,
  bracketHash: string,
  roundName: string,
  bracketSlot: number,
): string {
  return `${baseSeed}:${bracketHash}:round:${roundName}:slot:${bracketSlot}`;
}
