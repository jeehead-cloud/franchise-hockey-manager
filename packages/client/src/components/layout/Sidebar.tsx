import {
  BookOpen,
  Flag,
  FlaskConical,
  Globe,
  Hexagon,
  LayoutDashboard,
  Settings,
  Shield,
  Swords,
  Trophy,
  Users,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { ConnectionStatus } from '../ui/ConnectionStatus';
import type { ConnectionState } from '../../lib/api';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

/** Primary shell nav from design/screens (F1 required areas). */
export const MAIN_NAV: NavItem[] = [
  { to: '/world', label: 'World', icon: LayoutDashboard },
  { to: '/competitions', label: 'Competitions', icon: Trophy },
  { to: '/international-tournaments', label: 'International', icon: Globe },
  { to: '/history', label: 'History', icon: BookOpen },
  { to: '/teams', label: 'Teams', icon: Shield },
  { to: '/national-teams', label: 'National Teams', icon: Flag },
  { to: '/matches', label: 'Matches', icon: Swords },
  { to: '/players', label: 'Players', icon: Users },
  { to: '/coaches', label: 'Coaches', icon: UserRound },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/simulation-lab', label: 'Simulation Lab', icon: FlaskConical },
];

export function Sidebar({
  connectionState,
  connectionDetail,
}: {
  connectionState: ConnectionState;
  connectionDetail?: string | null;
}) {
  return (
    <aside
      aria-label="Main navigation"
      style={{
        width: 216,
        flexShrink: 0,
        background: 'var(--surface-panel)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
      }}
      className="max-md:w-[64px]"
    >
      <div
        style={{
          padding: '16px 16px 14px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Hexagon size={20} color="var(--accent-primary)" aria-hidden />
        <span
          style={{
            font: 'var(--text-brand)',
            color: 'var(--text-primary)',
            letterSpacing: 'var(--text-tracking-tight)',
            fontSize: 20,
          }}
          className="max-md:hidden"
        >
          FHM
        </span>
      </div>

      <nav style={{ padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {MAIN_NAV.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 10px',
                borderRadius: 'var(--radius-sm)',
                textDecoration: 'none',
                background: isActive ? 'var(--accent-primary-wash)' : 'transparent',
                color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                font: isActive
                  ? '600 var(--text-size-sm)/1 var(--font-sans)'
                  : 'var(--text-body-sm)',
              })}
            >
              <Icon size={16} aria-hidden />
              <span className="max-md:hidden">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div
        style={{
          marginTop: 'auto',
          padding: '12px 14px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <ConnectionStatus state={connectionState} detail={connectionDetail} />
        <div
          style={{ font: 'var(--text-data-sm)', color: 'var(--text-tertiary)' }}
          className="max-md:hidden"
        >
          Local · F17
        </div>
      </div>
    </aside>
  );
}
