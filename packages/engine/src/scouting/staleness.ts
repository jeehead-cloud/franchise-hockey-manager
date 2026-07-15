import type { PlayerTruth, ScoutingReport, StalenessResult } from './types.js';
import { hashPlayerState } from './hashing.js';

export function assessScoutingStaleness(player: PlayerTruth, report: Pick<ScoutingReport, 'sourcePlayerStateHash'>): StalenessResult {
  const currentStateHash = hashPlayerState(player);
  return { stale: currentStateHash !== report.sourcePlayerStateHash, currentStateHash, reportStateHash: report.sourcePlayerStateHash };
}
