import * as React from "react";

export interface ButtonProps {
  children: React.ReactNode;
  /** Visual style. @default "primary" */
  variant?: "primary" | "secondary" | "ghost" | "danger";
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  /** Optional leading icon node (e.g. a Lucide <svg>). */
  icon?: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}
