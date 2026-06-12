# Non-functional UI audit (2026-06-12)

Issue: [#101](https://github.com/astrapi69/bibliogon/issues/101) — "Audit: all
non-functional UI elements — implement or remove".

Scope: every button / link / menu entry must do something useful. Focus on the
backendless GitHub-Pages PWA (Dexie mode), where surfaces that silently fetch
`/api` degrade to empty pages or crashes.

## Method

Code-level sweep of every frontend surface (routes, dashboards, editors,
settings, help/onboarding) for elements that, in Dexie mode:

- A. do nothing on click (dead button)
- B. open an empty page
- C. show "coming soon" / "not yet available"
- D. throw / fire an unhandled `/api` call
- E. promise a function that does not exist

## Findings

| # | Surface | Element | Today (Dexie mode) | Should happen | Prio | Status |
|---|---------|---------|--------------------|---------------|------|--------|
| 1 | App-wide | Unknown route (typo / stale deep-link) | No catch-all `<Route>` → **blank screen** | Custom 404 page + route home | P1 | **fixed** |
| 2 | `/help` page | Shortcuts / FAQ / About tabs | All three **empty** (fetch `/api/help/*`, fail silently) | Render from offline seed | P1 | **fixed** |
| 3 | Help modal (`HelpPanel`) | Nav tree + page + search | Empty sidebar; page → "not found" | Render from offline seed | P1 | **fixed** |
| 4 | `/get-started` | Guide steps + sample-book content | Guide **empty** (`api.getStarted.guide()` fails) | Render + create from offline seed | P1 | **fixed** |
| 5 | PageEditor / ComicBookEditor / BookMetadataEditor | `PdfExportControls` Export-PDF | Fires `/api/.../export/pdf` offline, **no gate** → offline-guard reject | Gate behind `pandoc-export` (desktop-only) | P0 | **fixed** |

### Already correct (no change needed)

- **Backup**: `exportFullBackup()` is wired in Settings → Backups and in the
  Danger-Zone "Create backup" button (client-side, offline-safe). The Dashboard
  `.bgb` button is correctly **disabled-with-reason** offline (`bgb-import`
  feature). Backup-history / compare are desktop-only and already gated.
- **Export plugin**: no manifest-driven UI; export runs through the client
  engine (`ClientExportMenu`, 6 formats + client LaTeX) which works offline.
  The backend `ExportForm` (Pandoc/batch/audiobook) is not mounted in Dexie
  mode.
- **Desktop-only set** (git-sync/backup, TTS, LAN, bulk-export, version
  history, writing-history CSV, book-templates, ai-template-file-io, KDP
  catalog, translation links): all already resolve through
  `@astrapi69/feature-strategy` to `disabled` + reason. No dead/ad-hoc gating
  found.

## Fixes shipped

- **#5 (P0)** — `PdfExportControls` gated behind `FEATURES.PANDOC_EXPORT`.
  Picture-book / comic PDF is rendered by the backend WeasyPrint/Pandoc walker
  (no browser engine), so it is genuinely desktop-only: the button stays
  visible, disabled, with the desktop-app reason; it fires no `/api` offline.
- **#1 (P1)** — `NotFoundPage` + `<Route path="*">` catch-all; new
  `ui.not_found.*` i18n keys in all 8 catalogs. (The GH-Pages SPA redirect via
  `public/404.html` + `?redirect=` already existed; the missing piece was the
  in-app catch-all.)
- **#2 / #3 / #4 (P1)** — help + getting-started content bundled into the seed
  pipeline (`scripts/generate-seed-data.py` → `seed-help.json`,
  `seed-help-docs-{de,en}.json`, `seed-getstarted.json`) from the existing
  `help.yaml` / `getstarted.yaml` / `docs/help/**` SSoT. `api.help.*` /
  `api.getStarted.*` resolve from a lazy-imported `src/help/offlineHelp.ts`
  when offline (zero `/api`, ~1 MB of docs kept out of the eager bundle).
  Client-side search mirrors the backend `/help/search`.

## Verification

- `tsc --noEmit` clean.
- Vitest: 3065 passed (266 files), including new pins:
  `offlineHelp.test.ts`, `client.help-offline.test.ts`, `NotFoundPage.test.tsx`,
  and the `PdfExportControls` offline-gate pin.
- E2E smoke (`e2e/smoke/nonfunctional-ui.spec.ts`) written for Aster to run:
  404 catch-all + help/get-started non-empty offline.

## No backend changes

Per the work order, no backend runtime code was modified. The seed generator
(build tooling) reads the existing YAML/markdown SSoT.
