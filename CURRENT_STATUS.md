# Franchise Hockey Manager — Current Status

**Status:** Active
**Last updated:** 2026-07-13
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Local repository path:** `C:\Projects\franchise-hockey-manager`

> Snapshot of what the app can do now, plus maintained Recent / Significant history for future AI-agent sessions.
> End-of-iteration maintenance is mandatory — see `AI_AGENTS.md` §13.1–§13.2 and §5–§7 below.

---

## 1. Current Development Phase

**F15 — Match UI and Diagnostics: implemented locally (not committed).** Polishes the persisted Match Detail experience: overview scoreboard/period scoring, public event feed with filters, team/skater/goalie stats, lines and usage, exports, and Commissioner-only diagnostics/attempts/technical events. No new simulation formulas; no Prisma schema change.

**Next milestone: F16 — Simulation Lab** (do not start until requested).

F1–F14 remain complete on `main` (F14 at `ed755df`).

---

## 2. Milestone Status

### F1–F14

Complete on `main`.

### F15 — Match UI and Diagnostics (Done locally)

Implemented:
- Match overview read model (`GET /api/matches/:id/overview`) with period scores derived from GOAL events, scoring/shootout summaries, team comparison, skater/goalie rows, line usage, compact metadata
- Public event feed with category/period/team filters, pagination, readable summaries; technical noise hidden by default
- Historical display prefers immutable `simulationInputText` team/player names (current entity renames do not rewrite history)
- Commissioner diagnostics (`/api/commissioner/matches/:id/diagnostics`), technical events, attempt selection, audit
- Exports: result JSON, events/player/team CSV; Commissioner diagnostics JSON / technical events CSV
- Client `/matches/:matchId` tabs: Overview, Events, Team/Player/Goalie stats, Lines & Usage; Commissioner Diagnostics + Attempts; URL state (`tab`, `resultId`, filters)
- Current vs Superseded result labeling; F14 resimulation UI preserved

Not in F15:
- New simulation behavior, balance tuning, schedules/standings
- Live animation, rink coordinates, in-progress persistence
- Simulation Lab batches (F16)

### M1–M8

Unchanged.

---

## 3. Known Bugs / Limitations Worth Remembering

- Scoring rates remain high (~10 combined goals/game) — defer realism tuning to F16.
- Period H/A scores are derived from persisted GOAL events (not a dedicated PeriodScore column).
- Line usage shift counts are recorded simulation usage, not official NHL TOI.
- Average shot quality in diagnostics is not an xG model.
- Manual UI verification for F15 was **NOT RUN**.
- F15 changes not yet committed/pushed.
- Commissioner header is not security.

---

## 4. Nearest Next Steps

1. Commit/push F15 when the owner requests.
2. Manual UI pass on disposable DB (REG/OT/SO + resimulated match).
3. **F16 — Simulation Lab** (when requested).

---

## 5. Recent Changes

> Ordinary repository-relevant history, newest first.

### 2026-07-13 — F15 Match UI and Diagnostics

- Work completed: match-view/events/diagnostics/export read models; overview + public feed APIs; Commissioner diagnostics/attempts/audit/export; polished Match Detail tabs; historical snapshot names; no Prisma migration
- Validation: 107 engine + 141 server tests PASS; typecheck/build PASS; playable-match verify 100 runs PASS; setup:validate PASS; manual UI **NOT RUN**
- Remaining: F15 uncommitted; F16 deferred

### 2026-07-13 — F14 Playable Match

- Committed/pushed on `main` (`ed755df`)

### 2026-07-13 — F13 Penalties and Special Teams

- Committed/pushed on `main` (`cd5cbe6`)

---

## 6. Significant Changes

> Major architectural or product decisions only.

### 2026-07-13 — F15 Match UI and Diagnostics (Significant)

- Persisted match viewing is a first-class product surface separate from Simulation Lab
- Public event feed hides technical noise; Commissioner diagnostics expose deterministic metadata without hidden potential
- Historical match presentation uses immutable F14 snapshots, not live mutable entity names
- Superseded result attempts remain inspectable and clearly labeled

### 2026-07-13 — F14 Playable Match (Significant)

- First persisted match workflow with atomic result/events/stats persistence

---

## 7. Quick Reference

| Item | Value |
|---|---|
| Engine version (playable) | `f14.1` |
| Simulation mode (playable) | `F14_PLAYABLE_MATCH` |
| Balance schema (active) | **5** (Standard v5) |
| Match UI routes | `/matches`, `/matches/new`, `/matches/:matchId` |
| Overview API | `GET /api/matches/:id/overview` |
| Diagnostics API | `GET /api/commissioner/matches/:id/diagnostics` |
| Verify command | `npm run verify:playable-match-engine` |
