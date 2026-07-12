import * as React from "react";

export interface PanelProps {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** @default "var(--panel-width-md)" */
  width?: string;
}
