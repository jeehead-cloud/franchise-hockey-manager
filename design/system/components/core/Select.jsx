import React from "react";

export function Select({ value, onChange, options, size = "md", disabled = false, style }) {
  const h = size === "sm" ? 28 : 32;
  return (
    <select
      value={value}
      onChange={onChange}
      disabled={disabled}
      style={{
        height: h,
        padding: "0 10px",
        boxSizing: "border-box",
        background: "var(--surface-input)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-sm)",
        color: "var(--text-primary)",
        font: "var(--text-body-sm)",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        ...style,
      }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
