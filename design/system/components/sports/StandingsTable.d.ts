import * as React from "react";

export interface StandingsRow {
  team: string;
  gp: number;
  w: number;
  l: number;
  otl: number;
  pts: number;
  diff: number;
}

/** @startingPoint section="Components" subtitle="League/division standings table" viewport="700x420" */
export interface StandingsTableProps {
  /** Rows in display order (already sorted by rank). */
  rows: StandingsRow[];
  /** Team name to highlight (the user's club). */
  highlightTeam?: string;
}
