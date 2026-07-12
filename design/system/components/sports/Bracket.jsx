import React from "react";

function Matchup({ top, bottom, roundLabel }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0", width: "160px" }}>
      {roundLabel && (
        <div style={{ font: "var(--text-label-wide)", letterSpacing: "var(--text-tracking-wide)", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "4px" }}>
          {roundLabel}
        </div>
      )}
      <div style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", overflow: "hidden", background: "var(--surface-panel)" }}>
        {[top, bottom].map((team, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "6px 10px",
              borderBottom: i === 0 ? "1px solid var(--border-subtle)" : "none",
              background: team.winner ? "var(--accent-primary-wash)" : "transparent",
              font: team.winner ? "600 var(--text-size-sm)/1 var(--font-sans)" : "var(--text-body-sm)",
              color: team.winner ? "var(--accent-primary)" : team.name ? "var(--text-primary)" : "var(--text-tertiary)",
            }}
          >
            <span>{team.name || "TBD"}</span>
            {team.score != null && <span style={{ font: "var(--text-data-md)" }}>{team.score}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Bracket({ rounds }) {
  return (
    <div style={{ display: "flex", gap: "40px", alignItems: "center", overflowX: "auto", padding: "8px" }}>
      {rounds.map((round, ri) => (
        <div
          key={round.label}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: `${24 * Math.pow(2, ri)}px`,
            justifyContent: "center",
            height: "100%",
          }}
        >
          {round.matchups.map((m, mi) => (
            <Matchup key={mi} top={m.top} bottom={m.bottom} roundLabel={mi === 0 ? round.label : null} />
          ))}
        </div>
      ))}
    </div>
  );
}
