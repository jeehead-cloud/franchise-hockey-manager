Command button for primary/secondary/ghost/danger actions — the base action element across HUD, editor, and dialogs.

```jsx
<Button variant="primary" size="md" onClick={deployUnit}>Deploy Unit</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="danger" size="sm">Delete Layer</Button>
```

Variants: `primary` (gold fill, main commands), `secondary` (outlined), `ghost` (no border, toolbar-style), `danger` (rust fill, destructive). Sizes `sm`/`md`/`lg`; `sm` renders uppercase+tracked like other compact HUD labels. Pass `icon` for a leading glyph.
