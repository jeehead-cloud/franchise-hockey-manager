import React from "react";

const toneMap = {
  home: "var(--side-home)",
  away: "var(--side-away)",
  win: "var(--status-win)",
  loss: "var(--status-loss)",
  otl: "var(--status-otl)",
  neutral: "var(--gray-5)",
};

export function StatusPill({ tone = "neutral", label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", font: "var(--text-data-sm)", color: "var(--text-secondary)" }}>
      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: toneMap[tone] || toneMap.neutral, flexShrink: 0 }} />
      {label}
    </span>
  );
}
