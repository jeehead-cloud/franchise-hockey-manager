import { Hexagon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Panel } from '../components/ui/Panel';
import { useServerHealth } from '../lib/useServerHealth';
import { ConnectionStatus } from '../components/ui/ConnectionStatus';

/** Setup sits outside the main shell (empty-database / first-run concept). */
export function SetupPage() {
  const { state, detail } = useServerHealth();

  return (
    <div
      style={{
        minHeight: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
        background: 'var(--surface-app)',
      }}
    >
      <Panel width="min(440px, 100%)" style={{ boxShadow: 'var(--shadow-md)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'stretch' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Hexagon size={28} color="var(--accent-primary)" aria-hidden />
            <div>
              <div style={{ font: 'var(--text-heading-md)' }}>Setup World</div>
              <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
                Franchise Hockey Manager
              </div>
            </div>
          </div>

          <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
            Initialize a hockey world from a prepared data snapshot before continuing. World
            import is not implemented in F1 — this screen validates the empty-database entry point
            from the approved designs.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
              API connection
            </span>
            <ConnectionStatus state={state} detail={detail} />
          </div>

          <Button disabled>Initialize Hockey World</Button>

          <Link
            to="/world"
            style={{
              textAlign: 'center',
              font: 'var(--text-body-sm)',
              color: 'var(--text-link)',
            }}
          >
            Continue to application shell
          </Link>
        </div>
      </Panel>
    </div>
  );
}
