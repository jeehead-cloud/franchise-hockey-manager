import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { ErrorState } from '../components/ui/EmptyState';

export function NotFoundPage() {
  return (
    <div style={{ padding: 40, maxWidth: 560, margin: '0 auto' }}>
      <ErrorState
        title="Page not found"
        description="That route is not part of the F1 application shell. Use the sidebar or return to World."
      >
        <div style={{ marginTop: 12 }}>
          <Link to="/world">
            <Button variant="secondary">Back to World</Button>
          </Link>
        </div>
      </ErrorState>
    </div>
  );
}
