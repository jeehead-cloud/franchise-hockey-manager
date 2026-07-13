import { useMemo, useState } from 'react';
import { DataRow, DataTable, Field, SelectInput, Td } from '../ui/DataBrowser';
import { EmptyState } from '../ui/EmptyState';
import { Panel } from '../ui/Panel';
import type { LabUnitAggregate } from '../../lib/api';

type SideFilter = 'ALL' | 'TEAM_A' | 'TEAM_B';

export function LineAggregateTable({
  units,
  teamAName,
  teamBName,
}: {
  units: LabUnitAggregate[];
  teamAName: string;
  teamBName: string;
}) {
  const [side, setSide] = useState<SideFilter>('ALL');

  const filtered = useMemo(() => {
    const list = side === 'ALL' ? units : units.filter((u) => u.teamSide === side);
    return [...list].sort(
      (a, b) => b.goalDifferential - a.goalDifferential || b.shiftCount - a.shiftCount,
    );
  }, [units, side]);

  const sideLabel = (s: 'TEAM_A' | 'TEAM_B') => (s === 'TEAM_A' ? teamAName : teamBName);

  if (units.length === 0) {
    return (
      <Panel title="Lines & pairs">
        <EmptyState
          title="No line aggregates"
          description="Enable line aggregates on the next run, or no unit stats were produced."
        />
      </Panel>
    );
  }

  return (
    <Panel
      title="Lines & pairs"
      actions={
        <Field label="Team">
          <SelectInput value={side} onChange={(e) => setSide(e.target.value as SideFilter)}>
            <option value="ALL">All</option>
            <option value="TEAM_A">{teamAName}</option>
            <option value="TEAM_B">{teamBName}</option>
          </SelectInput>
        </Field>
      }
    >
      <p style={{ margin: '0 0 10px', font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
        On-ice goal differential and simulation shift counts — not official NHL TOI or plus/minus.
      </p>
      {filtered.length === 0 ? (
        <EmptyState title="No units" description="No line or pair rows match the current filter." />
      ) : (
        <DataTable
          headers={[
            { key: 'unit', label: 'Unit' },
            { key: 'team', label: 'Team' },
            { key: 'gp', label: 'GP' },
            { key: 'shifts', label: 'Shifts' },
            { key: 'gf', label: 'GF' },
            { key: 'ga', label: 'GA' },
            { key: 'diff', label: 'Diff' },
            { key: 'eff', label: 'Avg eff. perf.' },
            { key: 'players', label: 'Players' },
          ]}
        >
          {filtered.map((u) => (
            <DataRow key={`${u.unitKey}-${u.teamSide}`}>
              <Td primary>{u.unitKey}</Td>
              <Td>{sideLabel(u.teamSide)}</Td>
              <Td>{u.games}</Td>
              <Td>{u.shiftCount}</Td>
              <Td>{u.goalsFor}</Td>
              <Td>{u.goalsAgainst}</Td>
              <Td>{u.goalDifferential}</Td>
              <Td>{u.averageEffectivePerformance.toFixed(2)}</Td>
              <Td>{u.playerIds.map((id) => id.slice(0, 8)).join(', ')}</Td>
            </DataRow>
          ))}
        </DataTable>
      )}
    </Panel>
  );
}
