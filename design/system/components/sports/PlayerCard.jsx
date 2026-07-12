import React from "react";

export function PlayerCard({ name, position, number, team, overall, stats, photo }) {
  return (
    <div
      style={{
        width: "240px",
        background: "var(--surface-panel)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
      }}
    >
      <div style={{ background: "var(--gradient-team-hero)", height: "88px", position: "relative" }}>
        <div
          style={{
            position: "absolute",
            left: "16px",
            bottom: "-28px",
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: photo ? `center/cover url(${photo})` : "var(--gray-3)",
            border: "3px solid var(--surface-panel)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            font: "700 var(--text-size-lg)/1 var(--font-sans)",
            color: "var(--text-tertiary)",
          }}
        >
          {!photo && name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
        </div>
        <div style={{ position: "absolute", right: "12px", top: "10px", font: "700 var(--text-size-2xl)/1 var(--font-mono)", color: "rgba(255,255,255,0.85)" }}>
          #{number}
        </div>
      </div>
      <div style={{ padding: "36px 16px 16px" }}>
        <div style={{ font: "var(--text-heading-sm)", color: "var(--text-primary)" }}>{name}</div>
        <div style={{ font: "var(--text-body-sm)", color: "var(--text-tertiary)", marginBottom: "12px" }}>
          {position} · {team}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <span style={{ font: "var(--text-label)", letterSpacing: "var(--text-tracking-wide)", textTransform: "uppercase", color: "var(--text-tertiary)" }}>
            Overall
          </span>
          <span style={{ font: "700 var(--text-size-xl)/1 var(--font-mono)", color: "var(--accent-primary)" }}>{overall}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
          {stats.map((s) => (
            <div key={s.label} style={{ textAlign: "center", padding: "6px 4px", background: "var(--surface-panel-raised)", borderRadius: "var(--radius-sm)" }}>
              <div style={{ font: "600 var(--text-size-sm)/1 var(--font-mono)", color: "var(--text-primary)" }}>{s.value}</div>
              <div style={{ font: "var(--text-label-wide)", color: "var(--text-tertiary)", marginTop: "2px" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
