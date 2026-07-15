import {
  assessScoutingStaleness, consolidateScoutingObservations, createScoutingObservation, defaultScoutingConfig,
  reconcileScouting, type PlayerTruth, type ScoutInput,
} from './index.js';

const config = defaultScoutingConfig();
const attrs = { stickhandling: 12, shooting: 13, passing: 14, strength: 10, speed: 15, balance: 11, aggression: 9, offensiveAwareness: 14, defensiveAwareness: 10 };
const player: PlayerTruth = { playerId: 'p', countryKey: 'FIC', position: 'C', kind: 'skater', attributes: attrs, currentAbility: 67, potential: { floor: 74, ceiling: 90 }, role: 'PLAYMAKER' };
const goalie: PlayerTruth = { playerId: 'g', countryKey: 'FIC', position: 'G', kind: 'goalie', attributes: { reflexes: 15, positioning: 14, reboundControl: 13, glove: 15, blocker: 12, movement: 14, puckHandling: 9, consistency: 11, stamina: 12 }, currentAbility: 70, potential: { floor: 75, ceiling: 88 }, role: 'HYBRID' };
const scout = (id: string, team: 'A' | 'B', goalieSkill = 6): ScoutInput => ({
  scoutId: id, ratings: { evaluating: 17, potential: 16, skater: 16, goalie: goalieSkill },
  specialties: team === 'A' ? ['SKATER', 'POTENTIAL'] : ['GENERAL'], countryFamiliarity: { FIC: team === 'A' ? 15 : 5 },
  positionGroupFamiliarity: { forward: team === 'A' ? 15 : 5, goalie: goalieSkill }, persistentBias: team === 'A' ? 1 : -1,
});
let failures = 0;
function check(value: boolean, message: string) { if (!value) { console.error(`FAIL: ${message}`); failures += 1; } else console.log(`PASS: ${message}`); }
const before = structuredClone(player);
const assignment = (id: string, teamId = 'A', days = 14) => ({ assignmentId: id, teamId, seed: 'f26', observedOn: '2027-01-01', durationDays: days });
const first = createScoutingObservation(config, scout('a', 'A'), player, assignment('one'));
const repeat = createScoutingObservation(config, scout('a', 'A'), player, assignment('two'));
const otherTeam = createScoutingObservation(config, scout('b', 'B'), player, assignment('one', 'B'));
const goalieObs = createScoutingObservation(config, scout('g', 'A', 18), goalie, assignment('goalie'));
const report = consolidateScoutingObservations(config, [first, repeat]);
const diverse = consolidateScoutingObservations(config, [first, createScoutingObservation(config, scout('c', 'A'), player, assignment('three'))]);
check(first.observationId !== otherTeam.observationId, 'two teams diverge deterministically');
check(goalieObs.playerKind === 'goalie' && goalieObs.attributes.reflexes.estimate !== null, 'goalie skill and schema supported');
check(diverse.confidence > report.confidence, 'cross-scout diversity beats repeat observations');
check(first.potential.low === null || first.potential.high! - first.potential.low! >= first.currentAbility.high! - first.currentAbility.low!, 'potential uncertainty is wider');
check(assessScoutingStaleness({ ...player, currentAbility: 68 }, report).stale, 'state hash detects staleness');
check(JSON.stringify(before) === JSON.stringify(player), 'truth remains unmodified');
check(reconcileScouting([before], [player], [first, repeat, goalieObs], [report]).valid, 'reconciliation validates output');
const started = Date.now();
const observations = Array.from({ length: 500 }, (_, index) => createScoutingObservation(config, scout(`s${index}`, 'A'), player, assignment(`bulk${index}`, 'A', 7)));
const bulk = consolidateScoutingObservations(config, observations);
check(bulk.observations === 500, '500 observation benchmark completed');
console.log(`duration=${Date.now() - started}ms report=${bulk.reportHash.slice(0, 16)}…`);
if (failures) process.exit(1);
console.log('Scouting verification passed');
