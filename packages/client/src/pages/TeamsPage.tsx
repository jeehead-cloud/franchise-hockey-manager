import { PlaceholderPage } from '../components/layout/PlaceholderPage';

export function TeamsPage() {
  return (
    <PlaceholderPage
      title="Teams"
      purpose="Browse clubs, rosters, coaches, and team identity once world data exists."
      tabs={[
        { value: 'all', label: 'All teams' },
        { value: 'nhl', label: 'NHL' },
        { value: 'minors', label: 'Minors' },
      ]}
    />
  );
}
