# Franchise Hockey Manager — Current Status

**Status:** Active
**Last updated:** 2026-07-13
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Local repository path:** `C:\Projects\franchise-hockey-manager`

> Snapshot of what the app can do now, plus maintained Recent / Significant history for future AI-agent sessions.
> End-of-iteration maintenance is mandatory — see `AI_AGENTS.md` §13.1–§13.2 and §5–§7 below.

---

## 1. Current Development Phase

**F16 — Simulation Lab: implemented locally (not committed).** First-class batch balance workspace: deterministic 1/10/100/1000 unpersisted F14 matches, aggregate metrics, upsets, anomaly guardrails, paired balance-version comparison, in-memory run progress/cancel, exports, and a tabbed `/simulation-lab` (Batch Lab + Single Match Debug). No official Match persistence; no formula changes.

**Next milestone: F17 — Competition Framework** (do not start until requested).

F1–F15 remain complete on `main` (F15 at `c32189c`).

---

## 2. Milestone Status

### F1–F15

Complete on `main`.

### F16 — Simulation Lab (Done locally)

Implemented:
- Engine batch layer: seed derivation, side orientation, game summaries, aggregate reducer, anomalies, comparison, batch hash, `runLabBatch`
- Server in-memory runs: `POST/GET/DELETE /api/simulation-lab/runs`, options, exports; chunked async for large counts; `FHM_SIMULATION_LAB_ENABLED` gate
- Optional `balanceVersionId` on `buildSimulationInput` for Lab comparison (does not activate presets)
- Client `/simulation-lab`: Batch Lab (default) + preserved Single Match Debug
- Verification: `npm run verify:simulation-lab`

Not in F16:
- Schedules, standings, season simulation, playoff series
- Persistent job queues / workers / Redis
- Automatic balance optimization
- Official Match rows from Lab runs

### M1–M8

Unchanged.

---

## 3. Known Bugs / Limitations Worth Remembering

- Scoring rates remain high (~10 combined goals/game) — Lab anomalies flag this as a development WARNING, not NHL calibration.
- 1000 fixture games ≈ **10s** locally; in-memory runs are transient (lost on restart; retention ~30 min).
- Batch hash uses a browser-safe digest (not node:crypto) for client bundle compatibility.
- Manual UI verification for F16 was **NOT RUN**.
- F16 changes not yet committed/pushed.
- Commissioner header is not security.

---

## 4. Nearest Next Steps

1. Commit/push F16 when the owner requests.
2. Manual UI pass on disposable DB (10/100/1000, cancel, comparison, exports).
3. **F17 — Competition Framework** (when requested).

---

## 5. Recent Changes

> Ordinary repository-relevant history, newest first.

### 2026-07-13 — F16 Simulation Lab

- Work completed: engine batch analysis, in-memory Lab runs, Batch Lab UI, paired balance comparison, exports, `verify:simulation-lab`
- Validation: 113 engine + 148 server tests PASS; typecheck/build PASS; lab verify 10+100 PASS; engine batch timing 1≈62ms / 10≈142ms / 100≈1.0s / 1000≈10.2s; no Match persistence in tests; live HTTP/manual UI **NOT RUN** (server not up)
- Remaining: F16 uncommitted; F17 deferred

### 2026-07-13 — F15 Match UI and Diagnostics

- Committed/pushed on `main` (`c32189c`)

### 2026-07-13 — F14 Playable Match

- Committed/pushed on `main` (`ed755df`)

---

## 6. Significant Changes

> Major architectural or product decisions only.

### 2026-07-13 — F16 Simulation Lab (Significant)

- Unpersisted batch analysis is a first-class product tool separate from official Match history
- Paired balance comparison reuses identical derived seeds
- Anomaly thresholds are development guardrails, not realism claims
- Transient in-memory run registry (no Prisma jobs)

### 2026-07-13 — F15 Match UI and Diagnostics (Significant)

- Persisted match viewing with public/technical event boundary and snapshot history

---

## 7. Quick Reference

| Item | Value |
|---|---|
| Engine version | `f14.1` |
| Lab counts | 1 / 10 / 100 / 1000 |
| Lab side modes | FIXED / ALTERNATE (default analytical: ALTERNATE) |
| Lab gate | `FHM_SIMULATION_LAB_ENABLED` |
| Lab routes | `/api/simulation-lab/*`, UI `/simulation-lab` |
| Verify | `npm run verify:simulation-lab` |
| 1000-game timing (fixture) | ~10s |
