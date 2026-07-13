# Franchise Hockey Manager — Current Status

**Status:** Active
**Last updated:** 2026-07-13
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Local repository path:** `C:\Projects\franchise-hockey-manager`

> Snapshot of what the app can do now, plus maintained Recent / Significant history for future AI-agent sessions.
> End-of-iteration maintenance is mandatory — see `AI_AGENTS.md` §13.1–§13.2 and §5–§7 below.

---

## 1. Current Development Phase

**F24 — Player Development: implemented locally (not committed).** Deterministic annual development/decline for existing players: versioned development config, effective-date aging, skater/goalie curves, attribute budgets, CA/role recalculation, form regression, retirement without deletion, PRE/POST `PlayerSeasonSnapshot`, preview → prepare → atomic execute with stale-input protection and backup. No youth generation, no next WorldSeason, no auto lineup/roster rewrite.

**Next milestone: F25** (youth generation — do not start until requested).

F1–F23 remain complete on `main` (F23 at `6062996`).

---

## 2. Milestone Status

### F1–F23

Complete on `main`.

### F24 — Player Development (Done locally)

Implemented:
- Engine `packages/engine/src/development/` — config, age, budget, allocation, form, retirement, role adapters, process, hashes, reconciliation, readiness; `verify:player-development`
- Prisma: `Player.form`, `RosterStatus.RETIRED`, development presets/versions/active config, runs/results, PRE/POST season snapshots; migration `20260714000000_f24_player_development`
- Server: readiness/preview/prepare/execute/discard; config versioning; public + commissioner APIs; bootstrap default **Development Default v1**
- Client: `/development`, `/development/runs/:runId`, player Development tab, World card
- Retirement keeps `currentTeamId`; excludes RETIRED from lineup eligibility / readiness depth
- Club lineups, locked NT snapshots, F20 archives unchanged by F24

Not in F24:
- F25 youth cohorts; contracts/FA/trades; offseason orchestration; next WorldSeason; automatic roster replacement; Hall of Fame; injuries; training plans; potential growth; completed-run supersession UI

### M1–M8

Unchanged.

---

## 3. Known Bugs / Limitations Worth Remembering

- Scoring rates remain high in detailed F14 (~10 goals/game).
- International templates are simplified (default 8 teams / 2 groups / QF–Final or 4-team test SF).
- Development curves are simplified hobby presets — **not NHL-calibrated**.
- Manual UI verification for F24 was **NOT RUN**.
- F24 changes not yet committed/pushed.
- Commissioner header is not security.
- Retired players may still appear on team roster lists until offseason cleanup (F30); they fail lineup eligibility.

---

## 4. Nearest Next Steps

1. Commit/push F24 when the owner requests.
2. Manual UI pass on disposable DB (preview → prepare → stale edit → re-prepare → execute → history).
3. **F25** when requested.

---

## 5. Recent Changes

### 2026-07-13 — F24 Player Development

- Work completed: development engine; Prisma presets/runs/snapshots; form + RETIRED; preview/prepare/execute with backup + stale guard; APIs/UI; verifier/tests
- Validation: engine development tests + verifier PASS; F24 server + migrations PASS (see wrap-up Validation); manual UI **NOT RUN**
- Remaining: F24 uncommitted; F25 deferred

### 2026-07-13 — F23 International Tournaments

- Committed/pushed on `main` (`6062996`)

### 2026-07-13 — F22 National Teams

- Committed/pushed on `main` (`45ceb68`)

---

## 6. Significant Changes

### 2026-07-13 — F24 Player Development (Significant)

- Official development uses an explicit `effectiveDate` (never wall clock) for age
- One completed official development run per WorldSeason; preview never writes; publication is atomic
- Potential does not automatically increase; CA and role are recalculated via existing F5 functions after attribute changes
- Retirement marks `RETIRED` without deleting the player or clearing `currentTeamId` in F24
- Club ownership, club lineups, locked national-team snapshots, and F20 archives remain unchanged
- F24 creates no new players and does not advance WorldSeason
- Development config is separately versioned from F10 match-balance presets

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
| Dataset schemaVersion | 5 (unchanged) |
| Migration | `20260714000000_f24_player_development` |
| Verifier | `npm run verify:player-development` |
| Default config | Development Default v1 (attribute budgets ~±8 on 1–20 attrs) |
| UI | `/development` |
| Next | F25 |
