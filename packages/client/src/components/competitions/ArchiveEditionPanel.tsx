import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../ui/EmptyState';
import { Panel } from '../ui/Panel';
import {
  archiveCompetitionEdition,
  getArchiveReadiness,
  getEditionArchiveSummary,
  transitionCompetitionEdition,
} from '../../lib/api';

export function ArchiveEditionPanel(props: {
  editionId: string;
  editionStatus: string;
  updatedAt: string;
  reason: string;
  commissionerEnabled: boolean;
  onArchived: () => void;
}) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [readiness, setReadiness] = useState<Awaited<
    ReturnType<typeof getArchiveReadiness>
  >['item'] | null>(null);
  const [archive, setArchive] = useState<Awaited<
    ReturnType<typeof getEditionArchiveSummary>
  >['item'] | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    void Promise.all([
      getArchiveReadiness(props.editionId, ac.signal).catch(() => null),
      getEditionArchiveSummary(props.editionId, ac.signal).catch(() => null),
    ])
      .then(([r, a]) => {
        setReadiness(r?.item ?? null);
        setArchive(a?.item ?? null);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!ac.signal.aborted) setError(err instanceof Error ? err.message : 'Failed');
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [props.editionId, props.editionStatus]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState description={error} />;

  if (props.editionStatus === 'ARCHIVED' && archive) {
    return (
      <Panel title="Competition archive">
        <p style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
          Archived history — read only. Simulation and structural edits are locked.
        </p>
        <p style={{ font: 'var(--text-body-sm)' }}>
          Hash: {archive.archiveHash.slice(0, 16)}… ·{' '}
          <Link to={archive.historyPath}>Open archive</Link>
        </p>
      </Panel>
    );
  }

  if (props.editionStatus !== 'COMPLETED') {
    return (
      <Panel title="Archive">
        <EmptyState
          title="Archive after completion"
          description="Mark the edition COMPLETED when all stages finish, then create an immutable archive."
        />
        {props.commissionerEnabled && props.editionStatus === 'ACTIVE' ? (
          <Button
            disabled={busy}
            onClick={() => {
              if (
                !window.confirm(
                  'Mark this edition COMPLETED? This does not create an archive yet — use Create Archive afterwards.',
                )
              ) {
                return;
              }
              setBusy(true);
              void transitionCompetitionEdition(props.editionId, {
                expectedUpdatedAt: props.updatedAt,
                targetStatus: 'COMPLETED',
                reason: props.reason || 'Complete competition edition',
              })
                .then(() => props.onArchived())
                .catch((err: unknown) => {
                  setError(err instanceof Error ? err.message : 'Complete failed');
                })
                .finally(() => setBusy(false));
            }}
          >
            Mark Completed
          </Button>
        ) : null}
      </Panel>
    );
  }

  return (
    <Panel title="Archive readiness">
      {!readiness ? (
        <EmptyState title="Readiness unavailable" description="" />
      ) : (
        <>
          <p style={{ font: 'var(--text-body-sm)' }}>
            Status: <strong>{readiness.status}</strong>
            {readiness.sourceSnapshotHash
              ? ` · source ${readiness.sourceSnapshotHash.slice(0, 12)}…`
              : ''}
          </p>
          <ul style={{ margin: '8px 0', paddingLeft: 18 }}>
            {readiness.checks.map((c) => (
              <li key={c.id} style={{ font: 'var(--text-body-sm)' }}>
                [{c.status}] {c.message}
              </li>
            ))}
          </ul>
          {readiness.warnings.length > 0 && (
            <p style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              Warnings: {readiness.warnings.join('; ')}
            </p>
          )}
          {props.commissionerEnabled ? (
            <Button
              disabled={busy || readiness.status === 'NOT_READY'}
              onClick={() => {
                if (
                  !window.confirm(
                    [
                      'Create an immutable competition archive?',
                      '',
                      '• Edition becomes ARCHIVED',
                      '• Match simulation/resimulation becomes locked',
                      '• Awards and records will be generated',
                      '• Next-season creation is not part of this action (F20)',
                    ].join('\n'),
                  )
                ) {
                  return;
                }
                setBusy(true);
                void archiveCompetitionEdition(props.editionId, {
                  expectedUpdatedAt: props.updatedAt,
                  reason: props.reason || 'Archive completed competition',
                })
                  .then((res) => {
                    props.onArchived();
                    navigate(res.item.historyPath);
                  })
                  .catch((err: unknown) => {
                    setError(err instanceof Error ? err.message : 'Archive failed');
                  })
                  .finally(() => setBusy(false));
              }}
            >
              Create Archive
            </Button>
          ) : (
            <EmptyState
              title="Commissioner Mode required"
              description="Enable Commissioner Mode to archive this edition."
            />
          )}
        </>
      )}
    </Panel>
  );
}
