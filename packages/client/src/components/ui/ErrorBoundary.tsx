import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Lightweight render-error boundary.
 *
 * Without this, any uncaught exception during render unmounts the ENTIRE React
 * tree (there is no other boundary in the app). That produces a blank page and,
 * because the whole tree (including global providers such as CommissionerMode)
 * remounts on the next navigation, loses in-memory global state. Wrapping the
 * routed content ensures a render throw in one page is reported to the user
 * instead of blanking the app.
 *
 * This does NOT swallow errors in event handlers, async effects, or timers —
 * only synchronous render errors (the class of bug that blanks the page).
 */
interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log to the console so the underlying cause is visible during development.
    console.error('Unhandled render error:', error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ font: 'var(--text-heading-md)', color: 'var(--accent-danger)' }}>
            Something went wrong
          </div>
          <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
            {this.state.error.message || 'An unexpected render error occurred.'}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={this.reset}
              style={{
                font: 'var(--text-body-sm)',
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--surface-panel)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                font: 'var(--text-body-sm)',
                padding: '6px 12px',
                alignSelf: 'center',
                color: 'var(--text-link)',
              }}
            >
              Back to World
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
