import { Outlet, useLocation } from 'react-router-dom';
import { useServerHealth } from '../../lib/useServerHealth';
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
        <main style={{ flex: 1, overflow: 'auto' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
