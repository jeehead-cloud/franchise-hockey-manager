# F3 Minimal Development Fixture (schemaVersion 2 / F5)

**Status:** Fictional — development and automated testing only.

This dataset is **not** real NHL (or other real-world) hockey data. Player and team names are invented.

## Purpose

Provides a small, valid import snapshot so Setup World, validation, preview, initialization, and F5 player-model APIs can be exercised before an owner-prepared production snapshot exists.

Players include complete skater/goalie attribute models and development-profile fields. Hidden potential values are imported but must not appear on ordinary public APIs.

## Production replacement

Place the real initial-world snapshot under `data/world/` (see `data/world/README.md` and `data/README.md`), then point the server at it with:

```powershell
$env:FHM_DATASET_DIR = "C:\Projects\franchise-hockey-manager\data\world"
```

Do not treat this fixture as the production initial world.
