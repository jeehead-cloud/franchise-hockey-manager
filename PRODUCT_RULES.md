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
