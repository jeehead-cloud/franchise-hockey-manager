import * as React from "react";

export interface ToastProps {
  /** @default "info" */
  tone?: "info" | "success" | "danger";
  title?: string;
  message: string;
  onClose?: () => void;
}
