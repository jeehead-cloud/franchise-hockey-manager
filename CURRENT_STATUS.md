# Franchise Hockey Manager — Current Status

**Status:** Active
**Last updated:** 2026-07-16
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Local repository path:** `C:\Projects\franchise-hockey-manager`

> Snapshot of what the app can do now, plus maintained Recent / Significant history for future AI-agent sessions.
> End-of-iteration maintenance is mandatory — see `AI_AGENTS.md` §13.1–§13.2 and §5–§7 below.

---

## 1. Current Development Phase

**F28 — Contracts and Free Agency: implemented locally (not committed).** Persistent versioned configuration; active/future/historical contracts over explicit `WorldSeason` ranges; deterministic valuation and extension advice; compatibility initialization with preview/backup/atomic publication; extension, expiration/future activation, free agency, competing offers, rights-holder signing, release, append-only transactions, readiness, APIs, and UI. Salary is integer dollars and informational only: no cap enforcement. F28 creates no trades, pick/right transfers, next season, or offseason orchestration.

**Next milestone: F29** (Trades — do not start until requested).

F1–F24 remain complete on `main`. F25–F28 changes are uncommitted in this tree.

---

## 2. Milestone Status

### F1–F24

Complete on `main`.

### F25 — Youth Generation (Done locally)

Implemented:
- Engine `packages/engine/src/youth-generation/` — profiles, names, ages, distributions, skater/goalie attributes, cohort generation, hashes, reconciliation, readiness; `verify:youth-generation`
- Prisma: profile sets/versions, active config, country name pools, runs/cohorts/`YouthGeneratedPlayer`; migration `20260715000000_f25_youth_generation`
- Server: bootstrap fictional NAV/SGL defaults; preview/prepare/execute; public + commissioner APIs
- Client: `/youth-generation`, run detail, player provenance, World card
- Physical height/weight/shoots stored on provenance only (not Player columns)
- Existing players, lineups, NT snapshots, archives, development runs unchanged by generation
- **F26 visibility fix:** public provenance/run-players redact true `currentAbility`/`developmentRate`/`role` for players still in PROSPECT status; Commissioner provenance keeps the full snapshot

Not in F25:
- F27 draft; contracts/FA/trades; club assignment; junior competitions; real-world name/player data; next WorldSeason; offseason orchestration

### F26 — Scouting (Done locally)

Implemented:
- Engine `packages/engine/src/scouting/` — types, strict versioned config, scout-skill, deterministic observations, confidence (bounded 0–1 with diminishing returns + cross-scout diversity), consolidation, estimate-only suggested ranking, staleness, hashing, reconciliation; `verify:scouting` (incl. 500-observation benchmark)
- Prisma: `ScoutingPreset`/`ScoutingPresetVersion`/`ActiveScoutingConfiguration`, `Scout`/`ScoutingDepartment`/`ScoutingDepartmentScout`, `TeamProspectKnowledge`, `ScoutingAssignment`/`ScoutingAssignmentScout`, `ScoutingObservation`, `TeamScoutingReport` (append-only versions), `TeamProspectWatchlistEntry`; migrations `20260716000000_f26_scouting` + `20260716010000_f26_scouting_audit`
- Server: bootstrap Scouting Default v1 (idempotent); public team-scoping (`/api/teams/:teamId/scouting/*`) estimates only; Commissioner scouts/departments/presets/versions/activate + true-comparison diagnostics; audit coverage for all write actions
- Client: `/scouting` landing (club selection required), `/teams/:teamId/scouting` (9 tabs incl. Commissioner-only Department/Configuration/Diagnostics), `/scouts`, `/scouts/:id`, prospect/assignment detail pages; sidebar Scouting entry
- Visibility: normal Player list/detail return `SCOUTING_REQUIRED` (Unknown) for complete prospects — never true ratings; Team-scoped APIs return only that club's estimates; Commissioner endpoints reveal true potential/CA/role/stateHash
- Invariants: scouting never mutates Player truth, provenance, lineups, NT snapshots, or archives; rescout after F24 development creates a new report version under the new state hash (old observations remain immutable history)

Not in F26:
- F27 draft; contracts/FA/trades; club assignment; Scout salaries/contracts/travel/budgets; pro opposition scouting; AI general managers; authentication; deployment

### F27 — NHL Draft (Done locally)

Implemented:
- Engine `packages/engine/src/draft/` — strict versioned `DraftConfig` (schemaVersion 1), explicit-cutoff eligibility (`draftAgeOnCutoffDate`, never wall clock), reverse-standings/MANUAL order with optional snaking, bounded deterministic seeded lottery (maximumMoveUp, no repeat winners, weighted), frozen team board normalization (estimates only), estimate-only deterministic auto-pick (weighted potential/CA/confidence/role/risk + watchlist bonus + stable player-id fallback; unknown-prospect bounded fallback), progression, reconciliation (unique picks/players, one ACTIVE right per completed pick), hashing; `verify:draft` (20 checks incl. 200-prospect × 7-round benchmark)
- Prisma: `DraftPreset`/`DraftPresetVersion`/`ActiveDraftConfiguration`, `DraftEvent`, `DraftEligiblePlayer`, `DraftTeamEntry`, `DraftLotteryDraw`, `DraftPick`, `PlayerDraftRight`, `DraftTeamBoardSnapshot`; migration `20260716020000_f27_draft` (F26 audit migration back-fills previously-undeclared indexes so a from-scratch `migrate deploy` reproduces the live schema); audit enums `DRAFT_*`
- Server: bootstrap Amateur Draft Default (idempotent); Commissioner lifecycle APIs (`/api/commissioner/drafts/*`: create/generate-eligibility/generate-order/run-lottery/mark-ready/start/cancel/select/diagnostics/configurations); public APIs (`/api/drafts/*`, `/api/drafts/:id/teams/:teamId/board`, `/api/players/:id/draft-history`, `/api/teams/:id/draft-rights`); team pick actions (`/api/drafts/:id/picks/:pickId/select|auto-select`); pre-start SQLite backup; atomic pick transaction (pick + right + eligible-status + next-pick + completion); audit coverage
- Client: `/drafts` landing (current-season draft status + latest selections), `/drafts/:id` detail (tabs: Overview, Eligible Prospects, Draft Order, Lottery, Draft Room, Results, Team Board, Diagnostics), sidebar Draft entry, World Dashboard draft card; Draft Room shows pick history, on-clock team, team board estimates, manual Select + Auto-Pick + Commissioner Select
- Visibility: team board uses F26 scouting estimates only — never true potential/current ability/role/quality tier; cross-team privacy (team A's board shows Unknown for prospects scouted only by team B); Commissioner diagnostics reveal hashes/order/truth behind the header gate
- Invariants: drafted Player remains PROSPECT/unsigned/`currentTeamId=null`; one ACTIVE right per completed pick; no contracts/trades/pick transfers/club assignment/lineup mutation; completed events immutable with deterministic result hash; scouting/provenance/development/NT/archive invariance preserved

Not in F27:
- F28 contracts/FA; F29 trades/pick transfers; F30 offseason orchestration; next WorldSeason creation; AI general-manager strategy beyond bounded deterministic auto-pick; real-time multiplayer; authentication

### F28 — Contracts and Free Agency (Done locally)

Implemented:
- Pure `packages/engine/src/contracts/` rules for strict configuration, eligibility, valuation/recommendations, offer validation/comparison, expiration, rights conversion, reconciliation, hashes, and `verify:contracts`
- Versioned presets; `PlayerContract`, `ContractOffer`, immutable recommendation snapshots, append-only transactions, initialization/expiration runs, partial unique ACTIVE/FUTURE indexes, and migration `20260716030000_f28_contracts`
- Compatibility initialization with backup; explicit-WorldSeason idempotent expiration; atomic acceptance/ownership synchronization; competing-offer closure; rights conversion; release; readiness; public/team/Commissioner APIs and UI
- Team-scoped prospect recommendations use F26 estimates or conservative Unknown fallback; ordinary DTOs omit hidden truth

Not in F28:
- Trades, pick/right transfers, cap accounting, retained salary, buyouts, waivers, arbitration, bonuses/clauses, AI negotiation, next WorldSeason, F30 orchestration, or authentication

### M1–M8

Unchanged.

---

## 3. Known Bugs / Limitations Worth Remembering

- Scoring rates remain high in detailed F14 (~10 goals/game).
- International templates and youth profiles are simplified hobby presets — **not real-world calibrated**.
- Default youth name pools are fictional development examples for fixture countries only.
- Scouting calibration (Scouting Default v1) is a simplified fictional preset — not tuned to any real scouting model.
- The F27 draft lottery is a simplified fictional development lottery — **not exact NHL lottery fidelity**.
- Team-scoped scouting/draft-board APIs use local sandbox team context (`/teams/:teamId/scouting`, `/drafts/:id/teams/:teamId/board`); there is **no authentication** — any caller passing a teamId reads that club's estimates. Commissioner header is not security.
- Manual UI verification for F25, F26, F27, and F28 was **NOT RUN**.
- F25–F28 changes not yet committed/pushed.
- Retired players may still appear on team roster lists until offseason cleanup (F30).

---

## 4. Nearest Next Steps

1. Run the remaining disposable-database manual UI pass, including F28 initialization, extension, expiration, offers/acceptance, rights signing, release, privacy, and responsive/direct-route checks.
2. Commit/push F25–F28 when the owner requests.
3. **F29** only when explicitly requested.

---

## 5. Recent Changes

### 2026-07-16 — F28 recovery re-verification

- Re-inspected the uncommitted F28 tree (interrupted by prior token-limit sessions), saved an external recovery patch/status copy, classified every modified and untracked file, and confirmed the implementation was internally coherent → **continued rather than restarted**
- Fixed one correctness inconsistency: `recommendExtension` used a year-only age subtraction while the rest of the contracts engine uses month/day-accurate `contractAgeOnDate`; now uses the shared helper
- Validation (all PASS): Prisma format/validate/generate; empty-DB `migrate deploy` through F28 (23 migrations); engine tests 236 PASS (incl. 13 contracts tests); server tests 233 PASS (incl. 6 F28 tests + migration-history F1–F28); all 16 verifiers PASS incl. `verify:contracts` (500-valuation benchmark 16.88 ms); root typecheck; engine/server/client builds; `git diff --check` clean; no stray DB/backup/patch files in the repo
- Manual UI **NOT RUN**; recovery patch/status files kept outside the repo
- Remaining: F25–F28 uncommitted; F29 deferred

### 2026-07-15 — F28 Contracts and Free Agency

- Recovered and completed the intended uncommitted F28 work without resetting it: versioned rules, explicit-season contracts, compatibility initialization, deterministic advice, extensions, idempotent expiration, free agency, competing offers, rights signing, release, transactions, readiness, APIs/UI, privacy boundaries, and no-cap/no-trade scope
- Validation includes Prisma schema/migrations, full engine/server regression suites, F28 verifier, typechecks/builds, and diff checks; exact results are recorded in the task handoff. Manual UI **NOT RUN**
- Remaining: F25–F28 uncommitted; F29 deferred

### 2026-07-15 — F27 NHL Draft

- Work completed: pure deterministic draft engine (config/eligibility/order/lottery/board/autopick/progression/reconciliation/hashing); Prisma preset/event/eligible/team-entry/lottery/pick/right/board-snapshot models + `20260716020000_f27_draft` migration (F26 audit back-fill of previously-undeclared indexes); bootstrap Amateur Draft Default (idempotent); Commissioner lifecycle APIs (create/eligibility/order/lottery/ready/start/cancel/select/diagnostics/configurations); public draft/team-board/player-history/team-rights APIs; team pick actions; pre-start SQLite backup; atomic pick transaction; audit coverage; `/drafts` + `/drafts/:id` (8 tabs incl. Draft Room with manual + auto-pick) UI; sidebar entry; World Dashboard draft card
- Invariants: drafted Player remains PROSPECT/unsigned/`currentTeamId=null`; one ACTIVE right per completed pick; team board uses F26 estimates only (no true potential/CA/role/quality tier); cross-team board privacy; completed events immutable with deterministic result hash; no contracts/trades/pick transfers/club assignment/lineup mutation; scouting/provenance/development/NT/archive invariance preserved
- Bugs fixed during recovery: (a) migration drift — several F2/F26 `@@index` declarations were absent from their migration SQL; the F26 audit migration now back-fills them so a from-scratch `migrate deploy` reproduces the live schema; (b) Prisma auto-resolved an ambiguous Player↔DraftPick relation by adding a synthetic `playerId` FK — removed by dropping the redundant `draftedByPicks` back-relation so DraftPick relates to Player only through `DraftEligiblePlayer`
- Validation: engine tests 223 PASS (+39 new F27 engine tests); server tests 227 PASS (+24 new F27 server tests, +1 migration-history update, +1 F26 no-draft assertion update); all 13 verifiers PASS incl. `verify:draft`; Prisma format/validate/generate PASS; empty-DB + F1–F27 migration history (22 migrations) PASS; root typecheck + engine/server/client builds PASS; `git diff --check` clean; manual UI **NOT RUN**; GET /health requires a world-initialized DB (validated implicitly via the F27 server test suite which boots the full app)
- Remaining: F25 + F26 + F27 uncommitted; F28 deferred

### 2026-07-15 — F26 Scouting

- Work completed: pure deterministic scouting engine (observations/confidence/consolidation/ranking/staleness/reconciliation); Prisma preset/scout/department/knowledge/assignment/observation/report/watchlist models + 2 migrations; bootstrap Scouting Default v1; public team-scoping estimate APIs; Commissioner scouts/departments/presets/versions/activate + true-comparison diagnostics; audit coverage; `/scouting`, `/teams/:teamId/scouting` (9 tabs), `/scouts`, prospect/assignment UI; sidebar entry
- Visibility hardening: public Player list/detail return `SCOUTING_REQUIRED` for complete prospects; public youth provenance/run-players redact true `currentAbility`/`developmentRate`/`role` for PROSPECTs; Commissioner full provenance preserved
- Bugs fixed during recovery: (a) prospect-model regression that masked legacy INCOMPLETE status as SCOUTING_REQUIRED; (b) rescout after F24 development threw because consolidation mixed old+new state hashes — now consolidates only the current state's observations; (c) public youth provenance leaked true development rate/current ability
- Validation: engine tests 184 PASS; server tests 203 PASS (+12 new F26 visibility/invariant tests); all 11 verifiers PASS incl. `verify:scouting`; Prisma format/validate/generate PASS; empty-DB + F1–F26 migration history (21 migrations) PASS; root typecheck + engine/server/client builds PASS; GET /health 200 `database:ok`; manual UI **NOT RUN**
- Remaining: F25 + F26 uncommitted; F27 deferred

### 2026-07-13 — F25 Youth Generation

- Work completed: youth engine; Prisma profile/name-pool/run/cohort/provenance; bootstrap defaults; preview/prepare/execute; APIs/UI; verifier/tests
- Validation: engine youth tests + verifier PASS; F25 server + migrations PASS (see wrap-up Validation); manual UI **NOT RUN**
- Remaining: F25 uncommitted; F26 deferred

### 2026-07-13 — F24 Player Development

- Committed/pushed on `main` (`b5113dd`)

### 2026-07-13 — F23 International Tournaments

- Committed/pushed on `main` (`6062996`)

---

## 6. Significant Changes

### 2026-07-15 — F28 Contracts and Free Agency (Significant)

- One ACTIVE contract per Player and one FUTURE contract slot are database-enforced; services reject overlapping live ranges
- ACTIVE contract Team is authoritative for `Player.currentTeamId`; acceptance updates both atomically, while release/expiration clear ownership unless a FUTURE contract activates
- Offers confer no ownership before acceptance; acceptance closes competing offers and preserves immutable contract/transaction history
- Draft rights remain distinct: only the ACTIVE rights holder may sign, and acceptance converts the right without rewriting DraftPick history
- Boundaries use explicit existing `WorldSeason` ordering snapshots, never wall-clock time; F28 creates no season
- Salary is integer dollars under versioned simplified rules, with no cap enforcement
- Compatibility absence is a warning before initialization and a readiness blocker afterward; initialization and expiration require backups
- Contract operations do not mutate Player truth, development, provenance, scouting, archives, or lineups and create no trades/transfers

### 2026-07-15 — F27 NHL Draft (Significant)

- Draft eligibility uses an explicit `cutoffDate` (never wall clock); age is measured against it; eligibility never consults true ability or potential
- Draft order and lottery are deterministic for the same frozen inputs, config version, and seed; order freezes when the DraftEvent starts (no reordering after IN_PROGRESS)
- A prospect may be drafted at most once in one DraftEvent; pick numbers are unique within the event; one completed pick selects at most one player
- Auto-pick uses **only that team's scouting estimates** (estimated CA/potential/confidence/projected role/risk + watchlist priority + a deterministic player-id fallback) — never true potential, hidden attributes, or F25 quality tier; unknown unscouted prospects get a bounded fallback value and the highest risk but remain manually selectable
- Draft creates **draft rights, not contracts**: one ACTIVE `PlayerDraftRight` per completed pick; the drafted Player remains `PROSPECT`, unsigned, and `currentTeamId = null`; no contract row is created
- F27 does **not** trade picks (currentTeamId == originalTeamId), assign drafted players to a club roster, modify lineups, or create the next WorldSeason
- Team draft boards are **team-private**: the `/drafts/:id/teams/:teamId/board` endpoint returns only that club's F26 estimates; another club's private board, observations, and watchlist are not readable; normal APIs never expose true potential/CA/role/quality tier
- Commissioner-only diagnostics reveal the order/lottery/result hashes and team-entry positions behind the header gate
- Completed DraftEvents are immutable and carry a deterministic result hash; a pre-start SQLite safety backup is required before the first pick (not before every pick)
- Draft never mutates Player truth, F25 provenance, F24 development, F26 scouting reports, club lineups, NT snapshots, or F20 archives

### 2026-07-15 — F26 Scouting (Significant)

- Scouting returns **estimates only**: noisy current-ability/potential/attribute ranges with bounded confidence — never true hidden values — on normal/public APIs
- One current report per Team/Player; prior report versions are append-only and immutable; reports become stale when Player state (F24 development, Commissioner attribute edits) changes and are refreshed by rescouting under the new state hash
- Confidence is bounded 0–1 (Unknown/Low/Medium/High/Very High), increases with repeated observations under diminishing returns, gets a cross-scout diversity bonus, and potential stays harder to estimate than current ability
- Suggested rankings use only estimated CA/potential/confidence + explicit watchlist priority — never true potential, hidden attributes, or F25 quality tier
- Scouting data is **team-private**: reports, observations, watchlist notes, and manual rankings belong to one club Team and are not readable by another club
- Commissioner-only diagnostics reveal the true-vs-estimate comparison (exact potential, CA, role, state hash) behind the Commissioner header gate; normal routes never carry those fields
- Scouts and ScoutingDepartments are Commissioner-managed (never auto-generated); completed observations freeze Scout snapshots and active calibration versions
- Scouting never mutates Player truth, F25 provenance, F24 development, club lineups, NT snapshots, or competition archives; no draft records are created
- Public F25 youth provenance redacts true `currentAbility`/`developmentRate`/`role` for players still in PROSPECT status; Commissioner provenance keeps the full snapshot (the F25 public/Commissioner split is preserved, not recombined)

### 2026-07-13 — F25 Youth Generation (Significant)

- Youth generation uses an explicit `referenceDate` (never wall clock); ages exactly 15–17
- One completed official youth-generation run per WorldSeason; preview never writes; publication is atomic
- Generated players are `PROSPECT` + `GENERATED_YOUTH` with `currentTeamId = null`
- Current ability and role are derived via F5 after attribute generation; potential is generated separately and not auto-grown
- Country youth profiles and fictional name pools are versioned and immutable per run
- Completed generation provenance (`YouthGeneratedPlayer`) is immutable even if F6 later edits the live Player
- F25 creates no scouting estimates, draft eligibility, club assignment, or next WorldSeason

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
- Completed tournaments immutable; templates are simplified formats — not claimed IIHF/IOC replicas

---

## 7. Quick Reference

| Item | Value |
|---|---|
| Dataset schemaVersion | 5 (unchanged) |
| Migration | `20260716030000_f28_contracts` |
| Verifier | `npm run verify:contracts` |
| Default config | Contracts Simplified Default (integer dollars; no cap) |
| UI | `/contracts`, `/contracts/:contractId`, `/teams/:teamId/contracts`, `/free-agency` |
| Next | F29 |
