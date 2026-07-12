# Franchise Hockey Manager — Current Status

**Status:** Active
**Last updated:** 2026-07-13
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Local repository path:** `C:\Projects\franchise-hockey-manager`

> Snapshot of what the app can do now, plus maintained Recent / Significant history for future AI-agent sessions.
> End-of-iteration maintenance is mandatory — see `AI_AGENTS.md` §13.1–§13.2 and §5–§7 below.

---

## 1. Current Development Phase

**F5 — Player Model Foundation: implemented locally (not committed).** Separate skater/goalie attribute models, development-profile persistence, deterministic config-driven ratings and roles in `@fhm/engine`, dataset **schemaVersion 2**, public APIs that derive ratings/roles on read without exposing hidden potential, and read-only Player Profile tabs.

**Next milestone: F6 — Commissioner Mode / editing** (do not start until requested).

F1–F4 remain complete on `main` (`bf1d0ab`, `3e6f343`, `58adfc0`, `c50ce83`).

---

## 2. Milestone Status

### F1 — Monorepo and Application Shell (Done)

Committed/pushed: `bf1d0ab`.

### F2 — Core Database Model (Done)

Committed/pushed: `3e6f343`.

### F3 — World Initialization and Real Data Import (Done)

Committed/pushed: `58adfc0` — local dataset import + Setup World. F5 bumps import contract to **schemaVersion 2**.

### F4 — World Dashboard and Browsers (Done)

Committed/pushed: `c50ce83`.

### F5 — Player Model Foundation (Done locally)

Implemented:
- Engine: skater/goalie types, validation, ratings, role derivation, config JSON (`player-model`, `rating-weights`, `skater-roles`, `goalie-roles`)
- Prisma: nullable F5 profile fields on `Player`; `SkaterAttributes` / `GoalieAttributes` 1:1; migration `20260712221000_f5_player_model`
- Import: schemaVersion 2 required; v1 rejected with migration message; complete player-model validation via engine
- APIs: list compact F5 fields; detail `playerModel` (no hidden floor/ceiling/risk); team roster compact F5 fields
- UI: Players list CA/role/potential/model; Player Profile tabs; Team Overview roster CA/role/model
- Legacy: structural players without attributes → `modelStatus: INCOMPLETE`
- Tests: 20 engine + 62 server (incl. migrations through F5)

Not in F5:
- Commissioner editing (F6+)
- Annual development / aging ops (F24)
- Role/currentAbility DB filters/sorts (deferred — derive-on-read)
- Chemistry, tactics fit, lineups, match sim, scouting actions

### M1–M8

Unchanged (gameplay product milestones not started).

---

## 3. Known Bugs / Limitations Worth Remembering

- Default dataset remains the fictional F3/F5 fixture — not real NHL data.
- No owner-prepared production snapshot under `data/world/` yet.
- Role-rating supporting-attribute weights are an **F5 foundation balance approximation** (winning pair + two supports at 3/3/2/2); full spreadsheet branch table was not in the repo.
- Hidden `potentialFloor` / `potentialCeiling` / `developmentRisk` are persisted but never on ordinary public player JSON.
- Public potential is only `publicPotentialEstimate` bands (`LOW`…`ELITE`/`UNKNOWN`) — no scouting noise yet.
- Derived role/CA filtering & sorting deferred to keep pagination DB-backed.
- Team Overview Roster/Lines/Tactics tabs remain disabled placeholders.
- F5 changes not yet committed/pushed.
- SQLite `contains` search is case-sensitive depending on collation.

---

## 4. Nearest Next Steps

1. Commit/push F5 when the owner requests.
2. **F6** — Commissioner Mode / structural editing (when requested).
3. Replace fictional fixture with owner-prepared `data/world/` (schemaVersion 2) when available.

---

## 5. Recent Changes

> Ordinary repository-relevant history, newest first.

### 2026-07-13 — F5 Player Model Foundation

- Work completed: engine skater/goalie model; Prisma attribute relations; schemaVersion 2 import; public derived ratings/roles; Player Profile UI; engine+server tests; docs
- Files/areas affected: `packages/engine/src/{players,goalies,config}`, Prisma F5 migration, initialization schemas/importer, `player-model` service, client players/team pages, fixture, docs
- Validation: prisma format/validate/generate; empty→F5 migrations; 20 engine + 62 server tests; builds/typechecks; setup CLI; API smoke (see iteration report)
- Remaining limitations or follow-up: F5 not committed; role-weight table is foundation approximation; F6 not started

### 2026-07-12 — F4 World Dashboard and Browsers

- Work completed: world summary API; paginated browsers; committed/pushed `c50ce83`
- Remaining limitations or follow-up: was next F5

### 2026-07-12 — F3 World Initialization committed

- Work completed: F3 import boundary committed/pushed `58adfc0`

### 2026-07-12 — F2 foundational schema committed

- Work completed: `3e6f343`

### 2026-07-12 — F1 shell committed

- Work completed: `bf1d0ab`

---

## 6. Significant Changes

> Permanent history, newest first.

### 2026-07-13 — F5 player-model foundation (skater/goalie split)

- Significance: First simulation-ready attribute/role/rating model; import contract schemaVersion 2; hidden vs public potential boundary
- Decision or milestone: Persist attributes + development profile; derive ratings/roles in engine on read; 1–20 attributes / 0–100 ratings; goalies never use skater attrs; roles from config pairs/profiles; incomplete legacy players stay readable
- Lasting impact: Later development, chemistry, scouting, and sim must consume this model rather than invent parallel overalls
- Related files/areas: `@fhm/engine` players/goalies/config; Prisma `SkaterAttributes`/`GoalieAttributes`; dataset schemaVersion 2

### 2026-07-12 — F4 read-only world browsers

- Significance: First usable inspection UI for the living hockey world after initialization
- Related files/areas: commit `c50ce83`

### 2026-07-12 — F3 one-time local world initialization boundary

- Significance: Empty DB → living world snapshot path
- Related files/areas: commit `58adfc0`

### 2026-07-12 — F2 foundational world schema + read APIs

- Related files/areas: commit `3e6f343`

### 2026-07-12 — F1 foundation: shell without gameplay

- Related files/areas: commit `bf1d0ab`

### 2026-07-10 — Mandatory end-of-iteration CURRENT_STATUS maintenance

- Related files/areas: `AI_AGENTS.md` §12–§13

---

## 7. Maintenance Policy

This document must be reviewed after **every** agent iteration (`AI_AGENTS.md` §13.1).
