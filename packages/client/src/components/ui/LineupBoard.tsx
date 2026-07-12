import { Badge } from './Badge';
import type { LineupPlayerRef, LineupSlot } from '../../lib/api';
import {
  DEFENSE_PAIRS,
  FORWARD_LINES,
  GOALIE_SLOTS,
  fitTone,
  playerDisplayName,
  slotShortLabel,
} from '../../lib/lineupUi';

export type AssignmentMap = Partial<Record<LineupSlot, LineupPlayerRef | null>>;

function SlotCard({
  slot,
  player,
  interactive,
  selected,
  onClick,
  onRemove,
  onAssignSelected,
  canAssign,
}: {
  slot: LineupSlot;
  player: LineupPlayerRef | null | undefined;
  interactive?: boolean;
  selected?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  onAssignSelected?: () => void;
  canAssign?: boolean;
}) {
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!interactive || !onClick) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        flex: 1,
        minWidth: 120,
        border: `1px solid ${selected ? 'var(--accent-primary)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-md)',
        padding: '8px 10px',
        background: selected ? 'var(--accent-primary-wash)' : 'var(--surface-panel)',
        cursor: interactive ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
          {slotShortLabel(slot)}
        </span>
        {player?.positionFit ? (
          <Badge tone={fitTone(player.positionFit)}>{player.positionFit}</Badge>
        ) : null}
      </div>
      {player ? (
        <>
          <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-primary)' }}>
            {playerDisplayName(player)}
          </div>
          <div style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
            {player.primaryPosition}
            {player.secondaryPositions?.length
              ? ` · ${player.secondaryPositions.join('/')}`
              : ''}
            {player.currentAbility != null ? ` · CA ${player.currentAbility}` : ''}
          </div>
          {interactive && onRemove ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              style={{
                alignSelf: 'flex-start',
                marginTop: 4,
                border: 'none',
                background: 'transparent',
                color: 'var(--accent-danger)',
                font: 'var(--text-label)',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Remove
            </button>
          ) : null}
        </>
      ) : (
        <>
          <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>Empty</div>
          {interactive && canAssign && onAssignSelected ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAssignSelected();
              }}
              style={{
                alignSelf: 'flex-start',
                marginTop: 4,
                border: 'none',
                background: 'transparent',
                color: 'var(--text-link)',
                font: 'var(--text-label)',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Assign
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

export function LineupBoard({
  assignments,
  interactive,
  selectedSlot,
  canAssign,
  onSlotClick,
  onRemove,
  onAssignSelected,
  slotDroppableProps,
  playerDraggableProps,
}: {
  assignments: AssignmentMap;
  interactive?: boolean;
  selectedSlot?: LineupSlot | null;
  canAssign?: boolean;
  onSlotClick?: (slot: LineupSlot) => void;
  onRemove?: (slot: LineupSlot) => void;
  onAssignSelected?: (slot: LineupSlot) => void;
  slotDroppableProps?: (slot: LineupSlot) => Record<string, unknown>;
  playerDraggableProps?: (slot: LineupSlot, player: LineupPlayerRef) => Record<string, unknown>;
}) {
  const renderSlot = (slot: LineupSlot) => {
    const player = assignments[slot] ?? null;
    const droppable = slotDroppableProps?.(slot) ?? {};
    const draggable = player && playerDraggableProps ? playerDraggableProps(slot, player) : {};
    return (
      <div key={slot} {...droppable} style={{ flex: 1, minWidth: 120 }}>
        <div {...draggable}>
          <SlotCard
            slot={slot}
            player={player}
            interactive={interactive}
            selected={selectedSlot === slot}
            onClick={onSlotClick ? () => onSlotClick(slot) : undefined}
            onRemove={onRemove ? () => onRemove(slot) : undefined}
            onAssignSelected={onAssignSelected ? () => onAssignSelected(slot) : undefined}
            canAssign={canAssign}
          />
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section>
        <div style={{ font: 'var(--text-heading-sm)', marginBottom: 8, color: 'var(--text-primary)' }}>
          Forward lines
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {FORWARD_LINES.map((line) => (
            <div key={line.label}>
              <div style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)', marginBottom: 4 }}>
                {line.label}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {line.slots.map(renderSlot)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div style={{ font: 'var(--text-heading-sm)', marginBottom: 8, color: 'var(--text-primary)' }}>
          Defense pairs
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {DEFENSE_PAIRS.map((pair) => (
            <div key={pair.label}>
              <div style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)', marginBottom: 4 }}>
                {pair.label}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {pair.slots.map(renderSlot)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div style={{ font: 'var(--text-heading-sm)', marginBottom: 8, color: 'var(--text-primary)' }}>
          Goalies
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {GOALIE_SLOTS.map(({ slot }) => renderSlot(slot))}
        </div>
      </section>
    </div>
  );
}
