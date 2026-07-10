# Franchise Hockey Manager — Current Status

**Status:** Active
**Last updated:** 2026-07-10
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Local repository path:** `C:\Projects\franchise-hockey-manager`

> This is the frequently updated implementation snapshot for Franchise Hockey Manager.
> It records what's actually implemented (per milestone), what's known-broken or deliberately deferred, and the nearest next steps.
> Update this after every task — see `AI_AGENTS.md` §13.1 and the maintenance rule at the end.

---

## 1. Current Development Phase

**MVP scaffold running locally, not yet committed.** The monorepo (`packages/engine`, `packages/server`, `packages/client`) is scaffolded and verified end-to-end: Prisma seed creates one NHL league with 32 real teams and generated rosters (~674 players), Fastify serves `GET /api/teams` and `GET /api/teams/:id`, and the React client lists teams and shows per-team rosters. Working tree is dirty; nothing has been committed to git yet. Chemistry/tactics fit (M3) and game/season simulation (M4) are not started.

---

## 2. Milestone Status

### M1 — Leagues, Teams & Rosters (Active)

Scope: monorepo scaffolding, Prisma schema for League/Team/Player, seed data for real NHL teams, initial roster generation wired end-to-end (generate → persist → display).

Implemented:
- npm workspaces monorepo with `@fhm/engine`, `@fhm/server`, `@fhm/client`.
- Prisma schema: `League`, `Team`, `Player` (SQLite); initial migration applied.
- Seed: 1× "NHL" league, 32 current NHL teams (`data/nhl-teams.json`), ~20–22 players per team (~674 total).
- REST: `GET /api/teams`, `GET /api/teams/:id` (team + roster).
- Client: Teams page (all 32) and Roster page (name, position, age, Curr.Total, role, role rating, 9 attrs).
- Starter national name pools under `data/names/` (Canada, USA, Russia, Sweden, Finland, Czechia).

Not yet done / known gaps:
- No `Coach` entity on Team yet (needed before chemistry/tactics fit).
- Scaffold not committed to git.
- Prisma `package.json#prisma` seed config triggers a deprecation warning (Prisma 7 config migration pending).

### M2 — Player Generation & Attributes (Active)

Scope: full generator per `PLAYER_MODEL.md` — 9 attributes, offense/defense split, dev-state/stability draws (frozen at generation, per `PRODUCT_RULES.md` §4), archetype/role derivation, aging curve applied over time.

Implemented:
- `generatePlayer` in `@fhm/engine`: identity, growth engine (Start.Total, Dev.rate, Risk/Bonus Pot., dev-state & stability draws, Curr.Total via age-adjusted formula), offense/defense split, 9 core attributes, archetype/role derivation (forward + defenseman pair tables), role rating.
- Randomness frozen at generation time (plain object with concrete numbers persisted via Prisma).
- Config: `aging-curve.json` (PLAYER_MODEL.md §6 table), `role-thresholds.json` (pair → role + role-rating weights), `dev-variance.json`.
- Goalies: distinct placeholder attribute set (reflexes, positioning, rebound control, puck handling, consistency) — not the spreadsheet fixed-50/50 stub.

Known gaps / placeholders:
- Goalie model unfinished — `TODO(PLAYER_MODEL.md §7 item 5)`; no goalie archetypes.
- Attribute-vs-Curr.Total scaling is a temporary age-growth approximation (`PLAYER_MODEL.md` §7 item 2) — not a finalized rule.
- Role-rating per-role weight tables are approximate placeholders (full spreadsheet weights were unavailable).
- `Cur.Over.Tot.` / `Over.Pot.` computed & stored; compact R/P display purpose undecided (`PLAYER_MODEL.md` §7 items 3–4).
- Stability drift across seasons undecided (`PLAYER_MODEL.md` §7 item 6) — currently frozen once at generation.
- Face-offs field not implemented (`PLAYER_MODEL.md` §7 item 7).

### M3 — Chemistry & Tactics Fit (Not started)

Scope: the core non-linear performance engine — line synergy, coach-style/tactics fit modifiers, contextual modifiers.

Implemented: nothing yet. This is the project's central design challenge (`PROJECT.md` §1) and should not be rushed once started. Blocked on adding a `Coach` entity so player preferred style/tactics can be compared to team coach.

### M4 — Season Simulation Engine (Not started)

Not started.

### M5 — Draft & Scouting (Not started)

Not started.

### M6 — Contracts, Cap & Transactions (Not started)

Not started.

### M7 — Automation & AI GMs (Queued)

Not started. No design work done beyond the high-level mention in `PROJECT.md`.

### M8 — Server Deployment & Multiplayer (Queued)

Not started. Hosting provider and domain are undecided — see `DEPLOYMENT.md`.

---

## 3. Known Bugs / Limitations Worth Remembering

- **Nothing committed to git yet** — entire MVP scaffold (and docs) remain untracked/uncommitted on `main`.
- **Goalie model** is a minimal distinct placeholder only (`PLAYER_MODEL.md` §7 item 5); not first-class.
- **9 core attributes vs. Curr.Total**: MVP grows base rolls with age using the growth term; true scaling rule still open (`PLAYER_MODEL.md` §7 item 2).
- **Role-rating weights** in `role-thresholds.json` are approximate, not verified against the full spreadsheet tables.
- **`Cur.Over.Tot.` / `Over.Pot.` / R / P**: parallel rating numbers; UI purpose not decided (`PLAYER_MODEL.md` §7 items 3–4).
- **Stability drift** across seasons not designed (`PLAYER_MODEL.md` §7 item 6).
- **Face-offs** not implemented (`PLAYER_MODEL.md` §7 item 7).
- **No Coach entity** yet — required before M3 chemistry/tactics fit.
- **Prisma seed config deprecation warning** (`package.json#prisma` → Prisma 7 config file).
- Name pools are small starter lists, not production-scale national pools.

---

## 4. Nearest Next Steps

1. **Commit the MVP scaffold** to git (explicit owner request) so the runnable baseline is on `main`.
2. Add a **Coach** entity (philosophy + tactics) on Team, matching player preferred-style fields.
3. Begin **M3 — Chemistry & Tactics Fit** (line synergy, coach-style/tactics fit, config-driven weights).
4. Resolve open M2 design questions as they block sim feel (attribute scaling, goalie model, role-rating weight fidelity) — do not block M3 on polishing every §7 item first.

---

## 5. Maintenance Rule

Update this document after **every** task (see `AI_AGENTS.md` §13.1), including when:

- a milestone's status changes (Not started ↔ Active ↔ effectively done);
- any feature ships, is partially done, aborted, or blocked;
- a known bug/limitation is found or fixed;
- a "not yet done" / known-gaps item in this file gets implemented or newly discovered.

Don't turn this file into a commit-by-commit changelog — keep it at the level of "what can this app actually do right now," matching the milestone table in `PROJECT.md`.
