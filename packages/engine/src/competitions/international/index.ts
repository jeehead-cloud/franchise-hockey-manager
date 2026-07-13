export type {
  InternationalTemplateKey,
  InternationalNationalTeamCategory,
  InternationalTournamentTemplate,
  GroupAssignmentMode,
  GroupAssignment,
  GroupScheduleMatchSpec,
  GeneratedGroupSchedule,
  GroupStandingRow,
  QualificationEntry,
  KnockoutMatchupSpec,
  GeneratedKnockoutBracket,
  TournamentMedalType,
  TournamentMedalResultSpec,
  TournamentParticipantSeed,
  TournamentReconciliationResult,
  InternationalTiebreaker,
} from './types.js';
export {
  INTERNATIONAL_TOURNAMENT_SCHEMA_VERSION,
  InternationalTournamentError,
} from './types.js';

export {
  getInternationalTournamentTemplate,
  getTestInternationalTemplate,
  INTERNATIONAL_TEMPLATE_KEYS,
} from './templates.js';

export {
  validateInternationalTournamentTemplate,
  canonicalizeInternationalTemplate,
  resolveInternationalTemplate,
} from './config.js';

export { assignTournamentGroups } from './grouping.js';

export {
  generateInternationalGroupSchedule,
  deriveInternationalGroupMatchSeed,
} from './group-schedule.js';

export {
  computeGroupStandings,
  computeAllGroupStandings,
  type GroupMatchResultInput,
} from './group-standings.js';

export {
  buildQualificationAndKnockout,
  deriveInternationalKnockoutMatchSeed,
} from './qualification.js';

export {
  progressKnockoutBracket,
  deriveMedalsFromKnockout,
  type CompletedKnockoutGame,
} from './knockout.js';

export { reconcileInternationalTournament } from './reconciliation.js';

export {
  hashInternationalTemplate,
  hashGroupAssignment,
  hashGroupSchedule,
  hashKnockoutBracket,
  hashTournamentMedals,
  hashTournamentResult,
} from './hashing.js';
