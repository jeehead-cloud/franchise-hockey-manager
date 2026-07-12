import React from "react";

const toneMap = {
  neutral: { bg: "var(--gray-5)", fg: "var(--gray-9)" },
  info: { bg: "var(--accent-info-muted)", fg: "var(--accent-info)" },
  success: { bg: "var(--accent-success-muted)", fg: "var(--accent-success)" },
  danger: { bg: "var(--accent-danger-muted)", fg: "var(--accent-danger)" },
  primary: { bg: "var(--accent-primary-wash)", fg: "var(--accent-primary)" },
};

export function Badge({ children, tone = "neutral" }) {
  const t = toneMap[tone] || toneMap.neutral;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: "var(--radius-pill)",
        background: t.bg,
        color: t.fg,
        font: "var(--text-label-wide)",
        letterSpacing: "var(--text-tracking-wide)",
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}
