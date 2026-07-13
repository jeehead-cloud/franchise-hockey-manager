import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnomalyPanel } from './AnomalyPanel';
import { BalanceComparisonPanel } from './BalanceComparisonPanel';
import { LabExportMenu } from './LabExportMenu';
import { LabProgress } from './LabProgress';
import { LabRunForm, type LabRunFormValues } from './LabRunForm';
import { LabSummaryCards } from './LabSummaryCards';
import { LineAggregateTable } from './LineAggregateTable';
import { PlayerAggregateTable } from './PlayerAggregateTable';
import { ScoreDistributionChart } from './ScoreDistributionChart';
import { TeamMetricComparison } from './TeamMetricComparison';
import { EmptyState, ErrorState, LoadingState } from '../ui/EmptyState';
import { Panel } from '../ui/Panel';
import {
  cancelSimulationLabRun,
  createSimulationLabRun,
  getSimulationLabOptions,
  getSimulationLabRun,
  type LabRunItem,
  type LabSideMode,
  type LabSimulationCount,
  type SimulationLabOptions,
} from '../../lib/api';

const POLL_MS = 500;
const SUPPORTED_COUNTS = new Set<number>([1, 10, 100, 1000]);

function parseCount(raw: string | null): LabSimulationCount {
  const n = Number(raw);
  if (SUPPORTED_COUNTS.has(n)) return n as LabSimulationCount;
  return 10;
}

function parseSideMode(raw: string | null): LabSideMode {
  return raw === 'FIXED' ? 'FIXED' : 'ALTERNATE';
}

function randomSeed(): string {
  return `lab-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function teamIsReady(t: { readiness?: string; readinessStatus?: string }): boolean {
  return (t.readiness ?? t.readinessStatus) === 'READY';
}

function defaultForm(options: SimulationLabOptions, params: URLSearchParams): LabRunFormValues {
  const teams = options.teams;
  const urlA = params.get('teamA') ?? '';
  const urlB = params.get('teamB') ?? '';
  const teamAId =
    teams.find((t) => t.id === urlA)?.id ??
    teams.find((t) => teamIsReady(t))?.id ??
    teams[0]?.id ??
    '';
  const teamBId =
    teams.find((t) => t.id === urlB && t.id !== teamAId)?.id ??
    teams.find((t) => t.id !== teamAId && teamIsReady(t))?.id ??
    teams.find((t) => t.id !== teamAId)?.id ??
    '';

  const defaults = options.activeBalance?.runtimeDefaults ?? options.runtimeDefaults;
  return {
    teamAId,
    teamBId,
    baselineBalanceVersionId: params.get('baselineVersion') ?? '',
    comparisonBalanceVersionId: params.get('comparisonVersion') ?? '',
    simulationCount: parseCount(params.get('count')),
    baseSeed: params.get('seed')?.trim() || 'lab-batch-001',
    sideMode: parseSideMode(params.get('sideMode')),
    simulationRandomness: defaults?.simulationRandomness ?? 0.5,
    loggingLevel: defaults?.loggingLevel ?? 'STANDARD',
    includeGameSummaries: true,
    includePlayerAggregates: true,
    includeLineAggregates: true,
  };
}

export function BatchLabPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [options, setOptions] = useState<SimulationLabOptions | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [form, setForm] = useState<LabRunFormValues | null>(null);
  const [run, setRun] = useState<LabRunItem | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const pollAbortRef = useRef<AbortController | null>(null);

  const [labDisabled, setLabDisabled] = useState(false);

  const runId = searchParams.get('runId');

  const patchParams = useCallback(
    (patch: Record<string, string | null | undefined>, replace = false) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value == null || value === '') next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace },
      );
    },
    [setSearchParams],
  );

  const syncFormToUrl = useCallback(
    (values: LabRunFormValues, extra?: Record<string, string | null | undefined>) => {
      patchParams(
        {
          teamA: values.teamAId || null,
          teamB: values.teamBId || null,
          count: String(values.simulationCount),
          seed: values.baseSeed || null,
          sideMode: values.sideMode,
          baselineVersion: values.baselineBalanceVersionId || null,
          comparisonVersion: values.comparisonBalanceVersionId || null,
          ...extra,
        },
        true,
      );
    },
    [patchParams],
  );

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    (async () => {
      setLoadingOptions(true);
      setOptionsError(null);
      setLabDisabled(false);
      try {
        const res = await getSimulationLabOptions(ac.signal);
        if (cancelled) return;
        if (!res.item.enabled) {
          setLabDisabled(true);
          setOptions(res.item);
          return;
        }
        setOptions(res.item);
        setForm((prev) => prev ?? defaultForm(res.item, searchParams));
      } catch (err) {
        if (!cancelled && !ac.signal.aborted) {
          const status = (err as Error & { status?: number }).status;
          if (status === 503) {
            setLabDisabled(true);
            setOptionsError(null);
          } else {
            setOptionsError(err instanceof Error ? err.message : 'Failed to load lab options');
          }
        }
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
    // Intentionally once on mount for options; form seeds from initial URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!runId) {
      setRun(null);
      setExpired(false);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ac = new AbortController();
    pollAbortRef.current = ac;

    const poll = async () => {
      try {
        const res = await getSimulationLabRun(runId, ac.signal);
        if (cancelled) return;
        setExpired(false);
        setRunError(null);
        setRun(res.item);
        if (res.item.status === 'QUEUED' || res.item.status === 'RUNNING') {
          timer = setTimeout(poll, POLL_MS);
        }
      } catch (err) {
        if (cancelled || ac.signal.aborted) return;
        const status = (err as Error & { status?: number }).status;
        if (status === 404) {
          setExpired(true);
          setRun(null);
          setRunError(null);
          return;
        }
        setRunError(err instanceof Error ? err.message : 'Failed to load run');
      }
    };

    void poll();

    return () => {
      cancelled = true;
      ac.abort();
      if (timer) clearTimeout(timer);
      if (pollAbortRef.current === ac) pollAbortRef.current = null;
    };
  }, [runId]);

  const onFormChange = useCallback(
    (patch: Partial<LabRunFormValues>) => {
      setForm((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...patch };
        syncFormToUrl(next);
        return next;
      });
    },
    [syncFormToUrl],
  );

  const onNewSeed = useCallback(() => {
    onFormChange({ baseSeed: randomSeed() });
  }, [onFormChange]);

  const onSubmit = useCallback(async () => {
    if (!form || !options?.enabled) return;
    if (!form.teamAId || !form.teamBId) {
      setRunError('Select Team A and Team B');
      return;
    }
    if (form.teamAId === form.teamBId) {
      setRunError('Team A and Team B must differ');
      return;
    }
    if (!form.baseSeed.trim()) {
      setRunError('Base seed is required');
      return;
    }

    setSubmitting(true);
    setRunError(null);
    setExpired(false);
    syncFormToUrl(form);
    try {
      const res = await createSimulationLabRun({
        teamAId: form.teamAId,
        teamBId: form.teamBId,
        baselineBalanceVersionId: form.baselineBalanceVersionId || undefined,
        comparisonBalanceVersionId: form.comparisonBalanceVersionId || null,
        simulationCount: form.simulationCount,
        baseSeed: form.baseSeed.trim(),
        sideMode: form.sideMode,
        runtimeSettings: {
          simulationRandomness: form.simulationRandomness,
          loggingLevel: form.loggingLevel,
        },
        includeGameSummaries: form.includeGameSummaries,
        includePlayerAggregates: form.includePlayerAggregates,
        includeLineAggregates: form.includeLineAggregates,
      });
      patchParams({ runId: res.item.runId });
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Failed to start batch run');
    } finally {
      setSubmitting(false);
    }
  }, [form, options?.enabled, patchParams, syncFormToUrl]);

  const onCancel = useCallback(async () => {
    if (!runId) return;
    setCancelling(true);
    try {
      await cancelSimulationLabRun(runId);
      const res = await getSimulationLabRun(runId);
      setRun(res.item);
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status === 404) {
        setExpired(true);
        setRun(null);
      } else {
        setRunError(err instanceof Error ? err.message : 'Cancel failed');
      }
    } finally {
      setCancelling(false);
    }
  }, [runId]);

  const teamNames = useMemo(() => {
    const teams = options?.teams ?? [];
    const a = teams.find((t) => t.id === form?.teamAId);
    const b = teams.find((t) => t.id === form?.teamBId);
    return {
      a: a?.shortName || a?.name || 'Team A',
      b: b?.shortName || b?.name || 'Team B',
    };
  }, [form?.teamAId, form?.teamBId, options?.teams]);

  if (loadingOptions) return <LoadingState label="Loading Simulation Lab…" />;
  if (labDisabled) {
    return (
      <EmptyState
        title="Simulation Lab disabled"
        description="Batch Lab is turned off on this server (FHM_SIMULATION_LAB_ENABLED). Single Match Debug remains available on the other tab."
      />
    );
  }
  if (optionsError) return <ErrorState description={optionsError} />;
  if (!options || !form) return <LoadingState label="Preparing lab…" />;

  if (!options.enabled) {
    return (
      <EmptyState
        title="Simulation Lab disabled"
        description="Batch Lab is turned off on this server (FHM_SIMULATION_LAB_ENABLED). Single Match Debug remains available on the other tab."
      />
    );
  }

  const result = run?.result ?? null;
  const terminal =
    run &&
    (run.status === 'COMPLETED' || run.status === 'FAILED' || run.status === 'CANCELLED');
  const showCancel = run && (run.status === 'QUEUED' || run.status === 'RUNNING');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Panel title="Batch Lab">
        <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
          Unpersisted deterministic batch analysis. Runs do not create Match records or change world
          state. Results live only in the current server process until they expire.
        </p>
      </Panel>

      <LabRunForm
        options={options}
        values={form}
        onChange={onFormChange}
        onSubmit={onSubmit}
        onNewSeed={onNewSeed}
        busy={submitting || Boolean(showCancel)}
      />

      {runError ? <ErrorState description={runError} /> : null}

      {expired ? (
        <EmptyState
          title="Run expired"
          description="This run is no longer retained (server restart or retention cleanup). Adjust inputs and run again — nothing was started automatically."
          action={{
            label: 'Clear run id',
            onClick: () => patchParams({ runId: null }),
          }}
        />
      ) : null}

      {run ? <LabProgress run={run} onCancel={showCancel ? onCancel : undefined} cancelling={cancelling} /> : null}

      {result ? (
        <>
          <LabSummaryCards
            result={result}
            teamAName={teamNames.a}
            teamBName={teamNames.b}
            isPartial={run?.isPartial || result.metadata.isPartial}
          />
          <ScoreDistributionChart result={result} />
          <TeamMetricComparison result={result} teamAName={teamNames.a} teamBName={teamNames.b} />
          <PlayerAggregateTable
            players={result.aggregate.players}
            teamAName={teamNames.a}
            teamBName={teamNames.b}
          />
          <LineAggregateTable
            units={result.aggregate.units}
            teamAName={teamNames.a}
            teamBName={teamNames.b}
          />
          <AnomalyPanel anomalies={result.anomalies} />
          <BalanceComparisonPanel comparison={result.comparison} />
          <LabExportMenu
            runId={runId}
            disabled={!terminal || run?.status === 'FAILED'}
            hasComparison={Boolean(result.comparison)}
          />
        </>
      ) : null}

      {!run && !expired && !runError ? (
        <EmptyState
          title="No batch results"
          description="Configure teams and seed, then press Run batch. Results are not restored from local storage."
        />
      ) : null}
    </div>
  );
}
