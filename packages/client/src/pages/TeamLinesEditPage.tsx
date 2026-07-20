import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  LINEUP_SLOTS,
  SLOT_REQUIRED_POSITION,
  validateLineup,
  type LineupCandidate,
  type LineupSlot,
} from '@fhm/engine';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Field, SelectInput, TextInput } from '../components/ui/DataBrowser';
import { Dialog } from '../components/ui/Dialog';
import { AutoLineupConfirmDialog } from '../components/teams/AutoLineupConfirmDialog';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import { BackLink, RecordNotFound } from '../components/ui/RecordStates';
import {
  autoFillCommissionerTeamLineup,
  getCommissionerTeamLineup,
  saveCommissionerTeamLineup,
  type CommissionerTeamLineup,
  type LineupPlayerRef,
} from '../lib/api';
import { useCommissioner } from '../lib/commissioner';
import {
  DEFENSE_PAIRS,
  FORWARD_LINES,
  GOALIE_SLOTS,
  assignmentsEqual,
  computeFit,
  fitTone,
  playerDisplayName,
  presenceTone,
  slotShortLabel,
  validationTone,
} from '../lib/lineupUi';

type AssignmentState = Partial<Record<LineupSlot, string>>;

function toAssignmentState(item: CommissionerTeamLineup): AssignmentState {
  const next: AssignmentState = {};
  for (const row of item.assignments) next[row.slot] = row.playerId;
  return next;
}

function toPayloadAssignments(state: AssignmentState): Array<{ slot: LineupSlot; playerId: string }> {
  return LINEUP_SLOTS.filter((slot) => state[slot]).map((slot) => ({
    slot,
    playerId: state[slot]!,
  }));
}

function playerMap(item: CommissionerTeamLineup): Map<string, LineupPlayerRef> {
  const map = new Map<string, LineupPlayerRef>();
  for (const p of item.eligiblePlayers) map.set(p.id, p);
  for (const a of item.assignments) {
    if (a.player) map.set(a.player.id, a.player);
  }
  return map;
}

function toCandidate(p: LineupPlayerRef): LineupCandidate {
  return {
    id: p.id,
    primaryPosition: p.primaryPosition as LineupCandidate['primaryPosition'],
    secondaryPositions: (p.secondaryPositions ?? []) as LineupCandidate['secondaryPositions'],
    rosterStatus: p.rosterStatus as LineupCandidate['rosterStatus'],
    modelStatus: p.modelStatus,
    currentAbility: p.currentAbility,
    role: p.role,
    roleRating: p.roleRating,
  };
}

function SlotDropZone({
  slot,
  player,
  selected,
  selectedPlayerId,
  onSelect,
  onRemove,
  onAssign,
}: {
  slot: LineupSlot;
  player: LineupPlayerRef | null;
  selected: boolean;
  selectedPlayerId: string | null;
  onSelect: () => void;
  onRemove: () => void;
  onAssign: () => void;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `slot:${slot}` });
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({
    id: player ? `assigned:${slot}:${player.id}` : `empty:${slot}`,
    disabled: !player,
    data: { type: 'assigned', slot, playerId: player?.id },
  });

  return (
    <div
      ref={setDropRef}
      style={{
        flex: 1,
        minWidth: 130,
        border: `1px solid ${
          isOver ? 'var(--accent-primary)' : selected ? 'var(--accent-primary)' : 'var(--border-default)'
        }`,
        borderRadius: 'var(--radius-md)',
        padding: '8px 10px',
        background: isOver || selected ? 'var(--accent-primary-wash)' : 'var(--surface-panel)',
        opacity: isDragging ? 0.45 : 1,
      }}
    >
      <div
        ref={setDragRef}
        {...(player ? { ...listeners, ...attributes } : {})}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect();
          }
        }}
        role="button"
        tabIndex={0}
        style={{
          cursor: player ? 'grab' : 'pointer',
          transform: CSS.Translate.toString(transform),
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          outline: 'none',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
          <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
            {slotShortLabel(slot)}
          </span>
          {player ? (
            <Badge tone={fitTone(computeFit(player, slot))}>{computeFit(player, slot)}</Badge>
          ) : null}
        </div>
        {player ? (
          <>
            <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-primary)' }}>
              {playerDisplayName(player)}
            </div>
            <div style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
              {player.primaryPosition}
              {player.secondaryPositions?.length ? ` · ${player.secondaryPositions.join('/')}` : ''}
              {player.currentAbility != null ? ` · CA ${player.currentAbility}` : ''}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              style={{
                alignSelf: 'flex-start',
                border: 'none',
                background: 'transparent',
                color: 'var(--accent-danger)',
                font: 'var(--text-label)',
                cursor: 'pointer',
                padding: 0,
                marginTop: 2,
              }}
            >
              Remove
            </button>
          </>
        ) : (
          <>
            <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>Empty</div>
            {selectedPlayerId ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAssign();
                }}
                style={{
                  alignSelf: 'flex-start',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-link)',
                  font: 'var(--text-label)',
                  cursor: 'pointer',
                  padding: 0,
                  marginTop: 2,
                }}
              >
                Assign
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function EligiblePlayerRow({
  player,
  selected,
  assignedSlot,
  onSelect,
}: {
  player: LineupPlayerRef;
  selected: boolean;
  assignedSlot: LineupSlot | null;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `pool:${player.id}`,
    data: { type: 'pool', playerId: player.id },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 8,
        padding: '8px 10px',
        borderBottom: '1px solid var(--border-subtle)',
        background: selected ? 'var(--accent-primary-wash)' : 'transparent',
        cursor: 'grab',
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 1,
        outline: 'none',
      }}
    >
      <div>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-primary)' }}>
          {playerDisplayName(player)}
        </div>
        <div style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
          {player.primaryPosition}
          {player.secondaryPositions?.length ? ` / ${player.secondaryPositions.join('/')}` : ''}
          {player.currentAbility != null ? ` · CA ${player.currentAbility}` : ''}
          {player.role ? ` · ${player.role}` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        {assignedSlot ? <Badge tone="info">{assignedSlot}</Badge> : <Badge tone="neutral">Free</Badge>}
        <Badge tone={player.rosterStatus === 'ACTIVE' ? 'success' : 'warning'}>{player.rosterStatus}</Badge>
      </div>
    </div>
  );
}

export function TeamLinesEditPage() {
  const { teamId = '' } = useParams();
  const navigate = useNavigate();
  const { enabled, registerDirtyGuard } = useCommissioner();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [item, setItem] = useState<CommissionerTeamLineup | null>(null);
  const [assignments, setAssignments] = useState<AssignmentState>({});
  const [baseline, setBaseline] = useState<AssignmentState>({});
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<LineupSlot | null>(null);
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('ALL');
  const [showAssigned, setShowAssigned] = useState(true);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<null | 'REPLACE' | 'FILL_EMPTY' | 'CLEAR'>(null);
  const [activeDragLabel, setActiveDragLabel] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const dirty = useMemo(
    () => !assignmentsEqual(toPayloadAssignments(assignments), toPayloadAssignments(baseline)),
    [assignments, baseline],
  );

  useEffect(() => {
    registerDirtyGuard(() => dirty);
    return () => registerDirtyGuard(null);
  }, [dirty, registerDirtyGuard]);

  // Dirty-form navigation guard — beforeunload + popstate only.
  // NOT React Router's useBlocker: the app uses the declarative <BrowserRouter>
  // and useBlocker throws "must be used within a data router" at render time
  // (see first stabilization iteration / ErrorBoundary). This page previously
  // had a useBlocker call that would have blanked /teams/:id/lines/edit the
  // same way PlayerEditPage did before the first iteration fixed it.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    const onPopState = () => {
      if (!dirty) return;
      if (!window.confirm('You have unsaved lineup edits. Leave this page?')) {
        window.history.pushState(null, '', window.location.href);
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState);
    };
  }, [dirty]);

  function applyItem(next: CommissionerTeamLineup) {
    const state = toAssignmentState(next);
    setItem(next);
    setAssignments(state);
    setBaseline(state);
    setExpectedUpdatedAt(next.expectedUpdatedAt);
    setReason('');
    setSuccess(false);
    setSaveError(null);
  }

  async function reload() {
    const res = await getCommissionerTeamLineup(teamId);
    applyItem(res.item);
    setConflictOpen(false);
  }

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setLoading(true);
    getCommissionerTeamLineup(teamId, controller.signal)
      .then((res) => {
        applyItem(res.item);
        setError(null);
        setNotFound(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const status = (err as { status?: number }).status;
        if (status === 404) setNotFound(true);
        else setError(err instanceof Error ? err.message : 'Failed to load lineup editor');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [teamId, enabled]);

  const players = useMemo(() => (item ? playerMap(item) : new Map<string, LineupPlayerRef>()), [item]);

  const liveValidation = useMemo(() => {
    if (!item) return null;
    const candidatesById = new Map<string, LineupCandidate>();
    for (const p of players.values()) candidatesById.set(p.id, toCandidate(p));
    return validateLineup({
      assignments: toPayloadAssignments(assignments),
      candidatesById,
    });
  }, [assignments, item, players]);

  const assignedByPlayer = useMemo(() => {
    const map = new Map<string, LineupSlot>();
    for (const slot of LINEUP_SLOTS) {
      const pid = assignments[slot];
      if (pid) map.set(pid, slot);
    }
    return map;
  }, [assignments]);

  const filteredEligible = useMemo(() => {
    if (!item) return [];
    const q = search.trim().toLowerCase();
    return item.eligiblePlayers.filter((p) => {
      const assigned = assignedByPlayer.has(p.id);
      if (!showAssigned && assigned) return false;
      if (posFilter !== 'ALL') {
        const positions = [p.primaryPosition, ...(p.secondaryPositions ?? [])];
        if (!positions.includes(posFilter)) return false;
      }
      if (!q) return true;
      return `${p.firstName} ${p.lastName}`.toLowerCase().includes(q);
    });
  }, [item, search, posFilter, showAssigned, assignedByPlayer]);

  function assignPlayerToSlot(playerId: string, slot: LineupSlot) {
    setAssignments((prev) => {
      const next = { ...prev };
      for (const s of LINEUP_SLOTS) {
        if (next[s] === playerId) delete next[s];
      }
      next[slot] = playerId;
      return next;
    });
    setSelectedPlayerId(playerId);
    setSelectedSlot(slot);
  }

  function moveOrSwap(playerId: string, targetSlot: LineupSlot) {
    setAssignments((prev) => {
      const next = { ...prev };
      const fromSlot = LINEUP_SLOTS.find((s) => next[s] === playerId) ?? null;
      const occupant = next[targetSlot];
      if (fromSlot) {
        if (occupant && occupant !== playerId) {
          next[fromSlot] = occupant;
        } else {
          delete next[fromSlot];
        }
      } else {
        // from pool: replace target
      }
      next[targetSlot] = playerId;
      return next;
    });
  }

  function removeFromSlot(slot: LineupSlot) {
    setAssignments((prev) => {
      const next = { ...prev };
      delete next[slot];
      return next;
    });
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { playerId?: string; type?: string } | undefined;
    const pid = data?.playerId ?? String(event.active.id).split(':').pop();
    const p = pid ? players.get(pid) : null;
    setActiveDragLabel(p ? playerDisplayName(p) : 'Player');
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragLabel(null);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId?.startsWith('slot:')) return;
    const targetSlot = overId.slice(5) as LineupSlot;
    if (!LINEUP_SLOTS.includes(targetSlot)) return;

    const activeId = String(event.active.id);
    let playerId: string | null = null;
    if (activeId.startsWith('pool:')) playerId = activeId.slice(5);
    else if (activeId.startsWith('assigned:')) {
      const parts = activeId.split(':');
      playerId = parts[2] ?? null;
    }
    if (!playerId) return;
    moveOrSwap(playerId, targetSlot);
    setSelectedPlayerId(playerId);
    setSelectedSlot(targetSlot);
  }

  async function doSave() {
    if (!reason.trim()) {
      setSaveError('Edit reason is required');
      return;
    }
    if (liveValidation?.status === 'INVALID') {
      setSaveError('Cannot save an invalid lineup. Fix blocking errors first (partial incomplete lineups are allowed).');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveCommissionerTeamLineup(teamId, {
        expectedUpdatedAt,
        reason: reason.trim(),
        assignments: toPayloadAssignments(assignments),
      });
      applyItem(result.item);
      setSuccess(true);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 409) {
        setConflictOpen(true);
        setSaveError(err instanceof Error ? err.message : 'Edit conflict');
      } else {
        setSaveError(err instanceof Error ? err.message : 'Save failed');
      }
    } finally {
      setSaving(false);
    }
  }

  async function runConfirmedAction() {
    if (!confirmAction || !reason.trim()) {
      setSaveError('Edit reason is required');
      setConfirmAction(null);
      return;
    }
    if (dirty && !window.confirm('This will discard unsaved local edits and write to the server. Continue?')) {
      setConfirmAction(null);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      if (confirmAction === 'CLEAR') {
        const result = await saveCommissionerTeamLineup(teamId, {
          expectedUpdatedAt,
          reason: reason.trim(),
          assignments: [],
        });
        applyItem(result.item);
      } else {
        const result = await autoFillCommissionerTeamLineup(teamId, {
          expectedUpdatedAt,
          reason: reason.trim(),
          mode: confirmAction,
        });
        applyItem(result.item);
      }
      setSuccess(true);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 409) {
        setConflictOpen(true);
        setSaveError(err instanceof Error ? err.message : 'Edit conflict');
      } else {
        setSaveError(err instanceof Error ? err.message : 'Action failed');
      }
    } finally {
      setSaving(false);
      setConfirmAction(null);
    }
  }

  if (!enabled) {
    return (
      <div style={{ padding: 20 }}>
        <BackLink to={`/teams/${teamId}`} label="Team" />
        <EmptyState
          title="Commissioner Mode required"
          description="Enable Commissioner Mode from Settings before editing lines."
        />
        <div style={{ marginTop: 12 }}>
          <Link to="/settings">Open Settings</Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <LoadingState label="Loading lineup editor…" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ padding: 20 }}>
        <RecordNotFound entity="Team" listHref="/teams" listLabel="Back to Teams" />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div style={{ padding: 20 }}>
        <BackLink to={`/teams/${teamId}`} label="Team" />
        <ErrorState description={error ?? 'Lineup unavailable'} />
      </div>
    );
  }

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <BackLink to={`/teams/${teamId}`} label="Team" />
      <PageHeader
        title={`Edit lines · ${item.team.name}`}
        subtitle="Drag players onto slots, or use Assign / Remove. Incomplete lineups can be saved; invalid ones cannot."
        actions={<Badge tone="warning">Commissioner Mode</Badge>}
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Badge tone={presenceTone(item.presence)}>{item.presence}</Badge>
        {liveValidation ? (
          <Badge tone={validationTone(liveValidation.status)}>
            {liveValidation.status} · {liveValidation.filledSlots}/{liveValidation.requiredSlots}
          </Badge>
        ) : null}
        {dirty ? <Badge tone="warning">Unsaved</Badge> : <Badge tone="success">Synced</Badge>}
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.4fr) minmax(280px, 0.8fr)',
            gap: 16,
            alignItems: 'start',
          }}
        >
          <Panel title="Lineup board">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <section>
                <div style={{ font: 'var(--text-heading-sm)', marginBottom: 8 }}>Forward lines</div>
                {FORWARD_LINES.map((line) => (
                  <div key={line.label} style={{ marginBottom: 10 }}>
                    <div style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)', marginBottom: 4 }}>
                      {line.label}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {line.slots.map((slot) => {
                        const pid = assignments[slot];
                        const player = pid ? players.get(pid) ?? null : null;
                        return (
                          <SlotDropZone
                            key={slot}
                            slot={slot}
                            player={player}
                            selected={selectedSlot === slot}
                            selectedPlayerId={selectedPlayerId}
                            onSelect={() => {
                              setSelectedSlot(slot);
                              if (selectedPlayerId) assignPlayerToSlot(selectedPlayerId, slot);
                            }}
                            onRemove={() => removeFromSlot(slot)}
                            onAssign={() => {
                              if (selectedPlayerId) assignPlayerToSlot(selectedPlayerId, slot);
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </section>
              <section>
                <div style={{ font: 'var(--text-heading-sm)', marginBottom: 8 }}>Defense pairs</div>
                {DEFENSE_PAIRS.map((pair) => (
                  <div key={pair.label} style={{ marginBottom: 10 }}>
                    <div style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)', marginBottom: 4 }}>
                      {pair.label}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {pair.slots.map((slot) => {
                        const pid = assignments[slot];
                        const player = pid ? players.get(pid) ?? null : null;
                        return (
                          <SlotDropZone
                            key={slot}
                            slot={slot}
                            player={player}
                            selected={selectedSlot === slot}
                            selectedPlayerId={selectedPlayerId}
                            onSelect={() => {
                              setSelectedSlot(slot);
                              if (selectedPlayerId) assignPlayerToSlot(selectedPlayerId, slot);
                            }}
                            onRemove={() => removeFromSlot(slot)}
                            onAssign={() => {
                              if (selectedPlayerId) assignPlayerToSlot(selectedPlayerId, slot);
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </section>
              <section>
                <div style={{ font: 'var(--text-heading-sm)', marginBottom: 8 }}>Goalies</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {GOALIE_SLOTS.map(({ slot }) => {
                    const pid = assignments[slot];
                    const player = pid ? players.get(pid) ?? null : null;
                    return (
                      <SlotDropZone
                        key={slot}
                        slot={slot}
                        player={player}
                        selected={selectedSlot === slot}
                        selectedPlayerId={selectedPlayerId}
                        onSelect={() => {
                          setSelectedSlot(slot);
                          if (selectedPlayerId) assignPlayerToSlot(selectedPlayerId, slot);
                        }}
                        onRemove={() => removeFromSlot(slot)}
                        onAssign={() => {
                          if (selectedPlayerId) assignPlayerToSlot(selectedPlayerId, slot);
                        }}
                      />
                    );
                  })}
                </div>
              </section>
            </div>
          </Panel>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Panel title="Eligible players">
              <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
                <Field label="Search" htmlFor="lineup-search">
                  <TextInput
                    id="lineup-search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Name…"
                  />
                </Field>
                <Field label="Position" htmlFor="lineup-pos">
                  <SelectInput
                    id="lineup-pos"
                    value={posFilter}
                    onChange={(e) => setPosFilter(e.target.value)}
                  >
                    <option value="ALL">All</option>
                    {['LW', 'C', 'RW', 'LD', 'RD', 'G'].map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', font: 'var(--text-body-sm)' }}>
                  <input
                    type="checkbox"
                    checked={showAssigned}
                    onChange={(e) => setShowAssigned(e.target.checked)}
                  />
                  Show players already on the board
                </label>
              </div>
              {selectedSlot ? (
                <p style={{ margin: '0 0 8px', font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
                  Selected slot: <strong>{selectedSlot}</strong> (needs {SLOT_REQUIRED_POSITION[selectedSlot]}).
                  Click a player to assign, or use Move below.
                </p>
              ) : (
                <p style={{ margin: '0 0 8px', font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
                  Select a player, then Assign on a slot — or drag onto the board.
                </p>
              )}
              <div style={{ maxHeight: 420, overflow: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                {filteredEligible.length === 0 ? (
                  <EmptyState title="No matches" description="Adjust search or filters." />
                ) : (
                  filteredEligible.map((p) => (
                    <EligiblePlayerRow
                      key={p.id}
                      player={p}
                      selected={selectedPlayerId === p.id}
                      assignedSlot={assignedByPlayer.get(p.id) ?? null}
                      onSelect={() => {
                        setSelectedPlayerId(p.id);
                        if (selectedSlot) assignPlayerToSlot(p.id, selectedSlot);
                      }}
                    />
                  ))
                )}
              </div>
              {selectedPlayerId && selectedSlot ? (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <Button
                    size="sm"
                    onClick={() => assignPlayerToSlot(selectedPlayerId, selectedSlot)}
                  >
                    Assign / Move
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const from = assignedByPlayer.get(selectedPlayerId);
                      if (from) removeFromSlot(from);
                    }}
                  >
                    Remove from board
                  </Button>
                </div>
              ) : null}
            </Panel>

            <Panel title="Validation">
              {liveValidation ? (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <Badge tone={validationTone(liveValidation.status)}>{liveValidation.status}</Badge>
                    <span style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
                      {liveValidation.filledSlots}/{liveValidation.requiredSlots} slots ·{' '}
                      {liveValidation.eligiblePlayerCount} eligible
                    </span>
                  </div>
                  {liveValidation.errors.length === 0 && liveValidation.warnings.length === 0 ? (
                    <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
                      No issues.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {liveValidation.errors.map((issue, i) => (
                        <div key={`e-${i}`} style={{ font: 'var(--text-body-sm)', color: 'var(--accent-danger)' }}>
                          {issue.slot ? `[${issue.slot}] ` : ''}
                          {issue.message}
                        </div>
                      ))}
                      {liveValidation.warnings.map((issue, i) => (
                        <div key={`w-${i}`} style={{ font: 'var(--text-body-sm)', color: 'var(--accent-warning)' }}>
                          {issue.slot ? `[${issue.slot}] ` : ''}
                          {issue.message}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </Panel>
          </div>
        </div>

        <DragOverlay>
          {activeDragLabel ? (
            <div
              style={{
                padding: '8px 12px',
                background: 'var(--surface-panel)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                font: 'var(--text-body-sm)',
                boxShadow: 'var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.15))',
              }}
            >
              {activeDragLabel}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <Panel title="Save & actions">
        <Field label="Edit reason (required)" htmlFor="lineup-reason">
          <TextInput
            id="lineup-reason"
            value={reason}
            placeholder="Why is this lineup change being made?"
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        {saveError ? <ErrorState description={saveError} /> : null}
        {success ? (
          <EmptyState title="Saved" description="Lineup updated and audit entry recorded." />
        ) : null}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <Button onClick={() => void doSave()} disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button
            variant="secondary"
            disabled={saving}
            onClick={() => {
              if (dirty && !window.confirm('Discard unsaved lineup edits?')) return;
              navigate(`/teams/${teamId}`);
            }}
          >
            Cancel
          </Button>
          <Button variant="secondary" disabled={saving} onClick={() => setConfirmAction('REPLACE')}>
            Auto REPLACE
          </Button>
          <Button variant="secondary" disabled={saving} onClick={() => setConfirmAction('FILL_EMPTY')}>
            Auto FILL_EMPTY
          </Button>
          <Button variant="danger" disabled={saving} onClick={() => setConfirmAction('CLEAR')}>
            Clear
          </Button>
        </div>
      </Panel>

      <Dialog
        open={conflictOpen}
        title="Lineup was modified elsewhere"
        confirmLabel="Reload"
        onClose={() => setConflictOpen(false)}
        onConfirm={() => {
          void reload().catch((err: unknown) =>
            setSaveError(err instanceof Error ? err.message : 'Reload failed'),
          );
        }}
      >
        Another Commissioner edit changed this lineup (HTTP 409). Reload to pick up the latest version,
        then re-apply your changes.
      </Dialog>

      <AutoLineupConfirmDialog
        open={confirmAction !== null}
        mode={confirmAction}
        targetName={item?.team.name ?? 'team'}
        reason={reason}
        onReasonChange={setReason}
        busy={saving}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => void runConfirmedAction()}
      />
    </div>
  );
}
