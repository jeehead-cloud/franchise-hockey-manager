# Atlas Design System

Atlas is the design system for **browser-based sports management simulators** — currently themed for a **hockey manager** (think: run a club, manage a roster, track league standings, chase a playoff run). It provides reusable foundations — dashboards, tables, brackets, player profiles, notifications — that make dense league/roster data easy to scan and act on, in a clean light-mode shell.

This is a **from-scratch build**: no existing codebase, Figma file, or brand guideline was attached. Everything here — palette, type, components, and the UI kit — was authored to spec from the brief and the user's direction picks (see below). There is **no logo** provided or invented; the wordmark "Atlas" is rendered in type wherever a mark would normally sit.

## Direction (v2 — sports-manager rework)

Atlas started as a dark tactical-HUD system for general strategy/simulation games (map, editor). The user asked to rework it for a **sports manager sim** — lighter, sports-appropriate colors, and dedicated sports UI (standings, brackets, stats, roster/player tables, player cards). The v2 direction:

- **Shell**: light — white cards (`--gray-0`) on a soft gray app background (`--gray-1`). No more dark graphite viewport; there's no map to protect here, just data.
- **Accent is team-themeable**: `--team-1…6` (default "classic ice" blue) is the ONE palette family meant to be swapped per club — see `guidelines/colors-team.html` for the override pattern. Status/semantic hues (win=green, loss=red, OTL=amber, info=steel-blue) are **fixed** and never swapped, so meaning stays legible no matter which team's colors are active.
- **Type**: all-sans now (`IBM Plex Sans` for everything, including what used to be a serif display face) — a more modern sports-app feel. `IBM Plex Mono` is kept for anything tabular: scores, standings, stat columns.
- **Density**: kept the same balanced density from v1 — data-rich tables, comfortable row heights, nothing cramped.

Earlier direction options (A "Tactical HUD" / B "Cartographer") and the original map/editor UI kits have been retired — they no longer fit a roster-and-standings product. `components/game/` (Panel, StatMeter, StatusPill) survived the pivot as generic HUD primitives, restyled and re-themed for sports use (StatusPill now expresses home/away/W-L-OTL instead of game factions).

## Product covered

**Team Manager** — the core hockey-manager app: team dashboard (next match, roster snapshot), league standings, playoff bracket, and a player profile screen. (`ui_kits/team-manager/`)

## Sources

None attached — no Figma link, GitHub repo, or slide deck was provided at any point. All values were authored directly. If real Atlas/hockey-manager material (screens, a codebase, Figma) becomes available, this system should be reconciled against it.

---

## Content fundamentals

*(Authored from scratch — revise once real product copy exists.)*

- **Voice**: brisk sports-broadcast energy — short, declarative, stat-forward. "Ironclad clinches the division" not "Congratulations to Ironclad on clinching the division!"
- **Casing**: Title Case for primary actions/nav ("Sign Player", "View Roster"); ALL CAPS + wide tracking for table headers and status labels ("FINAL", "OTL"); sentence case for body copy.
- **Numbers over adjectives**: "88 PTS, +34 DIFF" beats "a great season." Every claim should be backed by a stat sitting right next to it.
- **No exclamation points, no emoji.** Result color (win=green/loss=red) and iconography carry emotional tone, not punctuation.
- **Status labels are one word**: "Injured", "Suspended", "Healthy" — never a sentence.

## Visual foundations

- **Colors**: light neutral shell (white cards, soft gray app bg) + a single **team-themeable accent** (`--team-*`, default ice blue) reserved for primary actions, the user's-team highlight row, and hero banners. Win/loss/OTL and info/success/danger/warning are **fixed hues**, independent of team color, so status always reads correctly. See `tokens/colors.css` and the Colors cards.
- **Type**: all-sans (`IBM Plex Sans`) for every UI role, including headings — no serif anymore. `IBM Plex Mono` is reserved for tabular data (standings, stat leaderboards, scores) where digit alignment matters.
- **Spacing**: unchanged 4px-derived scale, balanced density — compact table rows, comfortable click targets.
- **Backgrounds**: flat surfaces — no photography, no illustration, no texture. The **only** gradient in the system is `--gradient-team-hero`, a team-color wash used exclusively on hero banners (team page headers, player-card top band) — never on cards, tables, or buttons.
- **Animation**: minimal, functional — fast (100–160ms) ease-out transitions for hover/selection/panel changes. No bounce/spring, no ambient looping animation.
- **Hover state**: surfaces step one tone (white → `--gray-2`); accent buttons lighten one step. No opacity fades.
- **Press/active state**: accent buttons darken one step; no scale/shrink transforms.
- **Borders**: 1px hairlines (`--border-subtle`/`--border-default`) on cards, tables, and inputs — Atlas stays a bordered system, not shadow-only. Selected/focused elements get a 1px team-accent border.
- **Shadows**: soft and low-contrast (`--shadow-sm/md/lg`, all built from a single translucent ink color) — cards lift gently off the light app background, never a hard dark drop shadow.
- **Corner radii**: unchanged — `--radius-sm` (4px, inputs/chips), `--radius-md` (6px, buttons/panels/tables), `--radius-pill` (badges/status labels only).
- **Cards/panels/tables**: white fill, 1px border, `--radius-md`, `--shadow-sm` at most. No colored left-border accent strips. The user's-team row/card highlights with the team-accent wash background, not a border stripe.
- **Transparency/blur**: reserved for the modal scrim only (`--surface-overlay` + `--blur-scrim`).
- **Imagery**: none provided or invented — `PlayerCard` falls back to initials on the team-color band when no photo is supplied.

## Iconography

**[Lucide](https://lucide.dev)** (CDN), unchanged from v1 — single-weight line icons, consistent stroke, works well at small UI sizes. No emoji, no unicode-as-icon. See `assets/README.md`.

---

## Components

**Core** (`components/core/`) — Button, IconButton, Input, Select, Checkbox, Radio, Switch, Tabs, Tooltip.
**Feedback** (`components/feedback/`) — Badge, Tag, Toast, Dialog.
**Game/HUD primitives** (`components/game/`) — Panel, StatMeter, StatusPill (home/away/win/loss/OTL/neutral).
**Sports** (`components/sports/`) — StandingsTable, StatsTable, PlayerTable, PlayerCard, Bracket.

### Intentional additions

No component source existed to enumerate against (from-scratch build). The core/feedback set is the standard primitive inventory sized to Atlas's needs. `Panel`, `StatMeter`, `StatusPill` (HUD primitives) and the five `components/sports/` components were added because a sports manager needs primitives no generic design system ships: a labeled progress bar for fitness/fatigue/morale, a home/away/result status dot, a sortable standings table, a configurable stat leaderboard, a roster table with health-status pills, a player profile card, and a playoff bracket.

## Index

- `styles.css` — root stylesheet; import this one file.
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `effects.css`, `fonts.css`.
- `guidelines/` — foundation specimen cards (colors incl. team-theming demo, type, spacing, effects) for the Design System tab.
- `assets/README.md` — iconography (Lucide via CDN) and logo-absence notes.
- `components/core/`, `components/feedback/`, `components/game/`, `components/sports/` — see Components above; each has a `*.card.html` showcase.
- `ui_kits/team-manager/` — Dashboard, Standings, Playoffs, Player Profile screens (`index.html` + `README.md`).
- `SKILL.md` — portable skill file for using this system in Claude Code.

## Caveats — please read

- **No source material was attached, at any point in this system's history.** Every color, type choice, spacing value, and component was authored from the brief + direction picks, not copied from a real product.
- **No logo exists.** The wordmark is set in `--font-sans` wherever a mark would go.
- **Fonts are Google Fonts substitutes** (IBM Plex Sans / IBM Plex Mono), loaded via CDN.
- **Icons are Lucide** (CDN), a substitution.
- **Team colors, league name, team names, and all player/stat data are invented placeholders** for demonstration — replace with real league/roster data.

**Please attach real product material** — a codebase, Figma file, screenshots, or brand/league guidelines — so this system can be revised to match reality instead of an invented starting point.
