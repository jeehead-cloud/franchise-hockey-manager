import { stableDigest } from '../../simulation/batch/hash.js';
import { sortJsonValue } from '../../balance/canonicalize.js';
import type {
  GeneratedSchedule,
  RegularSeasonConfig,
  ScheduleDiagnostics,
  ScheduledMatchSpec,
  ScheduleRound,
} from './types.js';
import { RegularSeasonError } from './types.js';

/** Stable lexicographic participant order — input order must not affect schedule. */
export function normalizeParticipantIds(participantIds: string[]): string[] {
  const unique = [...new Set(participantIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length !== participantIds.length) {
    throw new RegularSeasonError('InvalidScheduleConfiguration', 'Duplicate participant IDs');
  }
  if (unique.length < 2) {
    throw new RegularSeasonError('InvalidScheduleConfiguration', 'At least two participants are required');
  }
  return unique.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Circle method for single round-robin.
 * Odd n: insert bye sentinel, then drop bye games.
 * Returns unordered pairs per round (home assigned later).
 */
function circleRoundRobinPairs(ids: string[]): string[][][] {
  const teams = [...ids];
  const bye = '__BYE__';
  if (teams.length % 2 === 1) teams.push(bye);
  const n = teams.length;
  const rounds = n - 1;
  const half = n / 2;
  const arrangement = [...teams];
  const result: string[][][] = [];

  for (let r = 0; r < rounds; r += 1) {
    const pairs: string[][] = [];
    for (let i = 0; i < half; i += 1) {
      const a = arrangement[i]!;
      const b = arrangement[n - 1 - i]!;
      if (a !== bye && b !== bye) pairs.push([a, b]);
    }
    result.push(pairs);
    // rotate all but first
    const fixed = arrangement[0]!;
    const rest = arrangement.slice(1);
    rest.unshift(rest.pop()!);
    arrangement.splice(0, arrangement.length, fixed, ...rest);
  }
  return result;
}

function assignHomeAway(
  pair: [string, string],
  homeCounts: Map<string, number>,
  seed: string,
  roundNumber: number,
  slotNumber: number,
): { home: string; away: string } {
  const [a, b] = pair[0] < pair[1] ? pair : ([pair[1], pair[0]] as [string, string]);
  const ha = homeCounts.get(a) ?? 0;
  const hb = homeCounts.get(b) ?? 0;
  if (ha < hb) return { home: a, away: b };
  if (hb < ha) return { home: b, away: a };
  // tie-break deterministically from seed + round + ordered pair
  const digest = stableDigest(`${seed}:home:${roundNumber}:${slotNumber}:${a}:${b}`);
  const bit = Number.parseInt(digest.slice(0, 8), 16) % 2;
  return bit === 0 ? { home: a, away: b } : { home: b, away: a };
}

function buildDiagnostics(
  participantIds: string[],
  matches: ScheduledMatchSpec[],
): ScheduleDiagnostics {
  const gamesPerTeam: Record<string, number> = {};
  const homeGames: Record<string, number> = {};
  const awayGames: Record<string, number> = {};
  for (const id of participantIds) {
    gamesPerTeam[id] = 0;
    homeGames[id] = 0;
    awayGames[id] = 0;
  }
  for (const m of matches) {
    gamesPerTeam[m.homeParticipantId] = (gamesPerTeam[m.homeParticipantId] ?? 0) + 1;
    gamesPerTeam[m.awayParticipantId] = (gamesPerTeam[m.awayParticipantId] ?? 0) + 1;
    homeGames[m.homeParticipantId] = (homeGames[m.homeParticipantId] ?? 0) + 1;
    awayGames[m.awayParticipantId] = (awayGames[m.awayParticipantId] ?? 0) + 1;
  }
  let maxImbalance = 0;
  for (const id of participantIds) {
    maxImbalance = Math.max(maxImbalance, Math.abs((homeGames[id] ?? 0) - (awayGames[id] ?? 0)));
  }
  const rounds = matches.reduce((m, x) => Math.max(m, x.roundNumber), 0);
  return {
    participantCount: participantIds.length,
    totalMatches: matches.length,
    rounds,
    gamesPerTeam,
    homeGames,
    awayGames,
    maxHomeAwayImbalance: maxImbalance,
    restWarnings: [],
  };
}

function computeScheduleHash(payload: {
  seed: string;
  config: RegularSeasonConfig;
  participantIds: string[];
  matches: ScheduledMatchSpec[];
}): string {
  const normalized = {
    seed: payload.seed,
    config: sortJsonValue(payload.config),
    participantIds: payload.participantIds,
    matches: payload.matches.map((m) => ({
      scheduleKey: m.scheduleKey,
      homeParticipantId: m.homeParticipantId,
      awayParticipantId: m.awayParticipantId,
      roundNumber: m.roundNumber,
      slotNumber: m.slotNumber,
      scheduleOrder: m.scheduleOrder,
    })),
  };
  return stableDigest(JSON.stringify(normalized));
}

function finalize(
  seed: string,
  config: RegularSeasonConfig,
  participantIds: string[],
  matches: ScheduledMatchSpec[],
): GeneratedSchedule {
  // validate no self-matches / unique keys
  const keys = new Set<string>();
  for (const m of matches) {
    if (m.homeParticipantId === m.awayParticipantId) {
      throw new RegularSeasonError('ScheduleGenerationFailed', 'Self-match generated');
    }
    if (keys.has(m.scheduleKey)) {
      throw new RegularSeasonError('ScheduleGenerationFailed', `Duplicate scheduleKey ${m.scheduleKey}`);
    }
    keys.add(m.scheduleKey);
  }

  if (!config.allowBackToBack || config.minimumRestSlots > 0) {
    const restWarnings: string[] = [];
    const lastRound = new Map<string, number>();
    for (const m of [...matches].sort((a, b) => a.scheduleOrder - b.scheduleOrder)) {
      for (const pid of [m.homeParticipantId, m.awayParticipantId]) {
        const prev = lastRound.get(pid);
        if (prev !== undefined) {
          const gap = m.roundNumber - prev;
          if (!config.allowBackToBack && gap <= 1) {
            restWarnings.push(`${pid} plays in consecutive rounds ${prev} and ${m.roundNumber}`);
          }
          if (config.minimumRestSlots > 0 && gap - 1 < config.minimumRestSlots) {
            restWarnings.push(
              `${pid} has rest gap ${gap - 1} < minimumRestSlots ${config.minimumRestSlots}`,
            );
          }
        }
        lastRound.set(pid, m.roundNumber);
      }
    }
    if (restWarnings.length > 0 && !config.allowBackToBack) {
      throw new RegularSeasonError(
        'ScheduleGenerationFailed',
        `Back-to-back matches not allowed: ${restWarnings[0]}`,
      );
    }
  }

  const byRound = new Map<number, ScheduledMatchSpec[]>();
  for (const m of matches) {
    const list = byRound.get(m.roundNumber) ?? [];
    list.push(m);
    byRound.set(m.roundNumber, list);
  }
  const rounds: ScheduleRound[] = [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([roundNumber, ms]) => ({
      roundNumber,
      matches: ms.sort((a, b) => a.slotNumber - b.slotNumber),
    }));

  const diagnostics = buildDiagnostics(participantIds, matches);
  if (config.allowBackToBack === false) {
    // already thrown above
  }

  return {
    rounds,
    matches,
    diagnostics,
    scheduleHash: computeScheduleHash({ seed, config, participantIds, matches }),
    config,
    seed,
    participantIds,
  };
}

function generateRoundRobin(
  seed: string,
  config: RegularSeasonConfig,
  participantIds: string[],
  double: boolean,
): GeneratedSchedule {
  const pairRounds = circleRoundRobinPairs(participantIds);
  const homeCounts = new Map<string, number>();
  const matches: ScheduledMatchSpec[] = [];
  let order = 0;

  const cycles = double ? 2 : 1;
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    for (let r = 0; r < pairRounds.length; r += 1) {
      const roundNumber = cycle * pairRounds.length + r + 1;
      const pairs = pairRounds[r]!;
      let slot = 0;
      for (const pair of pairs) {
        slot += 1;
        let home: string;
        let away: string;
        if (double && cycle === 1) {
          // reverse home/away from first cycle's assignment preference
          const first = assignHomeAway(
            [pair[0]!, pair[1]!] as [string, string],
            new Map(), // use seed-only for first-cycle preference
            seed,
            r + 1,
            slot,
          );
          home = first.away;
          away = first.home;
        } else {
          const assigned = assignHomeAway(
            [pair[0]!, pair[1]!] as [string, string],
            homeCounts,
            seed,
            roundNumber,
            slot,
          );
          home = assigned.home;
          away = assigned.away;
        }
        homeCounts.set(home, (homeCounts.get(home) ?? 0) + 1);
        order += 1;
        matches.push({
          scheduleKey: `R${roundNumber}-S${slot}-${home}-${away}`,
          homeParticipantId: home,
          awayParticipantId: away,
          roundNumber,
          slotNumber: slot,
          scheduleOrder: order,
        });
      }
    }
  }

  return finalize(seed, config, participantIds, matches);
}

/**
 * BALANCED_CUSTOM: each team plays `gamesPerTeam` games via deterministic
 * opponent rotation (circular neighbors). Requires even gamesPerTeam when n is odd
 * for perfect feasibility; otherwise allow ±1 imbalance only if total matches close.
 */
function generateBalancedCustom(
  seed: string,
  config: RegularSeasonConfig,
  participantIds: string[],
): GeneratedSchedule {
  const n = participantIds.length;
  const gpt = config.gamesPerTeam!;
  if (gpt >= n) {
    throw new RegularSeasonError(
      'InvalidScheduleConfiguration',
      `gamesPerTeam (${gpt}) must be < participant count (${n}) for single-opponent uniqueness; use DOUBLE_ROUND_ROBIN for rematches`,
    );
  }
  if ((n * gpt) % 2 !== 0) {
    throw new RegularSeasonError(
      'InvalidScheduleConfiguration',
      `gamesPerTeam ${gpt} with ${n} teams yields odd total game-slots; choose an even product n*gamesPerTeam`,
    );
  }

  // Build undirected edges: each team plays next gpt/2? Actually each needs gpt opponents.
  // Use: for offset 1..floor(gpt) take pairs (i, i+offset) once.
  const needed = gpt; // opponents per team in single-meeting graph
  if (needed > n - 1) {
    throw new RegularSeasonError(
      'InvalidScheduleConfiguration',
      `gamesPerTeam cannot exceed ${n - 1} without rematches`,
    );
  }

  const edgeSet = new Set<string>();
  const edges: Array<[string, string]> = [];
  for (let i = 0; i < n; i += 1) {
    for (let d = 1; d <= needed; d += 1) {
      const j = (i + d) % n;
      if (i === j) continue;
      const a = participantIds[i]!;
      const b = participantIds[j]!;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (!edgeSet.has(key)) {
        // Only add if both still need games — check degree later
        edgeSet.add(key);
        edges.push(a < b ? [a, b] : [b, a]);
      }
    }
  }

  // Trim edges so each degree == gpt (greedy keep by stable order)
  const degree = new Map<string, number>();
  for (const id of participantIds) degree.set(id, 0);
  const kept: Array<[string, string]> = [];
  for (const [a, b] of edges.sort((x, y) => {
    const kx = `${x[0]}|${x[1]}`;
    const ky = `${y[0]}|${y[1]}`;
    return kx < ky ? -1 : kx > ky ? 1 : 0;
  })) {
    const da = degree.get(a) ?? 0;
    const db = degree.get(b) ?? 0;
    if (da < gpt && db < gpt) {
      kept.push([a, b]);
      degree.set(a, da + 1);
      degree.set(b, db + 1);
    }
  }
  for (const id of participantIds) {
    if ((degree.get(id) ?? 0) !== gpt) {
      throw new RegularSeasonError(
        'ScheduleGenerationFailed',
        `Could not build balanced custom schedule: ${id} has ${degree.get(id)} games (want ${gpt})`,
      );
    }
  }

  // Pack edges into rounds (greedy coloring / matching)
  const remaining = [...kept];
  const homeCounts = new Map<string, number>();
  const matches: ScheduledMatchSpec[] = [];
  let order = 0;
  let roundNumber = 0;
  while (remaining.length > 0) {
    roundNumber += 1;
    const used = new Set<string>();
    const roundEdges: Array<[string, string]> = [];
    const nextRemaining: Array<[string, string]> = [];
    for (const edge of remaining) {
      if (!used.has(edge[0]) && !used.has(edge[1])) {
        roundEdges.push(edge);
        used.add(edge[0]);
        used.add(edge[1]);
      } else {
        nextRemaining.push(edge);
      }
    }
    remaining.splice(0, remaining.length, ...nextRemaining);
    let slot = 0;
    for (const [a, b] of roundEdges) {
      slot += 1;
      const { home, away } = assignHomeAway([a, b], homeCounts, seed, roundNumber, slot);
      homeCounts.set(home, (homeCounts.get(home) ?? 0) + 1);
      order += 1;
      matches.push({
        scheduleKey: `R${roundNumber}-S${slot}-${home}-${away}`,
        homeParticipantId: home,
        awayParticipantId: away,
        roundNumber,
        slotNumber: slot,
        scheduleOrder: order,
      });
    }
    if (roundNumber > n * gpt + 5) {
      throw new RegularSeasonError('ScheduleGenerationFailed', 'Round packing failed to terminate');
    }
  }

  return finalize(seed, config, participantIds, matches);
}

export function generateRegularSeasonSchedule(input: {
  participantIds: string[];
  config: RegularSeasonConfig;
  seed: string;
}): GeneratedSchedule {
  if (!input.seed || !input.seed.trim()) {
    throw new RegularSeasonError('InvalidScheduleConfiguration', 'schedule seed is required');
  }
  const participantIds = normalizeParticipantIds(input.participantIds);
  if (input.config.qualifiersCount > participantIds.length) {
    throw new RegularSeasonError(
      'InvalidScheduleConfiguration',
      'qualifiersCount cannot exceed participant count',
    );
  }

  switch (input.config.scheduleFormat) {
    case 'ROUND_ROBIN':
      return generateRoundRobin(input.seed.trim(), input.config, participantIds, false);
    case 'DOUBLE_ROUND_ROBIN':
      return generateRoundRobin(input.seed.trim(), input.config, participantIds, true);
    case 'BALANCED_CUSTOM':
      return generateBalancedCustom(input.seed.trim(), input.config, participantIds);
    default: {
      const _e: never = input.config.scheduleFormat;
      throw new RegularSeasonError('InvalidScheduleConfiguration', `Unknown format ${_e}`);
    }
  }
}

/** Derive per-match simulation seed. */
export function deriveMatchSimulationSeed(
  baseSeed: string,
  scheduleHash: string,
  scheduleOrder: number,
): string {
  return `${baseSeed}:${scheduleHash}:match:${scheduleOrder}`;
}
