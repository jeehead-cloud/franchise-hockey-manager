# Franchise Hockey Manager — Current Status

**Status:** Active
**Last updated:** 2026-07-13
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Local repository path:** `C:\Projects\franchise-hockey-manager`

> Snapshot of what the app can do now, plus maintained Recent / Significant history for future AI-agent sessions.
> End-of-iteration maintenance is mandatory — see `AI_AGENTS.md` §13.1–§13.2 and §5–§7 below.

---

## 1. Current Development Phase

**F12 — Shots, Goalies, and Scoring: implemented locally (not committed).** Extends the F11 deterministic regulation engine with offensive-zone shot opportunities, shot resolution (block/miss/save/goal), pass-chain assists, event-derived statistics, reconciliation, balance schemaVersion 3 (`shots` / `goalies`), debug API scoring output, and `/simulation-lab` F12 diagnostics UI.

**Next milestone: F13 — Penalties and Special Teams** (do not start until requested).

F1–F11 remain complete on `main`.

---

## 2. Milestone Status

### F1–F10

Complete on `main`.

### F11 — Event Engine Core (Done)

Pure deterministic regulation match state machine, pause/resume snapshots, trace hash, technical events, balance schemaVersion 2 match section (upgraded to v3 for F12 scoring).

### F12 — Shots, Goalies, and Scoring (Done locally)

Implemented:
- Engine `f12.1` / mode `F12_SCORING`; snapshot schemaVersion 2 (F12 state; rejects F11 snapshots)
- Offensive-zone shot opportunity → SHOT → SHOT_BLOCKED | SHOT_MISSED | SAVE | GOAL
- Shooter selection, pass chain (0–2), shot types, shot quality, defensive pressure, goalie resolution
- Assists from actual pass-chain participants; score changes only on GOAL events
- Statistics reducer + reconciliation invariants (`StatisticsReconciliationError` on failure)
- Balance schemaVersion **3** with active `match` + `shots` + `goalies` sections; Standard v3 bootstrap / v2→v3 auto-upgrade
- Server debug APIs return score, period scores, team/player/goalie stats, reconciliation, player directory
- Client `/simulation-lab` — F12 scoreboard, team comparison, skater/goalie tables, scoring event feed, pending-shot step UI
- Verification: `npm run verify:scoring-engine` (500 seeded runs default)

Not in F12:
- Penalties, power plays, special teams, overtime, shootout, goalie pulls
- Match persistence, schedules, standings, batch Simulation Lab (F16)
- Plus/minus, fatigue, injuries, xG branding

### M1–M8

Unchanged.

---

## 3. Known Bugs / Limitations Worth Remembering

- F12 scoring rates are first-version / config-driven — observed ~10 goals/game combined in 500-run batch (high vs NHL; tune balance v3 `shots`/`goalies` before claiming realism).
- TIP/DEFLECTION uses role-based eligibility only (no rink coordinates).
- Rebound behavior is simplified (CONTROLLED / REBOUND / FROZEN weights; no immediate recursive rebound shots).
- Faceoffs use center current ability + role rating + home bonus — no dedicated faceoff attribute.
- Debug simulation requires both teams READY (coach, tactics, valid 20-slot lineup, complete F5 models with full attributes).
- F12 fixture integration tests mock engine input for second team; real attribute mapping tested via input service.
- Manual UI verification for F12 was **NOT RUN**.
- F12 changes not yet committed/pushed.
- Commissioner header is not security.

---

## 4. Nearest Next Steps

1. Commit/push F12 when the owner requests.
2. Manual UI pass on disposable DB with two READY teams and active Standard v3 balance (`/simulation-lab`).
3. Tune balance v3 shot/goal rates toward target realism if desired.
4. **F13 — Penalties and Special Teams** (when requested).

---

## 5. Recent Changes

> Ordinary repository-relevant history, newest first.

### 2026-07-13 — F12 Shots, Goalies, and Scoring

- Work completed: shot pipeline, statistics/reconciliation, balance schema v3, debug API + Simulation Lab scoring UI, tests + `verify:scoring-engine`
- Validation: 97 engine + 129 server tests PASS; typecheck/build PASS; `verify:scoring-engine` 500 runs PASS (0 reconciliation failures; ~10.4 goals/game combined observed); manual UI **NOT RUN**
- Remaining: F12 uncommitted; balance tuning; F13 deferred

### 2026-07-13 — F11 Event Engine Core

- Committed/pushed on `main`

### 2026-07-13 — F10 Simulation Configuration

- Committed/pushed on `main` (`59f50d5`)

---

## 6. Significant Changes

> Major capability or architecture shifts only.

### 2026-07-13 — F12 regulation scoring from events (Significant)

- First deterministic goals/saves/assists path: final score is count of GOAL events only; statistics reduced from events with explicit reconciliation
- Balance schemaVersion 3 adds `shots` and `goalies` configuration consumed by F12
- F11 snapshots cannot restore as F12 state (engine version gate)

### 2026-07-13 — F11 deterministic event engine (Significant)

- First pure regulation match simulation path: seeded RNG, immutable input, technical event trace, pause/resume snapshots

### 2026-07-13 — F10 versioned balance presets (Significant)

- Persistent immutable balance versions with active singleton and Commissioner lifecycle

---

## 7. Engine / API Quick Reference (F12)

| Item | Value |
|------|--------|
| Engine version | `f12.1` |
| Simulation mode | `F12_SCORING` |
| RNG | Mulberry32; string seeds via FNV-1a → uint32 |
| Regulation | 3 × 1200 s; EVEN_5V5 only |
| Score source | GOAL events only |
| Zone convention | Relative to possession team |
| Snapshot schema | 2 (F12 state; pending shot serializable) |
| Balance | schemaVersion ≥ 3 with active match + shots + goalies |
| Debug gate | `FHM_SIMULATION_DEBUG_ENABLED` (default on in dev/test) |
| Verify commands | `npm run verify:event-engine`, `npm run verify:scoring-engine` |
