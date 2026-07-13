import {
  assertEditionTransition,
  isEditionStructurallyEditable,
  listAllowedEditionTransitions,
  transitionRequiresReadiness,
} from './lifecycle.js';
import { validateCompetitionRules, validateStageDependencyGraph } from './validation.js';
import type {
  EditionReadinessResult,
  EditionStructureInput,
  ReadinessCheck,
  ReadinessOverall,
} from './types.js';
import { CompetitionValidationError } from './types.js';

function push(
  checks: ReadinessCheck[],
  code: string,
  severity: ReadinessCheck['severity'],
  message: string,
  path?: string,
): void {
  checks.push({ code, severity, message, path });
}

export function evaluateEditionReadiness(input: EditionStructureInput): EditionReadinessResult {
  const checks: ReadinessCheck[] = [];

  try {
    validateCompetitionRules(input.rules);
    push(checks, 'RULES_VALID', 'OK', 'Rules snapshot is valid');
  } catch (err) {
    const message = err instanceof CompetitionValidationError ? err.message : 'Invalid rules';
    push(checks, 'RULES_INVALID', 'BLOCKER', message, 'rules');
  }

  if (!input.worldSeasonId) {
    push(checks, 'WORLD_SEASON_MISSING', 'BLOCKER', 'Edition must belong to a WorldSeason');
  } else {
    push(checks, 'WORLD_SEASON_PRESENT', 'OK', 'WorldSeason is set');
  }

  const confirmed = input.participants.filter((p) => p.status === 'CONFIRMED');
  const withdrawn = input.participants.filter((p) => p.status === 'WITHDRAWN');
  const teamIds = new Set<string>();
  let duplicateTeam = false;
  for (const p of input.participants) {
    if (teamIds.has(p.teamId)) duplicateTeam = true;
    teamIds.add(p.teamId);
  }
  if (duplicateTeam) {
    push(checks, 'DUPLICATE_TEAMS', 'BLOCKER', 'Participant teams must be unique');
  } else {
    push(checks, 'UNIQUE_TEAMS', 'OK', 'Participant teams are unique');
  }

  if (confirmed.length < 2) {
    push(
      checks,
      'MIN_PARTICIPANTS',
      'BLOCKER',
      'At least two CONFIRMED participants are required',
      'participants',
    );
  } else {
    push(checks, 'PARTICIPANTS_OK', 'OK', `${confirmed.length} confirmed participants`);
  }

  if (input.stages.length === 0) {
    push(checks, 'NO_STAGES', 'BLOCKER', 'At least one stage is required', 'stages');
  } else {
    push(checks, 'STAGES_PRESENT', 'OK', `${input.stages.length} stage(s)`);
  }

  try {
    validateStageDependencyGraph(input.stages);
    push(checks, 'STAGE_DEPENDENCIES_OK', 'OK', 'Stage order and dependencies are valid');
  } catch (err) {
    const message =
      err instanceof CompetitionValidationError ? err.message : 'Invalid stage dependencies';
    push(checks, 'STAGE_DEPENDENCIES_INVALID', 'BLOCKER', message, 'stages');
  }

  const ordered = [...input.stages].sort((a, b) => a.stageOrder - b.stageOrder);
  const first = ordered[0];
  if (first) {
    if (first.participantSource === 'PREVIOUS_STAGE_QUALIFIERS') {
      push(
        checks,
        'FIRST_STAGE_SOURCE',
        'BLOCKER',
        'First stage cannot source PREVIOUS_STAGE_QUALIFIERS',
        first.id,
      );
    } else if (
      first.participantSource === 'EDITION_PARTICIPANTS' ||
      first.participantSource === 'MANUAL' ||
      first.participantSource === 'FIXED_CONFIG'
    ) {
      push(checks, 'FIRST_STAGE_SOURCE_OK', 'OK', 'First stage can source participants');
    }
  }

  for (const stage of input.stages) {
    if (stage.stageType === 'GROUP_STAGE') {
      const cfg = stage.config as {
        groupCount: number;
        groupSize: number;
      };
      const needed = cfg.groupCount * cfg.groupSize;
      if (confirmed.length > 0 && confirmed.length < needed) {
        push(
          checks,
          'GROUP_CAPACITY',
          'WARNING',
          `Stage "${stage.name}" expects ${needed} participants for groups; ${confirmed.length} confirmed`,
          stage.id,
        );
      }
    }
    if (stage.participantSource === 'MANUAL') {
      const count = input.stageParticipantCounts?.[stage.id] ?? 0;
      if (count < 2) {
        push(
          checks,
          'MANUAL_STAGE_PARTICIPANTS',
          'WARNING',
          `Stage "${stage.name}" uses MANUAL source with fewer than 2 stage participants`,
          stage.id,
        );
      }
    }
  }

  if (withdrawn.length > 0) {
    push(
      checks,
      'WITHDRAWN_PRESENT',
      'WARNING',
      `${withdrawn.length} withdrawn participant(s) will not compete`,
    );
  }

  const blockers = checks.filter((c) => c.severity === 'BLOCKER').map((c) => c.message);
  const warnings = checks.filter((c) => c.severity === 'WARNING').map((c) => c.message);
  let status: ReadinessOverall = 'READY';
  if (blockers.length > 0) status = 'NOT_READY';
  else if (warnings.length > 0) status = 'WARNING';

  const allowedNextStatuses = listAllowedEditionTransitions(input.status).filter((to) => {
    if (!transitionRequiresReadiness(to)) return true;
    return blockers.length === 0;
  });

  return {
    status,
    checks,
    confirmedParticipantCount: confirmed.length,
    withdrawnParticipantCount: withdrawn.length,
    stageCount: input.stages.length,
    blockers,
    warnings,
    allowedNextStatuses,
  };
}

export function assertCanActivateOrReady(
  readiness: EditionReadinessResult,
  target: 'READY' | 'ACTIVE',
): void {
  if (readiness.blockers.length > 0) {
    throw new CompetitionValidationError(
      'NOT_READY',
      `Cannot transition to ${target}: ${readiness.blockers[0]}`,
    );
  }
}

export { isEditionStructurallyEditable, assertEditionTransition };
