import { useCallback, useEffect, useState } from 'react';
import { Database, Hexagon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Panel } from '../components/ui/Panel';
import {
  fetchSetupPreview,
  fetchSetupStatus,
  postSetupInitialize,
  type SetupPreview,
  type SetupStatus,
} from '../lib/api';

type UiPhase =
  | 'loading'
  | 'ready'
  | 'previewing'
  | 'confirm'
  | 'initializing'
  | 'success'
  | 'already'
  | 'blocked'
  | 'invalid'
  | 'unavailable'
  | 'error';

export function SetupPage() {
  const [phase, setPhase] = useState<UiPhase>('loading');
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [preview, setPreview] = useState<SetupPreview | null>(null);
  const [resultSummary, setResultSummary] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setPhase('loading');
    setErrorMessage(null);
    try {
      const next = await fetchSetupStatus();
      setStatus(next);
      if (next.initialized) {
        setPhase('already');
        return;
      }
      if (!next.dataset?.available) {
        setPhase('unavailable');
        return;
      }
      if (!next.canInitialize) {
        setPhase('blocked');
        return;
      }
      setPhase('ready');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load setup status');
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function runPreview() {
    setPhase('previewing');
    setErrorMessage(null);
    try {
      const next = await fetchSetupPreview();
      setPreview(next);
      if (!next.valid) {
        setPhase('invalid');
        return;
      }
      setPhase('confirm');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Preview failed');
      setPhase('error');
    }
  }

  async function runInitialize() {
    const ok = window.confirm(
      [
        'Initialize the current database from the configured local dataset?',
        '',
        'This is a one-time operation. Duplicate initialization is blocked.',
        'This is not an ongoing sync with real-world sources.',
        'This action does not reset or delete an existing world.',
      ].join('\n'),
    );
    if (!ok) {
      setPhase(preview?.valid ? 'confirm' : 'ready');
      return;
    }

    setPhase('initializing');
    setErrorMessage(null);
    try {
      const result = await postSetupInitialize();
      setResultSummary(
        `Created ${result.created.teams} teams, ${result.created.players} players, ${result.created.competitions} competitions.`,
      );
      setPhase('success');
      const refreshed = await fetchSetupStatus();
      setStatus(refreshed);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Initialization failed';
      if (message.includes('409') || /already initialized/i.test(message)) {
        setPhase('already');
        await loadStatus();
        return;
      }
      setErrorMessage(message);
      setPhase('error');
    }
  }

  const fictional = status?.dataset?.fictional || preview?.dataset.fictional;

  return (
    <div
      style={{
        minHeight: '100%',
        display: 'flex',
        justifyContent: 'center',
        padding: '40px 20px',
        background: 'var(--surface-app)',
      }}
    >
      <div
        style={{
          maxWidth: 760,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Database size={34} color="var(--accent-primary)" style={{ margin: '0 auto' }} aria-hidden />
          <div style={{ font: 'var(--text-heading-lg)', color: 'var(--text-primary)' }}>
            {phase === 'success'
              ? 'World initialized'
              : phase === 'already'
                ? 'World already initialized'
                : 'Setup World'}
          </div>
          <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
            Initialize one hockey world from a prepared local data snapshot. After import, the
            simulated universe evolves independently of real-world sources.
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
            {fictional ? <Badge tone="warning">Development fixture</Badge> : null}
            {fictional ? <Badge tone="warning">Fictional data</Badge> : null}
            {fictional ? <Badge tone="neutral">Not the final real-world dataset</Badge> : null}
          </div>
        </div>

        {phase === 'loading' || phase === 'previewing' || phase === 'initializing' ? (
          <Panel title="Status">
            <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              {phase === 'loading' && 'Loading setup status…'}
              {phase === 'previewing' && 'Validating dataset preview…'}
              {phase === 'initializing' && 'Initializing world (one transaction)…'}
            </p>
          </Panel>
        ) : null}

        {status?.dataset ? (
          <Panel title="Dataset">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, font: 'var(--text-body-sm)' }}>
              <Row label="Name" value={status.dataset.name} />
              <Row label="ID" value={status.dataset.id} />
              <Row label="Source" value={status.dataset.sourceName} />
              <Row label="Source updated" value={status.dataset.sourceUpdatedAt} />
              <Row label="Schema version" value={String(status.dataset.schemaVersion)} />
            </div>
          </Panel>
        ) : null}

        {status ? (
          <Panel title="Database counts">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 8,
                font: 'var(--text-body-sm)',
              }}
            >
              {Object.entries(status.counts).map(([key, value]) => (
                <div key={key} style={{ color: 'var(--text-secondary)' }}>
                  <div style={{ color: 'var(--text-tertiary)', font: 'var(--text-label)' }}>{key}</div>
                  <div style={{ color: 'var(--text-primary)' }}>{value}</div>
                </div>
              ))}
            </div>
          </Panel>
        ) : null}

        {preview ? (
          <Panel title="Validation report">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Badge tone={preview.valid ? 'success' : 'danger'}>
                  {preview.valid ? 'Valid' : 'Blocking errors'}
                </Badge>
                {preview.warnings.length > 0 ? (
                  <Badge tone="warning">{preview.warnings.length} warnings</Badge>
                ) : null}
              </div>
              {preview.errors.map((issue) => (
                <IssueLine key={`e-${issue.code}-${issue.message}`} tone="danger" text={issue.message} />
              ))}
              {preview.warnings.map((issue) => (
                <IssueLine key={`w-${issue.code}-${issue.message}`} tone="warning" text={issue.message} />
              ))}
              {preview.valid && preview.errors.length === 0 && preview.warnings.length === 0 ? (
                <IssueLine tone="success" text="Dataset structure and cross-file references look good." />
              ) : null}
              {preview.counts ? (
                <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
                  Preview counts: {preview.counts.countries} countries, {preview.counts.teams} teams,{' '}
                  {preview.counts.players} players
                </div>
              ) : null}
            </div>
          </Panel>
        ) : null}

        {phase === 'ready' || phase === 'confirm' ? (
          <Panel title="Initialization steps">
            <ol style={{ margin: 0, paddingLeft: 18, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              <li>Locate configured local dataset</li>
              <li>Validate structure and cross-file references</li>
              <li>Confirm empty-world gate</li>
              <li>Write world in one database transaction</li>
              <li>Record initialization metadata (one-time)</li>
            </ol>
          </Panel>
        ) : null}

        {phase === 'unavailable' ? (
          <Panel title="Dataset unavailable">
            <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              {status?.datasetError ?? 'Configured local dataset is missing or unreadable.'}
            </p>
          </Panel>
        ) : null}

        {phase === 'blocked' ? (
          <Panel title="Cannot initialize">
            <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              {status?.blockReason ?? 'Database is not empty.'}
            </p>
          </Panel>
        ) : null}

        {phase === 'success' ? (
          <Panel title="Result">
            <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              {resultSummary}
            </p>
          </Panel>
        ) : null}

        {phase === 'already' ? (
          <Panel title="Already initialized">
            <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              Dataset ID: {status?.datasetId ?? 'unknown'}
              {status?.initializedAt ? ` · ${status.initializedAt}` : ''}
            </p>
          </Panel>
        ) : null}

        {errorMessage ? (
          <Panel title="Error">
            <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--accent-danger)' }}>
              {errorMessage}
            </p>
          </Panel>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(phase === 'ready' || phase === 'invalid') && (
            <Button size="lg" onClick={() => void runPreview()} style={{ width: '100%', height: 42 }}>
              Validate &amp; preview dataset
            </Button>
          )}
          {phase === 'confirm' && (
            <Button size="lg" onClick={() => void runInitialize()} style={{ width: '100%', height: 42 }}>
              Initialize Hockey World
            </Button>
          )}
          {(phase === 'success' || phase === 'already') && (
            <Link to="/world" style={{ textDecoration: 'none' }}>
              <Button size="lg" style={{ width: '100%', height: 42 }}>
                Open World
              </Button>
            </Link>
          )}
          {(phase === 'error' || phase === 'unavailable' || phase === 'blocked') && (
            <Button variant="secondary" onClick={() => void loadStatus()} style={{ width: '100%' }}>
              Retry status
            </Button>
          )}
          <Link
            to="/world"
            style={{
              textAlign: 'center',
              font: 'var(--text-body-sm)',
              color: 'var(--text-link)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Hexagon size={14} aria-hidden />
            Back to World
          </Link>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function IssueLine({
  text,
  tone,
}: {
  text: string;
  tone: 'success' | 'warning' | 'danger';
}) {
  const color =
    tone === 'success'
      ? 'var(--accent-success)'
      : tone === 'warning'
        ? 'var(--accent-warning)'
        : 'var(--accent-danger)';
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', font: 'var(--text-body-sm)' }}>
      <span style={{ color, marginTop: 2 }}>●</span>
      <span style={{ color: 'var(--text-secondary)' }}>{text}</span>
    </div>
  );
}
