import { PlaceholderPage } from '../components/layout/PlaceholderPage';
import { Panel } from '../components/ui/Panel';

export function SimulationLabPage() {
  return (
    <PlaceholderPage
      title="Simulation Lab"
      purpose="Sandbox for tuning match and season simulation without advancing the main world."
    >
      <Panel title="Lab controls">
        <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
          Match simulation, chemistry experiments, and balance tooling are deferred past F1. This
          route exists so the shell navigation matches the approved screen design.
        </p>
      </Panel>
    </PlaceholderPage>
  );
}
