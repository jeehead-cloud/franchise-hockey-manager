import type { CSSProperties, ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { Button } from './Button';

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  font: 'var(--text-label-wide)',
  letterSpacing: 'var(--text-tracking-wide)',
  textTransform: 'uppercase',
  color: 'var(--text-tertiary)',
  borderBottom: '1px solid var(--border-subtle)',
  whiteSpace: 'nowrap',
};

const tdStyle: CSSProperties = {
  padding: '10px',
  font: 'var(--text-body-sm)',
  color: 'var(--text-secondary)',
  borderBottom: '1px solid var(--border-subtle)',
};

export interface DataTableHeader {
  key: string;
  label: string;
  width?: string;
  /** When set, the header becomes a sortable control bound to this sort key.
   *  The actual sort is performed by `onSort`; the table only renders the
   *  affordance and the active-direction indicator. */
  sortKey?: string;
}

export interface DataTableSortState {
  sort: string;
  direction: 'asc' | 'desc';
}

export function DataTable({
  headers,
  children,
  sort,
  onSort,
}: {
  headers: Array<DataTableHeader>;
  children: ReactNode;
  /** Active sort state — when a header's sortKey matches `sort.sort`, the
   *  active direction indicator is shown. */
  sort?: DataTableSortState;
  /** Called when a sortable header is clicked. Toggling direction is the
   *  caller's responsibility (so URL state stays the source of truth). */
  onSort?: (sortKey: string) => void;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
        <thead>
          <tr>
            {headers.map((h) => {
              const sortable = Boolean(h.sortKey) && Boolean(onSort);
              const isActive = sortable && sort?.sort === h.sortKey;
              const dir = isActive ? sort?.direction : undefined;
              return (
                <th key={h.key} scope="col" style={{ ...thStyle, width: h.width }}>
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => onSort?.(h.sortKey!)}
                      title={`Sort by ${h.label}`}
                      aria-label={`Sort by ${h.label}${isActive ? `, current ${dir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
                      aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        margin: 0,
                        cursor: 'pointer',
                        font: 'inherit',
                        letterSpacing: 'inherit',
                        textTransform: 'inherit',
                        color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                      }}
                    >
                      <span>{h.label}</span>
                      {isActive ? (
                        dir === 'asc' ? (
                          <ArrowUp size={12} aria-hidden />
                        ) : (
                          <ArrowDown size={12} aria-hidden />
                        )
                      ) : (
                        <ChevronsUpDown size={12} aria-hidden style={{ opacity: 0.6 }} />
                      )}
                    </button>
                  ) : (
                    h.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function DataRow({
  children,
  onActivate,
  selected,
}: {
  children: ReactNode;
  onActivate?: () => void;
  selected?: boolean;
}) {
  return (
    <tr
      tabIndex={onActivate ? 0 : undefined}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (!onActivate) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate();
        }
      }}
      style={{
        cursor: onActivate ? 'pointer' : 'default',
        background: selected ? 'var(--accent-primary-wash)' : 'transparent',
      }}
    >
      {children}
    </tr>
  );
}

export function Td({ children, primary }: { children: ReactNode; primary?: boolean }) {
  return (
    <td style={{ ...tdStyle, color: primary ? 'var(--text-primary)' : tdStyle.color }}>
      {children}
    </td>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        alignItems: 'flex-end',
        padding: 12,
        background: 'var(--surface-panel)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

export function Field({
  label,
  children,
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140, flex: '1 1 140px' }}
    >
      <span
        style={{
          font: 'var(--text-label)',
          letterSpacing: 'var(--text-tracking-wide)',
          textTransform: 'uppercase',
          color: 'var(--text-tertiary)',
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

const controlStyle: CSSProperties = {
  height: 32,
  padding: '0 10px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-panel-raised)',
  color: 'var(--text-primary)',
  font: 'var(--text-body-sm)',
};

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...controlStyle, ...props.style }} />;
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={{ ...controlStyle, ...props.style }} />;
}

export function Pagination({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (totalPages <= 0) return null;
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        marginTop: 12,
        flexWrap: 'wrap',
      }}
    >
      <span style={{ font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
        {total} record{total === 1 ? '' : 's'} · page {page} of {Math.max(totalPages, 1)}
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
