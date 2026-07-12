import { PlaceholderPage } from '../components/layout/PlaceholderPage';

export function PlayersPage() {
  return (
    <PlaceholderPage
      title="Players"
      purpose="Player directory, attributes, roles, and development views."
      tabs={[
        { value: 'skaters', label: 'Skaters' },
        { value: 'goalies', label: 'Goalies' },
        { value: 'prospects', label: 'Prospects' },
      ]}
    />
  );
}
