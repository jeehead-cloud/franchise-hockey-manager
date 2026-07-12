import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const sizeMap: Record<Size, CSSProperties> = {
  sm: { padding: '0 10px', height: '28px', font: 'var(--text-label)' },
  md: { padding: '0 14px', height: '32px', font: '600 var(--text-size-sm)/1 var(--font-sans)' },
  lg: { padding: '0 18px', height: '40px', font: '600 var(--text-size-md)/1 var(--font-sans)' },
};

const variantMap: Record<Variant, CSSProperties> = {
  primary: {
    background: 'var(--accent-primary)',
    color: 'var(--text-on-accent)',
    border: '1px solid transparent',
  },
  secondary: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-default)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid transparent',
  },
  danger: {
    background: 'var(--accent-danger)',
    color: 'var(--text-on-accent)',
    border: '1px solid transparent',
  },
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

/** Adapted from design/system/components/core/Button.jsx for maintainable TSX. */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  icon,
  className,
  style,
  type = 'button',
  ...rest
}: ButtonProps) {
  const s = sizeMap[size];
  const v = variantMap[variant];

  return (
    <button
      type={type}
      disabled={disabled}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        ...s,
        letterSpacing: size === 'sm' ? 'var(--text-tracking-wide)' : 'normal',
        textTransform: size === 'sm' ? 'uppercase' : 'none',
        borderRadius: 'var(--radius-md)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition:
          'background var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out)',
        ...v,
        boxSizing: 'border-box',
        ...style,
      }}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
