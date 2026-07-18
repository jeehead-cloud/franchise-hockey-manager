# Local world datasets

Version-controlled **input snapshots** for world initialization (F3+). Mutable runtime state lives in SQLite (`packages/server/prisma/*.db`), not here.

## Layout

| Path | Role |
|---|---|
| `data/world/` | Intended location for the owner-prepared real initial-world snapshot |
| `data/fixtures/f3-minimal-world/` | Fictional development/test fixture (**schemaVersion 5**, F17 competition rules + F8 secondary positions; Frostbite has full main-lineup depth) |
| `data/names/`, `data/nhl-teams.json` | Legacy leftover name/team lists — **not** F3 import format; **not** used by F25 youth generation (F25 seeds fictional DB name pools for fixture countries during bootstrap) |

## Manifest schema (schemaVersion 5)

F17 requires **`schemaVersion: 5`**. Earlier versions are rejected rather than silently reinterpreted. Competitions may include optional `defaultRules` and country/league external IDs; editions may include optional `rules` snapshots.

F22 does **not** require a `national-teams.json` import file; national-team definitions are created via Commissioner APIs. schemaVersion remains **5**.

F32 (backup/recovery) requires **no dataset change** — schemaVersion remains **5**. The F32 bootstrap creates only the default backup configuration (`Backup Default`) idempotently on server startup; it does **not** create an automatic backup during setup (the UI shows "No verified backups yet" until the Commissioner creates one).

F33 (import/export maintenance) requires **no dataset change** — schemaVersion remains **5**. The F33 bootstrap creates only the default maintenance configuration (`Maintenance Default`) idempotently on server startup. F33 exports never mutate world data; imports (name pools, configuration presets) always preview first and apply atomically after a VERIFIED F32 backup; database validation never silently repairs; initialization reset requires Commissioner + typed confirmation + fingerprint + mandatory F32 backup and preserves migrations + backups. No data files are required.

Required manifest keys include `datasetId`, `datasetName`, `schemaVersion`, `sourceName`, `sourceUpdatedAt`, `worldSeasonLabel`, `worldSeasonStartYear`, `worldSeasonEndYear`, and `files`.

Entity JSON files reference each other by **externalId**, never by database IDs.

### Players (v2)

Each player must include development-profile fields (`preferredCoachingStyle`, `preferredTactics`, `personality`, `heroRating`, `stability`, `developmentRate`, `developmentRisk`, `potentialFloor`, `potentialCeiling`, `publicPotentialEstimate`) plus either:

- `skaterAttributes` (nine ints 1–20) for LW/RW/C/LD/RD, or
- `goalieAttributes` (nine ints 1–20) for G

Mutual exclusion is enforced. Hidden potential fields are imported but must not appear on ordinary public APIs.

### Coaches (v3)

Each coach must include `coachingStyle`, `tacticalStyle`, and ratings `overallCoaching`, `playerDevelopment`, `offense`, `defense` (integers 1–20), plus optional `nationalityExternalId` / `currentTeamExternalId`.

### Teams (v3+)

Each team must include `tacticalStyle` (team configuration; separate from the coach’s own tactical style).

### Secondary positions (v4)

Skaters may include `secondaryPositions: ['LW'|'RW'|'C'|'LD'|'RD']` (optional; empty array allowed). Rules:

- must not include primary position;
- no duplicates;
- goalies must use `[]`;
- `G` is never a secondary.

Lineups are **not** imported; teams start without a persisted lineup until Commissioner assignment or auto-fill.

## Server configuration

- Default dataset directory: `data/fixtures/f3-minimal-world` (relative to repo root)
- Override: `FHM_DATASET_DIR` (absolute or repo-relative path)

No web scraping, live APIs, or automatic roster sync.

## F28 contract compatibility initialization

Dataset import does not invent contracts. After world initialization, Commissioner Mode can preview and publish one deterministic one-season ACTIVE contract for each eligible team-owned Player. Publication uses the selected existing WorldSeason, creates a SQLite safety backup, is atomic, and sets `AppMeta.contractsInitializedAt`; before that marker, missing contracts are compatibility warnings, and afterward they are readiness blockers. Salary is stored as integer dollars and no salary cap is enforced.

## F29 trade configuration bootstrap

Dataset import does not create trades. World initialization bootstraps one idempotent **Trades Simplified Default** system preset/version and activates it only when no owner trade configuration exists (owner configurations are preserved). No trade files are required and **schemaVersion remains 5**. Trade-value defaults are advisory only (normalized 0–100 scale) and F29 enforces no salary cap, retained salary, conditional picks, or multi-team trades.

## F30 offseason configuration bootstrap

Dataset import does not create offseason runs. World initialization bootstraps one idempotent **Offseason Default** system preset/version (13 ordered phases; required phases cannot be skipped; optional phases DRAFTED_PLAYER_SIGNINGS/FREE_AGENCY/TRADES/SCOUTING_REVIEW may be skipped) and activates it only when no owner offseason configuration exists (owner configurations are preserved). No offseason files are required and **schemaVersion remains 5**. F30 is pure coordination — it never duplicates F20/F24/F25/F27/F28/F29 logic and never creates the next WorldSeason (F31 does).

## F31 season-transition configuration bootstrap

Dataset import does not create the next WorldSeason or any SeasonTransitionRun. World initialization bootstraps one idempotent **Season Transition Default** system preset/version (creates one next WorldSeason; no automatic edition activation; no automatic national-team preparation; no locked-roster reuse; no automatic future-contract activation; no automatic lineup rebuild) and activates it only when no owner season-transition configuration exists (owner configurations are preserved). No season-transition files are required and **schemaVersion remains 5**. F31 is the only milestone that may create the next WorldSeason; it never replays F24–F30 operations and never generates schedules or Matches.
