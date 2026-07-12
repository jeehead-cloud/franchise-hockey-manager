# Local world datasets

Version-controlled **input snapshots** for world initialization (F3+). Mutable runtime state lives in SQLite (`packages/server/prisma/*.db`), not here.

## Layout

| Path | Role |
|---|---|
| `data/world/` | Intended location for the owner-prepared real initial-world snapshot |
| `data/fixtures/f3-minimal-world/` | Fictional development/test fixture (**schemaVersion 2**, complete F5 player models) |
| `data/names/`, `data/nhl-teams.json` | Legacy leftover name/team lists — **not** F3 import format |

## Manifest schema (schemaVersion 2)

F5 requires **`schemaVersion: 2`**. Schema version 1 is rejected with an explicit migration message (do not silently reinterpret old player rows).

Required manifest keys include `datasetId`, `datasetName`, `schemaVersion`, `sourceName`, `sourceUpdatedAt`, `worldSeasonLabel`, `worldSeasonStartYear`, `worldSeasonEndYear`, and `files`.

Entity JSON files reference each other by **externalId**, never by database IDs.

### Players (v2)

Each player must include development-profile fields (`preferredCoachingStyle`, `preferredTactics`, `personality`, `heroRating`, `stability`, `developmentRate`, `developmentRisk`, `potentialFloor`, `potentialCeiling`, `publicPotentialEstimate`) plus either:

- `skaterAttributes` (nine ints 1–20) for LW/RW/C/LD/RD, or
- `goalieAttributes` (nine ints 1–20) for G

Mutual exclusion is enforced. Hidden potential fields are imported but must not appear on ordinary public APIs.

## Server configuration

- Default dataset directory: `data/fixtures/f3-minimal-world` (relative to repo root)
- Override: `FHM_DATASET_DIR` (absolute or repo-relative path)

No web scraping, live APIs, or automatic roster sync.
