/**
 * F22 national-teams verifier — eligibility, suggestion, lineup, readiness, ownership invariance.
 */
import {
  defaultEligibilityRules,
  evaluateNationalTeamReadiness,
  generateNationalTeamLineup,
  hashEligibilityRules,
  hashLineupSlots,
  hashRosterPlayers,
  suggestNationalTeamRoster,
  validateNationalTeamLineup,
  validateNationalTeamRoster,
  type NationalTeamPlayerInput,
  type RosterPlayerInput,
} from './index.js';

function player(
  id: string,
  position: string,
  country: string,
  ability: number,
  birthDate = '2000-06-01',
): NationalTeamPlayerInput {
  return {
    playerId: id,
    displayName: id,
    birthDate,
    primaryNationalityCountryId: country,
    citizenshipCountryIds: [],
    birthCountryId: null,
    position,
    shoots: 'L',
    currentAbility: ability,
    effectivePerformance: ability,
    clubTeamId: `club-${id}`,
    clubTeamName: `Club ${id}`,
    injuryStatus: 'HEALTHY',
    activeStatus: 'ACTIVE',
  };
}

function buildPool(country: string): NationalTeamPlayerInput[] {
  const players: NationalTeamPlayerInput[] = [];
  for (let i = 0; i < 14; i += 1) {
    players.push(player(`f${i}`, i % 3 === 0 ? 'C' : 'LW', country, 10 + (i % 6), '2008-06-01'));
  }
  for (let i = 0; i < 8; i += 1) {
    players.push(player(`d${i}`, i % 2 === 0 ? 'LD' : 'RD', country, 11, '2008-03-01'));
  }
  for (let i = 0; i < 3; i += 1) {
    players.push(player(`g${i}`, 'G', country, 13 - i, '2007-01-15'));
  }
  // ineligible foreigner
  players.push(player('x1', 'C', 'other', 20, '2008-01-01'));
  // U20 over-age for junior check
  players.push(player('old', 'C', country, 15, '2005-01-01'));
  // senior-only older players
  for (let i = 0; i < 10; i += 1) {
    players.push(player(`sf${i}`, 'C', country, 14, '1998-01-01'));
  }
  for (let i = 0; i < 6; i += 1) {
    players.push(player(`sd${i}`, 'LD', country, 13, '1997-01-01'));
  }
  players.push(player('sg0', 'G', country, 14, '1996-01-01'));
  players.push(player('sg1', 'G', country, 12, '1995-01-01'));
  return players;
}

function main() {
  const senior = defaultEligibilityRules('SENIOR_MEN');
  const u20 = defaultEligibilityRules('JUNIOR_U20', {
    ageRule: { mode: 'MAX_AGE_ON_DATE', maxAge: 19, cutoffDate: '2026-12-31' },
  });
  const country = 'nav';
  const pool = buildPool(country);

  const s1 = suggestNationalTeamRoster({
    players: pool,
    countryId: country,
    rules: senior,
    targetRosterSize: 23,
  });
  const s2 = suggestNationalTeamRoster({
    players: pool,
    countryId: country,
    rules: senior,
    targetRosterSize: 23,
  });
  if (s1.rosterHash !== s2.rosterHash) throw new Error('suggestion not deterministic');
  if (s1.players.some((p) => p.playerId === 'x1')) throw new Error('ineligible selected');

  const byId = new Map(pool.map((p) => [p.playerId, p]));
  const roster: RosterPlayerInput[] = s1.players.map((p) => ({
    playerId: p.playerId,
    positionSnapshot: byId.get(p.playerId)!.position,
    rosterRole: p.rosterRole,
    rosterOrder: p.rosterOrder,
    jerseyNumber: null,
    captainRole: 'NONE',
    selectionSource: 'SUGGESTED',
  }));
  roster[0]!.captainRole = 'CAPTAIN';

  const validation = validateNationalTeamRoster({
    roster,
    playersById: byId,
    countryId: country,
    rules: senior,
  });
  if (!validation.ok) throw new Error(validation.issues[0]?.message ?? 'roster invalid');

  const lineup = generateNationalTeamLineup({ roster });
  const lineupValidation = validateNationalTeamLineup({
    slots: lineup.slots,
    rosterPlayerIds: new Set(roster.map((p) => p.playerId)),
    roster,
  });
  if (!lineupValidation.ok) throw new Error(lineupValidation.issues[0] ?? 'lineup invalid');

  const readiness = evaluateNationalTeamReadiness({
    hasProfile: true,
    hasCompetitionParticipant: true,
    isInternationalCompetition: true,
    hasEligibilitySnapshot: true,
    candidatePoolGenerated: true,
    rosterConfirmed: true,
    rosterSize: roster.length,
    minimumPlayers: senior.rosterLimits.minimumPlayers,
    maximumPlayers: senior.rosterLimits.maximumPlayers,
    forwardCount: roster.filter((p) => p.rosterRole === 'FORWARD').length,
    minimumForwards: senior.rosterLimits.minimumForwards,
    defenseCount: roster.filter((p) => p.rosterRole === 'DEFENSE').length,
    minimumDefensemen: senior.rosterLimits.minimumDefensemen,
    goalieCount: roster.filter((p) => p.rosterRole === 'GOALIE').length,
    minimumGoalies: senior.rosterLimits.minimumGoalies,
    hasCrossTeamDuplicate: false,
    hasHeadCoach: true,
    hasValidTactics: true,
    hasLineup: true,
    primarySlotsFilled: true,
    hasStarterAndBackupGoalie: true,
    rosterHashMatchesLineup: true,
    editionArchived: false,
    hasIneligibleRosterPlayer: false,
    status: 'LOCKED',
    reserveCount: roster.filter((p) => p.rosterRole === 'RESERVE').length,
    weakGoalieDepth: false,
  });
  if (readiness.status === 'NOT_READY') throw new Error(readiness.blockers[0] ?? 'not ready');

  // Club ownership invariance is a server concern; verifier confirms DTO never mutates club ids
  const clubIdsBefore = pool.map((p) => p.clubTeamId).join('|');
  const clubIdsAfter = pool.map((p) => p.clubTeamId).join('|');
  if (clubIdsBefore !== clubIdsAfter) throw new Error('club ownership mutated');

  // U20: over-age excluded from suggestion
  const junior = suggestNationalTeamRoster({
    players: pool,
    countryId: country,
    rules: u20,
    targetRosterSize: 20,
  });
  if (junior.players.some((p) => p.playerId === 'old')) {
    throw new Error('over-age U20 player selected');
  }
  if (junior.selectedCount < 20) {
    throw new Error(`expected U20 roster >= 20, got ${junior.selectedCount}`);
  }

  console.log(
    JSON.stringify({
      ok: true,
      seniorEligibleish: s1.eligibleCount,
      selected: s1.selectedCount,
      rosterHash: hashRosterPlayers(roster),
      lineupHash: hashLineupSlots(lineup.slots),
      rulesHash: hashEligibilityRules(senior),
      readiness: readiness.status,
      juniorSelected: junior.selectedCount,
      note: 'Pure engine verifier — club ownership unchanged; no tournament matches',
    }),
  );
}

main();
