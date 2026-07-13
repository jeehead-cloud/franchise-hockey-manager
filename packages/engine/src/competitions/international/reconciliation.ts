import type {
  GeneratedGroupSchedule,
  GroupStandingRow,
  InternationalTournamentTemplate,
  KnockoutMatchupSpec,
  TournamentMedalResultSpec,
  TournamentReconciliationResult,
} from './types.js';

export function reconcileInternationalTournament(input: {
  template: InternationalTournamentTemplate;
  schedule: GeneratedGroupSchedule;
  groupStandings: Record<string, GroupStandingRow[]>;
  groupMatchCountCompleted: number;
  knockoutMatchups: KnockoutMatchupSpec[];
  completedKnockoutRounds: Array<'QUARTERFINAL' | 'SEMIFINAL' | 'BRONZE' | 'FINAL'>;
  medals: TournamentMedalResultSpec[];
}): TournamentReconciliationResult {
  const issues: TournamentReconciliationResult['issues'] = [];

  const expectedGroupMatches = input.schedule.matchCount;
  if (input.groupMatchCountCompleted !== expectedGroupMatches) {
    issues.push({
      code: 'GROUP_MATCHES_INCOMPLETE',
      message: `Completed ${input.groupMatchCountCompleted}/${expectedGroupMatches} group matches`,
    });
  }

  const allParticipants = new Set<string>();
  for (const g of input.schedule.groups) {
    for (const id of g.participantIds) {
      if (allParticipants.has(id)) {
        issues.push({
          code: 'DUPLICATE_GROUP_PARTICIPANT',
          message: `Participant ${id} in multiple groups`,
        });
      }
      allParticipants.add(id);
    }
    const rows = input.groupStandings[g.groupKey] ?? [];
    if (rows.length !== g.participantIds.length) {
      issues.push({
        code: 'STANDINGS_ROW_COUNT',
        message: `Group ${g.groupKey} standings count mismatch`,
      });
    }
    const qualified = rows.filter((r) => r.qualified);
    if (qualified.length !== input.template.groupStage.qualifiersPerGroup) {
      issues.push({
        code: 'QUALIFIER_COUNT',
        message: `Group ${g.groupKey} has ${qualified.length} qualifiers`,
      });
    }
  }

  if (input.template.knockout.enabled) {
    if (!input.completedKnockoutRounds.includes('FINAL')) {
      issues.push({ code: 'FINAL_MISSING', message: 'Final not completed' });
    }
    if (input.template.knockout.bronzeGame && !input.completedKnockoutRounds.includes('BRONZE')) {
      issues.push({ code: 'BRONZE_MISSING', message: 'Bronze game not completed' });
    }

    const active = input.knockoutMatchups.filter(
      (m) => m.participant1Id && m.participant2Id,
    );
    for (const m of active) {
      if (m.participant1Id === m.participant2Id) {
        issues.push({
          code: 'DUPLICATE_KNOCKOUT_TEAM',
          message: `Same team twice in ${m.roundName}`,
        });
      }
    }
  }

  const medalTypes = new Set(input.medals.map((m) => m.medalType));
  if (input.template.medals.gold && !medalTypes.has('GOLD')) {
    issues.push({ code: 'GOLD_MISSING', message: 'Gold medal missing' });
  }
  if (input.template.medals.silver && !medalTypes.has('SILVER')) {
    issues.push({ code: 'SILVER_MISSING', message: 'Silver medal missing' });
  }
  if (input.template.medals.bronze && !medalTypes.has('BRONZE')) {
    issues.push({ code: 'BRONZE_MEDAL_MISSING', message: 'Bronze medal missing' });
  }
  const medalParticipants = input.medals.map((m) => m.participantId);
  if (new Set(medalParticipants).size !== medalParticipants.length) {
    issues.push({
      code: 'MEDAL_NOT_DISTINCT',
      message: 'Medal recipients must be distinct',
    });
  }

  return { ok: issues.length === 0, issues };
}
