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
| Server tests | Vitest + temp SQLite | schema/API/migration checks (F2+) |
| Balance data | JSON under `packages/engine/src/config` (later) | tune without rewriting logic |

There is **no backend-less/client-only mode** — client-server from day one (see §7).

---

## 2. Monorepo Structure

```text
franchise-hockey-manager/
├── packages/
│   ├── engine/                  # pure TS — no Prisma; F1 wiring export
│   ├── server/                  # Fastify + Prisma + SQLite
│   │   ├── src/
│   │   │   ├── app.ts           # Fastify factory (tests + runtime)
│   │   │   ├── routes/          # /health + /api/* read routes
│   │   │   ├── services/        # entity-specific list/detail readers
│   │   │   ├── mappers.ts       # Prisma → JSON DTOs
│   │   │   └── db/client.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma    # AppMeta + F2 domain entities
│   │   │   └── migrations/
│   │   └── tests/               # Vitest: migrations, schema, API
│   └── client/                  # React shell (placeholders until F4)
├── design/                      # Atlas references (not runtime)
├── data/                        # reserved for later world seed (F3+)
└── package.json
```

Rules:

- `packages/engine` must never import from server/client and must not import Prisma types.
- Only `packages/server` accesses the database.
- `packages/client` talks to the server over HTTP only.
- Do not edit `design/**` unless technically unavoidable.

---

## 3. Data Flow

```text
Client (React shell — placeholders in F2)
   │  HTTP  GET /health, GET /api/...
   ▼
Server (Fastify)
   │  thin routes → entity services → Prisma
   │  DTO mappers at the API boundary
   ▼
Engine (pure TS)                 SQLite (via Prisma)
```

---

## 4. Config-Driven Balance

When simulation/generation systems are implemented, coefficients live in `packages/engine/src/config/*.json`. No balance configs in F2.

---

## 5. Data Model (F2)

Prisma source of truth: `packages/server/prisma/schema.prisma`.

### Identity & timestamps

- Domain IDs: `String @id @default(cuid())`
- Mutable records: `createdAt` + `updatedAt`
- `AppMeta` retained from F1 (`id = "default"`) for migration continuity / boot checks

### Age representation (Player)

**Decision:** store `dateOfBirth` as `DateTime` (date portion meaningful). Age is **not** persisted; derive later relative to world/competition date (F3+). Avoided `birthYear`-only so future calendar-accurate age stays possible.

### Entities (high level)

| Entity | Role |
|---|---|
| **AppMeta** | F1 bootstrap metadata |
| **WorldSeason** | Global season of the single living world (`label`, years, `phase`, `status`) |
| **Country** | Shared geography/nationality source (`name`, unique `code`) |
| **League** | Competition-organizing league (`simulationLevel` DETAILED/AGGREGATED) |
| **Team** | CLUB or NATIONAL; optional `leagueId` for nationals |
| **Player** | Structural identity only (no attributes/ratings) |
| **Coach** | Head coach styles; optional assignment |
| **Competition** | Competition definition (`type`, optional simulation level) |
| **CompetitionEdition** | Competition instance within a WorldSeason |

### Key relationships

- Country → Leagues, Teams, Players (nationality), Coaches (nationality)
- League → Teams
- Team → Players; Team → current Coach (0..1)
- Competition → CompetitionEditions
- WorldSeason → CompetitionEditions

### Uniqueness / indexes (selected)

- `Country.code`, `Country.name` unique
- `WorldSeason.label` unique
- `League`: unique `(countryId, name)`
- `Team`: unique `(leagueId, name)`
- `Coach.currentTeamId` unique (at most one current head coach per team; many unassigned coaches with null)
- `CompetitionEdition`: unique `(competitionId, worldSeasonId)`
- FK indexes on nationality/team/league/edition foreign keys used by list/detail

Service-level invariant (not a DB CHECK): `WorldSeason.startYear` should precede `endYear` — enforced in tests/docs; SQLite/Prisma CHECK avoided for brittleness.

### Referential actions

| Relation | onDelete | Rationale |
|---|---|---|
| Team/League/Player/Coach → Country | **Restrict** | Do not silently erase geography roots |
| Team → League | **Restrict** | Prevent orphaning clubs by deleting leagues casually |
| Player.currentTeamId → Team | **SetNull** | Free agents / unassigned prospects survive team removal |
| Coach.currentTeamId → Team | **SetNull** | Coach can be unassigned |
| CompetitionEdition → Competition / WorldSeason | **Restrict** | Preserve historical edition linkage |

No application-level delete APIs in F2.

### Migrations

1. `f1_bootstrap` — AppMeta
2. `f2_core_domain` — eight foundational entities + enums

Commands (from repo root):

```powershell
npm run db:generate
npm run db:migrate
npm run db:validate
npm run test:server
```

Do not commit `*.db` files.

---

## 6. Server read API (F2)

Entity-specific services under `packages/server/src/services/*`; thin list/detail registration.

Envelope:

- List: `{ "items": [...] }`
- Detail: `{ "item": {...} }`
- Missing: `404` `{ "error": "NotFound", "message": "..." }`

Routes:

- `GET /api/world-seasons` · `GET /api/world-seasons/:id`
- `GET /api/countries` · `GET /api/countries/:id`
- `GET /api/leagues` · `GET /api/leagues/:id`
- `GET /api/teams` · `GET /api/teams/:id`
- `GET /api/players` · `GET /api/players/:id`
- `GET /api/coaches` · `GET /api/coaches/:id`
- `GET /api/competitions` · `GET /api/competitions/:id`
- `GET /api/competition-editions` · `GET /api/competition-editions/:id`

Detail responses may include shallow related summaries (e.g. team country/league/coach). No POST/PATCH/PUT/DELETE in F2. No production seeds — F3 owns initialization.

---

## 7. Client application shell

Unchanged for F2: placeholder pages only. Vite proxies `/health` and `/api` to `127.0.0.1:3000`. F4 will wire browsers to these APIs.

---

## 8. Why Client-Server From Day One

Milestone M8 (public deployment) remains an explicit goal. See `DEPLOYMENT.md`.

---

## 9. Lessons Learned

- Premature gameplay seed conflicted with F1 and was removed.
- Prefer `127.0.0.1` for local API bind/proxy on Windows.
- F2 keeps Prisma types server-local; engine stays Prisma-free.

---

## Guiding Rule

**Keep the engine pure and the server/client thin around it.** Database models and DTOs live in the server; simulation formulas belong in the engine when those milestones arrive.
