# Franchise Hockey Manager — Player Model

**Status:** Active — **F5 foundation implemented** in `@fhm/engine` (prototype transcription retained below for history)
**Last updated:** 2026-07-13
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Source:** `Player_template.xlsx` (owner-provided prototype) + F5 implementation decisions

> This document is the detailed spec for a single player: identity, growth/aging formulas, attributes, and archetype derivation. Sections §1–§7 preserve the spreadsheet prototype translation. **§0 documents the F5 implemented model** (authoritative for current code).

For design *rules*, see `PRODUCT_RULES.md`. Engine code: `packages/engine/src/players`, `packages/engine/src/goalies`, `packages/engine/src/lineups`, `packages/engine/src/config/*.json`.

### Secondary positions (F8)

- Persisted via `PlayerSecondaryPosition` (unique per player + position).
- Allowed values: LW, RW, C, LD, RD only — never G.
- Primary position must not appear as secondary.
- Goalies have no secondary positions (cleared on skater→goalie conversion).
- Lineup slots accept exact primary or secondary matches only (no broad wing/defense fallback).
- Main-lineup eligibility still requires ACTIVE/RESERVE + complete F5 model; PROSPECT/UNAVAILABLE cannot be assigned.

---

## 0. F5 Implemented Model (authoritative)

### Attribute scale

| Concept | Scale | Notes |
|---|---|---|
| Attributes (skater & goalie) | integers **1–20** | **10 ≈ average professional baseline** in this abstract model |
| Derived ratings (CA, OVR splits, role rating) | integers **0–100** | presentation / lineup support — not simulation sole input |
| Hero rating / stability | integers **1–20** | do not modify permanent ability ratings in F5 |
| Development rate | float in config range (default 0.1–3) | future F24 growth tendency |
| Development risk | float **0–1** | hidden; future variance |
| Potential floor / ceiling | **0–100** (same presentation scale as CA) | hidden; floor ≤ ceiling |

Rounding: ratings use `Math.round` after weighted average; then clamp to `[ratingMin, ratingMax]`.

Do **not** treat the spreadsheet’s prospect `RANDBETWEEN(7,11)` as the global maximum scale.

### Skater attributes (9)

`stickhandling`, `shooting`, `passing`, `strength`, `speed`, `balance`, `aggression`, `offensiveAwareness`, `defensiveAwareness`

### Goalie attributes (9) — separate model

`reflexes`, `positioning`, `reboundControl`, `glove`, `blocker`, `movement`, `puckHandling`, `consistency`, `stamina`

Goalies **never** use the skater attribute model (and vice versa).

### Persistence

- `Player`: identity + development profile (preferences, personality, hero, stability, developmentRate, hidden potential, publicPotentialEstimate)
- `SkaterAttributes` / `GoalieAttributes`: 1:1 by `playerId`, cascade on player delete
- Derived ratings and roles are **not** persisted; computed via `derivePlayerModel()` on read
- Legacy F4 structural players: F5 fields nullable → `modelStatus: INCOMPLETE`

### Ratings (config: `rating-weights.json`)

- Skater: `currentAbility` (all nine attrs), `offensiveRating`, `defensiveRating`, plus `roleRating` from role config
- Goalie: `currentAbility` (all nine attrs) + `roleRating` — **no** offensive/defensive ratings
- Hidden potential and preferences/personality do **not** affect permanent ability ratings

### Role derivation

- Skaters: documented attribute-pair tables from §5 → machine keys (`ROCKET`, `QUARTERBACK`, …) in `skater-roles.json`
- Tie-break: higher pair score → lexicographically smaller role key → lexicographically smaller `a|b`
- Goalies: weighted profiles in `goalie-roles.json` (`REFLEX_GOALIE`, `POSITIONAL_GOALIE`, `HYBRID_GOALIE`, `PUCK_PLAYING_GOALIE`); alphabetical role key breaks ties
- Roles are derived, never stored as independent editable truth in F5

### Role rating

Preferred 3/3/2/2 supporting weights. **Full spreadsheet per-role supporting-attribute table was not available in the repository.** F5 uses an explicit foundation config: winning pair attributes (3,3) plus two documented/sensible supports (2,2), marked tuneable — not a verbatim spreadsheet transcription.

### Potential visibility

| Field | Persist | Public API |
|---|---|---|
| `potentialFloor` / `potentialCeiling` / `developmentRisk` | yes | **no** |
| `publicPotentialEstimate` (`LOW`/`STANDARD`/`HIGH`/`ELITE`/`UNKNOWN`) | yes | yes |

If no public estimate is imported, show `UNKNOWN` — do not derive public bands from hidden truth.

### Spreadsheet fields intentionally not carried as F5 persistence

- Live `RAND()` recalculation behavior
- Aggregate `Start.Total` / `Curr.Total` overall formulas as simulation truth (replaced by concrete attributes + derived CA)
- Parallel `Offense%`/`Defence%` random split generating O/D from overall
- `Cur.Over.Tot.` / `Over.Pot.` / star-style `R`/`P` aggregates
- National Team random quality field
- Face-offs column (never populated in prototype)
- Goalie placeholder (50/50 + all attrs = 10)

Annual development, aging ops, role inertia, form, injuries remain deferred (F24+).

### F12 simulation consumption (2026-07-13)

Regulation scoring (`f12.1`) reads **concrete attributes** from simulation input — not hidden potential:

- **Skaters:** all nine attributes (`shooting`, `offensiveAwareness`, `stickhandling`, `passing`, etc.) plus role/role rating and unit effective performance (F9, applied once).
- **Goalies:** `reflexes`, `positioning`, `reboundControl`, `glove`, `blocker`, `movement`, `consistency` are active in save resolution; `stamina` and `puckHandling` are minimally or unused in F12 regulation.
- Derived CA/OVR remain lineup/display support; shot selection and resolution weight specific attributes per balance config.

### Dataset

Import requires **schemaVersion 2** with complete player-model fields. schemaVersion 1 is unsupported.

---

## 1. Identity Fields

| Field | Prototype source | Notes |
|---|---|---|
| Name / Surname | Random pick from a per-nationality name pool (the prototype used `IMPORTRANGE` into a separate Google Sheet with per-nation name/surname lists) | Engine equivalent: `data/names/<nationality>.json` with first-name and surname lists; pick uniformly at random |
| Nationality | Set at generation time (prototype grouped rows by nation: Russia, Canada, USA, etc.) | Drives which name pool is used, and later, national-team eligibility |
| Position | `LW` \| `RW` \| `C` \| `LD` \| `RD` \| `G` | Defenseman side (L/R) matters for role derivation (§5) |
| Age | Set at generation (prototype's example rows are all age-15 prospects) | Drives the aging lookup (§6) |

---

## 2. Growth Engine (Overall Rating)

These fields together produce a player's evolving overall rating.

| Field | Prototype formula | Meaning |
|---|---|---|
| `Start. Total` (H) | `RANDBETWEEN(7, 11)` | Base overall at generation age (15 in the prototype) |
| `Dev.rate` (I) | `RANDBETWEEN(1, 3)` | Base yearly growth rate |
| `Risk` (J) | `(RAND() * (0.9 - 0.1) + 0.1) * -1` → a value in **[-0.9, -0.1]** | Downside bound on development variance |
| `Bonus Pot.` (K) | `RAND() * (0.9 - 0.1) + 0.1` → a value in **[0.1, 0.9]** | Upside bound on development variance |
| `Current dev state` (L) | `= K + (J - K) * RAND()` | A single random draw **between Bonus Pot. and Risk** — i.e. the player's realized development-variance outcome sits somewhere in that upside/downside range |
| `Stab.+` (M) | `RAND() * (0.3 - 0.1) + 0.1` → **[0.1, 0.3]** | Upside bound on performance stability/consistency |
| `Stab.-` (N) | `= -Stab.+` | Downside bound (mirror of Stab.+) |
| `Current stab. state` (O) | `= N + (M - N) * RAND()` | A single random draw between the stability bounds — the player's realized consistency modifier |
| `Age adj.` (P) | `VLOOKUP(Age, AgingTable, 2, FALSE)` | Looked up from the aging curve (§6) for the player's current age |
| **`Curr. Total`** (Q) | `= (Start.Total + (Age - 15) * (Dev.rate + Current_dev_state)) * (1 + Current_stab_state) + Age_adj` | **The player's overall rating at their current age.** Base total grows each year past 15 by `(Dev.rate + dev-state noise)`, the whole thing is scaled by `(1 + stability noise)`, then the age-curve adjustment is added on top. |

**Reading this formula:** a player's overall isn't just "attribute value + growth" — it's base growth compounded with two independent random "personality of development" draws (a dev-variance draw and a stability draw), plus a shared age-curve term everyone gets based on their current age. Two players with identical `Start.Total` and `Dev.rate` can end up with meaningfully different `Curr. Total` at the same age because of these frozen-at-generation random draws.

### Offense / Defense Split

| Field | Formula | Meaning |
|---|---|---|
| `Offense %` (R) | `RAND() * (0.85 - 0.55) + 0.55` → **[0.55, 0.85]** | Every skater is offense-leaning by construction — no player is generated below 55% offense |
| `Defence %` (S) | `= 1 - Offense%` | Complement |
| `Offence` (T) | `= Curr.Total * Offense%` | Offensive sub-rating |
| `Defence` (U) | `= Curr.Total * Defence%` | Defensive sub-rating |

---

## 3. The 9 Core Attributes

Each skater gets 9 attributes. In the prototype these are currently generated independently of `Curr. Total`:

| Code | Full name | Prototype formula (prospect, age 15) |
|---|---|---|
| STH | Stickhandling | `RANDBETWEEN(7, 11)` |
| SHO | Shooting | `RANDBETWEEN(7, 11)` |
| PAS | Passing | `RANDBETWEEN(7, 11)` |
| STR | Strength | `RANDBETWEEN(7, 11)` |
| SPD | Speed | `RANDBETWEEN(7, 11)` |
| BAL | Balance | `RANDBETWEEN(7, 11)` |
| AGG | Aggression | `RANDBETWEEN(7, 11)` |
| OF.AW | Offensive Awareness | `RANDBETWEEN(7, 11)` |
| DEF.AW | Defensive Awareness | `RANDBETWEEN(7, 11)` |

Two composite scores are derived from these 9 attributes plus `Curr. Total`:

- `Cur. Over. Tot.` = `Curr.Total × (STH + SHO + PAS + STR + SPD + BAL + AGG + OF.AW + DEF.AW)` — a combined "current overall × spread of skills" score.
- `Over. Pot.` = `((Start.Total + 27 - 15) × Dev.rate) × (STH + SHO + PAS + STR + SPD + BAL + AGG + OF.AW + DEF.AW)` — an estimate of overall potential *at peak age (27)*, using the sum of the (currently static) 9 attributes.

Two more fields normalize these back down: `R` = `Cur.Over.Tot. / 100`, `P` = `Over.Pot. / 100` — likely intended as compact "star rating"-style summaries. **See §7 for open questions about this part of the model.**

---

## 4. Coaching, Tactics & Personality Traits

Each skater is also assigned, at generation, three independent categorical traits — these are exactly the fields the chemistry/tactics-fit engine (`PRODUCT_RULES.md` §3) is meant to compare against a team's actual coach:

| Field | Possible values |
|---|---|
| `Preferred coaching style` | Authoritarian, Authoritative, Democratic, Developmental, Hands-Off |
| `Preferred tactics` | Combinational, Physical, Speed, System, Forechecking |
| `Personality` | Leader, Competitor, Professional, Creative, Glue |

Each is currently assigned by uniform random pick (`INDEX(..., RANDBETWEEN(1,5))`) in the prototype. A `Coach` entity (see `ARCHITECTURE.md` §5) should carry the same `coaching style` / `tactics` value set so the two can be compared for fit.

Additional fields: `Hero Rating` (clutch factor, `RANDBETWEEN(7,11)` in the prototype — intended to matter more in high-leverage situations, per `PRODUCT_RULES.md` §3) and `National Team` (also `RANDBETWEEN(7,11)` — likely an international-eligibility/quality indicator; exact use TBD).

---

## 5. Archetype / Role Derivation

This is the part of the prototype that most directly answers "different types of players, not just different overalls." A player's **Role** is derived, not assigned: take the player's 9 attributes, find which one of a fixed set of attribute *pairs* has the highest combined value, and map that pair to a named archetype. The mapping differs for forwards vs. defensemen; goalies have no role.

### Forward roles (`LW` / `RW` / `C`)

| Best attribute pair | Archetype |
|---|---|
| STH + SPD | Rocket |
| STH + BAL | Possession Master |
| STH + STR | Power Forward |
| STR + SPD | Dump-In Forward |
| STR + OF.AW | Screener |
| SPD + AGG | Deep Forechecker |
| SPD + BAL | Puck Mover |
| OF.AW + AGG | Garbage Collector |
| OF.AW + BAL | Point-Shooter |
| OF.AW + SPD | Playmaker |
| OF.AW + STH | Deflector |
| STH + AGG | Interceptor |
| STR + AGG | Grinder |
| STR + BAL | Enforcer |
| AGG + BAL | Chaos-Maker |
| DEF.AW + SPD | CA-Forward |
| DEF.AW + STR | Backchecker |
| DEF.AW + AGG | NZ Forechecker |
| DEF.AW + BAL | Two-Way Forward |
| DEF.AW + STH | Shadow |

### Defenseman roles (`LD` / `RD`)

| Best attribute pair | Archetype |
|---|---|
| STH + SPD | Quarterback |
| STH + BAL | Support D |
| STH + STR | Support D |
| STR + SPD | Support D |
| STR + OF.AW | Support D |
| SPD + AGG | Defensive D |
| SPD + BAL | Quarterback |
| OF.AW + AGG | Support D |
| OF.AW + BAL | Attacking D |
| OF.AW + SPD | Attacking D |
| OF.AW + STH | Attacking D |
| STH + AGG | Defensive D |
| STR + AGG | Defensive D |
| STR + BAL | Defensive D |
| AGG + BAL | Defensive D |
| DEF.AW + SPD | Support D |
| DEF.AW + STR | Defensive D |
| DEF.AW + AGG | Defensive D |
| DEF.AW + BAL | Defensive D |
| DEF.AW + STH | Support D |

Implementation note: the same 20 attribute-pairs are evaluated for both positions groups — only the resulting archetype *name* differs. In code this is one lookup table keyed by pair, with two "name" columns (forward / defenseman), not two separate tables to keep in sync.

### Role Rating

Once a `Role` is assigned, a `Role rating` (0-10ish scale, weighted `/10` in the prototype) is computed as a weighted sum of four attributes associated with that specific role, with weights `3, 3, 2, 2` (the four "supporting" attributes differ per role — e.g. for `Rocket` the weights apply to STH, SPD, SHO, and W respectively). This measures **how well the player's attribute profile matches the role they were assigned** — i.e. a player can have a "weak" fit to their own emergent role if their attributes are close between two competing pairs. Full per-role weight tables should be transcribed into `packages/engine/src/config/role-thresholds.json` when this is implemented — don't hardcode the 24-branch `SWITCH` logic in TypeScript; represent it as data.

---

## 6. Aging Curve

Source: the `Aging` sheet. Column A = age, column C = that age's yearly delta (hand-authored input), column B = cumulative sum (`B[age] = B[age-1] + C[age-1]`), which is what `Age adj.` actually looks up via `VLOOKUP`.

| Age | Yearly delta (C) | Cumulative Age Adj. (B) |
|---|---|---|
| 15 | 5 | 5 |
| 16 | 5 | 10 |
| 17 | 4 | 14 |
| 18 | 4 | 18 |
| 19 | 3 | 21 |
| 20 | 3 | 24 |
| 21 | 2 | 26 |
| 22 | 2 | 28 |
| 23 | 1 | 29 |
| 24 | 1 | 30 |
| 25 | 0 | 30 |
| 26 | 0 | 30 |
| 27 | 0 | 30 |
| 28 | -2 | 28 |
| 29 | -1 | 27 |
| 30 | -2 | 25 |
| 31 | -2 | 23 |
| 32 | -3 | 20 |
| 33 | -3 | 17 |
| 34 | -3 | 14 |
| 35 | -4 | 10 |
| 36 | -4 | 6 |
| 37 | -4 | 2 |
| 38 | -5 | -3 |
| 39 | -5 | -8 |
| 40 | -5 | -13 |
| 41 | -7 | -20 |
| 42 | -7 | -27 |

Peak is a flat plateau at ages 25-27 (cumulative adjustment holds at 30), with acceleration on both the growth side (steep early climb, tapering by 23-24) and the decline side (mild at first, steepening sharply after 37). This table should become `packages/engine/src/config/aging-curve.json` verbatim — it's a good first candidate for a config file since the owner may want to tune it (e.g. different curves per position, which the prototype does not yet do).

---

## 7. Open Questions / Required Engine Design Decisions

These are places where the spreadsheet prototype was either a placeholder, internally inconsistent, or relied on live-recalculation behavior that the real engine must not copy. Resolve these during M1/M2 implementation — don't silently carry the spreadsheet's exact behavior forward without a decision.

1. **Randomness must be frozen, not live.** Every `RAND()`/`RANDBETWEEN()` in the prototype recalculates on every spreadsheet refresh. The engine must roll each of these exactly once at player generation and persist the concrete result (via Prisma) — re-deriving them on every read/request would make a player's stats non-deterministic between page loads, which is not acceptable.
2. **The 9 core attributes are currently independent of `Curr. Total`.** In the prototype they're flat `RANDBETWEEN(7,11)` regardless of overall rating — presumably a placeholder for 15-year-old prospects. Decide whether/how attributes should scale with `Curr. Total` as a player ages and develops (most likely: attributes should grow similarly to overall, using the same dev-state/age-curve machinery, rather than staying fixed at their age-15 roll forever).
3. **`Offence`/`Defence` (T/U) vs. `Cur.Over.Tot.`/`Over.Pot.` (AE/AF) are two parallel "how good is this player" numbers computed differently** and don't obviously reconcile. Decide which (if not both, for different purposes — e.g. one for lineup building, one for scouting/potential display) is the "real" rating surfaced in the UI, and whether the other should be dropped, renamed, or clearly scoped to a specific use case.
4. **`R` and `P` (Cur.Over.Tot./100 and Over.Pot./100)** look like a normalization for a compact display (e.g. "10.9-star" rating) or possibly meant to feed a scouting fog-of-war display — purpose not fully clear from formulas alone. Confirm intended use before implementing, rather than guessing.
5. **Goalies need a dedicated model.** The prototype's goalie rows use a placeholder (fixed 50/50 offense/defense split, all 9 attributes = 10, no role/role rating computed). This is explicitly *not* good enough for the real engine (see `PRODUCT_RULES.md` §4) — goalies need their own attribute set (e.g. Reflexes, Positioning, Rebound Control, Puck Handling, Consistency) and their own archetype system before they're treated as first-class, not a copy-paste of the skater placeholder.
6. **Stability drift across seasons.** The prototype rolls `Current stab. state` once; it's not clear whether/how this should re-roll or drift season-to-season in the real game (a player could plausibly become "streakier" with age/injury history). Not decided — document the decision here once made.
7. **Face-offs field** exists as a column header in the prototype but is never populated for any generated player — likely meant for centers specifically. Needs a formula/decision before implementation, or should be dropped if not needed.

---

## Guiding Rule

**This document is a translation of a working prototype, not a finished spec.** Where the prototype's formulas are solid (growth engine, aging curve, archetype derivation), transcribe them faithfully into config-driven engine code. Where §7 flags an open question, make and record an explicit decision during implementation rather than silently guessing or copying a placeholder forward.
