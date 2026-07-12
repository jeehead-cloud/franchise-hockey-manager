/** Adapted from design/system/components/core/Tabs.jsx */
export function Tabs({
  items,
  value,
  onChange,
}: {
  items: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      role="tablist"
      style={{ display: 'flex', gap: '2px', borderBottom: '1px solid var(--border-subtle)' }}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            style={{
              padding: '8px 14px',
              font: '600 var(--text-size-sm)/1 var(--font-sans)',
              color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
              background: 'transparent',
              border: 'none',
              borderBottom: active
                ? '2px solid var(--accent-primary)'
                : '2px solid transparent',
              marginBottom: '-1px',
              cursor: 'pointer',
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
