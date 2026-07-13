import type {
  NationalTeamEditionStatus,
  NationalTeamReadinessCheck,
  NationalTeamReadinessResult,
} from './types.js';

function pass(id: string, message: string): NationalTeamReadinessCheck {
  return { id, status: 'PASS', message };
}
function warn(id: string, message: string): NationalTeamReadinessCheck {
  return { id, status: 'WARN', message };
}
function fail(id: string, message: string): NationalTeamReadinessCheck {
  return { id, status: 'FAIL', message };
}

export function evaluateNationalTeamReadiness(input: {
  hasProfile: boolean;
  hasCompetitionParticipant: boolean;
  isInternationalCompetition: boolean;
  hasEligibilitySnapshot: boolean;
  candidatePoolGenerated: boolean;
  rosterConfirmed: boolean;
  rosterSize: number;
  minimumPlayers: number;
  maximumPlayers: number;
  forwardCount: number;
  minimumForwards: number;
  defenseCount: number;
  minimumDefensemen: number;
  goalieCount: number;
  minimumGoalies: number;
  hasCrossTeamDuplicate: boolean;
  hasHeadCoach: boolean;
  hasValidTactics: boolean;
  hasLineup: boolean;
  primarySlotsFilled: boolean;
  hasStarterAndBackupGoalie: boolean;
  rosterHashMatchesLineup: boolean;
  editionArchived: boolean;
  hasIneligibleRosterPlayer: boolean;
  status: NationalTeamEditionStatus;
  reserveCount: number;
  weakGoalieDepth: boolean;
}): NationalTeamReadinessResult {
  const checks: NationalTeamReadinessCheck[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];

  const add = (c: NationalTeamReadinessCheck) => {
    checks.push(c);
    if (c.status === 'FAIL') blockers.push(c.message);
    if (c.status === 'WARN') warnings.push(c.message);
  };

  add(
    input.hasProfile
      ? pass('profile', 'National-team profile exists')
      : fail('profile', 'National-team profile missing'),
  );
  add(
    input.hasCompetitionParticipant
      ? pass('participant', 'Competition participant exists')
      : fail('participant', 'Competition participant missing'),
  );
  add(
    input.isInternationalCompetition
      ? pass('competition', 'Competition is international')
      : fail('competition', 'Competition is not INTERNATIONAL_TOURNAMENT'),
  );
  add(
    input.hasEligibilitySnapshot
      ? pass('eligibility', 'Eligibility rules snapshot present')
      : fail('eligibility', 'Eligibility rules snapshot missing'),
  );
  add(
    input.candidatePoolGenerated
      ? pass('candidates', 'Candidate pool generated')
      : fail('candidates', 'Candidate pool not generated'),
  );
  add(
    input.rosterConfirmed
      ? pass('roster_confirmed', 'Roster confirmed')
      : fail('roster_confirmed', 'Roster not confirmed'),
  );

  if (input.rosterSize < input.minimumPlayers || input.rosterSize > input.maximumPlayers) {
    add(
      fail(
        'roster_size',
        `Roster size ${input.rosterSize} outside ${input.minimumPlayers}–${input.maximumPlayers}`,
      ),
    );
  } else if (input.rosterSize === input.minimumPlayers) {
    add(warn('roster_size', 'Roster is at minimum size only'));
  } else {
    add(pass('roster_size', `Roster size ${input.rosterSize} valid`));
  }

  add(
    input.forwardCount >= input.minimumForwards
      ? pass('forwards', `${input.forwardCount} forwards`)
      : fail('forwards', `Need ${input.minimumForwards} forwards`),
  );
  add(
    input.defenseCount >= input.minimumDefensemen
      ? pass('defense', `${input.defenseCount} defensemen`)
      : fail('defense', `Need ${input.minimumDefensemen} defensemen`),
  );
  add(
    input.goalieCount >= input.minimumGoalies
      ? pass('goalies', `${input.goalieCount} goalies`)
      : fail('goalies', `Need ${input.minimumGoalies} goalies`),
  );
  add(
    input.hasCrossTeamDuplicate
      ? fail('cross_team', 'Player selected for another national team in this edition')
      : pass('cross_team', 'No cross-team roster conflicts'),
  );
  add(
    input.hasHeadCoach
      ? pass('coach', 'Head coach assigned')
      : fail('coach', 'Head coach required'),
  );
  add(
    input.hasValidTactics
      ? pass('tactics', 'Tournament tactics set')
      : fail('tactics', 'Tournament tactics required'),
  );
  add(
    input.hasLineup
      ? pass('lineup', 'Lineup present')
      : fail('lineup', 'Lineup required'),
  );
  add(
    input.primarySlotsFilled
      ? pass('slots', 'Primary lineup slots filled')
      : fail('slots', 'Primary lineup slots incomplete'),
  );
  add(
    input.hasStarterAndBackupGoalie
      ? pass('goalie_depth', 'Starter and backup goalies assigned')
      : fail('goalie_depth', 'Starter and backup goalies required'),
  );
  add(
    input.rosterHashMatchesLineup
      ? pass('roster_hash', 'Lineup matches confirmed roster hash')
      : fail('roster_hash', 'Lineup roster hash mismatch'),
  );
  add(
    input.editionArchived
      ? fail('archived', 'Competition edition is archived')
      : pass('archived', 'Edition is not archived'),
  );
  add(
    input.hasIneligibleRosterPlayer
      ? fail('ineligible', 'Roster contains an ineligible player')
      : pass('ineligible', 'All roster players eligible'),
  );

  if (input.reserveCount === 0) add(warn('reserves', 'Reserve list empty'));
  if (input.weakGoalieDepth) add(warn('goalie_warn', 'Weak goalie depth'));
  if (input.status === 'LOCKED') add(pass('lock', 'National-team edition is LOCKED'));
  else if (input.status === 'READY') add(pass('lock', 'National-team edition is READY'));
  else add(warn('lock', `Status is ${input.status} (not yet READY/LOCKED)`));

  let status: NationalTeamReadinessResult['status'] = 'READY';
  if (blockers.length > 0) status = 'NOT_READY';
  else if (warnings.length > 0) status = 'WARNING';

  return { status, checks, blockers, warnings };
}
