import { PlaceholderPage } from '../components/layout/PlaceholderPage';

export function SettingsPage() {
  return (
    <PlaceholderPage
      title="Settings"
      purpose="League rules, simulation preferences, backups, and commissioner toggles."
      tabs={[
        { value: 'general', label: 'General' },
        { value: 'simulation', label: 'Simulation' },
        { value: 'database', label: 'Database' },
      ]}
    />
  );
}
