# Franchise Hockey Manager — Current Status

**Status:** Active
**Last updated:** 2026-07-12
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Local repository path:** `C:\Projects\franchise-hockey-manager`

> Snapshot of what the app can do now, plus maintained Recent / Significant history for future AI-agent sessions.
> End-of-iteration maintenance is mandatory — see `AI_AGENTS.md` §13.1–§13.2 and §5–§7 below.

---

## 1. Current Development Phase

**F2 — Core Database Model: complete.** Prisma domain entities (`WorldSeason`, `Country`, `League`, `Team`, `Player`, `Coach`, `Competition`, `CompetitionEdition`) plus retained F1 `AppMeta`. Read-only list/detail APIs under `/api/*`. Vitest covers migrations, constraints/relations, and API envelopes. Client pages remain F1 placeholders (no F4 browsers). No world initialization / real import (F3).

**Authoritative product docs restored** at repo root: `PRODUCT_STRUCTURE.md`, `FOUNDATION_IMPLEMENTATION_PLAN.md`.

**Next milestone: F3 — World Initialization and Real Data Import.**

---

## 2. Milestone Status

### F1 — Monorepo and Application Shell (Done)

Committed/pushed: `bf1d0ab` — workspace, health, Atlas shell, placeholders.

### F2 — Core Database Model (Done)

Implemented:
- Prisma enums + eight foundational entities; `cuid` IDs; `createdAt`/`updatedAt`
- Player age via `dateOfBirth` (age derived later)
- Relations, uniqueness, Restrict/SetNull referential actions as documented in `ARCHITECTURE.md`
- Migration `f2_core_domain` after `f1_bootstrap`
- Entity services + `GET /api/...` list/detail DTOs (`{ items }` / `{ item }` / 404)
- Vitest: `npm run test:server` (migrations, schema, API)
- Engine unchanged / Prisma-free; client unchanged functionally (proxy already covers `/api`)

Not in F2:
- World init / Setup / real NHL seeds (F3)
- Attribute models, ratings, roles, chemistry, matches (later)
- Browser data pages (F4)
- Write APIs

### M1 — Leagues, Teams & Rosters (Not started as gameplay product)

Structural Team/League/Player tables exist for the living world; product workflows and real data are not started.

### M2 — Player Generation & Attributes (Not started)

Structural Player only — no attributes/generation.

### M3 — Chemistry & Tactics Fit (Not started)

Coach style enums exist structurally; no fit calculations.

### M4–M8

Unchanged (not started / queued).

---

## 3. Known Bugs / Limitations Worth Remembering

- No production seed data — APIs return empty lists until F3/test inserts.
- `WorldSeason.startYear < endYear` is a documented service-level invariant, not a SQLite CHECK.
- SQLite unique constraints treat NULLs as distinct (e.g. multiple national teams with `leagueId = null` and same name would not collide — avoid in F3 data rules).
- Design extras (National Teams/Transfers/History nav) still not routed.
- Leftover `data/` JSON unused by runtime.

---

## 4. Nearest Next Steps

1. **F3 — World initialization / real-data import** (Setup World, seeds) — do not invent production seeds ahead of F3.
2. **F4 — Browsers** wiring Teams/Players/Competitions/World pages to `/api/*`.
3. Continue following `FOUNDATION_IMPLEMENTATION_PLAN.md` (F1–F33).

---

## 5. Recent Changes

> Ordinary repository-relevant history, newest first.
> Keep approximately the latest 3 months.

### 2026-07-12 — F2 reviewed, docs restored, committed

- Work completed: F2 review/validation; restored owner-approved `PRODUCT_STRUCTURE.md` and `FOUNDATION_IMPLEMENTATION_PLAN.md`; committed/pushed F2
- Files/areas affected: F2 server/prisma/tests, root docs, package scripts
- Validation: prisma format/validate/generate; tests; typecheck/build; migration empty-DB; health/list/detail/404; `git diff --check`
- Remaining limitations or follow-up: F3 not started

### 2026-07-12 — F2 Core Database Model

- Work completed: Prisma domain schema + `f2_core_domain` migration; read-only `/api` list/detail APIs; Vitest migration/schema/API suite; ARCHITECTURE/CURRENT_STATUS updated
- Files/areas affected: `packages/server/prisma/**`, `packages/server/src/**`, `packages/server/tests/**`, docs, root scripts
- Validation: prisma format/validate/generate/migrate PASS; typecheck/build PASS; 21 vitest PASS; `/health` PASS; empty list + 404 smoke PASS; `git diff --check` PASS
- Remaining limitations or follow-up: superseded by commit entry above

### 2026-07-12 — F1 reviewed and validated for main

- Work completed: F1 review/validation; committed/pushed `bf1d0ab`
- Files/areas affected: F1 packages, `design/`, docs
- Validation: typecheck/build/health/proxy PASS
- Remaining limitations or follow-up: next was F2

### 2026-07-12 — F1 Monorepo and Application Shell

- Work completed: Atlas shell monorepo; stripped premature gameplay seed
- Remaining limitations or follow-up: superseded operationally by F2 domain work for data layer

### 2026-07-10 — Mandatory end-of-iteration status maintenance + dual history tracks

- Work completed: AI_AGENTS §12–§13; Recent/Significant histories

---

## 6. Significant Changes

> Permanent history, newest first. Never delete merely for age.

### 2026-07-12 — Restored PRODUCT_STRUCTURE + FOUNDATION_IMPLEMENTATION_PLAN

- Significance: Authoritative product structure and F1–F33 foundation plan now live in-repo; required before F3
- Decision or milestone: Restored from owner Drive copies (`FHM_PRODUCT_STRUCTURE.md`, `FHM_FOUNDATION_IMPLEMENTATION_PLAN.md`); not invented substitutes
- Lasting impact: Agents must follow these for navigation, single-world sandbox scope, simulation principles, and milestone sequence
- Related files/areas: `PRODUCT_STRUCTURE.md`, `FOUNDATION_IMPLEMENTATION_PLAN.md`

### 2026-07-12 — F2 foundational world schema + read APIs

- Significance: First durable domain data model for the living hockey world; establishes entity boundaries and API envelope for F3–F4
- Decision or milestone: Eight entities + enums; `dateOfBirth` age strategy; Restrict/SetNull map; read-only `/api` without write/seed surface
- Lasting impact: Later milestones extend this schema rather than inventing parallel models; engine remains Prisma-free
- Related files/areas: `packages/server/prisma/schema.prisma`, migration `f2_core_domain`, `packages/server/src/services/*`, `ARCHITECTURE.md`

### 2026-07-12 — F1 foundation: shell without gameplay

- Significance: Monorepo + Atlas shell baseline; deferred gameplay
- Related files/areas: commit `bf1d0ab`

### 2026-07-10 — Mandatory end-of-iteration CURRENT_STATUS maintenance

- Significance: Dual history + mandatory end-of-prompt status workflow
- Related files/areas: `AI_AGENTS.md` §12–§13

### 2026-07-10 — First monorepo commit on main (historical)

- Significance: Initial packages layout; later realigned by F1
- Related files/areas: commit `c7fd064`

---

## 7. Maintenance Policy

This document must be reviewed after **every** agent iteration (`AI_AGENTS.md` §13.1).

- Synchronize snapshot (§1–§4) with actual repository behavior.
- Recent (§5): newest-first; ~3-month retention.
- Significant (§6): permanent; agent classifies independently.
- No low-level command noise; record failures/limitations honestly.
