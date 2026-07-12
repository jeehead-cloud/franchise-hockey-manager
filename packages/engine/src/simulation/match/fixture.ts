import { getStandardBalanceConfig } from '../../balance/index.js';
import { FHM_ENGINE_VERSION, F11_SIMULATION_MODE, REGULATION_PERIODS, PERIOD_DURATION_SECONDS } from './constants.js';
import type { SimulationInput, SimulationPlayerProfile, SimulationTeamInput } from './types.js';

function skater(
  id: string,
  slot: string,
  pos: SimulationPlayerProfile['primaryPosition'],
  ca = 70,
): SimulationPlayerProfile {
  return {
    playerId: id,
    firstName: 'Test',
    lastName: id,
    primaryPosition: pos,
    lineupSlot: slot,
    currentAbility: ca,
    offensiveRating: ca - 2,
    defensiveRating: ca - 4,
    role: 'TWO_WAY',
    roleRating: 65,
    effectivePerformance: ca,
  };
}

function goalie(id: string, slot: string, ca = 72): SimulationPlayerProfile {
  return {
    playerId: id,
    firstName: 'Test',
    lastName: id,
    primaryPosition: 'G',
    lineupSlot: slot,
    currentAbility: ca,
    offensiveRating: null,
    defensiveRating: null,
    role: 'STARTER',
    roleRating: 70,
    effectivePerformance: ca,
  };
}

function buildTeam(side: 'HOME' | 'AWAY', prefix: string): SimulationTeamInput {
  const lineupAssignments = [
    { slot: 'F1_LW', playerId: `${prefix}-f1lw` },
    { slot: 'F1_C', playerId: `${prefix}-f1c` },
    { slot: 'F1_RW', playerId: `${prefix}-f1rw` },
    { slot: 'F2_LW', playerId: `${prefix}-f2lw` },
    { slot: 'F2_C', playerId: `${prefix}-f2c` },
    { slot: 'F2_RW', playerId: `${prefix}-f2rw` },
    { slot: 'F3_LW', playerId: `${prefix}-f3lw` },
    { slot: 'F3_C', playerId: `${prefix}-f3c` },
    { slot: 'F3_RW', playerId: `${prefix}-f3rw` },
    { slot: 'F4_LW', playerId: `${prefix}-f4lw` },
    { slot: 'F4_C', playerId: `${prefix}-f4c` },
    { slot: 'F4_RW', playerId: `${prefix}-f4rw` },
    { slot: 'D1_LD', playerId: `${prefix}-d1ld` },
    { slot: 'D1_RD', playerId: `${prefix}-d1rd` },
    { slot: 'D2_LD', playerId: `${prefix}-d2ld` },
    { slot: 'D2_RD', playerId: `${prefix}-d2rd` },
    { slot: 'D3_LD', playerId: `${prefix}-d3ld` },
    { slot: 'D3_RD', playerId: `${prefix}-d3rd` },
    { slot: 'G_STARTER', playerId: `${prefix}-g1` },
    { slot: 'G_BACKUP', playerId: `${prefix}-g2` },
  ];
  const players = [
    skater(`${prefix}-f1lw`, 'F1_LW', 'LW', side === 'HOME' ? 72 : 68),
    skater(`${prefix}-f1c`, 'F1_C', 'C', side === 'HOME' ? 74 : 67),
    skater(`${prefix}-f1rw`, 'F1_RW', 'RW'),
    skater(`${prefix}-f2lw`, 'F2_LW', 'LW'),
    skater(`${prefix}-f2c`, 'F2_C', 'C'),
    skater(`${prefix}-f2rw`, 'F2_RW', 'RW'),
    skater(`${prefix}-f3lw`, 'F3_LW', 'LW'),
    skater(`${prefix}-f3c`, 'F3_C', 'C'),
    skater(`${prefix}-f3rw`, 'F3_RW', 'RW'),
    skater(`${prefix}-f4lw`, 'F4_LW', 'LW'),
    skater(`${prefix}-f4c`, 'F4_C', 'C'),
    skater(`${prefix}-f4rw`, 'F4_RW', 'RW'),
    skater(`${prefix}-d1ld`, 'D1_LD', 'LD'),
    skater(`${prefix}-d1rd`, 'D1_RD', 'RD'),
    skater(`${prefix}-d2ld`, 'D2_LD', 'LD'),
    skater(`${prefix}-d2rd`, 'D2_RD', 'RD'),
    skater(`${prefix}-d3ld`, 'D3_LD', 'LD'),
    skater(`${prefix}-d3rd`, 'D3_RD', 'RD'),
    goalie(`${prefix}-g1`, 'G_STARTER'),
    goalie(`${prefix}-g2`, 'G_BACKUP', 68),
  ];
  const unit = (key: string, ids: string[], ep: number) => ({ unitKey: key, playerIds: ids, effectivePerformance: ep });
  return {
    teamId: `${prefix}-team`,
    teamName: `${prefix} Team`,
    side,
    coach: {
      coachingStyle: 'BALANCED',
      tacticalStyle: 'BALANCED',
      overallCoaching: 70,
      offense: 70,
      defense: 70,
    },
    tacticalStyle: 'BALANCED',
    lineupAssignments,
    players,
    forwardLines: [
      unit('F1', [`${prefix}-f1lw`, `${prefix}-f1c`, `${prefix}-f1rw`], side === 'HOME' ? 73 : 69),
      unit('F2', [`${prefix}-f2lw`, `${prefix}-f2c`, `${prefix}-f2rw`], 68),
      unit('F3', [`${prefix}-f3lw`, `${prefix}-f3c`, `${prefix}-f3rw`], 66),
      unit('F4', [`${prefix}-f4lw`, `${prefix}-f4c`, `${prefix}-f4rw`], 64),
    ],
    defensePairs: [
      unit('D1', [`${prefix}-d1ld`, `${prefix}-d1rd`], 70),
      unit('D2', [`${prefix}-d2ld`, `${prefix}-d2rd`], 68),
      unit('D3', [`${prefix}-d3ld`, `${prefix}-d3rd`], 66),
    ],
    starterGoalie: unit('G_STARTER', [`${prefix}-g1`], 72),
  };
}

export function buildTestSimulationInput(seed: string | number = 'f11-test-001'): SimulationInput {
  const balanceConfig = getStandardBalanceConfig();
  return {
    matchId: 'test-match-001',
    engineVersion: FHM_ENGINE_VERSION,
    simulationMode: F11_SIMULATION_MODE,
    seed,
    inputFingerprint: 'test-fingerprint',
    balance: {
      presetId: 'preset-standard',
      presetName: 'Standard',
      versionId: 'version-1',
      versionNumber: 1,
      schemaVersion: balanceConfig.schemaVersion,
      configHash: 'abc123',
      snapshot: balanceConfig,
    },
    homeTeam: buildTeam('HOME', 'home'),
    awayTeam: buildTeam('AWAY', 'away'),
    rules: {
      regulationPeriods: REGULATION_PERIODS,
      periodDurationSeconds: PERIOD_DURATION_SECONDS,
    },
  };
}
