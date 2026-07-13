import { DataRow, DataTable, Td } from '../ui/DataBrowser';
import { EmptyState } from '../ui/EmptyState';
import { Panel } from '../ui/Panel';
import { formatPct } from '../../lib/match-format';
import type { LabBatchResult } from '../../lib/api';

function MetricBar({
  label,
  teamA,
  teamB,
  format = (n: number) => n.toFixed(2),
}: {
  label: string;
  teamA: number;
  teamB: number;
  format?: (n: number) => string;
}) {
  const max = Math.max(Math.abs(teamA), Math.abs(teamB), 0.0001);
  const aW = Math.round((Math.abs(teamA) / max) * 100);
  const bW = Math.round((Math.abs(teamB) / max) * 100);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: 8, alignItems: 'center' }}>
      <span style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>{label}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div
          style={{
            height: 8,
            width: `${aW}%`,
            background: 'var(--accent-primary)',
            borderRadius: 2,
            minWidth: teamA === 0 ? 0 : 4,
          }}
        />
        <span style={{ font: 'var(--text-body-sm)' }}>{format(teamA)}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div
          style={{
            height: 8,
            width: `${bW}%`,
            background: 'var(--accent-info, var(--gray-6))',
            borderRadius: 2,
            minWidth: teamB === 0 ? 0 : 4,
          }}
        />
        <span style={{ font: 'var(--text-body-sm)' }}>{format(teamB)}</span>
      </div>
    </div>
  );
}

export function TeamMetricComparison({
  result,
  teamAName,
  teamBName,
}: {
  result: LabBatchResult;
  teamAName: string;
  teamBName: string;
}) {
  const { scoring, shooting, specialTeams, possession, outcomes } = result.aggregate;

  const tableRows: Array<{ key: string; label: string; a: string | number; b: string | number }> = [
    { key: 'avgG', label: 'Avg goals', a: scoring.teamAAverageGoals.toFixed(2), b: scoring.teamBAverageGoals.toFixed(2) },
    {
      key: 'sog',
      label: 'Avg SOG',
      a: shooting.teamAAverageShotsOnGoal.toFixed(1),
      b: shooting.teamBAverageShotsOnGoal.toFixed(1),
    },
    {
      key: 'att',
      label: 'Avg shot attempts',
      a: shooting.teamAAverageShotAttempts.toFixed(1),
      b: shooting.teamBAverageShotAttempts.toFixed(1),
    },
    {
      key: 'sh%',
      label: 'Shooting %',
      a: formatPct(shooting.teamAShootingPercentage),
      b: formatPct(shooting.teamBShootingPercentage),
    },
    {
      key: 'sv%',
      label: 'Save %',
      a: formatPct(shooting.teamASavePercentage),
      b: formatPct(shooting.teamBSavePercentage),
    },
    {
      key: 'pim',
      label: 'PIM / game',
      a: specialTeams.teamAPimPerGame.toFixed(2),
      b: specialTeams.teamBPimPerGame.toFixed(2),
    },
    {
      key: 'pp%',
      label: 'PP %',
      a: formatPct(specialTeams.teamAPowerPlayPercentage),
      b: formatPct(specialTeams.teamBPowerPlayPercentage),
    },
    {
      key: 'pk%',
      label: 'PK %',
      a: formatPct(specialTeams.teamAPenaltyKillPercentage),
      b: formatPct(specialTeams.teamBPenaltyKillPercentage),
    },
    {
      key: 'shg',
      label: 'SH goals / game',
      a: specialTeams.teamAShortHandedGoalsPerGame.toFixed(3),
      b: specialTeams.teamBShortHandedGoalsPerGame.toFixed(3),
    },
    {
      key: 'poss',
      label: 'Possession share',
      a: formatPct(possession.teamAPossessionShare),
      b: formatPct(possession.teamBPossessionShare),
    },
    {
      key: 'oz',
      label: 'O-zone share',
      a: formatPct(possession.teamAOffensiveZoneShare),
      b: formatPct(possession.teamBOffensiveZoneShare),
    },
    {
      key: 'fo',
      label: 'Faceoff share',
      a: formatPct(possession.teamAFaceoffShare),
      b: formatPct(possession.teamBFaceoffShare),
    },
  ];

  return (
    <div className="two-column-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <Panel title="Team metrics">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '140px 1fr 1fr',
            gap: 8,
            marginBottom: 10,
            font: 'var(--text-label-wide)',
            letterSpacing: 'var(--text-tracking-wide)',
            textTransform: 'uppercase',
            color: 'var(--text-tertiary)',
          }}
        >
          <span>Metric</span>
          <span>{teamAName}</span>
          <span>{teamBName}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <MetricBar label="Win rate" teamA={outcomes.teamAWinRate} teamB={outcomes.teamBWinRate} format={(n) => formatPct(n)} />
          <MetricBar label="Avg goals" teamA={scoring.teamAAverageGoals} teamB={scoring.teamBAverageGoals} />
          <MetricBar
            label="Avg SOG"
            teamA={shooting.teamAAverageShotsOnGoal}
            teamB={shooting.teamBAverageShotsOnGoal}
            format={(n) => n.toFixed(1)}
          />
          <MetricBar
            label="Shooting %"
            teamA={shooting.teamAShootingPercentage}
            teamB={shooting.teamBShootingPercentage}
            format={(n) => formatPct(n)}
          />
          <MetricBar
            label="Save %"
            teamA={shooting.teamASavePercentage}
            teamB={shooting.teamBSavePercentage}
            format={(n) => formatPct(n)}
          />
          <MetricBar
            label="PP %"
            teamA={specialTeams.teamAPowerPlayPercentage}
            teamB={specialTeams.teamBPowerPlayPercentage}
            format={(n) => formatPct(n)}
          />
        </div>
      </Panel>

      <Panel title="Shooting, special teams & possession">
        {tableRows.length === 0 ? (
          <EmptyState title="No metrics" description="Team aggregates are not available." />
        ) : (
          <DataTable
            headers={[
              { key: 'stat', label: 'Stat' },
              { key: 'a', label: teamAName },
              { key: 'b', label: teamBName },
            ]}
          >
            {tableRows.map((row) => (
              <DataRow key={row.key}>
                <Td primary>{row.label}</Td>
                <Td>{row.a}</Td>
                <Td>{row.b}</Td>
              </DataRow>
            ))}
          </DataTable>
        )}
      </Panel>
    </div>
  );
}
