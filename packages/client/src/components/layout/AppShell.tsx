import { Outlet, useLocation } from 'react-router-dom';
import { useServerHealth } from '../../lib/useServerHealth';
import { CommissionerBanner } from '../ui/CommissionerBanner';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { MAIN_NAV, Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

function titleForPath(pathname: string): string {
  const match = MAIN_NAV.find((n) => pathname === n.to || pathname.startsWith(`${n.to}/`));
  return match?.label ?? 'Franchise Hockey Manager';
}

export function AppShell() {
  const location = useLocation();
  const { state, detail } = useServerHealth();

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        background: 'var(--surface-app)',
      }}
    >
      <Sidebar connectionState={state} connectionDetail={detail} />
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        <TopBar title={titleForPath(location.pathname)} />
        <CommissionerBanner />
        <main style={{ flex: 1, overflow: 'auto' }}>
          {/* ErrorBoundary keeps a render throw in any page from blanking the
              whole app and resetting global in-memory state (e.g. Commissioner
              Mode). The shell, sidebar, and banner stay mounted. */}
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
