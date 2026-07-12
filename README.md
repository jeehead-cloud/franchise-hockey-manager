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

`db:migrate` applies Prisma migrations to local SQLite (`packages/server/prisma/dev.db`). F1 adds `AppMeta`; F2 adds the core world entities. Do not commit `*.db` files.

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

- API: http://127.0.0.1:3000 (`GET /health`, read-only `GET /api/...`)
- UI: http://localhost:5173 (Vite proxies `/health` and `/api`)

## Tests

```powershell
npm run test:server
```

Vitest uses isolated temporary SQLite databases (does not mutate the normal `dev.db` except when you run migrate yourself).

## Packages

| Package | Role |
|---|---|
| `@fhm/engine` | Pure simulation/generation logic (currently wiring export only) |
| `@fhm/server` | Fastify + Prisma + SQLite REST API |
| `@fhm/client` | React + Vite shell using Atlas design tokens |

## Design references

Approved visual materials live under `design/system` and `design/screens` (not imported at runtime). The client adapts tokens and primitives into maintainable TSX.

## Docs

- `PROJECT.md` — vision & roadmap
- `AI_AGENTS.md` — agent operating rules
- `ARCHITECTURE.md` — stack & structure
- `CURRENT_STATUS.md` — implementation snapshot + history
- `PLAYER_MODEL.md` / `PRODUCT_RULES.md` — gameplay model (later milestones)
- `DEPLOYMENT.md` — local run / future hosting
