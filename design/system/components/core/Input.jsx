import React from "react";

export function Input({ value, onChange, placeholder, type = "text", disabled = false, size = "md", icon = null, style }) {
  const [focused, setFocused] = React.useState(false);
  const h = size === "sm" ? 28 : 32;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        height: h,
        padding: "0 10px",
        boxSizing: "border-box",
        background: "var(--surface-input)",
        border: `1px solid ${focused ? "var(--border-focus)" : "var(--border-default)"}`,
        borderRadius: "var(--radius-sm)",
        opacity: disabled ? 0.5 : 1,
        transition: "border-color var(--duration-fast) var(--ease-out)",
        ...style,
      }}
    >
      {icon && <span style={{ display: "flex", color: "var(--text-tertiary)" }}>{icon}</span>}
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        type={type}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1,
          border: "none",
          outline: "none",
          background: "transparent",
          font: "var(--text-body-sm)",
          color: "var(--text-primary)",
        }}
      />
    </div>
  );
}
