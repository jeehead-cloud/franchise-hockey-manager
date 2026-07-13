import { useState, type ReactNode } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { DataRow, DataTable, Pagination, Td } from '../ui/DataBrowser';
import { EmptyState, ErrorState, LoadingState } from '../ui/EmptyState';
import { Panel } from '../ui/Panel';
import { formatPct } from '../../lib/match-format';
import type { MatchAuditItem, MatchDiagnostics, Paginated } from '../../lib/api';

function Kv({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ font: 'var(--text-body-sm)' }}>
      <strong>{label}:</strong> {children}
    </div>
  );
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function MatchDiagnosticsPanel({
  diagnostics,
  audit,
  loading,
  error,
  onExport,
  onAuditPage,
}: {
  diagnostics: MatchDiagnostics | null;
  audit: Paginated<MatchAuditItem> | null;
  loading?: boolean;
  error?: string | null;
  onExport: () => void;
  onAuditPage: (page: number) => void;
}) {
  const [showInput, setShowInput] = useState(false);

  if (loading && !diagnostics) return <LoadingState label="Loading diagnostics…" />;
  if (error) return <ErrorState description={error} />;
  if (!diagnostics) {
    return (
      <EmptyState
        title="Diagnostics unavailable"
        description="Enable Commissioner mode and open a completed result to view diagnostics."
      />
    );
  }

  const shots = diagnostics.shotDiagnostics;
  const special = diagnostics.specialTeams;
  const possession = diagnostics.possessionAndZones;
  const mono = { fontFamily: 'var(--font-mono)' as const };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel
        title="Diagnostics identity"
        actions={
          <Button variant="secondary" size="sm" onClick={onExport}>
            Export JSON
          </Button>
        }
      >
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {diagnostics.isCurrent ? (
            <Badge tone="success">Current</Badge>
          ) : (
            <Badge tone="warning">Superseded</Badge>
          )}
          <Badge tone="neutral">Attempt #{diagnostics.attemptNumber}</Badge>
          {diagnostics.reconciliation.overallOk ? (
            <Badge tone="success">Reconciled</Badge>
          ) : (
            <Badge tone="danger">Reconciliation issues</Badge>
          )}
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          <Kv label="Engine">
            {diagnostics.identity.engineVersion} ({diagnostics.identity.simulationMode})
          </Kv>
          <Kv label="Seed">
            <span style={mono}>{diagnostics.identity.randomSeed}</span>
          </Kv>
          <Kv label="Fingerprint">
            <span style={mono}>{diagnostics.identity.inputFingerprint}</span>
          </Kv>
          <Kv label="Trace">
            <span style={mono}>{diagnostics.identity.traceHash}</span>
          </Kv>
          <Kv label="Balance">
            {diagnostics.identity.balance.presetName ?? 'Preset'} v
            {diagnostics.identity.balance.versionNumber} ·{' '}
            <span style={mono}>{diagnostics.identity.balance.configHash.slice(0, 16)}…</span>
          </Kv>
        </div>
      </Panel>

      <Panel title="Event counts">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', font: 'var(--text-body-sm)' }}>
          <span>Total: {diagnostics.eventCounts.total}</span>
          <span>Public: {diagnostics.eventCounts.public}</span>
          <span>Technical: {diagnostics.eventCounts.technical}</span>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(diagnostics.eventCounts.byType)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 12)
            .map(([type, count]) => (
              <Badge key={type} tone="neutral">
                {type}: {count}
              </Badge>
            ))}
        </div>
      </Panel>

      {shots ? (
        <Panel title="Shot diagnostics">
          <div style={{ display: 'grid', gap: 6, font: 'var(--text-body-sm)' }}>
            <div>
              Attempts {String(shots.shotAttempts ?? '—')} · Blocked {String(shots.shotsBlocked ?? '—')} ·
              Missed {String(shots.shotsMissed ?? '—')} · SOG {String(shots.shotsOnGoal ?? '—')}
            </div>
            <div>
              Saves {String(shots.saves ?? '—')} · Goals {String(shots.goals ?? '—')} · Shooting%{' '}
              {formatPct(num(shots.shootingPercentage))} · Save% {formatPct(num(shots.savePercentage))}
            </div>
            {typeof shots.shotQualityNote === 'string' ? (
              <p style={{ margin: 0, color: 'var(--text-tertiary)' }}>{shots.shotQualityNote}</p>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {special ? (
        <Panel title="Special teams">
          <div style={{ font: 'var(--text-body-sm)' }}>
            Penalties {String(special.penalties ?? '—')} · PP opp{' '}
            {String(special.powerPlayOpportunities ?? '—')} · PP goals{' '}
            {String(special.powerPlayGoals ?? '—')} · PP% {formatPct(num(special.powerPlayPercentage))} ·
            SH goals {String(special.shortHandedGoals ?? '—')} · EV goals{' '}
            {String(special.evenStrengthGoals ?? '—')}
          </div>
        </Panel>
      ) : null}

      {possession ? (
        <Panel title="Possession & zones">
          <pre
            style={{
              margin: 0,
              font: 'var(--text-data-sm)',
              whiteSpace: 'pre-wrap',
              color: 'var(--text-secondary)',
            }}
          >
            {JSON.stringify(
              {
                possessionSecondsByTeam: possession.possessionSecondsByTeam,
                zoneSecondsByTeam: possession.zoneSecondsByTeam,
                faceoffWins: possession.faceoffWins,
                turnoversByTeam: possession.turnoversByTeam,
              },
              null,
              2,
            )}
          </pre>
        </Panel>
      ) : null}

      <Panel
        title="Input summary"
        actions={
          <Button variant="ghost" size="sm" onClick={() => setShowInput((v) => !v)}>
            {showInput ? 'Hide' : 'Show'}
          </Button>
        }
      >
        {showInput && diagnostics.inputSummary ? (
          <pre
            style={{
              margin: 0,
              maxHeight: 360,
              overflow: 'auto',
              font: 'var(--text-data-sm)',
              whiteSpace: 'pre-wrap',
            }}
          >
            {JSON.stringify(diagnostics.inputSummary, null, 2)}
          </pre>
        ) : (
          <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
            Sanitized simulation input is available for Commissioner review.
          </p>
        )}
      </Panel>

      <Panel title="Match audit">
        {audit && audit.items.length === 0 ? (
          <EmptyState title="No audit entries" description="No commissioner audit log for this match yet." />
        ) : null}
        {audit && audit.items.length > 0 ? (
          <>
            <DataTable
              headers={[
                { key: 'when', label: 'When' },
                { key: 'action', label: 'Action' },
                { key: 'reason', label: 'Reason' },
                { key: 'source', label: 'Source' },
              ]}
            >
              {audit.items.map((row) => (
                <DataRow key={row.id}>
                  <Td>{new Date(row.createdAt).toLocaleString()}</Td>
                  <Td primary>{row.action}</Td>
                  <Td>{row.reason}</Td>
                  <Td>{row.source}</Td>
                </DataRow>
              ))}
            </DataTable>
            <Pagination
              page={audit.page}
              totalPages={audit.totalPages}
              total={audit.total}
              onPage={onAuditPage}
            />
          </>
        ) : null}
      </Panel>
    </div>
  );
}
