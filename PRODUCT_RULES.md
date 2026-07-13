# Franchise Hockey Manager — Product Rules

**Status:** Active
**Last updated:** 2026-07-13
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

- Player attribute totals evolve with age according to a configured curve (peak around age 25-27, decline afterward) — see `PLAYER_MODEL.md` §6 for the source table. This curve lives in `packages/engine/src/config/aging-curve.json`, not hardcoded.
- Each player has an individual development trajectory bounded by a `risk` (downside) and `bonusPotential` (upside) value rolled at generation — actual year-to-year development should land somewhere in that range, not deterministically at either extreme.
- A player's `stability` value governs season-to-season performance consistency (volatile vs. steady) — exact re-roll/drift behavior across seasons is an open design question; whatever is chosen must be documented here once decided.

---

## 6. Draft & Scouting Rules (Milestone M5 — Not Yet Implemented)

- Draft-class players are generated with the same generator used for regular rosters, at the appropriate (young) age.
- **Scouting fog-of-war**: what the owner sees for a draft prospect must be a noisy estimate of the true attributes, with the noise magnitude shrinking as scouting investment increases — never show the ground-truth values directly for an unscouted or lightly-scouted prospect.
- Draft order and lottery mechanics: not yet designed — do not implement ahead of this milestone.

---

## 7. Contracts, Cap & Transactions (Milestone M6 — Not Yet Implemented)

- Not yet designed. When implemented: salary cap is a hard team-level constraint, contracts have length/value/bonus structure, and trades must respect the cap for both sides. Record the actual chosen formulas here once implemented — don't leave an important rule only in chat history.

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
