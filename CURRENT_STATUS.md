# Franchise Hockey Manager — Current Status

**Status:** Active
**Last updated:** 2026-07-13
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Local repository path:** `C:\Projects\franchise-hockey-manager`

> Snapshot of what the app can do now, plus maintained Recent / Significant history for future AI-agent sessions.
> End-of-iteration maintenance is mandatory — see `AI_AGENTS.md` §13.1–§13.2 and §5–§7 below.

---

## 1. Current Development Phase

**F20 — Competition Archive and History: implemented locally (not committed).** COMPLETED editions can be archived into immutable `CompetitionArchive` snapshots (participants, stages, standings, stats, match summaries, series, awards, hashes). History APIs/pages expose seasons, competitions, champions, records, and player/team season history. ARCHIVED editions and their matches cannot be simulated or structurally edited. Next-season generation remains F21+.

**Next milestone: F21** (do not start until requested — typically aggregated league simulation / next season per foundation plan).

F1–F19 remain complete on `main` (F19 at `42ca9f8`).

---

## 2. Milestone Status

### F1–F19

Complete on `main`.

### F20 — Competition Archive and History (Done locally)

Implemented:
- Engine `packages/engine/src/competitions/history/` — normalize, archive/source hashes, awards, records, reconciliation, `verify:archive-history`
- Prisma archive models + migration `20260713200000_f20_competition_archive` (archiveSchemaVersion = 1)
- Commissioner `POST .../archive` with pre-archive SQLite backup; atomic persistence; COMPLETED → ARCHIVED; idempotent retry
- Public history APIs under `/api/history/*`; archive readiness on editions
- Client History nav + archive detail tabs; edition Archive panel; player/team history routes
- Bounded awards (champion, RS leaders, goalie SV%, playoff points); records derived on read from current archives

Not in F20:
- F21 aggregated leagues / new season; offseason; development; Hall of Fame; subjective awards; archive import; arbitrary archive editing (supersession model fields exist; no UI supersede)

### M1–M8

Unchanged.

---

## 3. Known Bugs / Limitations Worth Remembering

- Scoring rates remain high (~10 goals/game).
- Playoff templates are simplified (power-of-two only; no byes).
- Archive correction/supersession is modeled but not exposed as a full Commissioner UI workflow.
- Manual UI verification for F20 was **NOT RUN**.
- F20 changes not yet committed/pushed.
- Commissioner header is not security.

---

## 4. Nearest Next Steps

1. Commit/push F20 when the owner requests.
2. Manual UI pass on disposable DB (complete → archive → history → rename stability).
3. **F21** when requested.

---

## 5. Recent Changes

### 2026-07-13 — F20 Competition Archive and History

- Work completed: immutable archive models, readiness, atomic archive + awards, history APIs/UI, archived write locks
- Validation: engine history tests + verifier PASS; F20 server test + migrations PASS; broader suite pending wrap-up; manual UI **NOT RUN**
- Remaining: F20 uncommitted; F21 deferred

### 2026-07-13 — F19 NHL Playoffs

- Committed/pushed on `main` (`42ca9f8`)

---

## 6. Significant Changes

### 2026-07-13 — F20 Competition Archive and History (Significant)

- Only COMPLETED editions archive; atomic + idempotent; pre-archive SQLite backup required
- Archive snapshots never use mutable live names as display source
- Awards from archived stats; records from current official archives only
- ARCHIVED editions/matches: no simulation, resimulation, or structural edits
- Corrections must supersede (new version), never mutate archive rows in place
- F20 does not create the next WorldSeason

### 2026-07-13 — F19 NHL Playoffs (Significant)

- Qualifiers import from immutable F18 final standing snapshots only
- Champion persisted; edition COMPLETED Commissioner-gated (no auto-archive)

---

## 7. Quick Reference

| Item | Value |
|---|---|
| Dataset schemaVersion | 5 |
| Archive schemaVersion | 1 |
| Migration | `20260713200000_f20_competition_archive` |
| Verifier | `npm run verify:archive-history` |
| History routes | `/history`, `/history/competitions/:archiveId` |
| Next | F21 |
