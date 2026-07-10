# Franchise Hockey Manager — Current Status

**Status:** Active
**Last updated:** 2026-07-10
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Local repository path:** `C:\Projects\franchise-hockey-manager`

> Snapshot of what the app can do now, plus maintained Recent / Significant history for future AI-agent sessions.
> End-of-iteration maintenance is mandatory — see `AI_AGENTS.md` §13.1–§13.2 and §5–§7 below.

---

## 1. Current Development Phase

**MVP scaffold running locally; core scaffold committed on `main`.** The monorepo (`packages/engine`, `packages/server`, `packages/client`) is scaffolded and verified end-to-end: Prisma seed creates one NHL league with 32 real teams and generated rosters (~674 players), Fastify serves `GET /api/teams` and `GET /api/teams/:id`, and the React client lists teams and shows per-team rosters. Chemistry/tactics fit (M3) and game/season simulation (M4) are not started. Several product docs (`PROJECT.md`, `ARCHITECTURE.md`, `PLAYER_MODEL.md`, `PRODUCT_RULES.md`, `DEPLOYMENT.md`) remain untracked in the working tree.

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
- Prisma `package.json#prisma` seed config triggers a deprecation warning (Prisma 7 config migration pending).
- Remaining product documentation files still untracked (see §1).

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

- **Goalie model** is a minimal distinct placeholder only (`PLAYER_MODEL.md` §7 item 5); not first-class.
- **9 core attributes vs. Curr.Total**: MVP grows base rolls with age using the growth term; true scaling rule still open (`PLAYER_MODEL.md` §7 item 2).
- **Role-rating weights** in `role-thresholds.json` are approximate, not verified against the full spreadsheet tables.
- **`Cur.Over.Tot.` / `Over.Pot.` / R / P**: parallel rating numbers; UI purpose not decided (`PLAYER_MODEL.md` §7 items 3–4).
- **Stability drift** across seasons not designed (`PLAYER_MODEL.md` §7 item 6).
- **Face-offs** not implemented (`PLAYER_MODEL.md` §7 item 7).
- **No Coach entity** yet — required before M3 chemistry/tactics fit.
- **Prisma seed config deprecation warning** (`package.json#prisma` → Prisma 7 config file).
- Name pools are small starter lists, not production-scale national pools.
- Several product docs remain untracked in the working tree (`PROJECT.md`, `ARCHITECTURE.md`, `PLAYER_MODEL.md`, `PRODUCT_RULES.md`, `DEPLOYMENT.md`).

---

## 4. Nearest Next Steps

1. Track/commit the remaining product documentation set when the owner requests it.
2. Add a **Coach** entity (philosophy + tactics) on Team, matching player preferred-style fields.
3. Begin **M3 — Chemistry & Tactics Fit** (line synergy, coach-style/tactics fit, config-driven weights).
4. Resolve open M2 design questions as they block sim feel (attribute scaling, goalie model, role-rating weight fidelity) — do not block M3 on polishing every §7 item first.

---

## 5. Recent Changes

> Ordinary repository-relevant history, newest first.
> Keep approximately the latest 3 months. Older entries may be pruned when they are no longer needed to understand the current state.
> This is **not** a commit-by-commit or command-by-command log — skip trivial formatting-only noise.

### 2026-07-10 — Mandatory end-of-iteration status maintenance + dual history tracks

- Work completed: Expanded `AI_AGENTS.md` §12–§13 so every prompt ends with a CURRENT_STATUS review; restructured this file with Recent / Significant histories; recorded the policy as a Significant change.
- Files/areas affected: `AI_AGENTS.md`, `CURRENT_STATUS.md`
- Validation: documentation review for contradictions; `git diff --check` on the two files (see iteration summary)
- Remaining limitations or follow-up: none for the workflow itself; M1–M8 implementation status unchanged by this docs-only change

### 2026-07-10 — MVP scaffold committed (engine / server / client)

- Work completed: Monorepo MVP with seeded NHL teams/rosters, Fastify team APIs, React teams/roster UI; committed as `c7fd064`
- Files/areas affected: `packages/*`, `data/*`, root workspace config, `README.md`
- Validation: prior iteration reported install/seed/API/client PASS
- Remaining limitations or follow-up: see §3 (goalie placeholder, attr scaling, no Coach, etc.)

---

## 6. Significant Changes

> Permanent history of durable milestones and decisions, newest first.
> Entries in this section must **never** be removed merely because of age.
> Agents decide independently whether an iteration belongs here; the owner need not request it.

### 2026-07-10 — Mandatory end-of-iteration CURRENT_STATUS maintenance

- Significance: Permanently changes how every future Cursor/AI-agent iteration is closed out
- Decision or milestone: After every prompt, agents must review and (when needed) update `CURRENT_STATUS.md`, maintain newest-first **Recent** (~3 months) and **Significant** (permanent) histories, classify significance themselves, and report the maintenance result before claiming completion
- Lasting impact: Future sessions inherit an honest snapshot + durable decision log; failed/incomplete work must be recorded when it changes known state
- Related files/areas: `AI_AGENTS.md` §12–§13, `CURRENT_STATUS.md` §5–§7

### 2026-07-10 — MVP monorepo scaffold (M1/M2 Active)

- Significance: First runnable end-to-end product loop in the repository
- Decision or milestone: Client-server monorepo with pure engine generator, Prisma/SQLite seed of 32 NHL teams, roster UI; randomness frozen at generation (vs spreadsheet live recalc)
- Lasting impact: Baseline architecture and data model for all later milestones; open M2 design gaps carried forward in §3
- Related files/areas: `packages/engine`, `packages/server`, `packages/client`, `data/`, commit `c7fd064`

---

## 7. Maintenance Policy

This document must be reviewed after **every** agent iteration (`AI_AGENTS.md` §13.1), including documentation-only tasks and small fixes.

Required practices:

- **Review every iteration** before writing the final completion summary; never claim completion before this review.
- **Synchronize the snapshot** (§1–§4) with actual repository behavior whenever facts changed.
- **Recent changes** (§5): newest-first; approximately **3-month** retention; prune older ordinary entries only when they no longer help explain the current state.
- **Significant changes** (§6): newest-first; **permanent** retention — never delete merely because of age.
- **Independent significance classification** by the agent (durable milestones, architecture, product/game-design decisions, major migrations, major incidents/root causes, etc.).
- A significant change may also appear under Recent while recent; its Significant entry remains permanent.
- **No low-level noise**: do not log every command run or trivial formatting-only edit.
- **Honest failure recording**: failed validation, incomplete implementation, aborted/blocked work, and newly discovered limitations must be recorded when they affect future work.

The snapshot (§1–§4) stays at the level of "what can this app actually do right now." The histories (§5–§6) carry the narrative future agents need — without becoming a commit-by-commit changelog.
