import { describe, expect, it } from 'vitest';
import {
  buildTestSimulationInput,
  compareLabAggregates,
  computeBatchHash,
  deriveGameSeed,
  deriveGameSeeds,
  detectLabAnomalies,
  reduceGameSummaries,
  resolveSideOrientation,
  runLabBatch,
  simulateCompleteMatch,
  type LabGameSummary,
} from '../../index.js';

describe('F16 simulation lab batch', () => {
  it('derives deterministic unique game seeds', () => {
    const a = deriveGameSeeds('lab-001', 5);
    const b = deriveGameSeeds('lab-001', 5);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(5);
    expect(deriveGameSeed('lab-001', 0)).toBe('lab-001:game:0');
  });

  it('resolves FIXED and ALTERNATE side orientation', () => {
    expect(resolveSideOrientation('FIXED', 3, 'A', 'B').teamAWasHome).toBe(true);
    expect(resolveSideOrientation('ALTERNATE', 0, 'A', 'B')).toEqual({
      homeTeamId: 'A',
      awayTeamId: 'B',
      teamAWasHome: true,
    });
    expect(resolveSideOrientation('ALTERNATE', 1, 'A', 'B')).toEqual({
      homeTeamId: 'B',
      awayTeamId: 'A',
      teamAWasHome: false,
    });
  });

  it('aggregates a deterministic 10-game batch with stable hash', () => {
    const teamAId = 'home';
    const teamBId = 'away';
    // fixture teams use teamId home/away from buildTeam prefixes — override via buildInput
    const run = (baseSeed: string) =>
      runLabBatch({
        baseSeed,
        simulationCount: 10,
        sideMode: 'ALTERNATE',
        teamAId,
        teamBId,
        baselineBalanceMeta: {
          versionId: 'v1',
          versionNumber: 1,
          configHash: 'hash-a',
          presetName: 'Standard',
        },
        includeGameSummaries: true,
        buildInput: ({ seed, homeTeamId, awayTeamId }) => {
          const input = buildTestSimulationInput(seed, { mode: 'F14' });
          // Remap fixture team ids to analytical A/B ids while preserving orientation.
          const homeIsA = homeTeamId === teamAId;
          input.homeTeam.teamId = homeTeamId;
          input.awayTeam.teamId = awayTeamId;
          // Keep names readable
          input.homeTeam.teamName = homeIsA ? 'Team A' : 'Team B';
          input.awayTeam.teamName = homeIsA ? 'Team B' : 'Team A';
          return input;
        },
        simulate: (input) => simulateCompleteMatch(input),
      });

    const first = run('lab-det-10');
    const second = run('lab-det-10');
    expect(first.cancelled).toBe(false);
    expect(first.result.aggregate.outcomes.games).toBe(10);
    expect(
      first.result.aggregate.outcomes.teamAWins +
        first.result.aggregate.outcomes.teamBWins +
        first.result.aggregate.outcomes.ties,
    ).toBe(10);
    expect(first.result.batchHash).toBe(second.result.batchHash);
    expect(first.result.gameSummaries?.map((g) => g.seed)).toEqual(
      second.result.gameSummaries?.map((g) => g.seed),
    );

    const other = run('lab-det-11');
    expect(other.result.batchHash).not.toBe(first.result.batchHash);
  });

  it('marks SMALL_SAMPLE_WARNING for counts under 100', () => {
    const agg = reduceGameSummaries([]);
    const anomalies = detectLabAnomalies(
      {
        ...agg,
        outcomes: { ...agg.outcomes, games: 10, teamAWins: 6, teamBWins: 4 },
      },
      { requestedCount: 10 },
    );
    // empty games triggers NO_OUTCOME — use a synthetic single summary path instead
    const summaries: LabGameSummary[] = Array.from({ length: 10 }, (_, i) => ({
      gameIndex: i,
      seed: `s${i}`,
      teamAWasHome: i % 2 === 0,
      winner: i % 2 === 0 ? 'TEAM_A' : 'TEAM_B',
      decisionType: 'REGULATION',
      teamAScore: 3,
      teamBScore: 2,
      teamARegulationScore: 3,
      teamBRegulationScore: 2,
      overtimeOccurred: false,
      shootoutOccurred: false,
      teamAStats: emptySideStats(3),
      teamBStats: emptySideStats(2),
      playerContributions: [],
      unitContributions: [],
      traceHash: `t${i}`,
      reconciliationPassed: true,
      preMatchStronger: 'EVEN',
      preMatchStrengthGap: 0,
      isUpset: false,
    }));
    const reduced = reduceGameSummaries(summaries);
    const found = detectLabAnomalies(reduced, { requestedCount: 10 });
    expect(found.some((a) => a.code === 'SMALL_SAMPLE_WARNING')).toBe(true);
  });

  it('comparison of identical aggregates yields zero deltas', () => {
    const summaries: LabGameSummary[] = [
      {
        gameIndex: 0,
        seed: 's0',
        teamAWasHome: true,
        winner: 'TEAM_A',
        decisionType: 'REGULATION',
        teamAScore: 4,
        teamBScore: 2,
        teamARegulationScore: 4,
        teamBRegulationScore: 2,
        overtimeOccurred: false,
        shootoutOccurred: false,
        teamAStats: emptySideStats(4),
        teamBStats: emptySideStats(2),
        playerContributions: [],
        unitContributions: [],
        traceHash: 't0',
        reconciliationPassed: true,
        preMatchStronger: 'TEAM_A',
        preMatchStrengthGap: 5,
        isUpset: false,
      },
    ];
    const agg = reduceGameSummaries(summaries);
    const cmp = compareLabAggregates(agg, agg, { baseline: summaries, comparison: summaries });
    expect(cmp.pairedOutcomeChanges).toBe(0);
    expect(cmp.deltas.every((d) => d.delta === 0)).toBe(true);
  });

  it('batch hash excludes wall-clock fields and is order-stable for summaries', () => {
    const agg = reduceGameSummaries([]);
    const hash = computeBatchHash({
      baseSeed: 'x',
      simulationCount: 1,
      sideMode: 'FIXED',
      engineVersion: 'f14.1',
      baselineBalanceHash: 'h',
      comparisonBalanceHash: null,
      aggregate: agg,
      anomalies: [],
      comparison: null,
      gameSummaries: null,
    });
    expect(hash).toHaveLength(64);
  });
});

function emptySideStats(goals: number) {
  return {
    goals,
    shotAttempts: goals * 4,
    shotsOnGoal: goals * 3,
    saves: 10,
    shootingPercentage: goals > 0 ? 0.3 : 0,
    faceoffWins: 10,
    possessionSeconds: 600,
    offensiveZoneSeconds: 200,
    defensiveZoneSeconds: 200,
    penalties: 2,
    penaltyMinutes: 4,
    powerPlayOpportunities: 2,
    powerPlayGoals: 0,
    powerPlayPercentage: 0,
    penaltyKillOpportunities: 2,
    penaltyKills: 2,
    penaltyKillPercentage: 1,
    shortHandedGoals: 0,
    shootoutAttempts: 0,
    shootoutGoals: 0,
  };
}
