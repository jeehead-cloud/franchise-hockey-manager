import { useEffect, useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Panel } from '../components/ui/Panel';
import { getCommissionerStatus, type CommissionerStatus } from '../lib/api';
import { useCommissioner } from '../lib/commissioner';

export function SettingsPage() {
  const { enabled, requestEnable, tryDisable } = useCommissioner();
  const [status, setStatus] = useState<CommissionerStatus | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getCommissionerStatus(controller.signal)
      .then(setStatus)
      .catch(() => setStatus(null));
    return () => controller.abort();
  }, []);

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Settings"
        subtitle="Local sandbox utilities. Authentication and production authorization are not implemented."
      />

      <Panel title="Commissioner Mode">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              Current state:
            </span>
            <Badge tone={enabled ? 'warning' : 'neutral'}>
              {enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
          <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
            Commissioner Mode is a local administrative sandbox for correcting players, coaches, and team setup. It defaults
            off on every page load, is not persisted, and is not a user-account permission system.
            Write requests send <code>X-FHM-Commissioner-Mode: enabled</code> — a safety boundary,
            not authentication.
          </p>
          <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
            Server writes:{' '}
            {status
              ? status.writesEnabled
                ? 'enabled'
                : 'disabled (FHM_COMMISSIONER_WRITES_ENABLED)'
              : 'unknown'}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            {enabled ? (
              <Button variant="secondary" onClick={() => tryDisable()}>
                Disable Commissioner Mode
              </Button>
            ) : (
              <Button variant="danger" onClick={requestEnable}>
                Enable Commissioner Mode
              </Button>
            )}
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
            <li>Edit players, attributes, profile, potential, and team assignment</li>
            <li>Derived ratings and roles recalculate on the server</li>
            <li>Every successful edit creates an immutable audit record</li>
            <li>Edit coaches, tactical style, head coach assignment, and roster status</li>
            <li>Lineups, chemistry, and transactions remain out of scope</li>
          </ul>
        </div>
      </Panel>
    </div>
  );
}
