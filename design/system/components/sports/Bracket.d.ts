import * as React from "react";

export interface BracketTeam {
  name?: string;
  score?: number;
  winner?: boolean;
}

export interface BracketMatchup {
  top: BracketTeam;
  bottom: BracketTeam;
}

export interface BracketRound {
  label: string;
  matchups: BracketMatchup[];
}

/** @startingPoint section="Components" subtitle="Playoff bracket — rounds of matchups, winners advance" viewport="900x420" */
export interface BracketProps {
  /** Rounds in order (e.g. Quarterfinal → Semifinal → Final). Matchup count should halve each round. */
  rounds: BracketRound[];
}
