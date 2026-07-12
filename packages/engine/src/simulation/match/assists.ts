/**
 * Assist attribution from the possession pass chain.
 * Primary = most recent eligible passer; secondary = previous distinct passer.
 */

export interface DerivedAssists {
  primaryAssistId: string | null;
  secondaryAssistId: string | null;
}

/**
 * Derive primary/secondary assists from pass-chain participants.
 * Pass chain is ordered oldest → newest (last entry is most recent passer).
 */
export function deriveAssists(passChain: readonly string[], scorerId: string): DerivedAssists {
  const eligible: string[] = [];
  const seen = new Set<string>();
  for (let i = passChain.length - 1; i >= 0; i -= 1) {
    const id = passChain[i]!;
    if (!id || id === scorerId || seen.has(id)) continue;
    seen.add(id);
    eligible.push(id);
    if (eligible.length >= 2) break;
  }
  return {
    primaryAssistId: eligible[0] ?? null,
    secondaryAssistId: eligible[1] ?? null,
  };
}
