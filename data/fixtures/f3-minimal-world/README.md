# F3 Minimal Development Fixture

**Status:** Fictional — development and automated testing only.

This dataset is **not** real NHL (or other real-world) hockey data. Player and team names are invented.

## Purpose

Provides a small, valid import snapshot so F3 Setup World, validation, preview, and initialization can be exercised before an owner-prepared production snapshot exists.

## Production replacement

Place the real initial-world snapshot under `data/world/` (see `data/world/README.md` and `data/README.md`), then point the server at it with:

```powershell
$env:FHM_DATASET_DIR = "C:\Projects\franchise-hockey-manager\data\world"
```

Do not treat this fixture as the production initial world.
