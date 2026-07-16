# Franchise Hockey Manager — Project Overview

**Status:** Active development (hobby project)
**Last updated:** 2026-07-10
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Local repository path:** `C:\Projects\franchise-hockey-manager`
**Main branch:** `main`

> This is the primary entry point for understanding the Franchise Hockey Manager project.
> It explains what the product is, who it is for, how its main areas fit together, and where it is going.
>
> For implementation details, use the specialized documents listed in the final section.

---

## 1. Vision

**Franchise Hockey Manager (FHM) is a browser-based, single-player hockey franchise simulation inspired by real-world leagues (starting with the NHL) — built as a personal hobby project, with generated players, non-linear performance mechanics, and gradually increasing automation.**

The owner is both the sole developer and the sole player. There is no multiplayer, no accounts, and no public hosting at this stage. The project is deliberately scoped as an MVP first: a small, working core loop (real leagues/teams → generated rosters → manage lines/tactics → simulate games/seasons) that can be extended incrementally (deeper development mechanics, draft, contracts, AI general managers, server deployment) rather than an attempt to build a full-featured management sim from day one.

**The central design challenge of this project**, stated explicitly by the owner: player performance must be **non-linear**. A player with a high overall rating must not automatically out-produce everyone else — production depends on chemistry with linemates, fit with the coach's tactical philosophy, and situational/contextual modifiers. Every feature added to this project should be evaluated against whether it supports or undermines that principle.

---

## 2. What This Project Is

- A **franchise manager**: the owner controls one team inside a real-world-inspired league structure, manages rosters, lines, and tactics, and progresses through seasons.
- A **player generation and development sim**: new players are procedurally generated each season from national name pools, with attributes, hidden potential, and an aging/development curve.
- A **non-linear performance engine**: game/season simulation results are driven by chemistry, coach-tactics fit, and contextual modifiers — not a simple sum of attributes.
- A **gradually-automating sandbox**: early stages are manual (the owner sets lines, makes trades, runs the draft by hand); later stages introduce automation and, eventually, AI-controlled general managers for other teams.

## 3. What This Project Is Not (For Now)

- Not multiplayer, not networked, not server-authoritative — this comes later, if ever (see `DEPLOYMENT.md`).
- Not aiming for full real-world statistical realism — attributes, roles, and formulas are a stylized abstraction, tuned for "fun and readable," not for matching real NHL analytics.
- Not attempting deep-league or multi-sport scope — one hockey league structure (NHL-inspired) is the initial target; other leagues/nations are extensions, not day-one requirements.
- Not fully automated yet — most actions (line-setting, trades, draft picks) are performed manually by the owner in the early milestones.

---

## 4. Core Product Loop

**Pick/seed a league and teams → generate rosters → set lines and tactics → simulate games/seasons → watch players develop, draft new talent, manage contracts and the salary cap.**

1. **Setup phase**: real NHL-inspired leagues/teams/rosters are seeded (generated players filling out real team names/cities). The owner picks or is assigned a team to manage.
2. **Management phase**: the owner sets line combinations, assigns a coach and tactical style, reviews scouting reports, makes trades, and manages contracts/cap — all manual in the MVP.
3. **Simulation phase**: games and full seasons are simulated using the non-linear performance engine (chemistry + tactics fit + contextual modifiers), producing box scores, standings, and season awards.
4. **Progression**: each season, players age/develop according to the growth model, a new draft class is generated from national name pools, and the cycle repeats.

---

## 5. Main Product Areas

### 5.1. Leagues, Teams & Rosters (Milestone M1)

- Data model for League → Conference/Division → Team, seeded with real NHL teams/cities as the initial dataset.
- Each team gets a generated starting roster (see `PLAYER_MODEL.md`).

### 5.2. Player Generation & Attributes (Milestone M2)

- Procedural player generation from per-nationality name pools.
- 9 core attributes, offense/defense split, archetypes/roles derived from attribute combinations, hidden potential vs. visible current ability. Full model in `PLAYER_MODEL.md`.

### 5.3. Chemistry & Tactics Fit (Milestone M3) — the core design pillar

- Line chemistry (synergy between linemates' archetypes).
- Coach philosophy × player preferred-style compatibility modifiers.
- Contextual modifiers (fatigue, streaks, clutch factor, personality/locker-room effects).
- All formulas/weights externalized to config files so game feel can be tuned without code changes (see `ARCHITECTURE.md` §"Config-driven balance").

### 5.4. Season Simulation Engine (Milestone M4)

- Schedule generation, per-game simulation (event-based or statistical, informed by chemistry/tactics fit), standings, playoffs.

### 5.5. Draft & Scouting (Milestone M5)

- Draft-class generation each season (same generator as rosters, but younger/prospect-focused).
- Scouting "fog of war": true attributes are hidden; scouted values are a noisy estimate that improves with scouting investment.
- Draft order/lottery, draft-day flow.

### 5.6. Contracts, Cap & Transactions (Milestone M6)

- Salary cap, contract length/value, free agency, arbitration, trades (manual first; AI trade logic for other teams comes with M7).

### 5.7. Automation & AI General Managers (Milestone M7 — queued)

- Automated simulation of other teams' decisions (trades, lineups, draft picks).
- Eventually: AI GMs with distinct "personalities" (aggressive trader, conservative builder, etc.).

### 5.8. Server Deployment & Multiplayer (Milestone M8 — queued)

- Deploying the existing client-server architecture to a public host with a domain.
- Possible future multiplayer (friends' leagues) — not designed yet.

---

## 6. Roadmap (Milestones)

| # | Milestone | Scope | Status |
|---|---|---|---|
| M1 | Leagues, Teams & Rosters | Data model, Prisma schema, seed real NHL teams + generated rosters | Not started |
| M2 | Player Generation & Attributes | Generator engine, archetypes/roles, aging/development curve | Not started |
| M3 | Chemistry & Tactics Fit | Non-linear performance engine (the core design pillar) | Not started |
| M4 | Season Simulation Engine | Schedule, game sim, standings, playoffs | Not started |
| M5 | Draft & Scouting | Draft classes, fog-of-war scouting, draft-day flow | Not started |
| M6 | Contracts, Cap & Transactions | F28 contracts/free agency + F29 trades/rights transfers committed on `main`; F30 offseason orchestration committed on `main`; F31 season transition implemented locally; salary cap deferred | In progress |
| M7 | Automation & AI GMs | Automated other-team decisions, AI GM personalities | Queued |
| M8 | Server Deployment & Multiplayer | Public hosting on a domain, possible multiplayer | Queued |

"Not started" milestones are scoped but have no code yet — see `CURRENT_STATUS.md` for the up-to-date, granular breakdown.

---

## 7. Strategic Product Filters

Since this is a solo hobby project with no external users, the guiding question for any new feature is:

1. Does it make the owner's own game more fun to build or play next?
2. Does it support the non-linear performance principle (§1), rather than working against it?
3. Does it keep the codebase simple enough for one person (plus AI coding agents) to maintain?
4. Does it avoid over-engineering for hypothetical future needs (multiplayer, AI GMs, server deployment) before the current milestone actually requires them?

---

## 8. High-Level Infrastructure

### Repository

- GitHub: `https://github.com/jeehead-cloud/franchise-hockey-manager`
- Main branch: `main`
- Local path: `C:\Projects\franchise-hockey-manager` *(adjust to your machine)*

### Stack (see `ARCHITECTURE.md` for full detail)

- TypeScript monorepo (npm/pnpm workspaces)
- `packages/engine` — pure simulation/generation logic, no UI or server dependency
- `packages/server` — Node.js + Fastify + Prisma + SQLite (REST API)
- `packages/client` — React + Vite + Tailwind CSS
- Config-driven balance: formulas and coefficients live in JSON files under `packages/engine/src/config`, not hardcoded

### Hosting / Deployment

**Not yet decided (TBD).** The project currently only runs locally via `npm run dev`. The architecture is client-server from day one specifically so that deploying later (to any Node-capable host) doesn't require a rewrite — see `DEPLOYMENT.md` for the current (local-only) state and open decisions.

---

## 9. Development Philosophy

### Solo hobby project, AI-agent-assisted

The owner works with Cursor (and potentially other AI coding agents) to implement changes. See `AI_AGENTS.md` for mandatory agent operating rules — in particular, **always confirm which project/repository you are working in**, since the owner may run several projects in parallel.

### Fun first, complexity added deliberately

Start with manual management and simple mechanics; automate and deepen only once the simpler version is working and feels good. Don't build M6/M7/M8 mechanics ahead of the milestone that actually needs them.

### Config-driven balance

Formulas for aging, development variance, chemistry, and tactics fit are deliberately externalized to JSON config files (see `ARCHITECTURE.md`), so game balance can be iterated on without touching code — this mirrors how the original spreadsheet prototype (see `PLAYER_MODEL.md`) made every coefficient an editable cell.

### Non-linear performance is the north star

Any simulation or UI feature that would make "highest overall attribute wins" true again should be treated as a regression against the project's central design goal (§1).

---

## 10. Documentation System

- **`PROJECT.md`** — this file. Vision, product areas, roadmap.
- **`AI_AGENTS.md`** — mandatory operating instructions for Cursor and other AI coding agents, including the repository-context requirement.
- **`PRODUCT_STRUCTURE.md`** — target product structure: single-world sandbox, navigation, screens, simulation principles.
- **`FOUNDATION_IMPLEMENTATION_PLAN.md`** — F1–F33 foundation sequence and milestone definitions.
- **`ARCHITECTURE.md`** — tech stack, monorepo structure, data flow, config-driven balance approach, algorithmic lessons learned.
- **`PLAYER_MODEL.md`** — the detailed player data model: attributes, growth/aging formulas, archetypes/roles, and the design questions carried over from the original spreadsheet prototype.
- **`PRODUCT_RULES.md`** — game design invariants: chemistry/tactics-fit rules, aging rules, draft/scouting rules, and what's explicitly deferred.
- **`CURRENT_STATUS.md`** — frequently updated snapshot: what's implemented per milestone, known bugs/limitations, next steps.
- **`DEPLOYMENT.md`** — current (local-only) deployment state and what will need deciding before shipping anywhere public.

## 11. Recommended Reading Order

1. `PROJECT.md`
2. `AI_AGENTS.md`
3. `CURRENT_STATUS.md`
4. `PRODUCT_STRUCTURE.md`
5. `FOUNDATION_IMPLEMENTATION_PLAN.md`
6. `PRODUCT_RULES.md`
7. `PLAYER_MODEL.md`
8. `ARCHITECTURE.md`
9. `DEPLOYMENT.md`

## 12. Source-of-Truth Hierarchy

When information conflicts, use this order:

1. current repository code and actual running behavior;
2. `PRODUCT_STRUCTURE.md` / `FOUNDATION_IMPLEMENTATION_PLAN.md` (target product and foundation sequence);
3. `PRODUCT_RULES.md`;
4. `PLAYER_MODEL.md`;
5. `ARCHITECTURE.md`;
6. `CURRENT_STATUS.md`;
7. `PROJECT.md`;
8. old chat history / memory.

## 13. Maintenance Policy

Update this file when the vision, milestone list, or high-level stack changes. Day-to-day progress belongs in `CURRENT_STATUS.md`, not here.

---

## Guiding Rule

**Keep the core loop (seed league/teams → generate players → manage lines/tactics → simulate → develop/draft) simple and working end-to-end before adding width (advanced contracts, AI GMs, server deployment). A small working game beats a large half-built one — and every simulation feature should make "the 99-rated player doesn't automatically dominate" more true, not less.**
