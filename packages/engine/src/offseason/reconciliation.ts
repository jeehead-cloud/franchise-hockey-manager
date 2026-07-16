import type {
  OffseasonConfig,
  OffseasonPhaseState,
  OffseasonReconciliationIssue,
  OffseasonReconciliationResult,
  OffseasonRunState,
} from './types.js';
import { OFFSEASON_PHASE_ORDER } from './types.js';

/**
 * F30 reconciliation — internal consistency checks run before a run is created
 * and before completion is persisted.
 *
 * The engine does not validate domain subsystem rows here; it only checks that
 * the offseason run itself is internally coherent (phase order, dependency
 * closure, no missing phases, linked operation ids present where required).
 */

/**
 * Reconcile a run's phases against its config: phase set matches, order matches
 * the config, dependencies hold, no duplicate types.
 */
export function reconcileOffseasonRun(
  config: OffseasonConfig,
  run: OffseasonRunState,
): OffseasonReconciliationResult {
  const issues: OffseasonReconciliationIssue[] = [];

  // Phase set + order must match config.
  const configTypes = config.phases.map((p) => p.type);
  const runTypes = [...run.phases].sort((a, b) => a.order - b.order).map((p) => p.phaseType);
  if (configTypes.length !== runTypes.length) {
    issues.push({ code: 'PHASE_COUNT_MISMATCH', message: `Phase count ${runTypes.length} does not match config ${configTypes.length}` });
  }
  for (let i = 0; i < Math.min(configTypes.length, runTypes.length); i++) {
    if (configTypes[i] !== runTypes[i]) {
      issues.push({ code: 'PHASE_ORDER_MISMATCH', message: `Phase ${i} expected ${configTypes[i]} but found ${runTypes[i]}` });
      break;
    }
  }

  // Each phase type appears at most once.
  const seen = new Map<string, number>();
  for (const p of run.phases) {
    seen.set(p.phaseType, (seen.get(p.phaseType) ?? 0) + 1);
  }
  for (const [type, count] of seen) {
    if (count > 1) issues.push({ code: 'DUPLICATE_PHASE', message: `Phase ${type} appears ${count} times` });
  }

  // Phase order fields strictly increasing.
  const ordered = [...run.phases].sort((a, b) => a.order - b.order);
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i]!.order <= ordered[i - 1]!.order) {
      issues.push({ code: 'PHASE_ORDER_NON_INCREASING', message: `Phase order not strictly increasing at index ${i}` });
      break;
    }
  }

  // A SKIPPED phase must be allowed to skip; a required phase cannot be SKIPPED.
  for (const p of run.phases) {
    const def = config.phases.find((c) => c.type === p.phaseType);
    if (!def) continue;
    if (p.status === 'SKIPPED' && (def.required || !def.allowSkip)) {
      issues.push({ code: 'REQUIRED_PHASE_SKIPPED', message: `Phase ${p.phaseType} is required and must not be skipped` });
    }
  }

  // Dependency closure: no phase may be COMPLETED while an earlier required
  // phase is still unfinished. Optional skipped dependencies are allowed.
  for (const p of run.phases) {
    if (p.status !== 'COMPLETED' && p.status !== 'IN_PROGRESS') continue;
    const depIndex = OFFSEASON_PHASE_ORDER.indexOf(p.phaseType);
    if (depIndex < 0) continue;
    for (let i = 0; i < depIndex; i++) {
      const earlierType = OFFSEASON_PHASE_ORDER[i]!;
      if (!config.phases.some((c) => c.type === earlierType)) continue;
      const earlier = run.phases.find((x) => x.phaseType === earlierType);
      if (!earlier) {
        issues.push({ code: 'MISSING_DEPENDENCY', message: `Phase ${p.phaseType} missing earlier phase ${earlierType}` });
        continue;
      }
      if (earlier.status !== 'COMPLETED' && earlier.status !== 'SKIPPED') {
        issues.push({ code: 'DEPENDENCY_INCOMPLETE', message: `Phase ${p.phaseType} advanced before ${earlierType} (${earlier.status})` });
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

export function assertOffseasonReconciliation(result: OffseasonReconciliationResult): void {
  if (!result.valid) {
    throw new Error(`Offseason reconciliation failed: ${result.issues.map((i) => i.message).join('; ')}`);
  }
}

/**
 * Quick integrity helper used at run creation — ensure the candidate phase list
 * is coherent before persistence (no duplicates, canonical order, FINAL_REVIEW
 * last).
 */
export function reconcilePhasePlan(phases: OffseasonPhaseState[]): OffseasonReconciliationResult {
  const issues: OffseasonReconciliationIssue[] = [];
  const seen = new Map<string, number>();
  for (const p of phases) seen.set(p.phaseType, (seen.get(p.phaseType) ?? 0) + 1);
  for (const [type, count] of seen) {
    if (count > 1) issues.push({ code: 'DUPLICATE_PHASE', message: `Phase ${type} appears ${count} times` });
  }
  const types = [...phases].sort((a, b) => a.order - b.order).map((p) => p.phaseType);
  for (let i = 1; i < types.length; i++) {
    const prev = OFFSEASON_PHASE_ORDER.indexOf(types[i - 1]!);
    const cur = OFFSEASON_PHASE_ORDER.indexOf(types[i]!);
    if (prev < 0 || cur < 0 || cur <= prev) {
      issues.push({ code: 'PHASE_ORDER_MISMATCH', message: `Phase plan order violated near ${types[i]}` });
      break;
    }
  }
  if (types.length > 0 && types[types.length - 1] !== 'FINAL_REVIEW') {
    issues.push({ code: 'FINAL_REVIEW_NOT_LAST', message: 'FINAL_REVIEW must be the last phase in the plan' });
  }
  return { valid: issues.length === 0, issues };
}
