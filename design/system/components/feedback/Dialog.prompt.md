Modal for confirmations and short forms (delete scenario, new game setup). Scrim is the only blurred surface in Atlas.

```jsx
<Dialog open={open} title="Delete Scenario?" onClose={close} footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button variant="danger" onClick={confirm}>Delete</Button></>}>
  This cannot be undone.
</Dialog>
```
