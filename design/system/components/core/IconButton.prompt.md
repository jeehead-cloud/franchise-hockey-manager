Square icon-only button for toolbars, editor tool rails, and panel headers.

```jsx
<IconButton icon={<PenIcon />} active={tool === "pen"} onClick={() => setTool("pen")} title="Draw" />
```

`active` renders the selected-tool state (gold outline + wash) — use for editor tool rails where exactly one tool is active at a time.
