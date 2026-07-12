import React from "react";

export function Tag({ children, onRemove }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "3px 8px",
        borderRadius: "var(--radius-sm)",
        background: "var(--surface-panel-raised)",
        border: "1px solid var(--border-subtle)",
        color: "var(--text-secondary)",
        font: "var(--text-body-sm)",
      }}
    >
      {children}
      {onRemove && (
        <span onClick={onRemove} style={{ cursor: "pointer", color: "var(--text-tertiary)", fontSize: "12px", lineHeight: 1 }}>
          ×
        </span>
      )}
    </span>
  );
}
