# Manual-Testplan Automation Suite

Automates the **automatable** test cases of
[`docs/manual-tests/MANUAL-TESTPLAN.md`](../../docs/manual-tests/MANUAL-TESTPLAN.md)
(TC-001..TC-065). It is the Playwright `manual-automation` project — a
nightly / release-gate companion to `e2e/smoke/`, **not** a per-PR gate.

```bash
# from e2e/
npx playwright test --project=manual-automation
# one section
npx playwright test --project=manual-automation section5-settings.spec.ts
```

The `webServer` block in `../playwright.config.ts` launches both the backend
(uvicorn :8000, isolated `/tmp` data dir, `BIBLIOGON_DEBUG`) and the Vite dev
server (:5173) automatically. The suite drives the **live backend**
(`apiStorage`) — clean state per test comes from the shared `resetDatabase`
fixture in `../fixtures/base.ts`.

## Layout

```
manual-automation/
├── pages/                       # Page Objects (role/testid selectors)
│   ├── dashboard.page.ts        # BD + AD (view switcher, thumbnails, badges)
│   ├── editor.page.ts           # prose chapter editor
│   ├── comic-editor.page.ts     # comic_book editor
│   ├── picture-book-editor.page.ts
│   ├── settings.page.ts         # sidebar + mobile hamburger + language
│   ├── import-wizard.page.ts    # file + Git-URL import flows
│   └── export.page.ts           # client-engine export menu
├── helpers/
│   ├── setup.helper.ts          # API seeding (authors, story entities, cover)
│   ├── backup.helper.ts         # export / reset / import flows (TC-040)
│   └── editor.helper.ts         # TipTap focus / type+save / read
├── section1-dashboard.spec.ts   # TC-001/002/003/014/015/016
├── section2-editors.spec.ts     # TC-020/022
├── section3-import.spec.ts      # TC-037
├── section4-backup.spec.ts      # TC-040/041 (release blocker)
├── section5-settings.spec.ts    # TC-050/052
├── section6-feature-gates.spec.ts  # TC-060..063 (offline only — skips in api mode)
└── section7-service-worker.spec.ts # TC-064 (partial) / TC-065 (manual)
```

## Coverage scope

This suite **closes the gaps** the coverage table marked "Teilweise"/"Nein"
and **does not re-implement** what `e2e/smoke/` already covers strongly
(filters, bulk, trash, formatting, math, comic panels, picture-book layouts,
themes). See the coverage table in the manual test plan for the per-TC map.

### Stays manual (by design)

- **TC-032** audiobook — needs a TTS backend + a real audio file.
- **TC-065** SW update-detection timing — real-browser focus/visibility/hourly
  is not deterministically reproducible.
- **TC-064** SW unregister + clear-site-data + hard-reload — manual; only the
  live-bundle freshness slice is automated (env-gated test +
  `scripts/check_live_chunk.sh`).
- **Section 6 feature gates** — the "disabled with reason / zero `/api`" states
  only manifest on the backendless dexie build; canonical coverage is
  `e2e/smoke/offline-pwa.spec.ts`. The section here skips in api mode.
- Visual theme judgement, pixel-exact drag geometry.

## Conventions

- `data-testid` selectors read from the real source (no guessed ids); role
  selectors where natural.
- No `page.waitForTimeout()` except for documented debounces.
- Page Object Pattern; helpers seed via the API (setup ≠ the thing under test).
- A language-switch test resets `app.default_language` afterEach (the shared
  baseline does not restore it).
