import * as React from "react";

export interface StatsTableColumn {
  key: string;
  label: string;
}

/** @startingPoint section="Components" subtitle="Configurable stat leaderboard / roster table" viewport="700x420" */
export interface StatsTableProps {
  /** Column order; first column renders left-aligned as the row label (e.g. player name). */
  columns: StatsTableColumn[];
  /** Each row is a flat object keyed by column `key`, plus a unique `id`. */
  rows: Array<{ id: string | number; [key: string]: any }>;
  highlightId?: string | number;
}
