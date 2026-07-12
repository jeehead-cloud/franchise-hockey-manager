import { PlaceholderPage } from '../components/layout/PlaceholderPage';
import { Panel } from '../components/ui/Panel';

export function CompetitionsPage() {
  return (
    <PlaceholderPage
      title="Competitions"
      purpose="League schedules, standings, playoffs, and national tournaments."
      tabs={[
        { value: 'active', label: 'Active' },
        { value: 'upcoming', label: 'Upcoming' },
        { value: 'completed', label: 'Completed' },
      ]}
    >
      <Panel title="Table shell">
        <div
          style={{
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', font: 'var(--text-body-sm)' }}>
            <thead>
              <tr style={{ background: 'var(--surface-panel-raised)', textAlign: 'left' }}>
                {['Competition', 'Type', 'Stage', 'Status'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '10px 12px',
                      font: 'var(--text-label-wide)',
                      letterSpacing: 'var(--text-tracking-wide)',
                      textTransform: 'uppercase',
                      color: 'var(--text-tertiary)',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td
                  colSpan={4}
                  style={{
                    padding: 16,
                    color: 'var(--text-tertiary)',
                    textAlign: 'center',
                  }}
                >
                  No competitions loaded
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>
    </PlaceholderPage>
  );
}
