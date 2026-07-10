# Franchise Hockey Manager — AI Agent Operating Guide

**Status:** Active
**Last updated:** 2026-07-10
**Applies to:** Cursor, Codex, Claude Code, ChatGPT, and other AI coding agents
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Local repository path:** `C:\Projects\franchise-hockey-manager`

> This document is mandatory reading for any AI agent working on Franchise Hockey Manager.
> It defines how repository context must be verified, how changes must be scoped, and how results must be reported.
>
> **The single most important rule on this project:** the owner may work on several unrelated projects in parallel. Every prompt and every response must clearly state which project/repository is being worked on, so a prompt or answer is never accidentally applied to, or confused with, a different project.

---

## 1. Primary Rule

**Never assume you are in the correct repository. Verify it before doing any work, and say so out loud.**

Every task must begin with repository verification, and every response must restate the project name.

---

## 2. Required Repository Context Block in Every Prompt

```text
Repository context

Project: Franchise Hockey Manager
Repository: franchise-hockey-manager
Repository path: C:\Projects\franchise-hockey-manager
Remote: https://github.com/jeehead-cloud/franchise-hockey-manager.git
Expected branch: main

Current state

<Describe the known working tree state, or say "Expected working tree: clean".>

Task

<Describe the exact task.>

Before making changes, verify:
- current working directory
- git remote -v
- current branch
- git status
- changed files match the stated current state
```

If the prompt refers to another repository, another local path, or another remote, the agent must stop and flag the mismatch instead of guessing.

---

## 3. Mandatory Repository Verification

Before inspecting or editing code, run or verify the equivalent of:

```powershell
Get-Location
git rev-parse --show-toplevel
git remote -v
git branch --show-current
git status --short
```

### Stop Conditions

Stop immediately and report the mismatch if:

- the repository root is not the expected path;
- the remote is not the expected one;
- the prompt clearly references another project (different tech stack, different game genre, different repo name);
- the current branch is not `main` and the task didn't explicitly say to use another branch;
- unexpected uncommitted changes exist that don't match the stated current state.

Do not silently continue in a similar-looking repository or assume "this is probably the right one."

---

## 4. Required Header in Every Agent Response

Every substantive response (planning, implementation summary, bug report, or anything that touches code) must begin with:

```text
Repository context

Project: Franchise Hockey Manager
Repository: franchise-hockey-manager
Repository path: C:\Projects\franchise-hockey-manager
Remote: https://github.com/jeehead-cloud/franchise-hockey-manager.git
Branch: main
Working tree: <clean / dirty>
```

If the working tree is dirty, list the changed files immediately after.

---

## 5. Scope Discipline

### One Prompt = One Task

Each prompt should describe one logical task (e.g. "implement the chemistry synergy formula for line combinations" or "add the Prisma schema for Team and Player"). Do not combine unrelated work (a new engine formula + an unrelated UI refactor + a documentation update) into one prompt unless explicitly requested.

### One Commit = One Logical Change

A commit should be easy to review and revert. Don't mix a simulation-engine change with unrelated cleanup, formatting changes, or dependency bumps.

### Do Not Expand Scope Silently

If you notice an adjacent bug or missing piece while working:

1. finish the requested task;
2. report the additional issue clearly;
3. do not fix it unless it blocks the requested work, or the owner explicitly asks.

---

## 6. Before Editing Code

For anything beyond a trivial one-line fix:

1. inspect the relevant files (`packages/engine/src/**`, `packages/server/src/**`, `packages/client/src/**`) before proposing a change;
2. trace how data actually flows (e.g. Prisma model → server route → client fetch → React component) rather than guessing;
3. check whether a similar helper/formula already exists in `packages/engine` before writing a new one — in particular, check `packages/engine/src/config/*.json` before hardcoding any coefficient, threshold, or weight; new or changed balance numbers belong in config, not inline in code;
4. for anything involving the chemistry/tactics-fit formulas, the aging/development curve, or archetype derivation, double-check the logic numerically (a small script printing a few example players/lines through the formula) rather than trusting a visual code read alone — these are the parts of the project most likely to have subtle sign errors, off-by-one age lookups, or double-counted modifiers.

Do not begin by editing the first visible file without this quick investigation for non-trivial tasks.

---

## 7. Architecture Principles

Read `ARCHITECTURE.md` before making structural changes. In brief:

- Simulation and generation logic (player generation, aging, chemistry, tactics-fit, game/season simulation) lives in `packages/engine`, as pure TypeScript with no dependency on Fastify or React. The server and any future CLI/test scripts call into it — it should never be reimplemented inline in a route handler or a component.
- Persistent state (leagues, teams, players, contracts, season/game history) lives in SQLite via Prisma, accessed only from `packages/server`. The client never talks to the database directly.
- The client (`packages/client`) reads data through the server's REST API and dispatches actions back to it — it should not carry its own duplicate copies of game logic or formulas.
- Balance coefficients and formula parameters (aging curve, dev-rate ranges, chemistry weights, role-derivation thresholds) live in `packages/engine/src/config/*.json` as declarative data — new or tuned values should be added there, not hardcoded into TypeScript.

---

## 8. Game Design Rules

Before changing gameplay behavior, read `PRODUCT_RULES.md` and `PLAYER_MODEL.md`. Important examples:

- Player performance must stay **non-linear**: a single "overall" number must never be the sole or dominant driver of in-game production — chemistry and tactics-fit modifiers must meaningfully move outcomes. Don't ship a simulation change that collapses this back to "highest attribute wins."
- Randomized generation values (initial attributes, dev-state, stability-state draws) are rolled **once at generation time and persisted** — never re-rolled on every read/request. This is a deliberate departure from the original spreadsheet prototype (see `PLAYER_MODEL.md`), which recalculated live.
- Archetypes/roles are **derived** from a player's attribute profile (see the role-mapping tables in `PLAYER_MODEL.md`), not manually assigned — if the underlying attributes change, the role should be recomputed, not left stale.
- Goalies use a distinct attribute/role model from skaters — don't apply skater role-derivation logic to a goalie record.
- Scouted attribute values shown to the owner for prospects must be a noisy estimate of the true (hidden) values, not the true values themselves — see the scouting fog-of-war rule in `PRODUCT_RULES.md` once implemented.

---

## 9. Testing and Validation

This is a TypeScript monorepo (`packages/engine`, `packages/server`, `packages/client`). The standard checks are:

```powershell
npm run build --workspace=packages/engine
npm run build --workspace=packages/server
npm run build --workspace=packages/client
```

Run the relevant one(s) after every non-trivial change and report the result honestly:

- `PASS` only if the command was actually run and succeeded;
- `NOT RUN` if it wasn't run;
- `FAIL` with the actual error output if it failed.

For `packages/engine` specifically (generation, aging, chemistry, tactics-fit, simulation formulas), prefer adding small Vitest unit tests alongside the code as these formulas stabilize — this is the part of the project where a silent formula bug is hardest to notice by eye. Until a test suite exists, a throwaway script that runs a formula against a handful of example players/lines and prints the result is an acceptable substitute — do not claim a formula "works" without having actually run it against at least one concrete example.

---

## 10. Root Cause Before Fix

For bugs, explain the actual root cause, not just the symptom.

Good:
> Line chemistry was flat regardless of linemates because the synergy lookup used the player's `role` string but the config keys were the archetype's display name with different casing, so every lookup silently fell through to the default multiplier of 1.0. Fixed by normalizing both sides to the same key format before lookup.

Weak:
> Fixed the chemistry calculation.

---

## 11. Commit and Push Rules

Only commit and push when explicitly requested by the owner.

Before committing:

```powershell
git status
git diff --stat
```

Verify:

- only the expected files changed;
- no unrelated files are included;
- the relevant workspace build passes.

Use a concise, descriptive commit message that mentions the actual feature/fix (not "update files").

---

## 12. Required Implementation Summary

Every completed implementation response should include:

```text
Repository context

Project: Franchise Hockey Manager
Repository: franchise-hockey-manager
Repository path: C:\Projects\franchise-hockey-manager
Remote: https://github.com/jeehead-cloud/franchise-hockey-manager.git
Branch: main
Working tree: <clean / dirty>

Root cause (for bugs) / Design (for features)
<explanation>

Files changed
- path/to/file
- path/to/file

Behavior
- what changed
- what stayed the same
- known edge cases / limitations

Validation
- build: PASS / FAIL / NOT RUN

Documentation maintenance
- CURRENT_STATUS.md: updated / reviewed, no update required
- Recent changes entry: added / not required
- Significant changes entry: added / not required
- Reason: <brief explanation>

Commit
- hash and message, or "Not committed"
```

An iteration is **not complete** until the §13.1 review has been performed and the Documentation maintenance block above is filled in honestly.

---

## 13. Documentation Updates

### 13.1. End-of-iteration CURRENT_STATUS.md workflow (mandatory after every prompt)

After **every** prompt/iteration — including documentation-only tasks and small fixes — and **before** writing the final completion summary, the agent must:

1. **Review the iteration's actual outcome** — what was completed, failed, deferred, blocked, or newly discovered.
2. **Re-read `CURRENT_STATUS.md`** in full (snapshot sections and both history tracks).
3. **Update the current-state snapshot** whenever repository-relevant facts changed: Current Development Phase, milestone Implemented / Not yet done / known-gaps bullets, Known Bugs / Limitations, and Nearest Next Steps.
4. **Add a Recent changes entry** whenever the iteration changed the repository, documentation, implementation status, validation status, known limitations, decisions, or immediate next steps.
5. **Independently decide significance** — if the iteration meets the Significant-changes criteria in §13.2 / `CURRENT_STATUS.md`, add a Significant changes entry. The owner does not need to request this; the agent must classify on its own.
6. **Record failure and incompleteness honestly** when they change the known project state — do not document only successful work.
7. **Skip history entries only when** the iteration caused no repository-relevant change and revealed no new fact worth preserving (still report `reviewed, no update required` in the final summary).
8. **Report the maintenance result** in the final response using the Documentation maintenance block in §12.
9. **Never claim the iteration is complete** before this review has been performed.

There are no exceptions for "tiny" fixes, scaffolding, refactors, or documentation-only follow-ups.

### 13.2. Two change-history tracks in CURRENT_STATUS.md

`CURRENT_STATUS.md` maintains two separate histories (both newest-first):

| Track | Purpose | Retention |
|---|---|---|
| **Recent changes** | Ordinary implementation progress, fixes, documentation updates, validation results, incomplete/failed work, and other repository-relevant changes | Keep approximately the latest **3 months**; older ordinary entries may be pruned when they no longer help explain the current state |
| **Significant changes** | Durable milestones, architectural decisions, important product/game-design decisions, major implementation milestones, important migrations, major incidents and root causes, and other facts future agents must know permanently | **Never** delete merely because of age |

A significant change may also appear in Recent changes while it is recent; its permanent record must remain under Significant changes.

**Agent responsibility:** decide independently whether a completed iteration belongs in Significant changes. When unsure, prefer recording a Significant entry for durable decisions/milestones rather than losing permanent context.

Do **not** turn either history into low-level noise (every shell command, every trivial formatting-only edit). Prefer concise, repository-relevant entries.

### 13.3. Other documents — update when the underlying thing changes

Update the relevant document when:

- a milestone (M1-M8) changes status or scope → `PROJECT.md` (roadmap table) — and always `CURRENT_STATUS.md` per §13.1;
- a game design rule changes (chemistry weights, aging curve, archetype mapping, draft/scouting rules, etc.) → `PRODUCT_RULES.md` and/or `PLAYER_MODEL.md`;
- the file/data structure changes meaningfully (new Prisma models, new engine modules, new config files) → `ARCHITECTURE.md`;
- a deployment/hosting decision is finally made → `DEPLOYMENT.md`.

Do not let an important rule exist only in chat history — if it matters going forward, write it down in the right file.

---

## 14. Final Safety Rule

**If repository context, task scope, or working tree state is ambiguous, stop before editing.**

It is better to ask "which project is this for?" than to make a correct change in the wrong repository, or to silently proceed on a wrong assumption.
