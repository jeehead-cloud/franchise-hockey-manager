import { describe, expect, it } from 'vitest';
import {
  assessScoutingStaleness, consolidateScoutingObservations, createScoutingObservation, defaultScoutingConfig,
  reconcileScouting, suggestScoutingRanking, type PlayerTruth, type ScoutInput,
} from './index.js';

const config = defaultScoutingConfig();
const player: PlayerTruth = {
  playerId: 'p1', countryKey: 'FIC', position: 'C', kind: 'skater',
  attributes: { stickhandling: 14, shooting: 12, passing: 15, strength: 10, speed: 13, balance: 11, aggression: 8, offensiveAwareness: 16, defensiveAwareness: 9 },
  currentAbility: 68, potential: { floor: 72, ceiling: 88 }, role: 'PLAYMAKER',
};
const scout: ScoutInput = {
  scoutId: 's1', ratings: { evaluating: 18, potential: 17, skater: 16, goalie: 4 },
  specialties: ['SKATER', 'POTENTIAL'], countryFamiliarity: { FIC: 15 }, positionGroupFamiliarity: { forward: 14 }, persistentBias: 0,
};

describe('F26 scouting', () => {
  it('is deterministic, immutable, and state-sensitive', () => {
    const before = structuredClone(player);
    const assignment = { assignmentId: 'a1', teamId: 'team-a', seed: 'seed', observedOn: '2027-01-01', durationDays: 14 };
    const a = createScoutingObservation(config, scout, player, assignment);
    const b = createScoutingObservation(config, scout, player, assignment);
    expect(a).toEqual(b);
    expect(player).toEqual(before);
    const report = consolidateScoutingObservations(config, [a]);
    expect(assessScoutingStaleness(player, report).stale).toBe(false);
    expect(assessScoutingStaleness({ ...player, currentAbility: 69 }, report).stale).toBe(true);
    expect(reconcileScouting([before], [player], [a], [report]).valid).toBe(true);
  });

  it('adds diversity and ranks reports without truths', () => {
    const one = createScoutingObservation(config, scout, player, { assignmentId: 'a1', teamId: 'a', seed: 'x', observedOn: '2027-01-01', durationDays: 10 });
    const two = createScoutingObservation(config, { ...scout, scoutId: 's2', persistentBias: 1 }, player, { assignmentId: 'a2', teamId: 'a', seed: 'x', observedOn: '2027-01-02', durationDays: 10 });
    const repeated = consolidateScoutingObservations(config, [one, one]);
    const diverse = consolidateScoutingObservations(config, [one, two]);
    expect(diverse.confidence).toBeGreaterThan(repeated.confidence);
    expect(suggestScoutingRanking([{ playerId: 'p1', report: diverse }])[0]?.playerId).toBe('p1');
  });

  it('rejects consolidation across teams or player states', () => {
    const one = createScoutingObservation(config, scout, player, { assignmentId: 'a1', teamId: 'a', seed: 'x', observedOn: '2027-01-01', durationDays: 10 });
    const otherTeam = createScoutingObservation(config, { ...scout, scoutId: 's2' }, player, { assignmentId: 'a2', teamId: 'b', seed: 'x', observedOn: '2027-01-02', durationDays: 10 });
    const changed = createScoutingObservation(config, { ...scout, scoutId: 's2' }, { ...player, currentAbility: 69 }, { assignmentId: 'a3', teamId: 'a', seed: 'x', observedOn: '2027-01-03', durationDays: 10 });
    expect(() => consolidateScoutingObservations(config, [one, otherTeam])).toThrow(/one team/);
    expect(() => consolidateScoutingObservations(config, [one, changed])).toThrow(/player-state/);
  });
});
