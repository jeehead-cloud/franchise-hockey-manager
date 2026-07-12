# Franchise Hockey Manager — Current Status

**Status:** Active
**Last updated:** 2026-07-13
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Local repository path:** `C:\Projects\franchise-hockey-manager`

> Snapshot of what the app can do now, plus maintained Recent / Significant history for future AI-agent sessions.
> End-of-iteration maintenance is mandatory — see `AI_AGENTS.md` §13.1–§13.2 and §5–§7 below.

---

## 1. Current Development Phase

**F13 — Penalties and Special Teams: implemented locally (not committed).** Extends the F12 scoring engine with deterministic minor penalties, one-at-a-time 5v4 special teams, automatic PP/PK units, penalty clocks with period carryover, PP-goal cancellation, event-derived PP/PK/PIM statistics, balance schemaVersion 4, and `/simulation-lab` F13 diagnostics.

**Next milestone: F14 — Match Persistence and Results** (do not start until requested).

F1–F12 remain complete on `main`.

---

## 2. Milestone Status

### F1–F12

Complete on `main`.

### F13 — Penalties and Special Teams (Done locally)

Implemented:
- Engine `f13.1` / mode `F13_SPECIAL_TEAMS`; snapshot schemaVersion **3** (rejects F11/F12 snapshots)
- Supported strength states only: `EVEN_5V5`, `HOME_POWER_PLAY_5V4`, `AWAY_POWER_PLAY_5V4`
- One active two-minute minor at a time; second opportunities suppressed while a minor is active
- Infractions: TRIPPING, HOOKING, HOLDING, INTERFERENCE, SLASHING, ROUGHING (all 120s)
- Deterministic penalized-player selection; aggression raises long-run tendency
- Automatic temporary PP (5) / PK (4) units from main lineup; penalized player excluded
- Penalty clock uses game time; period carryover; exact expiration → `PENALTY_EXPIRED`
- Power-play goal ends the minor immediately; short-handed / even-strength goals do not
- Regulation-ending open penalty counted as successful PK (no separate expire event)
- Statistics: PIM, PP opportunities/goals/%, PK opportunities/kills/%, SH goals
- Balance schemaVersion **4** with active `penalties` section; Standard v4 bootstrap / legacy Standard auto-upgrade
- Debug APIs + `/simulation-lab` F13 strength/penalty/PP UI
- Verification: `npm run verify:special-teams-engine` (500 seeded runs default)

Not in F13:
- Coincidental penalties, double minors, majors, misconducts, delayed penalties, penalty shots
- 5v3, 4v4, empty net, goalie pull
- Overtime, shootout, match persistence, schedules, standings
- Special-team lineup persistence/editing UI

### M1–M8

Unchanged.

---

## 3. Known Bugs / Limitations Worth Remembering

- Scoring rates remain high (~10 combined goals/game in F13 batches) — first-version balance; defer broad realism tuning to F16.
- Observed ~5 penalties/game with Standard v4 defaults (configurable); PP% ~19%, PK% ~81% in 500-run batch.
- TIP/DEFLECTION still role-based only (no rink coordinates).
- Temporary PP/PK units use bounded attribute composites — not persisted F9 chemistry.
- Faceoffs still use center CA + role rating + home bonus.
- Manual UI verification for F13 was **NOT RUN**.
- F13 changes not yet committed/pushed.
- Commissioner header is not security.

---

## 4. Nearest Next Steps

1. Commit/push F13 when the owner requests.
2. Manual UI pass on disposable DB with two READY teams and Standard v4 balance.
3. Optional: tune Standard v4 penalty/scoring rates.
4. **F14 — Match Persistence and Results** (when requested).

---

## 5. Recent Changes

> Ordinary repository-relevant history, newest first.

### 2026-07-13 — F13 Penalties and Special Teams

- Work completed: minor penalties, 5v4 special teams, PP/PK stats/reconciliation, balance schema v4, debug API + Simulation Lab F13 UI, `verify:special-teams-engine`
- Validation: 99 engine + 129 server tests PASS; typecheck/build PASS; special-teams verify 500 runs PASS (0 recon/illegal/replay failures; ~5.0 penalties/game; PP% ~18.9%; PK% ~81.1%); manual UI **NOT RUN**
- Remaining: F13 uncommitted; F14 deferred

### 2026-07-13 — F12 Shots, Goalies, and Scoring

- Committed/pushed on `main` (`6c09ff5`)

### 2026-07-13 — F11 Event Engine Core

- Committed/pushed on `main`

---

## 6. Significant Changes

> Major capability or architecture shifts only.

### 2026-07-13 — F13 basic 5v4 special teams (Significant)

- First supported strength states beyond 5v5; one-active-minor model; PP goals end minors; SH goals do not
- Automatic deterministic PP/PK units; event-derived PP/PK/PIM statistics with reconciliation
- Balance schemaVersion 4 adds active `penalties` configuration

### 2026-07-13 — F12 regulation scoring from events (Significant)

- Final score is count of GOAL events only; statistics reduced from events with explicit reconciliation

### 2026-07-13 — F11 deterministic event engine (Significant)

- First pure regulation match simulation path

### 2026-07-13 — F10 versioned balance presets (Significant)

- Persistent immutable balance versions with active singleton

---

## 7. Engine / API Quick Reference (F13)

| Item | Value |
|------|--------|
| Engine version | `f13.1` |
| Simulation mode | `F13_SPECIAL_TEAMS` |
| Strength states | EVEN_5V5, HOME_POWER_PLAY_5V4, AWAY_POWER_PLAY_5V4 |
| Max active penalties | 1 (two-minute minors) |
| Snapshot schema | 3 |
| Balance | schemaVersion ≥ 4 with active match + shots + goalies + penalties |
| Debug gate | `FHM_SIMULATION_DEBUG_ENABLED` |
| Verify commands | `verify:event-engine`, `verify:scoring-engine`, `verify:special-teams-engine` |
