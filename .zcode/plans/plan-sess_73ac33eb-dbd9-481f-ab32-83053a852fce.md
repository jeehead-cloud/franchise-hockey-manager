# F32 — Backup and Recovery (Implementation Plan)

## Recovery summary
- Working tree is **clean** (verified via `git status --porcelain` + untracked scan); the restart lost the prior session before any F32 work was written. F31 (`c47d439`) is committed and pushed (`origin/main...main: 0 0`). Baseline is healthy.
- Stray `.db` files are pre-existing gitignored/untracked test artifacts, not F32 work. `.gitignore` already covers `*.db` and `.fhm-backups/`.
- **Decision: implement F32 fresh from the clean F31 baseline.** No existing work discarded. Recovery files written outside the repo (empty patches). No valuable DB touched.

## Architecture decision (confirmed with user)
**Restart-required restore.** The Prisma client is an eagerly-imported module-level singleton (`packages/server/src/db/client.ts`) held open for the process lifetime with no in-process reconnect path. In-process hot restore is unsafe and explicitly disallowed by the spec. Restore will: prepare → write recovery journal + restore marker + pre-restore backup → return `RESTART_REQUIRED`; a **pre-Prisma startup bootstrap** (`index.ts`, before `buildApp`/`ensureAppMeta`) performs atomic file replacement, verification, additive migration, and history reconciliation, clearing the marker only after success.

## Design

### Configuration / versioning
Mirror the existing `SeasonTransitionPreset` pattern (the cleanest template). New Prisma models: `BackupPreset`, immutable `BackupPresetVersion`, singleton `ActiveBackupConfiguration`. Bootstrap `Backup Default` idempotently in `ensureAppMeta()` via a new `bootstrapBackupConfiguration(prisma)`. Engine owns strict versioned config validation (schemaVersion 1: storage / creation / retention / restore / limits), default config, and config hashing — no Prisma, no I/O.

### SQLite backup strategy
Server-owned (file/DB operations stay server-side per the engine-purity rule). Use `VACUUM INTO` (already proven in `sqlite-backup.ts`) with a **dedicated read-only connection** rather than the shared write client, to avoid mutating world data and to be safe against an actively-written DB. Destination must not pre-exist; normalize/escape target path; close cleanly; reopen read-only; run `PRAGMA integrity_check`; verify migration table; compute table counts; hash. Reject non-`file:` DATABASE_URL with an explicit unsupported-backend error.

### Path safety
Canonicalize all paths; reject `..`; reject symlink escape where detectable; allowlist extensions `.sqlite`/`.json`; **filenames generated server-side** (collision-safe `fhm-{timestamp}-{reason}-{shortHash}.sqlite`); verify resolved path is inside the backup root on every read. No user-supplied filenames; no arbitrary-path deletion. Backup IDs map to persisted relative paths.

### Manifest + file hash + fingerprint
Sidecar canonical JSON manifest (`manifestSchemaVersion: 1`) with source/backup file metadata, DB fingerprint, migration info, bounded table counts, current WorldSeason, config version/hash, source operation. **File SHA-256** (proves bytes) computed after close; **manifest SHA-256** computed over canonical JSON. **Database fingerprint** (proves semantic state) = deterministic normalized digest of: migration history, AppMeta/world identifiers, current WorldSeason, key entity counts, SQLite `user_version` — excludes absolute path, timestamp, backup ID.

### Centralized operation integration
Add `commissioner-backups.ts` + `backup-creation.ts` exposing `createDatabaseBackup({ reasonCode, reasonText?, sourceOperationType?, sourceOperationId?, sourceEntityType?, sourceEntityId?, protected? })`. **Replace all 12 `createSqliteSafetyBackup` call sites** (F18/F19/F20/F21/F23/F24/F25/F27×2/F28×2/F29/F31) to route through the centralized service, recording source operation type/id and blocking the operation unless the backup reaches VERIFIED. **Idempotency:** same operation-type+id+reason reuses an existing VERIFIED backup; MISSING/CORRUPT/FAILED triggers a new one. Keep `sqlite-backup.ts` only as an internal F32 helper. The old hardcoded `f18-` prefix bug is removed.

### Inventory / verification
Commissioner-only inventory (list/detail, filter by status/type/reason/protected/date, allowlisted sort). Manual re-verification endpoint recomputes file hash, manifest hash, integrity_check, migrations, fingerprint, path — returns VERIFIED/MISSING/CORRUPT/FAILED. Failed backups are never restorable. Public `/health` gets bounded backup subsystem status only (configured/unconfigured, last verified backup age — no filenames/paths/hashes).

### Retention / protection
Engine `retention.ts` computes a deterministic pruning plan from age/max-count/min-keep/latest-per-reason/protection flags. Prune-preview (no deletion) + prune (Commissioner-gated, explicit reason, deletes selected file+manifest, marks DELETED, appends history). Protected backups cannot be pruned; backups referenced by active restores cannot be pruned; pre-restore backups auto-protected; never delete outside backup root; never delete the active DB; default never deletes the only verified backup. Protect/unprotect with persisted reason (mandatory system protection cannot be removed).

### Storage scan
Detects metadata-without-file, file-without-metadata, manifest-without-db, db-without-manifest, unexpected extension, path outside root, duplicate filename, unrecognized old format. No automatic deletion.

### Restore lifecycle (restart-required)
`DatabaseRestoreRun` (PREPARED→WAITING_FOR_RESTART→RUNNING→VERIFYING→COMPLETED/FAILED/CANCELLED) + append-only `DatabaseRestoreEvent`. Flow: **restore-preview** (no writes; source/target fingerprints, migration compat, data-loss warning, restart requirement) → **restore-prepare** (re-verify source, confirm current fingerprint, ensure no other restore + no conflicting world op, create pre-restore backup, create run + external journal + marker) → **request-restart** (returns RESTART_REQUIRED) → user restarts → **startup bootstrap** replaces DB atomically, verifies, migrates, reconciles, clears marker. Typed confirmation phrase `RESTORE <backup short id>` required (not just a checkbox). Cancel allowed only for PREPARED/WAITING (before replacement); RUNNING/VERIFYING cannot be cancelled; COMPLETED immutable.

### Pre-restore backup + external recovery journal
Pre-restore backup is mandatory (config `restore.requirePreRestoreBackup`), auto-protected, type `PRE_RESTORE`. **External recovery journal** lives in the backup directory as a canonical-JSON sidecar keyed by restore ID — because restoring an older DB may delete the restore-run row that requested it. Startup reads/updates the journal around DB replacement; after the restored DB opens, reconcile the completed restore summary into it. Journal stores no secrets.

### Maintenance mode
File-based maintenance state set when a restore is WAITING_FOR_RESTART/RUNNING/VERIFYING: mutating APIs return 503 MaintenanceMode/RestoreInProgress; reads allowed; `/health` reports maintenance/recovery; UI shows recovery notice. No authentication changes.

### Failure / rollback
Before-replacement failure: current DB untouched, run FAILED/CANCELLED. During-replacement failure: attempt rollback from the emergency copy, preserve journal, halt startup with explicit recovery instructions, keep pre-restore backup protected. After-replacement verification failure: attempt deterministic rollback to pre-restore backup, else halt and report critical recovery state. Marker cleared only after success. Failures are never hidden.

### Migration-after-restore policy
Backups may be older than current schema; restore restores exact bytes, then runs pending **additive** migrations through the current chain; record pre/post-migration fingerprints; verify no migration failure; no backward/destructive restore. All existing migrations are additive (will verify).

### Engine / server separation
Engine `packages/engine/src/backup/` = policy only: types, config validation, retention, compatibility, reconciliation, restore readiness, status transitions, normalized manifest hash input, deterministic fingerprint input, hashing — no Prisma, no fs, no SQLite. Server owns all file/DB operations + the 10 services (`backup-config`/`-paths`/`-manifest`/`-fingerprint`/`-verification`/`-creation`/`-retention`/`-restore`/`-history`/`commissioner-backups`) + recovery journal + startup bootstrap.

### Correction restrictions / F33 boundary
Do not redesign F1–F31 except the verified replacement of the 12 ad-hoc backup call sites through the central service (a required F32 integration). No F33 import/export, no record-level restore, no cloud/encryption/incremental, no PostgreSQL, no auth/deployment.

## Files changed (planned)

**Engine** (`packages/engine/src/backup/` — new, pure):
- `types.ts`, `config.ts`, `retention.ts`, `compatibility.ts`, `reconciliation.ts`, `hashing-input.ts`, `index.ts`
- `backup.test.ts`, `verify-backup.ts`
- wire exports into `packages/engine/src/index.ts`; add `verify:backup-recovery` script in `packages/engine/package.json`

**Prisma** (`packages/server/prisma/`):
- `schema.prisma` — `BackupPreset`/`BackupPresetVersion`/`ActiveBackupConfiguration`/`DatabaseBackup`/`DatabaseRestoreRun`/`DatabaseRestoreEvent` (+ optional `BackupVerificationEvent`); new enums `BackupStatus`/`BackupType`/`RestoreStatus`/`RestoreEventType` and audit enum values `BACKUP_*`/`DATABASE_BACKUP`/`DATABASE_RESTORE`/`BACKUP_CONFIG*`
- `migrations/20260719000000_f32_backup_recovery/migration.sql` — additive, nullable/default-safe, indexes, no backup created, no marker

**Server** (`packages/server/src/`):
- Services: `services/backup-config.ts`, `services/backup-paths.ts`, `services/backup-manifest.ts`, `services/backup-fingerprint.ts`, `services/backup-verification.ts`, `services/backup-creation.ts`, `services/backup-retention.ts`, `services/backup-restore.ts`, `services/backup-history.ts`, `services/commissioner-backups.ts`, `services/backup-errors.ts`, `services/recovery-journal.ts`, `services/backup-bootstrap.ts`, `services/maintenance-mode.ts`
- Modify `services/sqlite-backup.ts` (internal helper only), and the **12 callers** (F18/F19/F20/F21/F23/F24/F25/F27/F28×2/F29/F31) to use the central service
- Routes: `routes/backup-recovery.ts` (public), `routes/commissioner-backup-recovery.ts` (Commissioner)
- Startup: modify `index.ts` (pre-Prisma restore bootstrap) and `app.ts` (register routes + `bootstrapBackupConfiguration`)
- `/health` bounded backup status
- Tests: `tests/f32-backup-recovery.test.ts` (41 server scenarios) + update the 12 existing F-tests' `FHM_BACKUP_DIR` setup to isolated dirs

**Client** (`packages/client/src/`):
- Pages: `pages/BackupRecoveryPage.tsx` (+ sub-pages for backup/restore detail), `lib/backupRecovery.ts` (API client)
- Sidebar entry + routes in `App.tsx` / `Sidebar.tsx`; `/backup-recovery`, `/backup-recovery/backups/:backupId`, `/backup-recovery/restores/:restoreId`

**Root / docs**:
- `package.json` (root) — add `verify:backup-recovery` forwarder
- `CURRENT_STATUS.md` (F32 status + Recent + Significant), `ARCHITECTURE.md` (§7r F32), `PRODUCT_RULES.md` (stable invariants), `README.md`, `FOUNDATION_IMPLEMENTATION_PLAN.md`, `PRODUCT_STRUCTURE.md`, `PROJECT.md`, `DEPLOYMENT.md` (`FHM_BACKUP_DIR`, SQLite-only, restart-required, journal path, emergency recovery), `data/README.md`
- `PLAYER_MODEL.md` — reviewed, no change needed (per spec)

## Validation (sequential)
Prisma format → validate → generate → empty-DB `migrate deploy` through F32 → F31→F32 migration → engine tests + `verify:backup-recovery` → all existing verifiers → full server tests → client tests/build → root typecheck → engine/server/client builds → `git diff --check`. Manual UI reported separately as NOT RUN (no live UI in this environment). All testing on disposable temp SQLite DBs with isolated backup dirs — no valuable DB touched.

## Git rules honored
Not committed, not pushed. No F33. No backup DBs/manifests/journals/markers committed (`.gitignore` already covers `.fhm-backups/` + `*.db`; will confirm markers are ignored).