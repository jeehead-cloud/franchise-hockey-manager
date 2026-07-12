import React from "react";

const toneMap = {
  primary: "var(--accent-primary)",
  info: "var(--accent-info)",
  success: "var(--accent-success)",
  danger: "var(--accent-danger)",
};

export function StatMeter({ label, value, max, tone = "primary" }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
        <span style={{ font: "var(--text-label)", letterSpacing: "var(--text-tracking-wide)", textTransform: "uppercase", color: "var(--text-tertiary)" }}>
          {label}
        </span>
        <span style={{ font: "var(--text-data-sm)", color: "var(--text-secondary)" }}>
          {value}/{max}
        </span>
      </div>
      <div style={{ height: "6px", borderRadius: "var(--radius-pill)", background: "var(--gray-5)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: toneMap[tone] || toneMap.primary, transition: "width var(--duration-normal) var(--ease-out)" }} />
      </div>
    </div>
  );
}
