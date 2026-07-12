import * as React from "react";

export interface PlayerCardStat {
  label: string;
  value: string | number;
}

/** @startingPoint section="Components" subtitle="Player profile card — headshot, rating, key stats" viewport="700x360" */
export interface PlayerCardProps {
  name: string;
  position: string;
  number: number | string;
  team: string;
  /** Overall rating, e.g. "87". */
  overall: number | string;
  /** 3-6 short stat tiles, e.g. [{label:"SPD",value:82}]. */
  stats: PlayerCardStat[];
  /** Optional photo URL — falls back to initials on the team-color band. */
  photo?: string;
}
