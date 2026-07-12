import React from "react";

export function PlayerTable({ players, onSelect, selectedId }) {
  const cols = [
    { key: "number", label: "#" },
    { key: "name", label: "Player" },
    { key: "pos", label: "Pos" },
    { key: "age", label: "Age" },
    { key: "ovr", label: "OVR" },
    { key: "status", label: "Status" },
  ];
  return (
    <div style={{ background: "var(--surface-panel)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th
                key={c.key}
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
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((p, i) => (
            <tr
              key={p.id}
              onClick={() => onSelect && onSelect(p.id)}
              style={{
                cursor: onSelect ? "pointer" : "default",
                background: p.id === selectedId ? "var(--accent-primary-wash)" : i % 2 ? "var(--surface-panel-raised)" : "transparent",
              }}
            >
              <td style={{ padding: "8px 12px", textAlign: "center", font: "var(--text-data-md)", color: "var(--text-tertiary)" }}>{p.number}</td>
              <td style={{ padding: "8px 12px", font: p.id === selectedId ? "600 var(--text-size-sm)/1 var(--font-sans)" : "var(--text-body-sm)", color: p.id === selectedId ? "var(--accent-primary)" : "var(--text-primary)" }}>
                {p.name}
              </td>
              <td style={{ padding: "8px 12px", textAlign: "center", font: "var(--text-data-md)", color: "var(--text-secondary)" }}>{p.pos}</td>
              <td style={{ padding: "8px 12px", textAlign: "center", font: "var(--text-data-md)", color: "var(--text-secondary)" }}>{p.age}</td>
              <td style={{ padding: "8px 12px", textAlign: "center", font: "600 var(--text-size-sm)/1 var(--font-mono)", color: "var(--text-primary)" }}>{p.ovr}</td>
              <td style={{ padding: "8px 12px", textAlign: "center" }}>
                <span
                  style={{
                    font: "var(--text-label-wide)",
                    letterSpacing: "var(--text-tracking-wide)",
                    textTransform: "uppercase",
                    padding: "2px 8px",
                    borderRadius: "var(--radius-pill)",
                    background: p.status === "Injured" ? "var(--accent-danger-muted)" : p.status === "Suspended" ? "var(--accent-warning-muted)" : "var(--accent-success-muted)",
                    color: p.status === "Injured" ? "var(--accent-danger)" : p.status === "Suspended" ? "var(--accent-warning)" : "var(--accent-success)",
                  }}
                >
                  {p.status || "Healthy"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
