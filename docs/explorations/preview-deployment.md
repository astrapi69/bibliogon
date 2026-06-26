# Preview-Deployment Exploration

**Status:** Decided + implemented (workflow shipped; first deploy gated
on a manual Deploy-Key + GH-Pages setup by the maintainer).
**Last updated:** 2026-06-26.
**Trigger:** Need for a continuously-updated preview build of the
offline PWA that is separate from the live production site, so
in-progress `develop` work can be exercised on a stable URL without
touching the published app.

---

## Decision

Deploy a preview build of the frontend (the offline Dexie PWA) to a
**separate repository** `astrapi69/bibliogon-preview` (already created:
https://github.com/astrapi69/bibliogon-preview), served via that repo's
GitHub Pages site at https://astrapi69.github.io/bibliogon-preview/.

A separate repo is required because a GitHub Pages **project** site is
always served at `<user>.github.io/<repo-name>/`. The only way to get a
distinct `/bibliogon-preview/` URL is a distinct repo - the same
constraint that already forced the docs onto `astrapi69/bibliogondocs`
(see `deploy-docs.yml`).

## Branch-Mapping

| Environment | Branch | Workflow | URL |
|---|---|---|---|
| **Production (Live-PWA)** | `develop` (+ `main` on release merge) | `deploy-pages.yml` (unchanged) | https://astrapi69.github.io/bibliogon/ |
| **Preview (new)** | `develop` | `deploy-preview.yml` | https://astrapi69.github.io/bibliogon-preview/ |

Production stays exactly as it is: per Gitflow (#79) the live app site
tracks `develop` so the development build is testable, and `main` is
kept so a release merge redeploys. **This is NOT changed to `main`** -
re-pointing production to `main` would be a breaking change to the live
URL's content cadence. Production = `develop` = Live-PWA.

The preview is purely **additive**: a new workflow alongside the
existing one, both triggered by `develop`. They publish to two
different repos, so they never collide.

## Workflow-Trennung

`deploy-pages.yml` (production) builds with base `/bibliogon/` and
publishes to this repo's own Pages via the native `actions/deploy-pages`
flow.

`deploy-preview.yml` (preview) builds with base `/bibliogon-preview/`
and pushes the built `frontend/dist` to the `gh-pages` branch of the
**external** `bibliogon-preview` repo via `peaceiris/actions-gh-pages`.
Pushing to a foreign repo from Actions cannot use the native Pages
deploy (that only targets the current repo), hence the deploy-key +
`external_repository` approach.

## Vite base-Pfad Parametrisierung

`frontend/vite.config.ts` **already** reads the deploy base from an
environment variable:

```ts
const base = process.env.VITE_BASE_URL || "/";
```

So no `vite.config.ts` change is needed. The production workflow already
passes `VITE_BASE_URL: /bibliogon/`; the preview workflow passes
`VITE_BASE_URL: /bibliogon-preview/`. The PWA manifest `start_url` /
`scope` / icon srcs and the SW `navigateFallback` all derive from `base`,
so they follow the preview sub-path automatically.

> Note on the original draft: an earlier sketch proposed introducing a
> new `VITE_BASE` variable and adding a `base: process.env.VITE_BASE`
> read to `vite.config.ts`. That was dropped - the config already reads
> `VITE_BASE_URL`, and the production workflow already uses it. Adding a
> second variable would create two ways to set the same thing and drift
> from production. The preview workflow reuses the existing
> `VITE_BASE_URL` for parity.

## Storage mode (offline PWA)

The preview, like production, has **no same-origin backend** on GitHub
Pages, so the build must force the offline IndexedDB storage backend
with `VITE_STORAGE_MODE: dexie` (identical to `deploy-pages.yml`).
Without it the app would attempt `/api` calls against a non-existent
origin.

## Seed-Daten

The offline-PWA seed JSON lives committed under
`frontend/src/storage/seed/` and is regenerated from the backend YAML
via `make generate-seed-data` (which needs Poetry + the backend venv).
Because the seeds are **already committed and identical to production**,
the preview build consumes them directly through the normal Vite build -
exactly like the production `deploy-pages.yml`, which does **not** run
`make generate-seed-data` either. Adding a regenerate step to the
preview workflow would require a Python/Poetry setup the production
pipeline deliberately avoids, and would produce the same bytes that are
already committed. So the preview reuses the committed seeds; "Preview
braucht dieselben Seeds wie Production" is satisfied by construction.

## Manual setup (maintainer, one-time)

The workflow can be merged immediately, but the **first deploy** is
gated on two manual steps that only the maintainer can perform:

1. **Deploy key.** Generate an SSH keypair
   (`ssh-keygen -t ed25519 -C "bibliogon-preview-deploy" -f preview_deploy_key -N ""`).
   Add the **public** key as a Deploy Key **with write access** in
   `astrapi69/bibliogon-preview` (Settings -> Deploy keys -> Add). Add
   the **private** key as a repository secret named `PREVIEW_DEPLOY_KEY`
   in `astrapi69/bibliogon` (Settings -> Secrets and variables ->
   Actions).
2. **GitHub Pages** in `astrapi69/bibliogon-preview`: enable Pages with
   Source = Deploy from a branch, Branch = `gh-pages` (the workflow
   creates that branch on its first run, so enable Pages after the first
   successful deploy or pre-create the branch).

URL once live: https://astrapi69.github.io/bibliogon-preview/
