# Franchise Hockey Manager — Current Status

**Status:** Active
**Last updated:** 2026-07-13
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Local repository path:** `C:\Projects\franchise-hockey-manager`

> Snapshot of what the app can do now, plus maintained Recent / Significant history for future AI-agent sessions.
> End-of-iteration maintenance is mandatory — see `AI_AGENTS.md` §13.1–§13.2 and §5–§7 below.

---

## 1. Current Development Phase

**F22 — National Teams: implemented locally (not committed).** Persistent `NationalTeamProfile` (Team `teamType=NATIONAL`) plus edition-scoped preparation: eligibility rules, candidate pools, suggested/manual rosters, staff, tactics, lineups, readiness, and lock. Club ownership and club lineups are never mutated. No international tournament schedules or matches (F23).

**Next milestone: F23** (international tournament schedules, stages, matches — do not start until requested).

F1–F21 remain complete on `main` (F21 at `d4837ad`).

---

## 2. Milestone Status

### F1–F21

Complete on `main`.

### F22 — National Teams (Done locally)

Implemented:
- Engine `packages/engine/src/national-teams/` — eligibility, ranking, suggestion, roster validation, lineup helpers, readiness, hashes; `verify:national-teams`
- Prisma: `NationalTeamProfile`, `NationalTeamEdition`, candidates/roster/staff/tactics/lineup models; migration `20260713220000_f22_national_teams`
- Categories: `SENIOR_MEN`, `JUNIOR_U20` (simplified eligibility: primary nationality + explicit U20 cutoff date; no citizenship history)
- Commissioner prepare / generate-candidates / suggest-roster / roster / staff / tactics / auto-lineup / confirm / lock
- Public read APIs; National Teams sidebar + pages; competition-edition National Teams tab; World Dashboard prep notice
- International edition readiness requires LOCKED national-team editions before READY/ACTIVE

Not in F22:
- International tournament schedules, groups, knockouts, medals (F23)
- Club–country calendar conflicts; NT fatigue/injury; citizenship history
- Required `national-teams.json` import (schemaVersion remains 5; definitions created via Commissioner)

### M1–M8

Unchanged.

---

## 3. Known Bugs / Limitations Worth Remembering

- Scoring rates remain high in detailed F14 (~10 goals/game).
- Aggregated scoring/stats are **estimates** — not event-derived; not real-league calibrated.
- Playoff templates remain simplified for DETAILED competitions.
- National-team eligibility is **simplified**: only `nationalityCountryId` + `dateOfBirth`; citizenship/birth-country modes fall back to primary nationality.
- Manual UI verification for F22 was **NOT RUN**.
- F22 changes not yet committed/pushed.
- Commissioner header is not security.

---

## 4. Nearest Next Steps

1. Commit/push F22 when the owner requests.
2. Manual UI pass on disposable DB (senior + U20 + international edition).
3. **F23** when requested.

---

## 5. Recent Changes

### 2026-07-13 — F22 National Teams

- Work completed: NationalTeamProfile + edition preparation; engine eligibility/suggestion/readiness; Commissioner workflow; public UI; competition readiness integration; migration/tests/verifier
- Validation: engine national-teams tests + verifier; server F22 + migrations; broader suite in wrap-up; manual UI **NOT RUN**
- Remaining: F22 uncommitted; F23 deferred

### 2026-07-13 — F21 Aggregated League Simulation

- Committed/pushed on `main` (`d4837ad`)

### 2026-07-13 — F20 Competition Archive and History

- Committed/pushed on `main` (`0228e47`)

---

## 6. Significant Changes

### 2026-07-13 — F22 National Teams (Significant)

- National-team selection never changes club ownership (`Player.currentTeamId` unchanged)
- Roster membership is CompetitionEdition-specific; one player per national team per edition
- Confirmed/locked rosters and lineups use snapshots; later renames/transfers do not rewrite them
- National tactics and lineups are independent from club TeamTactics / TeamLineup
- Eligibility is deterministic and versioned; U20 uses explicit cutoff dates (no wall clock)
- F22 does not create or simulate international tournament matches

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

---

## 7. Quick Reference

| Item | Value |
|---|---|
| Dataset schemaVersion | 5 (unchanged; no required national-teams import) |
| Migration | `20260713220000_f22_national_teams` |
| Verifier | `npm run verify:national-teams` |
| APIs | `/api/national-teams`, `/api/national-team-editions/*`, commissioner prepare/roster/lock |
| Next | F23 |
