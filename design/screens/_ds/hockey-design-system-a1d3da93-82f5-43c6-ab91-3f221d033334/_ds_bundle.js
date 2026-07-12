/* @ds-bundle: {"format":4,"namespace":"AtlasDesignSystem_b2128a","components":[{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Checkbox","sourcePath":"components/core/Checkbox.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"Radio","sourcePath":"components/core/Radio.jsx"},{"name":"Select","sourcePath":"components/core/Select.jsx"},{"name":"Switch","sourcePath":"components/core/Switch.jsx"},{"name":"Tabs","sourcePath":"components/core/Tabs.jsx"},{"name":"Tooltip","sourcePath":"components/core/Tooltip.jsx"},{"name":"Badge","sourcePath":"components/feedback/Badge.jsx"},{"name":"Dialog","sourcePath":"components/feedback/Dialog.jsx"},{"name":"Tag","sourcePath":"components/feedback/Tag.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Panel","sourcePath":"components/game/Panel.jsx"},{"name":"StatMeter","sourcePath":"components/game/StatMeter.jsx"},{"name":"StatusPill","sourcePath":"components/game/StatusPill.jsx"},{"name":"Bracket","sourcePath":"components/sports/Bracket.jsx"},{"name":"PlayerCard","sourcePath":"components/sports/PlayerCard.jsx"},{"name":"PlayerTable","sourcePath":"components/sports/PlayerTable.jsx"},{"name":"StandingsTable","sourcePath":"components/sports/StandingsTable.jsx"},{"name":"StatsTable","sourcePath":"components/sports/StatsTable.jsx"}],"sourceHashes":{"components/core/Button.jsx":"69418c88b635","components/core/Checkbox.jsx":"ccee7ca0dc69","components/core/IconButton.jsx":"5377d69c211c","components/core/Input.jsx":"c44c3a8cf2db","components/core/Radio.jsx":"40ad87d8983e","components/core/Select.jsx":"3bf23db6a4dd","components/core/Switch.jsx":"8d89dfb18611","components/core/Tabs.jsx":"3b32cbb4f9a9","components/core/Tooltip.jsx":"d72978c1eab6","components/feedback/Badge.jsx":"74665f71ffe8","components/feedback/Dialog.jsx":"b6d945dfec5f","components/feedback/Tag.jsx":"43c213f32b70","components/feedback/Toast.jsx":"65ae327fe509","components/game/Panel.jsx":"42a86e28775e","components/game/StatMeter.jsx":"bd9ce6b030eb","components/game/StatusPill.jsx":"4e7b26f57304","components/sports/Bracket.jsx":"e2ba56ae2c47","components/sports/PlayerCard.jsx":"f266a8cd56c2","components/sports/PlayerTable.jsx":"7513d4725734","components/sports/StandingsTable.jsx":"00eb9ccd5535","components/sports/StatsTable.jsx":"339167b214ce","ui_kits/team-manager/app.jsx":"9cc71a9c2373"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.AtlasDesignSystem_b2128a = window.AtlasDesignSystem_b2128a || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Button.jsx
try { (() => {
const sizeMap = {
  sm: {
    padding: "0 10px",
    height: "28px",
    font: "var(--text-label)"
  },
  md: {
    padding: "0 14px",
    height: "32px",
    font: "600 var(--text-size-sm)/1 var(--font-sans)"
  },
  lg: {
    padding: "0 18px",
    height: "40px",
    font: "600 var(--text-size-md)/1 var(--font-sans)"
  }
};
const variantMap = {
  primary: {
    background: "var(--accent-primary)",
    color: "var(--text-on-accent)",
    border: "1px solid transparent"
  },
  secondary: {
    background: "transparent",
    color: "var(--text-secondary)",
    border: "1px solid var(--border-default)"
  },
  ghost: {
    background: "transparent",
    color: "var(--text-secondary)",
    border: "1px solid transparent"
  },
  danger: {
    background: "var(--accent-danger)",
    color: "var(--text-on-accent)",
    border: "1px solid transparent"
  }
};
function Button({
  children,
  variant = "primary",
  size = "md",
  disabled = false,
  icon = null,
  onClick,
  style
}) {
  const s = sizeMap[size] || sizeMap.md;
  const v = variantMap[variant] || variantMap.primary;
  const [hover, setHover] = React.useState(false);
  const [active, setActive] = React.useState(false);
  let background = v.background;
  if (!disabled && variant === "primary") background = active ? "var(--accent-primary-active)" : hover ? "var(--accent-primary-hover)" : v.background;
  if (!disabled && variant === "danger") background = hover ? "var(--accent-danger-hover)" : v.background;
  if (!disabled && (variant === "secondary" || variant === "ghost")) background = hover ? "var(--surface-panel-raised)" : v.background;
  return /*#__PURE__*/React.createElement("button", {
    onClick: disabled ? undefined : onClick,
    disabled: disabled,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setActive(false);
    },
    onMouseDown: () => setActive(true),
    onMouseUp: () => setActive(false),
    style: {
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
      ...style
    }
  }, icon, children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Checkbox.jsx
try { (() => {
function Checkbox({
  checked,
  onChange,
  label,
  disabled = false
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "8px",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1
    }
  }, /*#__PURE__*/React.createElement("span", {
    onClick: disabled ? undefined : () => onChange && onChange(!checked),
    style: {
      width: 16,
      height: 16,
      borderRadius: "3px",
      border: checked ? "1px solid var(--accent-primary)" : "1px solid var(--border-default)",
      background: checked ? "var(--accent-primary)" : "var(--surface-input)",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "background var(--duration-fast) var(--ease-out)"
    }
  }, checked && /*#__PURE__*/React.createElement("svg", {
    width: "10",
    height: "10",
    viewBox: "0 0 10 10",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1.5 5L4 7.5L8.5 2.5",
    stroke: "var(--text-on-accent)",
    strokeWidth: "1.6",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), label && /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--text-body-sm)",
      color: "var(--text-secondary)"
    }
  }, label));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function IconButton({
  icon,
  size = "md",
  active = false,
  disabled = false,
  onClick,
  title
}) {
  const dims = size === "sm" ? 28 : size === "lg" ? 40 : 32;
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", {
    title: title,
    disabled: disabled,
    onClick: disabled ? undefined : onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
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
      boxSizing: "border-box"
    }
  }, icon);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  disabled = false,
  size = "md",
  icon = null,
  style
}) {
  const [focused, setFocused] = React.useState(false);
  const h = size === "sm" ? 28 : 32;
  return /*#__PURE__*/React.createElement("div", {
    style: {
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
      ...style
    }
  }, icon && /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      color: "var(--text-tertiary)"
    }
  }, icon), /*#__PURE__*/React.createElement("input", {
    value: value,
    onChange: onChange,
    placeholder: placeholder,
    type: type,
    disabled: disabled,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    style: {
      flex: 1,
      border: "none",
      outline: "none",
      background: "transparent",
      font: "var(--text-body-sm)",
      color: "var(--text-primary)"
    }
  }));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/core/Radio.jsx
try { (() => {
function Radio({
  checked,
  onChange,
  label,
  disabled = false
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "8px",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1
    }
  }, /*#__PURE__*/React.createElement("span", {
    onClick: disabled ? undefined : () => onChange && onChange(),
    style: {
      width: 16,
      height: 16,
      borderRadius: "50%",
      border: checked ? "1px solid var(--accent-primary)" : "1px solid var(--border-default)",
      background: "var(--surface-input)",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, checked && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: "var(--accent-primary)"
    }
  })), label && /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--text-body-sm)",
      color: "var(--text-secondary)"
    }
  }, label));
}
Object.assign(__ds_scope, { Radio });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Radio.jsx", error: String((e && e.message) || e) }); }

// components/core/Select.jsx
try { (() => {
function Select({
  value,
  onChange,
  options,
  size = "md",
  disabled = false,
  style
}) {
  const h = size === "sm" ? 28 : 32;
  return /*#__PURE__*/React.createElement("select", {
    value: value,
    onChange: onChange,
    disabled: disabled,
    style: {
      height: h,
      padding: "0 10px",
      boxSizing: "border-box",
      background: "var(--surface-input)",
      border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-sm)",
      color: "var(--text-primary)",
      font: "var(--text-body-sm)",
      opacity: disabled ? 0.5 : 1,
      cursor: disabled ? "not-allowed" : "pointer",
      ...style
    }
  }, options.map(opt => /*#__PURE__*/React.createElement("option", {
    key: opt.value,
    value: opt.value
  }, opt.label)));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Select.jsx", error: String((e && e.message) || e) }); }

// components/core/Switch.jsx
try { (() => {
function Switch({
  checked,
  onChange,
  disabled = false
}) {
  return /*#__PURE__*/React.createElement("span", {
    role: "switch",
    "aria-checked": checked,
    onClick: disabled ? undefined : () => onChange && onChange(!checked),
    style: {
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
      boxSizing: "border-box"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 16,
      height: 16,
      borderRadius: "50%",
      background: "var(--gray-10)",
      transform: checked ? "translateX(14px)" : "translateX(0)",
      transition: "transform var(--duration-fast) var(--ease-out)"
    }
  }));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Switch.jsx", error: String((e && e.message) || e) }); }

// components/core/Tabs.jsx
try { (() => {
function Tabs({
  items,
  value,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "2px",
      borderBottom: "1px solid var(--border-subtle)"
    }
  }, items.map(item => {
    const active = item.value === value;
    return /*#__PURE__*/React.createElement("button", {
      key: item.value,
      onClick: () => onChange && onChange(item.value),
      style: {
        padding: "8px 14px",
        font: "600 var(--text-size-sm)/1 var(--font-sans)",
        color: active ? "var(--text-primary)" : "var(--text-tertiary)",
        background: "transparent",
        border: "none",
        borderBottom: active ? "2px solid var(--accent-primary)" : "2px solid transparent",
        marginBottom: "-1px",
        cursor: "pointer"
      }
    }, item.label);
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/core/Tooltip.jsx
try { (() => {
function Tooltip({
  children,
  label,
  side = "top"
}) {
  const [show, setShow] = React.useState(false);
  const pos = side === "top" ? {
    bottom: "calc(100% + 6px)",
    left: "50%",
    transform: "translateX(-50%)"
  } : side === "bottom" ? {
    top: "calc(100% + 6px)",
    left: "50%",
    transform: "translateX(-50%)"
  } : side === "left" ? {
    right: "calc(100% + 6px)",
    top: "50%",
    transform: "translateY(-50%)"
  } : {
    left: "calc(100% + 6px)",
    top: "50%",
    transform: "translateY(-50%)"
  };
  return /*#__PURE__*/React.createElement("span", {
    style: {
      position: "relative",
      display: "inline-flex"
    },
    onMouseEnter: () => setShow(true),
    onMouseLeave: () => setShow(false)
  }, children, show && /*#__PURE__*/React.createElement("span", {
    style: {
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
      boxShadow: "var(--shadow-sm)"
    }
  }, label));
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tooltip.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Badge.jsx
try { (() => {
const toneMap = {
  neutral: {
    bg: "var(--gray-5)",
    fg: "var(--gray-9)"
  },
  info: {
    bg: "var(--accent-info-muted)",
    fg: "var(--accent-info)"
  },
  success: {
    bg: "var(--accent-success-muted)",
    fg: "var(--accent-success)"
  },
  danger: {
    bg: "var(--accent-danger-muted)",
    fg: "var(--accent-danger)"
  },
  primary: {
    bg: "var(--accent-primary-wash)",
    fg: "var(--accent-primary)"
  }
};
function Badge({
  children,
  tone = "neutral"
}) {
  const t = toneMap[tone] || toneMap.neutral;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      padding: "2px 8px",
      borderRadius: "var(--radius-pill)",
      background: t.bg,
      color: t.fg,
      font: "var(--text-label-wide)",
      letterSpacing: "var(--text-tracking-wide)",
      textTransform: "uppercase"
    }
  }, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Badge.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Dialog.jsx
try { (() => {
function Dialog({
  open,
  title,
  children,
  footer,
  onClose
}) {
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "var(--surface-overlay)",
      backdropFilter: "var(--blur-scrim)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 100
    },
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      width: "380px",
      background: "var(--surface-panel)",
      border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-lg)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "16px",
      borderBottom: "1px solid var(--border-subtle)",
      font: "var(--text-heading-sm)",
      color: "var(--text-primary)"
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "16px",
      font: "var(--text-body)",
      color: "var(--text-secondary)"
    }
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "12px 16px",
      borderTop: "1px solid var(--border-subtle)",
      display: "flex",
      justifyContent: "flex-end",
      gap: "8px"
    }
  }, footer)));
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Tag.jsx
try { (() => {
function Tag({
  children,
  onRemove
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      padding: "3px 8px",
      borderRadius: "var(--radius-sm)",
      background: "var(--surface-panel-raised)",
      border: "1px solid var(--border-subtle)",
      color: "var(--text-secondary)",
      font: "var(--text-body-sm)"
    }
  }, children, onRemove && /*#__PURE__*/React.createElement("span", {
    onClick: onRemove,
    style: {
      cursor: "pointer",
      color: "var(--text-tertiary)",
      fontSize: "12px",
      lineHeight: 1
    }
  }, "\xD7"));
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Tag.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
const toneMap = {
  info: "var(--accent-info)",
  success: "var(--accent-success)",
  danger: "var(--accent-danger)"
};
function Toast({
  tone = "info",
  title,
  message,
  onClose
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "10px",
      alignItems: "flex-start",
      width: "300px",
      padding: "12px",
      borderRadius: "var(--radius-md)",
      background: "var(--surface-panel)",
      border: "1px solid var(--border-default)",
      borderLeft: `3px solid ${toneMap[tone] || toneMap.info}`,
      boxShadow: "var(--shadow-md)",
      boxSizing: "border-box"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    style: {
      font: "600 var(--text-size-sm)/1.3 var(--font-sans)",
      color: "var(--text-primary)",
      marginBottom: "2px"
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--text-body-sm)",
      color: "var(--text-secondary)"
    }
  }, message)), onClose && /*#__PURE__*/React.createElement("span", {
    onClick: onClose,
    style: {
      cursor: "pointer",
      color: "var(--text-tertiary)",
      font: "var(--text-body-sm)"
    }
  }, "\xD7"));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/game/Panel.jsx
try { (() => {
function Panel({
  title,
  actions,
  children,
  width = "var(--panel-width-md)"
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      background: "var(--surface-panel)",
      border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-md)",
      boxShadow: "var(--shadow-md)",
      overflow: "hidden",
      boxSizing: "border-box"
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "10px 12px",
      borderBottom: "1px solid var(--border-subtle)",
      background: "var(--surface-panel-raised)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--text-label-wide)",
      letterSpacing: "var(--text-tracking-wide)",
      textTransform: "uppercase",
      color: "var(--text-tertiary)"
    }
  }, title), actions && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "4px"
    }
  }, actions)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "12px"
    }
  }, children));
}
Object.assign(__ds_scope, { Panel });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/game/Panel.jsx", error: String((e && e.message) || e) }); }

// components/game/StatMeter.jsx
try { (() => {
const toneMap = {
  primary: "var(--accent-primary)",
  info: "var(--accent-info)",
  success: "var(--accent-success)",
  danger: "var(--accent-danger)"
};
function StatMeter({
  label,
  value,
  max,
  tone = "primary"
}) {
  const pct = Math.max(0, Math.min(100, value / max * 100));
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      marginBottom: "4px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--text-label)",
      letterSpacing: "var(--text-tracking-wide)",
      textTransform: "uppercase",
      color: "var(--text-tertiary)"
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--text-data-sm)",
      color: "var(--text-secondary)"
    }
  }, value, "/", max)), /*#__PURE__*/React.createElement("div", {
    style: {
      height: "6px",
      borderRadius: "var(--radius-pill)",
      background: "var(--gray-5)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      width: `${pct}%`,
      background: toneMap[tone] || toneMap.primary,
      transition: "width var(--duration-normal) var(--ease-out)"
    }
  })));
}
Object.assign(__ds_scope, { StatMeter });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/game/StatMeter.jsx", error: String((e && e.message) || e) }); }

// components/game/StatusPill.jsx
try { (() => {
const toneMap = {
  home: "var(--side-home)",
  away: "var(--side-away)",
  win: "var(--status-win)",
  loss: "var(--status-loss)",
  otl: "var(--status-otl)",
  neutral: "var(--gray-5)"
};
function StatusPill({
  tone = "neutral",
  label
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      font: "var(--text-data-sm)",
      color: "var(--text-secondary)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: "8px",
      height: "8px",
      borderRadius: "50%",
      background: toneMap[tone] || toneMap.neutral,
      flexShrink: 0
    }
  }), label);
}
Object.assign(__ds_scope, { StatusPill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/game/StatusPill.jsx", error: String((e && e.message) || e) }); }

// components/sports/Bracket.jsx
try { (() => {
function Matchup({
  top,
  bottom,
  roundLabel
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "0",
      width: "160px"
    }
  }, roundLabel && /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--text-label-wide)",
      letterSpacing: "var(--text-tracking-wide)",
      textTransform: "uppercase",
      color: "var(--text-tertiary)",
      marginBottom: "4px"
    }
  }, roundLabel), /*#__PURE__*/React.createElement("div", {
    style: {
      border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-sm)",
      overflow: "hidden",
      background: "var(--surface-panel)"
    }
  }, [top, bottom].map((team, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      justifyContent: "space-between",
      padding: "6px 10px",
      borderBottom: i === 0 ? "1px solid var(--border-subtle)" : "none",
      background: team.winner ? "var(--accent-primary-wash)" : "transparent",
      font: team.winner ? "600 var(--text-size-sm)/1 var(--font-sans)" : "var(--text-body-sm)",
      color: team.winner ? "var(--accent-primary)" : team.name ? "var(--text-primary)" : "var(--text-tertiary)"
    }
  }, /*#__PURE__*/React.createElement("span", null, team.name || "TBD"), team.score != null && /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--text-data-md)"
    }
  }, team.score)))));
}
function Bracket({
  rounds
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "40px",
      alignItems: "center",
      overflowX: "auto",
      padding: "8px"
    }
  }, rounds.map((round, ri) => /*#__PURE__*/React.createElement("div", {
    key: round.label,
    style: {
      display: "flex",
      flexDirection: "column",
      gap: `${24 * Math.pow(2, ri)}px`,
      justifyContent: "center",
      height: "100%"
    }
  }, round.matchups.map((m, mi) => /*#__PURE__*/React.createElement(Matchup, {
    key: mi,
    top: m.top,
    bottom: m.bottom,
    roundLabel: mi === 0 ? round.label : null
  })))));
}
Object.assign(__ds_scope, { Bracket });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/sports/Bracket.jsx", error: String((e && e.message) || e) }); }

// components/sports/PlayerCard.jsx
try { (() => {
function PlayerCard({
  name,
  position,
  number,
  team,
  overall,
  stats,
  photo
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: "240px",
      background: "var(--surface-panel)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-sm)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--gradient-team-hero)",
      height: "88px",
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: "16px",
      bottom: "-28px",
      width: "56px",
      height: "56px",
      borderRadius: "50%",
      background: photo ? `center/cover url(${photo})` : "var(--gray-3)",
      border: "3px solid var(--surface-panel)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      font: "700 var(--text-size-lg)/1 var(--font-sans)",
      color: "var(--text-tertiary)"
    }
  }, !photo && name.split(" ").map(n => n[0]).join("").slice(0, 2)), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      right: "12px",
      top: "10px",
      font: "700 var(--text-size-2xl)/1 var(--font-mono)",
      color: "rgba(255,255,255,0.85)"
    }
  }, "#", number)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "36px 16px 16px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--text-heading-sm)",
      color: "var(--text-primary)"
    }
  }, name), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--text-body-sm)",
      color: "var(--text-tertiary)",
      marginBottom: "12px"
    }
  }, position, " \xB7 ", team), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "10px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--text-label)",
      letterSpacing: "var(--text-tracking-wide)",
      textTransform: "uppercase",
      color: "var(--text-tertiary)"
    }
  }, "Overall"), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "700 var(--text-size-xl)/1 var(--font-mono)",
      color: "var(--accent-primary)"
    }
  }, overall)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: "8px"
    }
  }, stats.map(s => /*#__PURE__*/React.createElement("div", {
    key: s.label,
    style: {
      textAlign: "center",
      padding: "6px 4px",
      background: "var(--surface-panel-raised)",
      borderRadius: "var(--radius-sm)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "600 var(--text-size-sm)/1 var(--font-mono)",
      color: "var(--text-primary)"
    }
  }, s.value), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--text-label-wide)",
      color: "var(--text-tertiary)",
      marginTop: "2px"
    }
  }, s.label))))));
}
Object.assign(__ds_scope, { PlayerCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/sports/PlayerCard.jsx", error: String((e && e.message) || e) }); }

// components/sports/PlayerTable.jsx
try { (() => {
function PlayerTable({
  players,
  onSelect,
  selectedId
}) {
  const cols = [{
    key: "number",
    label: "#"
  }, {
    key: "name",
    label: "Player"
  }, {
    key: "pos",
    label: "Pos"
  }, {
    key: "age",
    label: "Age"
  }, {
    key: "ovr",
    label: "OVR"
  }, {
    key: "status",
    label: "Status"
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--surface-panel)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-md)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse"
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, cols.map((c, i) => /*#__PURE__*/React.createElement("th", {
    key: c.key,
    style: {
      textAlign: i === 1 ? "left" : "center",
      padding: "8px 12px",
      font: "var(--text-label)",
      letterSpacing: "var(--text-tracking-wide)",
      textTransform: "uppercase",
      color: "var(--text-tertiary)",
      borderBottom: "1px solid var(--border-default)",
      background: "var(--surface-panel-raised)"
    }
  }, c.label)))), /*#__PURE__*/React.createElement("tbody", null, players.map((p, i) => /*#__PURE__*/React.createElement("tr", {
    key: p.id,
    onClick: () => onSelect && onSelect(p.id),
    style: {
      cursor: onSelect ? "pointer" : "default",
      background: p.id === selectedId ? "var(--accent-primary-wash)" : i % 2 ? "var(--surface-panel-raised)" : "transparent"
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "8px 12px",
      textAlign: "center",
      font: "var(--text-data-md)",
      color: "var(--text-tertiary)"
    }
  }, p.number), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "8px 12px",
      font: p.id === selectedId ? "600 var(--text-size-sm)/1 var(--font-sans)" : "var(--text-body-sm)",
      color: p.id === selectedId ? "var(--accent-primary)" : "var(--text-primary)"
    }
  }, p.name), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "8px 12px",
      textAlign: "center",
      font: "var(--text-data-md)",
      color: "var(--text-secondary)"
    }
  }, p.pos), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "8px 12px",
      textAlign: "center",
      font: "var(--text-data-md)",
      color: "var(--text-secondary)"
    }
  }, p.age), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "8px 12px",
      textAlign: "center",
      font: "600 var(--text-size-sm)/1 var(--font-mono)",
      color: "var(--text-primary)"
    }
  }, p.ovr), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "8px 12px",
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--text-label-wide)",
      letterSpacing: "var(--text-tracking-wide)",
      textTransform: "uppercase",
      padding: "2px 8px",
      borderRadius: "var(--radius-pill)",
      background: p.status === "Injured" ? "var(--accent-danger-muted)" : p.status === "Suspended" ? "var(--accent-warning-muted)" : "var(--accent-success-muted)",
      color: p.status === "Injured" ? "var(--accent-danger)" : p.status === "Suspended" ? "var(--accent-warning)" : "var(--accent-success)"
    }
  }, p.status || "Healthy")))))));
}
Object.assign(__ds_scope, { PlayerTable });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/sports/PlayerTable.jsx", error: String((e && e.message) || e) }); }

// components/sports/StandingsTable.jsx
try { (() => {
function StandingsTable({
  rows,
  highlightTeam
}) {
  const cols = ["#", "Team", "GP", "W", "L", "OTL", "PTS", "DIFF"];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--surface-panel)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-md)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse"
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, cols.map((c, i) => /*#__PURE__*/React.createElement("th", {
    key: c,
    style: {
      textAlign: i === 1 ? "left" : "center",
      padding: "8px 12px",
      font: "var(--text-label)",
      letterSpacing: "var(--text-tracking-wide)",
      textTransform: "uppercase",
      color: "var(--text-tertiary)",
      borderBottom: "1px solid var(--border-default)",
      background: "var(--surface-panel-raised)"
    }
  }, c)))), /*#__PURE__*/React.createElement("tbody", null, rows.map((r, i) => /*#__PURE__*/React.createElement("tr", {
    key: r.team,
    style: {
      background: r.team === highlightTeam ? "var(--accent-primary-wash)" : i % 2 ? "var(--surface-panel-raised)" : "transparent"
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "8px 12px",
      font: "var(--text-data-md)",
      color: "var(--text-tertiary)",
      textAlign: "center"
    }
  }, i + 1), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "8px 12px",
      font: r.team === highlightTeam ? "600 var(--text-size-sm)/1 var(--font-sans)" : "var(--text-body-sm)",
      color: r.team === highlightTeam ? "var(--accent-primary)" : "var(--text-primary)"
    }
  }, r.team), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "8px 12px",
      font: "var(--text-data-md)",
      textAlign: "center",
      color: "var(--text-secondary)"
    }
  }, r.gp), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "8px 12px",
      font: "var(--text-data-md)",
      textAlign: "center",
      color: "var(--text-secondary)"
    }
  }, r.w), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "8px 12px",
      font: "var(--text-data-md)",
      textAlign: "center",
      color: "var(--text-secondary)"
    }
  }, r.l), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "8px 12px",
      font: "var(--text-data-md)",
      textAlign: "center",
      color: "var(--text-secondary)"
    }
  }, r.otl), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "8px 12px",
      font: "600 var(--text-size-sm)/1 var(--font-mono)",
      textAlign: "center",
      color: "var(--text-primary)"
    }
  }, r.pts), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "8px 12px",
      font: "var(--text-data-md)",
      textAlign: "center",
      color: r.diff > 0 ? "var(--accent-success)" : r.diff < 0 ? "var(--accent-danger)" : "var(--text-tertiary)"
    }
  }, r.diff > 0 ? `+${r.diff}` : r.diff))))));
}
Object.assign(__ds_scope, { StandingsTable });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/sports/StandingsTable.jsx", error: String((e && e.message) || e) }); }

// components/sports/StatsTable.jsx
try { (() => {
function StatsTable({
  columns,
  rows,
  highlightId
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--surface-panel)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-md)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse"
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, columns.map((c, i) => /*#__PURE__*/React.createElement("th", {
    key: c.key,
    style: {
      textAlign: i === 0 ? "left" : "center",
      padding: "8px 12px",
      font: "var(--text-label)",
      letterSpacing: "var(--text-tracking-wide)",
      textTransform: "uppercase",
      color: "var(--text-tertiary)",
      borderBottom: "1px solid var(--border-default)",
      background: "var(--surface-panel-raised)"
    }
  }, c.label)))), /*#__PURE__*/React.createElement("tbody", null, rows.map((r, i) => /*#__PURE__*/React.createElement("tr", {
    key: r.id,
    style: {
      background: r.id === highlightId ? "var(--accent-primary-wash)" : i % 2 ? "var(--surface-panel-raised)" : "transparent"
    }
  }, columns.map((c, ci) => /*#__PURE__*/React.createElement("td", {
    key: c.key,
    style: {
      padding: "8px 12px",
      textAlign: ci === 0 ? "left" : "center",
      font: ci === 0 ? "var(--text-body-sm)" : "var(--text-data-md)",
      color: r.id === highlightId ? "var(--accent-primary)" : ci === 0 ? "var(--text-primary)" : "var(--text-secondary)"
    }
  }, r[c.key])))))));
}
Object.assign(__ds_scope, { StatsTable });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/sports/StatsTable.jsx", error: String((e && e.message) || e) }); }

// ui_kits/team-manager/app.jsx
try { (() => {
const {
  Button,
  IconButton,
  Input,
  Badge,
  Panel,
  StatMeter,
  StatusPill,
  Tooltip,
  StandingsTable,
  StatsTable,
  PlayerTable,
  PlayerCard,
  Bracket
} = window.AtlasDesignSystem_b2128a;
function toKebab(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Za-z])([0-9])/g, "$1-$2").toLowerCase();
}
function Icon({
  name,
  size = 16
}) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current && window.lucide) {
      ref.current.innerHTML = "";
      const i = document.createElement("i");
      i.setAttribute("data-lucide", toKebab(name));
      i.style.width = size + "px";
      i.style.height = size + "px";
      ref.current.appendChild(i);
      window.lucide.createIcons({
        icons: window.lucide.icons,
        attrs: {
          width: size,
          height: size,
          "stroke-width": 1.75
        },
        root: ref.current
      });
    }
  }, [name, size]);
  return /*#__PURE__*/React.createElement("span", {
    ref: ref,
    style: {
      display: "inline-flex",
      color: "inherit"
    }
  });
}
const TEAM = "Ironclad HC";
const standings = [{
  team: "Ironclad HC",
  gp: 62,
  w: 41,
  l: 15,
  otl: 6,
  pts: 88,
  diff: 34
}, {
  team: "Northgate Wolves",
  gp: 62,
  w: 37,
  l: 19,
  otl: 6,
  pts: 80,
  diff: 21
}, {
  team: "Harbor City SC",
  gp: 62,
  w: 30,
  l: 24,
  otl: 8,
  pts: 68,
  diff: -4
}, {
  team: "Summit Rangers",
  gp: 62,
  w: 28,
  l: 27,
  otl: 7,
  pts: 63,
  diff: -9
}, {
  team: "Redline Athletic",
  gp: 62,
  w: 24,
  l: 31,
  otl: 7,
  pts: 55,
  diff: -22
}];
const scorers = [{
  id: 1,
  name: "A. Kessler",
  gp: 62,
  g: 34,
  a: 41,
  pts: 75
}, {
  id: 2,
  name: "M. Doyle",
  gp: 60,
  g: 29,
  a: 38,
  pts: 67
}, {
  id: 3,
  name: "J. Farrow",
  gp: 58,
  g: 25,
  a: 30,
  pts: 55
}];
const roster = [{
  id: 1,
  number: 17,
  name: "A. Kessler",
  pos: "C",
  age: 27,
  ovr: 87,
  status: "Healthy"
}, {
  id: 2,
  number: 4,
  name: "R. Novak",
  pos: "D",
  age: 31,
  ovr: 81,
  status: "Injured"
}, {
  id: 3,
  number: 29,
  name: "T. Whitfield",
  pos: "G",
  age: 24,
  ovr: 84,
  status: "Healthy"
}, {
  id: 4,
  number: 91,
  name: "M. Doyle",
  pos: "LW",
  age: 26,
  ovr: 85,
  status: "Healthy"
}, {
  id: 5,
  number: 8,
  name: "D. Aro",
  pos: "D",
  age: 29,
  ovr: 78,
  status: "Suspended"
}];
const bracketRounds = [{
  label: "Quarterfinal",
  matchups: [{
    top: {
      name: "Ironclad HC",
      score: 4,
      winner: true
    },
    bottom: {
      name: "Northgate Wolves",
      score: 1
    }
  }, {
    top: {
      name: "Harbor City SC",
      score: 2
    },
    bottom: {
      name: "Summit Rangers",
      score: 3,
      winner: true
    }
  }, {
    top: {
      name: "Redline Athletic",
      score: 1
    },
    bottom: {
      name: "Bay Union",
      score: 4,
      winner: true
    }
  }, {
    top: {
      name: "Frost Valley",
      score: 3,
      winner: true
    },
    bottom: {
      name: "Coastal FC",
      score: 0
    }
  }]
}, {
  label: "Semifinal",
  matchups: [{
    top: {
      name: "Ironclad HC",
      score: 3,
      winner: true
    },
    bottom: {
      name: "Summit Rangers",
      score: 2
    }
  }, {
    top: {
      name: "Bay Union",
      score: 1
    },
    bottom: {
      name: "Frost Valley",
      score: 4,
      winner: true
    }
  }]
}, {
  label: "Final",
  matchups: [{
    top: {},
    bottom: {}
  }]
}];
function Sidebar({
  screen,
  setScreen
}) {
  const items = [["dashboard", "LayoutDashboard", "Dashboard"], ["standings", "ListOrdered", "Standings"], ["playoffs", "Trophy", "Playoffs"], ["player", "User", "Player Profile"]];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 220,
      flexShrink: 0,
      background: "var(--surface-panel)",
      borderRight: "1px solid var(--border-subtle)",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "18px 16px",
      borderBottom: "1px solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--text-brand)",
      color: "var(--text-primary)"
    }
  }, "Atlas")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "12px 8px",
      display: "flex",
      flexDirection: "column",
      gap: "2px"
    }
  }, items.map(([key, icon, label]) => /*#__PURE__*/React.createElement("div", {
    key: key,
    onClick: () => setScreen(key),
    style: {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      padding: "9px 10px",
      borderRadius: "var(--radius-sm)",
      cursor: "pointer",
      background: screen === key ? "var(--accent-primary-wash)" : "transparent",
      color: screen === key ? "var(--accent-primary)" : "var(--text-secondary)",
      font: screen === key ? "600 var(--text-size-sm)/1 var(--font-sans)" : "var(--text-body-sm)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 16
  }), label))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "auto",
      padding: "16px",
      borderTop: "1px solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement(StatusPill, {
    tone: "home",
    label: TEAM
  })));
}
function TopBar({
  title
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: "var(--toolbar-height)",
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 20px",
      borderBottom: "1px solid var(--border-subtle)",
      background: "var(--surface-panel)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--text-heading-md)",
      color: "var(--text-primary)"
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "10px"
    }
  }, /*#__PURE__*/React.createElement(Input, {
    value: "",
    onChange: () => {},
    placeholder: "Search players, teams...",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "Search",
      size: 14
    }),
    style: {
      width: 220
    }
  }), /*#__PURE__*/React.createElement(IconButton, {
    title: "Notifications",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "Bell"
    })
  })));
}
function DashboardScreen() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "20px",
      display: "flex",
      flexDirection: "column",
      gap: "16px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--gradient-team-hero)",
      borderRadius: "var(--radius-lg)",
      padding: "24px",
      color: "#fff",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--text-heading-lg)"
    }
  }, TEAM), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--text-body)",
      opacity: 0.85
    }
  }, "1st in Atlantic Division \xB7 88 PTS")), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    style: {
      background: "rgba(255,255,255,0.15)",
      border: "1px solid rgba(255,255,255,0.4)",
      color: "#fff"
    }
  }, "View Season")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "16px"
    }
  }, /*#__PURE__*/React.createElement(Panel, {
    title: "Next Match",
    width: "320px"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "10px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement(StatusPill, {
    tone: "home",
    label: TEAM
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--text-data-md)",
      color: "var(--text-tertiary)"
    }
  }, "vs"), /*#__PURE__*/React.createElement(StatusPill, {
    tone: "away",
    label: "Bay Union"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--text-data-sm)",
      color: "var(--text-tertiary)"
    }
  }, "Sat \xB7 7:00 PM \xB7 Ironclad Arena"), /*#__PURE__*/React.createElement(Button, {
    size: "sm"
  }, "View Matchup"))), /*#__PURE__*/React.createElement(Panel, {
    title: "Roster Health",
    width: "320px"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "10px"
    }
  }, /*#__PURE__*/React.createElement(StatMeter, {
    label: "Avg Fitness",
    value: 88,
    max: 100,
    tone: "success"
  }), /*#__PURE__*/React.createElement(StatMeter, {
    label: "Avg Fatigue",
    value: 42,
    max: 100,
    tone: "danger"
  }), /*#__PURE__*/React.createElement(StatMeter, {
    label: "Team Morale",
    value: 81,
    max: 100,
    tone: "info"
  }))), /*#__PURE__*/React.createElement(Panel, {
    title: "Recent Form",
    width: "320px"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "6px"
    }
  }, /*#__PURE__*/React.createElement(StatusPill, {
    tone: "win",
    label: "W"
  }), /*#__PURE__*/React.createElement(StatusPill, {
    tone: "win",
    label: "W"
  }), /*#__PURE__*/React.createElement(StatusPill, {
    tone: "otl",
    label: "OTL"
  }), /*#__PURE__*/React.createElement(StatusPill, {
    tone: "win",
    label: "W"
  }), /*#__PURE__*/React.createElement(StatusPill, {
    tone: "loss",
    label: "L"
  })))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--text-label)",
      letterSpacing: "var(--text-tracking-wide)",
      textTransform: "uppercase",
      color: "var(--text-tertiary)",
      marginBottom: "8px"
    }
  }, "Roster snapshot"), /*#__PURE__*/React.createElement(PlayerTable, {
    players: roster
  })));
}
function StandingsScreen() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "20px"
    }
  }, /*#__PURE__*/React.createElement(StandingsTable, {
    rows: standings,
    highlightTeam: TEAM
  }));
}
function PlayoffsScreen() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "20px"
    }
  }, /*#__PURE__*/React.createElement(Bracket, {
    rounds: bracketRounds
  }));
}
function PlayerProfileScreen() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "20px",
      display: "flex",
      gap: "20px",
      alignItems: "flex-start"
    }
  }, /*#__PURE__*/React.createElement(PlayerCard, {
    name: "A. Kessler",
    position: "C",
    number: 17,
    team: TEAM,
    overall: 87,
    stats: [{
      label: "SPD",
      value: 82
    }, {
      label: "SHT",
      value: 88
    }, {
      label: "DEF",
      value: 64
    }]
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      gap: "16px"
    }
  }, /*#__PURE__*/React.createElement(Panel, {
    title: "Season Stats"
  }, /*#__PURE__*/React.createElement(StatsTable, {
    columns: [{
      key: "name",
      label: "Player"
    }, {
      key: "gp",
      label: "GP"
    }, {
      key: "g",
      label: "G"
    }, {
      key: "a",
      label: "A"
    }, {
      key: "pts",
      label: "PTS"
    }],
    rows: scorers,
    highlightId: 1
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "8px"
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "success"
  }, "Healthy"), /*#__PURE__*/React.createElement(Badge, {
    tone: "primary"
  }, "Team Captain"), /*#__PURE__*/React.createElement(Badge, {
    tone: "info"
  }, "Contract: 2 yrs left"))));
}
function App() {
  const [screen, setScreen] = React.useState("dashboard");
  const titles = {
    dashboard: "Dashboard",
    standings: "League Standings",
    playoffs: "Playoffs",
    player: "Player Profile"
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      height: "100%"
    }
  }, /*#__PURE__*/React.createElement(Sidebar, {
    screen: screen,
    setScreen: setScreen
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      overflow: "auto"
    }
  }, /*#__PURE__*/React.createElement(TopBar, {
    title: titles[screen]
  }), screen === "dashboard" && /*#__PURE__*/React.createElement(DashboardScreen, null), screen === "standings" && /*#__PURE__*/React.createElement(StandingsScreen, null), screen === "playoffs" && /*#__PURE__*/React.createElement(PlayoffsScreen, null), screen === "player" && /*#__PURE__*/React.createElement(PlayerProfileScreen, null)));
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/team-manager/app.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Radio = __ds_scope.Radio;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.Tooltip = __ds_scope.Tooltip;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Dialog = __ds_scope.Dialog;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Panel = __ds_scope.Panel;

__ds_ns.StatMeter = __ds_scope.StatMeter;

__ds_ns.StatusPill = __ds_scope.StatusPill;

__ds_ns.Bracket = __ds_scope.Bracket;

__ds_ns.PlayerCard = __ds_scope.PlayerCard;

__ds_ns.PlayerTable = __ds_scope.PlayerTable;

__ds_ns.StandingsTable = __ds_scope.StandingsTable;

__ds_ns.StatsTable = __ds_scope.StatsTable;

})();
