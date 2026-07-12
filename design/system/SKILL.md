---
name: atlas-design
description: Use this skill to generate well-branded interfaces and assets for Atlas, a design system for browser-based sports management simulators (currently themed for a hockey manager), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

Notes specific to Atlas:
- This system was built from scratch — no real Atlas codebase, Figma, or brand guideline exists yet. Treat tokens/components/UI kits as a strong starting point, not ground truth; flag this to the user if precision matters.
- No logo exists — never invent one. Render "Atlas" in `--font-sans` wherever a mark would go.
- Fonts (IBM Plex Sans / IBM Plex Mono) and icons (Lucide) are CDN-loaded substitutes, not real brand assets — see `readme.md` and `assets/README.md`.
- Light shell (white cards on soft gray bg). Only `--team-*` tokens are meant to be re-themed per club; win/loss/OTL/info/success/danger/warning hues are fixed and must never be swapped for a team color.
- Use `IBM Plex Mono` for anything tabular (standings, stat leaderboards, scores) — keeps digit columns aligned. Everything else is sans.
- Reach for `components/sports/` (StandingsTable, StatsTable, PlayerTable, PlayerCard, Bracket) before building bespoke sports UI from scratch.
