import { useState } from 'react';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import {
  exportSimulationLabRun,
  type LabExportFormat,
} from '../../lib/api';

const FORMATS: Array<{ format: LabExportFormat; label: string }> = [
  { format: 'json', label: 'JSON aggregate' },
  { format: 'games-csv', label: 'Games CSV' },
  { format: 'players-csv', label: 'Players CSV' },
  { format: 'lines-csv', label: 'Lines CSV' },
  { format: 'comparison-csv', label: 'Comparison CSV' },
];

export function LabExportMenu({
  runId,
  disabled,
  hasComparison,
}: {
  runId: string | null;
  disabled?: boolean;
  hasComparison?: boolean;
}) {
  const [busy, setBusy] = useState<LabExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const exportFormat = async (format: LabExportFormat) => {
    if (!runId) return;
    setBusy(format);
    setError(null);
    try {
      await exportSimulationLabRun(runId, format);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel title="Export">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {FORMATS.map(({ format, label }) => {
          const isComparison = format === 'comparison-csv';
          const unavailable = !runId || disabled || (isComparison && !hasComparison);
          return (
            <Button
              key={format}
              variant="secondary"
              size="sm"
              disabled={unavailable || busy != null}
              onClick={() => exportFormat(format)}
            >
              {busy === format ? 'Exporting…' : label}
            </Button>
          );
        })}
      </div>
      {error ? (
        <p style={{ margin: '10px 0 0', font: 'var(--text-body-sm)', color: 'var(--accent-danger)' }}>
          {error}
        </p>
      ) : (
        <p style={{ margin: '10px 0 0', font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
          Downloads completed-run exports. Results are not stored in the browser.
        </p>
      )}
    </Panel>
  );
}
