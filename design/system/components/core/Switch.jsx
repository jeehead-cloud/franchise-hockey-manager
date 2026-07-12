import React from "react";

export function Switch({ checked, onChange, disabled = false }) {
  return (
    <span
      role="switch"
      aria-checked={checked}
      onClick={disabled ? undefined : () => onChange && onChange(!checked)}
      style={{
        width: 34,
        height: 20,
        borderRadius: "var(--radius-pill)",
        background: checked ? "var(--accent-primary)" : "var(--gray-6)",
        display: "inline-flex",
        alignItems: "center",
        padding: "2px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background var(--duration-fast) var(--ease-out)",
        boxSizing: "border-box",
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "var(--gray-10)",
          transform: checked ? "translateX(14px)" : "translateX(0)",
          transition: "transform var(--duration-fast) var(--ease-out)",
        }}
      />
    </span>
  );
}
