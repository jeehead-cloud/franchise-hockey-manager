import React from "react";

const toneMap = {
  info: "var(--accent-info)",
  success: "var(--accent-success)",
  danger: "var(--accent-danger)",
};

export function Toast({ tone = "info", title, message, onClose }) {
  return (
    <div
      style={{
        display: "flex",
        gap: "10px",
        alignItems: "flex-start",
        width: "300px",
        padding: "12px",
        borderRadius: "var(--radius-md)",
        background: "var(--surface-panel)",
        border: "1px solid var(--border-default)",
        borderLeft: `3px solid ${toneMap[tone] || toneMap.info}`,
        boxShadow: "var(--shadow-md)",
        boxSizing: "border-box",
      }}
    >
      <div style={{ flex: 1 }}>
        {title && <div style={{ font: "600 var(--text-size-sm)/1.3 var(--font-sans)", color: "var(--text-primary)", marginBottom: "2px" }}>{title}</div>}
        <div style={{ font: "var(--text-body-sm)", color: "var(--text-secondary)" }}>{message}</div>
      </div>
      {onClose && (
        <span onClick={onClose} style={{ cursor: "pointer", color: "var(--text-tertiary)", font: "var(--text-body-sm)" }}>
          ×
        </span>
      )}
    </div>
  );
}
