Playoff bracket — horizontal rounds of matchups, winner rows highlight in the team accent.

```jsx
<Bracket rounds={[
  {label:"Quarterfinal", matchups:[{top:{name:"Ironclad",score:4,winner:true},bottom:{name:"Wolves",score:1}}, ...]},
  {label:"Semifinal", matchups:[{top:{name:"Ironclad",score:3,winner:true},bottom:{name:"Harbor",score:2}}]},
  {label:"Final", matchups:[{top:{},bottom:{}}]},
]} />
```
Matchup count should roughly halve each round; unresolved slots render "TBD".
