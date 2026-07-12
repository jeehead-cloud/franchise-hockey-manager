import React from "react";

const sizeMap = {
  sm: { padding: "0 10px", height: "28px", font: "var(--text-label)" },
  md: { padding: "0 14px", height: "32px", font: "600 var(--text-size-sm)/1 var(--font-sans)" },
  lg: { padding: "0 18px", height: "40px", font: "600 var(--text-size-md)/1 var(--font-sans)" },
};

const variantMap = {
  primary: {
    background: "var(--accent-primary)",
    color: "var(--text-on-accent)",
    border: "1px solid transparent",
  },
  secondary: {
    background: "transparent",
    color: "var(--text-secondary)",
    border: "1px solid var(--border-default)",
  },
  ghost: {
    background: "transparent",
    color: "var(--text-secondary)",
    border: "1px solid transparent",
  },
  danger: {
    background: "var(--accent-danger)",
    color: "var(--text-on-accent)",
    border: "1px solid transparent",
  },
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  disabled = false,
  icon = null,
  onClick,
  style,
}) {
  const s = sizeMap[size] || sizeMap.md;
  const v = variantMap[variant] || variantMap.primary;
  const [hover, setHover] = React.useState(false);
  const [active, setActive] = React.useState(false);

  let background = v.background;
  if (!disabled && variant === "primary") background = active ? "var(--accent-primary-active)" : hover ? "var(--accent-primary-hover)" : v.background;
  if (!disabled && variant === "danger") background = hover ? "var(--accent-danger-hover)" : v.background;
  if (!disabled && (variant === "secondary" || variant === "ghost")) background = hover ? "var(--surface-panel-raised)" : v.background;

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setActive(false); }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "6px",
        padding: s.padding,
        height: s.height,
        font: s.font,
        letterSpacing: size === "sm" ? "var(--text-tracking-wide)" : "normal",
        textTransform: size === "sm" ? "uppercase" : "none",
        borderRadius: "var(--radius-md)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transition: "background var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out)",
        background,
        color: v.color,
        border: v.border,
        boxSizing: "border-box",
        ...style,
      }}
    >
      {icon}
      {children}
    </button>
  );
}
