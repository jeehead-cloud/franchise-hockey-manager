import type {
  DevelopmentPlayerInput,
  DevelopmentPlayerResult,
  DevelopmentRunSummary,
} from '@fhm/engine';
import type { PlayerDevelopmentOutcome, PlayerDevelopmentRunStatus } from '@prisma/client';

export type PlayerRowForDevelopment = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  primaryPosition: string;
  rosterStatus: string;
  sourceType: string;
  form: number;
  developmentRate: number | null;
  potentialFloor: number | null;
  potentialCeiling: number | null;
  preferredCoachingStyle: string | null;
  preferredTactics: string | null;
  personality: string | null;
  heroRating: number | null;
  stability: number | null;
  developmentRisk: number | null;
  publicPotentialEstimate: string | null;
  updatedAt: Date;
  currentTeamId: string | null;
  currentTeam?: { name: string } | null;
  skaterAttributes?: Record<string, number | Date | string> | null;
  goalieAttributes?: Record<string, number | Date | string> | null;
};

export interface DevelopmentPreviewResultDto {
  playerId: string;
  playerName: string;
  playerType: string;
  position: string;
  teamId: string | null;
  teamName: string | null;
  ageOnEffectiveDate: number;
  currentAbilityBefore: number;
  currentAbilityAfter: number;
  roleBefore: string;
  roleAfter: string;
  formBefore: number;
  formAfter: number;
  outcome: string;
  retired: boolean;
  direction: string;
  attributeChangeCount: number;
  warnings: string[];
}

export interface DevelopmentRunSummaryDto {
  totalPlayers: number;
  developedCount: number;
  declinedCount: number;
  stableCount: number;
  retiredCount: number;
  warningCount: number;
  averageAbilityChange: number;
  inputHash: string;
  resultHash: string;
}

export interface DevelopmentRunDto {
  id: string;
  worldSeasonId: string;
  status: PlayerDevelopmentRunStatus;
  runVersion: number;
  effectiveDate: string;
  baseSeed: string;
  configVersionId: string;
  configHash: string;
  inputHash: string;
  resultHash: string | null;
  totalPlayers: number;
  developedCount: number;
  declinedCount: number;
  stableCount: number;
  retiredCount: number;
  warningCount: number;
  isCurrent: boolean;
  backupPath: string | null;
  failureReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function mapRunSummary(summary: DevelopmentRunSummary): DevelopmentRunSummaryDto {
  return {
    totalPlayers: summary.totalPlayers,
    developedCount: summary.developedCount,
    declinedCount: summary.declinedCount,
    stableCount: summary.stableCount,
    retiredCount: summary.retiredCount,
    warningCount: summary.warningCount,
    averageAbilityChange: summary.averageAbilityChange,
    inputHash: summary.inputHash,
    resultHash: summary.resultHash,
  };
}

export function mapPreviewResult(
  result: DevelopmentPlayerResult,
  playerName: string,
  teamId: string | null,
  teamName: string | null,
  opts?: { includePotential?: boolean },
): DevelopmentPreviewResultDto {
  const dto: DevelopmentPreviewResultDto = {
    playerId: result.playerId,
    playerName,
    playerType: result.playerType,
    position: result.position,
    teamId,
    teamName,
    ageOnEffectiveDate: result.ageOnEffectiveDate,
    currentAbilityBefore: result.currentAbilityBefore,
    currentAbilityAfter: result.currentAbilityAfter,
    roleBefore: result.roleBefore,
    roleAfter: result.roleAfter,
    formBefore: result.form.formBefore,
    formAfter: result.form.formAfter,
    outcome: result.outcome,
    retired: result.retired,
    direction: result.direction,
    attributeChangeCount: result.attributeChanges.length,
    warnings: result.warnings,
  };
  if (opts?.includePotential) {
    (dto as DevelopmentPreviewResultDto & { potentialCeiling?: number }).potentialCeiling =
      result.potentialCeiling;
  }
  return dto;
}

export function mapRunRow(run: {
  id: string;
  worldSeasonId: string;
  status: PlayerDevelopmentRunStatus;
  runVersion: number;
  effectiveDate: string;
  baseSeed: string;
  configVersionId: string;
  configHash: string;
  inputHash: string;
  resultHash: string | null;
  totalPlayers: number;
  developedCount: number;
  declinedCount: number;
  stableCount: number;
  retiredCount: number;
  warningCount: number;
  isCurrent: boolean;
  backupPath: string | null;
  failureReason: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): DevelopmentRunDto {
  return {
    id: run.id,
    worldSeasonId: run.worldSeasonId,
    status: run.status,
    runVersion: run.runVersion,
    effectiveDate: run.effectiveDate,
    baseSeed: run.baseSeed,
    configVersionId: run.configVersionId,
    configHash: run.configHash,
    inputHash: run.inputHash,
    resultHash: run.resultHash,
    totalPlayers: run.totalPlayers,
    developedCount: run.developedCount,
    declinedCount: run.declinedCount,
    stableCount: run.stableCount,
    retiredCount: run.retiredCount,
    warningCount: run.warningCount,
    isCurrent: run.isCurrent,
    backupPath: run.backupPath,
    failureReason: run.failureReason,
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
    failedAt: run.failedAt?.toISOString() ?? null,
    cancelledAt: run.cancelledAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

export function mapResultRow(
  row: {
    id: string;
    runId: string;
    playerId: string;
    playerNameSnapshot: string;
    playerType: string;
    positionSnapshot: string;
    teamIdSnapshot: string | null;
    teamNameSnapshot: string | null;
    ageOnEffectiveDate: number;
    currentAbilityBefore: number;
    currentAbilityAfter: number;
    roleBefore: string;
    roleAfter: string;
    formBefore: number;
    formAfter: number;
    outcome: PlayerDevelopmentOutcome;
    retired: boolean;
    retirementReasonText: string | null;
    attributeChangesText: string;
    resultHash: string;
  },
  opts?: { includePotential?: boolean; potentialSnapshot?: number },
) {
  const item = {
    id: row.id,
    runId: row.runId,
    playerId: row.playerId,
    playerName: row.playerNameSnapshot,
    playerType: row.playerType,
    position: row.positionSnapshot,
    teamId: row.teamIdSnapshot,
    teamName: row.teamNameSnapshot,
    ageOnEffectiveDate: row.ageOnEffectiveDate,
    currentAbilityBefore: row.currentAbilityBefore,
    currentAbilityAfter: row.currentAbilityAfter,
    roleBefore: row.roleBefore,
    roleAfter: row.roleAfter,
    formBefore: row.formBefore,
    formAfter: row.formAfter,
    outcome: row.outcome,
    retired: row.retired,
    retirementReason: row.retirementReasonText,
    attributeChanges: JSON.parse(row.attributeChangesText),
    resultHash: row.resultHash,
  };
  if (opts?.includePotential && opts.potentialSnapshot != null) {
    return { ...item, potentialCeiling: opts.potentialSnapshot };
  }
  return item;
}

export function playerDisplayName(row: { firstName: string; lastName: string }): string {
  return `${row.firstName} ${row.lastName}`.trim();
}

export function birthDateUtcString(dateOfBirth: Date): string {
  const y = dateOfBirth.getUTCFullYear();
  const m = String(dateOfBirth.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dateOfBirth.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
