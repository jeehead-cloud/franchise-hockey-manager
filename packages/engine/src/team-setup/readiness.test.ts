import { describe, expect, it } from 'vitest';
import {
  evaluateTeamReadiness,
  TEAM_READINESS_THRESHOLDS,
  type TeamReadinessRosterMember,
} from './index.js';

function member(
  position: TeamReadinessRosterMember['position'],
  rosterStatus: TeamReadinessRosterMember['rosterStatus'] = 'ACTIVE',
  modelComplete = true,
): TeamReadinessRosterMember {
  return { position, rosterStatus, modelComplete };
}

function buildReadyRoster(): TeamReadinessRosterMember[] {
  const roster: TeamReadinessRosterMember[] = [];
  for (let i = 0; i < 4; i += 1) roster.push(member('C'));
  for (let i = 0; i < 4; i += 1) roster.push(member('LW'));
  for (let i = 0; i < 4; i += 1) roster.push(member('RW'));
  for (let i = 0; i < 3; i += 1) roster.push(member('LD'));
  for (let i = 0; i < 3; i += 1) roster.push(member('RD'));
  roster.push(member('G'));
  roster.push(member('G'));
  return roster;
}

describe('team readiness', () => {
  it('marks a fully configured depth roster READY when lineup is valid', () => {
    const result = evaluateTeamReadiness({
      hasHeadCoach: true,
      hasTacticalStyle: true,
      roster: buildReadyRoster(),
      lineup: { presence: 'VALID' },
    });
    expect(result.status).toBe('READY');
    expect(result.counts.availableForwards).toBe(TEAM_READINESS_THRESHOLDS.availableForwards);
    expect(result.counts.availableDefensemen).toBe(TEAM_READINESS_THRESHOLDS.availableDefensemen);
    expect(result.counts.availableGoalies).toBe(TEAM_READINESS_THRESHOLDS.availableGoalies);
  });

  it('warns when structural depth is ready but main lineup is absent', () => {
    const result = evaluateTeamReadiness({
      hasHeadCoach: true,
      hasTacticalStyle: true,
      roster: buildReadyRoster(),
    });
    expect(result.status).toBe('WARNING');
    expect(result.checks.find((c) => c.code === 'MAIN_LINEUP')?.result).toBe('WARN');
  });

  it('fails without a head coach', () => {
    const result = evaluateTeamReadiness({
      hasHeadCoach: false,
      hasTacticalStyle: true,
      roster: buildReadyRoster(),
    });
    expect(result.status).toBe('NOT_READY');
    expect(result.checks.find((c) => c.code === 'HEAD_COACH')?.result).toBe('FAIL');
  });

  it('fails without tactical style', () => {
    const result = evaluateTeamReadiness({
      hasHeadCoach: true,
      hasTacticalStyle: false,
      roster: buildReadyRoster(),
    });
    expect(result.status).toBe('NOT_READY');
    expect(result.checks.find((c) => c.code === 'TACTICAL_STYLE')?.result).toBe('FAIL');
  });

  it('fails with insufficient forwards', () => {
    const roster = buildReadyRoster().filter((m) => m.position === 'G' || m.position === 'LD' || m.position === 'RD');
    for (let i = 0; i < 5; i += 1) roster.push(member('C'));
    const result = evaluateTeamReadiness({
      hasHeadCoach: true,
      hasTacticalStyle: true,
      roster,
    });
    expect(result.status).toBe('NOT_READY');
    expect(result.checks.find((c) => c.code === 'AVAILABLE_FORWARDS')?.result).toBe('FAIL');
  });

  it('fails with insufficient defensemen', () => {
    const roster = buildReadyRoster().filter((m) => m.position !== 'LD' && m.position !== 'RD');
    roster.push(member('LD'));
    const result = evaluateTeamReadiness({
      hasHeadCoach: true,
      hasTacticalStyle: true,
      roster,
    });
    expect(result.checks.find((c) => c.code === 'AVAILABLE_DEFENSEMEN')?.result).toBe('FAIL');
  });

  it('fails with insufficient goalies', () => {
    const roster = buildReadyRoster().filter((m) => m.position !== 'G');
    roster.push(member('G'));
    const result = evaluateTeamReadiness({
      hasHeadCoach: true,
      hasTacticalStyle: true,
      roster,
    });
    expect(result.checks.find((c) => c.code === 'AVAILABLE_GOALIES')?.result).toBe('FAIL');
  });

  it('excludes UNAVAILABLE from available depth', () => {
    const roster = buildReadyRoster();
    roster.push(member('C', 'UNAVAILABLE'));
    const result = evaluateTeamReadiness({
      hasHeadCoach: true,
      hasTacticalStyle: true,
      roster,
    });
    expect(result.counts.availableForwards).toBe(12);
    expect(result.counts.unavailableCount).toBe(1);
  });

  it('excludes PROSPECT from available depth', () => {
    const roster = buildReadyRoster();
    roster.push(member('LW', 'PROSPECT'));
    const result = evaluateTeamReadiness({
      hasHeadCoach: true,
      hasTacticalStyle: true,
      roster,
    });
    expect(result.counts.availableForwards).toBe(12);
    expect(result.counts.prospectCount).toBe(1);
  });

  it('warns on incomplete available models without failing depth', () => {
    const roster = buildReadyRoster();
    roster[0] = { ...roster[0]!, modelComplete: false };
    const result = evaluateTeamReadiness({
      hasHeadCoach: true,
      hasTacticalStyle: true,
      roster,
    });
    expect(result.status).toBe('WARNING');
    expect(result.checks.find((c) => c.code === 'COMPLETE_MODELS')?.result).toBe('WARN');
  });

  it('is order-independent', () => {
    const a = buildReadyRoster();
    const b = [...a].reverse();
    expect(
      evaluateTeamReadiness({ hasHeadCoach: true, hasTacticalStyle: true, roster: a }),
    ).toEqual(
      evaluateTeamReadiness({ hasHeadCoach: true, hasTacticalStyle: true, roster: b }),
    );
  });

  it('ignores player ratings — only structural fields matter', () => {
    const result = evaluateTeamReadiness({
      hasHeadCoach: true,
      hasTacticalStyle: true,
      roster: buildReadyRoster(),
    });
    expect(JSON.stringify(result)).not.toMatch(/currentAbility|rating/i);
  });
});
