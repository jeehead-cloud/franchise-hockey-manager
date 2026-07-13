import {
  buildDefaultCountryYouthProfile,
  generateYouthRun,
  hashCountryYouthProfile,
} from '../index.js';
import type { YouthGenerationCountryInput } from './types.js';

function pool(key: string, nFirst = 40, nLast = 50) {
  return {
    poolKey: key,
    firstNames: Array.from({ length: nFirst }, (_, i) => `${key}F${i}`),
    lastNames: Array.from({ length: nLast }, (_, i) => `${key}L${i}`),
  };
}

function country(key: string, id: string, baseSize: number): YouthGenerationCountryInput {
  const profile = buildDefaultCountryYouthProfile(key, {
    cohort: { baseSize, sizeVariance: 0.05, minimumSize: Math.min(4, baseSize), maximumSize: baseSize + 20 },
  });
  return {
    countryKey: key,
    countryId: id,
    countryName: key,
    profile,
    namePool: pool(key),
    namePoolVersionId: `np-${key}`,
    namePoolHash: 'h',
    profileHash: hashCountryYouthProfile(profile),
  };
}

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    failures += 1;
  } else console.log(`PASS: ${msg}`);
}

const countries = [
  country('NAV', 'id-nav', 20),
  country('SGL', 'id-sgl', 15),
  country('FIR', 'id-fir', 12),
];

const t0 = Date.now();
const a = generateYouthRun({
  worldSeasonId: 'ws',
  referenceDate: '2027-07-01',
  baseSeed: 'youth-verify',
  profileSetHash: 'ps',
  countries,
});
const b = generateYouthRun({
  worldSeasonId: 'ws',
  referenceDate: '2027-07-01',
  baseSeed: 'youth-verify',
  profileSetHash: 'ps',
  countries,
});
const dt = Date.now() - t0;

check(a.summary.resultHash === b.summary.resultHash, 'deterministic result hash');
check(a.players.every((p) => [15, 16, 17].includes(p.ageOnReferenceDate)), 'ages 15–17');
check(a.summary.age17Count >= a.summary.age15Count, 'age 17 emphasized vs 15');
check(a.players.some((p) => p.position === 'G'), 'includes goalies');
check(a.players.some((p) => p.position !== 'G'), 'includes skaters');
check(
  a.players.every((p) => p.sourceType === 'GENERATED_YOUTH' && p.lifecycleStatus === 'PROSPECT'),
  'source/status',
);
check(a.players.every((p) => p.currentTeamId === null), 'no club ownership');

const alt = generateYouthRun({
  worldSeasonId: 'ws',
  referenceDate: '2027-07-01',
  baseSeed: 'youth-verify-alt',
  profileSetHash: 'ps',
  countries,
});
check(alt.summary.resultHash !== a.summary.resultHash, 'different seed changes result');

const bigCountries = [country('BIG', 'id-big', 500)];
const tBig = Date.now();
const big = generateYouthRun({
  worldSeasonId: 'ws',
  referenceDate: '2027-07-01',
  baseSeed: 'youth-500',
  profileSetHash: 'ps',
  countries: bigCountries,
});
const bigMs = Date.now() - tBig;
check(big.summary.totalGeneratedPlayers >= 450, '500-scale cohort generated');
console.log(
  `duration small=${dt}ms big≈${big.summary.totalGeneratedPlayers}players ${bigMs}ms result=${a.summary.resultHash.slice(0, 16)}…`,
);

if (failures > 0) {
  console.error(`Youth generation verification failed (${failures})`);
  process.exit(1);
}
console.log('Youth generation verification passed');
