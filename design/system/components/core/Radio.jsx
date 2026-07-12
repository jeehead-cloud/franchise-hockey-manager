import React from "react";

export function Radio({ checked, onChange, label, disabled = false }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}>
      <span
        onClick={disabled ? undefined : () => onChange && onChange()}
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: checked ? "1px solid var(--accent-primary)" : "1px solid var(--border-default)",
          background: "var(--surface-input)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent-primary)" }} />}
      </span>
      {label && <span style={{ font: "var(--text-body-sm)", color: "var(--text-secondary)" }}>{label}</span>}
    </label>
  );
}
