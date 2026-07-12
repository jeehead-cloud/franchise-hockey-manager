import { describe, expect, it } from 'vitest';
import {
  LINEUP_REQUIRED_SLOT_COUNT,
  LINEUP_SLOTS,
  SLOT_REQUIRED_POSITION,
  compareCandidates,
  generateAutoLineup,
  isEligibleForLineup,
  positionFit,
  validateLineup,
  validateSecondaryPositions,
  evaluateTeamReadiness,
  type LineupCandidate,
  type LineupSlot,
} from '../index.js';

function candidate(partial: Partial<LineupCandidate> & Pick<LineupCandidate, 'id' | 'primaryPosition'>): LineupCandidate {
  return {
    secondaryPositions: [],
    rosterStatus: 'ACTIVE',
    modelStatus: 'COMPLETE',
    currentAbility: 70,
    role: 'PLAYMAKER',
    roleRating: 10,
    ...partial,
  };
}

function buildFullRoster(): LineupCandidate[] {
  const rows: LineupCandidate[] = [];
  const make = (
    prefix: string,
    primary: LineupCandidate['primaryPosition'],
    count: number,
    abilityBase: number,
    secondary: LineupCandidate['secondaryPositions'] = [],
  ) => {
    for (let i = 0; i < count; i += 1) {
      rows.push(
        candidate({
          id: `${prefix}-${i}`,
          primaryPosition: primary,
          secondaryPositions: secondary,
          currentAbility: abilityBase - i,
          roleRating: 20 - i,
        }),
      );
    }
  };
  make('c', 'C', 4, 90);
  make('lw', 'LW', 4, 85);
  make('rw', 'RW', 4, 80);
  make('ld', 'LD', 3, 75);
  make('rd', 'RD', 3, 70);
  make('g', 'G', 2, 88);
  return rows;
}

describe('lineup slots', () => {
  it('defines exactly 20 unique required slots', () => {
    expect(LINEUP_SLOTS).toHaveLength(LINEUP_REQUIRED_SLOT_COUNT);
    expect(new Set(LINEUP_SLOTS).size).toBe(20);
  });

  it('maps slots to exact required positions', () => {
    expect(SLOT_REQUIRED_POSITION.F1_LW).toBe('LW');
    expect(SLOT_REQUIRED_POSITION.D2_RD).toBe('RD');
    expect(SLOT_REQUIRED_POSITION.G_STARTER).toBe('G');
  });
});

describe('eligibility and secondary positions', () => {
  it('ACTIVE eligible; RESERVE eligible; PROSPECT/UNAVAILABLE/incomplete not', () => {
    expect(isEligibleForLineup(candidate({ id: 'a', primaryPosition: 'C', rosterStatus: 'ACTIVE' }))).toBe(true);
    expect(isEligibleForLineup(candidate({ id: 'b', primaryPosition: 'C', rosterStatus: 'RESERVE' }))).toBe(true);
    expect(isEligibleForLineup(candidate({ id: 'c', primaryPosition: 'C', rosterStatus: 'PROSPECT' }))).toBe(false);
    expect(isEligibleForLineup(candidate({ id: 'd', primaryPosition: 'C', rosterStatus: 'UNAVAILABLE' }))).toBe(false);
    expect(isEligibleForLineup(candidate({ id: 'e', primaryPosition: 'C', modelStatus: 'INCOMPLETE' }))).toBe(false);
  });

  it('primary and secondary fit; wrong position rejected; goalie separation', () => {
    const lw = candidate({ id: 'lw', primaryPosition: 'LW', secondaryPositions: ['C'] });
    expect(positionFit(lw, 'F1_LW')).toBe('PRIMARY');
    expect(positionFit(lw, 'F1_C')).toBe('SECONDARY');
    expect(positionFit(lw, 'F1_RW')).toBe('NONE');
    const g = candidate({ id: 'g', primaryPosition: 'G' });
    expect(positionFit(g, 'G_STARTER')).toBe('PRIMARY');
    expect(positionFit(g, 'F1_C')).toBe('NONE');
    expect(positionFit(lw, 'G_BACKUP')).toBe('NONE');
  });

  it('rejects invalid secondary combinations', () => {
    expect(validateSecondaryPositions('C', ['C']).some((e) => e.code === 'SECONDARY_DUPLICATES_PRIMARY')).toBe(true);
    expect(validateSecondaryPositions('C', ['LW', 'LW']).some((e) => e.code === 'DUPLICATE_SECONDARY')).toBe(true);
    expect(validateSecondaryPositions('G', ['LW']).some((e) => e.code === 'GOALIE_SECONDARY')).toBe(true);
    expect(validateSecondaryPositions('C', ['LW', 'RW'])).toHaveLength(0);
  });
});

describe('validateLineup', () => {
  it('accepts a valid complete lineup', () => {
    const roster = buildFullRoster();
    const auto = generateAutoLineup({ candidates: roster, mode: 'REPLACE' });
    const byId = new Map(roster.map((c) => [c.id, c]));
    const result = validateLineup({ assignments: auto.assignments, candidatesById: byId });
    expect(result.status).toBe('VALID');
    expect(result.filledSlots).toBe(20);
  });

  it('partial lineup is INCOMPLETE without blocking errors', () => {
    const c = candidate({ id: 'c1', primaryPosition: 'C' });
    const byId = new Map([[c.id, c]]);
    const result = validateLineup({
      assignments: [{ slot: 'F1_C', playerId: c.id }],
      candidatesById: byId,
    });
    expect(result.status).toBe('INCOMPLETE');
    expect(result.errors).toHaveLength(0);
  });

  it('rejects duplicate player, duplicate slot, unknown player, mismatch, prospect', () => {
    const a = candidate({ id: 'a', primaryPosition: 'C' });
    const b = candidate({ id: 'b', primaryPosition: 'LW' });
    const prospect = candidate({ id: 'p', primaryPosition: 'RW', rosterStatus: 'PROSPECT' });
    const byId = new Map([
      [a.id, a],
      [b.id, b],
      [prospect.id, prospect],
    ]);

    expect(
      validateLineup({
        assignments: [
          { slot: 'F1_C', playerId: a.id },
          { slot: 'F2_C', playerId: a.id },
        ],
        candidatesById: byId,
      }).errors.some((e) => e.code === 'DUPLICATE_PLAYER'),
    ).toBe(true);

    expect(
      validateLineup({
        assignments: [
          { slot: 'F1_C', playerId: a.id },
          { slot: 'F1_C', playerId: b.id },
        ],
        candidatesById: byId,
      }).errors.some((e) => e.code === 'DUPLICATE_SLOT'),
    ).toBe(true);

    expect(
      validateLineup({
        assignments: [{ slot: 'F1_C', playerId: 'missing' }],
        candidatesById: byId,
      }).errors.some((e) => e.code === 'UNKNOWN_PLAYER'),
    ).toBe(true);

    expect(
      validateLineup({
        assignments: [{ slot: 'F1_RW', playerId: a.id }],
        candidatesById: byId,
      }).errors.some((e) => e.code === 'POSITION_MISMATCH'),
    ).toBe(true);

    expect(
      validateLineup({
        assignments: [{ slot: 'F1_RW', playerId: prospect.id }],
        candidatesById: byId,
      }).errors.some((e) => e.code === 'PROSPECT_ASSIGNED'),
    ).toBe(true);
  });

  it('is deterministic regardless of assignment input order', () => {
    const roster = buildFullRoster();
    const auto = generateAutoLineup({ candidates: roster, mode: 'REPLACE' });
    const byId = new Map(roster.map((c) => [c.id, c]));
    const forward = validateLineup({ assignments: auto.assignments, candidatesById: byId });
    const reverse = validateLineup({
      assignments: [...auto.assignments].reverse(),
      candidatesById: byId,
    });
    expect(forward).toEqual(reverse);
  });
});

describe('generateAutoLineup', () => {
  it('fills all 20 slots on a complete roster and is deterministic', () => {
    const roster = buildFullRoster();
    const a = generateAutoLineup({ candidates: roster, mode: 'REPLACE' });
    const b = generateAutoLineup({ candidates: roster, mode: 'REPLACE' });
    expect(a.assignments).toHaveLength(20);
    expect(a.unfilledSlots).toHaveLength(0);
    expect(a.assignments).toEqual(b.assignments);
    expect(a.explanation).toEqual(b.explanation);
  });

  it('orders goalies by ability for starter/backup', () => {
    const roster = buildFullRoster();
    const result = generateAutoLineup({ candidates: roster, mode: 'REPLACE' });
    const starter = result.assignments.find((x) => x.slot === 'G_STARTER')!;
    const backup = result.assignments.find((x) => x.slot === 'G_BACKUP')!;
    const byId = new Map(roster.map((c) => [c.id, c]));
    expect(byId.get(starter.playerId)!.currentAbility).toBeGreaterThanOrEqual(
      byId.get(backup.playerId)!.currentAbility!,
    );
  });

  it('prefers primary fit over secondary when filling centers', () => {
    const primary = candidate({ id: 'pc', primaryPosition: 'C', currentAbility: 60 });
    const secondary = candidate({
      id: 'sc',
      primaryPosition: 'LW',
      secondaryPositions: ['C'],
      currentAbility: 99,
    });
    const filler = buildFullRoster().filter((c) => c.primaryPosition !== 'C').slice(0, 16);
    const result = generateAutoLineup({
      candidates: [primary, secondary, ...filler],
      mode: 'REPLACE',
    });
    const cSlots = result.assignments.filter((a) => a.slot.endsWith('_C'));
    expect(cSlots.some((a) => a.playerId === 'pc')).toBe(true);
  });

  it('returns partial lineup with warnings when depth is insufficient', () => {
    const thin = [
      candidate({ id: 'c1', primaryPosition: 'C', currentAbility: 80 }),
      candidate({ id: 'g1', primaryPosition: 'G', currentAbility: 70 }),
    ];
    const result = generateAutoLineup({ candidates: thin, mode: 'REPLACE' });
    expect(result.assignments.length).toBeLessThan(20);
    expect(result.unfilledSlots.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.code === 'UNFILLED_SLOT')).toBe(true);
  });

  it('FILL_EMPTY preserves existing assignments; REPLACE recalculates', () => {
    const roster = buildFullRoster();
    const weakC = candidate({ id: 'manual-c', primaryPosition: 'C', currentAbility: 1, roleRating: 1 });
    const withManual = [...roster, weakC];
    const existing = [{ slot: 'F1_C' as LineupSlot, playerId: 'manual-c' }];
    const fill = generateAutoLineup({
      candidates: withManual,
      mode: 'FILL_EMPTY',
      existingAssignments: existing,
    });
    expect(fill.assignments.find((a) => a.slot === 'F1_C')?.playerId).toBe('manual-c');

    const replace = generateAutoLineup({
      candidates: withManual,
      mode: 'REPLACE',
      existingAssignments: existing,
    });
    expect(replace.assignments.find((a) => a.slot === 'F1_C')?.playerId).not.toBe('manual-c');
  });

  it('compareCandidates uses ability then roleRating then id', () => {
    const a = candidate({ id: 'a', primaryPosition: 'C', currentAbility: 50, roleRating: 10 });
    const b = candidate({ id: 'b', primaryPosition: 'C', currentAbility: 50, roleRating: 12 });
    const c = candidate({ id: 'c', primaryPosition: 'C', currentAbility: 50, roleRating: 12 });
    expect(compareCandidates(b, a)).toBeLessThan(0);
    expect(compareCandidates(b, c)).toBeLessThan(0);
  });
});

describe('readiness lineup integration', () => {
  const deepRoster = Array.from({ length: 20 }, (_, i) => {
    const positions = ['C', 'C', 'C', 'C', 'LW', 'LW', 'LW', 'LW', 'RW', 'RW', 'RW', 'RW', 'LD', 'LD', 'LD', 'RD', 'RD', 'RD', 'G', 'G'] as const;
    return {
      position: positions[i]!,
      rosterStatus: 'ACTIVE' as const,
      modelComplete: true,
    };
  });

  it('valid full lineup can contribute READY', () => {
    const result = evaluateTeamReadiness({
      hasHeadCoach: true,
      hasTacticalStyle: true,
      roster: deepRoster,
      lineup: { presence: 'VALID' },
    });
    expect(result.status).toBe('READY');
  });

  it('missing lineup produces WARNING when structure passes', () => {
    const result = evaluateTeamReadiness({
      hasHeadCoach: true,
      hasTacticalStyle: true,
      roster: deepRoster,
      lineup: { presence: 'ABSENT' },
    });
    expect(result.status).toBe('WARNING');
    expect(result.checks.some((c) => c.code === 'MAIN_LINEUP' && c.result === 'WARN')).toBe(true);
  });

  it('invalid lineup produces NOT_READY', () => {
    const result = evaluateTeamReadiness({
      hasHeadCoach: true,
      hasTacticalStyle: true,
      roster: deepRoster,
      lineup: { presence: 'INVALID' },
    });
    expect(result.status).toBe('NOT_READY');
  });
});
