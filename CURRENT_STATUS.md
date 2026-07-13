# Franchise Hockey Manager — Current Status

**Status:** Active
**Last updated:** 2026-07-13
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Local repository path:** `C:\Projects\franchise-hockey-manager`

> Snapshot of what the app can do now, plus maintained Recent / Significant history for future AI-agent sessions.
> End-of-iteration maintenance is mandatory — see `AI_AGENTS.md` §13.1–§13.2 and §5–§7 below.

---

## 1. Current Development Phase

**F14 — Playable Match: implemented locally (not committed).** Adds persistent `Match` / `MatchResult` / events / game statistics, full regulation + 3v3 OT + shootout via `simulateCompleteMatch`, atomic server persistence, match APIs, `/matches` UI, and Commissioner-gated resimulation with superseded-result history.

**Next milestone: F15 — Match UI and Diagnostics** (do not start until requested).

F1–F13 remain complete on `main`. F14 work is local only.

---

## 2. Milestone Status

### F1–F13

Complete on `main` (F13 committed/pushed as `cd5cbe6`).

### F14 — Playable Match (Done locally)

Implemented:
- Engine `f14.1` / mode `F14_PLAYABLE_MATCH`; snapshot schemaVersion **4** (rejects F11–F13 snapshots)
- `simulateCompleteMatch()`: regulation → optional 5-minute 3v3 OT (sudden death, no OT penalties) → optional shootout
- Shootout goals separate from player/team normal goals; `MATCH_END` final event
- Balance schemaVersion **5** with `matchCompletion` (overtime + shootout); Standard v5 bootstrap / legacy Standard auto-upgrade
- Prisma: `Match`, `MatchResult`, `MatchEvent`, `PlayerGameStat`, `TeamGameStat` + F14 migration
- APIs: `POST/GET /api/matches`, simulate, result, events; Commissioner resimulate + attempts
- Client: `/matches`, `/matches/new`, `/matches/:matchId` (overview, events, stats, metadata, Commissioner resimulation)
- Verification: `npm run verify:playable-match-engine` (500 runs default)

Not in F14:
- Competition schedules, standings, playoff series, batch season simulation
- Live persisted pause/resume, graphical playback, Simulation Lab batches
- NHL-style OT penalty carryover; 5v3/4v4 during OT
- `useCurrentWorldState` resimulation (deferred; default is `ORIGINAL` immutable input)

### M1–M8

Unchanged.

---

## 3. Known Bugs / Limitations Worth Remembering

- Scoring rates remain high (~10 combined goals/game in batches) — first-version balance; defer broad realism tuning to F16.
- F14 OT simplification: regulation-ending penalties are resolved for stats as in F13; OT starts even 3v3 with no new penalties.
- Shootout uses deterministic shooter ordering; no chemistry optimization for OT units.
- `/simulation-lab` remains F13 regulation debug — not replaced by Match pages.
- Manual UI verification for F14 was **NOT RUN**.
- F14 changes not yet committed/pushed.
- Commissioner header is not security.

---

## 4. Nearest Next Steps

1. Commit/push F14 when the owner requests.
2. Manual UI pass on disposable DB with two READY teams and Standard v5 balance.
3. **F15 — Match UI and Diagnostics** (when requested).

---

## 5. Recent Changes

> Ordinary repository-relevant history, newest first.

### 2026-07-13 — F14 Playable Match

- Work completed: engine OT/SO + `simulateCompleteMatch`, balance schema v5, Prisma match persistence, match APIs, Commissioner resimulation, `/matches` UI, `verify:playable-match-engine`
- Validation: 107 engine + 135 server tests PASS; typecheck/build PASS; playable-match verify 500 runs PASS (431 REG / 47 OT / 22 SO; ~9.89 goals/game; PP% ~18.2%; 0 recon/replay/safety failures); scoring/special-teams verify 500 runs PASS; manual UI **NOT RUN**
- Remaining: F14 uncommitted; F15 deferred

### 2026-07-13 — F13 Penalties and Special Teams

- Committed/pushed on `main` (`cd5cbe6`)

### 2026-07-13 — F12 Shots, Goalies, and Scoring

- Committed/pushed on `main` (`6c09ff5`)

---

## 6. Significant Changes

> Major architectural or product decisions only.

### 2026-07-13 — F14 Playable Match (Significant)

- First persisted match workflow: immutable simulation input + atomic result/events/stats persistence
- OT/shootout as isolated post-regulation phases; shootout stats separated from normal goals
- Commissioner resimulation reuses original input with new seed; prior results superseded not deleted
- No schedule/standings impact in F14 (F17 will connect matches to competition stages)

### 2026-07-13 — F13 Penalties and Special Teams (Significant)

- One-active-minor 5v4 special teams model with event-derived PP/PK statistics

---

## 7. Quick Reference

| Item | Value |
|---|---|
| Engine version (playable) | `f14.1` |
| Simulation mode (playable) | `F14_PLAYABLE_MATCH` |
| Balance schema (active) | **5** (Standard v5) |
| Snapshot schema | **4** |
| Debug simulation mode | `F13_SPECIAL_TEAMS` (regulation only) |
| Match UI routes | `/matches`, `/matches/new`, `/matches/:matchId` |
| Verify command | `npm run verify:playable-match-engine` |
