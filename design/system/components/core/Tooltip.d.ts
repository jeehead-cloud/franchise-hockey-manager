import * as React from "react";

export interface TooltipProps {
  children: React.ReactNode;
  label: string;
  /** @default "top" */
  side?: "top" | "bottom" | "left" | "right";
}
