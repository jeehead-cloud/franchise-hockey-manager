import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Field, SelectInput, TextInput } from '../components/ui/DataBrowser';
import { ErrorState, LoadingState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import {
  createMatch,
  getActiveBalance,
  getAllTeams,
  simulateMatch,
  type ActiveBalanceSnapshot,
  type TeamListItem,
} from '../lib/api';

function readinessBadge(status: TeamListItem['readinessStatus']) {
  switch (status) {
    case 'READY':
      return <Badge tone="success">Ready</Badge>;
    case 'WARNING':
      return <Badge tone="warning">Warning</Badge>;
    case 'NOT_READY':
      return <Badge tone="danger">Not ready</Badge>;
    default:
      return <Badge tone="neutral">Unknown</Badge>;
  }
}

export function NewMatchPage() {
  const navigate = useNavigate();
  const [teams, setTeams] = useState<TeamListItem[]>([]);
  const [balance, setBalance] = useState<ActiveBalanceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamId, setAwayTeamId] = useState('');
  const [seed, setSeed] = useState('');
  const [matchId, setMatchId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    Promise.all([
      getAllTeams({ sort: 'name', direction: 'asc' }, controller.signal),
      getActiveBalance(controller.signal),
    ])
      .then(([teamsRes, balanceRes]) => {
        setTeams(teamsRes);
        setBalance(balanceRes.item);
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load setup data');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const homeTeam = teams.find((t) => t.id === homeTeamId);
  const awayTeam = teams.find((t) => t.id === awayTeamId);

  const teamsReady = useMemo(() => {
    if (!homeTeam || !awayTeam || homeTeamId === awayTeamId) return false;
    return homeTeam.readinessStatus === 'READY' && awayTeam.readinessStatus === 'READY';
  }, [homeTeam, awayTeam, homeTeamId, awayTeamId]);

  const createPrepared = useCallback(async () => {
    if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId) {
      setActionError('Select two different teams');
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const res = await createMatch({ homeTeamId, awayTeamId });
      setMatchId(res.item.id);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to create match');
    } finally {
      setBusy(false);
    }
  }, [homeTeamId, awayTeamId]);

  const runSimulation = useCallback(async () => {
    if (!matchId) {
      setActionError('Create a prepared match first');
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await simulateMatch(matchId, seed.trim() ? { seed: seed.trim() } : {});
      navigate(`/matches/${matchId}`);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Simulation failed');
    } finally {
      setBusy(false);
    }
  }, [matchId, seed, navigate]);

  if (loading) return <LoadingState label="Loading teams and balance…" />;
  if (error) return <ErrorState description={error} />;

  return (
    <div style={{ padding: 20, maxWidth: 720 }}>
      <PageHeader
        title="New match"
        subtitle="Create a prepared match, then simulate with the deterministic engine"
        badge="F15"
      />

      <Panel title="Teams">
        <div style={{ display: 'grid', gap: 16 }}>
          <Field label="Home team" htmlFor="home-team">
            <SelectInput id="home-team" value={homeTeamId} onChange={(e) => setHomeTeamId(e.target.value)}>
              <option value="">Select home team…</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id} disabled={team.id === awayTeamId}>
                  {team.name}
                </option>
              ))}
            </SelectInput>
            {homeTeam && <div style={{ marginTop: 6 }}>{readinessBadge(homeTeam.readinessStatus)}</div>}
          </Field>

          <Field label="Away team" htmlFor="away-team">
            <SelectInput id="away-team" value={awayTeamId} onChange={(e) => setAwayTeamId(e.target.value)}>
              <option value="">Select away team…</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id} disabled={team.id === homeTeamId}>
                  {team.name}
                </option>
              ))}
            </SelectInput>
            {awayTeam && <div style={{ marginTop: 6 }}>{readinessBadge(awayTeam.readinessStatus)}</div>}
          </Field>
        </div>

        {!teamsReady && homeTeam && awayTeam && homeTeamId !== awayTeamId && (
          <p style={{ marginTop: 12, color: 'var(--status-danger)', font: 'var(--text-body-sm)' }}>
            Both teams must be simulation-ready (valid lineup, coach, roster).
          </p>
        )}
      </Panel>

      <Panel title="Balance & rules" style={{ marginTop: 16 }}>
        {balance ? (
          <div style={{ display: 'grid', gap: 8, font: 'var(--text-body-sm)' }}>
            <div>
              <strong>Active preset:</strong> {balance.preset.name} v{balance.version.versionNumber} (schema{' '}
              {balance.version.schemaVersion})
            </div>
            <div>
              <strong>Config hash:</strong>{' '}
              <span style={{ fontFamily: 'var(--font-mono)' }}>{balance.version.configHash.slice(0, 16)}…</span>
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>
              Default rules: 3×20 regulation, 5-minute 3v3 OT, 3-round shootout with sudden death.
            </div>
          </div>
        ) : (
          <p>No active balance preset found.</p>
        )}
      </Panel>

      <Panel title="Simulation" style={{ marginTop: 16 }}>
        <Field label="Seed (optional)" htmlFor="match-seed">
          <TextInput
            id="match-seed"
            value={seed}
            placeholder="Leave blank for server-generated seed"
            onChange={(e) => setSeed(e.target.value)}
          />
        </Field>
        <p style={{ margin: '8px 0 0', font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
          Same teams, seed, and balance reproduce the exact persisted result.
        </p>
      </Panel>

      {actionError && (
        <p style={{ marginTop: 16, color: 'var(--status-danger)' }} role="alert">
          {actionError}
        </p>
      )}

      <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Button variant="secondary" disabled={busy || !teamsReady} onClick={() => void createPrepared()}>
          {matchId ? 'Prepared match created' : 'Create prepared match'}
        </Button>
        <Button variant="primary" disabled={busy || !matchId} onClick={() => void runSimulation()}>
          Simulate match
        </Button>
        {matchId && (
          <Button variant="ghost" onClick={() => navigate(`/matches/${matchId}`)}>
            Open match record
          </Button>
        )}
      </div>

      {matchId && (
        <p style={{ marginTop: 12, font: 'var(--text-data-sm)', color: 'var(--text-tertiary)' }}>
          Match ID: <span style={{ fontFamily: 'var(--font-mono)' }}>{matchId}</span>
        </p>
      )}
    </div>
  );
}
