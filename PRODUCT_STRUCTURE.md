# Franchise Hockey Manager — Product Structure

**Status:** Draft  
**Purpose:** Target product structure for the single-world hockey simulation sandbox  
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`  
**Local repository path:** `C:\Projects\franchise-hockey-manager`

---

## 1. Purpose

This document defines the target product structure of Franchise Hockey Manager.

The product is currently designed as a personal, single-user hockey simulation sandbox. The current database represents one living hockey world. There is no separate New Game flow, save-slot system, player account, or career container at this stage.

The document describes:

- the global hockey world;
- the main application areas;
- the season lifecycle;
- teams, players, coaches, and competitions;
- event-based match simulation;
- draft, scouting, contracts, transfers, and development;
- Commissioner tools;
- balance and debugging workflows;
- the boundary between current scope and future product directions.

---

## 2. Product Concept

Franchise Hockey Manager is a browser-based, single-player hockey management and simulation sandbox.

The owner acts as both:

- General Manager;
- Head Coach;
- Commissioner of the simulated world.

The user is not permanently attached to one team. They may inspect and manage any club, national team, competition, player, or transaction.

The product combines:

- franchise management;
- team and lineup management;
- hockey database browsing;
- event-based match simulation;
- tournament simulation;
- player development;
- scouting and draft;
- contracts and transfers;
- historical simulation.

---

## 3. Current Product Mode: Single-World Sandbox

The current database is the active hockey world.

```text
Database state
= current world
= current season
= current teams
= current players
= current competitions
= current history
```

There is no separate career object yet.

Current behavior:

- the application opens directly into the current world;
- the user may manage any team;
- the user may edit any player in Commissioner Mode;
- all simulations update the same persistent world;
- historical results accumulate in the database.

Future direction:

- Career / Save Game support may be introduced only if the project becomes mature enough for external users;
- the current architecture should not prevent such a future migration;
- no save-slot or career abstraction should be implemented prematurely.

---

## 4. Core Product Principles

### 4.1. One Living World

The database represents one continuously developing hockey world.

### 4.2. Real Initial Data, Generated Future

The initial world uses:

- real leagues;
- real clubs;
- real cities;
- real active players;
- real coaches where practical.

Future seasons gradually add procedurally generated players through annual youth cohorts and the draft.

Real initial players and generated players use the same `Player` model.

Suggested source classification:

```text
REAL_INITIAL_DATA
GENERATED_YOUTH
MANUAL
IMPORTED
```

Once the world is initialized and simulation begins, real-world updates must not automatically overwrite the simulated history.

### 4.3. Non-Linear Performance

A player's overall quality must not be sufficient to predict production.

Actual performance depends on:

- specific attributes;
- role usage;
- linemate compatibility;
- accumulated familiarity;
- tactical fit;
- coach fit;
- current form;
- stability;
- game context;
- randomness.

### 4.4. Event-Based Match Results

Match results must be derived from generated hockey events.

The engine must not choose a final score first and then fabricate events to match it.

```text
events
→ shots and goals
→ final score
→ player and team statistics
```

### 4.5. Config-Driven Balance

Balance values belong in versioned configuration and editable presets, not scattered across code.

### 4.6. Manual Control with Safe Automation

The user may intervene anywhere, while simple automation handles repetitive tasks for other teams.

### 4.7. History Is Persistent

Completed competitions, drafts, transactions, and season snapshots become historical records.

---

## 5. Hockey World Structure

```text
Hockey World
├── Global Seasons
├── Countries
├── Leagues
├── Teams
├── Players
├── Coaches
├── National Teams
├── Competitions
├── Competition Editions
├── Competition Stages
├── Matches
├── Standings
├── Statistics
├── Drafts
├── Contracts
├── Transactions
├── Balance Presets
└── Historical Records
```

---

## 6. Global Season

The world uses one global season, for example:

```text
2026/27
```

All competitions belong to that global season, even when their display year differs.

```text
World Season 2026/27
├── NHL 2026/27
├── AHL 2026/27
├── SHL 2026/27
├── World Junior Championship 2027
├── World Championship 2027
└── Olympic Games 2026, when scheduled
```

---

## 7. Global Season Phases

The world does not initially simulate all leagues in a real-time parallel calendar.

The season proceeds through controlled phases.

```text
1. Season Preparation
2. Aggregated Lower and Foreign Leagues
3. NHL Regular Season
4. NHL Playoffs
5. World Junior Championship
6. World Championship and/or Olympics
7. Season Review
8. Annual Development
9. Offseason
10. NHL Draft
11. Transfers and Roster Preparation
12. Start Next Season
```

The system recommends the next valid phase, but the user launches it manually.

Before launching a phase, the user may:

- inspect teams;
- edit players;
- change lineups;
- change tactics;
- adjust simulation balance;
- review validation warnings;
- create a backup.

---

## 8. Main Navigation

```text
World
Competitions
Teams
Players
National Teams
Transfers
History
Settings
Simulation Lab
```

Initial active areas:

```text
World
Competitions
Teams
Players
Settings
Simulation Lab
```

Other areas become active as their mechanics are implemented.

---

## 9. World Dashboard

The World Dashboard is the default application screen.

It shows:

- current global season;
- current phase;
- completed phases;
- pending phases;
- recommended next action;
- recent competition results;
- active warnings;
- statistical leaders;
- latest transactions;
- upcoming international tournaments;
- backup status;
- quick links to NHL, teams, players, and settings.

Example:

```text
World Season: 2026/27
Current Phase: NHL Playoffs

Completed:
✓ Aggregated leagues
✓ NHL regular season

Pending:
○ World Junior Championship
○ World Championship
○ Annual development
○ NHL Draft

Recommended next action:
Simulate Next Playoff Match
```

---

## 10. Competitions

The Competitions area lists:

- detailed leagues;
- aggregated leagues;
- national-team tournaments;
- current editions;
- completed historical editions.

Competition cards show:

- name;
- type;
- season;
- simulation level;
- current stage;
- status;
- number of participants;
- current leader or champion.

---

## 11. Universal Competition Model

```text
Competition
└── Competition Edition
    ├── Participants
    ├── Stages
    ├── Matches or aggregated results
    ├── Standings
    ├── Player statistics
    ├── Team statistics
    ├── Awards
    └── Final ranking
```

Supported stage types:

- regular season;
- round robin;
- groups;
- knockout;
- best-of series;
- final ranking only.

A competition defines rules for:

- scoring;
- tiebreakers;
- overtime;
- shootouts;
- playoff qualification;
- seeding;
- series length;
- home advantage.

---

## 12. Competition Simulation Levels

Each league has a simulation level.

```text
DETAILED
AGGREGATED
```

### Detailed

Used initially for NHL.

Includes:

- full rosters;
- lines and tactics;
- schedules;
- event-based matches;
- standings;
- playoff series;
- full player and team statistics.

### Aggregated

Used initially for lower and foreign leagues.

Includes:

- teams and rosters;
- approximate team strength;
- final standings;
- seasonal player statistics;
- champion;
- top performers;
- simplified transfers and development.

Aggregated leagues do not initially require stored event logs or detailed matches.

---

## 13. Competition Page

Tabs:

```text
Overview
Participants
Standings / Groups
Schedule & Results
Playoffs
Player Statistics
Team Statistics
Awards
History
```

Available actions depend on competition state:

```text
Prepare Participants
Generate Schedule
Simulate Stage
Simulate Next Match
Simulate Series
Complete Competition
```

Invalid actions are hidden or disabled with an explanation.

---

## 14. Teams

The Teams area lists all clubs and national teams.

Filters:

- country;
- league;
- team type;
- current season;
- roster completeness;
- simulation level.

Each team opens a dedicated page.

---

## 15. Team Page

Target tabs:

```text
Overview
Roster
Lines
Tactics
Schedule
Statistics
Transfers
Contracts
Prospects
History
```

Initial tabs:

```text
Overview
Roster
Lines
Tactics
```

Later additions:

```text
Schedule
Statistics
Transfers
Contracts
Prospects
History
```

---

## 16. Team Overview

The Overview tab shows:

- team name and identity;
- league;
- coach;
- tactical style;
- roster size;
- average age;
- position depth;
- current strength;
- chemistry summary;
- recent results;
- current competition status;
- roster warnings;
- contract warnings;
- quick actions.

---

## 17. Team Roster

The roster supports two views.

### Table View

Suggested columns:

- name;
- position;
- age;
- current ability;
- role;
- potential estimate;
- form;
- roster status;
- contract status;
- salary;
- current team.

### Depth Chart

Groups:

```text
Centers
Left Wings
Right Wings
Defensemen
Goalies
```

Roster status:

```text
ACTIVE
RESERVE
PROSPECT
UNAVAILABLE
```

Contract status:

```text
SIGNED
EXPIRING
FREE_AGENT
DRAFT_RIGHTS
RETIRED
```

These classifications remain separate.

---

## 18. Roster Validation

Initial validation rules:

- enough forwards;
- enough defensemen;
- at least two goalies;
- all mandatory lineup slots filled;
- one player cannot occupy multiple main-line slots;
- unavailable players cannot be used in active lines;
- every player belongs to only one current team.

Real NHL roster limits, waivers, and contract-count rules are deferred.

---

## 19. Player Positions

Skater positions:

```text
LW
RW
C
LD
RD
```

Goalie:

```text
G
```

Each player supports:

```text
Primary Position
Secondary Positions[]
```

The first generator may assign only a primary position, while the model supports secondary positions from the beginning.

---

## 20. Lines and Pairings

Main lineup:

```text
Forward Line 1: LW — C — RW
Forward Line 2: LW — C — RW
Forward Line 3: LW — C — RW
Forward Line 4: LW — C — RW

Defense Pair 1: LD — RD
Defense Pair 2: LD — RD
Defense Pair 3: LD — RD

Goalies:
Starter
Backup
```

Later special teams:

```text
Power Play 1–2
Penalty Kill 1–2
Overtime
Extra Attacker
Shootout Order
```

A player may appear once in the main lineup, but may also appear in special-team units.

---

## 21. Lineup Interface

Primary interaction:

- drag and drop;
- automatic lineup;
- position validation;
- warnings;
- role indicators;
- chemistry indicators;
- tactical fit indicators.

Per line or pair, show:

- base strength;
- chemistry;
- tactical fit;
- coach fit;
- role balance;
- familiarity;
- warnings.

---

## 22. Automatic Lineup

Initial algorithm:

- respects primary and secondary positions;
- prioritizes current ability;
- considers player role;
- fills all mandatory slots.

Later algorithm:

- optimizes effective performance;
- considers chemistry;
- considers tactical fit;
- avoids role redundancy;
- considers current form;
- considers special-team requirements.

---

## 23. Coaches

A coach is a separate entity.

Initial fields:

- name;
- nationality;
- age or date of birth;
- coaching style;
- tactical style;
- overall coaching level;
- player development rating;
- offense rating;
- defense rating;
- current team.

Initial implementation supports one `HeadCoach` per team.

Assistant coaches, goalie coaches, and full staff are deferred.

---

## 24. Tactics

Initial team tactics consist of:

- one overall tactical style;
- one head coach style;
- player preferences;
- calculated player and lineup fit.

Initial tactical styles:

```text
Combinational
Physical
Speed
System
Forechecking
```

Fine-grained line-specific tactical instructions are deferred.

---

## 25. Players Area

The Players area is the global player database.

Functions:

- search;
- filter;
- sort;
- compare;
- open player page;
- export;
- Commissioner editing;
- batch inspection.

Filters may include:

- team;
- league;
- country;
- position;
- age;
- role;
- current ability;
- potential estimate;
- roster status;
- contract status;
- source type.

---

## 26. Player Page

Tabs:

```text
Profile
Attributes
Development
Preferences & Personality
Career Statistics
Contract & Team
Editor
```

### Profile

- name;
- nationality;
- age;
- position;
- current team;
- draft rights;
- source type;
- role;
- current ability;
- potential estimate.

### Attributes

- skater or goalie attributes;
- offensive rating;
- defensive rating;
- role rating;
- derived role;
- form;
- stability.

### Development

- annual snapshots;
- attribute changes;
- role changes;
- age curve;
- potential progression.

### Preferences & Personality

- preferred coaching style;
- preferred tactics;
- personality;
- hero rating;
- stability.

### Career Statistics

- season statistics;
- competition statistics;
- playoff statistics;
- international statistics;
- awards.

### Contract & Team

- current team;
- contract owner;
- draft-rights owner;
- salary;
- contract dates;
- transaction history.

### Editor

Available only in Commissioner Mode.

---

## 27. Player Ratings

There is no single authoritative overall used by simulation.

Derived ratings include:

```text
Current Ability
Offensive Rating
Defensive Rating
Role Rating
Tactical Fit
Potential Estimate
```

Compact ratings may be shown in tables, but simulation uses concrete attributes and context.

---

## 28. Skater Attributes

Initial skater attributes:

```text
STH — Stickhandling
SHO — Shooting
PAS — Passing
STR — Strength
SPD — Speed
BAL — Balance
AGG — Aggression
OF.AW — Offensive Awareness
DEF.AW — Defensive Awareness
```

Additional center-specific faceoff ability may be added separately.

---

## 29. Goalie Attributes

```text
REF — Reflexes
POS — Positioning
REC — Rebound Control
GLV — Glove
BLK — Blocker
MOV — Movement
PUC — Puck Handling
CON — Consistency
STA — Stamina
```

Initial goalie archetypes:

- Reflex Goalie;
- Positional Goalie;
- Hybrid;
- Puck-Playing Goalie.

Goalies must never use the skater model.

---

## 30. Roles and Archetypes

Roles are derived from attribute profiles.

A role may change after annual development.

To prevent unstable role switching, apply:

- a role-change threshold;
- current-role inertia;
- role history.

Commissioner Mode edits attributes, not the role directly.

---

## 31. Potential

Hidden potential model:

```text
potentialFloor
potentialCeiling
developmentRisk
```

Scouting displays an estimate of this range, not the exact hidden values.

---

## 32. Chemistry

F9 foundation (config version `f9-v1`) is live in `packages/engine/src/chemistry` and exposed at `GET /api/teams/:id/chemistry` / Team Lines.

```text
Base Compatibility
+ Familiarity contribution (F9: always 0)
= Current Chemistry
```

Base compatibility depends on:

- role combinations (config pairwise matrix);
- personality (modest config contribution);
- coach-style fit and tactical fit are separate modifiers on effective performance, not folded into chemistry score.

Familiarity is represented (`familiarity: 0`, `familiarityStatus: NOT_TRACKED_YET`) but does not accumulate yet.

The interface shows:

- exact number;
- qualitative label;
- positive factors;
- negative factors.

---

## 33. Effective Performance

F9 conceptual model:

```text
effectivePerformance = baseAbility × (1 + clamp(totalModifier))
totalModifier = chemistryContribution + coachFitContribution + tacticalFitContribution
```

Component and total caps live in `chemistry-weights.json` (F9 defaults ±0.30 total).

Later modifiers (form, fatigue, home advantage, randomness, hero moments) remain out of scope until match simulation milestones.

---

## 34. Match Simulation Overview

The match engine is event-based and deterministic under a fixed input and seed.

Input includes:

```text
rosters
lines
tactics
coach data
attributes
form
balance configuration
engine version
random seed
competition rules
```

Output includes:

```text
Match
MatchResult
MatchEvent[]
PlayerGameStat[]
TeamGameStat[]
```

---

## 35. Event Simulation Hierarchy

```text
Match
└── Period
    └── Shift
        └── Possession
            └── Event
```

- shift selects participants and context;
- possession models the attacking sequence;
- events produce shots, penalties, goals, and statistics.

The engine does not simulate physical player coordinates.

---

## 36. Game Zones

```text
DEFENSIVE
NEUTRAL
OFFENSIVE
```

Zones influence:

- zone exits;
- neutral-zone transitions;
- zone entries;
- turnovers;
- shot creation;
- tactical effectiveness.

---

## 37. Core Match Events

```text
PERIOD_START
FACEOFF
POSSESSION_GAIN
ZONE_EXIT
ZONE_ENTRY
TURNOVER
SHOT
SHOT_BLOCKED
SHOT_MISSED
SAVE
GOAL
PENALTY
PERIOD_END
OVERTIME_START
SHOOTOUT_ATTEMPT
GAME_END
```

Events may include:

- player IDs;
- team ID;
- game clock;
- period;
- zone;
- strength state;
- shot type;
- visibility level;
- technical probability details.

---

## 38. Shift and Line Rotation

Initial rotation:

- probabilistic;
- based on configured ice-time shares.

Later rotation considers:

- current score;
- game clock;
- tactical situation;
- power play;
- penalty kill;
- protecting a lead;
- chasing the game.

---

## 39. Shot Model

Initial shot flow:

```text
shot creation
→ block / miss / on target
→ goalie resolution
→ save / goal
```

Target shot types:

- wrist shot;
- slap shot;
- snap shot;
- backhand;
- tip or deflection.

Shot outcome depends on:

- shot quality;
- shooter attributes;
- pass chain;
- screens or deflections;
- defensive pressure;
- goalie attributes;
- goalie form;
- randomness.

---

## 40. Assists

Assists come from the actual possession chain.

They are not randomly distributed after the match.

---

## 41. Penalties and Special Teams

Initial strength states:

```text
5v5
5v4
4v5
```

A penalty changes:

- active players;
- possession probabilities;
- shot frequency;
- shot quality;
- scoring probability.

Complex coincidental penalties and uncommon strength combinations are deferred.

---

## 42. Faceoffs

Faceoffs occur:

- at period starts;
- after goals;
- after stoppages;
- where competition rules require.

Center faceoff ability affects possession.

Not every possession begins with a faceoff.

---

## 43. Game State

```text
GameState
├── period
├── clock
├── score
├── strengthState
├── currentLines
├── possession
├── zone
├── activePenalties
└── recentEvents
```

Score and time influence simulation behavior.

---

## 44. Match Pause and Resume

The engine should support:

```text
simulateShift()
simulatePeriod()
simulateUntilPausePoint()
resumeMatch(updatedInput)
simulateEntireMatch()
```

Future user intervention between periods may include:

- tactics;
- lines;
- goalie;
- strategy.

Already generated events are never recalculated.

---

## 45. Match Statistics

Initial skater statistics:

```text
Goals
Assists
Points
Shots
Penalty Minutes
Plus/Minus
Time on Ice
```

Initial goalie statistics:

```text
Shots Against
Saves
Goals Against
Save Percentage
```

Team statistics:

- goals;
- shots;
- power-play opportunities;
- power-play goals;
- penalty minutes;
- faceoff percentage;
- possession or zone metrics where available.

---

## 46. Match Screen

The target match screen includes:

- score;
- period and clock;
- teams;
- lineups;
- event feed;
- team statistics;
- player statistics;
- period summaries;
- simulation controls;
- pause and resume;
- Commissioner resimulation;
- diagnostics when enabled.

Implementation may begin with a completed-match result page before live playback.

---

## 47. Technical and Public Event Logs

Target structure:

```text
SimulationEvent
→ full structured technical log

MatchFeedEvent
→ concise user-facing event feed
```

The initial implementation may use one event model with a visibility field.

---

## 48. Determinism

The same:

- inputs;
- balance version;
- engine version;
- seed

must produce the same output.

Every match stores:

```text
engineVersion
balancePresetId
balanceConfigVersion
balanceSnapshot or immutable version
randomSeed
simulationMode
createdAt
```

---

## 49. Simulation Randomness

The default randomness level is moderate.

It must be editable during development.

Suggested top-level parameter:

```text
simulationRandomness
```

Detailed debug controls may include:

```text
eventVariance
finishingVariance
goalieVariance
penaltyVariance
upsetStrength
```

The ordinary settings UI exposes a simple control. Detailed controls live under Simulation Debug.

---

## 50. Match Resimulation

Resimulation is available only in Commissioner Mode.

Rules:

- confirmation required;
- a new seed may be generated;
- previous result is replaced or marked superseded;
- standings and statistics are recalculated;
- action is recorded.

---

## 51. NHL Regular Season

Target actions:

```text
Simulate Next Game
Simulate Next Day
Simulate Next Week
Simulate Regular Season
```

Initial implementation may provide only:

```text
Simulate Regular Season
```

All NHL matches should use the event engine, even when processed in batch.

A future fast mode may be added if performance requires it.

---

## 52. NHL Playoffs

Playoff configuration supports:

- number of teams;
- seeding;
- pairing rules;
- reseeding;
- home advantage;
- wins required;
- overtime rules.

Initial action:

```text
Simulate Next Match
```

Later:

```text
Simulate Until Elimination Game
Simulate Entire Series
```

---

## 53. Aggregated Leagues

Aggregated leagues are simulated before NHL.

Outputs:

- final standings;
- team results;
- seasonal player statistics;
- champion;
- top performers;
- basic roster movement.

Mathematical consistency is mandatory:

- player goals equal team goals;
- assists correspond to goals;
- player games do not exceed team games;
- goalie statistics match goals against.

---

## 54. National Teams

A country has a persistent national team entity.

Each tournament has its own roster.

```text
National Team
└── Tournament Roster
    ├── Selected Players
    ├── Lines
    ├── Coach
    └── Tactics
```

The system proposes the roster based on eligibility and quality. The user may manually correct it before confirmation.

**F22 implementation note:** National teams use `Team` (`teamType=NATIONAL`) plus `NationalTeamProfile` (senior/U20). Tournament rosters are edition-specific snapshots; club ownership never changes. International match schedules remain F23.

---

## 55. International Tournaments

Initial tournaments:

- World Junior Championship;
- World Championship;
- Olympic Games.

No international club tournaments are required initially.

Participants are initially configured manually or from a fixed list.

Qualification systems are deferred.

**F23 implementation note:** Templates `WORLD_JUNIORS`, `WORLD_CHAMPIONSHIP`, and `OLYMPIC_GAMES` are simplified config-driven formats (not exact IIHF/IOC replicas). Execution requires locked F22 national-team editions and uses the F14 match engine.

---

## 56. World Junior Championship

Requirements:

- age eligibility;
- automatic candidate selection;
- suggested roster;
- manual corrections;
- groups;
- playoffs;
- statistics;
- awards.

It uses the same universal competition engine.

---

## 57. Player Development

**F24:** Development occurs once per WorldSeason via an official `PlayerDevelopmentRun` (preview → prepare with PRE snapshots → atomic execute). Age uses an explicit effective date. See `ARCHITECTURE.md` §7j and `PLAYER_MODEL.md` §0.5.

Development occurs once per global season.

```text
Apply Annual Development
```

The operation:

1. saves completed-season snapshots;
2. increases age;
3. applies development or decline;
4. changes attributes;
5. recalculates ratings;
6. recalculates role;
7. evaluates retirement;
8. normalizes form;
9. generates the next youth cohort.

---

## 58. Attribute Development

A seasonal development budget is calculated from:

- age curve;
- hidden potential;
- development rate;
- development risk;
- random variation.

The budget is distributed among attributes based on:

- position;
- role;
- current profile;
- age;
- development configuration.

---

## 59. Form and Stability

### Form

- short-term;
- changes after matches;
- trends toward neutral;
- does not alter permanent attributes;
- resets or normalizes between seasons.

### Stability

- persistent player trait;
- controls match-to-match variance;
- does not provide a permanent strength bonus or penalty.

---

## 60. Youth Generation

Each country has a generation profile:

```text
Country Generation Profile
├── Name Pools
├── Position Distribution
├── Quality Distribution
├── Attribute Tendencies
└── Annual Cohort Size
```

Youth players are generated at ages 15–17.

The first implementation may generate mostly 17-year-olds.

---

## 61. Retirement

Retirement probability depends on:

- age;
- current level;
- team status;
- roster role;
- free-agent status;
- randomness.

Commissioner Mode may force or cancel retirement.

---

## 62. Player Season Snapshots

After each season, save:

```text
PlayerSeasonSnapshot
├── age
├── team
├── league
├── attributes
├── ratings
├── role
├── season statistics
├── awards
└── development changes
```

---

## 63. Scouting

Scouting displays estimates rather than true hidden values.

Prospect information:

- profile;
- position;
- nationality;
- age;
- estimated current ability;
- estimated potential range;
- estimated attributes;
- role projection;
- personality notes;
- development risk;
- scouting confidence;
- tournament statistics.

Scouting actions:

```text
Scout Player
Scout Country
Scout Tournament
```

Scouting actions are limited by a balance setting.

Commissioner Mode may reveal all true values.

---

## 64. NHL Draft

The draft is required in the first renewable-world cycle.

Configurable number of rounds.

Initial preset:

```text
3 rounds
```

Future preset:

```text
7 rounds
```

Draft order:

- lottery for non-playoff teams;
- remaining order based on season and playoffs;
- rules defined in configuration;
- Commissioner override before the draft.

---

## 65. Draft Class

The draft class is formed from players already living in the world.

```text
Annual Youth Cohorts
→ age and eligibility rules
→ NHL Draft Class
```

Undrafted players:

- stay in their current league;
- may remain eligible;
- may later become free agents.

---

## 66. Draft AI

The user may control one or more teams.

Other teams use simple strategies:

```text
Best Player Available
High Upside
Team Need
Low Risk
```

AI teams use their own scouting estimates, not hidden true values.

---

## 67. Draft Screen

```text
Header
├── Round
├── Current Pick
├── Team on the Clock
├── Pause / Auto Advance
└── Commissioner Control

Left
└── Draft order and completed picks

Center
└── Available prospects

Right
├── Prospect details
├── Team needs
├── Recommendations
└── Confirm Pick
```

There is no real-time selection timer.

---

## 68. Draft Rights

A draft selection creates rights ownership.

```text
DraftSelection
→ NHL Team owns player rights
```

The player may remain with a foreign or youth club.

Separate concepts:

```text
Current Team
Contract Owner
NHL Draft Rights Owner
National Team Eligibility
```

---

## 69. Contracts

Initial contracts are simplified.

Fields:

- team;
- start season;
- end season;
- salary per season;
- status;
- extension state.

Salary uses real currency formatting, such as:

```text
$4,500,000 per season
```

The model does not need to match real market values exactly.

---

## 70. Salary Cap

Salary cap does not initially block transactions.

Development path:

```text
contracts without cap enforcement
→ simple hard team cap
→ advanced NHL rules
```

---

## 71. Contract Extensions

The system calculates recommended terms from:

- player quality;
- age;
- potential;
- statistics;
- team role.

The user may:

- accept;
- decline;
- edit in Commissioner Mode.

Other teams use a simple automated decision.

---

## 72. Free Agency

Teams create simple offers based on:

- positional need;
- player quality;
- age;
- potential;
- expected cost.

The user may review and adjust automated results before applying them.

---

## 73. Trades

The product includes a manual Trade Builder.

Trade assets:

- players;
- draft picks;
- player rights.

The system displays:

- estimated value for each side;
- positional need;
- age and potential;
- imbalance warning.

Trades are not blocked for imbalance because this is a sandbox.

---

## 74. Trade Automation

AI teams do not initially complete trades independently.

The system may suggest:

- excess positions;
- weak positions;
- possible targets;
- possible asset combinations.

The user confirms the transaction.

---

## 75. Transfers Area

Target tabs:

```text
Transactions
Free Agents
Trade Center
Expiring Contracts
Draft Rights
Suggestions
```

Initial tabs:

```text
Transactions
Free Agents
Trade Center
```

---

## 76. Transaction Log

Transaction types:

```text
SIGNING
EXTENSION
RELEASE
TRADE
DRAFT_SELECTION
RIGHTS_TRANSFER
ROSTER_PROMOTION
ROSTER_DEMOTION
RETIREMENT
```

Each record stores:

- global season;
- season phase;
- teams;
- players;
- draft picks;
- description;
- source.

Sources:

```text
USER
AUTOMATION
COMMISSIONER
```

Applied transactions become historical. Corrections require Commissioner Mode or database restore.

---

## 77. Season Review

Target content:

- champions;
- final standings;
- playoff bracket;
- international winners;
- top scorers;
- best goalies;
- awards;
- major transfers;
- breakout players;
- retirements;
- records.

Initial version may show only champions and statistical leaders.

---

## 78. History

Target sections:

```text
Seasons
Competitions
Champions
Team History
Player Careers
Draft History
Transactions
Records
Awards
```

Initial implementation:

```text
Seasons
Competition Results
Champions
Draft History
Player Season Snapshots
```

Completed competitions are archived when they finish, not only at the end of the global season.

---

## 79. Records

Initial records:

- most goals in a season;
- most points in a season;
- best save percentage;
- most team wins;
- championships;
- highest draft picks by country and team.

---

## 80. Settings

Two top-level settings groups:

### Game Balance

```text
Player Generation
Development & Aging
Chemistry
Tactical Fit
Match Simulation
Goalies
Scouting
Draft
Contracts & Transfers
Aggregated Leagues
```

### System & Debug

```text
Simulation Randomness
Random Seed
Event Probabilities
Batch Simulation
Logging Detail
Commissioner Mode
Database Backup
Database Maintenance
```

---

## 81. Balance Presets

Default values live in JSON configuration files.

Editable active presets live in the database.

```text
Default JSON config
→ imported into BalancePreset
→ editable active preset
→ immutable version or snapshot stored with simulation
```

Example presets:

```text
Standard
Low Randomness
High Variance
Development Test
Scoring Test
```

Actions:

- duplicate;
- rename;
- edit;
- activate;
- export;
- import;
- reset.

---

## 82. Runtime Settings

Before a match, any active preset values may be changed.

During a paused match, only runtime-safe settings may change:

- randomness;
- playback speed;
- logging detail;
- tactics;
- lines;
- goalie.

Past events are not recalculated.

---

## 83. Simulation Lab

The Simulation Lab is a first-class product area.

**F13 partial implementation (2026-07-13):** `/simulation-lab` hosts **Technical Match Simulation (F13)** — regulation scoring plus basic 5v4 special teams, strength/penalty panels, PP/PK stats, and step/resume. Batch counts (10/100/1000) and full Lab analytics remain future (F16).

**F14 partial implementation (2026-07-13):** `/matches` hosts **Playable Match (F14)** — create ad hoc matches, simulate regulation + OT + shootout, persist results/events/stats, reload identical outcomes. Commissioner resimulation with attempt history. Not a schedule view (F17).

**F15 partial implementation (2026-07-13):** `/matches/:matchId` is the polished **Match Viewer** — Overview (scoreboard/period/scoring), public Events feed, Team/Player/Goalie stats, Lines & Usage, exports; Commissioner Diagnostics and Attempts. Simulation Lab remains the technical debug tool.

**F16 partial implementation (2026-07-13):** `/simulation-lab` hosts **Batch Lab** (default) for unpersisted 1/10/100/1000-game balance analysis plus **Single Match Debug** (preserved F13 technical tool). Official Matches are never created by Lab runs.

**F17–F24 (2026-07-13):** Competitions host structural editions with participants/stages/rules. F18 enables DETAILED regular-season schedules and standings. F19 enables BEST_OF_SERIES playoffs through champion determination and edition completion readiness. F20 archives COMPLETED editions into immutable historical records with awards, records, and History UI. F21 enables AGGREGATED domestic leagues via fast deterministic season simulation without MatchEvent persistence. F22 adds persistent national teams and CompetitionEdition-scoped roster preparation. F23 runs international tournaments from locked national-team snapshots through groups, knockout, medals, and archive readiness (simplified templates). F24 applies one deterministic annual player-development cycle per WorldSeason (preview/prepare/execute) without youth generation or season advancement.

Inputs:

```text
Team A
Team B
Lineups
Balance preset
Randomness
Number of simulations
```

Actions:

```text
Run 1
Run 10
Run 100
Run 1000
```

Outputs:

- win rate;
- average score;
- goal distribution;
- shots;
- power-play efficiency;
- lineup contribution;
- top performers;
- upset rate;
- warnings;
- anomalies.

---

## 84. Match Diagnostics

Commissioner/debug panel:

```text
Match Input
Balance Version
Seed
Event Counts
Probability Breakdown
Line Usage
Possession by Zone
Expected vs Actual Goals
Warnings
Technical Event Log
```

---

## 85. Commissioner Mode

Commissioner Mode enables:

- player editing;
- team editing;
- roster changes;
- transaction correction;
- participant correction;
- result correction;
- match resimulation;
- draft control;
- true scouting values;
- retirement override;
- historical correction.

It must be visually obvious when enabled.

All changes should be logged.

---

## 86. Database Initialization

An empty database opens a Setup World screen.

```text
Database is empty

Initialize Hockey World
```

Initialization includes:

- countries;
- name pools;
- NHL structure;
- NHL teams;
- selected aggregated leagues;
- real initial players;
- coaches where practical;
- global season;
- competition definitions;
- competition editions;
- default balance preset.

The process runs in sequential, validated steps and produces a result report.

---

## 87. Real Data Import Boundary

Initial real-player data comes from a prepared local CSV or JSON snapshot.

Foundation scope excludes:

- automatic web scraping;
- scheduled synchronization;
- automatic real-world roster updates;
- live external APIs.

Import process:

```text
prepare snapshot
→ validate
→ import
→ review
→ initialize world
→ freeze initial state
→ continue only through simulation
```

Suggested metadata:

```text
externalId
sourceDataset
sourceUpdatedAt
playerSource
```

---

## 88. Import and Export

Initial support:

- import player dataset;
- import name pools;
- export players to JSON or CSV;
- export standings and statistics to CSV;
- import and export balance presets;
- full database backup;
- full database restore.

---

## 89. Backups

Automatic backups before:

- full competition simulation;
- annual development;
- NHL Draft;
- offseason completion;
- next-season creation.

Manual backup is also available.

The first implementation may copy or export the SQLite database.

---

## 90. Main Product Flows

### Open Current World

```text
Open application
→ World Dashboard
→ review current phase
→ inspect or edit data
→ launch next action
```

### Manage a Team

```text
Teams
→ select team
→ Roster
→ Lines
→ Tactics
→ validate
```

### Simulate a Match

```text
Competition
→ select match
→ verify lineups
→ select preset and randomness
→ simulate
→ view events and statistics
```

### Simulate NHL Season

```text
Season Preparation
→ validate teams
→ generate schedule
→ simulate regular season
→ standings
→ playoffs
→ champion
→ archive
```

### Run International Tournament

```text
select tournament
→ generate participants
→ propose national rosters
→ manual correction
→ groups
→ playoffs
→ champion
→ archive
```

### Run NHL Draft

```text
form eligible draft class
→ run lottery
→ confirm order
→ scout
→ draft-day screen
→ manual and AI selections
→ assign rights
→ archive
```

### Complete Season

```text
Season Review
→ development
→ retirements
→ youth generation
→ draft
→ contracts and transfers
→ roster validation
→ create next season
```

---

## 91. Core Product Rules

1. The database is the current world.
2. No separate career or New Game flow is required now.
3. Real initial players and generated future players share one model.
4. Real-world updates must not overwrite an active simulated world.
5. NHL is detailed; other leagues begin as aggregated.
6. Season phases are sequential and user-triggered.
7. Match results come from event generation.
8. A fixed seed and input must reproduce a match.
9. Overall rating is not the primary simulation input.
10. Chemistry and tactical fit must materially change performance.
11. Goalies use a separate attribute model.
12. Player roles are derived from attributes.
13. Completed competitions are archived.
14. Draft rights, current team, and contract ownership are separate.
15. Commissioner Mode permits intervention but logs changes.
16. Every mass simulation and seasonal transition should be recoverable through backup.
17. Balance parameters are versioned and config-driven.
18. The first renewable-world cycle includes a real NHL Draft.

---

## 92. Deferred Mechanics

Deferred:

- multiple careers and save slots;
- authentication;
- multiplayer;
- real-time parallel global calendar;
- live external roster synchronization;
- advanced salary cap rules;
- waivers;
- arbitration;
- offer sheets;
- retained salary;
- detailed international transfer agreements;
- full coaching staff;
- injuries generated by simulation;
- morale and locker-room systems beyond basic personality chemistry;
- qualification systems for international tournaments;
- AI GM personalities and autonomous trade negotiation;
- graphical rink visualization.

---

## 93. Future Career Direction

A future commercial version may introduce:

```text
Career
├── user-controlled team
├── independent world snapshot
├── difficulty
├── save slots
├── user profile
└── progression rules
```

This is not part of the foundation plan.

---

## 94. Open Questions

To be resolved during implementation and balancing:

- exact real-player import format;
- exact initial league list;
- final skater role tables;
- exact role-change threshold;
- familiarity accumulation beyond F9 stub;
- event probability model;
- final shot model;
- special-team lineup rules;
- form update formula;
- retirement formula;
- scouting-action timing;
- initial contract-value formula;
- final draft lottery preset;
- performance requirements for full NHL event simulation.

---

## Guiding Principle

**Build one persistent hockey world that can be inspected, edited, simulated, and renewed season after season. Use event-driven matches, config-driven balance, and explicit historical records so that the world becomes increasingly unique without losing reproducibility or control.**
