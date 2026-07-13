# Franchise Hockey Manager — Current Status

**Status:** Active
**Last updated:** 2026-07-13
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Local repository path:** `C:\Projects\franchise-hockey-manager`

> Snapshot of what the app can do now, plus maintained Recent / Significant history for future AI-agent sessions.
> End-of-iteration maintenance is mandatory — see `AI_AGENTS.md` §13.1–§13.2 and §5–§7 below.

---

## 1. Current Development Phase

**F23 — International Tournaments: implemented locally (not committed).** Configurable WORLD_JUNIORS / WORLD_CHAMPIONSHIP / OLYMPIC_GAMES templates over F17 stages: locked F22 roster integration, group schedules, standings/qualification, single-game knockout (BO1 PlayoffSeries), medals, F14 match simulation from NT snapshots, archive readiness. Formats are **simplified development presets**, not exact IIHF/IOC fidelity.

**Next milestone: F24** (player development — do not start until requested).

F1–F22 remain complete on `main` (F22 at `45ceb68`).

---

## 2. Milestone Status

### F1–F22

Complete on `main`.

### F23 — International Tournaments (Done locally)

Implemented:
- Engine `packages/engine/src/competitions/international/` — templates, grouping, schedule, standings, qualification, knockout, medals, reconciliation, hashes; `verify:international-tournaments`
- Prisma: Match `tournamentGroupKey`, CompetitionEdition tournament metadata, `TournamentMedalResult`; migration `20260713230000_f23_international_tournaments`
- NT → F14 match input from locked NationalTeamEdition (club lineups/ownership untouched)
- Commissioner preview/prepare/generate-schedule; public simulate + progress/medals/groups reads
- Client: `/international-tournaments` + CompetitionEdition Tournament tab

Not in F23:
- Qualification systems / world rankings; club–country conflicts; NT fatigue; next-tournament generation; F24 development

### M1–M8

Unchanged.

---

## 3. Known Bugs / Limitations Worth Remembering

- Scoring rates remain high in detailed F14 (~10 goals/game).
- International templates are simplified (default 8 teams / 2 groups / QF–Final or 4-team test SF).
- Manual UI verification for F23 was **NOT RUN**.
- F23 changes not yet committed/pushed.
- Commissioner header is not security.

---

## 4. Nearest Next Steps

1. Commit/push F23 when the owner requests.
2. Manual UI pass on disposable WJC/senior tournament DB.
3. **F24** when requested.

---

## 5. Recent Changes

### 2026-07-13 — F23 International Tournaments

- Work completed: international engine module; Prisma medals/metadata; NT match input; prepare/schedule/simulate APIs; UI; archive GROUP_STAGE readiness; verifier/tests
- Validation: engine international tests + verifier PASS; F23 server + migrations PASS; broader suite in wrap-up; manual UI **NOT RUN**
- Remaining: F23 uncommitted; F24 deferred

### 2026-07-13 — F22 National Teams

- Committed/pushed on `main` (`45ceb68`)

### 2026-07-13 — F21 Aggregated League Simulation

- Committed/pushed on `main` (`d4837ad`)

---

## 6. Significant Changes

### 2026-07-13 — F23 International Tournaments (Significant)

- International matches use locked F22 national-team snapshots (not club lineups)
- WJC eligibility uses stored F22 cutoff rules (no wall clock)
- Group qualification and medals derive from current MatchResults only
- Schedule/bracket lock after results; completed tournaments immutable
- Club ownership and club lineups remain unchanged
- Templates are config-driven simplified formats — not claimed IIHF/IOC replicas

### 2026-07-13 — F22 National Teams (Significant)

- National-team selection never changes club ownership
- Roster membership is CompetitionEdition-specific; one player per national team per edition
- Confirmed/locked rosters use snapshots; F22 does not create tournament matches

---

## 7. Quick Reference

| Item | Value |
|---|---|
| Dataset schemaVersion | 5 |
| Migration | `20260713230000_f23_international_tournaments` |
| Verifier | `npm run verify:international-tournaments` |
| Templates | WORLD_JUNIORS, WORLD_CHAMPIONSHIP, OLYMPIC_GAMES |
| Next | F24 |
