# Franchise Hockey Manager — Current Status

**Status:** Active
**Last updated:** 2026-07-12
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Local repository path:** `C:\Projects\franchise-hockey-manager`

> Snapshot of what the app can do now, plus maintained Recent / Significant history for future AI-agent sessions.
> End-of-iteration maintenance is mandatory — see `AI_AGENTS.md` §13.1–§13.2 and §5–§7 below.

---

## 1. Current Development Phase

**F4 — World Dashboard and Browsers: implemented locally (not committed in this iteration).** Read-only World Dashboard plus Teams / Players / Competitions list+detail browsers with search, filters, sort, pagination, URL query state, and loading/empty/error/404 patterns. Server adds `GET /api/world` and paginated query support on teams/players/competitions. Age is derived as of 1 July of the active WorldSeason start year.

**Next milestone: F5 — Player Model Foundation.**

F1–F3 remain complete on `main` (`bf1d0ab`, `3e6f343`, `58adfc0`).

---

## 2. Milestone Status

### F1 — Monorepo and Application Shell (Done)

Committed/pushed: `bf1d0ab`.

### F2 — Core Database Model (Done)

Committed/pushed: `3e6f343`.

### F3 — World Initialization and Real Data Import (Done)

Committed/pushed: `58adfc0` — local dataset import + Setup World.

### F4 — World Dashboard and Browsers (Done locally)

Implemented:
- `GET /api/world` summary (season, counts, structure, warnings, editions, next action)
- Paginated/filtered `GET /api/teams|players|competitions` with allowlisted sort
- Enriched team/player/competition detail DTOs
- Client browsers: `/world`, `/teams`, `/teams/:id`, `/players`, `/players/:id`, `/competitions`, `/competitions/:id`
- URL query params for list filters; fictional fixture badge on dashboard
- Vitest `browsers.test.ts` (+ updated F2 list expectations)

Not in F4:
- Editing / Commissioner
- Attributes, ratings, roles (F5)
- Lineups, tactics, chemistry (later)
- Standings, schedules, matches

### M1–M8

Unchanged (gameplay product milestones not started).

---

## 3. Known Bugs / Limitations Worth Remembering

- Default dataset remains the fictional F3 fixture — not real NHL data.
- No owner-prepared production snapshot under `data/world/` yet.
- Team Overview shows a roster preview; dedicated Roster/Lines/Tactics tabs are disabled placeholders.
- Player Profile shows an explicit F5+ empty state for attributes (no fake values).
- SQLite `contains` search is case-sensitive depending on collation.
- F4 changes not yet committed/pushed.

---

## 4. Nearest Next Steps

1. Commit/push F4 when the owner requests.
2. **F5 — Player Model Foundation** (attributes/ratings structure).
3. Replace fictional fixture with owner-prepared `data/world/` when available.

---

## 5. Recent Changes

> Ordinary repository-relevant history, newest first.

### 2026-07-12 — F4 World Dashboard and Browsers

- Work completed: world summary API; paginated team/player/competition browsers; detail pages; URL filter state; browser Vitest suite; docs
- Files/areas affected: `packages/server/src/services/{world,teams,players,competitions,query}.ts`, domain routes, client pages/components, docs
- Validation: prisma format/validate/generate; 57 server tests; typecheck/build; API + UI smoke on disposable DB
- Remaining limitations or follow-up: F4 not committed; F5 not started

### 2026-07-12 — F3 World Initialization committed

- Work completed: F3 import boundary committed/pushed `58adfc0`
- Remaining limitations or follow-up: next was F4

### 2026-07-12 — F2 foundational schema committed

- Work completed: `3e6f343`

### 2026-07-12 — F1 shell committed

- Work completed: `bf1d0ab`

---

## 6. Significant Changes

> Permanent history, newest first.

### 2026-07-12 — F4 read-only world browsers

- Significance: First usable inspection UI for the living hockey world after initialization
- Decision or milestone: Server-side pagination/filters; URL-reproducible list state; age vs WorldSeason July 1; no F5 placeholder attributes
- Lasting impact: Later milestones extend browsers rather than inventing parallel data access patterns
- Related files/areas: `/api/world`, paginated teams/players/competitions, client browser pages

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
