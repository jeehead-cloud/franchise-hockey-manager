import type { PenaltiesBalanceSection } from '../../balance/types.js';
import type {
  ActiveLines,
  MatchState,
  SimulationInput,
  SimulationPlayerProfile,
  SimulationTeamInput,
} from './types.js';

const FORWARD_POS = new Set(['LW', 'C', 'RW']);
const DEFENSE_POS = new Set(['LD', 'RD']);

function skaterScore(
  p: SimulationPlayerProfile,
  mode: 'PP' | 'PK',
  cfg: PenaltiesBalanceSection,
  coachOffense: number,
  coachDefense: number,
): number {
  const attrs = p.skaterAttributes!;
  if (mode === 'PP') {
    const w = cfg.powerPlayAttackWeights;
    return (
      (p.offensiveRating ?? p.currentAbility) * w.offensiveRating +
      attrs.passing * w.passing +
      attrs.shooting * w.shooting +
      attrs.offensiveAwareness * w.offensiveAwareness +
      coachOffense * w.coachOffense +
      p.currentAbility * 0.05
    );
  }
  const w = cfg.penaltyKillDefenseWeights;
  return (
    (p.defensiveRating ?? p.currentAbility) * w.defensiveRating +
    attrs.defensiveAwareness * w.defensiveAwareness +
    attrs.speed * w.speed +
    attrs.strength * w.strength +
    coachDefense * w.coachDefense +
    p.currentAbility * 0.05
  );
}

function pickOrdered(
  candidates: SimulationPlayerProfile[],
  count: number,
  mode: 'PP' | 'PK',
  cfg: PenaltiesBalanceSection,
  coachOffense: number,
  coachDefense: number,
  exclude: Set<string>,
): SimulationPlayerProfile[] {
  const ranked = candidates
    .filter((p) => !exclude.has(p.playerId) && p.primaryPosition !== 'G' && p.skaterAttributes)
    .sort((a, b) => {
      const sa = skaterScore(a, mode, cfg, coachOffense, coachDefense);
      const sb = skaterScore(b, mode, cfg, coachOffense, coachDefense);
      if (sb !== sa) return sb - sa;
      return a.playerId.localeCompare(b.playerId);
    });
  return ranked.slice(0, count);
}

function selectUnit(
  team: SimulationTeamInput,
  mode: 'PP' | 'PK',
  cfg: PenaltiesBalanceSection,
  excludePlayerId: string | null,
): { forwardIds: string[]; defenseIds: string[]; warnings: string[] } {
  const exclude = new Set<string>();
  if (excludePlayerId) exclude.add(excludePlayerId);
  const skaters = team.players.filter((p) => p.primaryPosition !== 'G' && p.skaterAttributes);
  const forwards = skaters.filter((p) => FORWARD_POS.has(p.primaryPosition));
  const defense = skaters.filter((p) => DEFENSE_POS.has(p.primaryPosition));
  const warnings: string[] = [];

  const needF = mode === 'PP' ? 3 : 2;
  const needD = 2;
  const total = mode === 'PP' ? 5 : 4;

  let fwd = pickOrdered(forwards, needF, mode, cfg, team.coach.offense, team.coach.defense, exclude);
  for (const p of fwd) exclude.add(p.playerId);
  let def = pickOrdered(defense, needD, mode, cfg, team.coach.offense, team.coach.defense, exclude);
  for (const p of def) exclude.add(p.playerId);

  if (fwd.length < needF) {
    warnings.push(`${team.side} ${mode}: filled forwards from remaining skaters`);
    const extra = pickOrdered(skaters, needF - fwd.length, mode, cfg, team.coach.offense, team.coach.defense, exclude);
    for (const p of extra) {
      fwd.push(p);
      exclude.add(p.playerId);
    }
  }
  if (def.length < needD) {
    warnings.push(`${team.side} ${mode}: filled defense from remaining skaters`);
    const extra = pickOrdered(skaters, needD - def.length, mode, cfg, team.coach.offense, team.coach.defense, exclude);
    for (const p of extra) {
      def.push(p);
      exclude.add(p.playerId);
    }
  }

  let selected = [...fwd, ...def];
  if (selected.length < total) {
    warnings.push(`${team.side} ${mode}: composition fallback to top eligible skaters`);
    const extra = pickOrdered(skaters, total - selected.length, mode, cfg, team.coach.offense, team.coach.defense, exclude);
    selected = [...selected, ...extra];
    fwd = selected.filter((p) => FORWARD_POS.has(p.primaryPosition));
    def = selected.filter((p) => DEFENSE_POS.has(p.primaryPosition));
    const leftovers = selected.filter((p) => !FORWARD_POS.has(p.primaryPosition) && !DEFENSE_POS.has(p.primaryPosition));
    // Ensure arrays have correct length for ActiveLines bookkeeping
    while (fwd.length + leftovers.length < needF && leftovers.length) {
      fwd.push(leftovers.shift()!);
    }
    while (def.length < needD && leftovers.length) {
      def.push(leftovers.shift()!);
    }
    // Put any remaining into forwards for PP / defense for PK bookkeeping
    for (const p of leftovers) {
      if (fwd.length < needF) fwd.push(p);
      else def.push(p);
    }
  }

  const forwardIds = selected.slice(0, needF).map((p) => p.playerId);
  const defenseIds = selected.slice(needF, total).map((p) => p.playerId);

  if (forwardIds.length + defenseIds.length !== total) {
    throw new Error(`Unable to field ${total} ${mode} skaters for team ${team.teamId}`);
  }
  if (new Set([...forwardIds, ...defenseIds]).size !== total) {
    throw new Error(`Duplicate players in ${mode} unit for team ${team.teamId}`);
  }

  return { forwardIds, defenseIds, warnings };
}

/**
 * Deterministic temporary PP/PK units from main lineup (not persisted).
 * Prefer F9 chemistry units only when EVEN; this path is for special teams.
 */
export function selectSpecialTeamLines(
  input: SimulationInput,
  state: MatchState,
  cfg: PenaltiesBalanceSection,
): { lines: ActiveLines; warnings: string[] } {
  const penalty = state.activePenalty;
  if (!penalty) {
    throw new Error('selectSpecialTeamLines requires an active penalty');
  }

  const ppSide = penalty.advantagedSide;
  const pkSide = penalty.penalizedSide;
  const ppTeam = ppSide === 'HOME' ? input.homeTeam : input.awayTeam;
  const pkTeam = pkSide === 'HOME' ? input.homeTeam : input.awayTeam;

  const pp = selectUnit(ppTeam, 'PP', cfg, null);
  const pk = selectUnit(pkTeam, 'PK', cfg, penalty.penalizedPlayerId);

  if (pk.forwardIds.concat(pk.defenseIds).includes(penalty.penalizedPlayerId)) {
    throw new Error('Penalized player selected for PK unit');
  }

  const homeIsPp = ppSide === 'HOME';
  return {
    warnings: [...pp.warnings, ...pk.warnings],
    lines: {
      homeForwardLineKey: homeIsPp ? 'PP' : 'PK',
      homeDefensePairKey: homeIsPp ? 'PP' : 'PK',
      awayForwardLineKey: homeIsPp ? 'PK' : 'PP',
      awayDefensePairKey: homeIsPp ? 'PK' : 'PP',
      homeGoalieId: input.homeTeam.starterGoalie.playerIds[0]!,
      awayGoalieId: input.awayTeam.starterGoalie.playerIds[0]!,
      homeForwardPlayerIds: homeIsPp ? pp.forwardIds : pk.forwardIds,
      homeDefensePlayerIds: homeIsPp ? pp.defenseIds : pk.defenseIds,
      awayForwardPlayerIds: homeIsPp ? pk.forwardIds : pp.forwardIds,
      awayDefensePlayerIds: homeIsPp ? pk.defenseIds : pp.defenseIds,
    },
  };
}

/** Bounded composite EP for temporary special-team units (not F9 chemistry). */
export function specialTeamUnitEp(
  input: SimulationInput,
  side: 'HOME' | 'AWAY',
  lines: ActiveLines,
  mode: 'PP' | 'PK',
  cfg: PenaltiesBalanceSection,
): number {
  const team = side === 'HOME' ? input.homeTeam : input.awayTeam;
  const ids =
    side === 'HOME'
      ? [...lines.homeForwardPlayerIds, ...lines.homeDefensePlayerIds]
      : [...lines.awayForwardPlayerIds, ...lines.awayDefensePlayerIds];
  const players = ids
    .map((id) => team.players.find((p) => p.playerId === id))
    .filter((p): p is SimulationPlayerProfile => Boolean(p));
  if (players.length === 0) return 50;
  const scores = players.map((p) =>
    skaterScore(p, mode, cfg, team.coach.offense, team.coach.defense),
  );
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  // Normalize roughly into 0–100 EP-like scale
  return Math.max(40, Math.min(90, avg / 4));
}
