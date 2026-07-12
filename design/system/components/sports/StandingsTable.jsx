import React from "react";

export function StandingsTable({ rows, highlightTeam }) {
  const cols = ["#", "Team", "GP", "W", "L", "OTL", "PTS", "DIFF"];
  return (
    <div style={{ background: "var(--surface-panel)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th
                key={c}
                style={{
                  textAlign: i === 1 ? "left" : "center",
                  padding: "8px 12px",
                  font: "var(--text-label)",
                  letterSpacing: "var(--text-tracking-wide)",
                  textTransform: "uppercase",
                  color: "var(--text-tertiary)",
                  borderBottom: "1px solid var(--border-default)",
                  background: "var(--surface-panel-raised)",
                }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.team}
              style={{
                background: r.team === highlightTeam ? "var(--accent-primary-wash)" : i % 2 ? "var(--surface-panel-raised)" : "transparent",
              }}
            >
              <td style={{ padding: "8px 12px", font: "var(--text-data-md)", color: "var(--text-tertiary)", textAlign: "center" }}>{i + 1}</td>
              <td style={{ padding: "8px 12px", font: r.team === highlightTeam ? "600 var(--text-size-sm)/1 var(--font-sans)" : "var(--text-body-sm)", color: r.team === highlightTeam ? "var(--accent-primary)" : "var(--text-primary)" }}>
                {r.team}
              </td>
              <td style={{ padding: "8px 12px", font: "var(--text-data-md)", textAlign: "center", color: "var(--text-secondary)" }}>{r.gp}</td>
              <td style={{ padding: "8px 12px", font: "var(--text-data-md)", textAlign: "center", color: "var(--text-secondary)" }}>{r.w}</td>
              <td style={{ padding: "8px 12px", font: "var(--text-data-md)", textAlign: "center", color: "var(--text-secondary)" }}>{r.l}</td>
              <td style={{ padding: "8px 12px", font: "var(--text-data-md)", textAlign: "center", color: "var(--text-secondary)" }}>{r.otl}</td>
              <td style={{ padding: "8px 12px", font: "600 var(--text-size-sm)/1 var(--font-mono)", textAlign: "center", color: "var(--text-primary)" }}>{r.pts}</td>
              <td style={{ padding: "8px 12px", font: "var(--text-data-md)", textAlign: "center", color: r.diff > 0 ? "var(--accent-success)" : r.diff < 0 ? "var(--accent-danger)" : "var(--text-tertiary)" }}>
                {r.diff > 0 ? `+${r.diff}` : r.diff}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
