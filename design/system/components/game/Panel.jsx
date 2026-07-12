import React from "react";

export function Panel({ title, actions, children, width = "var(--panel-width-md)" }) {
  return (
    <div
      style={{
        width,
        background: "var(--surface-panel)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-md)",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {title && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 12px",
            borderBottom: "1px solid var(--border-subtle)",
            background: "var(--surface-panel-raised)",
          }}
        >
          <span style={{ font: "var(--text-label-wide)", letterSpacing: "var(--text-tracking-wide)", textTransform: "uppercase", color: "var(--text-tertiary)" }}>
            {title}
          </span>
          {actions && <div style={{ display: "flex", gap: "4px" }}>{actions}</div>}
        </div>
      )}
      <div style={{ padding: "12px" }}>{children}</div>
    </div>
  );
}
