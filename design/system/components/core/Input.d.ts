import * as React from "react";

export interface InputProps {
  value: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  /** @default "md" */
  size?: "sm" | "md";
  icon?: React.ReactNode;
  style?: React.CSSProperties;
}
