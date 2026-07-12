Generic configurable table for stat leaderboards (top scorers) or full rosters — pass whatever columns the view needs.

```jsx
<StatsTable
  columns={[{key:"name",label:"Player"},{key:"gp",label:"GP"},{key:"g",label:"G"},{key:"a",label:"A"},{key:"pts",label:"PTS"}]}
  rows={[{id:1,name:"A. Kessler",gp:62,g:34,a:41,pts:75}, ...]}
  highlightId={1}
/>
```
