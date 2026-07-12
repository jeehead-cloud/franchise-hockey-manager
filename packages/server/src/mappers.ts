function iso(d: Date): string {
  return d.toISOString();
}

function sourceMeta(row: {
  externalId?: string | null;
  sourceDataset?: string | null;
  sourceUpdatedAt?: Date | null;
}) {
  return {
    externalId: row.externalId ?? null,
    sourceDataset: row.sourceDataset ?? null,
    sourceUpdatedAt: row.sourceUpdatedAt ? iso(row.sourceUpdatedAt) : null,
  };
}

export function mapWorldSeason(row: {
  id: string;
  label: string;
  startYear: number;
  endYear: number;
  phase: string;
  status: string;
  sourceDataset?: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    label: row.label,
    startYear: row.startYear,
    endYear: row.endYear,
    phase: row.phase,
    status: row.status,
    sourceDataset: row.sourceDataset ?? null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function mapCountry(row: {
  id: string;
  name: string;
  code: string;
  externalId?: string | null;
  sourceDataset?: string | null;
  sourceUpdatedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    ...sourceMeta(row),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function mapLeague(row: {
  id: string;
  name: string;
  shortName: string | null;
  countryId: string | null;
  simulationLevel: string;
  externalId?: string | null;
  sourceDataset?: string | null;
  sourceUpdatedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  country?: { id: string; name: string; code: string } | null;
}) {
  return {
    id: row.id,
    name: row.name,
    shortName: row.shortName,
    countryId: row.countryId,
    simulationLevel: row.simulationLevel,
    ...sourceMeta(row),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    country: row.country
      ? { id: row.country.id, name: row.country.name, code: row.country.code }
      : null,
  };
}

export function mapTeam(row: {
  id: string;
  name: string;
  shortName: string | null;
  city: string | null;
  teamType: string;
  countryId: string;
  leagueId: string | null;
  tacticalStyle?: string | null;
  externalId?: string | null;
  sourceDataset?: string | null;
  sourceUpdatedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  country?: { id: string; name: string; code: string };
  league?: { id: string; name: string; shortName: string | null } | null;
  coach?: { id: string; firstName: string; lastName: string } | null;
}) {
  return {
    id: row.id,
    name: row.name,
    shortName: row.shortName,
    city: row.city,
    teamType: row.teamType,
    countryId: row.countryId,
    leagueId: row.leagueId,
    tacticalStyle: row.tacticalStyle ?? null,
    ...sourceMeta(row),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    country: row.country
      ? { id: row.country.id, name: row.country.name, code: row.country.code }
      : undefined,
    league: row.league
      ? { id: row.league.id, name: row.league.name, shortName: row.league.shortName }
      : row.league === null
        ? null
        : undefined,
    coach: row.coach
      ? {
          id: row.coach.id,
          firstName: row.coach.firstName,
          lastName: row.coach.lastName,
        }
      : row.coach === null
        ? null
        : undefined,
  };
}

export function mapPlayer(row: {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  nationalityCountryId: string;
  currentTeamId: string | null;
  primaryPosition: string;
  sourceType: string;
  rosterStatus: string;
  externalId?: string | null;
  sourceDataset?: string | null;
  sourceUpdatedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  nationality?: { id: string; name: string; code: string };
  currentTeam?: { id: string; name: string } | null;
  secondaryPositions?: { position: string }[];
}) {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    dateOfBirth: iso(row.dateOfBirth).slice(0, 10),
    nationalityCountryId: row.nationalityCountryId,
    currentTeamId: row.currentTeamId,
    primaryPosition: row.primaryPosition,
    secondaryPositions: row.secondaryPositions
      ? row.secondaryPositions.map((s) => s.position).sort()
      : [],
    sourceType: row.sourceType,
    rosterStatus: row.rosterStatus,
    ...sourceMeta(row),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    nationality: row.nationality
      ? {
          id: row.nationality.id,
          name: row.nationality.name,
          code: row.nationality.code,
        }
      : undefined,
    currentTeam: row.currentTeam
      ? { id: row.currentTeam.id, name: row.currentTeam.name }
      : row.currentTeam === null
        ? null
        : undefined,
  };
}

export function mapCoach(row: {
  id: string;
  firstName: string;
  lastName: string;
  nationalityCountryId: string | null;
  currentTeamId: string | null;
  coachingStyle: string;
  tacticalStyle: string;
  overallCoaching?: number | null;
  playerDevelopment?: number | null;
  offense?: number | null;
  defense?: number | null;
  externalId?: string | null;
  sourceDataset?: string | null;
  sourceUpdatedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  nationality?: { id: string; name: string; code: string } | null;
  currentTeam?: { id: string; name: string; shortName?: string | null } | null;
}) {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    nationalityCountryId: row.nationalityCountryId,
    currentTeamId: row.currentTeamId,
    coachingStyle: row.coachingStyle,
    tacticalStyle: row.tacticalStyle,
    overallCoaching: row.overallCoaching ?? null,
    playerDevelopment: row.playerDevelopment ?? null,
    offense: row.offense ?? null,
    defense: row.defense ?? null,
    ...sourceMeta(row),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    nationality: row.nationality
      ? {
          id: row.nationality.id,
          name: row.nationality.name,
          code: row.nationality.code,
        }
      : row.nationality === null
        ? null
        : undefined,
    currentTeam: row.currentTeam
      ? {
          id: row.currentTeam.id,
          name: row.currentTeam.name,
          shortName: row.currentTeam.shortName ?? null,
        }
      : row.currentTeam === null
        ? null
        : undefined,
  };
}

export function mapCompetition(row: {
  id: string;
  name: string;
  shortName: string | null;
  type: string;
  simulationLevel: string | null;
  externalId?: string | null;
  sourceDataset?: string | null;
  sourceUpdatedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    shortName: row.shortName,
    type: row.type,
    simulationLevel: row.simulationLevel,
    ...sourceMeta(row),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function mapCompetitionEdition(row: {
  id: string;
  competitionId: string;
  worldSeasonId: string;
  displayName: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  competition?: { id: string; name: string; type: string };
  worldSeason?: { id: string; label: string };
}) {
  return {
    id: row.id,
    competitionId: row.competitionId,
    worldSeasonId: row.worldSeasonId,
    displayName: row.displayName,
    status: row.status,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    competition: row.competition
      ? {
          id: row.competition.id,
          name: row.competition.name,
          type: row.competition.type,
        }
      : undefined,
    worldSeason: row.worldSeason
      ? { id: row.worldSeason.id, label: row.worldSeason.label }
      : undefined,
  };
}
