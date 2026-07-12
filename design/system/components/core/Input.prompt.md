Single-line text field for forms, search, and inspector properties.

```jsx
<Input value={name} onChange={e => setName(e.target.value)} placeholder="Scenario name" />
```

Focus shows a gold border (`--border-focus`), matching selection color elsewhere in Atlas. Pass `icon` for a leading search/filter glyph.
