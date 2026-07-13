import type {
  HistoricalRecord,
  HistoricalRecordHolder,
  NormalizedCompetitionArchive,
} from './types.js';

export interface ArchiveRecordSource {
  archiveId: string;
  competitionNameSnapshot: string;
  worldSeasonNameSnapshot: string;
  archive: Pick<
    NormalizedCompetitionArchive,
    | 'standings'
    | 'teamStats'
    | 'playerStats'
    | 'championTeamSourceId'
    | 'championNameSnapshot'
    | 'championSourceParticipantId'
    | 'participants'
    | 'stages'
  >;
}

function stageIdsByType(source: ArchiveRecordSource, stageType: string): string[] {
  return source.archive.stages
    .filter((s) => s.stageType === stageType)
    .map((s) => s.sourceCompetitionStageId);
}

function pushMaxHolders(
  map: Map<string, HistoricalRecordHolder[]>,
  category: string,
  value: number,
  holder: Omit<HistoricalRecordHolder, 'value'>,
): void {
  const existing = map.get(category) ?? [];
  if (existing.length === 0 || value > existing[0]!.value) {
    map.set(category, [{ ...holder, value }]);
    return;
  }
  if (value === existing[0]!.value) {
    existing.push({ ...holder, value });
    map.set(category, existing);
  }
}

function sortHolders(holders: HistoricalRecordHolder[]): HistoricalRecordHolder[] {
  return [...holders].sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value;
    return a.label.localeCompare(b.label);
  });
}

/**
 * Derive simple historical records across current official archives.
 * Ties keep all holders; ordering is deterministic.
 */
export function deriveHistoricalRecords(sources: ArchiveRecordSource[]): HistoricalRecord[] {
  const teamMap = new Map<string, HistoricalRecordHolder[]>();
  const playerMap = new Map<string, HistoricalRecordHolder[]>();
  const championships = new Map<string, number>();

  for (const source of sources) {
    const rsStageIds = new Set(stageIdsByType(source, 'REGULAR_SEASON'));
    const poStageIds = new Set(stageIdsByType(source, 'BEST_OF_SERIES'));

    for (const s of source.archive.standings) {
      if (!rsStageIds.has(s.sourceStageId)) continue;
      const part = source.archive.participants.find(
        (p) => p.sourceCompetitionParticipantId === s.sourceParticipantId,
      );
      const base = {
        label: part?.teamNameSnapshot ?? s.sourceParticipantId,
        archiveId: source.archiveId,
        competitionName: source.competitionNameSnapshot,
        seasonName: source.worldSeasonNameSnapshot,
        sourcePlayerId: null,
        sourceTeamId: part?.sourceTeamId ?? null,
        sourceParticipantId: s.sourceParticipantId,
      };
      pushMaxHolders(teamMap, 'most_regular_season_points', s.points, base);
      pushMaxHolders(teamMap, 'most_regular_season_wins', s.wins, base);
      pushMaxHolders(teamMap, 'most_regular_season_goals', s.goalsFor, base);
      pushMaxHolders(teamMap, 'fewest_regular_season_goals_against', -s.goalsAgainst, {
        ...base,
        label: `${base.label} (${s.goalsAgainst} GA)`,
      });
      // store positive GA in value for display
      const gaHolders = teamMap.get('fewest_regular_season_goals_against');
      if (gaHolders) {
        for (const h of gaHolders) {
          if (h.value < 0) h.value = -h.value;
        }
      }
      pushMaxHolders(teamMap, 'best_regular_season_points_percentage', s.pointsPercentage, base);
    }

    for (const t of source.archive.teamStats) {
      if (!poStageIds.has(t.sourceStageId)) continue;
      const part = source.archive.participants.find(
        (p) => p.sourceCompetitionParticipantId === t.sourceParticipantId,
      );
      pushMaxHolders(teamMap, 'most_playoff_wins', t.wins, {
        label: part?.teamNameSnapshot ?? t.sourceParticipantId,
        archiveId: source.archiveId,
        competitionName: source.competitionNameSnapshot,
        seasonName: source.worldSeasonNameSnapshot,
        sourcePlayerId: null,
        sourceTeamId: part?.sourceTeamId ?? null,
        sourceParticipantId: t.sourceParticipantId,
      });
    }

    for (const p of source.archive.playerStats) {
      const base = {
        label: p.playerNameSnapshot,
        archiveId: source.archiveId,
        competitionName: source.competitionNameSnapshot,
        seasonName: source.worldSeasonNameSnapshot,
        sourcePlayerId: p.sourcePlayerId,
        sourceTeamId: p.sourceTeamId,
        sourceParticipantId: p.sourceParticipantId,
      };
      if (rsStageIds.has(p.sourceStageId) && !p.isGoalie) {
        pushMaxHolders(playerMap, 'most_regular_season_player_points', p.points, base);
        pushMaxHolders(playerMap, 'most_regular_season_player_goals', p.goals, base);
        pushMaxHolders(playerMap, 'most_regular_season_player_assists', p.assists, base);
      }
      if (poStageIds.has(p.sourceStageId) && !p.isGoalie) {
        pushMaxHolders(playerMap, 'most_playoff_player_points', p.points, base);
        pushMaxHolders(playerMap, 'most_playoff_player_goals', p.goals, base);
      }
      if (rsStageIds.has(p.sourceStageId) && p.isGoalie && p.savePercentage != null) {
        pushMaxHolders(playerMap, 'best_goalie_save_percentage', p.savePercentage, base);
        pushMaxHolders(playerMap, 'most_goalie_wins', p.goalieWins, base);
      }
    }

    if (source.archive.championTeamSourceId || source.archive.championNameSnapshot) {
      const key = source.archive.championTeamSourceId ?? source.archive.championNameSnapshot!;
      championships.set(key, (championships.get(key) ?? 0) + 1);
    }
  }

  // Fix fewest GA: recompute properly (pushMaxHolders with negated value is awkward)
  const fewest = new Map<string, HistoricalRecordHolder[]>();
  for (const source of sources) {
    const rsStageIds = new Set(stageIdsByType(source, 'REGULAR_SEASON'));
    for (const s of source.archive.standings) {
      if (!rsStageIds.has(s.sourceStageId)) continue;
      const part = source.archive.participants.find(
        (p) => p.sourceCompetitionParticipantId === s.sourceParticipantId,
      );
      const holder: HistoricalRecordHolder = {
        value: s.goalsAgainst,
        label: part?.teamNameSnapshot ?? s.sourceParticipantId,
        archiveId: source.archiveId,
        competitionName: source.competitionNameSnapshot,
        seasonName: source.worldSeasonNameSnapshot,
        sourcePlayerId: null,
        sourceTeamId: part?.sourceTeamId ?? null,
        sourceParticipantId: s.sourceParticipantId,
      };
      const existing = fewest.get('fewest') ?? [];
      if (existing.length === 0 || holder.value < existing[0]!.value) {
        fewest.set('fewest', [holder]);
      } else if (holder.value === existing[0]!.value) {
        existing.push(holder);
        fewest.set('fewest', existing);
      }
    }
  }
  teamMap.set('fewest_regular_season_goals_against', fewest.get('fewest') ?? []);

  const championshipHolders: HistoricalRecordHolder[] = [...championships.entries()]
    .map(([key, count]) => {
      const sample = sources.find(
        (s) =>
          s.archive.championTeamSourceId === key || s.archive.championNameSnapshot === key,
      );
      return {
        value: count,
        label: sample?.archive.championNameSnapshot ?? key,
        archiveId: sample?.archiveId ?? null,
        competitionName: sample?.competitionNameSnapshot ?? null,
        seasonName: null,
        sourcePlayerId: null,
        sourceTeamId: sample?.archive.championTeamSourceId ?? null,
        sourceParticipantId: sample?.archive.championSourceParticipantId ?? null,
      };
    })
    .sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value;
      return a.label.localeCompare(b.label);
    });

  const records: HistoricalRecord[] = [];
  for (const [category, holders] of [...teamMap.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    records.push({
      category,
      scope: category.includes('championship') ? 'CHAMPIONSHIP' : 'TEAM',
      holders: sortHolders(holders),
    });
  }
  for (const [category, holders] of [...playerMap.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    records.push({
      category,
      scope: category.includes('goalie') ? 'GOALIE' : 'PLAYER',
      holders: sortHolders(holders),
    });
  }
  if (championshipHolders.length > 0) {
    records.push({
      category: 'most_championships',
      scope: 'CHAMPIONSHIP',
      holders: championshipHolders,
    });
  }
  return records;
}
