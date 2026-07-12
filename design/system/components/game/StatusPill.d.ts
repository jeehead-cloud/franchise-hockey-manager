import * as React from "react";

export interface StatusPillProps {
  /** @default "neutral" */
  tone?: "home" | "away" | "win" | "loss" | "otl" | "neutral";
  label: string;
}
