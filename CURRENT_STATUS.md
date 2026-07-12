# Franchise Hockey Manager — Current Status

**Status:** Active
**Last updated:** 2026-07-12
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Local repository path:** `C:\Projects\franchise-hockey-manager`

> Snapshot of what the app can do now, plus maintained Recent / Significant history for future AI-agent sessions.
> End-of-iteration maintenance is mandatory — see `AI_AGENTS.md` §13.1–§13.2 and §5–§7 below.

---

## 1. Current Development Phase

**F3 — World Initialization and Real Data Import: implemented locally (not committed in this iteration).** Setup World pipeline loads a local JSON dataset, validates (Zod + cross-file refs), previews without writes, and atomically initializes an empty database. Duplicate init is blocked (`409`). `/setup` UI and minimal `/world` empty/initialized states are functional. Default dataset is the **fictional** fixture `data/fixtures/f3-minimal-world/` — no owner-prepared real NHL snapshot is in-repo yet (`data/world/` is a placeholder for that).

**Next milestone: F4 — World Dashboard and Browsers.**

F1 (`bf1d0ab`) and F2 (`3e6f343`) remain complete on `main`.

---

## 2. Milestone Status

### F1 — Monorepo and Application Shell (Done)

Committed/pushed: `bf1d0ab`.

### F2 — Core Database Model (Done)

Committed/pushed: `3e6f343` — eight entities + read APIs.

### F3 — World Initialization and Real Data Import (Done locally)

Implemented:
- Local dataset layout + manifest schemaVersion 1
- Source metadata on imported entities + AppMeta init fields (migration `f3_source_metadata_and_init`)
- Loader / validator / transactional importer / status gate
- `GET /api/setup/status`, `GET /api/setup/preview`, `POST /api/setup/initialize`
- CLI: `npm run setup:preview` / `setup:validate` / `setup:status`
- Setup World UI + World empty/initialized cues
- Fictional development fixture (labeled in UI)
- Vitest coverage for load/validate/preview/init/idempotency/API

Not in F3:
- Owner-prepared real NHL/world snapshot (still missing — replace fixture via `FHM_DATASET_DIR` / `data/world/`)
- Balance presets (F10)
- Destructive reset / Database Maintenance UI
- F4 browsers, F5 attributes, simulation, contracts, draft, scouting

### M1–M8

Unchanged (gameplay product milestones not started).

---

## 3. Known Bugs / Limitations Worth Remembering

- Default dataset is fictional — do not treat fixture names as real NHL data.
- No production owner snapshot under `data/world/` yet.
- `WorldSeason.startYear < endYear` remains a service/validation invariant, not a SQLite CHECK.
- SQLite unique `(sourceDataset, externalId)` treats NULL pairs as distinct.
- Design extras (National Teams/Transfers/History nav) still not routed.
- Leftover `data/names/` and `data/nhl-teams.json` are **not** F3 import format.
- F3 changes not yet committed/pushed.

---

## 4. Nearest Next Steps

1. Commit/push F3 when the owner requests.
2. Provide/replace with owner-prepared real snapshot under `data/world/` when available.
3. **F4 — World Dashboard and Browsers** wiring list/detail pages to `/api/*`.
4. Continue `FOUNDATION_IMPLEMENTATION_PLAN.md` (F5+).

---

## 5. Recent Changes

> Ordinary repository-relevant history, newest first.
> Keep approximately the latest 3 months.

### 2026-07-12 — F3 World Initialization and Real Data Import

- Work completed: local JSON import boundary; AppMeta init + source metadata migration; setup APIs/CLI; Setup World UI; fictional fixture; Vitest F3 suite
- Files/areas affected: `packages/server/src/initialization/**`, `routes/setup.ts`, Prisma migration, `data/fixtures/**`, client Setup/World, docs
- Validation: see this iteration’s validation report (prisma/tests/builds/setup CLI/API)
- Remaining limitations or follow-up: no real owner dataset; F3 not committed; F4 not started

### 2026-07-12 — F2 reviewed, docs restored, committed

- Work completed: F2 review/validation; restored PRODUCT_STRUCTURE + FOUNDATION_IMPLEMENTATION_PLAN; committed/pushed `3e6f343`
- Remaining limitations or follow-up: next was F3

### 2026-07-12 — F1 reviewed and validated for main

- Work completed: F1 review/validation; committed/pushed `bf1d0ab`

### 2026-07-10 — Mandatory end-of-iteration status maintenance + dual history tracks

- Work completed: AI_AGENTS §12–§13; Recent/Significant histories

---

## 6. Significant Changes

> Permanent history, newest first. Never delete merely for age.

### 2026-07-12 — F3 one-time local world initialization boundary

- Significance: Establishes the only path from empty DB → living world snapshot; freezes import as non-syncing starting point
- Decision or milestone: Manifest + Zod validation; empty-world multi-table gate; single-transaction persist; AppMeta init flags; no scraping/upload/reset
- Lasting impact: Later milestones extend imported structural world; real roster replacement must come as a new owner snapshot before first init, not live sync
- Related files/areas: `packages/server/src/initialization/**`, `data/fixtures/f3-minimal-world/**`, migration `f3_source_metadata_and_init`

### 2026-07-12 — Restored PRODUCT_STRUCTURE + FOUNDATION_IMPLEMENTATION_PLAN

- Significance: Authoritative product/plan docs in-repo
- Related files/areas: `PRODUCT_STRUCTURE.md`, `FOUNDATION_IMPLEMENTATION_PLAN.md`

### 2026-07-12 — F2 foundational world schema + read APIs

- Significance: First durable domain data model; read API envelope for F3–F4
- Related files/areas: commit `3e6f343`

### 2026-07-12 — F1 foundation: shell without gameplay

- Significance: Monorepo + Atlas shell baseline
- Related files/areas: commit `bf1d0ab`

### 2026-07-10 — Mandatory end-of-iteration CURRENT_STATUS maintenance

- Significance: Dual history + mandatory end-of-prompt status workflow
- Related files/areas: `AI_AGENTS.md` §12–§13

---

## 7. Maintenance Policy

This document must be reviewed after **every** agent iteration (`AI_AGENTS.md` §13.1).

- Synchronize snapshot (§1–§4) with actual repository behavior.
- Recent (§5): newest-first; ~3-month retention.
- Significant (§6): permanent; agent classifies independently.
- No low-level command noise; record failures/limitations honestly.
