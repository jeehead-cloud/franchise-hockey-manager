# Franchise Hockey Manager — Deployment and Operations

**Status:** Not deployed yet (local development only)
**Last updated:** 2026-07-13
**Repository:** `https://github.com/jeehead-cloud/franchise-hockey-manager`
**Local repository path:** `C:\Projects\franchise-hockey-manager`

> This document is the operational source of truth for running and (eventually) deploying Franchise Hockey Manager.
> As of this writing, there is **no production deployment** — everything runs locally. This document records the current local workflow and the open questions that need answers before shipping anywhere public.

---

## 1. Current State: Local-Only

Local workflow:

```powershell
cd C:\Projects\franchise-hockey-manager
npm install
npm run build --workspace=@fhm/engine
npm run db:generate --workspace=@fhm/server
npm run db:migrate --workspace=@fhm/server
npm run setup:preview
npm run dev
```

`npm run dev` starts API + Vite client together (`concurrently`). Package-specific alternatives:

```powershell
npm run dev:server
npm run dev:client
```

- API: `http://127.0.0.1:3000` — health `GET /health`; domain reads `GET /api/...`; setup `GET|POST /api/setup/*`
- UI: `http://localhost:5173` — Vite proxies `/health` and `/api`
- SQLite: `packages/server/prisma/dev.db` (no external DB service)
- Dataset: default `data/fixtures/f3-minimal-world/`; override with `FHM_DATASET_DIR`
- Optional: `packages/client/.env` with `VITE_API_URL` if not using the proxy

Also useful:

```powershell
npm run balance:bootstrap   # idempotent Standard preset for existing DBs
npm run build
npm run typecheck
npm run test:server
npm run db:validate
npm run verify:event-engine
npm run verify:scoring-engine
npm run verify:special-teams-engine
npm run verify:playable-match-engine
npm run setup:validate
npm run setup:status
```

**F13 simulation debug (local/dev only):**

- `FHM_SIMULATION_DEBUG_ENABLED=true|false` — gates `POST /api/simulation/debug/*` (default enabled in development and test; disabled in production unless explicitly set)
- Endpoints are read-only; they do not persist matches or mutate world state

**F16 Simulation Lab (local/dev only):**

- `FHM_SIMULATION_LAB_ENABLED=true|false` — gates `/api/simulation-lab/*` (default enabled in development and test; disabled in production unless explicitly set)
- In-memory runs only (max concurrent 2, retain ~20 runs / 30 minutes); not a production job queue
- Unpersisted analytical batches — no Match/Result/Event/stat rows
- Verify: `npm run verify:simulation-lab`

**F18 regular season (local):**

- `FHM_BACKUP_DIR` — backup directory for the centralized F32 backup/recovery subsystem (default `.fhm-backups/` at repo root; gitignored). Holds all managed backup databases, manifests, the external recovery journal (`recovery-journal.json`), the maintenance marker (`maintenance.json`), and the pending-restore marker (`pending-restore.json`). All world-mutating operations (F18/F19/F20/F21/F23/F24/F25/F27/F28/F29/F31) route their pre-operation safety backups through this single F32 service.
- **F32 is SQLite-only and local-only.** No cloud/off-site durability, encryption, incremental backups, point-in-time recovery, record-level restore, or PostgreSQL tooling. Do not rely on F32 for production disaster recovery.
- **Filesystem permissions:** the server process needs read+write access to `FHM_BACKUP_DIR` and the active SQLite database file. The directory should be on the same volume as the active database so restore replacement is atomic (same-volume rename/copy).
- **Required free disk space:** at minimum, enough for several full database copies (each backup is a full `VACUUM INTO` snapshot) plus one pre-restore backup and one emergency-copy during restore. A safe floor is `5 × active_db_size`.
- **Restore is restart-required.** In-process hot restore is unsafe (the Prisma client is a module-level singleton held open for the process lifetime). Restore flow: Commissioner prepares (creates a pre-restore backup + external journal + restore marker) → requests restart → the operator stops and restarts the server → a pre-Prisma startup bootstrap performs the atomic database replacement, runs pending additive migrations, verifies the fingerprint, reconciles history, and clears the marker only after success. While a restore is pending/running, mutating APIs return 503.
- **Recovery journal path:** `<FHM_BACKUP_DIR>/recovery-journal.json` (canonical JSON, survives database replacement because restoring an older DB may delete the in-DB restore-run row). The pending-restore marker is `<FHM_BACKUP_DIR>/pending-restore.json`; the maintenance marker is `<FHM_BACKUP_DIR>/maintenance.json`.
- **Manual emergency recovery:** if a startup restore fails, the bootstrap rolls back to the emergency copy (`<active_db>.emergency-<timestamp>`), preserves the restore marker, and halts the process with explicit instructions. To recover manually: inspect `recovery-journal.json` + the failed run, ensure the pre-restore backup (type `PRE_RESTORE`) is intact, then either delete `pending-restore.json` to abort the restore (keeping the rolled-back DB) or re-prepare a new restore from a known-good backup. Never delete `pending-restore.json` after a partial replacement without first confirming the active database opens and passes integrity_check.
- **Backup files are excluded from Git** (`.fhm-backups/` and `*.db` are gitignored). Never commit backup databases, manifests, journals, or markers.

There is no staging environment, no production environment, and no CI/CD pipeline yet.

---

## 2. Why This Project Is Already Deploy-Ready in Shape (Even If Not Deployed)

Unlike a purely client-side hobby project, Franchise Hockey Manager has a real backend (Fastify + Prisma + SQLite) from day one — see `ARCHITECTURE.md` §6 for why. This means:

- `npm run build` in `packages/client` produces a static `dist/` folder;
- `packages/server` is a standard Node.js process that can run anywhere Node runs;
- deploying later is "run the Node server somewhere, serve the built client somewhere (possibly the same place)" — not an architectural rewrite.

This is **conditional on staying single-player, single-instance**. If a future milestone (M8) adds real multiplayer or requires a heavier database, this document (and possibly the "SQLite is enough" decision in `ARCHITECTURE.md`) will need to be revisited — e.g. migrating from SQLite to Postgres via Prisma's migration tooling.

---

## 3. Open Decisions (TBD)

The following have **not** been decided yet and are recorded here specifically so the owner can pick a stack-compatible hosting option later, rather than the choice being made ad hoc by whichever AI agent happens to be asked:

- **Hosting provider for the server**: not chosen. Needs a Node-process-capable host (e.g. Railway, Render, Fly.io, a VPS) — not a purely static host, since this project (unlike some hobby projects) has a real backend.
- **Hosting for the client**: not chosen. Any static host works (Vercel, Netlify, GitHub Pages, Cloudflare Pages), or it could be served by the same host as the API.
- **Database**: staying on SQLite vs. migrating to Postgres for the production deployment — not decided.
- **Custom domain**: not decided.

**Do not pick a hosting provider, add deployment configuration files, or migrate the database engine without explicit instruction from the owner.**

---

## 4. Build Verification (Do This Before Any Future Deploy)

```powershell
cd C:\Projects\franchise-hockey-manager
npm run build
npm run typecheck
npm run build --workspace=@fhm/server
npm run build --workspace=@fhm/client
```

Sanity-check the production build locally before ever deploying it.

---

## 5. Repository / Git

```text
Repository: franchise-hockey-manager
Remote: https://github.com/jeehead-cloud/franchise-hockey-manager.git
Main branch: main
Local path: C:\Projects\franchise-hockey-manager
```

Standard flow for pushing changes (no deployment step attached yet):

```powershell
git add .
git commit -m "<descriptive message>"
git push origin main
```

There are no branch protection rules, no required reviews, and no deployment triggers tied to pushes at this time.

---

## 6. When This Document Needs a Rewrite

Update this document as soon as any of the following becomes true:

- a hosting provider is chosen for the server and/or client (record the provider, the production URL, build/start commands, and any environment variables);
- a custom domain is configured;
- a CI/CD workflow is added;
- the database engine changes (SQLite → Postgres or otherwise) — this will also require updates to `ARCHITECTURE.md`.

Until then, this document intentionally stays short.

---

## Guiding Rule

**Don't invent deployment infrastructure the project doesn't have yet. Keep this document honest about the current (local-only) state, and let the owner make the hosting decision explicitly when they're ready.**
