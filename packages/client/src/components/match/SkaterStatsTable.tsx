import { DataRow, DataTable, Td } from '../ui/DataBrowser';
import { EmptyState } from '../ui/EmptyState';
import { Panel } from '../ui/Panel';
import { formatPlayerName, formatSecondsAsClock } from '../../lib/match-format';
import type { MatchOverviewSkater } from '../../lib/api';

export function SkaterStatsTable({ skaters }: { skaters: MatchOverviewSkater[] }) {
  if (skaters.length === 0) {
    return (
      <Panel title="Skater statistics">
        <EmptyState title="No skater stats" description="Player statistics are not available for this result." />
      </Panel>
    );
  }

  return (
    <Panel title="Skater statistics">
      <DataTable
        headers={[
          { key: 'player', label: 'Player' },
          { key: 'team', label: 'Team' },
          { key: 'pos', label: 'Pos' },
          { key: 'g', label: 'G' },
          { key: 'a', label: 'A' },
          { key: 'p', label: 'P' },
          { key: 'sog', label: 'SOG' },
          { key: 'sa', label: 'Att' },
          { key: 'blk', label: 'Blk' },
          { key: 'pim', label: 'PIM' },
          { key: 'ppg', label: 'PPG' },
          { key: 'shg', label: 'SHG' },
          { key: 'toi', label: 'TOI' },
        ]}
      >
        {skaters.map((row) => (
          <DataRow key={row.playerId}>
            <Td primary>{formatPlayerName(row.firstName, row.lastName, row.playerId)}</Td>
            <Td>{row.teamName ?? '—'}</Td>
            <Td>{row.position}</Td>
            <Td>{row.goals}</Td>
            <Td>{row.assists}</Td>
            <Td>{row.points}</Td>
            <Td>{row.shotsOnGoal}</Td>
            <Td>{row.shotAttempts ?? '—'}</Td>
            <Td>{row.blocks ?? '—'}</Td>
            <Td>{row.penaltyMinutes}</Td>
            <Td>{row.powerPlayGoals}</Td>
            <Td>{row.shortHandedGoals}</Td>
            <Td>{formatSecondsAsClock(row.timeOnIceSeconds)}</Td>
          </DataRow>
        ))}
      </DataTable>
    </Panel>
  );
}
