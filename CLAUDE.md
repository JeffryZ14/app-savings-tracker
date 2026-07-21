# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Next.js 15 App Router app for tracking personal savings goals ("Mis Metas de Ahorro"). Single user, in Spanish (es-PE), no auth. Originally a Claude Artifact, migrated to a standalone deployable app (Docker on Railway).

## Commands

```
npm run dev      # dev server (localhost:3000, or next free port if 3000 busy)
npm run build    # production build (standalone output)
npm start         # run the standalone build
npm run lint      # next lint
npx tsc --noEmit  # type-check only
```

No test suite exists yet.

### Docker

```
docker compose build --no-cache && docker compose up -d   # full rebuild + run
docker compose down                                        # stop and remove
docker compose logs --no-color                              # check runtime errors
```

Always `docker compose down` before rebuilding — an old container left running under a different name/port (not managed by `docker-compose.yml`) is a real trap: it silently keeps serving a stale image while you debug against the new one. `docker ps -a` to check for strays.

## Architecture

**No database, no Prisma.** Data lives in a single JSON file, not SQL. This was a deliberate simplification (see git history / conversation context) — the data model is 2 entities and low write volume, so a DB was overkill for a personal-use app deployed on Railway.

- `src/lib/db/store.ts` — the entire persistence layer. Reads/writes `data/db.json` (path from `DATA_DIR` env var, defaults to `<cwd>/data`). All goals and their movements live in one JSON blob (`{ goals: Goal[] }`, `Movement[]` nested inside each `Goal`).
  - Writes are serialized through an in-process promise queue (`withDb`) to avoid concurrent read-modify-write races — this only works because it's a single Node process (no horizontal scaling).
  - `readOnly()` skips the write queue for pure reads (`getGoals`, `getMonthlySummary`).
  - Every write does read-modify-write of the whole file (write to `.tmp` then atomic `rename`). Fine at this data scale; would need rethinking if movement history grows into the thousands.
- `src/features/goals/actions.ts` — all data mutations/queries as Next.js Server Actions (`"use server"`). This is the only interface `src/app/page.tsx` talks to — there are no API routes. Validates input with `zod`, returns `{ success, error? }` / `{ success, data? }` shapes (never throws to the caller).
- `src/app/page.tsx` — single-page client component (`"use client"`) holding all UI state. Calls the server actions directly, re-fetches via `loadData()` after every mutation (no optimistic updates, no cache invalidation beyond `revalidatePath("/")` in the actions).
- `monthlyRate` (the user's monthly savings target) is **client-only state in `localStorage`**, not persisted server-side — it's not part of the JSON store.

### Docker / deployment

- Runs as **root** in the container (`Dockerfile` has no `USER` directive) — deliberate, to avoid permission mismatches between the container's user and whatever uid owns the Railway/Docker-Desktop-mounted volume at `DATA_DIR`. Don't reintroduce a non-root user without also solving that.
- `entrypoint.sh` does `mkdir -p "$DATA_DIR" && chmod -R 777 "$DATA_DIR"` on every boot as a safety net for volume permission mismatches, then execs `node server.js` (the Next standalone build).
- `docker-compose.yml` mounts `./data:/app/data` — on Railway this should be the persistent volume's mount path. Without a real persistent volume, all goals/movements are lost on redeploy.
- No native/compiled dependencies anymore (better-sqlite3 and Prisma were removed) — the Dockerfile doesn't need build toolchains, keep it that way.

### Deployed on Railway

- **Live URL**: <https://app-savings-tracker.up.railway.app> (renamed from the auto-generated `ahorros-production-f583.up.railway.app` to match the project/service name).
- **Project + service**: both named `app-savings-tracker` on Railway, matching the GitHub repo name (`JeffryZ14/app-savings-tracker`) — see `naming/deployments.md` in the `second-brain` repo for why this must match (it didn't at first; had to rename after the fact via GraphQL, since Railway CLI doesn't expose project/service rename).
- **Deploy trigger**: GitHub-connected, branch `main` — every push to `main` auto-builds and redeploys. Builder is `DOCKERFILE` (auto-detected from the repo's `Dockerfile`, not Railpack).
- **Persistent volume**: 5GB, mounted at `/app/data`, matches `DATA_DIR` default. This is the real, persistent `data/db.json` in production — separate from whatever's in your local `data/` folder.
- **Sleep enabled** (`deploy.sleepApplication: true`, Railway's "serverless" mode): the single instance sleeps after 10 min with no traffic, wakes on next request. Safe here specifically because `numReplicas` is 1 and stays 1 — the in-process write queue in `store.ts` only works single-instance; do not raise replicas without rethinking that.
- **Known CLI bug**: `railway volume add` panics (Rust `unwrap()` on `None`) on both CLI v5.20 and v5.27 as of this writing. Workaround: create the volume via the GraphQL API directly (`volumeCreate` mutation) using the token from `~/.railway/config.json` (`user.token` or `user.accessToken`), not the CLI.
- Repo is currently **public** on GitHub — no secrets in the repo (`data/` is gitignored), but flag it if that should change.

## UI conventions

- Vintage "savings passbook" visual theme — all styling is a single scoped `<style>` block inside `page.tsx` (`.sd-*` class prefix) plus a bit of Tailwind in `globals.css`/`layout.tsx`. Not a component library; don't introduce one without discussing.
- Animations via `framer-motion` (card enter/exit, expand-collapse, progress bars, the "Completado" stamp). Monthly trend chart via `recharts`.
- Currency formatting is hardcoded to Peruvian soles (`formatSoles` in `page.tsx`, `formatCurrency` in `src/lib/utils.ts` — both do `"S/ " + Math.round(n).toLocaleString("es-PE")`, currently duplicated).
- Favicon is `src/app/icon.svg` (Next.js App Router file convention — no `public/` directory in this project).
