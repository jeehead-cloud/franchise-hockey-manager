import { DataRow, DataTable, Td } from '../ui/DataBrowser';
import { EmptyState } from '../ui/EmptyState';
import { Panel } from '../ui/Panel';
import type { LabBatchResult } from '../../lib/api';

export function ScoreDistributionChart({ result }: { result: LabBatchResult }) {
  const histogram = result.aggregate.scoring.combinedGoalsHistogram;
  const frequencies = result.aggregate.scoring.exactScoreFrequencies.slice(0, 20);
  const maxCount = Math.max(1, ...histogram.map((b) => b.count));

  return (
    <Panel title="Score distribution">
      {histogram.length === 0 ? (
        <EmptyState title="No histogram" description="Score distribution is not available for this run." />
      ) : (
        <>
          <div
            role="img"
            aria-label={histogram.map((b) => `${b.label}: ${b.count}`).join('; ')}
            style={{ display: 'flex', alignItems: 'flex-end', gap: 8, minHeight: 140, paddingTop: 8 }}
          >
            {histogram.map((bucket) => {
              const height = Math.max(4, Math.round((bucket.count / maxCount) * 120));
              return (
                <div
                  key={bucket.label}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    minWidth: 0,
                  }}
                >
                  <span style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
                    {bucket.count}
                  </span>
                  <svg width="100%" height={height} viewBox={`0 0 40 ${height}`} preserveAspectRatio="none" aria-hidden>
                    <rect
                      x="4"
                      y="0"
                      width="32"
                      height={height}
                      rx="3"
                      fill="var(--accent-primary)"
                      opacity={0.85}
                    />
                  </svg>
                  <span
                    style={{
                      font: 'var(--text-label-wide)',
                      letterSpacing: 'var(--text-tracking-wide)',
                      textTransform: 'uppercase',
                      color: 'var(--text-tertiary)',
                      textAlign: 'center',
                    }}
                  >
                    {bucket.label}
                  </span>
                </div>
              );
            })}
          </div>
          <p style={{ margin: '12px 0 0', font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
            Combined goals histogram · One-goal games:{' '}
            {result.aggregate.scoring.oneGoalGames} · Shutouts:{' '}
            {result.aggregate.scoring.shutouts} · High-scoring:{' '}
            {result.aggregate.scoring.highScoringGames}
          </p>
        </>
      )}

      {frequencies.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <div
            style={{
              marginBottom: 8,
              font: 'var(--text-label-wide)',
              letterSpacing: 'var(--text-tracking-wide)',
              textTransform: 'uppercase',
              color: 'var(--text-tertiary)',
            }}
          >
            Exact scores (top {frequencies.length})
          </div>
          <DataTable
            headers={[
              { key: 'score', label: 'Score (A–B)' },
              { key: 'count', label: 'Count' },
            ]}
          >
            {frequencies.map((row) => (
              <DataRow key={`${row.teamAScore}-${row.teamBScore}`}>
                <Td primary>
                  {row.teamAScore}–{row.teamBScore}
                </Td>
                <Td>{row.count}</Td>
              </DataRow>
            ))}
          </DataTable>
        </div>
      ) : null}
    </Panel>
  );
}
