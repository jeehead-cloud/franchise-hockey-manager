# Atlas iconography

No icon codebase, sprite sheet, or SVG set was provided with this build. **[Lucide](https://lucide.dev)** was selected and is loaded via CDN in the UI kits and component cards:

```html
<script src="https://unpkg.com/lucide@0.462.0/dist/umd/lucide.js"></script>
```

```jsx
// render an icon by Lucide PascalCase name, e.g. "Swords", "ShieldHalf", "Footprints"
window.lucide.icons[name].toSvg({ width: 16, height: 16, "stroke-width": 1.75 })
```

Why Lucide: single 1.75–2px stroke weight, no fill, geometric — matches Atlas's technical/tactical tone at small HUD sizes (16–20px). This is a **flagged substitution** — if Atlas has its own icon set, swap it in here and update the UI kits/components that reference Lucide names.

No emoji. No unicode glyphs used as icons (unicode is reserved for real typographic characters, e.g. `·` and `→` in copy).

No logo was provided — nothing has been invented in its place. The "Atlas" wordmark (set in `--font-display`) stands in wherever a mark would go.
