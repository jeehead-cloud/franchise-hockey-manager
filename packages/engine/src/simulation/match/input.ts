import { isF12CompatibleBalanceConfig, type MatchBalanceSection } from '../../balance/index.js';
import { GOALIE_ATTRIBUTE_KEYS, SKATER_ATTRIBUTE_KEYS } from '../../players/types.js';
import { FHM_ENGINE_VERSION, F12_SIMULATION_MODE, REGULATION_PERIODS, PERIOD_DURATION_SECONDS } from './constants.js';
import { IncompatibleBalanceConfigError, InvalidSimulationInputError } from './errors.js';
import type { SimulationInput, SimulationPlayerProfile, SimulationTeamInput } from './types.js';

function assertFinite(n: number, label: string) {
  if (!Number.isFinite(n)) throw new InvalidSimulationInputError(`${label} must be finite`);
}

function validatePlayerAttributes(p: SimulationPlayerProfile, label: string) {
  if (p.primaryPosition === 'G') {
    if (!p.goalieAttributes) {
      throw new InvalidSimulationInputError(`${label} player ${p.playerId} missing goalieAttributes`);
    }
    for (const key of GOALIE_ATTRIBUTE_KEYS) {
      assertFinite(p.goalieAttributes[key], `${label} player ${p.playerId} goalie.${key}`);
    }
    return;
  }
  if (!p.skaterAttributes) {
    throw new InvalidSimulationInputError(`${label} player ${p.playerId} missing skaterAttributes`);
  }
  for (const key of SKATER_ATTRIBUTE_KEYS) {
    assertFinite(p.skaterAttributes[key], `${label} player ${p.playerId} skater.${key}`);
  }
}

function validateTeam(team: SimulationTeamInput, label: string) {
  if (!team.teamId) throw new InvalidSimulationInputError(`${label} teamId required`);
  if (!team.coach) throw new InvalidSimulationInputError(`${label} coach required`);
  if (!team.tacticalStyle) throw new InvalidSimulationInputError(`${label} tacticalStyle required`);
  if (team.lineupAssignments.length !== 20) {
    throw new InvalidSimulationInputError(`${label} lineup must have 20 assignments`);
  }
  if (team.players.length < 18) {
    throw new InvalidSimulationInputError(`${label} requires complete player roster`);
  }
  if (team.forwardLines.length !== 4 || team.defensePairs.length !== 3) {
    throw new InvalidSimulationInputError(`${label} requires 4 forward lines and 3 defense pairs`);
  }
  if (!team.starterGoalie?.playerIds?.length) {
    throw new InvalidSimulationInputError(`${label} starter goalie required`);
  }
  for (const p of team.players) {
    assertFinite(p.currentAbility, `${label} player ${p.playerId} currentAbility`);
    assertFinite(p.roleRating, `${label} player ${p.playerId} roleRating`);
    validatePlayerAttributes(p, label);
  }
  for (const unit of [...team.forwardLines, ...team.defensePairs, team.starterGoalie]) {
    assertFinite(unit.effectivePerformance, `${label} unit ${unit.unitKey} effectivePerformance`);
  }
  const slots = new Set(team.lineupAssignments.map((a) => a.slot));
  if (slots.size !== 20) throw new InvalidSimulationInputError(`${label} duplicate lineup slots`);
  const ids = new Set(team.players.map((p) => p.playerId));
  if (ids.size !== team.players.length) {
    throw new InvalidSimulationInputError(`${label} duplicate player IDs`);
  }
  const starter = team.lineupAssignments.find((a) => a.slot === 'G_STARTER');
  if (!starter) throw new InvalidSimulationInputError(`${label} missing G_STARTER`);
  const center = team.lineupAssignments.find((a) => a.slot.startsWith('F1_C') || a.slot === 'F1_C');
  if (!center) throw new InvalidSimulationInputError(`${label} missing center in lineup`);
}

export function getMatchConfig(input: SimulationInput): MatchBalanceSection {
  if (!isF12CompatibleBalanceConfig(input.balance.snapshot)) {
    throw new IncompatibleBalanceConfigError(
      `Active balance schemaVersion ${input.balance.snapshot.schemaVersion} is not F12-compatible (requires schemaVersion >= 3 with active match/shots/goalies)`,
    );
  }
  return input.balance.snapshot.match;
}

/** Validate simulation input without mutating it. */
export function validateSimulationInput(input: SimulationInput): void {
  if (input.engineVersion !== FHM_ENGINE_VERSION) {
    throw new InvalidSimulationInputError(`Unsupported engineVersion ${input.engineVersion}`);
  }
  if (input.simulationMode !== F12_SIMULATION_MODE) {
    throw new InvalidSimulationInputError(`Unsupported simulationMode ${input.simulationMode}`);
  }
  if (!input.inputFingerprint) throw new InvalidSimulationInputError('inputFingerprint required');
  if (input.homeTeam.teamId === input.awayTeam.teamId) {
    throw new InvalidSimulationInputError('Home and away teams must differ');
  }
  if (input.homeTeam.side !== 'HOME' || input.awayTeam.side !== 'AWAY') {
    throw new InvalidSimulationInputError('Team sides must be HOME/AWAY');
  }

  const allIds = new Set<string>();
  for (const team of [input.homeTeam, input.awayTeam]) {
    validateTeam(team, team.side);
    for (const p of team.players) {
      if (allIds.has(p.playerId)) {
        throw new InvalidSimulationInputError(`Duplicate player ${p.playerId} across teams`);
      }
      allIds.add(p.playerId);
    }
  }

  getMatchConfig(input);

  if (input.rules.regulationPeriods !== REGULATION_PERIODS) {
    throw new InvalidSimulationInputError('rules.regulationPeriods must be 3');
  }
  if (input.rules.periodDurationSeconds !== PERIOD_DURATION_SECONDS) {
    throw new InvalidSimulationInputError('rules.periodDurationSeconds must be 1200');
  }
}

/** Stable JSON for fingerprinting (server may SHA-256 this). Excludes inputFingerprint. */
export function canonicalizeSimulationInput(input: SimulationInput): string {
  const { inputFingerprint: _fp, ...rest } = input;
  return JSON.stringify(rest);
}
