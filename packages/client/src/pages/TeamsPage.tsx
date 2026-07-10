import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchTeams, type TeamSummary } from '../api';

export function TeamsPage() {
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTeams()
      .then(setTeams)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-slate-400">Loading teams…</p>;
  }

  if (error) {
    return (
      <p className="text-red-400">
        Failed to load teams: {error}. Is the server running on port 3000?
      </p>
    );
  }

  const byDivision = teams.reduce<Record<string, TeamSummary[]>>((acc, t) => {
    const key = `${t.conference} — ${t.division}`;
    (acc[key] ??= []).push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-white">Teams</h1>
        <p className="mt-1 text-slate-400">
          {teams.length} NHL teams · click a team to view its roster
        </p>
      </header>

      {Object.entries(byDivision).map(([division, divTeams]) => (
        <section key={division}>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">
            {division}
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {divTeams.map((t) => (
              <li key={t.id}>
                <Link
                  to={`/teams/${t.id}`}
                  className="block border border-slate-700 bg-slate-900/60 px-3 py-2 hover:border-slate-500 hover:bg-slate-800"
                >
                  <div className="font-medium text-white">
                    {t.city} {t.name}
                  </div>
                  <div className="text-xs text-slate-400">
                    {t.playerCount} players
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
