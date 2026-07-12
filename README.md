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

`db:migrate` creates the local SQLite database (`packages/server/prisma/dev.db`). F1 ships a bootstrap-only Prisma schema (`AppMeta`) — no gameplay entities yet.

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

- API: http://127.0.0.1:3000 (`GET /health`)
- UI: http://localhost:5173 (Vite proxies `/health` to the API)

Optional client env: copy `packages/client/.env.example` → `.env` and set `VITE_API_URL` if not using the Vite proxy.

## Packages

| Package | Role |
|---|---|
| `@fhm/engine` | Pure simulation/generation logic (F1: wiring export only) |
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
