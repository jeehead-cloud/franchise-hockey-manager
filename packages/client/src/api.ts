export interface TeamSummary {
  id: string;
  name: string;
  city: string;
  conference: string;
  division: string;
  leagueId: string;
  playerCount: number;
}

export interface SkaterAttributes {
  STH: number;
  SHO: number;
  PAS: number;
  STR: number;
  SPD: number;
  BAL: number;
  AGG: number;
  'OF.AW': number;
  'DEF.AW': number;
}

export interface GoalieAttributes {
  reflexes: number;
  positioning: number;
  reboundControl: number;
  puckHandling: number;
  consistency: number;
}

export interface Player {
  id: string;
  teamId: string;
  firstName: string;
  surname: string;
  name: string;
  nationality: string;
  position: string;
  age: number;
  currTotal: number;
  role: string | null;
  roleRating: number | null;
  attributes: SkaterAttributes | null;
  goalieAttributes: GoalieAttributes | null;
}

export interface TeamDetail {
  id: string;
  name: string;
  city: string;
  conference: string;
  division: string;
  leagueId: string;
  players: Player[];
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchTeams(): Promise<TeamSummary[]> {
  return getJson('/api/teams');
}

export function fetchTeam(id: string): Promise<TeamDetail> {
  return getJson(`/api/teams/${id}`);
}
