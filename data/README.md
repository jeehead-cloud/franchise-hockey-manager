# Local world datasets

Version-controlled **input snapshots** for world initialization (F3). Mutable runtime state lives in SQLite (`packages/server/prisma/*.db`), not here.

## Layout

| Path | Role |
|---|---|
| `data/world/` | Intended location for the owner-prepared real initial-world snapshot |
| `data/fixtures/f3-minimal-world/` | Fictional development/test fixture (default until a real snapshot exists) |
| `data/names/`, `data/nhl-teams.json` | Legacy leftover name/team lists — **not** F3 import format |

## Manifest schema (schemaVersion 1)

See `FOUNDATION_IMPLEMENTATION_PLAN.md` §F3 and `ARCHITECTURE.md`. Required keys include `datasetId`, `datasetName`, `schemaVersion`, `sourceName`, `sourceUpdatedAt`, `worldSeasonLabel`, `worldSeasonStartYear`, `worldSeasonEndYear`, and `files`.

Entity JSON files reference each other by **externalId**, never by database IDs.

## Server configuration

- Default dataset directory: `data/fixtures/f3-minimal-world` (relative to repo root)
- Override: `FHM_DATASET_DIR` (absolute or repo-relative path)

No web scraping, live APIs, or automatic roster sync.
