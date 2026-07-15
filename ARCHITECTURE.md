# Franchise Hockey Manager — Architecture

**Status:** Active
**Last updated:** 2026-07-15
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`

> Technical source of truth for stack, monorepo structure, data flow, and config-driven balance.
> For game behavior, see `PRODUCT_RULES.md` and `PLAYER_MODEL.md`. For status, see `CURRENT_STATUS.md`.

F10 adds versioned balance presets (`BalancePreset` / immutable `BalancePresetVersion` / singleton `ActiveBalanceConfiguration`). Repository Standard defaults are composed in `packages/engine/src/balance` (**schemaVersion 5** includes active F14 `matchCompletion` + F13 `match` + `shots` + `goalies` + `penalties` sections; older versions remain immutable). Chemistry and simulation load the active immutable snapshot. F5 player derivation still uses static JSON imports.

**F11** adds a pure match engine in `packages/engine/src/simulation/match/`: deterministic regulation progression (periods → shifts → possessions → events), seeded Mulberry32 RNG, immutable simulation input, pause/resume snapshots, and trace hashing.

**F12** extends the engine with offensive-zone shot opportunities, shot resolution, assists from pass chains, event-derived statistics, reconciliation, and pending-shot pause/resume.

**F13** extends the engine to `f13.1` / `F13_SPECIAL_TEAMS`: one-at-a-time two-minute minors, 5v4 power plays / penalty kills, automatic temporary special-team units, penalty clocks with period carryover, PP-goal cancellation, and PP/PK/PIM statistics. Server read-only debug endpoints under `/api/simulation/debug/*` return strength/penalty diagnostics. (F16 reuses `/simulation-lab` for Batch Lab + Single Match Debug.)

**F14** extends the engine to `f14.1` / `F14_PLAYABLE_MATCH`: `simulateCompleteMatch()` runs regulation then optional 3v3 OT (no OT penalties) and shootout. Server persists `Match`, `MatchResult`, `MatchEvent`, `PlayerGameStat`, and `TeamGameStat` atomically via `/api/matches/*`. Commissioner resimulation at `/api/commissioner/matches/:id/resimulate` reuses stored immutable input with a new seed and supersedes the prior result. Client `/matches` is the first persistent match UI.

**F15** adds match-viewer read models (no engine formula changes, no Prisma migration): `GET /api/matches/:id/overview` (period scores derived from GOAL events, scoring/shootout summaries, stats, line usage), public event feed filters (`format=view`), CSV/JSON exports, and Commissioner diagnostics/technical events/attempt inspection. Historical display uses immutable simulation-input snapshots. Polished Match Detail tabs separate public viewing from diagnostics.

**F16** adds Simulation Lab batch analysis in `packages/engine/src/simulation/batch/` (seeds, aggregates, anomalies, comparison, batch hash) and an in-memory server run registry under `/api/simulation-lab/*`. Batches of 1/10/100/1000 unpersisted F14 games; ALTERNATE/FIXED side modes; optional paired balance-version comparison; no official Match persistence. Client `/simulation-lab` is tabbed: Batch Lab + Single Match Debug.

**F17** adds the universal competition framework: engine rules/lifecycle/readiness in `packages/engine/src/competitions/`, Prisma participants/stages/rules snapshots, Commissioner preparation APIs, and `/competitions/:id/editions/:editionId`. Edition activation is structural only.

**F18** adds DETAILED regular-season execution: pure schedule/standings modules under `packages/engine/src/competitions/regular-season/`, persisted COMPETITION Match schedules, full-stage simulation via F14, provisional/final standings and season-stat snapshots, qualification preview for F19, and interim SQLite pre-run backups.

**F19** adds BEST_OF_SERIES playoffs: qualifier import from final F18 snapshots, deterministic brackets (FIXED / RESEED), PlayoffSeries + lazy F14 games, series progression to champion, and CompetitionEdition completion readiness (no auto-archive).

**F20** adds immutable competition archives: dedicated archive tables (participants/stages/standings/stats/match summaries/series/awards), deterministic source + archive hashes, bounded awards, history APIs/pages, and ARCHIVED edition/match write locks. Live Match rows are retained; archives do not duplicate event feeds.

F9 chemistry remains derived on read and now consumes the active preset chemistry section (with preset/version/hash metadata). Familiarity is still stubbed at 0.

---

## 1. Stack

| Layer | Technology | Why |
|---|---|---|
| Language | TypeScript everywhere | one language across engine/server/client |
| Backend | Node.js + Fastify | small, fast REST API server |
| ORM / DB | Prisma + SQLite (local) | zero-config locally; later Postgres via Prisma |
| Frontend | React + Vite + TypeScript | fast dev loop |
| Styling | Tailwind CSS + Atlas design tokens | utilities + approved visual language |
| Icons | `lucide-react` | matches Atlas (Lucide) without CDN coupling |
| Simulation logic | Plain TypeScript in `packages/engine` | testable; no Fastify/Prisma/React |
| Server tests | Vitest + temp SQLite | schema/API/migration/setup checks (F2+) |
| Validation | Zod (engine balance + server requests) | F3 datasets; F10 balance schema; commissioner payloads |
There is **no backend-less/client-only mode** — client-server from day one (see §7).

---

## 2. Monorepo Structure

```text
franchise-hockey-manager/
├── packages/
│   ├── engine/                  # pure TS — players, lineups, chemistry, balance, match, batch
│   │   ├── src/chemistry/       # F9 role/personality/coach/tactical fit + EP
│   │   ├── src/balance/         # F10 schema, Standard defaults, canonicalize
│   │   └── src/simulation/      # F11–F14 match engine; F16 batch analysis (no DB)
│   ├── server/                  # Fastify + Prisma + SQLite
│   │   ├── src/
│   │   │   ├── app.ts           # Fastify factory (tests + runtime)
│   │   │   ├── initialization/  # F3 load → validate → persist (+ balance bootstrap)
│   │   │   ├── routes/          # /health, /api/*, /api/balance/*, /api/setup/*
│   │   │   ├── services/        # readers + balance-config + chemistry mapping
│   │   │   ├── mappers.ts       # Prisma → JSON DTOs
│   │   │   └── db/client.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma    # AppMeta + domain + balance presets (F10)
│   │   │   └── migrations/
│   │   └── tests/               # Vitest: migrations, schema, API, setup
│   └── client/                  # React; Team Lines chemistry; Settings Game Balance
├── design/                      # Atlas references (not runtime)
├── data/
│   ├── world/                   # intended owner-prepared production snapshot
│   └── fixtures/f3-minimal-world/  # fictional default fixture
└── package.json
```

Rules:

- `packages/engine` must never import from server/client and must not import Prisma types.
- Only `packages/server` accesses the database **and** local dataset files.
- `packages/client` talks to the server over HTTP only (no direct filesystem reads).
- Do not edit `design/**` unless technically unavoidable.

---

## 3. Data Flow

```text
Client (React shell — Setup World in F3; browsers in F4)
   │  HTTP  GET /health, GET /api/..., GET|POST /api/setup/*
   ▼
Server (Fastify)
   │  thin routes → services / initialization pipeline → Prisma
   │  dataset files read only by server (FHM_DATASET_DIR)
   │  DTO mappers at the API boundary
   ▼
Engine (pure TS)                 SQLite (via Prisma)
```

---

## 4. Config-Driven Balance

Repository defaults live under `packages/engine/src/config/*.json` and are composed into the Standard balance preset by `getStandardBalanceConfig()` (`schemaVersion: 1`).

F10 persistence:

- `BalancePreset` / immutable `BalancePresetVersion` / singleton `ActiveBalanceConfiguration`
- edits create new versions; never mutate prior `configJson`
- SHA-256 of canonical JSON identifies identical configs
- `npm run balance:bootstrap` is idempotent for existing worlds

Runtime systems:

- **F9 chemistry** loads the active preset chemistry section (server → engine config injection)
- **F5 player derivation** still uses static JSON imports (documented deferral)

Future match simulation must receive one immutable snapshot + explicit runtime overrides — never a mutable global.

---

## 5. Data Model (F2)

Prisma source of truth: `packages/server/prisma/schema.prisma`.

### Identity & timestamps

- Domain IDs: `String @id @default(cuid())`
- Mutable records: `createdAt` + `updatedAt`
- `AppMeta` retained from F1 (`id = "default"`) plus F3 init fields: `worldInitialized`, `worldDatasetId`, `worldInitializedAt`, `worldSchemaVersion`

### Age representation (Player)

**Decision:** store `dateOfBirth` as `DateTime` (date portion meaningful). Age is **not** persisted; derive later relative to world/competition date (F3+). Avoided `birthYear`-only so future calendar-accurate age stays possible.

### Entities (high level)

| Entity | Role |
|---|---|
| **AppMeta** | Bootstrap + one-time world initialization metadata |
| **WorldSeason** | Global season of the single living world (`label`, years, `phase`, `status`) |
| **Country** | Shared geography/nationality source (`name`, unique `code`) |
| **League** | Competition-organizing league (`simulationLevel` DETAILED/AGGREGATED) |
| **Team** | CLUB or NATIONAL; optional `leagueId` for nationals |
| **Player** | Structural identity only (no attributes/ratings) |
| **Coach** | Head coach styles; optional assignment |
| **Competition** | Competition definition (`type`, optional simulation level) |
| **CompetitionEdition** | Competition instance within a WorldSeason |

Imported snapshot entities (Country, League, Team, Player, Coach, Competition) carry optional `externalId`, `sourceDataset`, `sourceUpdatedAt` with `@@unique([sourceDataset, externalId])`. CompetitionEdition uses local competition + WorldSeason links (no external ID required). Balance presets are F10 (`BalancePreset` / `BalancePresetVersion` / `ActiveBalanceConfiguration`).

### Key relationships

- Country → Leagues, Teams, Players (nationality), Coaches (nationality)
- League → Teams
- Team → Players; Team → current Coach (0..1)
- Competition → CompetitionEditions
- WorldSeason → CompetitionEditions

### Uniqueness / indexes (selected)

- `Country.code`, `Country.name` unique
- `WorldSeason.label` unique
- `League`: unique `(countryId, name)`
- `Team`: unique `(leagueId, name)`
- `Coach.currentTeamId` unique (at most one current head coach per team; many unassigned coaches with null)
- `CompetitionEdition`: unique `(competitionId, worldSeasonId)`
- FK indexes on nationality/team/league/edition foreign keys used by list/detail

Service-level invariant (not a DB CHECK): `WorldSeason.startYear` should precede `endYear` — enforced in tests/docs; SQLite/Prisma CHECK avoided for brittleness.

### Referential actions

| Relation | onDelete | Rationale |
|---|---|---|
| Team/League/Player/Coach → Country | **Restrict** | Do not silently erase geography roots |
| Team → League | **Restrict** | Prevent orphaning clubs by deleting leagues casually |
| Player.currentTeamId → Team | **SetNull** | Free agents / unassigned prospects survive team removal |
| Coach.currentTeamId → Team | **SetNull** | Coach can be unassigned |
| CompetitionEdition → Competition / WorldSeason | **Restrict** | Preserve historical edition linkage |

No application-level delete APIs in F2.

### Migrations

1. `f1_bootstrap` — AppMeta
2. `f2_core_domain` — eight foundational entities + enums
3. `f3_source_metadata_and_init` — source metadata columns + AppMeta init fields

Commands (from repo root):

```powershell
npm run db:generate
npm run db:migrate
npm run db:validate
npm run setup:preview
npm run test:server
```

Do not commit `*.db` files.

---

## 6. Server read API (F2) + Setup API (F3)

Entity-specific services under `packages/server/src/services/*`; thin list/detail registration.

Envelope:

- Simple lists (countries, leagues, coaches, world-seasons, editions): `{ "items": [...] }`
- Paginated browsers (teams, players, competitions): `{ items, page, pageSize, total, totalPages }`
- Detail: `{ "item": {...} }`
- Missing: `404` `{ "error": "NotFound", "message": "..." }`
- Bad query: `400` `{ "error": "BadRequest", "message": "..." }`

Routes:

- `GET /api/world` — F4 world dashboard summary (counts, structure, warnings, editions, next action)
- `GET /api/world-seasons` · `GET /api/world-seasons/:id`
- `GET /api/countries` · `GET /api/countries/:id`
- `GET /api/leagues` · `GET /api/leagues/:id`
- `GET /api/teams` · `GET /api/teams/:id` — search/filter/sort/pagination; detail includes roster
- `GET /api/players` · `GET /api/players/:id` — search/filter/sort/pagination; derived age; F5 compact/list model fields; detail includes `playerModel` (derived ratings/role; no hidden potential)
- `GET /api/coaches` · `GET /api/coaches/:id`
- `GET /api/competitions` · `GET /api/competitions/:id` — search/filter/sort/pagination; editions on detail
- `GET /api/competition-editions` · `GET /api/competition-editions/:id`

**Age derivation (F4):** years of age as of **1 July of the active WorldSeason.startYear** (`july1_of_world_season_start_year`). Not wall-clock. If no season, age fields are omitted/null.

**Player model (F5):** Prisma stores attributes + development profile. Server maps rows into `@fhm/engine` `derivePlayerModel()` for ratings/roles. Public APIs never expose `potentialFloor`, `potentialCeiling`, or `developmentRisk`. Filtering/sorting by derived role/CA is deferred (pagination stays DB-backed).

### Commissioner Mode (F6)

Local administrative sandbox (not authentication):

- Client mode is runtime-only, defaults **off** on every load; enable requires confirmation; persistent banner while active.
- Write/detail/audit routes under `/api/commissioner/*` require header `X-FHM-Commissioner-Mode: enabled`.
- Optional server gate `FHM_COMMISSIONER_WRITES_ENABLED` (default enabled in local dev; set `false` to disable).
- `PATCH /api/commissioner/players/:id` accepts a **full editable snapshot** (identity, profile including hidden potential, position-specific attributes) plus `expectedUpdatedAt` and `reason`.
- Server validates, persists transactionally, derives ratings/role via engine, appends `CommissionerAuditLog`.
- Ordinary `GET /api/players/:id` remains public-safe (no hidden potential, no audit).

Pagination defaults: `page=1`, `pageSize=25`, max `pageSize=100`. Sort fields are allowlisted per entity.

### Setup World (F3)

Pipeline: locate dataset → load manifest/files → parse (Zod) → validate structure + cross-refs → preview → empty-world gate → single transaction persist → AppMeta init flags.

Dataset path: default `data/fixtures/f3-minimal-world` (repo-relative); override with `FHM_DATASET_DIR`. **Import contract is schemaVersion 2** (complete player model). schemaVersion 1 is rejected with an explicit migration message. Client never sends entity payloads or filesystem paths.

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/setup/status` | initialized / canInitialize / counts / dataset summary |
| GET | `/api/setup/preview` | validation report; **no writes** |
| POST | `/api/setup/initialize` | atomic init; `409` already initialized / not empty; `422` validation |

Empty-world rule: allow only when `AppMeta.worldInitialized` is false **and** all domain tables are empty. AppMeta-only F1 rows do not block. Duplicate init is idempotent at the API boundary (no duplicate rows). No destructive reset in F3.

---

## 7. Client application shell

F3: `/setup` is the functional Setup World page.

F4 browsers (URL query state for list filters):

- `/world` — World Dashboard
- `/teams`, `/teams/:teamId`
- `/players`, `/players/:playerId`
- `/competitions`, `/competitions/:competitionId`

Vite proxies `/health` and `/api` to `127.0.0.1:3000`. No client Prisma. F5 Player Profile shows attributes, ratings, role, preferences, and public potential estimate. F6 adds `/players/:playerId/edit` and Commissioner Mode controls under Settings.

F16: `/simulation-lab` — Batch Lab (default) for unpersisted aggregate analysis; Single Match Debug tab preserves F13 technical simulation. Lab runs are in-memory only (lost on server restart).

F17: `/competitions/:competitionId/editions/:editionId` — structural competition preparation (participants, stages, rules, readiness, lifecycle).

F18: same edition page enables Schedule & Results, Standings, and Statistics for `REGULAR_SEASON` stages.

F19: Playoffs tab for `BEST_OF_SERIES` — qualifier import, bracket, series simulation, champion display. Awards/archive remain future.

---

## 7b. Simulation Lab (F16)

Pure engine (`packages/engine/src/simulation/batch/`):

- Seed derivation: `` `${baseSeed}:game:${index}` ``
- Side modes: `FIXED` | `ALTERNATE` (results normalized Team A / Team B)
- Aggregate reduction, anomalies, paired comparison, batch hash (browser-safe digest)
- `runLabBatch` — no Prisma

Server:

- `GET /api/simulation-lab/options`
- `POST /api/simulation-lab/runs` → `runId`
- `GET /api/simulation-lab/runs/:runId`
- `DELETE /api/simulation-lab/runs/:runId` (cancel)
- Export query on completed runs
- Gate: `FHM_SIMULATION_LAB_ENABLED`
- Limits: max 1000 games; max 2 concurrent; retain ~20 / 30 min; chunk size 25
- Does not create Match/Result/Event/stat/audit rows; does not activate balance presets

---

## 7c. Competition Framework (F17)

Pure engine (`packages/engine/src/competitions/`):

- Validated competition rules schema (schemaVersion 1) + structural templates
- Stage config validation and dependency graph checks
- Edition lifecycle transitions and structural readiness
- Rules/config hashing uses a browser-safe deterministic digest (same family as Simulation Lab; no node:crypto in engine exports)

Server:

- Extended Competition / CompetitionEdition; CompetitionParticipant; CompetitionStage; StageParticipant
- Nullable `Match.competitionStageId` (stage must belong to edition)
- Public reads under `/api/competitions*`, `/api/competition-editions*`, `/api/competition-stages*`
- Commissioner writes under `/api/commissioner/competitions*` and edition/stage/participant routes
- Dataset **schemaVersion 5**

Client:

- Competition detail + nested edition page tabs (Overview, Participants, Stages, Rules, Readiness, History)
- F18 enables Schedule & Results, Standings, and Statistics for REGULAR_SEASON stages

---

## 7d. Regular Season (F18)

Pure engine (`packages/engine/src/competitions/regular-season/`):

- Deterministic schedule generation (ROUND_ROBIN / DOUBLE_ROUND_ROBIN / BALANCED_CUSTOM)
- Schedule hash from participants + config + seed + normalized matches (no wall-clock)
- Standings from match decisions + edition points/tiebreakers; qualification top-N
- Team/player season aggregation from current game-stat summaries

Server:

- Stage schedule metadata (`scheduleSeed` / `scheduleHash` / `scheduleVersion` / …)
- COMPETITION Match rows carry `scheduleKey`, round/slot/order, `competitionRulesHash`
- Final snapshots: CompetitionStageStanding / TeamStat / PlayerStat
- APIs: schedule preview/generate/regenerate (Commissioner); schedule/progress/standings/stats/qualification/simulate (public)
- Full-stage runs: in-memory progress (F16-like); cancel keeps official completed results
- Pre-run SQLite `VACUUM INTO` backup to `.fhm-backups/` (`FHM_BACKUP_DIR`); blocks simulation if backup fails
- Completed REGULAR_SEASON stage: schedule locked; match resimulation blocked

Client:

- Competition Edition Schedule & Results / Standings / Statistics panels
- Backup confirmation + cancel-continues messaging; playoffs CTA remains F19-disabled

Verifier: `npm run verify:regular-season`

---

## 7e. Playoffs (F19)

Pure engine (`packages/engine/src/competitions/playoffs/`):

- Playoff config (winsRequired, homePattern → normalized hosts, FIXED / RESEED_EACH_ROUND)
- Power-of-two seeding and deterministic bracket hash
- Series progression from current game results; clinch at winsRequired

Server:

- `PlayoffSeries` model; Match `playoffSeriesId` / `playoffGameNumber`
- Stage bracket + champion fields
- Import qualifiers from final F18 standings; preview/generate/regenerate bracket
- Lazy next-game creation; full-playoffs runner with F18-style backup
- Edition completion readiness; Commissioner ACTIVE → COMPLETED gated on champion + completed stages

Client:

- Competition Edition Playoffs tab (bracket columns / stacked cards)

Verifier: `npm run verify:playoffs`

## 7f. Competition Archive & History (F20)

Pure engine (`packages/engine/src/competitions/history/`):
- Normalized archive DTO + deterministic `computeArchiveHash` / `computeSourceSnapshotHash`
- Awards from final archived snapshots (shared ties allowed)
- Historical records derived across current official archives
- `reconcileArchive` before persistence

Persistence:
- `CompetitionArchive` + child archive tables (immutable in normal operation)
- `archiveSchemaVersion = 1` (independent of dataset schemaVersion)
- Pre-archive SQLite backup (F18/F19 utility); atomic transaction; edition COMPLETED → ARCHIVED
- Idempotent retry returns existing current archive

APIs:
- Commissioner `POST /api/commissioner/competition-editions/:id/archive`
- Public `/api/history/*` + edition archive-readiness / archive summary
- ARCHIVED matches reject simulate/resimulate with `CompetitionEditionArchived`

Client: History sidebar entry; archive detail tabs; edition Archive panel.

Verifier: `npm run verify:archive-history`

## 7g. Aggregated League Simulation (F21)

Pure engine (`packages/engine/src/competitions/aggregated/`):
- Versioned `AggregatedSeasonConfig` (schedule format, home advantage, randomness, OT/SO targets, stat-allocation shares)
- Immutable team-strength snapshots from roster ability (no hidden potential)
- Deterministic schedule via F18 schedule generator; compact game summaries (no events)
- Team totals → player/goalie season allocation with exact reconciliation
- Hashes: input / config / schedule / result

Persistence:
- `AggregatedSeasonRun` (PREPARED → RUNNING → COMPLETED | FAILED | CANCELLED | SUPERSEDED)
- `AggregatedMatchSummary` (no MatchEvent / PlayerGameStat relation)
- Final rows reuse `CompetitionStageStanding` / TeamStat / PlayerStat with `statsJson` source AGGREGATED
- Pre-simulate SQLite backup; atomic publication after reconciliation

APIs:
- Commissioner preview / prepare / discard / diagnostics
- Public simulate / status / matches / run detail
- Standings/stats endpoints shared with F18 once FINAL snapshots exist

Archive:
- F20 readiness accepts AGGREGATED path (current completed run + stage snapshots; no Match rows required)
- Archive builder emits match summaries from `AggregatedMatchSummary` with `agg:` source ids and `aggregated-f21` engine label
- History UI must treat simulationLevel AGGREGATED as estimate-labeled seasons

Client: Aggregated badge + `AggregatedLeaguePanel` on edition Schedule/Standings/Statistics tabs when competition is AGGREGATED.

Verifier: `npm run verify:aggregated-league`

## 7h. National Teams (F22)

Identity:
- Reuse `Team` with `teamType = NATIONAL`
- `NationalTeamProfile` — unique `(countryId, category)`; categories `SENIOR_MEN`, `JUNIOR_U20`

Edition preparation (`NationalTeamEdition`):
- One per national team per `CompetitionEdition` (international only)
- Status: PLANNED → PREPARING → READY → LOCKED (CANCELLED)
- Snapshots: eligibility/roster rules, team/country names, roster, staff, tactics, lineup hashes

Pure engine (`packages/engine/src/national-teams/`):
- Versioned eligibility schema (primary nationality; U20 explicit cutoff date)
- Candidate ranking, suggested roster, roster validation, readiness, deterministic hashes
- No Prisma; no hidden potential in candidate DTOs

Persistence:
- Candidates, roster players, staff assignments, tactics, lineup + slots (edition-scoped)
- Never mutates `Player.currentTeamId`, club `TeamLineup`, or club tactics

APIs:
- Public GETs for teams/editions/candidates/roster/staff/tactics/lineup/readiness
- Commissioner create/prepare/generate-candidates/suggest/confirm/reopen/staff/tactics/lineup/lock

Client:
- Sidebar National Teams; list/detail tabs; competition-edition National Teams tab; World Dashboard prep notice

Import:
- schemaVersion remains 5; national teams are Commissioner-created (optional future `national-teams.json`)

Verifier: `npm run verify:national-teams`

## 7i. International Tournaments (F23)

Templates (engine, simplified — not exact IIHF/IOC):
- `WORLD_JUNIORS` (JUNIOR_U20)
- `WORLD_CHAMPIONSHIP` / `OLYMPIC_GAMES` (SENIOR_MEN)

Flow:
- Locked F22 NationalTeamEditions required
- Group assignment (SEEDED_SNAKE default) + F18 round-robin per group
- Group standings/qualification → BO1 PlayoffSeries knockout (QF/SF/bronze/final as configured)
- F14 simulation via national-team lineup/tactics/staff snapshots
- `TournamentMedalResult` (GOLD/SILVER/BRONZE); edition COMPLETED → F20 archive-ready

Persistence:
- CompetitionEdition tournament metadata + hashes
- Match.`tournamentGroupKey`
- GROUP_STAGE standings reuse CompetitionStageStanding

APIs: `/api/competition-editions/:id/international/*`, commissioner preview/prepare/generate-schedule

Client: `/international-tournaments`; edition Tournament tab

Verifier: `npm run verify:international-tournaments`

## 7j. Player Development (F24)

Separate from F10 match-balance presets:

- `PlayerDevelopmentPreset` / immutable `PlayerDevelopmentPresetVersion` / `ActivePlayerDevelopmentConfiguration`
- Default bootstrap: **Development Default v1** (idempotent; simplified curves, not NHL-calibrated)

Engine (`packages/engine/src/development/`):
- Explicit `effectiveDate` aging (`dateOfBirth` authoritative; no wall clock)
- Skater vs goalie age curves and attribute groups (attrs remain **1–20**)
- Deterministic budget → allocation → F5 CA recalculation → F5 role derivation → form regression → retirement
- Potential never auto-increased; soft ceiling reduces positive budget near potential
- PRE/POST hashes; reconciliation before publish

Persistence:
- `Player.form` (−10..10 baseline)
- `RosterStatus.RETIRED` (player retained; `currentTeamId` kept in F24)
- `PlayerDevelopmentRun` / `PlayerDevelopmentResult` / `PlayerSeasonSnapshot` (PRE_DEVELOPMENT / POST_DEVELOPMENT)
- One current completed official run per WorldSeason

Workflow:
1. Preview (no writes)
2. Prepare (freeze PRE snapshots + inputHash)
3. Execute (SQLite safety backup → stale-input check → compute → reconcile → atomic publish)

Invariants:
- Club ownership unchanged; club lineups not auto-rewritten; locked NT / F20 archives unchanged
- Completed runs immutable; no ordinary second official run; no completed-run restore UI

APIs: `/api/player-development/*`, `/api/commissioner/player-development/*`, `/api/players/:id/development-history`

Client: `/development`, `/development/runs/:runId`, player Development tab

Verifier: `npm run verify:player-development`

## 7k. Youth Generation (F25)

Versioned country youth profiles (separate from F10 balance and F24 development):

- `YouthGenerationProfileSet` / immutable `YouthGenerationProfileSetVersion` / `ActiveYouthGenerationConfiguration`
- Per-country `CountryYouthProfileVersion` + versioned fictional `CountryNamePool` / `CountryNamePoolVersion`
- Default bootstrap: **Youth Profiles Default v1** for fixture countries NAV + SGL (idempotent; fictional names only)

Engine (`packages/engine/src/youth-generation/`):
- Explicit `referenceDate` ages exactly 15–17 (configurable mix; default emphasizes 17)
- Deterministic name/position/handedness/physical/quality/attribute generation
- F5 CA + role derivation after attributes; potential floor/ceiling generated separately (0–100)
- Development rate within existing 0.1–3 bounds; form starts at 0
- Cohort + run hashes exclude DB IDs/timestamps

Persistence:
- `YouthGenerationRun` / `YouthCohort` / `YouthGeneratedPlayer` provenance
- Live `Player`: `sourceType=GENERATED_YOUTH`, `rosterStatus=PROSPECT`, `currentTeamId=null`
- Height/weight/shoots stored on provenance snapshots only (not Player columns)
- One current completed official run per WorldSeason

Workflow: preview (no writes) → prepare (freeze inputs) → execute (backup + regenerate + reconcile + atomic publish)

Invariants: existing players/lineups/NT/archives unchanged; no scouting/draft/club assignment; completed provenance immutable

APIs: `/api/youth-generation/*`, `/api/commissioner/youth-generation/*`, `/api/players/:id/youth-provenance`

Client: `/youth-generation`, `/youth-generation/runs/:runId`

Verifier: `npm run verify:youth-generation`

## 7l. Scouting (F26)

Pure engine (`packages/engine/src/scouting/`):
- Versioned, strictly-validated `ScoutingConfig` (schemaVersion 1): observation bounds/noise, confidence (duration cap, repeat diminishing, diversity bonus), reporting thresholds
- Deterministic observations: seeded estimate ranges for attributes/current ability/potential, confidence per Scout skill + duration, potential uncertainty wider than current ability, persistent Scout bias + assignment noise, immutable with content hash
- Consolidation: weighted estimate ranges, strengths/weaknesses, consolidated confidence (diversity bonus across Scouts); observations must share one team/player/player-state snapshot
- Estimate-only suggested ranking (CA/potential/confidence + manual priority) — no player-truth parameter
- Staleness via player-state hash; reconciliation validates hashes, bounds, and truth invariance

Persistence:
- `ScoutingPreset` / immutable `ScoutingPresetVersion` / singleton `ActiveScoutingConfiguration` (separate from F10 match balance and F24/F25 presets); default bootstrap **Scouting Default v1** (idempotent, fictional)
- `Scout` (Commissioner-managed, status/source, ratings, specialties, country/position familiarity, persistent bias), `ScoutingDepartment` (one per club), `ScoutingDepartmentScout` (PRIMARY/ASSISTANT)
- `TeamProspectKnowledge` (team+player index), `ScoutingAssignment`/`ScoutingAssignmentScout` (PREPARED/COMPLETED/CANCELLED; frozen target IDs + config version), `ScoutingObservation` (immutable, unique by assignment+scout+player), `TeamScoutingReport` (append-only versions; current = highest version), `TeamProspectWatchlistEntry`

Visibility boundary (highest-priority invariant):
- Normal/public Player list+detail return `SCOUTING_REQUIRED` (Unknown) for **complete** prospects — never true ratings, role, or potential; incomplete legacy prospects still report `INCOMPLETE`
- Team-scoped `/api/teams/:teamId/scouting/*` return only that club's estimates; reports/observations/watchlist/rankings are team-private (another club sees `report: null`, empty observations, no watchlist/ranking entries)
- Commissioner `/api/commissioner/...scouting.../diagnostics` reveal the true-vs-estimate comparison (exact potential, CA, role, state hash) behind the header gate
- Public F25 youth provenance/run-players redact true `currentAbility`/`developmentRate`/`role` for PROSPECTs; Commissioner provenance keeps the full snapshot (split preserved, not recombined)
- Suggested ranking never sees true potential, hidden attributes, or F25 quality tier

Rescout & staleness:
- Reports become stale when the current Player state hash differs from the report's source hash (F24 development, Commissioner attribute edits)
- Executing an assignment consolidates **only** observations matching the newest state hash for each player, so a developed/edited player can be rescouted without mixing incompatible snapshots; old observations remain immutable history; a new report version is appended (manual rank/watchlist survive)

Invariants:
- Scouting never mutates Player truth, F25 provenance, F24 development, club lineups, NT snapshots, or F20 archives; no draft records created
- Completed assignments are immutable (only PREPARED can execute/cancel); observations append-only

APIs: `/api/teams/:teamId/scouting/*` (overview/readiness/assignments/prospects/watchlist/rankings/reports), `/api/commissioner/scouting/*` (scouts/departments/configurations/versions/activate/diagnostics), `/api/commissioner/teams/:teamId/scouting/prospects/:playerId/diagnostics`

Client: `/scouting` landing (club selection required), `/teams/:teamId/scouting` (tabs: Overview, Prospects, Watchlist, Assignments, Rankings, Reports, Department*, Configuration*, Diagnostics* — last three Commissioner-only), `/scouts`, `/scouts/:id`, prospect/assignment detail pages; sidebar Scouting entry

Verifier: `npm run verify:scouting`

## 7m. NHL Draft (F27)

Pure engine (`packages/engine/src/draft/`):
- Strict versioned `DraftConfig` (schemaVersion 1): rounds, eligibility (min/max age, explicit `cutoffDate`, allowed lifecycle/source, require-unsigned, exclude-already-drafted), order (REVERSE_STANDINGS/MANUAL, repeat-or-snake), lottery (enabled/eligibleTeamCount/drawCount/maximumMoveUp/weights), autoPick weights
- Deterministic eligibility from `draftAgeOnCutoffDate` (explicit cutoff — no wall clock); never consults true ability/potential; frozen `DraftEligiblePlayer` snapshots with eligibility hash
- Deterministic multi-round order: reverse standings (worst first) or MANUAL; optional snaking; unique contiguous overall pick numbers
- Bounded deterministic seeded lottery (simplified — not NHL-fidelity): weighted draw among the bottom `eligibleTeamCount`, no repeat winners, `maximumMoveUp` enforced, non-lottery teams retain relative order; deterministic lottery hash
- Frozen team board normalization from F26 scouting DTOs (estimates only); suggested rank (estimate-only score) separate from manual rank; risk derived from confidence/staleness; unscouted prospects get bounded fallback + high risk but remain selectable
- Estimate-only deterministic auto-pick: weighted blend of estimated potential/CA/confidence/projected role minus risk penalty, plus watchlist bonus and a stable player-id fallback for tie-breaks; manual-rank precedence when configured; **no true-value parameter**
- Progression (on-the-clock is state only — no real timer), reconciliation (unique picks/players, one ACTIVE right per completed pick), result hash

Persistence:
- `DraftPreset` / immutable `DraftPresetVersion` / singleton `ActiveDraftConfiguration` (separate from F10/F24/F25/F26 presets); default bootstrap **Amateur Draft Default** (idempotent, fictional, 7 rounds)
- `DraftEvent` (PLANNED → PREPARING → READY → IN_PROGRESS → COMPLETED | CANCELLED), `DraftEligiblePlayer` (AVAILABLE/DRAFTED/WITHDRAWN/INELIGIBLE_AFTER_REVIEW), `DraftTeamEntry` (original/lottery/final order positions), `DraftLotteryDraw`, `DraftPick` (PENDING/ON_THE_CLOCK/COMPLETED/PASSED/CANCELLED; `currentTeamId == originalTeamId`), `PlayerDraftRight` (ACTIVE only in F27), `DraftTeamBoardSnapshot` (frozen at start)
- `DraftPick.selectedPlayerId` → `DraftEligiblePlayer` (not Player); `PlayerDraftRight.draftPickId` unique (one right per pick)

Visibility boundary (highest-priority invariant):
- Team-scoped `/api/drafts/:id/teams/:teamId/board` returns **only that club's F26 estimates** — estimated CA/potential/confidence/risk/watchlist/manual+suggested rank; never true potential, true current ability, role, F25 quality tier, or generation diagnostics
- Another club's private board/observations/watchlist are not readable; team A's board shows Unknown for prospects scouted only by team B
- Commissioner `/api/commissioner/drafts/:id/diagnostics` reveal order/lottery/result hashes and team-entry positions behind the header gate; normal routes never carry those fields
- Public `/api/players/:id/draft-history` and `/api/teams/:id/draft-rights` show season/round/overall/team/rights-status/unsigned only

Pick workflow (atomic transaction):
1. validate DraftEvent IN_PROGRESS + current ON_THE_CLOCK pick
2. validate Player is in eligibility class and AVAILABLE
3. complete DraftPick (selectedPlayerId/name/source/selectedAt)
4. create ACTIVE `PlayerDraftRight` (no contract)
5. mark `DraftEligiblePlayer` DRAFTED
6. advance next pick to ON_THE_CLOCK
7. if no picks or no available prospects remain → `completeDraftInternal` (reconcile + result hash + COMPLETED)
8. audit at pick level; **Player.currentTeamId is never updated; no Contract row is created; no lineup is mutated**

Invariants:
- Draft never mutates Player truth, F25 provenance, F24 development, F26 scouting reports, club lineups, NT snapshots, or F20 archives
- Drafted Player remains `PROSPECT`, unsigned, `currentTeamId = null`; one ACTIVE right per completed pick
- F27 does not trade picks, assign drafted players to a club roster, modify lineups, or create the next WorldSeason
- Completed DraftEvents are immutable (deterministic result hash); pre-start SQLite backup required before the first pick

APIs: `/api/drafts*` (list/status/detail/eligibility/order/picks/lottery/results, `/teams/:teamId/board`, `/teams/:teamId/results`), `/api/players/:id/draft-history`, `/api/teams/:id/draft-rights`, `/api/drafts/:id/picks/:pickId/select|auto-select`; Commissioner `/api/commissioner/drafts*` (create/generate-eligibility/generate-order/run-lottery/mark-ready/start/cancel/picks/:pickId/select/diagnostics) + `/api/commissioner/draft/configurations*`

Client: `/drafts` landing (current-season status + latest selections), `/drafts/:id` (tabs: Overview, Eligible Prospects, Draft Order, Lottery, Draft Room, Results, Team Board, Diagnostics), sidebar Draft entry, World Dashboard draft card; Draft Room shows pick history, on-clock team, team board estimates, manual Select + Auto-Pick + Commissioner Select

Verifier: `npm run verify:draft`

---

## 8. Why Client-Server From Day One

Milestone M8 (public deployment) remains an explicit goal. See `DEPLOYMENT.md`.

---

## 9. Lessons Learned

- Premature gameplay seed conflicted with F1 and was removed.
- Prefer `127.0.0.1` for local API bind/proxy on Windows.
- F2 keeps Prisma types server-local; engine stays Prisma-free.
- F3 imports are one-shot local snapshots — never live sync or browser uploads.
- F4 list filters live in the URL; pagination stays on the server.
- F5 derives ratings/roles in the engine on read; do not duplicate formulas in mappers or UI.
- F6 Commissioner Mode is a local sandbox header gate — not production auth.
- F16 Simulation Lab is analytical and unpersisted; do not confuse Lab aggregates with official Match history.

---

## Guiding Rule

**Keep the engine pure and the server/client thin around it.** Database models and DTOs live in the server; player-model, lineup, chemistry, match, and batch-analysis formulas live in `@fhm/engine`.
