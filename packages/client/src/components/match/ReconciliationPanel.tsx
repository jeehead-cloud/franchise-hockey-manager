import { Badge } from '../ui/Badge';
import { DataRow, DataTable, Td } from '../ui/DataBrowser';
import { Panel } from '../ui/Panel';
import type { MatchDiagnostics, MatchDiagnosticsCheck, MatchOverviewMetadata } from '../../lib/api';

function ChecksTable({ checks }: { checks: MatchDiagnosticsCheck[] }) {
  if (checks.length === 0) {
    return (
      <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
        No reconciliation checks available.
      </p>
    );
  }
  return (
    <DataTable
      headers={[
        { key: 'ok', label: 'OK' },
        { key: 'code', label: 'Code' },
        { key: 'message', label: 'Message' },
      ]}
    >
      {checks.map((c) => (
        <DataRow key={c.code}>
          <Td>{c.ok ? <Badge tone="success">Yes</Badge> : <Badge tone="danger">No</Badge>}</Td>
          <Td primary>{c.code}</Td>
          <Td>{c.message}</Td>
        </DataRow>
      ))}
    </DataTable>
  );
}

export function ReconciliationPanel({
  metadata,
  diagnostics,
}: {
  metadata: MatchOverviewMetadata;
  diagnostics?: MatchDiagnostics | null;
}) {
  const overallOk = diagnostics?.reconciliation.overallOk ?? metadata.reconciliationOk;
  const lightweight = diagnostics?.reconciliation.lightweightChecks ?? [];
  const stored = diagnostics?.reconciliation.stored?.checks ?? [];

  return (
    <Panel title="Reconciliation">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {overallOk ? <Badge tone="success">OK</Badge> : <Badge tone="danger">Issues</Badge>}
        <span style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
          Status: {diagnostics?.reconciliation.status ?? metadata.reconciliationStatus}
        </span>
      </div>
      {lightweight.length > 0 ? (
        <>
          <h4 style={{ margin: '0 0 8px', font: 'var(--text-label-wide)', color: 'var(--text-tertiary)' }}>
            Lightweight checks
          </h4>
          <ChecksTable checks={lightweight} />
        </>
      ) : (
        <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
          Overview reports reconciliation as {metadata.reconciliationOk ? 'OK' : 'failed'}. Open
          Diagnostics (Commissioner) for detailed checks.
        </p>
      )}
      {stored.length > 0 ? (
        <>
          <h4
            style={{
              margin: '16px 0 8px',
              font: 'var(--text-label-wide)',
              color: 'var(--text-tertiary)',
            }}
          >
            Stored engine checks
          </h4>
          <ChecksTable checks={stored} />
        </>
      ) : null}
    </Panel>
  );
}
