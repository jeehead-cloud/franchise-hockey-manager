import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { DataTable, Field, Td, TextInput } from '../components/ui/DataBrowser';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import { Tabs } from '../components/ui/Tabs';
import { useCommissioner } from '../lib/commissioner';
import {
  autoSelectDraftPick,
  commissionerCancelDraft,
  commissionerCreateDraft,
  commissionerGenerateEligibility,
  commissionerGenerateOrder,
  commissionerMarkDraftReady,
  commissionerRunLottery,
  commissionerSelectPick,
  commissionerStartDraft,
  getCommissionerDraftDiagnostics,
  getDraft,
  getDraftEligibility,
  getDraftLottery,
  getDraftOrder,
  getDraftPicks,
  getDraftResults,
  getDraftStatus,
  getTeamDraftBoard,
  selectDraftPick,
  type DraftBoardEntryDto,
  type DraftEligiblePlayerItem,
  type DraftEventItem,
  type DraftOrderDto,
  type DraftOrderPickItem,
  type DraftStatusDto,
} from '../lib/api';

type DraftTab = 'overview' | 'eligibility' | 'order' | 'lottery' | 'room' | 'results' | 'board' | 'diagnostics';

const TAB_ITEMS: Array<{ value: DraftTab; label: string }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'eligibility', label: 'Eligible Prospects' },
  { value: 'order', label: 'Draft Order' },
  { value: 'lottery', label: 'Lottery' },
  { value: 'room', label: 'Draft Room' },
  { value: 'results', label: 'Results' },
  { value: 'board', label: 'Team Board' },
  { value: 'diagnostics', label: 'Diagnostics' },
];

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  if (status === 'COMPLETED') return 'success';
  if (status === 'IN_PROGRESS') return 'info';
  if (status === 'READY' || status === 'PREPARING') return 'warning';
  if (status === 'CANCELLED') return 'neutral';
  return 'neutral';
}

function LabeledRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, font: 'var(--text-body-sm)' }}>
      <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)' }}>{children}</span>
    </div>
  );
}

export function DraftsLandingPage() {
  const [status, setStatus] = useState<DraftStatusDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getDraftStatus(controller.signal)
      .then((res) => { setStatus(res.item); setError(null); })
      .catch((err: unknown) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Unable to load draft status'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  if (loading) return <LoadingState label="Loading draft status…" />;
  if (error) return <ErrorState description={error} />;
  if (!status) return <EmptyState title="Draft" description="No world season found." />;

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title="Draft" subtitle="Annual amateur entry draft" />
      <Panel title="Current Season">
        {status.draftEvent ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <LabeledRow label="Season">{status.worldSeason.label}</LabeledRow>
            <LabeledRow label="Draft"><Link to={`/drafts/${status.draftEvent.id}`}>{status.draftEvent.name}</Link></LabeledRow>
            <LabeledRow label="Status"><Badge tone={statusTone(status.draftEvent.status)}>{status.draftEvent.status}</Badge></LabeledRow>
            <LabeledRow label="Round / Pick">{status.draftEvent.currentOverallPick} / {status.draftEvent.totalPicks}</LabeledRow>
            <LabeledRow label="Preset">{status.draftEvent.presetName}</LabeledRow>
            {status.latestSelections.length > 0 && (
              <div>
                <div style={{ font: 'var(--text-label-wide)', color: 'var(--text-tertiary)', marginBottom: 4 }}>Latest Selections</div>
                {status.latestSelections.map((s, i) => (
                  <div key={i} style={{ font: 'var(--text-data-sm)', color: 'var(--text-secondary)' }}>
                    #{s.overallPick} — {s.teamName} → {s.playerName ?? '—'}
                  </div>
                ))}
              </div>
            )}
            <Link to={`/drafts/${status.draftEvent.id}`}><Button>Open Draft Room</Button></Link>
          </div>
        ) : (
          <EmptyState title="Draft" description="No draft event for the current season yet. Use Commissioner Mode to create one." />
        )}
      </Panel>
    </div>
  );
}

export function DraftDetailPage() {
  const { draftEventId } = useParams<{ draftEventId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { enabled: commissionerEnabled } = useCommissioner();
  const [event, setEvent] = useState<DraftEventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState('');

  const tab = (searchParams.get('tab') as DraftTab) ?? 'overview';
  const setTab = (value: string) => setSearchParams({ tab: value }, { replace: true });

  const reload = useCallback(async () => {
    if (!draftEventId) return;
    setLoading(true);
    try {
      const res = await getDraft(draftEventId);
      setEvent(res.item);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load draft');
    } finally {
      setLoading(false);
    }
  }, [draftEventId]);

  useEffect(() => { reload(); }, [reload]);

  async function runCommissioner(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await reload();
    } catch (err: unknown) {
      setActionError(`${label} failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Loading draft…" />;
  if (error) return <ErrorState description={error} />;
  if (!event || !draftEventId) return <EmptyState title="Draft" description="Draft not found." />;

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title={event.name}
        subtitle={`${event.seasonLabel ?? '—'} · ${event.totalRounds} rounds`}
        actions={<Badge tone={statusTone(event.status)}>{event.status}</Badge>}
      />
      <Tabs items={TAB_ITEMS} value={tab} onChange={setTab} />

      {actionError && <ErrorState description={actionError} />}

      {tab === 'overview' && (
        <Panel title="Overview">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <LabeledRow label="Status"><Badge tone={statusTone(event.status)}>{event.status}</Badge></LabeledRow>
            <LabeledRow label="Cutoff date">{event.cutoffDate}</LabeledRow>
            <LabeledRow label="Current pick">{event.currentOverallPick} / {event.totalPicks}</LabeledRow>
            <LabeledRow label="Preset">{event.presetName}</LabeledRow>
            <LabeledRow label="Started">{event.startedAt ?? '—'}</LabeledRow>
            <LabeledRow label="Completed">{event.completedAt ?? '—'}</LabeledRow>
            <LabeledRow label="Result hash"><code>{event.resultHash?.slice(0, 16) ?? '—'}…</code></LabeledRow>
          </div>
          {commissionerEnabled && (
            <CommissionerDraftActions event={event} busy={busy} onRun={runCommissioner} />
          )}
        </Panel>
      )}

      {tab === 'eligibility' && <EligibilityTab draftEventId={draftEventId} />}
      {tab === 'order' && <OrderTab draftEventId={draftEventId} />}
      {tab === 'lottery' && <LotteryTab draftEventId={draftEventId} />}
      {tab === 'room' && (
        <DraftRoomTab
          draftEventId={draftEventId}
          event={event}
          teamId={teamId}
          setTeamId={setTeamId}
          commissionerEnabled={commissionerEnabled}
          onChanged={reload}
        />
      )}
      {tab === 'results' && <ResultsTab draftEventId={draftEventId} />}
      {tab === 'board' && <TeamBoardTab draftEventId={draftEventId} teamId={teamId} setTeamId={setTeamId} />}
      {tab === 'diagnostics' && commissionerEnabled && <DiagnosticsTab draftEventId={draftEventId} />}
    </div>
  );
}

function CommissionerDraftActions({
  event,
  busy,
  onRun,
}: {
  event: DraftEventItem;
  busy: boolean;
  onRun: (label: string, fn: () => Promise<unknown>) => void;
}) {
  const [reason, setReason] = useState('Commissioner draft action');
  return (
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
      <Field label="Reason"><TextInput value={reason} onChange={(e) => setReason((e.target as HTMLInputElement).value)} /></Field>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {event.status === 'PLANNED' && (
          <Button disabled={busy} onClick={() => onRun('Create draft', async () => { /* already created */ })} style={{ display: 'none' }}>—</Button>
        )}
        {(event.status === 'PLANNED' || event.status === 'PREPARING') && (
          <>
            <Button disabled={busy} onClick={() => onRun('Generate eligibility', () => commissionerGenerateEligibility(event.id, reason))}>Generate Eligibility</Button>
            <Button disabled={busy} onClick={() => onRun('Generate order', () => commissionerGenerateOrder(event.id, { source: 'MANUAL', manualOrder: [], reason }).catch(() => commissionerGenerateOrder(event.id, { reason })))}>Generate Order</Button>
            <Button disabled={busy} onClick={() => onRun('Run lottery', () => commissionerRunLottery(event.id, reason))}>Run Lottery</Button>
            <Button disabled={busy} onClick={() => onRun('Mark ready', () => commissionerMarkDraftReady(event.id, reason))}>Mark Ready</Button>
          </>
        )}
        {event.status === 'READY' && (
          <Button disabled={busy} onClick={() => onRun('Start draft', () => commissionerStartDraft(event.id, reason))}>Start Draft</Button>
        )}
        {event.status !== 'COMPLETED' && event.status !== 'CANCELLED' && (
          <Button disabled={busy} onClick={() => onRun('Cancel draft', () => commissionerCancelDraft(event.id, reason))}>Cancel</Button>
        )}
      </div>
      <div style={{ font: 'var(--text-data-sm)', color: 'var(--text-tertiary)' }}>
        Order generation uses MANUAL mode when no stage is supplied — set participating teams via the API for REVERSE_STANDINGS.
      </div>
    </div>
  );
}

function EligibilityTab({ draftEventId }: { draftEventId: string }) {
  const [items, setItems] = useState<DraftEligiblePlayerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getDraftEligibility(draftEventId, controller.signal)
      .then((res) => { setItems(res.items); setError(null); })
      .catch((err: unknown) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Failed'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [draftEventId]);
  if (loading) return <LoadingState />;
  if (error) return <ErrorState description={error} />;
  return (
    <Panel title={`Eligible Prospects (${items.length})`}>
      <DataTable
        headers={[
          { key: 'player', label: 'Player' },
          { key: 'age', label: 'Age' },
          { key: 'pos', label: 'Pos' },
          { key: 'country', label: 'Country' },
          { key: 'status', label: 'Status' },
        ]}
      >
        {items.map((p) => (
          <tr key={p.id}>
            <Td><Link to={`/players/${p.playerId}`}>{p.playerName}</Link></Td>
            <Td>{p.ageOnCutoffDate}</Td>
            <Td>{p.position ?? '—'}</Td>
            <Td>{p.country ?? '—'}</Td>
            <Td><Badge tone={p.status === 'AVAILABLE' ? 'success' : p.status === 'DRAFTED' ? 'info' : 'neutral'}>{p.status}</Badge></Td>
          </tr>
        ))}
      </DataTable>
    </Panel>
  );
}

function OrderTab({ draftEventId }: { draftEventId: string }) {
  const [order, setOrder] = useState<DraftOrderDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getDraftOrder(draftEventId, controller.signal)
      .then((res) => { setOrder(res.item); setError(null); })
      .catch((err: unknown) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Failed'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [draftEventId]);
  if (loading) return <LoadingState />;
  if (error) return <ErrorState description={error} />;
  if (!order) return <EmptyState title="Draft Order" description="No order generated." />;
  return (
    <Panel title="Draft Order">
      <DataTable
        headers={[
          { key: 'pick', label: 'Pick' },
          { key: 'round', label: 'Round' },
          { key: 'team', label: 'Team' },
          { key: 'status', label: 'Status' },
          { key: 'sel', label: 'Selection' },
        ]}
      >
        {order.picks.map((p: DraftOrderPickItem) => (
          <tr key={`${p.roundNumber}-${p.pickInRound}`}>
            <Td>#{p.overallPick}</Td>
            <Td>R{p.roundNumber} · P{p.pickInRound}</Td>
            <Td>{p.teamName}</Td>
            <Td><Badge tone={p.status === 'COMPLETED' ? 'success' : p.status === 'ON_THE_CLOCK' ? 'info' : 'neutral'}>{p.status}</Badge></Td>
            <Td>{p.selectedPlayerName ?? '—'}</Td>
          </tr>
        ))}
      </DataTable>
    </Panel>
  );
}

function LotteryTab({ draftEventId }: { draftEventId: string }) {
  const [data, setData] = useState<{ enabled: boolean; lotteryHash: string | null; draws: Array<{ drawNumber: number; winningTeamId: string; originalPosition: number; newPosition: number; weightSnapshot: number }> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getDraftLottery(draftEventId, controller.signal)
      .then((res) => { setData(res.item as never); setError(null); })
      .catch((err: unknown) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Failed'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [draftEventId]);
  if (loading) return <LoadingState />;
  if (error) return <ErrorState description={error} />;
  if (!data) return <EmptyState title="Lottery" description="No lottery data." />;
  return (
    <Panel title="Lottery">
      {data.enabled ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <LabeledRow label="Hash"><code>{data.lotteryHash?.slice(0, 16) ?? '—'}…</code></LabeledRow>
          {data.draws.map((d) => (
            <LabeledRow key={d.drawNumber} label={`Draw ${d.drawNumber}`}>
              {d.winningTeamId}: #{d.originalPosition + 1} → #{d.newPosition + 1} (weight {d.weightSnapshot})
            </LabeledRow>
          ))}
        </div>
      ) : (
        <EmptyState title="Lottery" description="Lottery not enabled or not run." />
      )}
    </Panel>
  );
}

function DraftRoomTab({
  draftEventId,
  event,
  teamId,
  setTeamId,
  commissionerEnabled,
  onChanged,
}: {
  draftEventId: string;
  event: DraftEventItem;
  teamId: string;
  setTeamId: (v: string) => void;
  commissionerEnabled: boolean;
  onChanged: () => void;
}) {
  const [picks, setPicks] = useState<DraftOrderPickItem[]>([]);
  const [board, setBoard] = useState<DraftBoardEntryDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const picksRes = await getDraftPicks(draftEventId);
      setPicks(picksRes.items);
      if (teamId) {
        const boardRes = await getTeamDraftBoard(draftEventId, teamId);
        setBoard(boardRes.item.entries);
      } else {
        setBoard(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [draftEventId, teamId]);

  useEffect(() => { reload(); }, [reload]);

  const onClock = useMemo(() => picks.find((p) => p.status === 'ON_THE_CLOCK'), [picks]);

  async function pick(playerId: string, auto = false) {
    if (!onClock || !onClock.id) return;
    setBusy(true);
    setError(null);
    try {
      if (auto) {
        await autoSelectDraftPick(draftEventId, onClock.id, 'auto');
      } else {
        await selectDraftPick(draftEventId, onClock.id, playerId);
      }
      await reload();
      onChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Pick failed');
    } finally {
      setBusy(false);
    }
  }

  if (event.status !== 'IN_PROGRESS') {
    return <Panel title="Draft Room"><EmptyState title="Draft Room" description={`Draft is ${event.status}. Start the draft to enter the draft room.`} /></Panel>;
  }
  if (loading) return <LoadingState />;
  if (error) return <ErrorState description={error} />;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 16 }}>
      <Panel title="Pick History">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 480, overflow: 'auto' }}>
          {picks.filter((p) => p.status === 'COMPLETED').map((p) => (
            <div key={p.overallPick} style={{ font: 'var(--text-data-sm)' }}>
              #{p.overallPick} {p.teamName} → <Link to={`/players/${p.selectedPlayerId ?? ''}`}>{p.selectedPlayerName}</Link>
            </div>
          ))}
          {onClock && (
            <div style={{ padding: 8, background: 'var(--accent-primary-wash)', borderRadius: 6, marginTop: 8 }}>
              <strong>On the clock:</strong> #{onClock.overallPick} — {onClock.teamName}
            </div>
          )}
        </div>
      </Panel>
      <Panel title="Team Board & Selection">
        <Field label="Team context (local sandbox)">
          <TextInput placeholder="teamId" value={teamId} onChange={(e) => setTeamId((e.target as HTMLInputElement).value)} />
        </Field>
        {board ? (
          <DataTable
            headers={[
              { key: 'rank', label: 'Rank' },
              { key: 'player', label: 'Player' },
              { key: 'ca', label: 'Est. CA' },
              { key: 'pot', label: 'Est. Pot' },
              { key: 'conf', label: 'Conf' },
              { key: 'risk', label: 'Risk' },
              { key: 'act', label: '' },
            ]}
          >
            {board.map((e: DraftBoardEntryDto) => (
              <tr key={e.playerId}>
                <Td>{e.suggestedRank ?? '—'}</Td>
                <Td><Link to={`/players/${e.playerId}`}>Prospect {e.playerId.slice(-4)}</Link></Td>
                <Td>{e.estimatedCurrentAbility ?? 'Unknown'}</Td>
                <Td>{e.estimatedPotential ?? 'Unknown'}</Td>
                <Td>{Math.round(e.confidence * 100)}%</Td>
                <Td>{Math.round(e.risk * 100)}%</Td>
                <Td>
                  {onClock && onClock.teamId === teamId && !e.drafted && (
                    <Button disabled={busy} onClick={() => pick(e.playerId)}>Select</Button>
                  )}
                  {commissionerEnabled && onClock && onClock.id && !e.drafted && (
                    <Button disabled={busy} onClick={() => commissionerSelectPick(draftEventId, onClock.id!, e.playerId).then(() => { reload(); onChanged(); })}>Commissioner Select</Button>
                  )}
                </Td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState title="Team Board" description="Enter a teamId to view that team's scouting board." />
        )}
        {onClock && (
          <div style={{ marginTop: 12 }}>
            <Button disabled={busy || !teamId} onClick={() => pick('', true)}>Auto-Pick (estimates only)</Button>
          </div>
        )}
        <div style={{ font: 'var(--text-data-sm)', color: 'var(--text-tertiary)', marginTop: 8 }}>
          Team boards show scouting estimates only — never true potential, current ability, or quality tier.
        </div>
      </Panel>
    </div>
  );
}

function ResultsTab({ draftEventId }: { draftEventId: string }) {
  const [data, setData] = useState<{ items: DraftOrderPickItem[]; summary: { totalSelections: number; resultHash: string | null; completedAt: string | null } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getDraftResults(draftEventId, controller.signal)
      .then((res) => { setData(res.item); setError(null); })
      .catch((err: unknown) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Failed'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [draftEventId]);
  if (loading) return <LoadingState />;
  if (error) return <ErrorState description={error} />;
  if (!data) return <EmptyState title="Results" description="No results." />;
  return (
    <Panel title={`Results (${data.summary.totalSelections} selections)`}>
      <LabeledRow label="Completed">{data.summary.completedAt ?? '—'}</LabeledRow>
      <LabeledRow label="Result hash"><code>{data.summary.resultHash?.slice(0, 16) ?? '—'}…</code></LabeledRow>
      <DataTable
        headers={[
          { key: 'pick', label: 'Pick' },
          { key: 'team', label: 'Team' },
          { key: 'player', label: 'Player' },
          { key: 'source', label: 'Source' },
        ]}
      >
        {data.items.map((p) => (
          <tr key={p.overallPick}>
            <Td>#{p.overallPick}</Td>
            <Td>{p.teamName}</Td>
            <Td><Link to={`/players/${p.selectedPlayerId ?? ''}`}>{p.selectedPlayerName}</Link></Td>
            <Td>{p.selectionSource ?? '—'}</Td>
          </tr>
        ))}
      </DataTable>
    </Panel>
  );
}

function TeamBoardTab({ draftEventId, teamId, setTeamId }: { draftEventId: string; teamId: string; setTeamId: (v: string) => void }) {
  const [board, setBoard] = useState<DraftBoardEntryDto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!teamId) { setBoard(null); return; }
    const controller = new AbortController();
    setLoading(true);
    getTeamDraftBoard(draftEventId, teamId, controller.signal)
      .then((res) => { setBoard(res.item.entries); setError(null); })
      .catch((err: unknown) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Failed'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [draftEventId, teamId]);
  return (
    <Panel title="Team Board (private — estimates only)">
      <Field label="Team ID (local sandbox context)">
        <TextInput placeholder="teamId" value={teamId} onChange={(e) => setTeamId((e.target as HTMLInputElement).value)} />
      </Field>
      {loading && <LoadingState />}
      {error && <ErrorState description={error} />}
      {board && (
        <DataTable
          headers={[
            { key: 'sg', label: 'Suggested' },
            { key: 'man', label: 'Manual' },
            { key: 'player', label: 'Player' },
            { key: 'ca', label: 'Est. CA' },
            { key: 'pot', label: 'Est. Pot' },
            { key: 'conf', label: 'Conf' },
            { key: 'risk', label: 'Risk' },
            { key: 'watch', label: 'Watch' },
            { key: 'drafted', label: 'Drafted' },
          ]}
        >
          {board.map((e: DraftBoardEntryDto) => (
            <tr key={e.playerId}>
              <Td>{e.suggestedRank ?? '—'}</Td>
              <Td>{e.manualRank ?? '—'}</Td>
              <Td><Link to={`/players/${e.playerId}`}>{e.playerId.slice(-6)}</Link></Td>
              <Td>{e.estimatedCurrentAbility ?? 'Unknown'}</Td>
              <Td>{e.estimatedPotential ?? 'Unknown'}</Td>
              <Td>{Math.round(e.confidence * 100)}%</Td>
              <Td>{Math.round(e.risk * 100)}%</Td>
              <Td>{e.watchlistPriority}</Td>
              <Td>{e.drafted ? 'Yes' : 'No'}</Td>
            </tr>
          ))}
        </DataTable>
      )}
      {!board && !loading && <EmptyState title="Team Board" description="Enter a teamId to view that club's private draft board." />}
    </Panel>
  );
}

function DiagnosticsTab({ draftEventId }: { draftEventId: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getCommissionerDraftDiagnostics(draftEventId, controller.signal)
      .then((res) => { setData(res.item); setError(null); })
      .catch((err: unknown) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Failed'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [draftEventId]);
  if (loading) return <LoadingState />;
  if (error) return <ErrorState description={error} />;
  return (
    <Panel title="Commissioner Diagnostics (truth revealed)">
      <pre style={{ font: 'var(--text-data-sm)', whiteSpace: 'pre-wrap', maxHeight: 500, overflow: 'auto' }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </Panel>
  );
}
