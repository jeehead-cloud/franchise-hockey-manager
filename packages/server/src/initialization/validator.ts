import type { LoadedDataset, ValidationIssue, ValidationReport } from './types.js';

function push(
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
  issue: ValidationIssue,
) {
  if (issue.severity === 'error') errors.push(issue);
  else warnings.push(issue);
}

function findDuplicateExternalIds(
  rows: { externalId: string }[],
  file: string,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
) {
  const seen = new Map<string, number>();
  for (const row of rows) {
    const prev = seen.get(row.externalId);
    if (prev !== undefined) {
      push(errors, warnings, {
        severity: 'error',
        code: 'DUPLICATE_EXTERNAL_ID',
        message: `Duplicate externalId "${row.externalId}" in ${file}`,
        file,
        externalId: row.externalId,
      });
    } else {
      seen.set(row.externalId, 1);
    }
  }
}

export function validateDataset(dataset: LoadedDataset): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const { manifest, countries, leagues, teams, players, coaches, competitions, competitionEditions } =
    dataset;

  if (manifest.worldSeasonStartYear >= manifest.worldSeasonEndYear) {
    push(errors, warnings, {
      severity: 'error',
      code: 'INVALID_WORLD_SEASON_YEARS',
      message: 'worldSeasonStartYear must be less than worldSeasonEndYear',
      file: 'manifest.json',
    });
  }

  if (manifest.fictional) {
    push(errors, warnings, {
      severity: 'warning',
      code: 'FICTIONAL_DATASET',
      message:
        'This dataset is labeled fictional (development/testing). It is not the production real-world snapshot.',
      file: 'manifest.json',
    });
  }

  findDuplicateExternalIds(countries, manifest.files.countries, errors, warnings);
  findDuplicateExternalIds(leagues, manifest.files.leagues, errors, warnings);
  findDuplicateExternalIds(teams, manifest.files.teams, errors, warnings);
  findDuplicateExternalIds(players, manifest.files.players, errors, warnings);
  findDuplicateExternalIds(coaches, manifest.files.coaches, errors, warnings);
  findDuplicateExternalIds(competitions, manifest.files.competitions, errors, warnings);

  const countryCodes = new Map<string, string>();
  for (const c of countries) {
    const prev = countryCodes.get(c.code);
    if (prev) {
      push(errors, warnings, {
        severity: 'error',
        code: 'DUPLICATE_COUNTRY_CODE',
        message: `Duplicate country code "${c.code}"`,
        file: manifest.files.countries,
        externalId: c.externalId,
      });
    } else {
      countryCodes.set(c.code, c.externalId);
    }
  }

  const countryIds = new Set(countries.map((c) => c.externalId));
  const leagueIds = new Set(leagues.map((l) => l.externalId));
  const teamIds = new Set(teams.map((t) => t.externalId));
  const competitionIds = new Set(competitions.map((c) => c.externalId));

  for (const league of leagues) {
    if (league.countryExternalId && !countryIds.has(league.countryExternalId)) {
      push(errors, warnings, {
        severity: 'error',
        code: 'MISSING_COUNTRY_REF',
        message: `League "${league.externalId}" references unknown country "${league.countryExternalId}"`,
        file: manifest.files.leagues,
        externalId: league.externalId,
      });
    }
  }

  for (const team of teams) {
    if (!countryIds.has(team.countryExternalId)) {
      push(errors, warnings, {
        severity: 'error',
        code: 'MISSING_COUNTRY_REF',
        message: `Team "${team.externalId}" references unknown country "${team.countryExternalId}"`,
        file: manifest.files.teams,
        externalId: team.externalId,
      });
    }
    if (team.leagueExternalId && !leagueIds.has(team.leagueExternalId)) {
      push(errors, warnings, {
        severity: 'error',
        code: 'MISSING_LEAGUE_REF',
        message: `Team "${team.externalId}" references unknown league "${team.leagueExternalId}"`,
        file: manifest.files.teams,
        externalId: team.externalId,
      });
    }
  }

  for (const player of players) {
    if (!countryIds.has(player.nationalityExternalId)) {
      push(errors, warnings, {
        severity: 'error',
        code: 'MISSING_COUNTRY_REF',
        message: `Player "${player.externalId}" references unknown nationality "${player.nationalityExternalId}"`,
        file: manifest.files.players,
        externalId: player.externalId,
      });
    }
    if (player.currentTeamExternalId && !teamIds.has(player.currentTeamExternalId)) {
      push(errors, warnings, {
        severity: 'error',
        code: 'MISSING_TEAM_REF',
        message: `Player "${player.externalId}" references unknown team "${player.currentTeamExternalId}"`,
        file: manifest.files.players,
        externalId: player.externalId,
      });
    }
    const dob = new Date(`${player.dateOfBirth}T00:00:00.000Z`);
    if (Number.isNaN(dob.getTime()) || dob.toISOString().slice(0, 10) !== player.dateOfBirth) {
      push(errors, warnings, {
        severity: 'error',
        code: 'INVALID_DATE',
        message: `Player "${player.externalId}" has invalid dateOfBirth "${player.dateOfBirth}"`,
        file: manifest.files.players,
        externalId: player.externalId,
      });
    }
    if (player.sourceType !== 'REAL_INITIAL_DATA') {
      push(errors, warnings, {
        severity: 'warning',
        code: 'NON_INITIAL_SOURCE_TYPE',
        message: `Player "${player.externalId}" sourceType is ${player.sourceType}; initial imports normally use REAL_INITIAL_DATA`,
        file: manifest.files.players,
        externalId: player.externalId,
      });
    }
  }

  const coachTeamAssignments = new Map<string, string>();
  for (const coach of coaches) {
    if (coach.nationalityExternalId && !countryIds.has(coach.nationalityExternalId)) {
      push(errors, warnings, {
        severity: 'error',
        code: 'MISSING_COUNTRY_REF',
        message: `Coach "${coach.externalId}" references unknown nationality "${coach.nationalityExternalId}"`,
        file: manifest.files.coaches,
        externalId: coach.externalId,
      });
    }
    if (coach.currentTeamExternalId) {
      if (!teamIds.has(coach.currentTeamExternalId)) {
        push(errors, warnings, {
          severity: 'error',
          code: 'MISSING_TEAM_REF',
          message: `Coach "${coach.externalId}" references unknown team "${coach.currentTeamExternalId}"`,
          file: manifest.files.coaches,
          externalId: coach.externalId,
        });
      } else {
        const prev = coachTeamAssignments.get(coach.currentTeamExternalId);
        if (prev) {
          push(errors, warnings, {
            severity: 'error',
            code: 'DUPLICATE_COACH_ASSIGNMENT',
            message: `Team "${coach.currentTeamExternalId}" has multiple current coaches (${prev}, ${coach.externalId})`,
            file: manifest.files.coaches,
            externalId: coach.externalId,
          });
        } else {
          coachTeamAssignments.set(coach.currentTeamExternalId, coach.externalId);
        }
      }
    }
  }

  const editionKeys = new Set<string>();
  for (const edition of competitionEditions) {
    if (!competitionIds.has(edition.competitionExternalId)) {
      push(errors, warnings, {
        severity: 'error',
        code: 'MISSING_COMPETITION_REF',
        message: `Competition edition "${edition.displayName}" references unknown competition "${edition.competitionExternalId}"`,
        file: manifest.files.competitionEditions,
      });
    }
    const key = edition.competitionExternalId;
    if (editionKeys.has(key)) {
      push(errors, warnings, {
        severity: 'error',
        code: 'DUPLICATE_EDITION',
        message: `Multiple editions for competition "${edition.competitionExternalId}" in one world season`,
        file: manifest.files.competitionEditions,
      });
    } else {
      editionKeys.add(key);
    }
  }

  const counts = {
    worldSeasons: 1,
    countries: countries.length,
    leagues: leagues.length,
    teams: teams.length,
    players: players.length,
    coaches: coaches.length,
    competitions: competitions.length,
    competitionEditions: competitionEditions.length,
  };

  return {
    valid: errors.length === 0,
    dataset: {
      id: manifest.datasetId,
      name: manifest.datasetName,
      schemaVersion: manifest.schemaVersion,
      sourceName: manifest.sourceName,
      sourceUpdatedAt: manifest.sourceUpdatedAt,
      worldSeasonLabel: manifest.worldSeasonLabel,
      fictional: Boolean(manifest.fictional),
      notes: manifest.notes,
    },
    counts,
    errors,
    warnings,
  };
}
