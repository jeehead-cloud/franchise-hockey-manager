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
npm run db:seed --workspace=@fhm/server
```

`db:migrate` will prompt for a migration name on first run (e.g. `init`).

## Run locally

Two terminals:

```powershell
npm run dev --workspace=@fhm/server
npm run dev --workspace=@fhm/client
```

- API: http://localhost:3000
- UI: http://localhost:5173 (proxies `/api` to the server)

## Packages

| Package | Role |
|---|---|
| `@fhm/engine` | Pure player generation / aging / role derivation |
| `@fhm/server` | Fastify + Prisma + SQLite REST API |
| `@fhm/client` | React + Vite + Tailwind UI |

## Docs

- `PROJECT.md` — vision & roadmap
- `AI_AGENTS.md` — agent operating rules
- `ARCHITECTURE.md` — stack & structure
- `PLAYER_MODEL.md` — player generation formulas
- `PRODUCT_RULES.md` — design invariants
- `CURRENT_STATUS.md` — implementation snapshot
- `DEPLOYMENT.md` — local run / future hosting
