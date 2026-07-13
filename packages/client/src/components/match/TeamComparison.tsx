import { DataRow, DataTable, Td } from '../ui/DataBrowser';
import { Panel } from '../ui/Panel';
import { formatPct } from '../../lib/match-format';
import type { MatchOverviewTeamStat } from '../../lib/api';

function cell(value: number | string | null | undefined): string | number {
  if (value == null) return '—';
  return value;
}

export function TeamComparison({
  home,
  away,
  homeName,
  awayName,
}: {
  home: MatchOverviewTeamStat | null;
  away: MatchOverviewTeamStat | null;
  homeName: string;
  awayName: string;
}) {
  const rows: Array<{
    key: string;
    label: string;
    home: string | number;
    away: string | number;
  }> = [
    { key: 'g', label: 'Goals', home: cell(home?.goals), away: cell(away?.goals) },
    { key: 'sog', label: 'Shots on goal', home: cell(home?.shotsOnGoal), away: cell(away?.shotsOnGoal) },
    {
      key: 'sa',
      label: 'Shot attempts',
      home: cell(home?.shotAttempts),
      away: cell(away?.shotAttempts),
    },
    {
      key: 'sh%',
      label: 'Shooting %',
      home: formatPct(home?.shootingPercentage),
      away: formatPct(away?.shootingPercentage),
    },
    { key: 'sv', label: 'Saves', home: cell(home?.saves), away: cell(away?.saves) },
    {
      key: 'sv%',
      label: 'Save %',
      home: formatPct(home?.savePercentage),
      away: formatPct(away?.savePercentage),
    },
    {
      key: 'fo',
      label: 'Faceoff wins',
      home: cell(home?.faceoffWins),
      away: cell(away?.faceoffWins),
    },
    {
      key: 'poss',
      label: 'Possession (s)',
      home: cell(home?.possessionSeconds),
      away: cell(away?.possessionSeconds),
    },
    { key: 'pim', label: 'PIM', home: cell(home?.penaltyMinutes), away: cell(away?.penaltyMinutes) },
    {
      key: 'pp',
      label: 'PP goals',
      home: cell(home?.powerPlayGoals),
      away: cell(away?.powerPlayGoals),
    },
    {
      key: 'pp%',
      label: 'PP %',
      home: formatPct(home?.powerPlayPercentage),
      away: formatPct(away?.powerPlayPercentage),
    },
    {
      key: 'pk%',
      label: 'PK %',
      home: formatPct(home?.penaltyKillPercentage),
      away: formatPct(away?.penaltyKillPercentage),
    },
    {
      key: 'shg',
      label: 'SH goals',
      home: cell(home?.shortHandedGoals),
      away: cell(away?.shortHandedGoals),
    },
    {
      key: 'so',
      label: 'Shootout',
      home: home ? `${home.shootoutGoals}/${home.shootoutAttempts}` : '—',
      away: away ? `${away.shootoutGoals}/${away.shootoutAttempts}` : '—',
    },
  ];

  return (
    <Panel title="Team comparison">
      <DataTable
        headers={[
          { key: 'stat', label: 'Stat' },
          { key: 'away', label: awayName },
          { key: 'home', label: homeName },
        ]}
      >
        {rows.map((row) => (
          <DataRow key={row.key}>
            <Td primary>{row.label}</Td>
            <Td>{row.away}</Td>
            <Td>{row.home}</Td>
          </DataRow>
        ))}
      </DataTable>
    </Panel>
  );
}
