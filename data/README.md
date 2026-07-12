# Local world datasets

Version-controlled **input snapshots** for world initialization (F3+). Mutable runtime state lives in SQLite (`packages/server/prisma/*.db`), not here.

## Layout

| Path | Role |
|---|---|
| `data/world/` | Intended location for the owner-prepared real initial-world snapshot |
| `data/fixtures/f3-minimal-world/` | Fictional development/test fixture (**schemaVersion 3**, complete F5 player models, coach ratings, and team tactics) |
| `data/names/`, `data/nhl-teams.json` | Legacy leftover name/team lists — **not** F3 import format |

## Manifest schema (schemaVersion 3)

F7 requires **`schemaVersion: 3`**. Earlier versions are rejected rather than silently reinterpreted.

Required manifest keys include `datasetId`, `datasetName`, `schemaVersion`, `sourceName`, `sourceUpdatedAt`, `worldSeasonLabel`, `worldSeasonStartYear`, `worldSeasonEndYear`, and `files`.

Entity JSON files reference each other by **externalId**, never by database IDs.

### Players (v2)

Each player must include development-profile fields (`preferredCoachingStyle`, `preferredTactics`, `personality`, `heroRating`, `stability`, `developmentRate`, `developmentRisk`, `potentialFloor`, `potentialCeiling`, `publicPotentialEstimate`) plus either:

- `skaterAttributes` (nine ints 1–20) for LW/RW/C/LD/RD, or
- `goalieAttributes` (nine ints 1–20) for G

Mutual exclusion is enforced. Hidden potential fields are imported but must not appear on ordinary public APIs.

### Coaches (v3)

Each coach must include `coachingStyle`, `tacticalStyle`, and ratings `overallCoaching`, `playerDevelopment`, `offense`, `defense` (integers 1–20), plus optional `nationalityExternalId` / `currentTeamExternalId`.

### Teams (v3)

Each team must include `tacticalStyle` (team configuration; separate from the coach’s own tactical style).

## Server configuration

- Default dataset directory: `data/fixtures/f3-minimal-world` (relative to repo root)
- Override: `FHM_DATASET_DIR` (absolute or repo-relative path)

No web scraping, live APIs, or automatic roster sync.
