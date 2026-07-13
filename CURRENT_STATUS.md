# Franchise Hockey Manager — Current Status

**Status:** Active
**Last updated:** 2026-07-13
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Local repository path:** `C:\Projects\franchise-hockey-manager`

> Snapshot of what the app can do now, plus maintained Recent / Significant history for future AI-agent sessions.
> End-of-iteration maintenance is mandatory — see `AI_AGENTS.md` §13.1–§13.2 and §5–§7 below.

---

## 1. Current Development Phase

**F18 — NHL Regular Season: implemented locally (not committed).** DETAILED `REGULAR_SEASON` stages can generate deterministic schedules, persist COMPETITION matches, run full-stage simulation through F14, derive provisional standings/stats, persist final snapshots, and expose F19 qualification input. Playoffs are not generated.

**Next milestone: F19 — NHL Playoffs** (do not start until requested).

F1–F17 remain complete on `main` (F17 at `9c91d4e`).

---

## 2. Milestone Status

### F1–F17

Complete on `main`.

### F18 — NHL Regular Season (Done locally)

Implemented:
- Engine `packages/engine/src/competitions/regular-season/` — schedule formats (ROUND_ROBIN / DOUBLE_ROUND_ROBIN / BALANCED_CUSTOM), home/away balance, standings + tiebreakers, team/player aggregation, qualification preview, `verify:regular-season`
- Prisma: stage schedule metadata; Match schedule fields; CompetitionStageStanding / TeamStat / PlayerStat; schedule statuses SCHEDULED / IN_PROGRESS; migration `20260713180000_f18_regular_season`
- Commissioner schedule preview/generate/regenerate; public schedule/progress/standings/stats/qualification; full-stage simulate with in-memory run + cancel/continue
- Interim SQLite `VACUUM INTO` pre-run backup under `.fhm-backups/` (not F32)
- Client Competition Edition tabs: Schedule & Results, Standings, Statistics (regular-season stage)

Not in F18:
- Playoff brackets/series, champion, awards, aggregated leagues, development/scouting/draft/contracts/trades

### M1–M8

Unchanged.

---

## 3. Known Bugs / Limitations Worth Remembering

- Scoring rates remain high (~10 goals/game) — Lab anomalies flag this as development WARNING. F18 does not claim NHL calibration.
- Competition rule templates remain simplified development presets.
- Fixture often has few simulation-ready teams; schedule generation requires readiness (tests mock readiness).
- Pre-run backup is local SQLite-only interim safety; no restore UI (F32).
- Completed-stage match resimulation is blocked in F18; destructive competition reset deferred.
- Manual UI verification for F18 was **NOT RUN**.
- F18 changes not yet committed/pushed.
- Commissioner header is not security.

---

## 4. Nearest Next Steps

1. Commit/push F18 when the owner requests.
2. Manual UI pass on disposable DB (preview → generate → simulate → standings/stats → regen/resim boundaries).
3. **F19 — NHL Playoffs** (when requested).

---

## 5. Recent Changes

> Ordinary repository-relevant history, newest first.

### 2026-07-13 — F18 NHL Regular Season

- Work completed: regular-season engine, schedule persistence, stage simulation runner, standings/stats snapshots, qualification output, Competition UI tabs, migration, verifier
- Validation: engine competition tests PASS; `verify:regular-season` PASS; F18 server tests + migrations PASS; broader suite/docs updated in-session; manual UI **NOT RUN**
- Remaining: F18 uncommitted; F19 deferred
- Note: cancellation preserves official completed MatchResults; continuation simulates only remaining matches

### 2026-07-13 — F17 Competition Framework

- Committed/pushed on `main` (`9c91d4e`)

### 2026-07-13 — F16 Simulation Lab

- Committed/pushed on `main` (`b3e3a70`)

---

## 6. Significant Changes

> Major architectural or product decisions only.

### 2026-07-13 — F18 NHL Regular Season (Significant)

- Scheduled Match rows are the schedule (COMPETITION source); unique `(competitionStageId, scheduleKey)`
- Provisional standings/stats derive from current MatchResults; final immutable snapshots on stage COMPLETED
- Schedule regeneration blocked after results; completed-stage resimulation blocked
- Full-stage runs reuse F16-style in-memory progress; official results persist on cancel
- Interim SQLite backup before first stage match simulation (not F32)
- Qualification output is structural F19 input only — no playoff generation

### 2026-07-13 — F17 Competition Framework (Significant)

- Universal Competition → Edition → Participants/Stages model
- Edition rules snapshots become immutable at READY/ACTIVE

### 2026-07-13 — F16 Simulation Lab (Significant)

- Unpersisted batch analysis separate from official Match history

---

## 7. Quick Reference

| Item | Value |
|---|---|
| Dataset schemaVersion | 5 (unchanged) |
| Stage flow (F18 RS) | PLANNED/READY → SCHEDULED → IN_PROGRESS → COMPLETED |
| Schedule formats | ROUND_ROBIN, DOUBLE_ROUND_ROBIN, BALANCED_CUSTOM |
| Migration | `20260713180000_f18_regular_season` |
| Verifier | `npm run verify:regular-season` |
| Backup dir | `.fhm-backups/` (`FHM_BACKUP_DIR` override) |
| Next | F19 Playoffs |
