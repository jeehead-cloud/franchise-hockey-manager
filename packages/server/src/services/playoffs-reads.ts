import { prisma } from '../db/client.js';
import { PlayoffHttpError } from './playoff-errors.js';
import { getStageTeamStats, getStagePlayerStats } from './regular-season-aggregates.js';

export async function getPlayoffBracket(stageId: string) {
  const stage = await prisma.competitionStage.findUnique({
    where: { id: stageId },
    include: {
      participants: {
        include: { participant: true },
        orderBy: { seed: 'asc' },
      },
      playoffSeries: { orderBy: [{ roundNumber: 'asc' }, { seriesOrder: 'asc' }] },
    },
  });
  if (!stage) throw new PlayoffHttpError(404, 'CompetitionStageNotFound', 'Stage not found');
  if (stage.stageType !== 'BEST_OF_SERIES' && stage.stageType !== 'KNOCKOUT') {
    throw new PlayoffHttpError(409, 'StageNotPlayoff', 'Not a playoff stage');
  }

  const seriesIds = stage.playoffSeries.map((s) => s.id);
  const matches = await prisma.match.findMany({
    where: { playoffSeriesId: { in: seriesIds } },
    include: {
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
    },
    orderBy: { playoffGameNumber: 'asc' },
  });
  const resultIds = matches.map((m) => m.currentResultId).filter(Boolean) as string[];
  const results =
    resultIds.length > 0
      ? await prisma.matchResult.findMany({
          where: { id: { in: resultIds } },
          select: {
            id: true,
            decisionType: true,
            homeScore: true,
            awayScore: true,
            winnerTeamId: true,
            completedAt: true,
          },
        })
      : [];
  const resultById = new Map(results.map((r) => [r.id, r]));
  const matchesBySeries = new Map<string, typeof matches>();
  for (const m of matches) {
    if (!m.playoffSeriesId) continue;
    if (!matchesBySeries.has(m.playoffSeriesId)) matchesBySeries.set(m.playoffSeriesId, []);
    matchesBySeries.get(m.playoffSeriesId)!.push(m);
  }

  const roundsMap = new Map<number, typeof stage.playoffSeries>();
  for (const s of stage.playoffSeries) {
    if (!roundsMap.has(s.roundNumber)) roundsMap.set(s.roundNumber, []);
    roundsMap.get(s.roundNumber)!.push(s);
  }

  return {
    stage: {
      id: stage.id,
      name: stage.name,
      status: stage.status,
      bracketSeed: stage.bracketSeed,
      bracketHash: stage.bracketHash,
      bracketVersion: stage.bracketVersion,
      championParticipantId: stage.championParticipantId,
      championTeamNameSnapshot: stage.championTeamNameSnapshot,
      championSeed: stage.championSeed,
      championshipSeriesId: stage.championshipSeriesId,
      completedAt: stage.completedAt?.toISOString() ?? null,
    },
    participants: stage.participants.map((p) => ({
      competitionParticipantId: p.competitionParticipantId,
      seed: p.seed,
      teamId: p.participant.teamId,
      teamNameSnapshot: p.participant.teamNameSnapshot,
      status: p.status,
    })),
    rounds: [...roundsMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([roundNumber, series]) => ({
        roundNumber,
        roundName: series[0]?.roundName ?? `Round ${roundNumber}`,
        series: series.map((s) => {
          const games = matchesBySeries.get(s.id) ?? [];
          const nextGame = games.find((g) => g.status === 'PREPARED' || g.status === 'FAILED');
          return {
            id: s.id,
            roundNumber: s.roundNumber,
            roundName: s.roundName,
            seriesOrder: s.seriesOrder,
            bracketSlot: s.bracketSlot,
            status: s.status,
            winsRequired: s.winsRequired,
            participant1: {
              id: s.participant1Id,
              seed: s.participant1Seed,
              name: s.participant1NameSnapshot,
              wins: s.participant1Wins,
            },
            participant2: {
              id: s.participant2Id,
              seed: s.participant2Seed,
              name: s.participant2NameSnapshot,
              wins: s.participant2Wins,
            },
            winnerParticipantId: s.winnerParticipantId,
            nextGame: nextGame
              ? {
                  id: nextGame.id,
                  gameNumber: nextGame.playoffGameNumber,
                  homeTeamName: nextGame.homeTeam.name,
                  awayTeamName: nextGame.awayTeam.name,
                  status: nextGame.status,
                }
              : null,
            games: games.map((g) => {
              const current = g.currentResultId ? resultById.get(g.currentResultId) : null;
              return {
                id: g.id,
                gameNumber: g.playoffGameNumber,
                homeTeamId: g.homeTeamId,
                awayTeamId: g.awayTeamId,
                homeTeamName: g.homeTeam.name,
                awayTeamName: g.awayTeam.name,
                status: g.status,
                currentResult: current
                  ? {
                      id: current.id,
                      decisionType: current.decisionType,
                      homeScore: current.homeScore,
                      awayScore: current.awayScore,
                      winnerTeamId: current.winnerTeamId,
                      completedAt: current.completedAt?.toISOString() ?? null,
                    }
                  : null,
              };
            }),
          };
        }),
      })),
  };
}

export async function getPlayoffSeriesDetail(seriesId: string) {
  const series = await prisma.playoffSeries.findUnique({
    where: { id: seriesId },
    include: { stage: true },
  });
  if (!series) throw new PlayoffHttpError(404, 'PlayoffSeriesNotFound', 'Series not found');
  const bracket = await getPlayoffBracket(series.competitionStageId);
  const found = bracket.rounds
    .flatMap((r) => r.series)
    .find((s) => s.id === seriesId);
  return { series: found, stage: bracket.stage };
}

export async function getPlayoffProgress(stageId: string) {
  const stage = await prisma.competitionStage.findUnique({ where: { id: stageId } });
  if (!stage) throw new PlayoffHttpError(404, 'CompetitionStageNotFound', 'Stage not found');
  const [totalSeries, completedSeries, totalGames, completedGames] = await Promise.all([
    prisma.playoffSeries.count({ where: { competitionStageId: stageId } }),
    prisma.playoffSeries.count({ where: { competitionStageId: stageId, status: 'COMPLETED' } }),
    prisma.match.count({ where: { competitionStageId: stageId, playoffSeriesId: { not: null } } }),
    prisma.match.count({
      where: { competitionStageId: stageId, playoffSeriesId: { not: null }, status: 'COMPLETED' },
    }),
  ]);
  const current = await prisma.playoffSeries.findFirst({
    where: { competitionStageId: stageId, status: { in: ['READY', 'IN_PROGRESS'] } },
    orderBy: [{ roundNumber: 'asc' }, { seriesOrder: 'asc' }],
  });
  return {
    stageId,
    status: stage.status,
    totalSeries,
    completedSeries,
    totalGames,
    completedGames,
    currentRound: current?.roundNumber ?? null,
    currentSeriesId: current?.id ?? null,
    championParticipantId: stage.championParticipantId,
    championTeamNameSnapshot: stage.championTeamNameSnapshot,
  };
}

export async function getEditionCompletionReadiness(editionId: string) {
  const edition = await prisma.competitionEdition.findUnique({
    where: { id: editionId },
    include: { stages: { orderBy: { stageOrder: 'asc' } } },
  });
  if (!edition) return null;

  const blockers: string[] = [];
  const required = edition.stages.filter((s) => s.status !== 'CANCELLED');
  const incomplete = required.filter((s) => s.status !== 'COMPLETED');
  if (incomplete.length) {
    blockers.push(`Incomplete stages: ${incomplete.map((s) => s.name).join(', ')}`);
  }
  const playoff = required.find(
    (s) => s.stageType === 'BEST_OF_SERIES' || s.stageType === 'KNOCKOUT',
  );
  const regularSeason = required.find((s) => s.stageType === 'REGULAR_SEASON');
  if (playoff) {
    if (!playoff.championParticipantId) {
      blockers.push('Playoff champion has not been determined');
    }
  } else if (!regularSeason?.championParticipantId) {
    blockers.push('League champion has not been determined (regular-season rank 1)');
  }
  const openMatches = await prisma.match.count({
    where: {
      competitionEditionId: editionId,
      status: { in: ['PREPARED', 'SIMULATING', 'FAILED'] },
      source: 'COMPETITION',
    },
  });
  if (openMatches > 0) {
    blockers.push(`${openMatches} competition matches are not completed`);
  }

  const championStage = playoff ?? regularSeason ?? null;

  return {
    editionId,
    status: edition.status,
    canCompleteEdition: blockers.length === 0 && edition.status === 'ACTIVE',
    blockers,
    completedStages: required.filter((s) => s.status === 'COMPLETED').map((s) => ({
      id: s.id,
      name: s.name,
      stageType: s.stageType,
    })),
    activeStages: incomplete.map((s) => ({ id: s.id, name: s.name, status: s.status })),
    champion: championStage?.championParticipantId
      ? {
          competitionParticipantId: championStage.championParticipantId,
          teamNameSnapshot: championStage.championTeamNameSnapshot,
          seed: championStage.championSeed ?? null,
          seriesId: championStage.championshipSeriesId ?? null,
        }
      : null,
  };
}

export { getStageTeamStats as getPlayoffTeamStats, getStagePlayerStats as getPlayoffPlayerStats };
