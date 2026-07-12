# Franchise Hockey Manager — Current Status

**Status:** Active
**Last updated:** 2026-07-13
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Local repository path:** `C:\Projects\franchise-hockey-manager`

> Snapshot of what the app can do now, plus maintained Recent / Significant history for future AI-agent sessions.
> End-of-iteration maintenance is mandatory — see `AI_AGENTS.md` §13.1–§13.2 and §5–§7 below.

---

## 1. Current Development Phase

**F10 — Simulation Configuration: implemented locally (not committed).** Versioned balance presets (`BalancePreset` / immutable `BalancePresetVersion`), singleton active configuration, repository Standard defaults (schemaVersion 1), Commissioner management (duplicate/rename/version/activate/reset/import/export), Settings Game Balance UI, and chemistry consumption of the active preset. No match simulation.

**Next milestone: F11 — Event Engine Core** (do not start until requested).

F1–F9 remain complete on `main` (through `19771ee`).

---

## 2. Milestone Status

### F1–F8

Complete on `main`.

### F9 — Chemistry and Effective Performance (Done)

Committed/pushed: `19771ee`.

### F10 — Simulation Configuration (Done locally)

Implemented:
- Engine `packages/engine/src/balance/` — Zod schema, Standard composition from JSON sources, canonicalize/hash input, runtime settings schema
- Prisma `BalancePreset`, `BalancePresetVersion`, `ActiveBalanceConfiguration` + F10 migration
- Idempotent `balance:bootstrap` (also on world init / `ensureAppMeta`)
- Read APIs `/api/balance/*`; Commissioner write APIs `/api/commissioner/balance/*` with audit
- F9 chemistry loads active chemistry section; exposes preset/version/hash
- F5 player derivation still uses static repository JSON (documented)
- Settings: Game Balance / Runtime & Debug / Commissioner Mode tabs

Not in F10:
- Match simulation, event probabilities consumption, Simulation Lab, F11+

### M1–M8

Unchanged.

---

## 3. Known Bugs / Limitations Worth Remembering

- Balance schema includes inactive future sections (match/shots/…) — structurally validated only.
- F5 ratings still use static engine JSON until a later config-injection refactor.
- Runtime settings in Settings are session-only (not persisted).
- Manual UI verification for F10 was **NOT RUN**.
- F10 changes not yet committed/pushed.
- Commissioner header is not security.

---

## 4. Nearest Next Steps

1. Commit/push F10 when the owner requests.
2. Manual UI pass on disposable DB (duplicate → edit → activate → chemistry refresh → export/import).
3. **F11 — Event Engine Core** (when requested). Do not invent match probabilities beyond inactive placeholders.

---

## 5. Recent Changes

> Ordinary repository-relevant history, newest first.

### 2026-07-13 — F10 Simulation Configuration

- Work completed: balance schema + Standard defaults; preset/version persistence; bootstrap; Commissioner APIs; Settings UI; chemistry active-config integration; docs
- Validation: 74 engine + 123 server tests; typecheck/build; F10 migration; bootstrap idempotent; manual UI **NOT RUN**
- Remaining: F10 uncommitted; no match simulation

### 2026-07-13 — F9 Chemistry and Effective Performance

- Work completed: committed/pushed `19771ee`

---

## 6. Significant Changes

> Permanent history, newest first.

### 2026-07-13 — F10 versioned balance presets

- Significance: First persistent, immutable, activatable balance configuration path for future simulation.
- Decision: Repository JSON remains the Standard source of truth; DB versions are immutable snapshots; exactly one active version; edits create new versions; F9 chemistry consumes active preset; F5 static for now.
- Lasting impact: F11+ must request an immutable config snapshot + runtime overrides rather than reading mutable globals.

### 2026-07-13 — F9 non-linear chemistry foundation

- Related: commit `19771ee`

---

## 7. Maintenance Policy

This document must be reviewed after **every** agent iteration (`AI_AGENTS.md` §13.1).
