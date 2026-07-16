import { prisma } from '../db/client.js';
import { OffseasonHttpError } from './offseason-errors.js';

/**
 * F30 Team-specific offseason view. Shows one Team's offseason-relevant
 * summaries drawn from the authoritative subsystems (F26/F27/F28/F29) without
 * duplicating their data or exposing another Team's private scouting reports.
 *
 * Privacy: only this Team's own scouting/contract/proposal rows are read; we
 * never load another Team's private TeamScoutingReport / draft board here.
 */
export async function getTeamOffseasonOverview(teamId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true, name: true, teamType: true, leagueId: true } });
  if (!team) throw new OffseasonHttpError(404, 'TeamNotFound', 'Team not found');

  const [
    activeContracts,
    expiringContracts,
    futureContracts,
    submittedOffers,
    incomingOffers,
    freeAgentsOwned,
    draftRights,
    draftedPlayers,
    incomingTrades,
    outgoingTrades,
    completedTrades,
    retiredPlayers,
    rosterReadiness,
    lineupReadiness,
    staleScouting,
  ] = await Promise.all([
    prisma.playerContract.count({ where: { teamId, status: 'ACTIVE' } }),
    prisma.playerContract.count({ where: { teamId, status: 'ACTIVE' } }),
    prisma.playerContract.count({ where: { teamId, status: 'FUTURE' } }),
    prisma.contractOffer.count({ where: { offeringTeamId: teamId, status: 'SUBMITTED' } }),
    // Incoming offers against this team's currently-signed players.
    prisma.contractOffer.count({ where: { status: 'SUBMITTED', player: { contracts: { some: { teamId, status: 'ACTIVE' } } } } }),
    0,
    prisma.playerDraftRight.findMany({ where: { teamId, status: 'ACTIVE' }, select: { id: true, playerId: true, playerNameSnapshot: true, draftEventId: true }, take: 50 }),
    prisma.playerDraftRight.findMany({ where: { teamId, status: 'CONVERTED_TO_CONTRACT' }, select: { id: true, playerId: true, playerNameSnapshot: true }, take: 50 }),
    prisma.tradeProposal.count({ where: { receivingTeamId: teamId, status: { in: ['DRAFT', 'SUBMITTED'] } } }),
    prisma.tradeProposal.count({ where: { proposingTeamId: teamId, status: { in: ['DRAFT', 'SUBMITTED'] } } }),
    prisma.completedTrade.count({ where: { OR: [{ proposingTeamId: teamId }, { receivingTeamId: teamId }] } }),
    prisma.player.count({ where: { currentTeamId: teamId, rosterStatus: 'RETIRED' } }),
    computeTeamRosterReadiness(teamId),
    computeTeamLineupReadiness(teamId),
    computeTeamStaleScouting(teamId),
  ]);

  return {
    team,
    contracts: { active: activeContracts, expiring: expiringContracts, future: futureContracts },
    offers: { submittedByThisTeam: submittedOffers, incomingAgainstThisTeam: incomingOffers },
    freeAgents: freeAgentsOwned,
    draftRights: { unsigned: draftRights.length, signed: draftedPlayers.length, items: draftRights },
    draftedPlayers: draftedPlayers.map((r) => ({ playerId: r.playerId, playerNameSnapshot: r.playerNameSnapshot })),
    trades: { incomingProposals: incomingTrades, outgoingProposals: outgoingTrades, completedCount: completedTrades },
    retiredPlayers,
    rosterReadiness,
    lineupReadiness,
    staleScoutingReports: staleScouting,
  };
}

async function computeTeamRosterReadiness(teamId: string) {
  // Roster ownership sanity for this team only.
  const activeContracts = await prisma.playerContract.findMany({
    where: { teamId, status: 'ACTIVE' },
    select: { playerId: true },
  });
  const playerIds = activeContracts.map((c) => c.playerId);
  const players = await prisma.player.findMany({ where: { id: { in: playerIds } }, select: { id: true, currentTeamId: true, rosterStatus: true } });
  const currentTeam = new Map<string, { currentTeamId: string | null; rosterStatus: string }>();
  for (const p of players) currentTeam.set(p.id, { currentTeamId: p.currentTeamId, rosterStatus: p.rosterStatus });
  let ownershipMismatch = 0;
  let retiredOnRoster = 0;
  for (const c of activeContracts) {
    const p = currentTeam.get(c.playerId);
    if (!p) continue;
    if (p.currentTeamId !== teamId) ownershipMismatch += 1;
    if (p.rosterStatus === 'RETIRED') retiredOnRoster += 1;
  }
  const blockers: string[] = [];
  if (ownershipMismatch > 0) blockers.push(`${ownershipMismatch} player(s) where currentTeamId does not match this team`);
  if (retiredOnRoster > 0) blockers.push(`${retiredOnRoster} retired player(s) still on roster`);
  return { ownershipMismatch, retiredOnRoster, blockers };
}

async function computeTeamLineupReadiness(teamId: string) {
  const lineup = await prisma.teamLineup.findUnique({
    where: { teamId },
    include: { assignments: { include: { player: { select: { id: true, currentTeamId: true, rosterStatus: true } } } } },
  });
  if (!lineup) return { present: false, slotCount: 0, retiredInLineup: 0, ownershipMismatch: 0, blockers: ['No lineup saved for this team'] };
  const blockers: string[] = [];
  let retiredInLineup = 0;
  let ownershipMismatch = 0;
  for (const a of lineup.assignments) {
    if (a.player.rosterStatus === 'RETIRED') retiredInLineup += 1;
    if (a.player.currentTeamId && a.player.currentTeamId !== teamId) ownershipMismatch += 1;
  }
  if (retiredInLineup > 0) blockers.push(`${retiredInLineup} retired player(s) in lineup`);
  if (ownershipMismatch > 0) blockers.push(`${ownershipMismatch} lineup slot(s) reference players no longer owned`);
  return { present: true, slotCount: lineup.assignments.length, retiredInLineup, ownershipMismatch, blockers };
}

async function computeTeamStaleScouting(teamId: string) {
  // F26 staleness is computed against the player-state hash. We surface the
  // count of this team's current reports; refreshing stale reports is an F26
  // action, not an F30 action.
  const reportCount = await prisma.teamScoutingReport.count({ where: { teamId } });
  return { currentReports: reportCount };
}
