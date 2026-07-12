# Franchise Hockey Manager — Current Status

**Status:** Active
**Last updated:** 2026-07-13
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Local repository path:** `C:\Projects\franchise-hockey-manager`

> Snapshot of what the app can do now, plus maintained Recent / Significant history for future AI-agent sessions.
> End-of-iteration maintenance is mandatory — see `AI_AGENTS.md` §13.1–§13.2 and §5–§7 below.

---

## 1. Current Development Phase

**F7 — Coaches, Tactics, and Team Setup: implemented locally (not committed).** Coach ratings, team tactical style, head-coach assignment, roster-status management, schemaVersion 3 import, engine readiness, Commissioner-gated writes with audit, and Coaches/Team Setup UI are in the working tree.

**Next milestone: F8 — Lineups and Chemistry** (do not start until requested).

F1–F6 remain complete on `main` (`bf1d0ab`, `3e6f343`, `58adfc0`, `c50ce83`, `f2e8ec5`, `d8dccb1`).

---

## 2. Milestone Status

### F1 — Monorepo and Application Shell (Done)

Committed/pushed: `bf1d0ab`.

### F2 — Core Database Model (Done)

Committed/pushed: `3e6f343`.

### F3 — World Initialization and Real Data Import (Done)

Committed/pushed: `58adfc0`. Dataset format advanced to **schemaVersion 3** under F7 (v1/v2 rejected with clear messages).

### F4 — World Dashboard and Browsers (Done)

Committed/pushed: `c50ce83`. Extended by F7 with readiness fields and Coaches browser.

### F5 — Player Model Foundation (Done)

Committed/pushed: `f2e8ec5`.

### F6 — Commissioner Editing (Done)

Committed/pushed: `d8dccb1`. F7 reuses the same header gate, optimistic concurrency, and append-only audit log.

### F7 — Coaches, Tactics, and Team Setup (Done locally)

Implemented:
- Coach ratings `overallCoaching` / `playerDevelopment` / `offense` / `defense` (1–20, nullable on legacy rows)
- `Team.tacticalStyle` (nullable at DB; required for READY)
- One head coach per team via `Coach.currentTeamId` unique; unassigned coaches allowed
- Engine `evaluateTeamReadiness` (12F / 6D / 2G from ACTIVE+RESERVE; PROSPECT and UNAVAILABLE excluded)
- schemaVersion 3 import (coach ratings + team tactics); v1/v2 rejected
- Commissioner coach create/edit, team setup assign/unassign/replace/move (explicit flags), roster-status PATCH
- Audit entity types COACH/TEAM and F7 actions
- Coaches list/detail/edit/new UI; Team Overview/Roster/Setup; World readiness summary

Not in F7:
- Lineups, auto-lineup, chemistry, coach/tactics fit scoring, matches, auth

### M1–M8

Unchanged.

---

## 3. Known Bugs / Limitations Worth Remembering

- Default dataset remains the fictional fixture — not real NHL data. Fixture depth is intentionally small → teams are typically **NOT_READY** on positional totals.
- Commissioner header is a **local safety boundary**, not security.
- Manual UI verification for F7 was **NOT RUN** in the implementing agent session (API/tests covered).
- Legacy coaches/teams may have null ratings / null tactical style until reimport or Commissioner edit; readiness reports FAIL until filled.
- PROSPECT players are excluded from F7 main-team readiness depth (must promote to ACTIVE/RESERVE).
- Role-rating weights remain F5 foundation approximations.
- Hidden potential still absent from ordinary public player DTOs; Commissioner detail exposes it.
- F7 changes not yet committed/pushed.
- SQLite `contains` search is case-sensitive depending on collation.
- Team list readiness filter may post-filter after DB pagination (acceptable for small worlds).

---

## 4. Nearest Next Steps

1. Commit/push F7 when the owner requests.
2. Manual UI pass on a disposable schemaVersion 3 fixture database.
3. **F8 — Lineups and Auto-Lineup** (when requested). Do not start F9 chemistry early.

---

## 5. Recent Changes

> Ordinary repository-relevant history, newest first.

### 2026-07-13 — F7 Coaches, Tactics, and Team Setup

- Work completed: Prisma F7 migration; schemaVersion 3 fixtures/import; engine readiness + 11 tests; Commissioner coach/team-setup/roster-status APIs; Coaches browser + Team Setup/Roster UI; World readiness counts; docs
- Files/areas affected: `packages/engine/src/team-setup/**`, `packages/server` migration/services/routes/tests, `packages/client` coaches/team/world pages, `data/fixtures`, docs
- Validation: 31 engine + 96 server tests; prisma format/validate/generate; empty→F7 and F6→F7 migrate deploy; setup validate/preview/init; typecheck/build; API smoke PASS; manual UI **NOT RUN**
- Remaining limitations or follow-up: F7 local uncommitted; fixture teams NOT_READY on depth; no lineups/chemistry

### 2026-07-13 — F6 Commissioner Editing

- Work completed: committed/pushed `d8dccb1`

### 2026-07-13 — F5 Player Model Foundation

- Work completed: committed/pushed `f2e8ec5`

### 2026-07-12 — F4 World Dashboard and Browsers

- Work completed: committed/pushed `c50ce83`

### 2026-07-12 — F3 World Initialization committed

- Work completed: `58adfc0`

---

## 6. Significant Changes

> Permanent history, newest first.

### 2026-07-13 — F7 team readiness and setup foundation

- Significance: Establishes auditable team structural readiness before lineups and chemistry.
- Decision: Keep readiness pure in the engine; use explicit `replaceExisting` / `moveFromOtherTeam` flags rather than silently displacing coaches; PROSPECT excluded from available depth; schemaVersion 3 for complete coach/team tactics data.
- Lasting impact: F8 may consume readiness but must not fold in lineup or chemistry outcomes; coach vs team tactical style remain separate concepts.

### 2026-07-13 — F6 Commissioner Mode (sandbox editing + audit)

- Significance: First write path into the living world; auditability; explicit non-auth safety boundary
- Decision: Runtime client mode + header gate; full editable snapshot PATCH; engine authority for derived values; append-only audit; hidden potential only on Commissioner endpoints
- Lasting impact: Later gameplay must not treat Commissioner corrections as normal transactions
- Related files/areas: `/api/commissioner/*`, `CommissionerAuditLog`, `/players/:id/edit` — commit `d8dccb1`

### 2026-07-13 — F5 player-model foundation (skater/goalie split)

- Related files/areas: commit `f2e8ec5`

### 2026-07-12 — F4 read-only world browsers

- Related files/areas: commit `c50ce83`

### 2026-07-12 — F3 one-time local world initialization boundary

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
