import type {
  DuplicatePolicy,
  ImportIssue,
  ImportPlan,
  ImportType,
  NamePoolDuplicateFact,
  NamePoolExistingEntry,
  NamePoolImportRow,
} from './types.js';
import { classifyNamePoolDuplicate, decideDuplicateAction, normalizeMaintenanceNameToken, validateNamePoolRow } from './validation.js';
import { computeImportPreviewHash } from './hashing.js';

/**
 * Build an import plan for a name-pool import. Pure — no I/O, no Prisma. The
 * server supplies raw rows (with stable 1-based row numbers) and the existing
 * entries to dedupe against. The engine classifies duplicates, decides creates
 * vs skips vs rejects per policy, and produces a deterministic preview hash.
 *
 * The plan is the *only* input the apply step needs; the apply step never
 * re-classifies — it executes the plan atomically.
 */
export function buildNamePoolImportPlan(args: {
  rows: ReadonlyArray<{ rowNumber: number; countryCode: unknown; firstName: unknown; lastName: unknown }>;
  existing: ReadonlyArray<NamePoolExistingEntry>;
  duplicatePolicy: DuplicatePolicy;
}): ImportPlan {
  const issues: ImportIssue[] = [];
  const duplicates: NamePoolDuplicateFact[] = [];
  const validRows: NamePoolImportRow[] = [];

  // Index existing entries for O(1) case-insensitive lookup.
  const existingIndex = new Map<string, NamePoolExistingEntry>();
  for (const e of args.existing) {
    const key = namePoolKey(e.countryCode.toUpperCase(), e.firstName, e.lastName);
    if (!existingIndex.has(key)) existingIndex.set(key, e);
  }
  // Also detect intra-batch duplicates.
  const batchSeen = new Set<string>();

  let validCount = 0;
  let warningCount = 0;
  let invalidCount = 0;
  let intendedCreates = 0;
  let intendedSkips = 0;

  for (const raw of args.rows) {
    const { issues: rowIssues, normalized } = validateNamePoolRow(
      raw.rowNumber,
      raw.countryCode,
      raw.firstName,
      raw.lastName,
    );
    if (rowIssues.length > 0) {
      issues.push(...rowIssues);
      invalidCount += 1;
      continue;
    }
    const row: NamePoolImportRow = {
      rowNumber: raw.rowNumber,
      countryCode: normalized!.countryCode,
      firstName: normalized!.firstName,
      lastName: normalized!.lastName,
    };
    validRows.push(row);
    validCount += 1;

    const existing = existingIndex.get(namePoolKey(row.countryCode, row.firstName, row.lastName));
    const intraBatch = batchSeen.has(namePoolKey(row.countryCode, row.firstName, row.lastName));
    const reference = existing ?? (intraBatch ? { countryCode: row.countryCode, firstName: row.firstName, lastName: row.lastName } : null);
    if (reference) {
      const classification = classifyNamePoolDuplicate(
        { countryCode: row.countryCode, firstName: row.firstName, lastName: row.lastName },
        reference,
      );
      duplicates.push({
        rowNumber: row.rowNumber,
        countryCode: row.countryCode,
        firstName: row.firstName,
        lastName: row.lastName,
        classification,
      });
      const action = decideDuplicateAction(classification, args.duplicatePolicy);
      if (action === 'SKIP') {
        intendedSkips += 1;
        warningCount += 1;
      } else if (action === 'REJECT') {
        issues.push({
          rowNumber: row.rowNumber,
          fieldName: null,
          severity: 'BLOCKER',
          code: 'namePool.duplicateRejected',
          message: `Duplicate entry rejected by REJECT_CONFLICT policy: ${row.firstName} ${row.lastName} (${row.countryCode})`,
          normalizedValue: `${row.firstName} ${row.lastName}`,
        });
        invalidCount += 1;
        validCount -= 1; // demote — this row will not be applied
      } else {
        // ADD_NEW: keep but warn
        warningCount += 1;
        intendedCreates += 1;
      }
    } else {
      batchSeen.add(namePoolKey(row.countryCode, row.firstName, row.lastName));
      intendedCreates += 1;
    }
  }

  const basePlan: Omit<ImportPlan, 'previewHash'> = {
    importType: 'NAME_POOL' as ImportType,
    totalRows: args.rows.length,
    validRows: validCount,
    warningRows: warningCount,
    invalidRows: invalidCount,
    intendedCreates,
    intendedSkips,
    duplicatePolicy: args.duplicatePolicy,
    duplicates,
    issues,
  };
  return { ...basePlan, previewHash: computeImportPreviewHash(basePlan) };
}

function namePoolKey(countryCode: string, firstName: string, lastName: string): string {
  const f = normalizeMaintenanceNameToken(firstName)?.toLocaleLowerCase('en') ?? '';
  const l = normalizeMaintenanceNameToken(lastName)?.toLocaleLowerCase('en') ?? '';
  return `${countryCode}|${f}|${l}`;
}

/**
 * Extract the validated, apply-ready name-pool rows from a plan. Rows that
 * were demoted to invalid (e.g. by REJECT_CONFLICT) are excluded. The apply
 * step uses this to bulk-create new entries atomically.
 */
export function extractApplyReadyNamePoolRows(
  plan: ImportPlan,
  rows: ReadonlyArray<NamePoolImportRow>,
): NamePoolImportRow[] {
  const rejectedRowNumbers = new Set(
    plan.issues.filter((i) => i.code === 'namePool.duplicateRejected').map((i) => i.rowNumber),
  );
  const skipRowNumbers = new Set(
    plan.duplicates
      .filter((d) => decideDuplicateAction(d.classification, plan.duplicatePolicy) === 'SKIP')
      .map((d) => d.rowNumber),
  );
  return rows.filter((r) => !rejectedRowNumbers.has(r.rowNumber) && !skipRowNumbers.has(r.rowNumber));
}
