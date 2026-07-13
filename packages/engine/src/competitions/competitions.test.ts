import { describe, expect, it } from 'vitest';
import {
  assertEditionTransition,
  canTransitionEditionStatus,
  evaluateEditionReadiness,
  getCompetitionRulesTemplate,
  hashCompetitionRules,
  isEditionStructurallyEditable,
  toMatchCompletionRules,
  validateCompetitionRules,
  validateStageConfig,
  validateStageDependencyGraph,
  CompetitionValidationError,
  type CompetitionRules,
  type CompetitionStageDefinition,
  type EditionStructureInput,
} from './index.js';

function baseRules(): CompetitionRules {
  return getCompetitionRulesTemplate('SIMPLE_LEAGUE');
}

function stage(
  partial: Partial<CompetitionStageDefinition> &
    Pick<CompetitionStageDefinition, 'id' | 'name' | 'stageType' | 'stageOrder'>,
): CompetitionStageDefinition {
  return {
    status: 'PLANNED',
    participantSource: 'EDITION_PARTICIPANTS',
    config: { gamesPerTeam: 4, qualifiersCount: 2 },
    ...partial,
  };
}

describe('F17 competition rules', () => {
  it('validates templates and rejects unknown fields', () => {
    for (const key of [
      'SIMPLE_LEAGUE',
      'SIMPLE_ROUND_ROBIN',
      'GROUPS_AND_KNOCKOUT',
      'BEST_OF_SERIES_PLAYOFF',
    ] as const) {
      const rules = getCompetitionRulesTemplate(key);
      expect(validateCompetitionRules(rules).schemaVersion).toBe(1);
    }
    expect(() =>
      validateCompetitionRules({ ...baseRules(), unknown: true } as unknown),
    ).toThrow(CompetitionValidationError);
  });

  it('rejects invalid match rule combinations and duplicate tiebreakers', () => {
    const rules = baseRules();
    expect(() =>
      validateCompetitionRules({
        ...rules,
        matchRules: { ...rules.matchRules, tiesAllowed: true, overtimeEnabled: true },
      }),
    ).toThrow(/tiesAllowed/);
    expect(() =>
      validateCompetitionRules({
        ...rules,
        tiebreakers: ['POINTS', 'POINTS'],
      }),
    ).toThrow(/Duplicate/);
  });

  it('hashes deterministically regardless of key order', () => {
    const a = validateCompetitionRules(baseRules());
    const shuffled = JSON.parse(
      JSON.stringify({
        matchRules: a.matchRules,
        schemaVersion: a.schemaVersion,
        series: a.series,
        format: a.format,
        qualification: a.qualification,
        tiebreakers: a.tiebreakers,
        points: a.points,
      }),
    );
    const b = validateCompetitionRules(shuffled);
    expect(hashCompetitionRules(a)).toBe(hashCompetitionRules(b));
    expect(hashCompetitionRules(a)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('maps matchRules to F14 MatchCompletionRules', () => {
    const completion = toMatchCompletionRules(baseRules().matchRules);
    expect(completion).toEqual({
      overtimeEnabled: true,
      shootoutEnabled: true,
      tiesAllowed: false,
    });
  });
});

describe('F17 stage config and dependencies', () => {
  it('validates each stage type example', () => {
    expect(validateStageConfig('REGULAR_SEASON', { gamesPerTeam: 82, qualifiersCount: 16 }));
    expect(validateStageConfig('ROUND_ROBIN', { doubleRound: true, qualifiersCount: 2 }));
    expect(
      validateStageConfig('GROUP_STAGE', {
        groupCount: 2,
        groupSize: 4,
        doubleRound: false,
        qualifiersPerGroup: 2,
      }),
    );
    expect(validateStageConfig('KNOCKOUT', { rounds: 3, singleGame: true, reseeding: false }));
    expect(
      validateStageConfig('BEST_OF_SERIES', {
        winsRequired: 4,
        reseeding: false,
        homePattern: '2-2-1-1-1',
      }),
    );
    expect(validateStageConfig('FINAL_RANKING', { rankingSize: 8 }));
    expect(() => validateStageConfig('GROUP_STAGE', { groupCount: 0, groupSize: 4, doubleRound: false, qualifiersPerGroup: 1 })).toThrow();
    expect(() =>
      validateStageConfig('BEST_OF_SERIES', { winsRequired: 0, reseeding: false, homePattern: '2-2-1' }),
    ).toThrow();
  });

  it('detects cycles and invalid dependency order', () => {
    const a = stage({
      id: 'a',
      name: 'A',
      stageType: 'REGULAR_SEASON',
      stageOrder: 1,
    });
    const b = stage({
      id: 'b',
      name: 'B',
      stageType: 'BEST_OF_SERIES',
      stageOrder: 2,
      participantSource: 'PREVIOUS_STAGE_QUALIFIERS',
      sourceStageId: 'a',
      expectedQualifierCount: 4,
      config: { winsRequired: 4, reseeding: false, homePattern: '2-2-1-1-1' },
    });
    expect(() => validateStageDependencyGraph([a, b])).not.toThrow();

    expect(() =>
      validateStageDependencyGraph([
        stage({
          id: 'x',
          name: 'X',
          stageType: 'REGULAR_SEASON',
          stageOrder: 1,
          participantSource: 'PREVIOUS_STAGE_QUALIFIERS',
          sourceStageId: 'x',
          expectedQualifierCount: 2,
        }),
      ]),
    ).toThrow(/itself|cycle|SELF/i);
  });
});

describe('F17 lifecycle and readiness', () => {
  it('enforces allowed transitions and editable states', () => {
    expect(canTransitionEditionStatus('PLANNED', 'PREPARING')).toBe(true);
    expect(canTransitionEditionStatus('ACTIVE', 'PREPARING')).toBe(false);
    expect(() => assertEditionTransition('COMPLETED', 'ACTIVE')).toThrow();
    expect(isEditionStructurallyEditable('PREPARING')).toBe(true);
    expect(isEditionStructurallyEditable('ACTIVE')).toBe(false);
  });

  it('evaluates readiness deterministically', () => {
    const input: EditionStructureInput = {
      editionId: 'e1',
      status: 'PREPARING',
      worldSeasonId: 'ws1',
      rules: baseRules(),
      participants: [
        { id: 'p1', teamId: 't1', status: 'CONFIRMED', participantOrder: 1 },
        { id: 'p2', teamId: 't2', status: 'CONFIRMED', participantOrder: 2 },
      ],
      stages: [
        stage({
          id: 's1',
          name: 'RS',
          stageType: 'REGULAR_SEASON',
          stageOrder: 1,
        }),
      ],
    };
    const ready = evaluateEditionReadiness(input);
    expect(ready.status).toBe('READY');
    expect(ready.blockers).toHaveLength(0);
    expect(ready.allowedNextStatuses).toContain('READY');

    const notReady = evaluateEditionReadiness({
      ...input,
      participants: [{ id: 'p1', teamId: 't1', status: 'CONFIRMED', participantOrder: 1 }],
      stages: [],
    });
    expect(notReady.status).toBe('NOT_READY');
    expect(notReady.blockers.length).toBeGreaterThan(0);
  });
});
