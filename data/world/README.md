# Production initial-world snapshot

Place the owner-prepared real hockey-world JSON snapshot here when available:

- `manifest.json`
- `countries.json`
- `leagues.json`
- `teams.json`
- `players.json`
- `coaches.json`
- `competitions.json`
- `competition-editions.json`

Until then, the server defaults to the fictional fixture at `data/fixtures/f3-minimal-world/`.

Point the server at this directory with:

```powershell
$env:FHM_DATASET_DIR = "C:\Projects\franchise-hockey-manager\data\world"
```

Do not commit scraped or unauthorized third-party roster dumps.
