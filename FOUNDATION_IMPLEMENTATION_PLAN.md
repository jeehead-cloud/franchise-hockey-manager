# Franchise Hockey Manager — Foundation Implementation Plan

**Status:** Draft  
**Purpose:** Turn the target product structure into an incremental implementation plan  
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`  
**Local repository path:** `C:\Projects\franchise-hockey-manager`

---

## 1. Purpose

This document defines the implementation sequence for Franchise Hockey Manager.

The plan replaces a broad system-by-system roadmap with vertical milestones that produce an increasingly usable product.

The target progression is:

```text
Database Browser
→ Playable Match
→ Playable Competition
→ Renewable Multi-Season World
```

Each milestone should be suitable for one logical Cursor task or a small, clearly bounded implementation block.

---

## 2. Guiding Rules

### 2.1. Preserve a Working Repository

Every milestone must end in a buildable state.

### 2.2. One Logical Step at a Time

Each milestone must:

- have one clear outcome;
- avoid unrelated cleanup;
- remain independently reviewable;
- avoid implementing future mechanics early;
- update documentation when repository-relevant behavior changes.

### 2.3. Keep the Engine Pure

Simulation, generation, development, chemistry, and draft logic belong in `packages/engine`.

The engine must not depend on:

- Fastify;
- Prisma;
- React;
- HTTP;
- filesystem state;
- the database.

### 2.4. Keep Persistence Server-Side

Only `packages/server` accesses Prisma and SQLite.

### 2.5. Use Event-Based Match Simulation From the Beginning

Do not build a temporary final-score-only engine for NHL matches.

### 2.6. Determinism Is Mandatory

A fixed input, balance version, engine version, and seed must reproduce the same result.

### 2.7. Real Initial Data, Generated Future

The first world is initialized from a prepared local dataset of real players and real teams.

Future youth players are procedurally generated.

### 2.8. No Automatic Real-World Synchronization

Do not add scraping, live APIs, or periodic roster updates to the foundation scope.

### 2.9. No Career / Save Slots Yet

The database is the single current world.

### 2.10. Balance Must Be Config-Driven

Default values live in version-controlled configuration. Editable presets and versions may live in the database.

---

## 3. Target Technical Direction

### 3.1. Monorepo

```text
packages/
├── engine
├── server
└── client
```

### 3.2. Stack

- TypeScript;
- Node.js;
- Fastify;
- Prisma;
- SQLite;
- React;
- Vite;
- Tailwind CSS;
- Vitest for engine tests.

### 3.3. High-Level Data Flow

```text
React Client
→ REST API
→ Fastify Server
→ Engine and Prisma
→ SQLite
```

### 3.4. Foundation Routes

Suggested route structure:

```text
/
 /world
 /competitions
 /competitions/:competitionEditionId
 /teams
 /teams/:teamId
 /players
 /players/:playerId
 /national-teams
 /transfers
 /history
 /settings
 /simulation-lab
 /setup
```

---

## 4. Foundation Levels

### Foundation A — Database Browser

Outcome:

```text
real teams and players imported
→ world opens
→ teams and players can be viewed
→ Commissioner editing works
```

Includes F1–F6.

### Foundation B — Playable Match

Outcome:

```text
roster
→ lines
→ tactics
→ chemistry
→ event simulation
→ result, events, and statistics
```

Includes F7–F16.

### Foundation C — Playable Competition

Outcome:

```text
NHL regular season
→ standings
→ playoffs
→ champion
→ archive
```

Includes F17–F20.

### Foundation D — Renewable World

Outcome:

```text
aggregated leagues
→ international tournaments
→ development
→ youth generation
→ scouting
→ NHL Draft
→ contracts and transfers
→ next season
```

Includes F21–F33.

---

## 5. Milestone Overview

| ID | Milestone | Outcome |
|---|---|---|
| F1 | Monorepo and Application Shell | Engine, server, client, and navigation run |
| F2 | Core Database Model | Foundational world entities exist in Prisma |
| F3 | World Initialization and Real Data Import | Empty DB can be initialized from local datasets |
| F4 | World Dashboard and Browsers | World, teams, and players are viewable |
| F5 | Player Model Foundation | Skater and goalie models, ratings, and roles |
| F6 | Commissioner Editing | Safe player and team editing with audit records |
| F7 | Coaches, Tactics, and Team Setup | Coaches, tactics, roster statuses |
| F8 | Lines and Auto-Lineup | Main lines, validation, drag/drop, auto-fill |
| F9 | Chemistry and Effective Performance | Non-linear lineup effectiveness |
| F10 | Simulation Configuration | Balance presets, versions, randomness, seeds |
| F11 | Event Engine Core | Deterministic periods, shifts, possessions, events |
| F12 | Shots, Goalies, and Scoring | Shot chain, saves, goals, assists, statistics |
| F13 | Penalties and Special Teams | Basic 5v5, 5v4, and 4v5 |
| F14 | Playable Match | Complete match simulation and persistence |
| F15 | Match UI and Diagnostics | Results, event feed, period view, debug panel |
| F16 | Simulation Lab | Batch simulation and balance analysis |
| F17 | Competition Framework | Universal competitions, editions, and stages |
| F18 | NHL Regular Season | Schedule, matches, standings, player stats |
| F19 | NHL Playoffs | Bracket, series, one-match-at-a-time simulation |
| F20 | Competition Archive and History | Immutable competition history and records |
| F21 | Aggregated League Engine | Fast lower/foreign league simulation |
| F22 | National Teams | Candidate pools, rosters, lines, and coaches |
| F23 | International Tournaments | WJC, World Championship, Olympics |
| F24 | Player Development | Annual aging, form, roles, snapshots, retirement |
| F25 | Youth Generation | Country profiles and annual cohorts |
| F26 | Scouting Foundation | Estimated values and scouting confidence |
| F27 | NHL Draft | Lottery, order, draft screen, AI picks, rights |
| F28 | Contracts and Free Agency | Simplified contracts, extensions, signings |
| F29 | Trades and Rights | Manual Trade Builder and draft-right transfers |
| F30 | Offseason Workflow | Retirement, development, draft, and roster prep |
| F31 | Renewable World Cycle | Complete season and create the next one |
| F32 | Backup and Recovery | Automatic and manual database snapshots |
| F33 | Import, Export, and Maintenance | Data export, preset import/export, DB tools |

---

# 6. F1 — Monorepo and Application Shell

## Goal

Create the technical foundation without gameplay logic.

## Scope

Create:

```text
packages/engine
packages/server
packages/client
```

Add:

- workspace root;
- TypeScript configuration;
- build scripts;
- typecheck scripts;
- linting if lightweight;
- Fastify health endpoint;
- Prisma wiring with SQLite;
- React application shell;
- router;
- top-level navigation;
- placeholder pages.

## Deliverables

- monorepo structure;
- shared repository scripts;
- development commands;
- route placeholders;
- health check;
- initial README or documentation update.

## Acceptance Criteria

- engine builds;
- server builds and starts;
- client builds and starts;
- client can call server health endpoint;
- direct route refresh works;
- no gameplay system is implemented;
- relevant documentation is updated.

## Out of Scope

- real database entities;
- player generation;
- match simulation;
- real data import.

---

# 7. F2 — Core Database Model

## Goal

Create the minimal persistent world structure.

## Initial Entities

```text
WorldSeason
Country
League
Team
Player
Coach
Competition
CompetitionEdition
```

Supporting enums may include:

```text
TeamType
LeagueSimulationLevel
PlayerSource
RosterStatus
CompetitionType
CompetitionStatus
```

## Deliverables

- Prisma schema;
- first migration;
- server repositories/services;
- basic API read endpoints;
- seed-safe IDs and timestamps.

## Acceptance Criteria

- migration applies to an empty database;
- server can create and read foundation entities;
- no duplicate source-of-truth types are introduced;
- engine remains independent from Prisma;
- builds pass.

## Out of Scope

- match entities;
- full player attributes;
- contracts;
- draft;
- transactions.

---

# 8. F3 — World Initialization and Real Data Import

## Goal

Initialize an empty database from a prepared local dataset.

## Scope

Create Setup World flow.

Import:

- countries;
- real leagues;
- real teams;
- real players;
- coaches where available;
- global season;
- competition definitions;
- initial competition editions;
- default balance preset.

## Input Boundary

Initial data comes from local CSV or JSON.

Do not add:

- web scraping;
- live APIs;
- background synchronization;
- automatic real roster updates.

## Required Metadata

```text
externalId
sourceDataset
sourceUpdatedAt
playerSource
```

## Deliverables

- import schema;
- validation report;
- idempotent initialization boundary;
- setup page;
- progress and result display;
- safe refusal if DB is already initialized;
- explicit reset path only under Database Maintenance.

## Acceptance Criteria

- empty DB can be initialized end-to-end;
- invalid rows are reported clearly;
- duplicate initialization is prevented;
- imported players belong to correct teams;
- world opens after setup;
- imported source metadata is preserved;
- builds pass.

---

# 9. F4 — World Dashboard and Browsers

## Goal

Make the initialized world usable for inspection.

## Scope

Implement:

- World Dashboard;
- Teams list;
- Team Overview;
- Players list;
- Player Profile;
- Competitions list;
- basic filters and search.

## World Dashboard

Show:

- season;
- current phase;
- phase status;
- counts;
- warnings;
- recommended next action placeholder.

## Acceptance Criteria

- teams and players are browsable;
- filters work;
- direct URLs work;
- no data editing yet;
- empty and error states exist;
- builds pass.

---

# 10. F5 — Player Model Foundation

## Goal

Implement the real player model used by future simulation.

## Scope

### Skaters

```text
STH
SHO
PAS
STR
SPD
BAL
AGG
OF_AW
DEF_AW
```

### Goalies

```text
REF
POS
REC
GLV
BLK
MOV
PUC
CON
STA
```

### Shared Fields

- position;
- secondary positions;
- age;
- nationality;
- current team;
- source type;
- preferences;
- personality;
- hero rating;
- form;
- stability;
- hidden potential range;
- development risk.

### Derived Values

- current ability;
- offensive rating;
- defensive rating;
- role rating;
- role;
- potential estimate.

## Deliverables

- engine types;
- role derivation;
- rating functions;
- config-driven role tables;
- Prisma fields or related models;
- tests.

## Acceptance Criteria

- skater and goalie logic are separate;
- roles derive from attributes;
- same input produces same derived output;
- no single overall drives simulation;
- tests cover role derivation and ratings;
- builds pass.

---

# 11. F6 — Commissioner Editing

## Goal

Allow safe manual editing of the world.

## Scope

Commissioner Mode:

- visible toggle;
- visual warning;
- player editor;
- team assignment;
- roster status editing;
- attribute editing;
- current team correction;
- audit log.

## Rules

- derived ratings recalculate automatically;
- role recalculates automatically;
- role is not directly editable;
- manual changes are logged;
- normal mode remains read-only where appropriate.

## Acceptance Criteria

- editing one player updates only that player;
- invalid position/goalie combinations are blocked;
- audit record is created;
- Commissioner state is visually obvious;
- builds pass.

---

# 12. F7 — Coaches, Tactics, and Team Setup

## Goal

Add the team-management foundation required by chemistry and matches.

## Scope

Coach fields:

- identity;
- coaching style;
- tactical style;
- development;
- offense;
- defense.

Team fields:

- head coach;
- tactical style.

Roster statuses:

```text
ACTIVE
RESERVE
PROSPECT
UNAVAILABLE
```

## Deliverables

- coach CRUD;
- team coach assignment;
- tactics editor;
- roster-status editor;
- basic team readiness validation.

## Acceptance Criteria

- each detailed team can have one head coach;
- tactics are persisted;
- unavailable players are excluded from lineup choices;
- validation warnings display;
- builds pass.

---

# 13. F8 — Lines and Auto-Lineup

## Goal

Create valid main lineups.

## Scope

```text
4 forward lines
3 defense pairs
starter goalie
backup goalie
```

Features:

- drag and drop;
- slot validation;
- duplicate-player prevention;
- secondary-position support;
- automatic lineup;
- readiness state.

## First Auto-Lineup Logic

Use:

- position;
- current ability;
- role.

## Deliverables

- lineup domain model;
- UI;
- persistence;
- validation service;
- automatic lineup service;
- tests.

## Acceptance Criteria

- all required slots can be filled;
- invalid assignments are rejected;
- one player cannot occupy multiple main slots;
- auto-lineup creates a valid lineup when roster depth permits;
- builds pass.

## Out of Scope

- power play;
- penalty kill;
- global optimization.

---

# 14. F9 — Chemistry and Effective Performance

## Goal

Implement the core non-linear performance layer.

## Scope

Calculate:

```text
Base Compatibility
Current Chemistry
Tactical Fit
Coach Fit
Effective Performance
```

Initial chemistry uses:

- role combinations;
- personality;
- coaching preference;
- tactics preference;
- actual coach;
- actual tactics.

Familiarity may begin at zero and remain static until match accumulation exists.

## Deliverables

- chemistry config;
- chemistry engine;
- explanation breakdown;
- line chemistry UI;
- unit tests;
- example simulation scripts.

## Acceptance Criteria

- complementary roles can outperform redundant higher-rated combinations;
- coach and tactical mismatch can materially reduce effective performance;
- modifiers are bounded;
- exact score and explanation are visible;
- tests demonstrate non-linearity;
- builds pass.

---

# 15. F10 — Simulation Configuration

## Goal

Create versioned, editable simulation balance.

## Scope

Default JSON configs:

- event probabilities;
- chemistry;
- tactical fit;
- randomness;
- shot and goalie resolution;
- penalties;
- development;
- scouting;
- draft.

Database:

```text
BalancePreset
BalancePresetVersion
```

## Features

- active preset;
- duplicate;
- rename;
- edit;
- activate;
- import;
- export;
- reset;
- version creation.

## Runtime Parameters

- simulation randomness;
- random seed;
- logging level.

## Acceptance Criteria

- simulation can receive an immutable balance input;
- presets can be changed without code edits;
- old versions remain reproducible;
- default JSON values can recreate the standard preset;
- builds pass.

---

# 16. F11 — Event Engine Core

## Goal

Create the deterministic match state machine.

## Scope

Hierarchy:

```text
Match
→ Period
→ Shift
→ Possession
→ Event
```

Core state:

```text
period
clock
score
strengthState
currentLines
possession
zone
penalties
recentEvents
```

Core events:

```text
PERIOD_START
FACEOFF
POSSESSION_GAIN
ZONE_EXIT
ZONE_ENTRY
TURNOVER
PERIOD_END
GAME_END
```

## Deliverables

- seeded RNG abstraction;
- immutable simulation input;
- state transition functions;
- period and shift progression;
- technical events;
- determinism tests.

## Acceptance Criteria

- same input and seed produce identical output;
- period clocks progress legally;
- game reaches completion;
- no database or server dependency exists;
- tests pass.

---

# 17. F12 — Shots, Goalies, and Scoring

## Goal

Produce hockey results from the event chain.

## Scope

Add:

```text
SHOT
SHOT_BLOCKED
SHOT_MISSED
SAVE
GOAL
```

Shot flow:

```text
create chance
→ block / miss / on target
→ goalie resolution
→ save / goal
```

Add:

- shot quality;
- shooter selection;
- pass-chain participants;
- goalie resolution;
- assists;
- player game statistics;
- team game statistics.

## Deliverables

- shot config;
- goalie config;
- shot-resolution engine;
- assist attribution;
- statistics reducer;
- consistency tests.

## Acceptance Criteria

- every goal comes from a shot event;
- every on-target non-goal becomes a save;
- goalie stats reconcile with shots and goals;
- player and team totals reconcile;
- same seed is reproducible;
- builds and tests pass.

---

# 18. F13 — Penalties and Special Teams

## Goal

Add meaningful penalties and basic power-play states.

## Scope

Support:

```text
5v5
5v4
4v5
```

Add:

```text
PENALTY
```

Features:

- penalty generation;
- active penalty tracking;
- strength-state transitions;
- automatic special-team player selection;
- changed possession, shot, and scoring probabilities.

## Deliverables

- penalty config;
- special-team fallback lineup service;
- strength-state engine;
- power-play statistics.

## Acceptance Criteria

- penalties change players and probabilities;
- power-play opportunities and goals reconcile;
- expired penalties restore normal state;
- complex coincidental penalties remain explicitly unsupported;
- tests pass.

---

# 19. F14 — Playable Match

## Goal

Simulate and persist one complete hockey match.

## Scope

Support:

- three periods;
- overtime;
- shootout when competition rules allow;
- final result;
- full event list;
- player stats;
- team stats;
- seed;
- balance version.

## Server Persistence

Suggested entities:

```text
Match
MatchResult
MatchEvent
PlayerGameStat
TeamGameStat
```

## Deliverables

- simulate-match API;
- persistence transaction;
- result endpoint;
- resimulation boundary for Commissioner Mode.

## Acceptance Criteria

- two prepared teams can play a complete match;
- result is saved;
- statistics are consistent;
- reload shows the same result;
- resimulation requires Commissioner Mode;
- tests pass.

---

# 20. F15 — Match UI and Diagnostics

## Goal

Make a simulated match understandable and debuggable.

## Scope

Result screen:

- final score;
- period scores;
- event feed;
- team statistics;
- player statistics;
- line usage;
- goalie statistics.

Diagnostics:

- input;
- seed;
- balance version;
- event counts;
- probability breakdown;
- zone possession;
- expected versus actual goals;
- warnings;
- technical log.

## Acceptance Criteria

- public feed hides unnecessary technical noise;
- Commissioner diagnostics reveal technical detail;
- event order is preserved;
- direct match URL works;
- builds pass.

---

# 21. F16 — Simulation Lab

## Goal

Enable systematic balance testing.

## Scope

Inputs:

```text
Team A
Team B
Lineups
Balance preset
Randomness
Simulation count
```

Counts:

```text
1
10
100
1000
```

Outputs:

- win rate;
- average score;
- score distribution;
- shots;
- power-play rates;
- line contribution;
- upset frequency;
- anomalies.

## Deliverables

- batch engine runner;
- server job endpoint or synchronous safe boundary;
- result aggregation;
- UI;
- export.

## Acceptance Criteria

- repeated fixed-seed batches are reproducible;
- aggregate totals are consistent;
- stronger teams usually win more, not always;
- randomness can be adjusted without code changes;
- builds and tests pass.

---

# 22. F17 — Competition Framework

## Goal

Create the universal competition structure.

## Scope

Entities:

```text
Competition
CompetitionEdition
CompetitionParticipant
CompetitionStage
StageParticipant
```

Stage types:

- regular season;
- round robin;
- groups;
- knockout;
- best-of series.

Competition rules:

- points;
- tiebreakers;
- overtime;
- shootout;
- playoff qualification;
- series length.

## Deliverables

- Prisma models;
- engine competition types;
- configuration schema;
- competition page shell;
- lifecycle states.

## Acceptance Criteria

- a competition edition can contain multiple stages;
- participants and status are persisted;
- rules are not hardcoded into the UI;
- builds pass.

---

# 23. F18 — NHL Regular Season

## Goal

Run a detailed NHL regular season.

## Scope

- NHL preset;
- schedule generation;
- event-based batch match simulation;
- standings;
- team statistics;
- player statistics;
- current-stage status.

Initial action:

```text
Simulate Regular Season
```

Future actions remain modeled but may be disabled:

```text
Simulate Next Game
Simulate Next Day
Simulate Next Week
```

## Acceptance Criteria

- all scheduled matches complete once;
- standings reconcile with results;
- player stats equal match-stat sums;
- competition can transition to playoffs;
- backup is created before full-season simulation;
- tests pass.

---

# 24. F19 — NHL Playoffs

## Goal

Run NHL playoffs one match at a time.

## Scope

- playoff qualification;
- seeding;
- bracket generation;
- best-of series;
- home advantage;
- series state;
- next-match simulation;
- champion.

## Initial Action

```text
Simulate Next Match
```

## Acceptance Criteria

- bracket derives from regular-season standings;
- series scores update correctly;
- eliminated teams do not advance;
- champion is determined;
- user may inspect or edit between matches;
- tests pass.

---

# 25. F20 — Competition Archive and History

## Goal

Turn completed competitions into persistent history.

## Scope

Archive:

- final standings;
- bracket;
- champion;
- player statistics;
- team statistics;
- awards;
- participants;
- balance version.

Add initial history pages:

```text
Seasons
Competition Results
Champions
Player Season Snapshots
```

Add simple records.

## Acceptance Criteria

- completed competition is read-only in normal mode;
- archived results remain after later seasons;
- Commissioner corrections are logged;
- builds pass.

---

# 26. F21 — Aggregated League Engine

## Goal

Simulate lower and foreign leagues efficiently.

## Scope

Generate:

- standings;
- team totals;
- player season statistics;
- champion;
- top performers.

No detailed event storage required.

## Required Invariants

- player goals equal team goals;
- assists align with goals;
- player games are valid;
- goalie statistics align with goals against;
- all teams receive complete final standings.

## Acceptance Criteria

- multiple aggregated leagues can complete quickly;
- output is mathematically consistent;
- results feed player development and national-team selection;
- tests pass.

---

# 27. F22 — National Teams

## Goal

Create persistent national teams and tournament-specific rosters.

## Scope

- national team entity;
- candidate pool;
- eligibility;
- suggested roster;
- manual correction;
- tournament roster;
- lines;
- coach;
- tactics.

## Acceptance Criteria

- only eligible players are suggested;
- user can replace players;
- confirmed roster belongs to one tournament edition;
- player club ownership is unchanged;
- builds pass.

---

# 28. F23 — International Tournaments

## Goal

Run the first three national-team tournaments.

## Scope

- World Junior Championship;
- World Championship;
- Olympic Games.

Use:

- fixed participant lists initially;
- universal competition stages;
- event match engine;
- archived results.

## Acceptance Criteria

- age limits work for World Juniors;
- rosters can be confirmed;
- groups and playoffs complete;
- champions and statistics are archived;
- tests pass.

---

# 29. F24 — Player Development

## Goal

Apply annual development and decline.

## Scope

Operation:

```text
Apply Annual Development
```

Steps:

- save season snapshot;
- increase age;
- calculate development budget;
- distribute changes across attributes;
- recalculate ratings;
- recalculate role;
- update form;
- evaluate retirement.

## Deliverables

- aging config;
- development config;
- engine functions;
- PlayerSeasonSnapshot persistence;
- development report UI;
- tests.

## Acceptance Criteria

- same input and seed produce same development result;
- attributes remain in valid ranges;
- goalie and skater development are separate;
- roles can change only through derived rules;
- snapshots preserve old values;
- tests pass.

---

# 30. F25 — Youth Generation

## Goal

Generate annual youth cohorts.

## Scope

Country profiles:

- name pools;
- position distribution;
- quality distribution;
- attribute tendencies;
- cohort size.

Generate players aged 15–17.

Initial version may emphasize age 17.

## Acceptance Criteria

- names match country pool;
- generated players use valid position-specific models;
- cohorts are persisted;
- players enter `PROSPECT`;
- source type is `GENERATED_YOUTH`;
- tests pass.

---

# 31. F26 — Scouting Foundation

## Goal

Hide true prospect quality behind estimated values.

## Scope

Store:

- true hidden values;
- scouting estimate;
- confidence;
- last scouting action.

Actions:

```text
Scout Player
Scout Country
Scout Tournament
```

Use limited scouting actions.

## Acceptance Criteria

- low-confidence estimates are wider/noisier;
- higher confidence narrows estimates;
- Commissioner Mode reveals true values;
- AI uses its own estimates;
- tests pass.

---

# 32. F27 — NHL Draft

## Goal

Implement the complete first-version NHL Draft.

## Scope

- configurable rounds;
- initial 3-round preset;
- draft eligibility;
- lottery;
- draft order;
- pick ownership;
- draft screen;
- manual teams;
- AI teams;
- pause and auto-advance;
- draft selection;
- rights creation;
- draft history.

AI strategies:

```text
Best Player Available
High Upside
Team Need
Low Risk
```

## Acceptance Criteria

- eligible class comes from existing youth players;
- every pick belongs to its current owner;
- AI uses scouting estimates;
- user may take over any pick;
- rights owner is stored separately from current team;
- undrafted players remain in the world;
- tests pass.

---

# 33. F28 — Contracts and Free Agency

## Goal

Add simplified player contracts.

## Scope

Contract:

- team;
- start season;
- end season;
- salary;
- status.

Processes:

- expiration;
- extension recommendation;
- accept or release;
- free-agent offers;
- signing.

No salary-cap enforcement yet.

## Acceptance Criteria

- contracts expire correctly;
- extension recommendations are reproducible;
- free agents may receive offers;
- signed player team and contract owner update correctly;
- transaction log is written;
- tests pass.

---

# 34. F29 — Trades and Rights

## Goal

Support manual trades and rights transfers.

## Scope

Trade assets:

- players;
- draft picks;
- player rights.

UI:

- two-sided Trade Builder;
- team needs;
- estimated values;
- imbalance warning;
- confirmation.

## Acceptance Criteria

- ownership changes atomically;
- trade log records all assets;
- invalid duplicate assets are blocked;
- imbalanced trades are warned, not blocked;
- applied trade is historical;
- tests pass.

---

# 35. F30 — Offseason Workflow

## Goal

Combine offseason operations into one controlled sequence.

## Scope

```text
Retirements
Annual Development
Youth Generation
NHL Draft
Contract Expiration
Extensions
Free Agency
Basic Transfers
Prospect Promotions
Roster Validation
```

Each step is user-triggered or confirmed.

## Acceptance Criteria

- step order is enforced;
- repeated execution is prevented;
- each step produces a report;
- backup is created before destructive mass operations;
- workflow can stop for manual correction;
- tests pass.

---

# 36. F31 — Renewable World Cycle

## Goal

Complete one season and create the next.

## Scope

- Season Review;
- phase completion;
- archive verification;
- offseason completion;
- next WorldSeason;
- new competition editions;
- phase reset;
- new recommended action.

## Acceptance Criteria

- old season remains readable;
- new season starts with valid teams and players;
- no historical record is overwritten;
- player ages and contracts advance;
- next draft class path remains valid;
- tests pass.

---

# 37. F32 — Backup and Recovery

## Goal

Protect the single living database.

## Automatic Backup Before

- full competition simulation;
- annual development;
- NHL Draft;
- offseason completion;
- next-season creation.

## Features

- manual backup;
- backup list;
- metadata;
- restore confirmation;
- restore report.

## Acceptance Criteria

- backup file is created;
- restore returns DB to prior state;
- failure is reported safely;
- backups are not silently overwritten;
- documentation is updated.

---

# 38. F33 — Import, Export, and Maintenance

## Goal

Provide long-term data maintenance tools.

## Scope

- player export JSON/CSV;
- standings export CSV;
- statistics export CSV;
- name-pool import;
- balance preset import/export;
- full DB export;
- database validation;
- initialization reset under explicit confirmation.

## Acceptance Criteria

- exported data can be opened externally;
- import validation reports bad rows;
- maintenance actions are Commissioner-only;
- destructive actions require confirmation;
- builds pass.

---

## 39. Store and Client State Strategy

Do not create one global client store for the entire world.

Recommended boundaries:

```text
app navigation state
world dashboard state
team page state
player page state
competition page state
match viewer state
settings state
simulation lab state
```

Server data should be fetched through API queries.

Persistent truth remains in SQLite.

---

## 40. Engine Module Direction

Suggested structure:

```text
packages/engine/src/
├── players/
├── goalies/
├── roles/
├── development/
├── chemistry/
├── tactics/
├── lineups/
├── simulation/
│   ├── match/
│   ├── events/
│   ├── shots/
│   ├── penalties/
│   └── statistics/
├── competitions/
├── aggregated-leagues/
├── national-teams/
├── scouting/
├── draft/
├── contracts/
├── transactions/
├── config/
└── random/
```

Do not create all empty modules in advance unless the current milestone requires them.

---

## 41. Testing Strategy

### Engine Unit Tests

Required for:

- seeded randomness;
- role derivation;
- ratings;
- chemistry;
- tactical fit;
- event transitions;
- shots;
- saves;
- goals;
- statistics;
- development;
- draft eligibility;
- scouting estimates.

### Simulation Invariant Tests

Run 100–1000 matches and verify:

- no negative statistics;
- goals reconcile;
- saves reconcile;
- game always ends;
- time is legal;
- one player does not play for both teams;
- same seed is reproducible;
- stronger teams win more often, but not always;
- randomness controls variance.

### Server Integration Tests

Required for:

- saving match results;
- standings calculation;
- competition completion;
- draft selections;
- transaction application;
- annual development;
- next-season creation.

### Manual UI Verification

For every milestone:

- page opens;
- empty state;
- loading state;
- error state;
- direct route;
- refresh;
- Commissioner boundary where relevant.

---

## 42. Documentation Maintenance

Update:

### `CURRENT_STATUS.md`

After every meaningful iteration.

### `ARCHITECTURE.md`

When:

- Prisma model changes;
- engine module structure changes;
- new data flow is introduced;
- balance versioning changes.

### `PRODUCT_RULES.md`

When gameplay invariants change.

### `PLAYER_MODEL.md`

When player, goalie, development, role, or potential decisions are finalized.

### `PROJECT.md`

When the high-level roadmap or product scope changes.

### `PRODUCT_STRUCTURE.md`

When screens, flows, or product areas change.

---

## 43. Recommended Commit Boundaries

```text
chore: scaffold engine server and client workspaces
feat: add foundational hockey world schema
feat: add real-world data import and setup flow
feat: add world team and player browsers
feat: implement skater and goalie player models
feat: add commissioner editing and audit log
feat: add coaches tactics and roster statuses
feat: add lineup management and auto-fill
feat: add chemistry and effective performance
feat: add versioned simulation balance presets
feat: add deterministic match event engine
feat: add shot goalie and scoring resolution
feat: add penalties and special teams
feat: add playable match persistence
feat: add match viewer and diagnostics
feat: add simulation lab
feat: add universal competition framework
feat: add NHL regular season simulation
feat: add NHL playoff series
feat: add competition archive and history
feat: add aggregated league simulation
feat: add national team roster workflow
feat: add international tournaments
feat: add annual player development
feat: add youth generation
feat: add scouting estimates
feat: add NHL draft
feat: add simplified contracts and free agency
feat: add trade builder and rights transfers
feat: add offseason workflow
feat: add renewable season cycle
feat: add database backup and recovery
feat: add import export and maintenance tools
```

---

## 44. Recommended Immediate Sequence

### Batch 1 — Technical Foundation

1. F1 — Monorepo and Application Shell
2. F2 — Core Database Model
3. F3 — World Initialization and Real Data Import

### Batch 2 — Database Browser

4. F4 — World Dashboard and Browsers
5. F5 — Player Model Foundation
6. F6 — Commissioner Editing

### Batch 3 — Team Management

7. F7 — Coaches, Tactics, and Team Setup
8. F8 — Lines and Auto-Lineup
9. F9 — Chemistry and Effective Performance
10. F10 — Simulation Configuration

### Batch 4 — Playable Match

11. F11 — Event Engine Core
12. F12 — Shots, Goalies, and Scoring
13. F13 — Penalties and Special Teams
14. F14 — Playable Match
15. F15 — Match UI and Diagnostics
16. F16 — Simulation Lab

### Batch 5 — Playable Competition

17. F17 — Competition Framework
18. F18 — NHL Regular Season
19. F19 — NHL Playoffs
20. F20 — Competition Archive and History

### Batch 6 — Renewable World

21. F21 — Aggregated League Engine
22. F22 — National Teams
23. F23 — International Tournaments
24. F24 — Player Development
25. F25 — Youth Generation
26. F26 — Scouting Foundation
27. F27 — NHL Draft
28. F28 — Contracts and Free Agency
29. F29 — Trades and Rights
30. F30 — Offseason Workflow
31. F31 — Renewable World Cycle
32. F32 — Backup and Recovery
33. F33 — Import, Export, and Maintenance

---

## 45. First Cursor Task

```text
Repository context

Project: Franchise Hockey Manager
Repository: franchise-hockey-manager
Repository path: C:\Projects\franchise-hockey-manager
Remote: https://github.com/jeehead-cloud/franchise-hockey-manager.git
Expected branch: main

Task

Scaffold the Franchise Hockey Manager TypeScript monorepo with engine, server, and client workspaces, without implementing gameplay systems.

Create:
- packages/engine
- packages/server
- packages/client
- workspace-level build and typecheck commands
- a Fastify health endpoint
- Prisma + SQLite connection wiring without gameplay entities
- a React application shell with routing and placeholder pages
- basic client-to-server health check

Placeholder routes:
- /world
- /competitions
- /teams
- /players
- /settings
- /simulation-lab
- /setup

Requirements:
- preserve repository documentation
- do not add player generation, chemistry, match simulation, or real-data import
- run the relevant build/typecheck commands
- update CURRENT_STATUS.md and ARCHITECTURE.md
- follow AI_AGENTS.md documentation-maintenance rules
```

---

## 46. Second Cursor Task

```text
Add the foundational Prisma domain model for the single-world hockey sandbox.

Entities:
- WorldSeason
- Country
- League
- Team
- Player
- Coach
- Competition
- CompetitionEdition

Keep player attributes, matches, contracts, draft, and transactions out of this task unless a minimal field is structurally required.

Add the migration, server read repositories, and minimal list/detail API endpoints.
```

---

## 47. Third Cursor Task

```text
Add the empty-database world initialization workflow and an idempotent local real-data import boundary.

Use prepared local CSV/JSON input.
Do not add web scraping, external APIs, or automatic synchronization.

The setup flow must validate data, report errors, prevent duplicate initialization, and create the initial world season, leagues, teams, real players, coaches where available, competition definitions, and default balance preset.
```

---

## 48. Completion Definition

The foundation plan is complete when:

- the world initializes from real data;
- teams and players can be inspected and edited;
- lineups, coaches, tactics, and chemistry work;
- a deterministic event-based match can be simulated;
- the Simulation Lab can test balance;
- NHL regular season and playoffs can complete;
- lower leagues can be simulated in aggregate;
- national-team tournaments can run;
- players age and develop;
- youth cohorts appear;
- scouting and a full NHL Draft work;
- simplified contracts, free agency, and trades work;
- a season can complete and the next season can begin;
- history remains intact;
- the database can be backed up and restored.

---

## Guiding Principle

**Build the hockey world vertically: first make it visible and editable, then make one match real, then one competition real, then make the entire world renewable. Avoid broad half-implemented systems, but do not compromise the event-based simulation or non-linear performance principles.**
