/**
 * F18 regular-season engine verifier — schedule + standings determinism (no Prisma).
 */
import {
  generateRegularSeasonSchedule,
  computeStandings,
  reconcileStandingsBasics,
  parseRegularSeasonConfig,
} from './index.js';
import { defaultPointsRules } from '../rules.js';

const seed = 'verify-regular-season-2026';
const participants = ['p1', 'p2', 'p3', 'p4'];

const config = parseRegularSeasonConfig({
  scheduleFormat: 'DOUBLE_ROUND_ROBIN',
  homeAwayMode: 'BALANCED',
  allowBackToBack: true,
  minimumRestSlots: 0,
  qualifiersCount: 2,
});

const a = generateRegularSeasonSchedule({ participantIds: participants, config, seed });
const b = generateRegularSeasonSchedule({ participantIds: [...participants].reverse(), config, seed });

if (a.scheduleHash !== b.scheduleHash) {
  console.error('FAIL: schedule hash not stable under participant reorder');
  process.exit(1);
}

const c = generateRegularSeasonSchedule({
  participantIds: participants,
  config,
  seed: `${seed}-alt`,
});
if (c.scheduleHash === a.scheduleHash) {
  console.error('FAIL: different seed should change schedule hash for this format');
  process.exit(1);
}

for (const m of a.matches) {
  if (m.homeParticipantId === m.awayParticipantId) {
    console.error('FAIL: self-match');
    process.exit(1);
  }
}

const keys = new Set(a.matches.map((m) => m.scheduleKey));
if (keys.size !== a.matches.length) {
  console.error('FAIL: duplicate schedule keys');
  process.exit(1);
}

// Synthetic results: home wins regulation alternating by order
const standingParticipants = participants.map((id) => ({
  participantId: id,
  teamId: `t-${id}`,
  teamNameSnapshot: id,
}));
const matches = a.matches.map((m, i) => {
  const homeWins = i % 2 === 0;
  return {
    scheduleOrder: m.scheduleOrder,
    homeParticipantId: m.homeParticipantId,
    awayParticipantId: m.awayParticipantId,
    homeTeamId: `t-${m.homeParticipantId}`,
    awayTeamId: `t-${m.awayParticipantId}`,
    homeScore: homeWins ? 3 : 2,
    awayScore: homeWins ? 2 : 3,
    homeRegulationScore: homeWins ? 3 : 2,
    awayRegulationScore: homeWins ? 2 : 3,
    decisionType: 'REGULATION' as const,
    winnerParticipantId: homeWins ? m.homeParticipantId : m.awayParticipantId,
  };
});

const standings = computeStandings({
  participants: standingParticipants,
  matches,
  pointsRules: defaultPointsRules(),
  tiebreakers: ['POINTS', 'REGULATION_WINS', 'GOAL_DIFFERENCE', 'GOALS_FOR'],
  qualifiersCount: 2,
  scheduledMatchCount: a.matches.length,
  standingsSeed: seed,
  provisional: false,
});

const errs = reconcileStandingsBasics({
  standings,
  completedMatches: matches.length,
});
if (errs.length) {
  console.error('FAIL: standings reconciliation', errs);
  process.exit(1);
}

const again = computeStandings({
  participants: standingParticipants,
  matches,
  pointsRules: defaultPointsRules(),
  tiebreakers: ['POINTS', 'REGULATION_WINS', 'GOAL_DIFFERENCE', 'GOALS_FOR'],
  qualifiersCount: 2,
  scheduledMatchCount: a.matches.length,
  standingsSeed: seed,
  provisional: false,
});
if (again.standingsHash !== standings.standingsHash) {
  console.error('FAIL: standings hash not deterministic');
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      totalMatches: a.diagnostics.totalMatches,
      scheduleHash: a.scheduleHash,
      standingsHash: standings.standingsHash,
      qualifiers: standings.qualificationParticipantIds,
      leader: standings.rows[0]?.participantId,
    },
    null,
    2,
  ),
);
