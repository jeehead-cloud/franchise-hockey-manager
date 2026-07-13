# Franchise Hockey Manager — Current Status

**Status:** Active
**Last updated:** 2026-07-13
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Local repository path:** `C:\Projects\franchise-hockey-manager`

> Snapshot of what the app can do now, plus maintained Recent / Significant history for future AI-agent sessions.
> End-of-iteration maintenance is mandatory — see `AI_AGENTS.md` §13.1–§13.2 and §5–§7 below.

---

## 1. Current Development Phase

**F19 — NHL Playoffs: implemented locally (not committed).** BEST_OF_SERIES stages import final F18 qualifiers, generate deterministic brackets, simulate series via F14, advance winners, crown a champion, and expose CompetitionEdition completion readiness. Awards/archive remain deferred.

**Next milestone: F20** (do not start until requested — typically awards / archive / season wrap-up per foundation plan).

F1–F18 remain complete on `main` (F18 at `2022dd6`).

---

## 2. Milestone Status

### F1–F18

Complete on `main`.

### F19 — NHL Playoffs (Done locally)

Implemented:
- Engine `packages/engine/src/competitions/playoffs/` — config, seeding, FIXED/RESEED brackets, home pattern, series progression, `verify:playoffs`
- Power-of-two brackets only (byes not supported in F19)
- Prisma `PlayoffSeries`, Match `playoffSeriesId`/`playoffGameNumber`, stage champion/bracket fields; migration `20260713190000_f19_playoffs`
- Commissioner: import qualifiers, preview/generate/regenerate bracket
- Public: bracket, series, simulate-next/series/all-playoffs, edition completion-readiness
- Lazy game creation; clinch stops series; interim SQLite backup before first playoff game
- Client Playoffs tab + series cards

Not in F19:
- Awards, archive UI, trophy history, byes, real NHL conference matrix, F20+ systems

### M1–M8

Unchanged.

---

## 3. Known Bugs / Limitations Worth Remembering

- Scoring rates remain high (~10 goals/game).
- Playoff templates are simplified (power-of-two only; no byes).
- Playoff resimulation locked once a later game / completed series / completed stage exists.
- Manual UI verification for F19 was **NOT RUN**.
- F19 changes not yet committed/pushed.
- Commissioner header is not security.

---

## 4. Nearest Next Steps

1. Commit/push F19 when the owner requests.
2. Manual UI pass on disposable DB (import → bracket → series → champion → edition complete).
3. **F20** when requested.

---

## 5. Recent Changes

### 2026-07-13 — F19 NHL Playoffs

- Work completed: playoff engine, PlayoffSeries persistence, lazy games, progression, champion, edition completion readiness, Competition UI Playoffs tab
- Validation: engine playoff tests + verifier PASS; F19 server test + migrations PASS; broader typecheck/build pending in-session wrap-up; manual UI **NOT RUN**
- Remaining: F19 uncommitted; F20 deferred

### 2026-07-13 — F18 NHL Regular Season

- Committed/pushed on `main` (`2022dd6`)

---

## 6. Significant Changes

### 2026-07-13 — F19 NHL Playoffs (Significant)

- Qualifiers import from immutable F18 final standing snapshots only
- Deterministic bracket hash; regeneration locked after first result
- Series end at winsRequired; lazy next-game creation; winners advance once
- Champion persisted on playoff stage; edition COMPLETED is Commissioner-gated via readiness (no auto-archive)

### 2026-07-13 — F18 NHL Regular Season (Significant)

- Scheduled Match rows as schedule; provisional/final standings; stage backup boundary

---

## 7. Quick Reference

| Item | Value |
|---|---|
| Dataset schemaVersion | 5 |
| Playoff stage types | BEST_OF_SERIES (primary); KNOCKOUT allowed structurally |
| Bracket modes | FIXED, RESEED_EACH_ROUND |
| Participant constraint | Power-of-two only |
| Migration | `20260713190000_f19_playoffs` |
| Verifier | `npm run verify:playoffs` |
| Next | F20 |
