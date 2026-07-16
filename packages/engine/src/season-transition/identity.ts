import { SeasonTransitionError, type SeasonTransitionConfig, type SourceSeasonInput, type TargetSeasonIdentity } from './types.js';
import { composeIsoDate } from './dates.js';

/**
 * Compute the deterministic target-season order from the source season's
 * `startYear` (the canonical WorldSeason order, per F28 contract semantics)
 * plus the configured increment.
 */
export function computeTargetOrder(sourceStartYear: number, increment: number): number {
  if (!Number.isFinite(increment) || increment <= 0 || !Number.isInteger(increment)) {
    throw new SeasonTransitionError('InvalidSeasonTransitionConfiguration', `orderIncrement must be a positive integer (got ${increment})`);
  }
  return sourceStartYear + increment;
}

/**
 * Apply the configured display-name pattern to a target season. Supports the
 * placeholders `{startYear}` and `{endYear}` (resolved from the target order
 * and the configured season span). Any other `{...}` token is rejected.
 */
export function applyDisplayNamePattern(
  pattern: string,
  startYear: number,
  endYear: number,
): string {
  if (typeof pattern !== 'string' || pattern.length === 0) {
    throw new SeasonTransitionError('InvalidSeasonTransitionConfiguration', 'displayNamePattern must be a non-empty string');
  }
  // Validate that every {token} is one we support.
  const tokens = pattern.match(/\{[^}]+\}/g) ?? [];
  for (const tok of tokens) {
    if (tok !== '{startYear}' && tok !== '{endYear}') {
      throw new SeasonTransitionError(
        'InvalidSeasonTransitionConfiguration',
        `Unsupported display-name token ${tok} (only {startYear} and {endYear} are supported)`,
      );
    }
  }
  return pattern.replaceAll('{startYear}', String(startYear)).replaceAll('{endYear}', String(endYear));
}

/**
 * Resolve the full target-season identity deterministically. The Commissioner
 * may override only the display name (the underlying order/dates are never
 * altered by an override). The override is included in the input hash by the
 * caller (it is part of the source plan, not this pure function).
 */
export function resolveTargetIdentity(
  config: SeasonTransitionConfig,
  source: SourceSeasonInput,
  targetDisplayNameOverride: string | null,
): TargetSeasonIdentity {
  const order = computeTargetOrder(source.startYear, config.season.orderIncrement);
  // The WorldSeason label is the unique key in persistence and is derived from
  // the display-name pattern (cannot be overridden — uniqueness is order-based).
  const label = applyDisplayNamePattern(config.season.displayNamePattern, order, order + 1);
  const trimmedOverride =
    targetDisplayNameOverride !== null && targetDisplayNameOverride.trim().length > 0
      ? targetDisplayNameOverride.trim()
      : null;
  const displayName = trimmedOverride ?? label;
  const startDateIso = composeIsoDate(order, config.season.startDateMonth, config.season.startDateDay);
  const endDateIso = composeIsoDate(order + 1, config.season.endDateMonth, config.season.endDateDay);
  return {
    order,
    label,
    displayName,
    startDateIso,
    endDateIso,
    manuallyNamed: trimmedOverride !== null,
  };
}
