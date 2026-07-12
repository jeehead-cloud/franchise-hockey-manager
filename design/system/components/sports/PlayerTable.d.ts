import * as React from "react";

export interface Player {
  id: string | number;
  number: number | string;
  name: string;
  pos: string;
  age: number;
  ovr: number;
  status?: "Healthy" | "Injured" | "Suspended";
}

/** @startingPoint section="Components" subtitle="Roster table with jersey #, position, OVR, health status" viewport="700x420" */
export interface PlayerTableProps {
  players: Player[];
  onSelect?: (id: string | number) => void;
  selectedId?: string | number;
}
