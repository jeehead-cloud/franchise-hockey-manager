import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { DataRow, DataTable, Td } from '../ui/DataBrowser';
import { Panel } from '../ui/Panel';
import type { BalancePresetVersionSummary } from '../../lib/api';
import { hashPrefix } from './BalanceConfigEditor';

export function BalanceVersionHistory({
  presetName,
  versions,
  selectedVersionId,
  commissionerEnabled,
  onSelect,
  onActivate,
  onExport,
  busy,
}: {
  presetName: string | null;
  versions: BalancePresetVersionSummary[];
  selectedVersionId: string | null;
  commissionerEnabled: boolean;
  onSelect: (versionId: string) => void;
  onActivate: (version: BalancePresetVersionSummary) => void;
  onExport: (version: BalancePresetVersionSummary) => void;
  busy: boolean;
}) {
  return (
    <Panel title={presetName ? `Version history · ${presetName}` : 'Version history'}>
      {versions.length === 0 ? (
        <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
          Select a preset to view versions.
        </p>
      ) : (
        <DataTable
          headers={[
            { key: 'ver', label: 'Ver', width: '48px' },
            { key: 'hash', label: 'Hash' },
            { key: 'reason', label: 'Reason' },
            { key: 'created', label: 'Created' },
            { key: 'actions', label: '' },
          ]}
        >
          {versions.map((v) => (
            <DataRow
              key={v.id}
              selected={v.id === selectedVersionId}
              onActivate={() => onSelect(v.id)}
            >
              <Td primary>
                v{v.versionNumber}
                {v.isActive ? (
                  <>
                    {' '}
                    <Badge tone="success">Active</Badge>
                  </>
                ) : null}
              </Td>
              <Td>{hashPrefix(v.configHash)}</Td>
              <Td>{v.changeReason}</Td>
              <Td>{new Date(v.createdAt).toLocaleString()}</Td>
              <Td>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Button
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      onExport(v);
                    }}
                    disabled={busy}
                  >
                    Export
                  </Button>
                  {commissionerEnabled && !v.isActive ? (
                    <Button
                      variant="primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onActivate(v);
                      }}
                      disabled={busy}
                    >
                      Activate
                    </Button>
                  ) : null}
                </div>
              </Td>
            </DataRow>
          ))}
        </DataTable>
      )}
    </Panel>
  );
}
