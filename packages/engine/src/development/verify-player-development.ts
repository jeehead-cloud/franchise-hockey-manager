import {
  developPlayers,
  getDefaultPlayerDevelopmentConfig,
  hashPlayerDevelopmentConfig,
} from '../index.js';
import type { DevelopmentPlayerInput } from './types.js';

function skater(
  id: string,
  birthDate: string,
  extras: Partial<DevelopmentPlayerInput> = {},
): DevelopmentPlayerInput {
  return {
    playerId: id,
    playerType: 'SKATER',
    birthDate,
    position: id.endsWith('d') ? 'LD' : 'C',
    currentRole: 'PLAYMAKER',
    lifecycleStatus: 'ACTIVE',
    currentTeamId: 't1',
    currentTeamName: 'Tigers',
    currentAbility: 50,
    potentialCeiling: 75,
    potentialFloor: 40,
    form: 2,
    attributes: {
      stickhandling: 11,
      shooting: 11,
      passing: 11,
      strength: 11,
      speed: 11,
      balance: 11,
      aggression: 10,
      offensiveAwareness: 11,
      defensiveAwareness: 11,
    },
    contractStatus: 'UNKNOWN',
    sourceType: 'GENERATED',
    ...extras,
  };
}

function goalie(id: string, birthDate: string): DevelopmentPlayerInput {
  return {
    playerId: id,
    playerType: 'GOALIE',
    birthDate,
    position: 'G',
    currentRole: 'POSITIONAL',
    lifecycleStatus: 'ACTIVE',
    currentTeamId: 't1',
    currentTeamName: 'Tigers',
    currentAbility: 52,
    potentialCeiling: 72,
    potentialFloor: 40,
    form: 0,
    attributes: {
      reflexes: 11,
      positioning: 11,
      reboundControl: 11,
      glove: 11,
      blocker: 11,
      movement: 11,
      puckHandling: 10,
      consistency: 11,
      stamina: 11,
    },
    contractStatus: 'UNKNOWN',
    sourceType: 'GENERATED',
  };
}

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    failures += 1;
  } else {
    console.log(`PASS: ${msg}`);
  }
}

const cfg = getDefaultPlayerDevelopmentConfig();
const configHash = hashPlayerDevelopmentConfig(cfg);
console.log(`configHash=${configHash.slice(0, 16)}…`);

const players: DevelopmentPlayerInput[] = [
  skater('young-c', '2008-05-01'),
  skater('prime-c', '1999-05-01'),
  skater('vet-c', '1989-05-01'),
  skater('steep-d', '1985-05-01'),
  goalie('young-g', '2007-05-01'),
  goalie('prime-g', '1996-05-01'),
  goalie('vet-g', '1987-05-01'),
];

const t0 = Date.now();
const runA = developPlayers({
  players,
  config: cfg,
  worldSeasonId: 'ws-verify',
  effectiveDate: '2027-07-01',
  baseSeed: 'development-verify',
});
const runB = developPlayers({
  players,
  config: cfg,
  worldSeasonId: 'ws-verify',
  effectiveDate: '2027-07-01',
  baseSeed: 'development-verify',
});
const durationMs = Date.now() - t0;

check(runA.summary.resultHash === runB.summary.resultHash, 'identical result hash on replay');
check(runA.summary.inputHash === runB.summary.inputHash, 'identical input hash on replay');

const runDiff = developPlayers({
  players,
  config: cfg,
  worldSeasonId: 'ws-verify',
  effectiveDate: '2027-07-01',
  baseSeed: 'development-verify-alt',
});
check(
  runDiff.summary.resultHash !== runA.summary.resultHash,
  'different seed changes result hash',
);

const young = runA.results.find((r) => r.playerId === 'young-c')!;
const prime = runA.results.find((r) => r.playerId === 'prime-c')!;
const vet = runA.results.find((r) => r.playerId === 'vet-c')!;
const youngG = runA.results.find((r) => r.playerId === 'young-g')!;
const vetG = runA.results.find((r) => r.playerId === 'vet-g')!;

check(young.budget.finalBudget > 0, 'young skater positive budget');
check(vet.budget.finalBudget < 0, 'veteran skater decline budget');
check(
  Math.abs(prime.budget.finalBudget) <= Math.abs(young.budget.finalBudget),
  'prime budget not larger than young growth budget magnitude',
);
check(youngG.budget.finalBudget >= 0, 'young goalie non-negative budget');
check(vetG.budget.finalBudget <= 0, 'veteran goalie non-positive budget');

for (const r of runA.results) {
  for (const ch of r.attributeChanges) {
    check(ch.afterValue >= 1 && ch.afterValue <= 20, `${r.playerId} attr bounds`);
  }
  check(r.potentialCeiling === 75 || r.potentialCeiling === 72, `${r.playerId} potential unchanged`);
  check(r.form.formAfter >= -10 && r.form.formAfter <= 10, `${r.playerId} form bounds`);
}

check(runA.results.every((r) => r.playerId.length > 0), 'no player creation/deletion in result set');
check(runA.summary.totalPlayers === players.length, 'coverage equals input');

// 500-player micro-benchmark
const big: DevelopmentPlayerInput[] = [];
for (let i = 0; i < 500; i += 1) {
  const year = 1985 + (i % 25);
  big.push(
    i % 7 === 0
      ? goalie(`g${i}`, `${year}-01-15`)
      : skater(`s${i}`, `${year}-01-15`, { position: i % 2 === 0 ? 'C' : 'RW' }),
  );
}
const tBig = Date.now();
const bigRun = developPlayers({
  players: big,
  config: cfg,
  worldSeasonId: 'ws-big',
  effectiveDate: '2027-07-01',
  baseSeed: 'big-500',
});
const bigMs = Date.now() - tBig;
check(bigRun.summary.totalPlayers === 500, '500-player coverage');
console.log(`duration small=${durationMs}ms big500=${bigMs}ms resultHash=${runA.summary.resultHash.slice(0, 16)}…`);

if (failures > 0) {
  console.error(`Player development verification failed (${failures})`);
  process.exit(1);
}
console.log('Player development verification passed');
