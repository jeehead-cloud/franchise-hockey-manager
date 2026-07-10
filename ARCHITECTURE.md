# Franchise Hockey Manager — Architecture

**Status:** Active
**Last updated:** 2026-07-10
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`

> This document is the technical source of truth for how the codebase is organized: stack, monorepo structure, data flow, and the config-driven-balance approach. For *what the game should do*, see `PRODUCT_RULES.md` and `PLAYER_MODEL.md`. For milestone-by-milestone implementation status, see `CURRENT_STATUS.md`.

---

## 1. Stack

| Layer | Technology | Why |
|---|---|---|
| Language | TypeScript everywhere | one language across engine/server/client; shared types for player/team/etc. |
| Backend | Node.js + Fastify | small, fast REST API server |
| ORM / DB | Prisma + SQLite (local) | zero-config locally; Prisma makes a later move to Postgres low-friction |
| Frontend | React + Vite + TypeScript | fast dev loop, standard tooling |
| Styling | Tailwind CSS | avoid spending hobby-project time on custom CSS infrastructure |
| Simulation logic | Plain TypeScript in `packages/engine`, no framework dependency | testable in isolation; reusable from server, scripts, or future CLI tools |
| Balance data | JSON config files inside `packages/engine/src/config` | tune formulas without recompiling/redeploying code |

There is **no backend-less/client-only mode** — unlike some hobby projects, this one is client-server from day one (see §6), specifically because a later public deployment is an explicit goal (`PROJECT.md` Milestone M8).

---

## 2. Monorepo Structure

```text
franchise-hockey-manager/
├── packages/
│   ├── engine/                  # pure simulation & generation logic — no UI, no Fastify
│   │   ├── src/
│   │   │   ├── players/         # generation, growth/aging, archetype derivation
│   │   │   ├── chemistry/       # line synergy, coach-tactics fit, contextual modifiers
│   │   │   ├── simulation/      # per-game and per-season simulation
│   │   │   └── config/          # balance JSON: aging curve, dev-rate ranges, chemistry weights, role thresholds
│   │   └── package.json
│   ├── server/                  # Fastify API + Prisma
│   │   ├── src/
│   │   │   ├── routes/          # REST endpoints (teams, players, games, etc.)
│   │   │   └── db/              # Prisma client wiring, seeding scripts
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   └── package.json
│   └── client/                  # React + Vite frontend
│       ├── src/
│       │   ├── pages/           # Dashboard, Roster, Lines, Draft, Game
│       │   └── components/
│       └── package.json
├── data/                        # seed data: national name pools, real NHL team/city list
├── package.json                 # npm/pnpm workspaces root
└── docs/                        # this documentation set
```

`packages/engine` must never import from `packages/server` or `packages/client`. `packages/server` may import from `packages/engine`. `packages/client` never imports from `packages/engine` or `packages/server` directly — it only talks to the server over HTTP.

---

## 3. Data Flow

```text
Client (React)
   │  HTTP (REST)
   ▼
Server (Fastify)
   │  calls into engine for any generation/simulation logic
   │  reads/writes via Prisma
   ▼
Engine (pure TS, no I/O)        SQLite (via Prisma)
```

- The server is the only thing that talks to the database.
- The server is the only thing that calls the engine for generation/simulation — the engine itself has no I/O and no knowledge of HTTP or SQL.
- Randomized values produced by the engine (initial attributes, dev-state/stability-state draws, offense/defense split, etc.) are generated **once**, at creation time, and the resulting concrete numbers are what gets persisted via Prisma — the engine function that "rolls" a new player should be called exactly once per player, not re-invoked on every read. (This is a deliberate correction versus the original spreadsheet prototype described in `PLAYER_MODEL.md`, where every formula was a live, ever-recalculating cell.)

---

## 4. Config-Driven Balance

Any coefficient, threshold, or weight that affects game feel — not just structural logic — belongs in a JSON file under `packages/engine/src/config/`, not hardcoded in TypeScript. Planned config files (to be created as each system is implemented):

- `aging-curve.json` — the age → cumulative adjustment / yearly delta table (see `PLAYER_MODEL.md` §6 for the source values from the spreadsheet prototype).
- `dev-variance.json` — the ranges used for risk/bonus-potential and stability rolls.
- `role-thresholds.json` — the attribute-pair → archetype mapping (see `PLAYER_MODEL.md` §5).
- `chemistry-weights.json` — synergy multipliers between archetypes/personalities, and coach-style × player-preferred-style compatibility modifiers (design not finalized — see `PRODUCT_RULES.md` §3).

Engine code should read these at startup (or on demand) rather than duplicating the numbers inline. This lets balance be iterated on by editing a JSON file, without a rebuild of engine logic.

---

## 5. Data Model (High-Level — Prisma Schema Is the Source of Truth Once Written)

This section is a conceptual map, not the schema itself. Once `prisma/schema.prisma` exists, that file is authoritative; update this section to stay roughly in sync, but don't duplicate every field here.

Core entities expected for the MVP (M1-M4):

- **League** → has many **Team**s (initial seed: real NHL teams/cities).
- **Team** → has many **Player**s (roster), one **Coach** (philosophy/tactics), belongs to a **League**.
- **Player** → see `PLAYER_MODEL.md` for the full attribute/growth model. Belongs to a **Team** (nullable, for free agents/prospects) and a **Contract**.
- **Coach** → philosophy (Authoritarian / Authoritative / Democratic / Developmental / Hands-Off) and tactical style (Combinational / Physical / Speed / System / Forechecking) — these are the same category sets a player's "preferred coaching style" / "preferred tactics" are compared against for fit (see `PLAYER_MODEL.md` §4 and `PRODUCT_RULES.md` §3).
- **Season** → tracks the current season/year, holds schedule and results once M4 exists.
- **GameResult** → per-game box score once the simulation engine (M4) exists.

Deferred to later milestones (don't build ahead of the milestone that needs them): **Contract** (full cap/negotiation model), **DraftClass**/**Scout** (M5), **TradeOffer** (M6/M7).

---

## 6. Why Client-Server From Day One

Unlike a purely local/offline hobby prototype, this project is built server-backed from the start because Milestone M8 (public deployment on a domain) is an explicit, stated goal. This means:

- "Deploying later" = hosting the same Fastify server (with SQLite, or a migrated Postgres) plus the static built client — no architectural rewrite needed.
- The local dev workflow (`npm run dev` in `packages/server` and `packages/client`) already exercises the same client-server boundary that a real deployment will use.

See `DEPLOYMENT.md` for the current (local-only) state and open hosting decisions.

---

## 7. Lessons Learned

*(Empty for now — this section exists so that future AI agents and the owner have a place to record subtle bugs and their real root causes, the way `AI_AGENTS.md` §10 requires. Add entries here as they're discovered, e.g. sign errors in the aging-curve lookup, double-counted chemistry modifiers, off-by-one age indexing, etc.)*

---

## Guiding Rule

**Keep the engine pure and the server/client thin around it.** If a formula, generation rule, or simulation step is being written inside a route handler or a React component, it almost certainly belongs in `packages/engine` instead.
