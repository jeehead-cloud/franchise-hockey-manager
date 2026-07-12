import React from "react";

export function Checkbox({ checked, onChange, label, disabled = false }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}>
      <span
        onClick={disabled ? undefined : () => onChange && onChange(!checked)}
        style={{
          width: 16,
          height: 16,
          borderRadius: "3px",
          border: checked ? "1px solid var(--accent-primary)" : "1px solid var(--border-default)",
          background: checked ? "var(--accent-primary)" : "var(--surface-input)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background var(--duration-fast) var(--ease-out)",
        }}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 5L4 7.5L8.5 2.5" stroke="var(--text-on-accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {label && <span style={{ font: "var(--text-body-sm)", color: "var(--text-secondary)" }}>{label}</span>}
    </label>
  );
}
