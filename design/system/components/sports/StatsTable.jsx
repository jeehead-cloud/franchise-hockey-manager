import React from "react";

export function StatsTable({ columns, rows, highlightId }) {
  return (
    <div style={{ background: "var(--surface-panel)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th
                key={c.key}
                style={{
                  textAlign: i === 0 ? "left" : "center",
                  padding: "8px 12px",
                  font: "var(--text-label)",
                  letterSpacing: "var(--text-tracking-wide)",
                  textTransform: "uppercase",
                  color: "var(--text-tertiary)",
                  borderBottom: "1px solid var(--border-default)",
                  background: "var(--surface-panel-raised)",
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} style={{ background: r.id === highlightId ? "var(--accent-primary-wash)" : i % 2 ? "var(--surface-panel-raised)" : "transparent" }}>
              {columns.map((c, ci) => (
                <td
                  key={c.key}
                  style={{
                    padding: "8px 12px",
                    textAlign: ci === 0 ? "left" : "center",
                    font: ci === 0 ? "var(--text-body-sm)" : "var(--text-data-md)",
                    color: r.id === highlightId ? "var(--accent-primary)" : ci === 0 ? "var(--text-primary)" : "var(--text-secondary)",
                  }}
                >
                  {r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
