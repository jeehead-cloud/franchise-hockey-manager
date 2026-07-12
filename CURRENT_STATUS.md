# Franchise Hockey Manager — Current Status

**Status:** Active
**Last updated:** 2026-07-13
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Local repository path:** `C:\Projects\franchise-hockey-manager`

> Snapshot of what the app can do now, plus maintained Recent / Significant history for future AI-agent sessions.
> End-of-iteration maintenance is mandatory — see `AI_AGENTS.md` §13.1–§13.2 and §5–§7 below.

---

## 1. Current Development Phase

**F11 — Event Engine Core: implemented locally (not committed).** Pure deterministic regulation match state machine (`Match → Period → Shift → Possession → Event`), balance schemaVersion 2 active match section, debug simulation API, and `/simulation-lab` technical page. No shots, goals, persistence, or batch Simulation Lab.

**Next milestone: F12 — Shots, Goalies, and Scoring** (do not start until requested).

F1–F10 remain complete on `main`.

---

## 2. Milestone Status

### F1–F9

Complete on `main`.

### F10 — Simulation Configuration (Done)

Versioned balance presets, immutable versions, active singleton, bootstrap, Commissioner management, Settings UI, chemistry active-config integration.

### F11 — Event Engine Core (Done locally)

Implemented:
- Engine `packages/engine/src/simulation/match/` — seeded Mulberry32 RNG, immutable input, regulation state machine, pause/resume snapshots, trace hash, diagnostics
- Engine version `f11.1`; simulation mode `F11_TECHNICAL`
- Balance schemaVersion **2** with active `match` section (Standard defaults upgraded; v1 versions remain immutable)
- Bootstrap creates Standard v2 when missing; auto-activates from legacy Standard v1 only (custom active presets untouched)
- Server read-only debug APIs: `POST /api/simulation/debug/regulation|step|resume` (gated by `FHM_SIMULATION_DEBUG_ENABLED` / dev defaults)
- Client `/simulation-lab` — Technical Match Engine page (not batch Simulation Lab)
- Verification: `npm run verify:event-engine` (200 seeded regulation runs in default script)

Not in F11:
- Shots, saves, goals, penalties, special teams, overtime, shootout
- Match persistence, schedules, standings, batch Simulation Lab (F16)

### M1–M8

Unchanged.

---

## 3. Known Bugs / Limitations Worth Remembering

- F11 regulation always completes **0–0**; scoring deferred to F12.
- F11 events are technical only; no player/team game stats yet.
- Faceoffs use center current ability + role rating + home bonus — no dedicated faceoff attribute.
- Debug simulation requires both teams READY (coach, tactics, valid 20-slot lineup, complete F5 models).
- F11 fixture world has only one full roster (Frostbite); second-team integration tests may mock engine input.
- Manual UI verification for F11 was **NOT RUN**.
- F11 changes not yet committed/pushed.
- Commissioner header is not security.

---

## 4. Nearest Next Steps

1. Commit/push F11 when the owner requests.
2. Manual UI pass on disposable DB with two READY teams (`/simulation-lab`).
3. **F12 — Shots, Goalies, and Scoring** (when requested).

---

## 5. Recent Changes

> Ordinary repository-relevant history, newest first.

### 2026-07-13 — F11 Event Engine Core

- Work completed: pure match engine; balance schema v2 match section; debug API + technical Simulation Lab page; tests + invariant verification; docs
- Validation: 89 engine + 129 server tests PASS; typecheck/build PASS; `verify:event-engine` 200 runs PASS; manual UI **NOT RUN**
- Remaining: F11 uncommitted; no scoring/persistence

### 2026-07-13 — F10 Simulation Configuration

- Committed/pushed on `main` (`59f50d5`)

---

## 6. Significant Changes

> Major capability or architecture shifts only.

### 2026-07-13 — F11 deterministic event engine (Significant)

- First pure regulation match simulation path: seeded RNG, immutable input, technical event trace, pause/resume snapshots
- Balance schemaVersion 2 introduces active match-engine configuration consumed by F11
- Explicit 0–0 / no-shots boundary until F12

### 2026-07-13 — F10 versioned balance presets (Significant)

- Persistent immutable balance versions with active singleton and Commissioner lifecycle

---

## 7. Engine / API Quick Reference (F11)

| Item | Value |
|------|--------|
| Engine version | `f11.1` |
| RNG | Mulberry32; string seeds via FNV-1a → uint32 |
| Regulation | 3 × 1200 s; score fixed 0–0 in F11 |
| Zone convention | Relative to possession team (DEFENSIVE / NEUTRAL / OFFENSIVE) |
| Debug gate | `FHM_SIMULATION_DEBUG_ENABLED` (default on in dev/test) |
| Verify command | `npm run verify:event-engine` |
