import { DataRow, DataTable, Td } from '../ui/DataBrowser';
import { Panel } from '../ui/Panel';
import { formatPeriodLabel } from '../../lib/match-format';
import type { MatchOverviewPeriodScore } from '../../lib/api';

export function PeriodScoreTable({
  periodScores,
  homeName,
  awayName,
  finalHome,
  finalAway,
}: {
  periodScores: MatchOverviewPeriodScore[];
  homeName: string;
  awayName: string;
  finalHome: number;
  finalAway: number;
}) {
  if (periodScores.length === 0) {
    return (
      <Panel title="Period scores">
        <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
          No period scoring breakdown available.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Period scores">
      <DataTable
        headers={[
          { key: 'period', label: 'Period' },
          { key: 'away', label: awayName },
          { key: 'home', label: homeName },
        ]}
      >
        {periodScores.map((row) => (
          <DataRow key={row.period}>
            <Td primary>{formatPeriodLabel(row.period)}</Td>
            <Td>{row.away}</Td>
            <Td>{row.home}</Td>
          </DataRow>
        ))}
        <DataRow>
          <Td primary>Final</Td>
          <Td>{finalAway}</Td>
          <Td>{finalHome}</Td>
        </DataRow>
      </DataTable>
    </Panel>
  );
}
