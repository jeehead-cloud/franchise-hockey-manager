import { Badge } from '../ui/Badge';
import { Panel } from '../ui/Panel';
import { formatPct } from '../../lib/match-format';
import type { LabBatchResult } from '../../lib/api';

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        background: 'var(--surface-panel-raised)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        minWidth: 140,
        flex: '1 1 140px',
      }}
    >
      <div
        style={{
          font: 'var(--text-label-wide)',
          letterSpacing: 'var(--text-tracking-wide)',
          textTransform: 'uppercase',
          color: 'var(--text-tertiary)',
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: 4, font: 'var(--text-heading-sm)', color: 'var(--text-primary)' }}>
        {value}
      </div>
      {hint ? (
        <div style={{ marginTop: 2, font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export function LabSummaryCards({
  result,
  teamAName,
  teamBName,
  isPartial,
}: {
  result: LabBatchResult;
  teamAName: string;
  teamBName: string;
  isPartial?: boolean;
}) {
  const { outcomes, scoring, upsets } = result.aggregate;
  const meta = result.metadata;

  return (
    <Panel
      title="Summary"
      actions={
        isPartial || meta.isPartial ? <Badge tone="warning">Partial result</Badge> : null
      }
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <Card
          label={`${teamAName} win rate`}
          value={formatPct(outcomes.teamAWinRate)}
          hint={`${outcomes.teamAWins} wins`}
        />
        <Card
          label={`${teamBName} win rate`}
          value={formatPct(outcomes.teamBWinRate)}
          hint={`${outcomes.teamBWins} wins`}
        />
        <Card label="Games" value={String(outcomes.games)} hint={`${outcomes.ties} ties`} />
        <Card
          label="Avg score"
          value={`${scoring.teamAAverageGoals.toFixed(2)} – ${scoring.teamBAverageGoals.toFixed(2)}`}
          hint={`Combined ${scoring.combinedAverageGoals.toFixed(2)}`}
        />
        <Card label="Home win rate" value={formatPct(outcomes.homeWinRate)} />
        <Card
          label="Decision split"
          value={`${outcomes.regulationDecisions}/${outcomes.overtimeDecisions}/${outcomes.shootoutDecisions}`}
          hint="REG / OT / SO"
        />
        <Card
          label="Upset rate"
          value={formatPct(upsets.upsetRate)}
          hint={`${upsets.upsetWins} upsets`}
        />
      </div>
      <p style={{ margin: '12px 0 0', font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
        Batch hash:{' '}
        <code style={{ fontFamily: 'var(--font-mono)' }}>{result.batchHash}</code>
        {meta.baselineBalance ? (
          <>
            {' '}
            · Baseline {meta.baselineBalance.presetName} v{meta.baselineBalance.versionNumber}
          </>
        ) : null}
      </p>
    </Panel>
  );
}
