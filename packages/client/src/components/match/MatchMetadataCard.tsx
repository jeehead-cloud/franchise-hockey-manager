import { Badge } from '../ui/Badge';
import { Panel } from '../ui/Panel';
import type { MatchOverviewMetadata } from '../../lib/api';

export function MatchMetadataCard({ metadata }: { metadata: MatchOverviewMetadata }) {
  const mono = { fontFamily: 'var(--font-mono)' as const };
  return (
    <Panel title="Result metadata">
      <div style={{ display: 'grid', gap: 8, font: 'var(--text-body-sm)' }}>
        <div>
          <strong>Engine:</strong> {metadata.engineVersion} ({metadata.simulationMode})
        </div>
        <div>
          <strong>Seed:</strong> <span style={mono}>{metadata.randomSeed}</span>
        </div>
        <div>
          <strong>Input fingerprint:</strong>{' '}
          <span style={mono}>{metadata.inputFingerprint}</span>
        </div>
        <div>
          <strong>Trace hash:</strong> <span style={mono}>{metadata.traceHash}</span>
        </div>
        <div>
          <strong>Balance:</strong>{' '}
          {metadata.balance.presetName ?? 'Preset'} v{metadata.balance.versionNumber}
          {metadata.balance.schemaVersion != null
            ? ` · schema ${metadata.balance.schemaVersion}`
            : ''}{' '}
          · <span style={mono}>{metadata.balance.configHash.slice(0, 16)}…</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong>Reconciliation:</strong>
          {metadata.reconciliationOk ? (
            <Badge tone="success">OK</Badge>
          ) : (
            <Badge tone="danger">Failed</Badge>
          )}
          <span style={{ color: 'var(--text-tertiary)' }}>{metadata.reconciliationStatus}</span>
        </div>
      </div>
    </Panel>
  );
}
