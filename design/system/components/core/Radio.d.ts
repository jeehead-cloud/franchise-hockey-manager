import * as React from "react";

export interface RadioProps {
  checked: boolean;
  onChange?: () => void;
  label?: string;
  disabled?: boolean;
}
