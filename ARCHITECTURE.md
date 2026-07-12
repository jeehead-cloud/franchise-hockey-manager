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
| Server tests | Vitest + temp SQLite | schema/API/migration/setup checks (F2+) |
| Validation | Zod (server) | F3 dataset manifest + row schemas |
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
│   │   │   ├── initialization/  # F3 load → validate → persist
│   │   │   ├── routes/          # /health, /api/* reads, /api/setup/*
│   │   │   ├── services/        # entity-specific list/detail readers
│   │   │   ├── mappers.ts       # Prisma → JSON DTOs
│   │   │   └── db/client.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma    # AppMeta + domain + F3 source metadata
│   │   │   └── migrations/
│   │   └── tests/               # Vitest: migrations, schema, API, setup
│   └── client/                  # React shell; Setup World functional (F3)
├── design/                      # Atlas references (not runtime)
├── data/
│   ├── world/                   # intended owner-prepared production snapshot
│   └── fixtures/f3-minimal-world/  # fictional default fixture
└── package.json
```

Rules:

- `packages/engine` must never import from server/client and must not import Prisma types.
- Only `packages/server` accesses the database **and** local dataset files.
- `packages/client` talks to the server over HTTP only (no direct filesystem reads).
- Do not edit `design/**` unless technically unavoidable.

---

## 3. Data Flow

```text
Client (React shell — Setup World in F3; browsers in F4)
   │  HTTP  GET /health, GET /api/..., GET|POST /api/setup/*
   ▼
Server (Fastify)
   │  thin routes → services / initialization pipeline → Prisma
   │  dataset files read only by server (FHM_DATASET_DIR)
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
- `AppMeta` retained from F1 (`id = "default"`) plus F3 init fields: `worldInitialized`, `worldDatasetId`, `worldInitializedAt`, `worldSchemaVersion`

### Age representation (Player)

**Decision:** store `dateOfBirth` as `DateTime` (date portion meaningful). Age is **not** persisted; derive later relative to world/competition date (F3+). Avoided `birthYear`-only so future calendar-accurate age stays possible.

### Entities (high level)

| Entity | Role |
|---|---|
| **AppMeta** | Bootstrap + one-time world initialization metadata |
| **WorldSeason** | Global season of the single living world (`label`, years, `phase`, `status`) |
| **Country** | Shared geography/nationality source (`name`, unique `code`) |
| **League** | Competition-organizing league (`simulationLevel` DETAILED/AGGREGATED) |
| **Team** | CLUB or NATIONAL; optional `leagueId` for nationals |
| **Player** | Structural identity only (no attributes/ratings) |
| **Coach** | Head coach styles; optional assignment |
| **Competition** | Competition definition (`type`, optional simulation level) |
| **CompetitionEdition** | Competition instance within a WorldSeason |

Imported snapshot entities (Country, League, Team, Player, Coach, Competition) carry optional `externalId`, `sourceDataset`, `sourceUpdatedAt` with `@@unique([sourceDataset, externalId])`. CompetitionEdition uses local competition + WorldSeason links (no external ID required). BalancePreset deferred to F10.

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
3. `f3_source_metadata_and_init` — source metadata columns + AppMeta init fields

Commands (from repo root):

```powershell
npm run db:generate
npm run db:migrate
npm run db:validate
npm run setup:preview
npm run test:server
```

Do not commit `*.db` files.

---

## 6. Server read API (F2) + Setup API (F3)

Entity-specific services under `packages/server/src/services/*`; thin list/detail registration.

Envelope:

- Simple lists (countries, leagues, coaches, world-seasons, editions): `{ "items": [...] }`
- Paginated browsers (teams, players, competitions): `{ items, page, pageSize, total, totalPages }`
- Detail: `{ "item": {...} }`
- Missing: `404` `{ "error": "NotFound", "message": "..." }`
- Bad query: `400` `{ "error": "BadRequest", "message": "..." }`

Routes:

- `GET /api/world` — F4 world dashboard summary (counts, structure, warnings, editions, next action)
- `GET /api/world-seasons` · `GET /api/world-seasons/:id`
- `GET /api/countries` · `GET /api/countries/:id`
- `GET /api/leagues` · `GET /api/leagues/:id`
- `GET /api/teams` · `GET /api/teams/:id` — search/filter/sort/pagination; detail includes roster
- `GET /api/players` · `GET /api/players/:id` — search/filter/sort/pagination; derived age
- `GET /api/coaches` · `GET /api/coaches/:id`
- `GET /api/competitions` · `GET /api/competitions/:id` — search/filter/sort/pagination; editions on detail
- `GET /api/competition-editions` · `GET /api/competition-editions/:id`

**Age derivation (F4):** years of age as of **1 July of the active WorldSeason.startYear** (`july1_of_world_season_start_year`). Not wall-clock. If no season, age fields are omitted/null.

Pagination defaults: `page=1`, `pageSize=25`, max `pageSize=100`. Sort fields are allowlisted per entity.

### Setup World (F3)

Pipeline: locate dataset → load manifest/files → parse (Zod) → validate structure + cross-refs → preview → empty-world gate → single transaction persist → AppMeta init flags.

Dataset path: default `data/fixtures/f3-minimal-world` (repo-relative); override with `FHM_DATASET_DIR`. Client never sends entity payloads or filesystem paths.

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/setup/status` | initialized / canInitialize / counts / dataset summary |
| GET | `/api/setup/preview` | validation report; **no writes** |
| POST | `/api/setup/initialize` | atomic init; `409` already initialized / not empty; `422` validation |

Empty-world rule: allow only when `AppMeta.worldInitialized` is false **and** all domain tables are empty. AppMeta-only F1 rows do not block. Duplicate init is idempotent at the API boundary (no duplicate rows). No destructive reset in F3.

---

## 7. Client application shell

F3: `/setup` is the functional Setup World page.

F4 browsers (URL query state for list filters):

- `/world` — World Dashboard
- `/teams`, `/teams/:teamId`
- `/players`, `/players/:playerId`
- `/competitions`, `/competitions/:competitionId`

Vite proxies `/health` and `/api` to `127.0.0.1:3000`. No client Prisma. Attributes/ratings remain F5.

---

## 8. Why Client-Server From Day One

Milestone M8 (public deployment) remains an explicit goal. See `DEPLOYMENT.md`.

---

## 9. Lessons Learned

- Premature gameplay seed conflicted with F1 and was removed.
- Prefer `127.0.0.1` for local API bind/proxy on Windows.
- F2 keeps Prisma types server-local; engine stays Prisma-free.
- F3 imports are one-shot local snapshots — never live sync or browser uploads.
- F4 list filters live in the URL; pagination stays on the server.

---

## Guiding Rule

**Keep the engine pure and the server/client thin around it.** Database models and DTOs live in the server; simulation formulas belong in the engine when those milestones arrive.
