import { Badge } from '../ui/Badge';
import { DataRow, DataTable, Td } from '../ui/DataBrowser';
import { EmptyState } from '../ui/EmptyState';
import { Panel } from '../ui/Panel';
import type { LabAnomaly } from '../../lib/api';

function toneForSeverity(severity: LabAnomaly['severity']): 'info' | 'warning' | 'danger' | 'neutral' {
  switch (severity) {
    case 'INFO':
      return 'info';
    case 'WARNING':
      return 'warning';
    case 'ERROR':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function AnomalyPanel({ anomalies }: { anomalies: LabAnomaly[] }) {
  return (
    <Panel title="Anomalies">
      <p style={{ margin: '0 0 10px', font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
        Development guardrails only — not NHL-calibrated realism claims.
      </p>
      {anomalies.length === 0 ? (
        <EmptyState title="No anomalies" description="No analytical warnings were raised for this batch." />
      ) : (
        <DataTable
          headers={[
            { key: 'sev', label: 'Severity' },
            { key: 'code', label: 'Code' },
            { key: 'message', label: 'Message' },
            { key: 'metric', label: 'Metric' },
            { key: 'obs', label: 'Observed' },
            { key: 'guard', label: 'Guardrail' },
          ]}
        >
          {anomalies.map((a) => (
            <DataRow key={`${a.code}-${a.metric}-${String(a.observedValue)}`}>
              <Td>
                <Badge tone={toneForSeverity(a.severity)}>{a.severity}</Badge>
              </Td>
              <Td primary>{a.code}</Td>
              <Td>{a.message}</Td>
              <Td>{a.metric}</Td>
              <Td>{a.observedValue == null ? '—' : String(a.observedValue)}</Td>
              <Td>{a.guardrail}</Td>
            </DataRow>
          ))}
        </DataTable>
      )}
    </Panel>
  );
}
