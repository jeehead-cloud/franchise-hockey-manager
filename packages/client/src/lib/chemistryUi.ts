import type { ChemistryLabel, ChemistryUnitResult } from './api';

export function chemistryLabelTone(
  label: ChemistryLabel | null | undefined,
): 'danger' | 'warning' | 'neutral' | 'info' | 'success' {
  if (label === 'POOR') return 'danger';
  if (label === 'WEAK') return 'warning';
  if (label === 'NEUTRAL') return 'neutral';
  if (label === 'GOOD') return 'info';
  if (label === 'EXCELLENT') return 'success';
  return 'neutral';
}

export function formatModifierPercent(totalModifier: number | null | undefined): string {
  if (totalModifier == null) return '—';
  const pct = totalModifier * 100;
  const rounded = Math.round(pct * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}%`;
}

export function formatFitScore(score: number | null | undefined): string {
  if (score == null) return '—';
  return score.toFixed(2);
}

export function formatNullableNumber(value: number | null | undefined, digits = 0): string {
  if (value == null) return '—';
  return digits > 0 ? value.toFixed(digits) : String(Math.round(value));
}

export function unitDisplayTitle(unit: ChemistryUnitResult): string {
  if (unit.unitType === 'FORWARD_LINE') {
    const n = unit.unitKey.replace(/^F/, '');
    return `Line ${n}`;
  }
  if (unit.unitType === 'DEFENSE_PAIR') {
    const n = unit.unitKey.replace(/^D/, '');
    return `Pair ${n}`;
  }
  if (unit.unitKey === 'G_STARTER') return 'Starter';
  if (unit.unitKey === 'G_BACKUP') return 'Backup';
  return unit.unitKey;
}

export function factorDirectionLabel(direction: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'): string {
  if (direction === 'POSITIVE') return 'Positive';
  if (direction === 'NEGATIVE') return 'Negative';
  return 'Neutral';
}
