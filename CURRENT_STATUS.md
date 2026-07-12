# Franchise Hockey Manager — Current Status

**Status:** Active
**Last updated:** 2026-07-12
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Local repository path:** `C:\Projects\franchise-hockey-manager`

> Snapshot of what the app can do now, plus maintained Recent / Significant history for future AI-agent sessions.
> End-of-iteration maintenance is mandatory — see `AI_AGENTS.md` §13.1–§13.2 and §5–§7 below.

---

## 1. Current Development Phase

**F1 — Monorepo and Application Shell: complete and ready to commit/push.** Working TypeScript monorepo with `@fhm/engine`, `@fhm/server`, and `@fhm/client`. Server exposes `GET /health` with Prisma/SQLite wiring (`AppMeta` only). Client uses Atlas design tokens adapted from `design/system` and ships the approved shell + placeholder routes. No gameplay systems (leagues, teams, players, generation, chemistry, simulation) are implemented.

**Note:** An earlier pre-F1 scaffold briefly added League/Team/Player seed + generator code; that gameplay surface was removed to align with F1 scope. Leftover `data/` name-pool / NHL team JSON may remain on disk for later milestones but is unused by F1.

**Docs gap:** `PRODUCT_STRUCTURE.md` and `FOUNDATION_IMPLEMENTATION_PLAN.md` were referenced by the F1 prompt but are not present in the repository.

---

## 2. Milestone Status

### F1 — Monorepo and Application Shell (Done)

Implemented:
- npm workspaces: `packages/engine`, `packages/server`, `packages/client`
- Root `build`, `typecheck`, `dev` (concurrently server+client), plus package scripts
- Engine: pure TS package with `getEngineInfo()` wiring export only
- Server: Fastify bootstrap, CORS, error handler, graceful shutdown, `GET /health`, Prisma + SQLite (`AppMeta`)
- Client: React + Vite + Tailwind + React Router; Atlas token CSS copied into `packages/client/src/styles/tokens`; adapted UI primitives (Button, Badge, Panel, Tabs, empty/loading/error, connection status)
- Shell nav: World, Competitions, Teams, Players, Settings, Simulation Lab; Setup outside shell; `/` → `/world`; unknown routes → not-found
- Health status pill in sidebar (and Setup); `VITE_API_URL` optional; Vite proxies `/health`
- Approved design references preserved under `design/system` and `design/screens` (runtime does not import those trees)

Not in F1 (intentional):
- All gameplay entities and APIs
- Player generation / attributes / roles
- Chemistry, tactics, lineups, match/season simulation
- World import / Commissioner editing / auth / deploy

### M1 — Leagues, Teams & Rosters (Not started)

Gameplay data model and real-world seed belong here / later foundation milestones — not present after F1 alignment.

### M2 — Player Generation & Attributes (Not started)

Engine generator intentionally absent in F1.

### M3 — Chemistry & Tactics Fit (Not started)

Not started.

### M4 — Season Simulation Engine (Not started)

Not started.

### M5 — Draft & Scouting (Not started)

Not started.

### M6 — Contracts, Cap & Transactions (Not started)

Not started.

### M7 — Automation & AI GMs (Queued)

Not started.

### M8 — Server Deployment & Multiplayer (Queued)

Not started. Hosting undecided — see `DEPLOYMENT.md`.

---

## 3. Known Bugs / Limitations Worth Remembering

- No gameplay data or domain Prisma models yet (`AppMeta` bootstrap only).
- Design screen extras (National Teams, Transfers, History nav) not wired as F1 routes — F1 nav follows the required six areas + Setup.
- Atlas JSX under `design/system` is reference/adapted, not imported as a package; Lucide via `lucide-react` (not CDN).
- `PRODUCT_STRUCTURE.md` / `FOUNDATION_IMPLEMENTATION_PLAN.md` missing from repo.
- Early MVP gameplay code and seed were removed for F1; do not treat old CURRENT_STATUS “M1/M2 Active” entries as current behavior.
- Windows `localhost` vs `127.0.0.1` quirks: server defaults to `127.0.0.1`; Vite proxy targets `127.0.0.1:3000`.
- Name-pool / NHL JSON under `data/` is unused leftover pending later milestones.

---

## 4. Nearest Next Steps

1. Proceed to **F2** (per foundation plan once available) — core domain / world data — **do not** reintroduce premature full generator without the plan.
2. Add missing foundation docs (`PRODUCT_STRUCTURE.md`, `FOUNDATION_IMPLEMENTATION_PLAN.md`) if they exist outside the repo.
3. Keep Atlas screen designs under `design/` as visual references when building real World/Teams/Players pages.

---

## 5. Recent Changes

> Ordinary repository-relevant history, newest first.
> Keep approximately the latest 3 months. Older entries may be pruned when they are no longer needed to understand the current state.
> This is **not** a commit-by-commit or command-by-command log — skip trivial formatting-only noise.

### 2026-07-12 — F1 reviewed and validated for main

- Work completed: Full F1 review (no gameplay leakage; design/ preserved; secrets/db/dist excluded); typecheck/build/health/proxy re-validated; F1 scaffold committed to `main`
- Files/areas affected: F1 packages, `design/`, docs (`CURRENT_STATUS`, `ARCHITECTURE`, `DEPLOYMENT`, `README`)
- Validation: typecheck PASS; root/engine/server/client build PASS; `/health` PASS; Vite proxy `/health` PASS; `git diff --check` PASS
- Remaining limitations or follow-up: next milestone is F2; foundation plan docs still missing from repo

### 2026-07-12 — F1 Monorepo and Application Shell

- Work completed: Realigned monorepo to F1 — stripped early gameplay (League/Team/Player, generator, team APIs); minimal engine export; Fastify `/health` + Prisma `AppMeta`; Atlas-based client shell and placeholder routes; root `dev`/`build`/`typecheck`; docs updated.
- Files/areas affected: `packages/*`, root `package.json`, `README.md`, `CURRENT_STATUS.md`, `ARCHITECTURE.md`, `DEPLOYMENT.md`; `design/` retained as reference
- Validation: install PASS; engine/server/client/root build PASS; typecheck PASS; `/health` PASS; routes + Vite proxy PASS; `git diff --check` PASS (CRLF warnings only); brief UI open of `/world`
- Remaining limitations or follow-up: no gameplay; missing foundation plan docs

### 2026-07-10 — Mandatory end-of-iteration status maintenance + dual history tracks

- Work completed: Expanded `AI_AGENTS.md` §12–§13; Recent / Significant histories in CURRENT_STATUS
- Files/areas affected: `AI_AGENTS.md`, `CURRENT_STATUS.md`
- Validation: documentation review
- Remaining limitations or follow-up: none for the workflow itself

### 2026-07-10 — Early MVP scaffold (superseded by F1)

- Work completed: Temporary League/Team/Player seed + roster UI + generator (commit `c7fd064`)
- Files/areas affected: `packages/*`, `data/*`
- Validation: prior install/seed/API checks
- Remaining limitations or follow-up: **Superseded** — gameplay surface removed in F1 alignment (2026-07-12)

---

## 6. Significant Changes

> Permanent history of durable milestones and decisions, newest first.
> Entries in this section must **never** be removed merely because of age.
> Agents decide independently whether an iteration belongs here; the owner need not request it.

### 2026-07-12 — F1 foundation: shell without gameplay

- Significance: Establishes the lasting monorepo + client-server + Atlas shell baseline; explicitly defers all gameplay systems
- Decision or milestone: F1 complete — health API, Prisma wiring without domain entities, design-token-driven application shell and placeholder IA
- Lasting impact: Later milestones extend engine/server/client rather than reinventing the shell; early premature gameplay scaffold was rolled back to match foundation scope
- Related files/areas: `packages/engine`, `packages/server`, `packages/client`, `design/`, `ARCHITECTURE.md`, `DEPLOYMENT.md`

### 2026-07-10 — Mandatory end-of-iteration CURRENT_STATUS maintenance

- Significance: Permanently changes how every future Cursor/AI-agent iteration is closed out
- Decision or milestone: Dual Recent (~3 months) / Significant (permanent) histories; agents classify significance; report maintenance before claiming completion
- Lasting impact: Honest snapshot + durable decision log across sessions
- Related files/areas: `AI_AGENTS.md` §12–§13, `CURRENT_STATUS.md` §5–§7

### 2026-07-10 — First monorepo commit on main (historical)

- Significance: Repository moved from docs-only to runnable packages (later realigned by F1)
- Decision or milestone: Initial client-server monorepo commit `c7fd064`
- Lasting impact: Workspace layout and stack choice carried forward; domain seed content did not
- Related files/areas: commit `c7fd064`

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
