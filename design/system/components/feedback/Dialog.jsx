import React from "react";

export function Dialog({ open, title, children, footer, onClose }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--surface-overlay)",
        backdropFilter: "var(--blur-scrim)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "380px",
          background: "var(--surface-panel)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "16px", borderBottom: "1px solid var(--border-subtle)", font: "var(--text-heading-sm)", color: "var(--text-primary)" }}>
          {title}
        </div>
        <div style={{ padding: "16px", font: "var(--text-body)", color: "var(--text-secondary)" }}>{children}</div>
        {footer && (
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
