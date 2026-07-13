import { Badge } from '../ui/Badge';
import { DataRow, DataTable, Td } from '../ui/DataBrowser';
import { EmptyState } from '../ui/EmptyState';
import { Panel } from '../ui/Panel';
import { formatPct, formatPlayerName, formatSecondsAsClock } from '../../lib/match-format';
import type { MatchOverviewGoalie } from '../../lib/api';

export function GoalieStatsTable({ goalies }: { goalies: MatchOverviewGoalie[] }) {
  if (goalies.length === 0) {
    return (
      <Panel title="Goalie statistics">
        <EmptyState title="No goalie stats" description="Goalie statistics are not available for this result." />
      </Panel>
    );
  }

  return (
    <Panel title="Goalie statistics">
      <DataTable
        headers={[
          { key: 'goalie', label: 'Goalie' },
          { key: 'team', label: 'Team' },
          { key: 'slot', label: 'Slot' },
          { key: 'sa', label: 'SA' },
          { key: 'sv', label: 'SV' },
          { key: 'ga', label: 'GA' },
          { key: 'sv%', label: 'SV%' },
          { key: 'so', label: 'SO faced' },
          { key: 'toi', label: 'TOI' },
          { key: 'status', label: 'Status' },
        ]}
      >
        {goalies.map((row) => (
          <DataRow key={row.playerId}>
            <Td primary>{formatPlayerName(row.firstName, row.lastName, row.playerId)}</Td>
            <Td>{row.teamName ?? '—'}</Td>
            <Td>{row.lineupSlot ?? '—'}</Td>
            <Td>{row.shotsAgainst}</Td>
            <Td>{row.saves}</Td>
            <Td>{row.goalsAgainst}</Td>
            <Td>{formatPct(row.savePercentage)}</Td>
            <Td>
              {row.shootoutGoalsAllowed}/{row.shootoutAttemptsFaced}
            </Td>
            <Td>{formatSecondsAsClock(row.timeOnIceSeconds)}</Td>
            <Td>
              {row.didNotPlay ? <Badge tone="neutral">DNP</Badge> : <Badge tone="success">Played</Badge>}
            </Td>
          </DataRow>
        ))}
      </DataTable>
    </Panel>
  );
}
