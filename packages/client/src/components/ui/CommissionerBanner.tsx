import { Link } from 'react-router-dom';
import { Badge } from './Badge';
import { Button } from './Button';
import { useCommissioner } from '../../lib/commissioner';

export function CommissionerBanner() {
  const { enabled, tryDisable } = useCommissioner();
  if (!enabled) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
        padding: '10px 16px',
        background: 'var(--accent-warning-muted, #fff4e5)',
        borderBottom: '2px solid var(--accent-warning, #d97706)',
        color: 'var(--text-primary)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Badge tone="warning">Commissioner Mode</Badge>
        <span style={{ font: 'var(--text-body-sm)' }}>
          Edits persist to the current world and are audited. Not normal gameplay.
        </span>
        <Link to="/settings" style={{ font: 'var(--text-body-sm)', color: 'var(--text-link)' }}>
          Settings
        </Link>
      </div>
      <Button variant="secondary" size="sm" onClick={() => tryDisable()}>
        Disable
      </Button>
    </div>
  );
}
