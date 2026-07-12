import { useRef } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { DataRow, DataTable, Td } from '../ui/DataBrowser';
import { Panel } from '../ui/Panel';
import type { ActiveBalanceSnapshot, BalancePresetSummary } from '../../lib/api';
import { hashPrefix } from './BalanceConfigEditor';

export function BalancePresetsPanel({
  active,
  presets,
  selectedPresetId,
  commissionerEnabled,
  onSelect,
  onDuplicate,
  onRename,
  onReset,
  onImport,
  busy,
}: {
  active: ActiveBalanceSnapshot | null;
  presets: BalancePresetSummary[];
  selectedPresetId: string | null;
  commissionerEnabled: boolean;
  onSelect: (presetId: string) => void;
  onDuplicate: (preset: BalancePresetSummary) => void;
  onRename: (preset: BalancePresetSummary) => void;
  onReset: (preset: BalancePresetSummary) => void;
  onImport: (file: File) => void;
  busy: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <Panel title="Balance presets">
      {active ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 12,
            font: 'var(--text-body-sm)',
            color: 'var(--text-secondary)',
          }}
        >
          <span>
            Active:{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{active.preset.name}</strong> v
            {active.version.versionNumber}
          </span>
          <span>Hash {hashPrefix(active.version.configHash)}</span>
          <span>Schema v{active.version.schemaVersion}</span>
        </div>
      ) : null}

      {commissionerEnabled ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImport(file);
              e.target.value = '';
            }}
          />
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
            Import JSON
          </Button>
        </div>
      ) : null}

      <DataTable
        headers={[
          { key: 'name', label: 'Preset' },
          { key: 'type', label: 'Type' },
          { key: 'latest', label: 'Latest' },
          { key: 'actions', label: '' },
        ]}
      >
        {presets.map((p) => (
          <DataRow key={p.id} selected={p.id === selectedPresetId} onActivate={() => onSelect(p.id)}>
            <Td primary>
              {p.name}
              {p.isActive ? (
                <>
                  {' '}
                  <Badge tone="success">Active</Badge>
                </>
              ) : null}
            </Td>
            <Td>
              <Badge tone={p.isSystem ? 'info' : 'neutral'}>{p.isSystem ? 'System' : 'Custom'}</Badge>
            </Td>
            <Td>
              {p.latestVersion
                ? `v${p.latestVersion.versionNumber} · ${hashPrefix(p.latestVersion.configHash)}`
                : '—'}
            </Td>
            <Td>
              {commissionerEnabled ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Button
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicate(p);
                    }}
                    disabled={busy}
                  >
                    Duplicate
                  </Button>
                  {!p.isSystem ? (
                    <Button
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRename(p);
                      }}
                      disabled={busy}
                    >
                      Rename
                    </Button>
                  ) : null}
                  {p.isSystem ? (
                    <Button
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onReset(p);
                      }}
                      disabled={busy}
                    >
                      Reset
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </Td>
          </DataRow>
        ))}
      </DataTable>
    </Panel>
  );
}
