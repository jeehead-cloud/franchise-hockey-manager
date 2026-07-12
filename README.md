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

`db:migrate` applies Prisma migrations to local SQLite (`packages/server/prisma/dev.db`). F1 AppMeta → F2 domain entities → F3 source metadata + init fields. Do not commit `*.db` files.

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

- API: http://127.0.0.1:3000 (`GET /health`, read `GET /api/...`, setup `GET|POST /api/setup/*`)
- UI: http://localhost:5173 (Vite proxies `/health` and `/api`)
- Setup World: http://localhost:5173/setup

### World dataset

Default dataset: `data/fixtures/f3-minimal-world/` (fictional development fixture).

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
npm run test:server
```

Vitest uses isolated temporary SQLite databases (does not mutate the normal `dev.db` except when you run migrate yourself).

## Packages

| Package | Role |
|---|---|
| `@fhm/engine` | Pure simulation/generation logic (currently wiring export only) |
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
