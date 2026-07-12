import React from "react";

export function Tooltip({ children, label, side = "top" }) {
  const [show, setShow] = React.useState(false);
  const pos =
    side === "top"
      ? { bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)" }
      : side === "bottom"
      ? { top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)" }
      : side === "left"
      ? { right: "calc(100% + 6px)", top: "50%", transform: "translateY(-50%)" }
      : { left: "calc(100% + 6px)", top: "50%", transform: "translateY(-50%)" };

  return (
    <span
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          style={{
            position: "absolute",
            ...pos,
            background: "var(--gray-1)",
            color: "var(--text-primary)",
            font: "var(--text-data-sm)",
            padding: "4px 8px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-subtle)",
            whiteSpace: "nowrap",
            zIndex: 50,
            boxShadow: "var(--shadow-sm)",
          }}
        >
          {label}
        </span>
      )}
    </span>
  );
}
