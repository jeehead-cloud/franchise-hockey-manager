# Franchise Hockey Manager — Architecture

**Status:** Active
**Last updated:** 2026-07-12
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`

> Technical source of truth for stack, monorepo structure, data flow, and config-driven balance.
> For game behavior, see `PRODUCT_RULES.md` and `PLAYER_MODEL.md`. For status, see `CURRENT_STATUS.md`.

---

## 1. Stack

| Layer | Technology | Why |
|---|---|---|
| Language | TypeScript everywhere | one language across engine/server/client |
| Backend | Node.js + Fastify | small, fast REST API server |
| ORM / DB | Prisma + SQLite (local) | zero-config locally; later Postgres via Prisma |
| Frontend | React + Vite + TypeScript | fast dev loop |
| Styling | Tailwind CSS + Atlas design tokens | utilities + approved visual language |
| Icons | `lucide-react` | matches Atlas (Lucide) without CDN coupling |
| Simulation logic | Plain TypeScript in `packages/engine` | testable; no Fastify/Prisma/React |
| Tests (planned) | Vitest in engine | formula unit tests as systems land |
| Balance data | JSON under `packages/engine/src/config` (later) | tune without rewriting logic |

There is **no backend-less/client-only mode** — client-server from day one (see §6).

---

## 2. Monorepo Structure (F1)

```text
franchise-hockey-manager/
├── packages/
│   ├── engine/                  # pure TS — F1: getEngineInfo() only
│   │   ├── src/index.ts
│   │   └── package.json
│   ├── server/                  # Fastify + Prisma + SQLite
│   │   ├── src/
│   │   │   ├── index.ts         # bootstrap, CORS, errors, shutdown
│   │   │   ├── config.ts
│   │   │   ├── routes/health.ts # GET /health
│   │   │   └── db/client.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma    # AppMeta bootstrap model only
│   │   │   └── migrations/
│   │   └── package.json
│   └── client/                  # React + Vite shell
│       ├── src/
│       │   ├── components/      # layout + UI primitives (Atlas-adapted)
│       │   ├── pages/           # placeholder product areas
│       │   ├── lib/             # health client / hooks
│       │   └── styles/tokens/   # copied Atlas CSS variables
│       └── package.json
├── design/
│   ├── system/                  # Atlas design system (reference — not runtime)
│   └── screens/                 # approved FHM screen mocks (reference)
├── data/                        # reserved for later world/name seed data
├── package.json                 # npm workspaces root
└── *.md                         # project documentation
```

Rules:

- `packages/engine` must never import from server or client.
- `packages/server` may import from engine.
- `packages/client` talks to the server over HTTP only — no direct engine/Prisma imports.
- Do not edit `design/**` unless technically unavoidable; adapt into `packages/client` instead.

---

## 3. Data Flow (F1)

```text
Client (React shell)
   │  HTTP  GET /health  (optional VITE_API_URL; else Vite proxy)
   ▼
Server (Fastify)
   │  Prisma ping + AppMeta upsert on boot
   │  may call engine helpers (currently getEngineInfo in /health)
   ▼
Engine (pure TS)                 SQLite (via Prisma)
```

Gameplay persistence (League / Team / Player / …) is **not** present in F1.

---

## 4. Config-Driven Balance

When simulation/generation systems are implemented, coefficients live in `packages/engine/src/config/*.json` (aging curve, role thresholds, chemistry weights, etc.). F1 has no balance configs yet.

---

## 5. Data Model (F1)

Prisma source of truth: `packages/server/prisma/schema.prisma`.

F1 model:

- **AppMeta** — singleton bootstrap row so migrations and DB connectivity work.

Deferred: League, Team, Player, Coach, Season, GameResult, contracts, draft, etc.

---

## 6. Client application shell

Visual source of truth: `design/system` (Atlas tokens/components) and `design/screens/Franchise Hockey Manager.dc.html` (IA and chrome).

Runtime approach:

- Copy Atlas CSS tokens into `packages/client/src/styles/tokens`.
- Reimplement needed primitives as typed React components under `packages/client/src/components/ui` (adapted from design JSX, not blind copies).
- Shell: left sidebar + top bar; Setup route outside the shell.

Routes: `/` → `/world`, `/competitions`, `/teams`, `/players`, `/settings`, `/simulation-lab`, `/setup`, plus not-found.

---

## 7. Why Client-Server From Day One

Milestone M8 (public deployment) is an explicit goal. Local `npm run dev` already exercises the same HTTP boundary a deploy will use. See `DEPLOYMENT.md`.

---

## 8. Lessons Learned

- Premature gameplay seed (League/Team/Player + generator) conflicted with F1 foundation scope and was removed — prefer foundation milestones over early full MVP breadth when plans diverge.
- On Windows, prefer `127.0.0.1` for local API bind/proxy to avoid `localhost` IPv4/IPv6 mismatches.

---

## Guiding Rule

**Keep the engine pure and the server/client thin around it.** If a formula or generation rule appears in a route or React component, it belongs in `packages/engine` instead.
