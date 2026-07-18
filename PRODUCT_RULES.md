# Franchise Hockey Manager — Product Rules

**Status:** Active
**Last updated:** 2026-07-18 (F33)
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`

> This document defines game-design invariants: rules that must remain true across the generator, the chemistry/tactics engine, and the season simulation.
> These are not implementation suggestions — they are behavioral constraints that future features must respect unless the owner explicitly changes them.
> For the detailed player attribute/growth model this document builds on, see `PLAYER_MODEL.md`.

F8 main lineups use exact primary/secondary position slot fits only. Auto-lineup is deterministic from eligibility, position fit, current ability, and limited role tie-breaks — not chemistry. Partial lineup saves are allowed; invalid assignments are retained and surfaced until corrected. READY readiness requires a complete valid 20-slot lineup in addition to F7 structural checks.

---

## 1. General Rule

When game behavior is ambiguous or under-specified:

1. keep the current milestone's mechanics as simple as possible;
2. never resolve ambiguity in a way that makes overall attribute the dominant driver of performance (see §2) — when in doubt, favor the interpretation that preserves non-linearity;
3. don't silently add complexity (advanced cap mechanics, AI GM personalities, multiplayer) that hasn't been explicitly requested yet;
4. keep generated data internally consistent (e.g. a goalie should never receive skater-only fields like a forward/defenseman role).

---

## 2. Non-Linear Performance (Core Design Rule)

This is the rule the entire project is organized around.

- A player's **overall / current-ability rating alone must never be sufficient to predict their in-game production.** Compact derived ratings (including current ability) are display and lineup-support values; later simulation must remain based on concrete attributes plus contextual modifiers (chemistry, tactics fit, form, etc.).
- A high-rated player on a poorly-fitting line, under a mismatched coach, should be able to underperform a lower-rated player who fits well — this must be empirically true of the simulation output, not just true "in spirit."
- Any simulation change that collapses production back to a monotonic function of overall rating alone is a regression against this rule, regardless of how it's framed ("simplification," "temporary," "just for testing").

---

## 3. Chemistry & Tactics Fit Rules

F9 implements the first foundation layer in `packages/engine/src/chemistry` with versioned JSON under `packages/engine/src/config/` (`chemistry-weights.json`, `role-compatibility.json`, `personality-compatibility.json`, `coach-fit.json`, `tactical-fit.json`; config version `f9-v1`).

F10: the active balance preset chemistry section is the runtime source for Team Lines / chemistry APIs. Repository JSON remains the Standard default and bootstrap source. Changing an active preset does not rewrite historical `BalancePresetVersion` rows.

F11–F13: regulation simulation is pure engine code — no Prisma/Fastify/React inside `packages/engine/src/simulation`. Same immutable input + active balance snapshot + seed must reproduce identical event traces, score, penalties, and statistics. Zone is relative to the possession team. Snapshots must match engine version, input fingerprint, balance hash, and seed on resume. Older engine snapshots cannot silently restore as newer engine state.

F12 scoring invariants:

- Final regulation score is the count of emitted **GOAL** events only — never choose a final score first.
- Every **SHOT** resolves exactly once to SHOT_BLOCKED, SHOT_MISSED, SAVE, or GOAL.
- Blocked and missed shots are not shots on goal; every on-target non-goal is a SAVE.
- Team/player goals, shots on goal, saves, and goals against must reconcile (see engine `reconcileStatistics`).
- Primary/secondary assists derive from the actual offensive pass chain (0–2); scorer cannot assist their own goal.
- F9 effective performance is applied once via unit context — not double-counted in shot resolution.
- Outcome probabilities are config-driven from balance `shots` / `goalies` sections.
- F12 remains regulation EVEN_5V5 only; no penalty/special-team events until F13.

F13 special-teams invariants:

- Supported strength states only: EVEN_5V5, HOME_POWER_PLAY_5V4, AWAY_POWER_PLAY_5V4.
- At most one active minor penalty; coincidental / 5v3 / 4v4 unsupported.
- Every power-play opportunity derives from one opponent PENALTY event.
- A power-play goal ends the active minor immediately; short-handed and even-strength goals do not.
- The penalized player cannot appear on ice while serving; short-handed team fields four skaters.
- Penalty clocks use game time (period-aware); full two PIM assessed even if ended by PP goal.
- PP/PK/PIM statistics derive from events and must reconcile.
- Temporary PP/PK units are automatic and non-persistent.

F14 playable-match invariants:

- Completed match results derive only from the deterministic event engine (`simulateCompleteMatch`).
- Final score equals regulation/overtime GOAL events; shootout winner is separate (no fake GOAL event for SO winner).
- Shootout goals/attempts are tracked separately — no skater goal/point or goalie SOG/save credit from shootout.
- Persisted statistics must reconcile with event-derived reducers before commit.
- A match has at most one current result; normal completed results are immutable (no duplicate simulation).
- Commissioner resimulation creates a new attempt, supersedes the prior result, and preserves full history + audit.
- F14 ad hoc matches do not update standings or competition progression (F17 connects schedules later; F18 competition matches update standings from current results).
- Overtime: even 3v3, sudden death, no penalties generated during OT in F14; regulation-ending penalties resolved per F13 stats rules.
- Engine remains Prisma-free; server owns immutable input construction and atomic persistence.

F15 match-viewer invariants:

- Official displayed score and statistics come from persisted F14 rows/events only — the client does not recompute official results.
- Public event feed hides technical noise (shifts/possessions/zone transitions) by default.
- Historical match presentation prefers immutable simulation-input snapshots for team/player names and lineup context.
- Superseded result attempts remain inspectable and clearly labeled; normal mode cannot alter results.
- Commissioner diagnostics may expose technical detail and immutable input summaries but not hidden potential or secrets.

F16 Simulation Lab invariants:

- Lab runs are unpersisted analytical batches — they must not create Match/MatchResult/MatchEvent/game-stat rows or mutate world/balance state.
- Official match history is unaffected by Lab runs.
- Paired balance comparison uses identical derived seed sequences for both versions.
- Anomaly thresholds are development guardrails, not NHL realism claims.
- Same Lab input (teams, seed, count, side mode, balance versions, runtime overrides) must reproduce the same batch hash and aggregates.

F17 Competition Framework invariants:

- Competition is the reusable definition; CompetitionEdition is one WorldSeason instance.
- Edition rules snapshots become immutable once READY or ACTIVE (edit requires reverting to PREPARING).
- Stage behavior is determined by stage type + validated config — not hardcoded NHL UI rules.
- Stage participants must belong to the same edition's participants.
- ACTIVE structure is locked in F17; activation does not create schedules, standings, or matches (F18 schedule generation is a separate Commissioner action).
- Historical completed editions must not be rewritten silently; participant team name snapshots are stable.

F18 Regular Season invariants:

- Every regular-season match belongs to exactly one CompetitionEdition and one CompetitionStage.
- Standings and season statistics derive only from current completed MatchResults (superseded attempts excluded).
- Schedule generation is deterministic for the same participants, rules/config, and seed; regeneration is blocked after any current result exists.
- Full-stage simulation never simulates one match twice; cancellation preserves official completed results and continuation runs only remaining matches.
- Stage COMPLETED requires all scheduled matches completed plus aggregate reconciliation; final standings/stat snapshots are immutable in normal mode.
- Completed-stage match resimulation is blocked in F18.
- Qualification output is structural input for F19 only — F18 does not generate playoffs.
- Pre-run SQLite safety backup is required before the first full-stage match simulation (interim; not F32 restore UI).

F19 Playoff invariants:

- Playoff participants come from completed-source final qualification snapshots (not provisional standings).
- Bracket generation is deterministic; regeneration is blocked after the first playoff result.
- Series end when one participant reaches winsRequired; no post-clinch games count.
- Winners advance exactly once; champion is persisted on the playoff stage and immutable after completion.
- Playoff-linked match resimulation is blocked once a later game, completed series, or completed stage exists.
- CompetitionEdition is not archived automatically; COMPLETED requires readiness (all required stages done + champion).

F20 Archive & History invariants:

- Only COMPLETED CompetitionEditions may be archived; archiving is explicit and Commissioner-gated.
- Archive creation is atomic and idempotent; pre-archive SQLite backup is required.
- Archive data is immutable in normal operation; one current official archive per edition.
- Archived names/statistics come from snapshots, never mutable live Team/Player display fields.
- Superseded MatchResults never count; archive references official Matches without duplicating event feeds.
- Awards derive from archived statistics; records derive only from current official archives.
- ARCHIVED editions and their matches cannot be simulated, resimulated, or structurally edited.
- Archive corrections create a new version / supersession — never mutate archive contents in place.
- F20 does not create a new WorldSeason or simulate matches.
- AGGREGATED archives are allowed without Match/MatchEvent rows when AggregatedSeasonRun + stage snapshots reconcile.

F21 Aggregated League invariants:

- AGGREGATED competitions never use the detailed F14 event engine.
- No MatchEvent rows are created for aggregated seasons.
- Official aggregate results publish only after reconciliation; failed/cancelled runs never count.
- Final team/player/goalie stats are deterministic aggregate estimates (not event-derived).
- Completed aggregate stages are locked; completed editions archive through F20 with AGGREGATED labeling.
- No promotion/relegation or cross-league movement in F21.

F22 National Team invariants:

- National-team selection never changes club ownership.
- Roster membership is CompetitionEdition-specific.
- Only eligible players may be selected; suggested rosters contain only eligible players.
- One player may represent one national team per CompetitionEdition.
- Confirmed/locked rosters use snapshots; later renames/transfers do not rewrite them.
- National tactics and lineups are independent from clubs.
- Locked tournament rosters are immutable.
- F22 does not create or simulate tournament matches.
- Normal mode is read-only; every structural write is audited.

F23 International Tournament invariants:

- International matches use locked F22 national-team snapshots.
- WJC eligibility uses stored cutoff rules (no wall-clock re-evaluation).
- Group qualification derives from current MatchResults only.
- Tournament schedule/bracket lock after results begin.
- Gold/silver/bronze derive from completed knockout games and must be distinct.
- Club ownership and club lineups remain unchanged.
- Completed tournaments are immutable; F23 does not create future tournaments or alter development.

F24 Player Development invariants:

- Development uses an explicit `effectiveDate` (never the wall clock) to derive age from `dateOfBirth`.
- Official development runs are deterministic for the same frozen inputs, config version, seed, and effective date.
- Preview never writes; preparation freezes PRE snapshots; publication is atomic (no partial player updates).
- One completed official development run per WorldSeason; completed runs are immutable.
- Potential does not automatically increase; current ability and role are derived after attribute changes via F5 rules.
- Retirement never deletes the player; F24 keeps `currentTeamId` and excludes RETIRED from lineup eligibility.
- Club ownership, club lineups, locked national-team snapshots, and F20 archives remain unchanged.
- F24 creates no new players and does not create or advance a WorldSeason.

F25 Youth Generation invariants:

- Youth generation uses an explicit `referenceDate` (never the wall clock).
- Official youth-generation runs are deterministic for the same frozen inputs, profile/name-pool versions, and seed.
- One completed official youth-generation run per WorldSeason; preview never writes; publication is atomic.
- Generated players are aged 15–17 on the reference date and use valid position-specific F5 models.
- Generated players start as `PROSPECT` with source `GENERATED_YOUTH` and no club ownership.
- Current ability and role are derived after attribute generation; potential is generated but not grown in F25.
- Completed generation provenance is immutable; F6 edits may change live Player values without rewriting provenance.
- F25 creates no scouting estimates, draft eligibility, club assignment, or next WorldSeason.

F26 Scouting invariants:

- Normal/public APIs never expose true prospect values (exact potential, current ability, development rate, hidden attributes, F25 quality tier, generation diagnostics, exact estimate error). Public Player list/detail return `SCOUTING_REQUIRED` (Unknown) for complete prospects — never zero, never a fallback to truth.
- Team-scoped scouting APIs return only that club's estimates: reports, observations, watchlist notes, and manual rankings belong to one club Team and are not readable by another club.
- Scouting observations are deterministic for the same frozen Scout snapshot, player state, active calibration version, assignment seed/dates, and config. Observations are immutable; completed assignments are immutable.
- Confidence is bounded 0–1 (Unknown/Low/Medium/High/Very High): repeated observations increase it under diminishing returns; different Scouts add a diversity bonus; potential remains harder to estimate than current ability; confidence does not normally reach perfect certainty.
- One current report per Team/Player; prior report versions are append-only and immutable. A report becomes stale when the Player state hash changes (F24 development, Commissioner attribute edits) and is refreshed by rescouting under the new state hash (old observations remain immutable history; manual rank/watchlist survive).
- Suggested rankings use only estimated CA/potential/confidence/risk plus explicit watchlist priority — never true potential, hidden attributes, or F25 quality tier. Manual and suggested rankings remain separate.
- Commissioner-only diagnostics may reveal the true-vs-estimate comparison (exact potential, CA, role, Scout bias/noise, hashes) behind the header gate; the public/Commissioner F25 provenance split is preserved, not recombined.
- Public F25 youth provenance/run-players redact true `currentAbility`/`developmentRate`/`role` for players still in PROSPECT status; Commissioner provenance keeps the full snapshot.
- Scouting never mutates Player truth, F25 provenance, F24 development, club lineups, NT snapshots, or F20 archives; no draft records are created.
- Scouts and ScoutingDepartments are Commissioner-managed (never auto-generated by bootstrap); no Scout salaries, contracts, travel, or budgets in F26.

F27 NHL Draft invariants:

- Draft eligibility uses an explicit `cutoffDate` (never the wall clock); age is measured against it; eligibility never consults true ability or potential.
- Draft order and the lottery are deterministic for the same frozen inputs, active config version, and base seed; the order freezes when the DraftEvent starts and ordinary execution cannot reorder picks afterward.
- A prospect may be drafted at most once in one DraftEvent; pick numbers are unique within the event; one completed pick selects at most one Player; round/overall order is deterministic.
- Auto-pick uses **only that Team's scouting estimates** (estimated CA/potential/confidence/projected role/risk + watchlist priority + a deterministic player-id fallback) — never true potential, hidden attributes, or F25 quality tier. Unscouted prospects get a bounded fallback value and the highest risk but remain manually selectable.
- Draft creates **draft rights, not contracts**: one ACTIVE `PlayerDraftRight` per completed pick; the drafted Player remains `PROSPECT`, unsigned, and `currentTeamId = null`; no contract row is created.
- F27 does not trade picks (`currentTeamId == originalTeamId`), assign drafted players to a club roster, modify lineups, or create the next WorldSeason.
- Team draft boards are team-private: `/drafts/:id/teams/:teamId/board` returns only that club's F26 estimates; another club's private board/observations/watchlist are not readable; normal APIs never expose true potential/current ability/role/quality tier.
- Commissioner-only diagnostics may reveal order/lottery/result hashes and team-entry positions behind the header gate; normal routes never carry those fields.
- Completed DraftEvents are immutable and carry a deterministic result hash; a pre-start SQLite safety backup is required before the first pick (not before every pick).
- Draft never mutates Player truth, F25 provenance, F24 development, F26 scouting reports, club lineups, NT snapshots, or F20 archives.

Invariants in force:

- **Line/pairing synergy**: role compatibility is config-driven. Complementary roles can beat redundant higher-rated groups after bounded modifiers. Unknown role pairs use an explicit documented fallback.
- **Coach-style fit**: player `preferredCoachingStyle` vs coach `coachingStyle` (missing coach → configured penalty). Coach ratings may scale magnitude slightly within caps.
- **Tactical fit**: player `preferredTactics` vs `Team.tacticalStyle`, plus coach/team tactical alignment when a coach exists. Missing team tactics → configured penalty/fallback.
- **Personality**: modest contribution to chemistry only — never permanent current ability. Existing enums only (Leader / Competitor / Professional / Creative / Glue).
- **Familiarity**: field present; F9 contribution is always 0 (`NOT_TRACKED_YET`). No fake shared-games history.
- **Effective performance**: `baseAbility × (1 + clamp(totalModifier))` with component and total caps in config (F9 defaults ±0.30 total). Never negative EP.
- **Hero Rating / Stability**: not used in F9 chemistry.
- Chemistry quality does **not** change team READY status (informational warning only if weak units).

---

## 4. Player Attributes & Generation Rules

See `PLAYER_MODEL.md` for the complete field list and formulas. Key invariants:

- Every generated player has a hidden **true potential** and a currently-known **current ability** — the owner (and any in-game scouting UI) should generally see the current/estimated value, not the ground-truth potential, except where a feature explicitly reveals it (e.g. a very high scouting investment).
- Randomized generation values (dev-state draw, stability-state draw, initial 9 attributes, offense/defense split) are rolled **once, at generation time, and persisted** — they must never be re-rolled on subsequent reads. This is a deliberate change from the original spreadsheet prototype, which recalculated on every view.
- A player's **archetype/role** is *derived* from their attribute profile (see the role-mapping tables in `PLAYER_MODEL.md` §5) — it is not a manually-assigned field, and must be recomputed whenever the underlying attributes change materially (e.g. after a development step or Commissioner attribute edit). Commissioner Mode must never offer direct role editing.
- **Commissioner Mode (F6)** is an explicit administrative sandbox for correcting the current world. It is not normal gameplay, not multiplayer permissions, and not authentication. Ordinary browsing stays read-only; successful Commissioner writes are audited.
- **Goalies use a different model than skaters**: F5 implements a dedicated nine-attribute goalie model and goalie role profiles. Never apply skater attributes, offense/defense splits, or skater pair-role tables to goalies.

---

## 5. Aging & Development Rules

**F24 implemented (simplified, config-versioned):**

- Age for development is calculated on an explicit `effectiveDate` from `Player.dateOfBirth` (UTC calendar). Do not use wall clock; do not invent a separate persisted integer age as source of truth.
- Skater and goalie use separate age curves and attribute allocation groups (attributes remain 1–20).
- Annual attribute-change **budget** is deterministic (age band, potential gap, optional developmentRate, seeded variance), then allocated across attributes. Budget is not “CA points.”
- After attributes change: recalculate current ability and derived role with existing F5 functions. Potential floor/ceiling are never auto-increased by development.
- Positive development softens near potential ceiling; decline is not blocked by potential.
- Form (`Player.form`, −10..10) regresses toward neutral annually with bounded seeded variance — not a permanent skill.
- Retirement evaluation is deterministic; forced age and probability curve are config-driven. Retirement sets `rosterStatus = RETIRED` without deleting the player. F24 keeps `currentTeamId` (roster cleanup deferred).
- Official run workflow: preview → prepare (PRE snapshots) → execute (backup + stale check + atomic POST snapshots/results). One completed official run per WorldSeason.

Prototype aging table in §6 remains historical reference; F24 uses `PlayerDevelopmentPresetVersion` config, not a live spreadsheet curve.

---

## 6. Draft & Scouting Rules (Milestone M5)

- **F26 implemented:** scouting fog-of-war is live. What the owner sees for a prospect is a noisy, confidence-bounded estimate of the true attributes/potential — never the ground-truth values on normal APIs. See the F26 invariants above and `ARCHITECTURE.md` §7l.
- **F27 implemented:** the annual amateur draft consumes F25 prospects and F26 team-specific scouting knowledge. Eligibility uses an explicit cutoff date (never wall clock); order and lottery are deterministic; auto-pick uses only that Team's scouting estimates; a selection creates ACTIVE draft rights, not a contract; the drafted Player remains `PROSPECT`, unsigned, and `currentTeamId = null`. See the F27 invariants above and `ARCHITECTURE.md` §7m.
- Draft-class players come from F25 youth generation (and existing prospects already living in the world); undrafted players remain in the world.
- F28 converts an ACTIVE draft right only when its owning Team accepts an ENTRY contract offer; rights and contracts remain distinct records.
- Not yet implemented: trades and draft-pick/right transfers (F29), offseason orchestration (F30), next-WorldSeason creation.

---

## 7. Contracts, Cap & Transactions (F28 Contracts Implemented)

- A Player has at most one ACTIVE contract. Its Team must equal `Player.currentTeamId`; contract acceptance and ownership update are atomic.
- ACTIVE/FUTURE ranges use explicit existing WorldSeason references and stable start-year order snapshots. Start cannot follow end and live ranges cannot overlap. Wall-clock time never advances contracts.
- Offers create no ownership. Acceptance creates the contract, closes competing submitted offers, and updates ownership atomically; rejected/withdrawn offers preserve history.
- Expiration and release never delete the Player or contract history. They clear ownership unless an accepted FUTURE extension activates at the explicit boundary. Lineups are not automatically rewritten.
- Draft rights are distinct from contracts. Only the ACTIVE rights holder may sign the prospect; accepted signing converts the right to `CONVERTED_TO_CONTRACT` and preserves DraftPick history.
- Retired Players cannot sign. Contract operations do not alter attributes, potential, form, role, development, scouting, youth provenance, competition archives, or historical snapshots.
- Salary is integer dollars, constant per contract season, under an immutable versioned simplified configuration. Recommendations are deterministic advice and do not use hidden true potential in normal Team context.
- F28 enforces **no salary cap** and creates no cap hits, trades, pick/right transfers, retained salary, buyouts, waivers, arbitration, bonuses, clauses, or offer sheets.

---

## 7b. Trades & Rights Transfers (F29 Implemented)

- A trade has exactly two **club** Teams. A Team cannot trade with itself; national teams cannot participate.
- Supported assets: a Player under an ACTIVE contract (the ACTIVE contract and any FUTURE contract move together, and `Player.currentTeamId` follows the ACTIVE contract), a PENDING `DraftPick` whose `currentTeamId` transfers while `originalTeamId` **never** changes, and an ACTIVE `PlayerDraftRight` whose holder transfers **without** signing the Player (no contract created, `currentTeamId` stays null).
- A proposal is `DRAFT` (editable) → `SUBMITTED` (immutable frozen asset snapshots + valuations) → `ACCEPTED`/`REJECTED`/`WITHDRAWN`. Accepted/rejected/withdrawn proposals are immutable. No counteroffers in F29.
- Acceptance revalidates every asset's current ownership/state inside one transaction; any stale asset aborts the whole trade (409) — no partial transfer, no partial history. A pre-trade SQLite backup is required first.
- Completed trades and their append-only `TradeTransaction` history are immutable. Correction uses F32 recovery or a new opposite trade where legally valid — never an edit, reversal, or partial move.
- Trade value is **advisory only** and never accepts or rejects a trade; there is no autonomous AI acceptance. Normal Team-context valuations use only that club's F26 scouting estimates or a conservative Unknown fallback — never true potential, hidden attributes, F25 quality tier, or another Team's private report.
- Scouting reports are Team-private and do **not** transfer with a Player. Trade operations never change Player truth, attributes, form, role, scouting, provenance, development, or archives.
- F29 enforces **no salary cap, no retained salary, no conditional picks, no multi-team trades, no cash, no waivers/buyouts/arbitration/no-trade-or-no-move clauses, and no trade deadline.** Lineups are never auto-rewritten (run auto-lineup later to rebuild from current ownership).

## 7c. Offseason Workflow (F30 Implemented)

- One current non-cancelled `OffseasonRun` per `WorldSeason`. An `OffseasonRun` belongs to exactly one WorldSeason and persists across server restart.
- Phase order is explicit and persisted in a versioned config: COMPETITION_ARCHIVE → CONTRACT_EXPIRATION → PLAYER_DEVELOPMENT → RETIREMENT_REVIEW → YOUTH_GENERATION → DRAFT → DRAFTED_PLAYER_SIGNINGS → FREE_AGENCY → TRADES → ROSTER_REVIEW → LINEUP_REVIEW → SCOUTING_REVIEW → FINAL_REVIEW. FINAL_REVIEW is always last. Order is not hardcoded only in the client.
- A phase cannot start before required dependencies complete. Dependencies are linear: every earlier phase must be COMPLETED or SKIPPED. A phase cannot complete if its readiness blockers remain.
- Required phases cannot be skipped (a required phase with `allowSkip=true` is rejected by config validation). Optional phases (DRAFTED_PLAYER_SIGNINGS, FREE_AGENCY, TRADES, SCOUTING_REVIEW) may be skipped when configured.
- COMPLETED phases and COMPLETED runs are immutable. Failed execution does not mark a phase complete. Retrying a phase is idempotent. Correction requires the underlying subsystem's permitted recorded action or F32 recovery — never an edit, reopen, or partial reversal.
- Underlying F20/F24/F25/F27/F28 runs remain authoritative. F30 references existing run/event ids through explicit nullable columns and never duplicates their results. If an underlying run already completed before OffseasonRun creation, F30 detects and links it. F30 does not rewrite completed underlying runs and must detect conflicting or stale underlying operations.
- F30 is pure coordination: it never duplicates F24 development, F25 youth-generation, F27 draft, F28 contract-expiration, or F29 trade logic. Refresh and retries are idempotent (no duplicate events, no duplicate domain operations). Normal mode is read-only; Commissioner Mode is required for every workflow mutation.
- Team management actions (signings, offers, trades, lineup edits, rescouts) remain separate explicit actions in their own subsystems. F30 does not auto-accept offers, auto-generate or auto-accept trades, auto-run draft picks (the existing F27 explicit auto-pick must still be invoked), auto-release retired players, auto-rebuild lineups, or auto-rescout.
- Backups are not duplicated: the underlying F20 archive, F24 development, F25 youth, and F28 expiration services already create their own SQLite safety backups before their world-mutating operations; F30 records linked backup metadata only where available and does not implement F32 restore.
- Offseason completion does **not** imply every free agent is signed, every Team is perfectly optimized, or every draft right is converted (warnings only, per config). Completion requires no critical world-integrity blockers (required phases complete, no unarchived required competition, contract-expiration/development/youth/draft runs complete, no retired players in active lineups, no lineup ownership mismatch, no duplicate ACTIVE contracts, no open submitted trade proposals or contract offers when config disallows, no incomplete required detailed-club lineups).
- Completing F30 does **not** create the next WorldSeason. F31 handles season rollover. This is surfaced as an explicit warning in the final-review UI and in every "complete run" path.
- F30 audit records orchestration only (one row per run/phase event, never one per Player/Team). Underlying subsystems keep their own audits/history.

## 7d. Season Transition (F31 Implemented)

- F31 is the **only** milestone that may create the next WorldSeason. One completed transition per source WorldSeason; one source per target season (DB-enforced); the target season is a new record, never a mutation of the source. Completed transitions are immutable; correction requires F32 database recovery.
- Transition requires a completed F30 OffseasonRun for the source season. The target-season order is deterministic (`source.startYear + configuredIncrement`); `startYear` remains the canonical WorldSeason order. Target label/dates derive from config; a Commissioner may override only the display name (order/dates are never altered), and the override is part of the frozen input hash.
- Exactly one current (ACTIVE) WorldSeason exists after completion. `status = ACTIVE` is the single source of truth for "current" — F31 introduces no competing `isCurrent` boolean. The source season is demoted to COMPLETED and remains readable and historical.
- Preview is write-free; preparation freezes the input + plan hashes; execution re-validates the frozen input against the live world (409 `SeasonTransitionInputStale` on drift — no silent recalculation). A pre-execute SQLite safety backup is required. Atomic publication creates the target season, current-season designation, CompetitionEditions, stages, participants, entity records, and the COMPLETED row in one transaction; any failure leaves no partial target state.
- Repeated execute after COMPLETED is idempotent (returns the existing result). A second transition from the same source season is rejected. PREPARED may be discarded; FAILED may be retried only when no target rows exist and the frozen input is still valid.
- Target CompetitionEditions are new PLANNED records: rules snapshots + hashes are copied into new rows (later Competition.defaultRulesJson edits do not rewrite them); stage templates are copied with source-stage dependencies remapped and re-validated for acyclicity; confirmed participants are copied with fresh snapshots. No schedules, Matches, standings, brackets, PlayoffSeries, AggregatedSeasonRun, awards, champions, or stats are copied — those remain in F20 archives/history.
- Domestic competitions recur automatically when they had a source edition. International tournaments are carried only with an explicit recurrence flag (manual warning otherwise); no real Olympic cycles are hardcoded.
- F31 does **not** replay F24 development, F25 youth generation, F27 draft, F28 contract expiration, or F29 trades. It does **not** auto-activate FUTURE contracts (resolve through F28), auto-rebuild club lineups, or reuse locked F22 national-team rosters. Players are not duplicated or mutated; birth dates never change (age remains derived from birth date + target-season dates). ACTIVE/FUTURE contract semantics remain consistent; `Player.currentTeamId` stays synchronized with the ACTIVE contract. Draft rights remain with their holder. Scouting reports remain Team-private (F26 owns staleness; F31 reports advisory counts only).
- Normal mode is read-only; Commissioner Mode is required for every transition mutation (prepare/execute/cancel/retry, config version activate). F31 audit records orchestration only (one row per run event, never one per Player/Team/edition). F31 creates one pre-execute SQLite safety snapshot but offers no restore UI — full backup/recovery is now F32.

---

## 7e. Backup and Recovery (F32 Implemented)

F32 is the single centralized, persistent, auditable, Commissioner-controlled backup/recovery layer for the entire local world database. SQLite-only and local-only — no cloud/off-site durability, encryption, incremental backups, point-in-time recovery, record-level restore, PostgreSQL tooling, or production disaster recovery.

Stable invariants:
- **Backup creation never mutates world data.** It uses SQLite `VACUUM INTO` plus a dedicated read-only connection for verification.
- **Only VERIFIED backups are restorable.** A backup is not VERIFIED until file SHA-256, canonical manifest SHA-256, `PRAGMA integrity_check`, migration-table presence, and a recomputed database fingerprint all pass. Failed backups are never presented as restorable; a previously VERIFIED backup may later be detected MISSING or CORRUPT.
- **Restore is explicit and Commissioner-gated.** It is always restart-required (in-process hot restore is unsafe given the Prisma singleton and is explicitly not supported).
- **Restore creates a pre-restore backup** (mandatory, protected) of the current database before any replacement.
- **Restore replaces the complete world database.** F32 does not merge or import individual records. An older backup is restored to exact bytes, then pending additive migrations run forward through the current chain; a backup with migrations absent from the active chain is a BLOCKER.
- **Restore revalidates integrity and migrations** after replacement; failure rolls back to an emergency copy and halts startup with explicit recovery instructions (the marker is preserved on failure).
- **Protected backups cannot be pruned** (manual, pre-restore, restore-source, Commissioner-protected). Backups referenced by active restores cannot be pruned. The default never deletes the only verified backup. Pruning never deletes outside the configured backup root and never deletes the active database.
- **Paths remain within the configured backup storage.** `..`/symlink-escape rejected; allowlisted extensions; filenames generated server-side; resolved path verified inside the root on every read; no user-supplied filenames or arbitrary-path deletion. Absolute paths are never exposed through public APIs, error payloads, or the UI (only filenames and hash prefixes).
- **Automatic critical-operation backups use the centralized F32 service.** Every world-mutating operation (F18/F19/F20/F21/F23/F24/F25/F27/F28×2/F29/F31) passes source-operation type+id, blocks when its required backup fails, and reuses an existing VERIFIED operation-linked backup idempotently on retry. No scattered direct SQLite backup logic remains except as the internal implementation of F32.
- **Recovery history survives database replacement through an external journal** (file-based, in the backup directory), because restoring an older database may delete the restore-run row that requested the restore.
- **F32 does not merge/import individual records** and does not provide record-level restore.
- **Public health is bounded.** `/health` and `/api/system/backup-status` expose only configured/verified-count/last-verified-age/maintenance/pending-restore — never filenames, paths, hashes, fingerprints, or operation details. Normal mode is read-only.

---

## 7f. Import, Export, and Maintenance (F33 Implemented)

F33 is the **final milestone** of the F1–F33 foundation plan — a safe, Commissioner-controlled maintenance center for the local SQLite world. Stable invariants:

- **Exports never mutate world data.** Every export type has an explicit schema, stable column list, supported filters, privacy level, deterministic ordering, row-count preview, and a manifest + SHA-256 (file + manifest). Filenames are server-generated; downloads are by run ID only with the resolved path re-verified inside the configured export root on every read
- **Public-safe exports omit hidden/private truth.** `PLAYERS_PUBLIC_*` strictly excludes `potentialFloor`, `potentialCeiling`, `developmentRate`, `developmentRisk`, `currentAbility`, `qualityTier`, private scouting notes, and Commissioner diagnostics. `PLAYERS_COMMISSIONER_*` reveals hidden truth but is Commissioner-gated, warning-bannered, and audited. `FULL_DATABASE_PACKAGE` is Commissioner-only
- **Truth exports require Commissioner Mode.** No truth export is reachable in normal mode; every truth export carries a UI warning and an audit row
- **Imports always preview and validate first.** Upload (multipart, bounded size, allowlisted extension/content-type, SHA-256, isolated staging) → preview (parse + every row + duplicate/conflict classification + `previewHash`, no writes) → apply (explicit `expectedPreviewHash` + VERIFIED F32 backup + revalidate + atomic bulk-create + audit). Imports do not partially apply; failure preserves existing DB state
- **Imports apply atomically.** Either every validated row is created in one transaction or none are
- **Preset imports create immutable versions.** They never edit existing versions, never auto-activate (activation is a separate explicit endpoint), and reject unknown fields / wrong preset types / payloadHash mismatches
- **Name-pool imports never modify existing Players.** They affect only future generation; they never delete existing name-pool entries
- **Destructive maintenance requires a VERIFIED F32 backup.** Import apply, reset execute, and full-DB package creation all route through the centralized F32 `createDatabaseBackup` and block on a VERIFIED backup
- **Database validation never silently repairs.** It runs `PRAGMA integrity_check` + migration table + F32 database fingerprint + grouped checks; results are persisted with a deterministic `resultHash` and downloadable as JSON
- **Full DB export does not bypass F32 restore.** The package is a portability `.zip` (SQLite + manifests + checksums + README). Importing/restoring into a live DB is **not** performed here — restore remains an F32 workflow
- **Reset is explicit and cannot delete backups.** `RESET_SETUP_STATE_ONLY` clears AppMeta flags when world tables are empty; `RESET_WORLD_TO_EMPTY` requires Commissioner + typed phrase `RESET WORLD <short id>` + fingerprint confirmation + no running op + no pending restore + mandatory protected F32 backup + atomic FK-safe deletion. Reset preserves migrations, F32 backups, export files, `*Preset*`/`Active*Configuration` tables, CommissionerAuditLog, and MaintenanceEvent history. Reset is a transaction deleting rows (no DB file replacement, no restart required)
- **Maintenance paths stay inside configured storage.** Canonicalize `.fhm-exports` root (honors `FHM_EXPORT_DIR`), reject `..`/symlink-escape, allowlist `.csv`/`.json`/`.zip`, server-generated filenames, resolved path verified inside root on every read, no user-supplied filenames, sanitize `Content-Disposition`. Absolute paths are never exposed through public APIs/errors/UI
- Normal mode is read-only; Commissioner Mode is required for every maintenance mutation. Public `/api/system/maintenance-status` exposes only bounded metadata (configured, completed exports, pending imports, last full-DB-package age, last validation status/age)

---

## 8. Explicitly Deferred Mechanics

The following are intentionally **not** implemented yet, and no feature should assume they exist:

- AI general managers / automated decision-making for other teams (Milestone M7).
- Multiplayer, human-vs-human play, or server-authoritative persistence beyond local SQLite (Milestone M8).
- Full salary cap/contract negotiation logic, arbitration, offer sheets (Milestone M6).
- Draft lottery and scouting fog-of-war mechanics (Milestone M5).
- Mentor/veteran development effects, injuries, and locker-room "personality conflict" mechanics beyond the basic chemistry modifiers in §3 — these were discussed as future enrichments but are not scoped into any current milestone.
- Any real-world statistical calibration (this project is a stylized abstraction, not an analytics-accurate model).

---

## 9. Rule Priority

When two rules conflict, use this priority:

1. what actually keeps the current milestone's mechanics simple and working end-to-end;
2. explicit owner intent from the current conversation/prompt;
3. this document;
4. `PLAYER_MODEL.md` (for the specific attribute/formula definitions);
5. `ARCHITECTURE.md` (for how something is implemented, not what it should do);
6. inferred "realism" (real NHL conventions) — nice to have, but never overrides an explicit simplification the owner has chosen, and never overrides the non-linear-performance rule in §2.

---

## Guiding Rule

**Simplicity now, explicit hooks for later — but never at the cost of non-linearity.** Every deferred mechanic listed here should be easy to add on top of the current data model without a rewrite, but none of them should be implemented ahead of time "just in case," and none of them should be implemented in a way that makes overall rating the dominant predictor of performance.
