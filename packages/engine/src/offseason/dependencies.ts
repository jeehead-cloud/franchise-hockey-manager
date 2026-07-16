import type { OffseasonConfig, OffseasonPhaseState, OffseasonPhaseType } from './types.js';
import { OffseasonError } from './types.js';
import { resolvePhaseDefinitions } from './config.js';

/**
 * F30 dependency graph + dependency-fulfilment checks.
 *
 * Dependencies are linear: a phase may start only if every earlier phase in the
 * config order is COMPLETED (or SKIPPED, where allowed). This matches the
 * invariant "a phase cannot start before required dependencies complete" and
 * keeps the engine free of any per-phase bespoke dependency table.
 */

export function phaseDefinitions(config: OffseasonConfig) {
  return resolvePhaseDefinitions(config);
}

export function dependencyList(config: OffseasonConfig, phaseType: OffseasonPhaseType) {
  const defs = phaseDefinitions(config);
  const def = defs.find((d) => d.type === phaseType);
  if (!def) {
    throw new OffseasonError('UnknownOffseasonPhase', `Unknown phase type ${phaseType}`);
  }
  return def.dependsOn;
}

/**
 * Returns the set of dependency phase types that are not yet COMPLETED/SKIPPED.
 * A phase with unmet dependencies cannot be started.
 */
export function unmetDependencies(
  config: OffseasonConfig,
  phaseType: OffseasonPhaseType,
  phases: OffseasonPhaseState[],
): OffseasonPhaseType[] {
  const deps = dependencyList(config, phaseType);
  const byType = new Map(phases.map((p) => [p.phaseType, p]));
  return deps.filter((d) => {
    const row = byType.get(d);
    return !row || (row.status !== 'COMPLETED' && row.status !== 'SKIPPED');
  });
}

export function dependenciesMet(
  config: OffseasonConfig,
  phaseType: OffseasonPhaseType,
  phases: OffseasonPhaseState[],
): boolean {
  return unmetDependencies(config, phaseType, phases).length === 0;
}

/**
 * Detect cycles in the linear dependency graph. The default config and any
 * config whose phases follow canonical order are inherently acyclic, but this
 * guard exists so future config authors who attempt to redefine dependencies
 * cannot create an impossible run.
 */
export function detectCycle(order: OffseasonPhaseType[]): OffseasonPhaseType[] | null {
  // The dependency model is strictly linear (each phase depends on all prior).
  // A "cycle" here only manifests if the same phase appears twice.
  const seen = new Set<OffseasonPhaseType>();
  for (const t of order) {
    if (seen.has(t)) return [t];
    seen.add(t);
  }
  return null;
}
