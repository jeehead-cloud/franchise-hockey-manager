import { DataRow, DataTable, Td } from '../ui/DataBrowser';
import { EmptyState } from '../ui/EmptyState';
import { Panel } from '../ui/Panel';
import type { MatchOverviewLineUsage, MatchOverviewLineUsageTeam } from '../../lib/api';

function LineTeamSection({ team }: { team: MatchOverviewLineUsageTeam }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <h3 style={{ margin: 0, font: 'var(--text-heading-sm)' }}>{team.teamName}</h3>
      <DataTable
        headers={[
          { key: 'unit', label: 'Unit' },
          { key: 'players', label: 'Players' },
          { key: 'shifts', label: 'Shifts' },
          { key: 'eff', label: 'Eff.' },
        ]}
      >
        {team.forwardLines.map((unit) => (
          <DataRow key={unit.unitKey}>
            <Td primary>{unit.unitKey}</Td>
            <Td>{unit.playerNames.join(', ')}</Td>
            <Td>{unit.shiftCount ?? '—'}</Td>
            <Td>{unit.effectivePerformance != null ? unit.effectivePerformance.toFixed(1) : '—'}</Td>
          </DataRow>
        ))}
        {team.defensePairs.map((unit) => (
          <DataRow key={unit.unitKey}>
            <Td primary>{unit.unitKey}</Td>
            <Td>{unit.playerNames.join(', ')}</Td>
            <Td>{unit.shiftCount ?? '—'}</Td>
            <Td>{unit.effectivePerformance != null ? unit.effectivePerformance.toFixed(1) : '—'}</Td>
          </DataRow>
        ))}
        <DataRow>
          <Td primary>{team.starterGoalie.unitKey}</Td>
          <Td>{team.starterGoalie.playerNames.join(', ')}</Td>
          <Td>—</Td>
          <Td>
            {team.starterGoalie.effectivePerformance != null
              ? team.starterGoalie.effectivePerformance.toFixed(1)
              : '—'}
          </Td>
        </DataRow>
      </DataTable>
    </div>
  );
}

export function LineUsagePanel({ lineUsage }: { lineUsage: MatchOverviewLineUsage | null }) {
  if (!lineUsage) {
    return (
      <Panel title="Lines & usage">
        <EmptyState
          title="No line usage"
          description="Line usage data is not available for this result."
        />
      </Panel>
    );
  }

  return (
    <Panel title="Lines & usage">
      <p style={{ margin: '0 0 12px', font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
        {lineUsage.note}
      </p>
      <div style={{ display: 'grid', gap: 20 }}>
        <LineTeamSection team={lineUsage.away} />
        <LineTeamSection team={lineUsage.home} />
      </div>
    </Panel>
  );
}
