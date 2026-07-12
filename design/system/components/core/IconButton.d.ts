import * as React from "react";

export interface IconButtonProps {
  /** Icon node, e.g. a Lucide <svg> at 16-18px. */
  icon: React.ReactNode;
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  /** Toggled/selected tool state (gold outline + wash). */
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
}
