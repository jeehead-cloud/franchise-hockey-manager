# Franchise Hockey Manager — Current Status

**Status:** Active
**Last updated:** 2026-07-13
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Local repository path:** `C:\Projects\franchise-hockey-manager`

> Snapshot of what the app can do now, plus maintained Recent / Significant history for future AI-agent sessions.
> End-of-iteration maintenance is mandatory — see `AI_AGENTS.md` §13.1–§13.2 and §5–§7 below.

---

## 1. Current Development Phase

**F9 — Chemistry and Effective Performance: implemented locally (not committed).** Config-driven role/personality chemistry, coach and tactical fit, bounded effective performance, explainable unit results, read-only Team Lines UI, and `GET /api/teams/:id/chemistry`. Familiarity is represented as 0 / `NOT_TRACKED_YET`. No new Prisma migration.

**Next milestone: F10 — Simulation Configuration** (do not start until requested).

F1–F8 remain complete on `main` (through `2734258`).

---

## 2. Milestone Status

### F1–F7

Complete on `main`.

### F8 — Lines and Auto-Lineup (Done)

Committed/pushed: `2734258`.

### F9 — Chemistry and Effective Performance (Done locally)

Implemented:
- Engine `packages/engine/src/chemistry/` + config JSON (`chemistry-weights`, role/personality/coach/tactical fit)
- Config version `f9-v1`; validated matrices and caps
- Unit chemistry for forward lines and defense pairs; goalie context fit without fake line chemistry
- Effective performance = baseAbility × (1 + clamped totalModifier); total cap ±0.30
- Familiarity field present but not accumulated
- Derived on read — not persisted
- `GET /api/teams/:id/chemistry` (normal mode)
- Team Lines chemistry summary + unit cards
- Non-linearity proof tests (lower CA + strong fit can beat higher CA + weak fit)

Not in F9:
- Familiarity growth, match simulation, chemistry-optimized auto-lineup, F10 balance presets

### M1–M8

Unchanged.

---

## 3. Known Bugs / Limitations Worth Remembering

- Chemistry weights are F9 foundation balance approximations — tune via config, not code forks.
- Familiarity does not accumulate yet.
- Auto-lineup remains F8 (ability/position), not chemistry-aware.
- Poor chemistry is informational only — does not change READY.
- Manual UI verification for F9 was **NOT RUN**.
- F9 changes not yet committed/pushed.
- Commissioner header is not security.

---

## 4. Nearest Next Steps

1. Commit/push F9 when the owner requests.
2. Manual UI pass on disposable DB (complementary vs redundant, coach/tactics edits).
3. **F10 — Simulation Configuration** (when requested). Do not start match events early.

---

## 5. Recent Changes

> Ordinary repository-relevant history, newest first.

### 2026-07-13 — F9 Chemistry and Effective Performance

- Work completed: chemistry engine + configs; non-linearity tests; chemistry API; Team Lines UI; docs
- Validation: 66 engine + 115 server tests; typecheck/build; prisma validate/migrate status (7 migrations, no F9 migration); setup validate; API smoke PASS (Frostbite chemistry after auto-lineup, config `f9-v1`, deterministic); manual UI **NOT RUN**
- Remaining: F9 uncommitted; familiarity not accumulated; no chemistry auto-lineup; manual UI pass

### 2026-07-13 — F8 Lines and Auto-Lineup

- Work completed: committed/pushed `2734258`

---

## 6. Significant Changes

> Permanent history, newest first.

### 2026-07-13 — F9 non-linear chemistry foundation

- Significance: First bounded, explainable performance layer beyond raw current ability.
- Decision: Config-driven role/personality/coach/tactical fits; familiarity stubbed at 0; derive on read; READY unchanged by chemistry quality.
- Lasting impact: F10+ simulation must consume these modifiers without collapsing back to overall-only production.

### 2026-07-13 — F8 main lineup foundation

- Related: commit `2734258`

---

## 7. Maintenance Policy

This document must be reviewed after **every** agent iteration (`AI_AGENTS.md` §13.1).
