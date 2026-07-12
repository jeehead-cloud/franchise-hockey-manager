import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Dialog } from '../components/ui/Dialog';

type CommissionerContextValue = {
  enabled: boolean;
  requestEnable: () => void;
  disable: () => void;
  /** Returns false if disable was blocked by dirty guard. */
  tryDisable: (opts?: { hasUnsavedChanges?: boolean; onDiscard?: () => void }) => boolean;
  registerDirtyGuard: (guard: (() => boolean) | null) => void;
};

const CommissionerContext = createContext<CommissionerContextValue | null>(null);

export function CommissionerProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pendingDisable, setPendingDisable] = useState<(() => void) | null>(null);
  const [dirtyGuard, setDirtyGuard] = useState<(() => boolean) | null>(null);

  const requestEnable = useCallback(() => setConfirmOpen(true), []);

  const disable = useCallback(() => {
    setEnabled(false);
  }, []);

  const tryDisable = useCallback(
    (opts?: { hasUnsavedChanges?: boolean; onDiscard?: () => void }) => {
      const dirty = opts?.hasUnsavedChanges ?? dirtyGuard?.() ?? false;
      if (dirty) {
        setPendingDisable(() => () => {
          opts?.onDiscard?.();
          setEnabled(false);
        });
        setDiscardOpen(true);
        return false;
      }
      setEnabled(false);
      return true;
    },
    [dirtyGuard],
  );

  const registerDirtyGuard = useCallback((guard: (() => boolean) | null) => {
    setDirtyGuard(() => guard);
  }, []);

  const value = useMemo(
    () => ({ enabled, requestEnable, disable, tryDisable, registerDirtyGuard }),
    [enabled, requestEnable, disable, tryDisable, registerDirtyGuard],
  );

  return (
    <CommissionerContext.Provider value={value}>
      {children}
      <Dialog
        open={confirmOpen}
        title="Enable Commissioner Mode?"
        confirmLabel="Enable Commissioner Mode"
        confirmVariant="danger"
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setEnabled(true);
          setConfirmOpen(false);
        }}
      >
        <p style={{ margin: '0 0 8px' }}>
          Commissioner Mode edits the current living world directly. Changes are persisted
          immediately and recorded in an audit log.
        </p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>This is an administrative sandbox, not normal gameplay.</li>
          <li>There is no automatic undo.</li>
          <li>Derived ratings and roles recalculate on the server after save.</li>
        </ul>
      </Dialog>
      <Dialog
        open={discardOpen}
        title="Discard unsaved changes?"
        confirmLabel="Discard and disable"
        confirmVariant="danger"
        onClose={() => {
          setDiscardOpen(false);
          setPendingDisable(null);
        }}
        onConfirm={() => {
          pendingDisable?.();
          setDiscardOpen(false);
          setPendingDisable(null);
        }}
      >
        You have unsaved Commissioner edits. Disable mode and discard them?
      </Dialog>
    </CommissionerContext.Provider>
  );
}

export function useCommissioner() {
  const ctx = useContext(CommissionerContext);
  if (!ctx) throw new Error('useCommissioner requires CommissionerProvider');
  return ctx;
}
