import React from "react";

export function Tabs({ items, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: "2px", borderBottom: "1px solid var(--border-subtle)" }}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            onClick={() => onChange && onChange(item.value)}
            style={{
              padding: "8px 14px",
              font: "600 var(--text-size-sm)/1 var(--font-sans)",
              color: active ? "var(--text-primary)" : "var(--text-tertiary)",
              background: "transparent",
              border: "none",
              borderBottom: active ? "2px solid var(--accent-primary)" : "2px solid transparent",
              marginBottom: "-1px",
              cursor: "pointer",
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
