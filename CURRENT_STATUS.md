# Franchise Hockey Manager — Current Status

**Status:** Active
**Last updated:** 2026-07-13
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Local repository path:** `C:\Projects\franchise-hockey-manager`

> Snapshot of what the app can do now, plus maintained Recent / Significant history for future AI-agent sessions.
> End-of-iteration maintenance is mandatory — see `AI_AGENTS.md` §13.1–§13.2 and §5–§7 below.

---

## 1. Current Development Phase

**F8 — Lines and Auto-Lineup: implemented locally (not committed).** Persistent 20-slot main lineups, secondary positions, deterministic auto-lineup (REPLACE / FILL_EMPTY), Commissioner-gated editing with audit/concurrency, lineup-aware readiness, and schemaVersion 4 import (Frostbite expanded to full depth).

**Next milestone: F9 — Chemistry and Effective Performance** (do not start until requested).

F1–F7 remain complete on `main` (through `542d733`).

---

## 2. Milestone Status

### F1–F6

Complete on `main` (`bf1d0ab` … `d8dccb1`).

### F7 — Coaches, Tactics, and Team Setup (Done)

Committed/pushed: `542d733`.

### F8 — Lines and Auto-Lineup (Done locally)

Implemented:
- `TeamLineup` + `LineupAssignment` (20 slots); partial saves allowed
- `PlayerSecondaryPosition` join model; Commissioner player editor manages secondaries
- Engine `packages/engine/src/lineups/` — validation + deterministic auto-lineup
- Eligibility: ACTIVE/RESERVE + complete model; PROSPECT/UNAVAILABLE excluded
- Invalid assignments retained and surfaced (not silently deleted) when roster/status changes
- Commissioner PUT / auto-fill / audit; normal GET lineup
- Team Lines tab + `/teams/:teamId/lines/edit` (dnd-kit + keyboard fallback)
- Readiness: READY requires valid complete lineup; INVALID → NOT_READY; absent/incomplete → WARNING
- schemaVersion **4**; Frostbite fixture has 20 eligible skaters/goalies; other clubs remain thin

Not in F8:
- Chemistry, tactical/coach fit, special teams, matches, auth

### M1–M8

Unchanged.

---

## 3. Known Bugs / Limitations Worth Remembering

- Default dataset remains fictional. Cedar/Owls remain under-depth → partial auto-lineup / NOT_READY structural checks.
- Commissioner header is a **local safety boundary**, not security.
- Manual UI verification for F8 was **NOT RUN** in the implementing agent session.
- Auto-lineup uses ability + position + limited role tie-break only — not chemistry.
- Invalid lineup assignments are retained until Commissioner corrects them.
- F8 changes not yet committed/pushed.

---

## 4. Nearest Next Steps

1. Commit/push F8 when the owner requests.
2. Manual UI pass on disposable schemaVersion 4 DB (Lines editor, DnD, auto-fill, invalidation).
3. **F9 — Chemistry** (when requested). Do not start match simulation early.

---

## 5. Recent Changes

> Ordinary repository-relevant history, newest first.

### 2026-07-13 — F8 Lines and Auto-Lineup

- Work completed: lineup persistence; secondary positions; engine validation/auto-lineup; schema v4 + Frostbite depth; Commissioner lineup APIs; Lines UI/editor; readiness/world integration; docs
- Validation: 50 engine + 110 server tests; migrate empty→F8 and F7→F8; setup validate/init; typecheck/build; API smoke PASS; manual UI **NOT RUN**
- Remaining: F8 uncommitted; no chemistry

### 2026-07-13 — F7 Coaches, Tactics, and Team Setup

- Work completed: committed/pushed `542d733`

---

## 6. Significant Changes

> Permanent history, newest first.

### 2026-07-13 — F8 main lineup foundation

- Significance: First persisted team lineups and secondary-position model before chemistry.
- Decision: Exact primary/secondary slot fit only; partial saves allowed; invalid assignments retained; auto-lineup deterministic without chemistry; READY requires complete valid 20-slot lineup.
- Lasting impact: F9 chemistry must consume lineups without reinventing slot/eligibility rules.

### 2026-07-13 — F7 team readiness and setup foundation

- Related: commit `542d733`

### 2026-07-13 — F6 Commissioner Mode

- Related: commit `d8dccb1`

---

## 7. Maintenance Policy

This document must be reviewed after **every** agent iteration (`AI_AGENTS.md` §13.1).
