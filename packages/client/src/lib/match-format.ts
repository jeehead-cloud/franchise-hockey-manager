import type { MatchEventItem } from './api';

export function formatMatchClock(remainingSeconds: number): string {
  const m = Math.floor(remainingSeconds / 60);
  const s = remainingSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatDecisionLabel(decisionType: string | null | undefined): string {
  switch (decisionType) {
    case 'REGULATION':
      return 'Regulation';
    case 'OVERTIME':
      return 'Overtime';
    case 'SHOOTOUT':
      return 'Shootout';
    case 'TIE':
      return 'Tie';
    default:
      return decisionType ?? '—';
  }
}

export function formatDisplayScore(
  homeScore: number,
  awayScore: number,
  decisionType: string | null | undefined,
): string {
  const base = `${homeScore}–${awayScore}`;
  if (decisionType === 'OVERTIME') return `${base} OT`;
  if (decisionType === 'SHOOTOUT') return `${base} SO`;
  return base;
}

function formatInfraction(infraction: unknown): string {
  if (typeof infraction !== 'string' || !infraction) return 'penalty';
  return infraction.replace(/_/g, ' ').toLowerCase();
}

function formatGoalStrength(goalStrength: unknown): string {
  if (goalStrength === 'POWER_PLAY') return 'Power-play goal';
  if (goalStrength === 'SHORT_HANDED') return 'Short-handed goal';
  return 'Goal';
}

function playerLabel(name: string | null | undefined, playerId: string | null | undefined): string {
  if (name) return name;
  if (playerId) return playerId.slice(0, 8);
  return 'Unknown';
}

export function formatPersistedMatchEvent(ev: MatchEventItem): string {
  const clock = formatMatchClock(ev.remainingSeconds);
  const prefix = `P${ev.period} ${clock}`;
  const d = ev.event.details ?? {};
  const primaryName = ev.primaryPlayerName;

  switch (ev.eventType) {
    case 'GOAL': {
      const scorer = playerLabel(primaryName, String(d.scorerId ?? ev.primaryPlayerId ?? ev.event.playerIds?.[0]));
      const primary = d.primaryAssistId ? String(d.primaryAssistId).slice(0, 8) : null;
      const secondary = d.secondaryAssistId ? String(d.secondaryAssistId).slice(0, 8) : null;
      const assists =
        primary && secondary ? ` (${primary}, ${secondary})` : primary ? ` (${primary})` : '';
      return `${prefix} — ${formatGoalStrength(d.goalStrength)}: ${scorer}${assists}`;
    }
    case 'PENALTY': {
      const offender = playerLabel(primaryName, String(d.penalizedPlayerId ?? ev.primaryPlayerId));
      const duration =
        typeof d.durationSeconds === 'number' ? formatMatchClock(d.durationSeconds) : '2:00';
      return `${prefix} — Penalty: ${offender} — ${formatInfraction(d.infraction)} (${duration})`;
    }
    case 'PENALTY_EXPIRED': {
      const offender = playerLabel(primaryName, String(d.penalizedPlayerId ?? ev.primaryPlayerId));
      const reason = d.reason ? ` (${String(d.reason).replace(/_/g, ' ').toLowerCase()})` : '';
      return `${prefix} — Penalty expired: ${offender}${reason}`;
    }
    case 'SAVE': {
      const shooter = playerLabel(null, String(d.shooterId ?? ev.event.playerIds?.[1]));
      const goalie = playerLabel(primaryName, String(d.goalieId ?? ev.primaryPlayerId));
      const shotType = String(d.shotType ?? 'shot').toLowerCase();
      return `${prefix} — ${shooter} ${shotType} saved by ${goalie}`;
    }
    case 'SHOT': {
      const shooter = playerLabel(primaryName, String(d.shooterId ?? ev.primaryPlayerId));
      const shotType = String(d.shotType ?? 'shot').toLowerCase();
      return `${prefix} — ${shooter} ${shotType} shot`;
    }
    case 'SHOT_BLOCKED':
    case 'SHOT_MISSED': {
      const shooter = playerLabel(primaryName, String(d.shooterId ?? ev.primaryPlayerId));
      return `${prefix} — ${shooter} shot ${ev.eventType === 'SHOT_BLOCKED' ? 'blocked' : 'missed'}`;
    }
    case 'SHOOTOUT_ATTEMPT': {
      const shooter = playerLabel(primaryName, String(d.shooterId ?? ev.primaryPlayerId));
      const goalie = playerLabel(null, String(d.goalieId));
      const scored = d.scored ? 'scores' : 'misses';
      return `${prefix} — Shootout: ${shooter} ${scored} vs ${goalie}`;
    }
    case 'OVERTIME_START':
      return `${prefix} — Overtime begins (3v3)`;
    case 'OVERTIME_END':
      return `${prefix} — Overtime ends`;
    case 'SHOOTOUT_START':
      return `${prefix} — Shootout begins`;
    case 'SHOOTOUT_END':
      return `${prefix} — Shootout ends`;
    case 'MATCH_END': {
      const decision = formatDecisionLabel(String(d.decisionType ?? ''));
      return `${prefix} — Match ends (${decision})`;
    }
    default: {
      const label = ev.eventType.replace(/_/g, ' ').toLowerCase();
      return `${prefix} — ${label}`;
    }
  }
}
