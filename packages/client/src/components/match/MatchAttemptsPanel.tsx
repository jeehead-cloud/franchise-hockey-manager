import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { DataRow, DataTable, Pagination, Td } from '../ui/DataBrowser';
import { EmptyState, LoadingState } from '../ui/EmptyState';
import { Panel } from '../ui/Panel';
import { formatDecisionLabel, formatDisplayScore } from '../../lib/match-format';
import type { MatchAttemptItem, Paginated } from '../../lib/api';

export function MatchAttemptsPanel({
  attempts,
  currentResultId,
  selectedResultId,
  loading,
  onSelectResult,
  onViewCurrent,
  onPageChange,
}: {
  attempts: Paginated<MatchAttemptItem> | null;
  currentResultId: string | null;
  selectedResultId: string | null;
  loading?: boolean;
  onSelectResult: (resultId: string) => void;
  onViewCurrent?: () => void;
  onPageChange: (page: number) => void;
}) {
  return (
    <Panel title="Attempt history">
      {loading && !attempts ? <LoadingState label="Loading attempts…" /> : null}
      {attempts && attempts.items.length === 0 ? (
        <EmptyState title="No attempts" description="No simulation attempts recorded for this match." />
      ) : null}
      {attempts && attempts.items.length > 0 ? (
        <>
          <DataTable
            headers={[
              { key: 'attempt', label: '#' },
              { key: 'status', label: 'Status' },
              { key: 'score', label: 'Score' },
              { key: 'decision', label: 'Decision' },
              { key: 'seed', label: 'Seed' },
              { key: 'completed', label: 'Completed' },
            ]}
          >
            {attempts.items.map((row) => {
              const isCurrent = row.id === currentResultId;
              const isSelected = row.id === selectedResultId || (!selectedResultId && isCurrent);
              return (
                <DataRow key={row.id} selected={isSelected} onActivate={() => onSelectResult(row.id)}>
                  <Td primary>
                    #{row.attemptNumber}
                    {isCurrent ? (
                      <span style={{ marginLeft: 6 }}>
                        <Badge tone="success">Current</Badge>
                      </span>
                    ) : (
                      <span style={{ marginLeft: 6 }}>
                        <Badge tone="warning">Superseded</Badge>
                      </span>
                    )}
                  </Td>
                  <Td>{row.status}</Td>
                  <Td>{formatDisplayScore(row.homeScore, row.awayScore, row.decisionType)}</Td>
                  <Td>{formatDecisionLabel(row.decisionType)}</Td>
                  <Td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {row.randomSeed.slice(0, 12)}
                    </span>
                  </Td>
                  <Td>{row.completedAt ? new Date(row.completedAt).toLocaleString() : '—'}</Td>
                </DataRow>
              );
            })}
          </DataTable>
          <Pagination
            page={attempts.page}
            totalPages={attempts.totalPages}
            total={attempts.total}
            onPage={onPageChange}
          />
          <p style={{ margin: '8px 0 0', font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
            Select an attempt to view that historical result.
            {selectedResultId && selectedResultId !== currentResultId && onViewCurrent ? (
              <>
                {' '}
                <Button variant="ghost" size="sm" onClick={onViewCurrent}>
                  View current
                </Button>
              </>
            ) : null}
          </p>
        </>
      ) : null}
    </Panel>
  );
}
