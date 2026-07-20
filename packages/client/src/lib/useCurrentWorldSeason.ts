import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getCurrentWorldSeason, type WorldSeasonItem } from './api';

/**
 * The single authoritative client source for the current WorldSeason shown in
 * the global shell. Uses the lightweight `/api/world-seasons/current` endpoint
 * (just the season — not the heavy `/api/world` summary).
 *
 * - 404 (no season yet) resolves to `null` ("No world"), not an error.
 * - Re-fetches on route change so the shell reflects a freshly initialized
 *   world immediately after Setup redirects, and after any navigation.
 * - Refresh (full reload) re-runs the effect and shows the correct season.
 * - AbortController cancellation (navigation/Strict Mode/unmount) is swallowed.
 */
export function useCurrentWorldSeason(): {
  season: WorldSeasonItem | null;
  loading: boolean;
  error: string | null;
} {
  const location = useLocation();
  const [season, setSeason] = useState<WorldSeasonItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getCurrentWorldSeason(controller.signal)
      .then((res) => {
        setSeason(res.item);
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const status = (err as { status?: number }).status;
        // 404 = no WorldSeason yet → not an error, just an uninitialized world.
        if (status === 404) {
          setSeason(null);
          setError(null);
          return;
        }
        setSeason(null);
        setError(err instanceof Error ? err.message : 'Unable to load current season');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [location.pathname]);

  return { season, loading, error };
}
