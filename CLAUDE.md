# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Next.js 15 App Router app for tracking personal savings goals ("Mis Metas de Ahorro"), plus a secondary, informational debts-owed-to-you tracker. Single user, in Spanish (es-PE), no auth. Originally a Claude Artifact, migrated to a standalone deployable app (Docker on Railway).

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

- `src/lib/db/store.ts` — the entire persistence layer. Reads/writes `data/db.json` (path from `DATA_DIR` env var, defaults to `<cwd>/data`). Goals, their movements, and debts all live in one JSON blob (`{ goals: Goal[], debts: Debt[], monthlyRate: number }`, `Movement[]` nested per `Goal`, `DebtPayment[]` nested per `Debt`).
  - Writes are serialized through an in-process promise queue (`withDb`) to avoid concurrent read-modify-write races — this only works because it's a single Node process (no horizontal scaling).
  - `readOnly()` skips the write queue for pure reads (`getGoals`, `getMonthlySummary`, `getDebts`).
  - Every write does read-modify-write of the whole file (write to `.tmp` then atomic `rename`). Fine at this data scale; would need rethinking if movement history grows into the thousands.
  - `readDb()` defaults missing fields (`debts: parsed.debts ?? []`) so older `db.json` files without the debts field still load — keep this pattern for any future field additions.
- `src/features/goals/actions.ts` — all goal/movement mutations/queries as Next.js Server Actions (`"use server"`).
- `src/features/debts/actions.ts` — debts are a separate, informational feature: money owed *to* the user by other people. Same server-action pattern as goals (`zod` validation, `{ success, error? }` shapes, `revalidatePath("/")`). Deliberately **not** wired into goals/savings math — `getDebts()` returns each debt's `outstanding` amount plus a `totalReceivable`, but nothing here writes to `Goal.currentAmount` or the overall balance. If debts ever need to feed into a goal (e.g. "apply this payment as a deposit"), that's a deliberate future integration, not an oversight.
- Together, `goals/actions.ts` and `debts/actions.ts` are the only interface `src/app/page.tsx` talks to — there are no API routes.
- `src/app/page.tsx` — single-page client component (`"use client"`) holding all UI state. Calls the server actions directly, re-fetches via `loadData()` after every mutation (no optimistic updates, no cache invalidation beyond `revalidatePath("/")` in the actions).
- `monthlyRate` (the user's monthly savings target) is persisted in **two places**: `localStorage` (per-device, the primary source — preferred over the server value on load) and the JSON store (`DbShape.monthlyRate`, a cross-device backup). It is written to both **only on an explicit user change** (the rate-edit save handler in `page.tsx`), never on mount — writing it on every mount would rewrite the whole `db.json` each page load and could clobber the persisted value via a read/write race with `getMonthlyRate`.

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

- Modern fintech visual theme (light + dark) — a "reimagined ledger" look, not the old vintage passbook. Styling is CSS custom properties defined in `globals.css` (`:root` for light, `:root[data-theme="dark"]` override, `@media (prefers-color-scheme: dark)` as the unset default), consumed via `var(--token)` throughout scoped `<style>` blocks in `page.tsx` (`.sd-*` prefix) and `DebtsSection.tsx` (`.dbt-*` prefix). Not a component library; don't introduce one without discussing.
  - Theme is set as `data-theme="light"|"dark"` on `<html>`, chosen by `ThemeToggle.tsx`, persisted to `localStorage("theme")`. A pre-hydration inline script in `layout.tsx` (`themeScript`) sets the attribute before paint to avoid a flash — if you touch theme init, keep that script in sync with `ThemeToggle`'s logic.
  - Fonts (`next/font/google` in `layout.tsx`): **Bricolage Grotesque** for display/headings, **Inter** for UI/body, **IBM Plex Mono** for all money amounts (tabular figures — deliberate, reads as financial data).
- Animations via `framer-motion` (card enter/exit, expand-collapse, progress bars, the "Completado" badge). Monthly trend chart via `recharts`, recolored from CSS tokens.
- Currency formatting is hardcoded to Peruvian soles via `formatSoles` in `page.tsx` (`"S/ " + Math.round(n).toLocaleString("es-PE")`), passed down as a prop to `GoalCard` and `DebtsSection`. There is no `src/lib/utils.ts` — don't reintroduce a second formatter there.
- Favicon is `src/app/icon.svg` (Next.js App Router file convention — no `public/` directory in this project).
