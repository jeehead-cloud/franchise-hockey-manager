import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/client.js';

function serializePlayer(p: {
  id: string;
  teamId: string;
  firstName: string;
  surname: string;
  nationality: string;
  position: string;
  age: number;
  startTotal: number;
  devRate: number;
  risk: number;
  bonusPotential: number;
  currentDevState: number;
  stabPlus: number;
  stabMinus: number;
  currentStabState: number;
  ageAdj: number;
  currTotal: number;
  offensePct: number;
  defencePct: number;
  offence: number;
  defence: number;
  sth: number | null;
  sho: number | null;
  pas: number | null;
  str: number | null;
  spd: number | null;
  bal: number | null;
  agg: number | null;
  ofAw: number | null;
  defAw: number | null;
  goalieAttributes: string | null;
  preferredCoachingStyle: string;
  preferredTactics: string;
  personality: string;
  heroRating: number;
  nationalTeam: number;
  role: string | null;
  roleRating: number | null;
  curOverTot: number | null;
  overPot: number | null;
}) {
  return {
    id: p.id,
    teamId: p.teamId,
    firstName: p.firstName,
    surname: p.surname,
    name: `${p.firstName} ${p.surname}`,
    nationality: p.nationality,
    position: p.position,
    age: p.age,
    startTotal: p.startTotal,
    devRate: p.devRate,
    risk: p.risk,
    bonusPotential: p.bonusPotential,
    currentDevState: p.currentDevState,
    stabPlus: p.stabPlus,
    stabMinus: p.stabMinus,
    currentStabState: p.currentStabState,
    ageAdj: p.ageAdj,
    currTotal: p.currTotal,
    offensePct: p.offensePct,
    defencePct: p.defencePct,
    offence: p.offence,
    defence: p.defence,
    attributes:
      p.sth != null
        ? {
            STH: p.sth,
            SHO: p.sho,
            PAS: p.pas,
            STR: p.str,
            SPD: p.spd,
            BAL: p.bal,
            AGG: p.agg,
            'OF.AW': p.ofAw,
            'DEF.AW': p.defAw,
          }
        : null,
    goalieAttributes: p.goalieAttributes ? JSON.parse(p.goalieAttributes) : null,
    preferredCoachingStyle: p.preferredCoachingStyle,
    preferredTactics: p.preferredTactics,
    personality: p.personality,
    heroRating: p.heroRating,
    nationalTeam: p.nationalTeam,
    role: p.role,
    roleRating: p.roleRating,
    curOverTot: p.curOverTot,
    overPot: p.overPot,
  };
}

export async function registerTeamRoutes(app: FastifyInstance) {
  app.get('/api/teams', async (_request, reply) => {
    const teams = await prisma.team.findMany({
      orderBy: [{ conference: 'asc' }, { division: 'asc' }, { city: 'asc' }],
      select: {
        id: true,
        name: true,
        city: true,
        conference: true,
        division: true,
        leagueId: true,
        _count: { select: { players: true } },
      },
    });

    return reply.send(
      teams.map((t) => ({
        id: t.id,
        name: t.name,
        city: t.city,
        conference: t.conference,
        division: t.division,
        leagueId: t.leagueId,
        playerCount: t._count.players,
      })),
    );
  });

  app.get<{ Params: { id: string } }>('/api/teams/:id', async (request, reply) => {
    const team = await prisma.team.findUnique({
      where: { id: request.params.id },
      include: {
        players: {
          orderBy: [{ position: 'asc' }, { currTotal: 'desc' }],
        },
      },
    });

    if (!team) {
      return reply.status(404).send({ error: 'Team not found' });
    }

    return reply.send({
      id: team.id,
      name: team.name,
      city: team.city,
      conference: team.conference,
      division: team.division,
      leagueId: team.leagueId,
      players: team.players.map(serializePlayer),
    });
  });
}
