import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generatePlayer,
  type NamePool,
  type Nationality,
  type Position,
} from '@fhm/engine';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..', '..');

const NATIONALITIES: Nationality[] = [
  'Canada',
  'USA',
  'Russia',
  'Sweden',
  'Finland',
  'Czechia',
];

interface NhlTeamSeed {
  name: string;
  city: string;
  conference: string;
  division: string;
}

/** Realistic-ish age distribution for an NHL roster (not all age-15 prospects). */
function pickRosterAge(): number {
  const roll = Math.random();
  if (roll < 0.1) return 18 + Math.floor(Math.random() * 3); // 18–20
  if (roll < 0.35) return 21 + Math.floor(Math.random() * 3); // 21–23
  if (roll < 0.7) return 24 + Math.floor(Math.random() * 4); // 24–27 peak
  if (roll < 0.9) return 28 + Math.floor(Math.random() * 4); // 28–31
  return 32 + Math.floor(Math.random() * 7); // 32–38
}

function loadNamePools(): Record<Nationality, NamePool> {
  const pools = {} as Record<Nationality, NamePool>;
  for (const nat of NATIONALITIES) {
    const raw = readFileSync(join(repoRoot, 'data', 'names', `${nat}.json`), 'utf8');
    pools[nat] = JSON.parse(raw) as NamePool;
  }
  return pools;
}

function loadNhlTeams(): NhlTeamSeed[] {
  const raw = readFileSync(join(repoRoot, 'data', 'nhl-teams.json'), 'utf8');
  return JSON.parse(raw) as NhlTeamSeed[];
}

/** ~12 F / ~6 D / 2 G — total 20–23 with slight variance. */
function buildPositionList(): Position[] {
  const forwards: Position[] = [];
  const forwardSlots = 12 + Math.floor(Math.random() * 2); // 12–13
  const fwCycle: Position[] = ['C', 'LW', 'RW'];
  for (let i = 0; i < forwardSlots; i++) {
    forwards.push(fwCycle[i % 3]!);
  }

  const defense: Position[] = [];
  const dSlots = 6 + Math.floor(Math.random() * 2); // 6–7
  for (let i = 0; i < dSlots; i++) {
    defense.push(i % 2 === 0 ? 'LD' : 'RD');
  }

  // 12–13 F + 6–7 D + 2 G = 20–22
  return [...forwards, ...defense, 'G', 'G'];
}

async function main() {
  console.log('Seeding Franchise Hockey Manager…');

  // Wipe existing data for a clean re-seed
  await prisma.player.deleteMany();
  await prisma.team.deleteMany();
  await prisma.league.deleteMany();

  const league = await prisma.league.create({
    data: { name: 'NHL' },
  });
  console.log(`Created league: ${league.name}`);

  const teams = loadNhlTeams();
  const namePools = loadNamePools();

  let playerCount = 0;

  for (const t of teams) {
    const team = await prisma.team.create({
      data: {
        name: t.name,
        city: t.city,
        conference: t.conference,
        division: t.division,
        leagueId: league.id,
      },
    });

    const positions = buildPositionList();
    for (const position of positions) {
      const nationality = NATIONALITIES[Math.floor(Math.random() * NATIONALITIES.length)]!;
      const age = pickRosterAge();
      const generated = generatePlayer({
        position,
        age,
        nationality,
        namePool: namePools[nationality],
      });

      await prisma.player.create({
        data: {
          teamId: team.id,
          firstName: generated.firstName,
          surname: generated.surname,
          nationality: generated.nationality,
          position: generated.position,
          age: generated.age,
          startTotal: generated.startTotal,
          devRate: generated.devRate,
          risk: generated.risk,
          bonusPotential: generated.bonusPotential,
          currentDevState: generated.currentDevState,
          stabPlus: generated.stabPlus,
          stabMinus: generated.stabMinus,
          currentStabState: generated.currentStabState,
          ageAdj: generated.ageAdj,
          currTotal: generated.currTotal,
          offensePct: generated.offensePct,
          defencePct: generated.defencePct,
          offence: generated.offence,
          defence: generated.defence,
          sth: generated.attributes?.STH ?? null,
          sho: generated.attributes?.SHO ?? null,
          pas: generated.attributes?.PAS ?? null,
          str: generated.attributes?.STR ?? null,
          spd: generated.attributes?.SPD ?? null,
          bal: generated.attributes?.BAL ?? null,
          agg: generated.attributes?.AGG ?? null,
          ofAw: generated.attributes?.['OF.AW'] ?? null,
          defAw: generated.attributes?.['DEF.AW'] ?? null,
          goalieAttributes: generated.goalieAttributes
            ? JSON.stringify(generated.goalieAttributes)
            : null,
          preferredCoachingStyle: generated.preferredCoachingStyle,
          preferredTactics: generated.preferredTactics,
          personality: generated.personality,
          heroRating: generated.heroRating,
          nationalTeam: generated.nationalTeam,
          role: generated.role,
          roleRating: generated.roleRating,
          curOverTot: generated.curOverTot,
          overPot: generated.overPot,
        },
      });
      playerCount++;
    }

    console.log(`  ${team.city} ${team.name}: ${positions.length} players`);
  }

  console.log(`Done. ${teams.length} teams, ${playerCount} players.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
