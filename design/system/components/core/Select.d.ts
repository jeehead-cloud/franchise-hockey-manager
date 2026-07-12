import * as React from "react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: SelectOption[];
  /** @default "md" */
  size?: "sm" | "md";
  disabled?: boolean;
  style?: React.CSSProperties;
}
