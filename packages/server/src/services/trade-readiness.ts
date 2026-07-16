import { prisma } from '../db/client.js';
import { getActiveTradeSnapshot } from './trade-config.js';
import { TradeHttpError } from './trade-errors.js';

/**
 * F29 trade readiness. Does NOT enforce roster limits or salary cap. Blockers are
 * hard failures; warnings are advisory (lineup-review, value imbalance, etc.).
 * Lineup-readiness warnings derive from existing F8 ownership-mismatch detection
 * — F29 never rewrites lineups automatically.
 */
export async function getTradeReadiness() {
  const [config, openProposals, submittedProposals, completedTrades, teams] = await Promise.all([
    getActiveTradeSnapshot(prisma).catch(() => null),
    prisma.tradeProposal.count({ where: { status: { in: ['DRAFT', 'SUBMITTED'] } } }),
    prisma.tradeProposal.count({ where: { status: 'SUBMITTED' } }),
    prisma.completedTrade.count(),
    prisma.team.count({ where: { teamType: 'CLUB' } }),
  ]);
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!config) blockers.push('Trade configuration missing');
  if (teams < 2) warnings.push('Fewer than two club teams exist');
  if (submittedProposals) warnings.push(`${submittedProposals} submitted proposal(s) await a decision`);
  return {
    status: blockers.length ? 'NOT_READY' : warnings.length ? 'WARNING' : 'READY',
    checks: { configured: Boolean(config), openProposals, submittedProposals, completedTrades, clubTeams: teams },
    blockers,
    warnings,
    noSalaryCap: true,
  };
}

/** Evaluate per-team lineup ownership after a hypothetical trade (advisory). */
export async function evaluateTeamLineupWarning(teamId: string): Promise<{ lineupRequiresReview: boolean; reason: string | null }> {
  // F29 does not rewrite lineups. After a trade a team's lineup may reference a
  // player it no longer owns, or fail to include an incoming player. We surface a
  // review warning rather than mutating the lineup.
  const lineup = await prisma.teamLineup.findUnique({ where: { teamId }, include: { assignments: { include: { player: { select: { id: true, currentTeamId: true } } } } } });
  if (!lineup || !lineup.assignments.length) return { lineupRequiresReview: false, reason: null };
  const orphaned = lineup.assignments.filter((a) => a.player.currentTeamId !== teamId);
  if (orphaned.length) return { lineupRequiresReview: true, reason: `${orphaned.length} lineup slot(s) reference players no longer owned by this team` };
  return { lineupRequiresReview: false, reason: null };
}

/** Team trade-center overview: open/incoming/outgoing proposals + recent trades. */
export async function getTeamTradeOverview(teamId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true, name: true, teamType: true } });
  if (!team) throw new TradeHttpError(404, 'TeamNotFound', 'Team not found');
  const [outgoing, incoming, openProposals, recentTrades, rightsHeld, availablePicks, lineupWarning] = await Promise.all([
    prisma.tradeProposal.count({ where: { proposingTeamId: teamId, status: 'SUBMITTED' } }),
    prisma.tradeProposal.count({ where: { receivingTeamId: teamId, status: 'SUBMITTED' } }),
    prisma.tradeProposal.count({ where: { OR: [{ proposingTeamId: teamId }, { receivingTeamId: teamId }], status: { in: ['DRAFT', 'SUBMITTED'] } } }),
    prisma.completedTrade.count({ where: { OR: [{ proposingTeamId: teamId }, { receivingTeamId: teamId }] } }),
    prisma.playerDraftRight.count({ where: { teamId, status: 'ACTIVE' } }),
    prisma.draftPick.count({ where: { currentTeamId: teamId, status: 'PENDING' } }),
    evaluateTeamLineupWarning(teamId),
  ]);
  return {
    team: { id: team.id, name: team.name, isClub: team.teamType === 'CLUB' },
    openProposals, incomingProposals: incoming, outgoingProposals: outgoing, recentCompletedTrades: recentTrades,
    rightsHeldUnsignedProspects: rightsHeld, availablePicks, lineupRequiresReview: lineupWarning.lineupRequiresReview,
    lineupReviewReason: lineupWarning.reason,
  };
}
