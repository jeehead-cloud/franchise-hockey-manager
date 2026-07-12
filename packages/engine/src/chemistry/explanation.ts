import type { ChemistryUnitResult } from './types.js';

export function summarizeUnitPlain(unit: ChemistryUnitResult): string {
  if (unit.status !== 'AVAILABLE') {
    return `${unit.unitKey} unavailable: ${unit.unavailableReasons.join('; ') || 'incomplete unit'}`;
  }
  return `${unit.unitKey}: chemistry ${unit.currentChemistry} (${unit.label}), effective ${unit.effectivePerformance} (modifier ${(unit.totalModifier! * 100).toFixed(1)}%).`;
}
