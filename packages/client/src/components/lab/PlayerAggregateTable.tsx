import { useMemo, useState } from 'react';
import { DataRow, DataTable, Field, SelectInput, Td } from '../ui/DataBrowser';
import { EmptyState } from '../ui/EmptyState';
import { Panel } from '../ui/Panel';
import { formatPct, formatPlayerName } from '../../lib/match-format';
import type { LabPlayerAggregate } from '../../lib/api';

type SideFilter = 'ALL' | 'TEAM_A' | 'TEAM_B';

export function PlayerAggregateTable({
  players,
  teamAName,
  teamBName,
}: {
  players: LabPlayerAggregate[];
  teamAName: string;
  teamBName: string;
}) {
  const [side, setSide] = useState<SideFilter>('ALL');

  const filtered = useMemo(() => {
    const list = side === 'ALL' ? players : players.filter((p) => p.teamSide === side);
    return [...list].sort((a, b) => {
      if (a.isGoalie !== b.isGoalie) return a.isGoalie ? 1 : -1;
      return b.points - a.points || b.goals - a.goals || a.lastName.localeCompare(b.lastName);
    });
  }, [players, side]);

  const skaters = filtered.filter((p) => !p.isGoalie);
  const goalies = filtered.filter((p) => p.isGoalie);

  const sideLabel = (s: 'TEAM_A' | 'TEAM_B') => (s === 'TEAM_A' ? teamAName : teamBName);

  if (players.length === 0) {
    return (
      <Panel title="Player contribution">
        <EmptyState
          title="No player aggregates"
          description="Enable player aggregates on the next run, or no player stats were produced."
        />
      </Panel>
    );
  }

  return (
    <Panel
      title="Player contribution"
      actions={
        <Field label="Team">
          <SelectInput value={side} onChange={(e) => setSide(e.target.value as SideFilter)}>
            <option value="ALL">All</option>
            <option value="TEAM_A">{teamAName}</option>
            <option value="TEAM_B">{teamBName}</option>
          </SelectInput>
        </Field>
      }
    >
      <div
        style={{
          marginBottom: 8,
          font: 'var(--text-label-wide)',
          letterSpacing: 'var(--text-tracking-wide)',
          textTransform: 'uppercase',
          color: 'var(--text-tertiary)',
        }}
      >
        Skaters
      </div>
      {skaters.length === 0 ? (
        <EmptyState title="No skaters" description="No skater lines match the current filter." />
      ) : (
        <DataTable
          headers={[
            { key: 'player', label: 'Player' },
            { key: 'team', label: 'Team' },
            { key: 'pos', label: 'Pos' },
            { key: 'gp', label: 'GP' },
            { key: 'g', label: 'G' },
            { key: 'a', label: 'A' },
            { key: 'p', label: 'P' },
            { key: 'ppg', label: 'P/G' },
            { key: 'sog', label: 'SOG' },
            { key: 'sh%', label: 'SH%' },
            { key: 'pim', label: 'PIM' },
            { key: 'pp', label: 'PPG' },
            { key: 'shg', label: 'SHG' },
          ]}
        >
          {skaters.map((p) => (
            <DataRow key={`${p.playerId}-${p.teamSide}`}>
              <Td primary>{formatPlayerName(p.firstName, p.lastName, p.playerId)}</Td>
              <Td>{sideLabel(p.teamSide)}</Td>
              <Td>{p.position}</Td>
              <Td>{p.games}</Td>
              <Td>{p.goals}</Td>
              <Td>{p.assists}</Td>
              <Td>{p.points}</Td>
              <Td>{p.pointsPerGame.toFixed(2)}</Td>
              <Td>{p.shotsOnGoal}</Td>
              <Td>{formatPct(p.shootingPercentage)}</Td>
              <Td>{p.penaltyMinutes}</Td>
              <Td>{p.powerPlayGoals}</Td>
              <Td>{p.shortHandedGoals}</Td>
            </DataRow>
          ))}
        </DataTable>
      )}

      <div
        style={{
          margin: '16px 0 8px',
          font: 'var(--text-label-wide)',
          letterSpacing: 'var(--text-tracking-wide)',
          textTransform: 'uppercase',
          color: 'var(--text-tertiary)',
        }}
      >
        Goalies
      </div>
      {goalies.length === 0 ? (
        <EmptyState title="No goalies" description="No goalie lines match the current filter." />
      ) : (
        <DataTable
          headers={[
            { key: 'player', label: 'Goalie' },
            { key: 'team', label: 'Team' },
            { key: 'gp', label: 'GP' },
            { key: 'w', label: 'W' },
            { key: 'sa', label: 'SA' },
            { key: 'sv', label: 'SV' },
            { key: 'ga', label: 'GA' },
            { key: 'sv%', label: 'SV%' },
            { key: 'so', label: 'SO' },
          ]}
        >
          {goalies.map((p) => (
            <DataRow key={`${p.playerId}-${p.teamSide}-g`}>
              <Td primary>{formatPlayerName(p.firstName, p.lastName, p.playerId)}</Td>
              <Td>{sideLabel(p.teamSide)}</Td>
              <Td>{p.games}</Td>
              <Td>{p.wins}</Td>
              <Td>{p.shotsAgainst}</Td>
              <Td>{p.saves}</Td>
              <Td>{p.goalsAgainst}</Td>
              <Td>{formatPct(p.savePercentage)}</Td>
              <Td>{p.shutouts}</Td>
            </DataRow>
          ))}
        </DataTable>
      )}
    </Panel>
  );
}
