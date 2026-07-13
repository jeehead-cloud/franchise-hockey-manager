# Franchise Hockey Manager — Current Status

**Status:** Active
**Last updated:** 2026-07-13
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Local repository path:** `C:\Projects\franchise-hockey-manager`

> Snapshot of what the app can do now, plus maintained Recent / Significant history for future AI-agent sessions.
> End-of-iteration maintenance is mandatory — see `AI_AGENTS.md` §13.1–§13.2 and §5–§7 below.

---

## 1. Current Development Phase

**F17 — Competition Framework: implemented locally (not committed).** Universal Competition / CompetitionEdition structure with rules snapshots, participants, stages, lifecycle, readiness, Commissioner preparation UI, and dataset schemaVersion 5. No schedules, standings, or progression.

**Next milestone: F18 — NHL Regular Season** (do not start until requested).

F1–F16 remain complete on `main` (F16 at `b3e3a70`).

---

## 2. Milestone Status

### F1–F16

Complete on `main`.

### F17 — Competition Framework (Done locally)

Implemented:
- Engine `packages/engine/src/competitions/` — rules schema, templates, stage config validation, dependency graph, lifecycle, readiness, browser-safe deterministic digests (no node:crypto)
- Prisma: Competition extensions, edition rules/lifecycle fields, CompetitionParticipant, CompetitionStage, StageParticipant, Match.competitionStageId, audit enums
- Migration `20260713140000_f17_competition_framework` with SIMPLE_LEAGUE backfill
- Dataset schemaVersion 5; Commissioner + public competition/edition APIs
- Client `/competitions/:id/editions/:editionId` with Overview/Participants/Stages/Rules/Readiness/History tabs

Not in F17:
- Schedule generation, standings, playoff progression, competition match creation, awards

### M1–M8

Unchanged.

---

## 3. Known Bugs / Limitations Worth Remembering

- Scoring rates remain high (~10 goals/game) — Lab anomalies flag this as development WARNING.
- Competition rule templates are simplified development presets, not NHL rulebooks.
- F17 ACTIVE locks structure only — does not create matches/schedules.
- Manual UI verification for F17 was **NOT RUN**.
- F17 changes not yet committed/pushed.
- Commissioner header is not security.

---

## 4. Nearest Next Steps

1. Commit/push F17 when the owner requests.
2. Manual UI pass on disposable DB (edition create → participants → stages → ready → activate).
3. **F18 — NHL Regular Season** (when requested).

---

## 5. Recent Changes

> Ordinary repository-relevant history, newest first.

### 2026-07-13 — F17 Competition Framework

- Work completed: competition rules engine, Prisma models/migration, Commissioner APIs, edition UI, schemaVersion 5 fixture
- Validation: 121 engine + 154 server tests PASS; typecheck/build PASS; F17 APIs + migrations PASS; manual UI **NOT RUN**
- Remaining: F17 uncommitted; F18 deferred
- Note: rules/config hashes use browser-safe digests (not node:crypto) for client bundle compatibility

### 2026-07-13 — F16 Simulation Lab

- Committed/pushed on `main` (`b3e3a70`)

---

## 6. Significant Changes

> Major architectural or product decisions only.

### 2026-07-13 — F17 Competition Framework (Significant)

- Universal Competition → Edition → Participants/Stages model
- Edition rules snapshots become immutable at READY/ACTIVE
- Stage behavior is config-driven; F17 does not execute progression
- Activation is structural only (no schedules/standings)

### 2026-07-13 — F16 Simulation Lab (Significant)

- Unpersisted batch analysis separate from official Match history

---

## 7. Quick Reference

| Item | Value |
|---|---|
| Dataset schemaVersion | 5 |
| Edition lifecycle | PLANNED → PREPARING → READY → ACTIVE (COMPLETED/ARCHIVED reserved/manual) |
| Stage types | REGULAR_SEASON, ROUND_ROBIN, GROUP_STAGE, KNOCKOUT, BEST_OF_SERIES, FINAL_RANKING |
| Rules templates | SIMPLE_LEAGUE, SIMPLE_ROUND_ROBIN, GROUPS_AND_KNOCKOUT, BEST_OF_SERIES_PLAYOFF |
| Migration | `20260713140000_f17_competition_framework` |
