import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchTeam, type TeamDetail } from '../api';

function fmt(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toFixed(digits);
}

export function RosterPage() {
  const { id } = useParams<{ id: string }>();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchTeam(id)
      .then(setTeam)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <p className="text-slate-400">Loading roster…</p>;
  }

  if (error || !team) {
    return (
      <p className="text-red-400">Failed to load roster: {error ?? 'not found'}</p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Link to="/" className="text-sm text-slate-400 hover:text-white">
          ← All teams
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-white">
          {team.city} {team.name}
        </h1>
        <p className="text-slate-400">
          {team.conference} · {team.division} · {team.players.length} players
        </p>
      </div>

      <div className="overflow-x-auto border border-slate-700">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-2 py-2">Name</th>
              <th className="px-2 py-2">Pos</th>
              <th className="px-2 py-2">Age</th>
              <th className="px-2 py-2">OVR</th>
              <th className="px-2 py-2">Role</th>
              <th className="px-2 py-2">Role Rtg</th>
              <th className="px-2 py-2">STH</th>
              <th className="px-2 py-2">SHO</th>
              <th className="px-2 py-2">PAS</th>
              <th className="px-2 py-2">STR</th>
              <th className="px-2 py-2">SPD</th>
              <th className="px-2 py-2">BAL</th>
              <th className="px-2 py-2">AGG</th>
              <th className="px-2 py-2">OF.AW</th>
              <th className="px-2 py-2">DEF.AW</th>
            </tr>
          </thead>
          <tbody>
            {team.players.map((p) => (
              <tr key={p.id} className="border-t border-slate-800 hover:bg-slate-900/50">
                <td className="px-2 py-1.5 whitespace-nowrap">{p.name}</td>
                <td className="px-2 py-1.5">{p.position}</td>
                <td className="px-2 py-1.5">{p.age}</td>
                <td className="px-2 py-1.5 font-medium text-white">{fmt(p.currTotal)}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  {p.position === 'G'
                    ? 'Goalie (placeholder)'
                    : (p.role ?? '—')}
                </td>
                <td className="px-2 py-1.5">{fmt(p.roleRating)}</td>
                <td className="px-2 py-1.5">{fmt(p.attributes?.STH)}</td>
                <td className="px-2 py-1.5">{fmt(p.attributes?.SHO)}</td>
                <td className="px-2 py-1.5">{fmt(p.attributes?.PAS)}</td>
                <td className="px-2 py-1.5">{fmt(p.attributes?.STR)}</td>
                <td className="px-2 py-1.5">{fmt(p.attributes?.SPD)}</td>
                <td className="px-2 py-1.5">{fmt(p.attributes?.BAL)}</td>
                <td className="px-2 py-1.5">{fmt(p.attributes?.AGG)}</td>
                <td className="px-2 py-1.5">{fmt(p.attributes?.['OF.AW'])}</td>
                <td className="px-2 py-1.5">{fmt(p.attributes?.['DEF.AW'])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {team.players.some((p) => p.goalieAttributes) && (
        <details className="text-sm text-slate-400">
          <summary className="cursor-pointer hover:text-white">
            Goalie placeholder attributes (PLAYER_MODEL.md §7 item 5)
          </summary>
          <ul className="mt-2 space-y-1">
            {team.players
              .filter((p) => p.goalieAttributes)
              .map((p) => (
                <li key={p.id}>
                  {p.name}: Ref {fmt(p.goalieAttributes!.reflexes)} · Pos{' '}
                  {fmt(p.goalieAttributes!.positioning)} · Rebound{' '}
                  {fmt(p.goalieAttributes!.reboundControl)} · Puck{' '}
                  {fmt(p.goalieAttributes!.puckHandling)} · Cons{' '}
                  {fmt(p.goalieAttributes!.consistency)}
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}
