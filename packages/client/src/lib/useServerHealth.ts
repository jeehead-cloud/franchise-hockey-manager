import { useEffect, useState } from 'react';
import { fetchHealth, type ConnectionState } from '../lib/api';

const POLL_MS = 15_000;

export function useServerHealth() {
  const [state, setState] = useState<ConnectionState>('loading');
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const check = async () => {
      try {
        const data = await fetchHealth(controller.signal);
        if (cancelled) return;
        setState(data.status === 'ok' || data.status === 'degraded' ? 'connected' : 'unavailable');
        setDetail(
          data.status === 'degraded'
            ? `API up · database ${data.database ?? 'unknown'}`
            : `API · ${data.service}`,
        );
      } catch {
        if (cancelled) return;
        setState('unavailable');
        setDetail('Server unavailable');
      }
    };

    void check();
    const id = window.setInterval(() => void check(), POLL_MS);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(id);
    };
  }, []);

  return { state, detail };
}
