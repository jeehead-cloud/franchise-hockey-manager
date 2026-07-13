# Franchise Hockey Manager — Current Status

**Status:** Active
**Last updated:** 2026-07-13
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Local repository path:** `C:\Projects\franchise-hockey-manager`

> Snapshot of what the app can do now, plus maintained Recent / Significant history for future AI-agent sessions.
> End-of-iteration maintenance is mandatory — see `AI_AGENTS.md` §13.1–§13.2 and §5–§7 below.

---

## 1. Current Development Phase

**F21 — Aggregated League Simulation: implemented locally (not committed).** AGGREGATED competitions can prepare and simulate an entire regular-season stage via deterministic team-strength snapshots and lightweight `AggregatedMatchSummary` rows — without F14 MatchEvent / MatchResult paths. Final standings, team/player/goalie stage snapshots, champion, edition completion readiness, and F20 archive compatibility are included. Public UI labels Aggregated Simulation clearly.

**Next milestone: F22** (do not start until requested — national teams / international tournaments per foundation plan).

F1–F20 remain complete on `main` (F20 at `0228e47`).

---

## 2. Milestone Status

### F1–F20

Complete on `main`.

### F21 — Aggregated League Simulation (Done locally)

Implemented:
- Engine `packages/engine/src/competitions/aggregated/` — config, strength, schedule (reuses F18), game summaries, allocation, reconciliation, hashes, `verify:aggregated-league`
- Prisma `AggregatedSeasonRun` + `AggregatedMatchSummary` + stage aggregate fields; migration `20260713210000_f21_aggregated_league`
- Commissioner preview/prepare/discard; public simulate/status/matches; diagnostics
- Official publication after reconciliation; stage COMPLETED + champion; league-only edition completion readiness
- F20 archive readiness/builder AGGREGATED branch (no Match/MatchEvent required)
- Client AggregatedLeaguePanel on competition edition pages when `simulationLevel = AGGREGATED`

Not in F21:
- Promotion/relegation; cross-league movement; aggregated playoffs; national teams; next-season generation; detailed foreign-league events; F14 MatchEvent persistence for aggregate games

### M1–M8

Unchanged.

---

## 3. Known Bugs / Limitations Worth Remembering

- Scoring rates remain high in detailed F14 (~10 goals/game).
- Aggregated scoring/stats are **estimates** — not event-derived; not real-league calibrated.
- Playoff templates remain simplified for DETAILED competitions.
- Manual UI verification for F21 was **NOT RUN**.
- F21 changes not yet committed/pushed.
- Commissioner header is not security.

---

## 4. Nearest Next Steps

1. Commit/push F21 when the owner requests.
2. Manual UI pass on disposable AGGREGATED league DB.
3. **F22** when requested.

---

## 5. Recent Changes

### 2026-07-13 — F21 Aggregated League Simulation

- Work completed: aggregate engine, persisted runs/summaries, prepare/simulate APIs, standings/stat snapshots, champion, archive integration, Aggregated UI panel
- Validation: engine aggregated tests + verifier PASS; F21 server + migrations PASS; broader suite/docs in wrap-up; manual UI **NOT RUN**
- Remaining: F21 uncommitted; F22 deferred

### 2026-07-13 — F20 Competition Archive and History

- Committed/pushed on `main` (`0228e47`)

---

## 6. Significant Changes

### 2026-07-13 — F21 Aggregated League Simulation (Significant)

- `simulationLevel = AGGREGATED` never uses the detailed F14 event engine or MatchEvent rows
- Official aggregate results publish only after reconciliation; failed/cancelled runs never count
- Final player/goalie stats are deterministic aggregate estimates allocated from team totals
- Completed aggregate stages are locked; archives label `simulationMode` / simulation level AGGREGATED
- No promotion/relegation or next-season generation in F21

### 2026-07-13 — F20 Competition Archive and History (Significant)

- Only COMPLETED editions archive; atomic + idempotent; pre-archive SQLite backup required
- Archive snapshots never use mutable live names as display source
- ARCHIVED editions/matches: no simulation, resimulation, or structural edits

### 2026-07-13 — F19 NHL Playoffs (Significant)

- Qualifiers import from immutable F18 final standing snapshots only
- Champion persisted; edition COMPLETED Commissioner-gated (no auto-archive)

---

## 7. Quick Reference

| Item | Value |
|---|---|
| Dataset schemaVersion | 5 |
| Archive schemaVersion | 1 |
| Migration | `20260713210000_f21_aggregated_league` |
| Verifier | `npm run verify:aggregated-league` |
| Aggregate APIs | `/api/competition-stages/:id/aggregated-*`, commissioner prepare/preview |
| Next | F22 |
