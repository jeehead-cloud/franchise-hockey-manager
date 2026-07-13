import { DataRow, DataTable, Td } from '../ui/DataBrowser';
import { EmptyState } from '../ui/EmptyState';
import { Panel } from '../ui/Panel';
import { formatPct } from '../../lib/match-format';
import type { LabComparisonResult } from '../../lib/api';

function formatDelta(metric: string, value: number): string {
  const sign = value > 0 ? '+' : '';
  if (
    metric.toLowerCase().includes('rate') ||
    metric.toLowerCase().includes('percentage') ||
    metric.toLowerCase().includes('share') ||
    metric.endsWith('%')
  ) {
    return `${sign}${formatPct(value)}`;
  }
  return `${sign}${value.toFixed(3)}`;
}

export function BalanceComparisonPanel({ comparison }: { comparison: LabComparisonResult | null | undefined }) {
  if (!comparison) {
    return (
      <Panel title="Balance comparison">
        <EmptyState
          title="No comparison"
          description="Choose a comparison balance version and re-run to see paired deltas."
        />
      </Panel>
    );
  }

  const { deltas, gamesCompared, pairedOutcomeChanges, baseline, comparison: cmpAgg } = comparison;

  return (
    <Panel title="Balance comparison">
      <p style={{ margin: '0 0 10px', font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
        Paired game-by-game comparison · {gamesCompared} games · {pairedOutcomeChanges} outcome changes ·
        Baseline win rate {formatPct(baseline.outcomes.teamAWinRate)} vs comparison{' '}
        {formatPct(cmpAgg.outcomes.teamAWinRate)}
      </p>
      {deltas.length === 0 ? (
        <EmptyState title="No deltas" description="Baseline and comparison produced identical metric values." />
      ) : (
        <DataTable
          headers={[
            { key: 'metric', label: 'Metric' },
            { key: 'base', label: 'Baseline' },
            { key: 'cmp', label: 'Comparison' },
            { key: 'delta', label: 'Delta' },
          ]}
        >
          {deltas.map((d) => (
            <DataRow key={d.metric}>
              <Td primary>{d.metric}</Td>
              <Td>{Number.isFinite(d.baseline) ? d.baseline.toFixed(4) : String(d.baseline)}</Td>
              <Td>{Number.isFinite(d.comparison) ? d.comparison.toFixed(4) : String(d.comparison)}</Td>
              <Td>{formatDelta(d.metric, d.delta)}</Td>
            </DataRow>
          ))}
        </DataTable>
      )}
    </Panel>
  );
}
