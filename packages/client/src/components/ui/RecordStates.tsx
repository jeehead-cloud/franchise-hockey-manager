import { Link } from 'react-router-dom';
import { EmptyState } from './EmptyState';
import { Button } from './Button';

export function RecordNotFound({
  entity,
  listHref,
  listLabel,
}: {
  entity: string;
  listHref: string;
  listLabel: string;
}) {
  return (
    <EmptyState
      title={`${entity} not found`}
      description="This record is missing or the URL is invalid."
      action={{
        label: listLabel,
        onClick: () => {
          window.location.assign(listHref);
        },
      }}
    />
  );
}

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      style={{
        font: 'var(--text-body-sm)',
        color: 'var(--text-link)',
        textDecoration: 'none',
        marginBottom: 8,
        display: 'inline-block',
      }}
    >
      ← {label}
    </Link>
  );
}

export function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="secondary" onClick={onClick}>
      Retry
    </Button>
  );
}
