/**
 * F19 playoff engine verifier — bracket + series progression (no Prisma).
 */
import {
  parsePlayoffConfig,
  generatePlayoffBracket,
  recomputeSeriesProgression,
  nextRoundReseedPairings,
  fixedFirstRoundPairings,
} from './index.js';

const participants = [1, 2, 3, 4].map((seed) => ({
  competitionParticipantId: `p${seed}`,
  seed,
}));

const config = parsePlayoffConfig(
  {
    winsRequired: 4,
    homePattern: '2-2-1-1-1',
    qualificationCount: 4,
    bracketMode: 'FIXED',
  },
  { participantCount: 4 },
);

const a = generatePlayoffBracket({
  stageId: 'stage',
  participants,
  config,
  bracketSeed: 'verify-playoffs',
});
const b = generatePlayoffBracket({
  stageId: 'stage',
  participants: [...participants].reverse(),
  config,
  bracketSeed: 'verify-playoffs',
});

if (a.bracketHash !== b.bracketHash) {
  console.error('FAIL: bracket hash unstable');
  process.exit(1);
}

const pairs = fixedFirstRoundPairings(participants);
if (pairs[0]![0].seed !== 1 || pairs[0]![1].seed !== 4) {
  console.error('FAIL: expected 1v4 first pairing', pairs);
  process.exit(1);
}

const sweep = recomputeSeriesProgression({
  participant1Id: 'p1',
  participant2Id: 'p4',
  participant1Seed: 1,
  participant2Seed: 4,
  winsRequired: 4,
  games: [1, 2, 3, 4].map((n) => ({
    gameNumber: n,
    homeParticipantId: 'p1',
    awayParticipantId: 'p4',
    winnerParticipantId: 'p1',
    decisionType: 'REGULATION',
  })),
});
if (!sweep.clinched || sweep.winnerParticipantId !== 'p1' || sweep.nextGameNumber != null) {
  console.error('FAIL: sweep progression', sweep);
  process.exit(1);
}

const reseed = nextRoundReseedPairings(
  [
    { competitionParticipantId: 'p4', seed: 4 },
    { competitionParticipantId: 'p1', seed: 1 },
  ],
  2,
);
if (reseed[0]!.participant1Seed !== 1 || reseed[0]!.participant2Seed !== 4) {
  console.error('FAIL: reseed pairing', reseed);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      bracketHash: a.bracketHash,
      firstRoundSeries: a.diagnostics.firstRoundSeries,
      totalPossibleSeries: a.diagnostics.totalPossibleSeries,
    },
    null,
    2,
  ),
);
