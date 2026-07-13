# Franchise Hockey Manager

Browser-based hockey franchise simulation. See `PROJECT.md` for vision and roadmap.

## Prerequisites

- Node.js 20+
- npm 10+

## Setup

```powershell
cd C:\Projects\franchise-hockey-manager
npm install
npm run build --workspace=@fhm/engine
npm run db:generate --workspace=@fhm/server
npm run db:migrate --workspace=@fhm/server
```

`db:migrate` applies Prisma migrations to local SQLite (`packages/server/prisma/dev.db`). F1 → … → F10 balance presets → **F11–F13 event engine** → **F14 match persistence tables**. After migrate on an existing world, run `npm run balance:bootstrap` if Standard v5 is missing (also runs on server start / world init; upgrades active Standard v1–v4 → v5 only). Do not commit `*.db` files.

## Run locally

```powershell
npm run dev
```

Starts server and client together via `concurrently`.

Or separately:

```powershell
npm run dev:server
npm run dev:client
```

- API: http://127.0.0.1:3000 (`GET /health`, read `GET /api/...`, balance `GET /api/balance/*`, setup `GET|POST /api/setup/*`, world summary `GET /api/world`, chemistry `GET /api/teams/:id/chemistry`, **matches** `GET|POST /api/matches/*`, **F13 debug** `POST /api/simulation/debug/*` when enabled)
- UI: http://localhost:5173 (Vite proxies `/health` and `/api`)
- Setup World: http://localhost:5173/setup
- Settings: `/settings` (Game Balance / Runtime & Debug / Commissioner Mode)
- **Competitions (F17–F21):** `/competitions`, edition pages with regular season (F18), playoffs (F19), aggregated seasons (F21), plus immutable archive/history (F20) under `/history`.
- **History (F20):** `/history`, `/history/competitions/:archiveId`, player/team season history routes. Aggregated archives are labeled distinctly from detailed seasons.
- **Technical simulation (F16):** `/simulation-lab` — Batch Lab (1/10/100/1000 unpersisted F14 aggregates) + Single Match Debug (F13 technical); neither creates official Match records
- **Matches (F15):** `/matches`, `/matches/new`, `/matches/:matchId` — persisted match viewer (overview, public events, stats, lines/usage; Commissioner diagnostics/attempts)
- Browsers: `/world`, `/teams`, `/players`, `/competitions`, `/coaches` (+ detail routes; Team Lines shows chemistry + active balance meta)
- Commissioner editor: `/players/:playerId/edit` (requires Commissioner Mode)
- Settings: enable/disable Commissioner Mode (defaults off; confirm to enable)

### Commissioner Mode (local sandbox)

- Header on write/detail/audit calls: `X-FHM-Commissioner-Mode: enabled`
- Optional server gate: `FHM_COMMISSIONER_WRITES_ENABLED=true|false` (default enabled when unset)
- Not authentication — safety boundary for local single-user editing only

### World dataset

Default dataset: `data/fixtures/f3-minimal-world/` (fictional development fixture, **schemaVersion 2** with complete F5 player models).

Override:

```powershell
$env:FHM_DATASET_DIR = "C:\Projects\franchise-hockey-manager\data\world"
```

Preview / validate without the UI:

```powershell
npm run setup:preview
npm run setup:validate
npm run setup:status
```

Initialize only against an empty disposable database (duplicate init is blocked). Prefer UI confirmation on `/setup`, or CLI `tsx packages/server/src/cli/setup.ts initialize` when intentional.

## Tests

```powershell
npm run test:engine
npm run test:server
npm run verify:event-engine
npm run verify:scoring-engine
npm run verify:special-teams-engine
npm run verify:playable-match-engine
npm run verify:simulation-lab
```

Vitest uses isolated temporary SQLite databases for server tests (does not mutate the normal `dev.db` except when you run migrate yourself).

## Packages

| Package | Role |
|---|---|
| `@fhm/engine` | Pure simulation/generation logic (F5 player model: attributes, ratings, roles) |
| `@fhm/server` | Fastify + Prisma + SQLite REST API + world import |
| `@fhm/client` | React + Vite shell using Atlas design tokens |

## Design references

Approved visual materials live under `design/system` and `design/screens` (not imported at runtime). The client adapts tokens and primitives into maintainable TSX.

## Docs

- `PROJECT.md` — vision & roadmap
- `AI_AGENTS.md` — agent operating rules
- `PRODUCT_STRUCTURE.md` / `FOUNDATION_IMPLEMENTATION_PLAN.md` — target product & F1–F33 plan
- `ARCHITECTURE.md` — stack & structure
- `CURRENT_STATUS.md` — implementation snapshot + history
- `PLAYER_MODEL.md` / `PRODUCT_RULES.md` — gameplay model (later milestones)
- `DEPLOYMENT.md` — local run / future hosting
- `data/README.md` — dataset layout
