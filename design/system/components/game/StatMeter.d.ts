import * as React from "react";

export interface StatMeterProps {
  label: string;
  value: number;
  max: number;
  /** @default "primary" */
  tone?: "primary" | "info" | "success" | "danger";
}
