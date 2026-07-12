import React from "react";

export function IconButton({ icon, size = "md", active = false, disabled = false, onClick, title }) {
  const dims = size === "sm" ? 28 : size === "lg" ? 40 : 32;
  const [hover, setHover] = React.useState(false);
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: dims,
        height: dims,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--radius-sm)",
        border: active ? "1px solid var(--border-selected)" : "1px solid transparent",
        background: active ? "var(--accent-primary-wash)" : hover ? "var(--surface-panel-raised)" : "transparent",
        color: active ? "var(--accent-primary)" : "var(--text-secondary)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "background var(--duration-fast) var(--ease-out)",
        boxSizing: "border-box",
      }}
    >
      {icon}
    </button>
  );
}
