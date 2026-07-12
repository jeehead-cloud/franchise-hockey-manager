import * as React from "react";

export interface BadgeProps {
  children: React.ReactNode;
  /** @default "neutral" */
  tone?: "neutral" | "info" | "success" | "danger" | "primary";
}
