import {
  TEAM_READINESS_THRESHOLDS,
  isAvailableForReadiness,
  positionGroup,
  type TeamReadinessCheck,
  type TeamReadinessCounts,
  type TeamReadinessInput,
  type TeamReadinessResult,
  type TeamReadinessStatus,
} from './types.js';

function emptyCounts(): TeamReadinessCounts {
  return {
    availableForwards: 0,
    availableDefensemen: 0,
    availableGoalies: 0,
    availableCenters: 0,
    availableWingers: 0,
    availableLD: 0,
    availableRD: 0,
    incompleteAvailableModels: 0,
    prospectCount: 0,
    unavailableCount: 0,
    totalRoster: 0,
  };
}

export function summarizeRoster(roster: TeamReadinessInput['roster']): TeamReadinessCounts {
  const counts = emptyCounts();
  counts.totalRoster = roster.length;
  for (const member of roster) {
    if (member.rosterStatus === 'PROSPECT') counts.prospectCount += 1;
    if (member.rosterStatus === 'UNAVAILABLE') counts.unavailableCount += 1;
    if (!isAvailableForReadiness(member.rosterStatus)) continue;

    const group = positionGroup(member.position);
    if (group === 'FORWARD') {
      counts.availableForwards += 1;
      if (member.position === 'C') counts.availableCenters += 1;
      else counts.availableWingers += 1;
    } else if (group === 'DEFENSE') {
      counts.availableDefensemen += 1;
      if (member.position === 'LD') counts.availableLD += 1;
      else counts.availableRD += 1;
    } else {
      counts.availableGoalies += 1;
    }
    if (!member.modelComplete) counts.incompleteAvailableModels += 1;
  }
  return counts;
}

/**
 * Deterministic structural team readiness for F7.
 * Does not consider ratings, chemistry, contracts, or lineups.
 */
export function evaluateTeamReadiness(input: TeamReadinessInput): TeamReadinessResult {
  const counts = summarizeRoster(input.roster);
  const checks: TeamReadinessCheck[] = [];

  checks.push({
    code: 'HEAD_COACH',
    label: 'Head coach assigned',
    result: input.hasHeadCoach ? 'PASS' : 'FAIL',
    actual: input.hasHeadCoach,
    required: true,
    explanation: input.hasHeadCoach
      ? 'Team has a current head coach.'
      : 'Assign a head coach before the team is ready.',
  });

  checks.push({
    code: 'TACTICAL_STYLE',
    label: 'Team tactics configured',
    result: input.hasTacticalStyle ? 'PASS' : 'FAIL',
    actual: input.hasTacticalStyle,
    required: true,
    explanation: input.hasTacticalStyle
      ? 'Team tactical style is set.'
      : 'Configure a team tactical style.',
  });

  const forwardOk = counts.availableForwards >= TEAM_READINESS_THRESHOLDS.availableForwards;
  checks.push({
    code: 'AVAILABLE_FORWARDS',
    label: 'Available forwards',
    result: forwardOk ? 'PASS' : 'FAIL',
    actual: counts.availableForwards,
    required: TEAM_READINESS_THRESHOLDS.availableForwards,
    explanation: `ACTIVE/RESERVE forwards (LW/RW/C). PROSPECT and UNAVAILABLE are excluded.`,
  });

  const defenseOk = counts.availableDefensemen >= TEAM_READINESS_THRESHOLDS.availableDefensemen;
  checks.push({
    code: 'AVAILABLE_DEFENSEMEN',
    label: 'Available defensemen',
    result: defenseOk ? 'PASS' : 'FAIL',
    actual: counts.availableDefensemen,
    required: TEAM_READINESS_THRESHOLDS.availableDefensemen,
    explanation: `ACTIVE/RESERVE defensemen (LD/RD).`,
  });

  const goalieOk = counts.availableGoalies >= TEAM_READINESS_THRESHOLDS.availableGoalies;
  checks.push({
    code: 'AVAILABLE_GOALIES',
    label: 'Available goalies',
    result: goalieOk ? 'PASS' : 'FAIL',
    actual: counts.availableGoalies,
    required: TEAM_READINESS_THRESHOLDS.availableGoalies,
    explanation: `ACTIVE/RESERVE goalies (at least two for starter/backup).`,
  });

  // Slot distribution warnings — do not fail readiness alone.
  if (counts.availableCenters === 0 && counts.availableForwards > 0) {
    checks.push({
      code: 'CENTER_DEPTH',
      label: 'Center depth',
      result: 'WARN',
      actual: counts.availableCenters,
      required: 1,
      explanation: 'No ACTIVE/RESERVE centers; F8 lineup slots may be hard to fill.',
    });
  }
  if (counts.availableLD === 0 && counts.availableDefensemen > 0) {
    checks.push({
      code: 'LD_DEPTH',
      label: 'Left defense depth',
      result: 'WARN',
      actual: counts.availableLD,
      required: 1,
      explanation: 'No ACTIVE/RESERVE left defensemen.',
    });
  }
  if (counts.availableRD === 0 && counts.availableDefensemen > 0) {
    checks.push({
      code: 'RD_DEPTH',
      label: 'Right defense depth',
      result: 'WARN',
      actual: counts.availableRD,
      required: 1,
      explanation: 'No ACTIVE/RESERVE right defensemen.',
    });
  }

  if (counts.incompleteAvailableModels > 0) {
    checks.push({
      code: 'COMPLETE_MODELS',
      label: 'Complete player models',
      result: 'WARN',
      actual: counts.availableForwards + counts.availableDefensemen + counts.availableGoalies - counts.incompleteAvailableModels,
      required:
        counts.availableForwards + counts.availableDefensemen + counts.availableGoalies,
      explanation: `${counts.incompleteAvailableModels} ACTIVE/RESERVE player(s) lack a complete F5 model.`,
    });
  } else {
    checks.push({
      code: 'COMPLETE_MODELS',
      label: 'Complete player models',
      result: 'PASS',
      actual: true,
      required: true,
      explanation: 'All ACTIVE/RESERVE players have complete models (or none are available).',
    });
  }

  const hasFail = checks.some((c) => c.result === 'FAIL');
  const hasWarn = checks.some((c) => c.result === 'WARN');
  let status: TeamReadinessStatus = 'READY';
  if (hasFail) status = 'NOT_READY';
  else if (hasWarn) status = 'WARNING';

  return { status, checks, counts };
}
