import {defineConfig} from "@playwright/test";

export default defineConfig({
    // Every project sets its own testDir below; this top-level default
    // is the fallback. It points at ./smoke (the CI gate) so a bare
    // `npx playwright test` has a sensible default. The former ./tests
    // "main" suite was removed (#484): dead, not run by any CI workflow,
    // and superseded by the testid-disciplined ./smoke specs.
    testDir: "./smoke",
    fullyParallel: false,
    workers: 1, // SQLite = no parallelism
    // A serial 400+-test browser suite against a live backend has an
    // irreducible tail of load/timing/order flakiness (Radix portals
    // not yet open, async PATCH/refresh not yet landed, etc.). Retries
    // absorb that tail so a flaky-but-passing test doesn't fail the gate,
    // while a DETERMINISTIC failure still fails every attempt and is
    // caught. Local matches CI (2) — the smoke gate runs locally, so it
    // needs the same resilience. With local:1, a flake that failed both
    // its attempts under sustained load (the same load condition spanning
    // attempt + single retry) turned the run red; the second retry absorbs
    // that without hiding a real failure (which fails all three).
    retries: 2,
    timeout: 30_000,
    // Visual-regression tolerance for the `visual` project's
    // toHaveScreenshot() assertions. A 1% per-pixel-ratio budget
    // absorbs sub-pixel font-rendering and antialiasing drift between
    // machines while still failing on a real layout/colour regression.
    // animations:disabled freezes CSS transitions so a screenshot taken
    // mid-transition cannot flake the diff.
    expect: {
        // Assertion-wait budget. The default is 5000ms, but under
        // sustained full-suite load a page's top-level container can take
        // longer than that to render, flaking toBeVisible/toBeAttached on
        // the first attempt (#535). Match the 10s actionTimeout so the
        // assertion waits get the same headroom; a genuinely missing
        // element still fails, just after 10s.
        timeout: 10_000,
        toHaveScreenshot: {
            maxDiffPixelRatio: 0.01,
            animations: "disabled",
        },
    },
    use: {
        baseURL: "http://localhost:5173",
        actionTimeout: 10_000,
        trace: "on-first-retry",
    },
    webServer: [
        {
            // The E2E backend runs against an ISOLATED data dir, never the
            // developer's real ~/.local/share/bibliogon. E2E destroys data
            // (every test wipes the DB via /test/reset) and mutates app
            // settings, so it must never point at real data. BIBLIOGON_DEBUG
            // enables the /api/test/reset endpoint. reuseExistingServer is
            // false so a stray real-data backend on :8000 is never silently
            // reused — run E2E with no other backend on :8000.
            // Wipe the disposable E2E data dir before each run so app-settings
            // (e.g. ui.defaults.content_type) written by a prior or aborted run
            // can never leak across runs -- /api/test/reset clears the DB, not
            // the settings file. Within-run leaks are handled by each setter
            // spec's afterEach restore.
            command:
                "rm -rf /tmp/bibliogon-e2e-data && mkdir -p /tmp/bibliogon-e2e-data && cd ../backend && poetry run uvicorn app.main:app --port 8000",
            url: "http://localhost:8000/api/health",
            env: {
                // Isolated data dir + a persistent file DB under it.
                // BIBLIOGON_TEST=1 skips the legacy in-tree data-dir
                // migration (which would otherwise conflict on / move the
                // repo's backend/plugins/installed) and the production
                // marker; TEST_DATABASE_URL points at a real file (not the
                // default :memory:) so data survives across requests within
                // a run. DEBUG enables /api/test/reset.
                BIBLIOGON_DATA_DIR: "/tmp/bibliogon-e2e-data",
                BIBLIOGON_TEST: "1",
                TEST_DATABASE_URL: "sqlite:////tmp/bibliogon-e2e-data/e2e.db",
                BIBLIOGON_DEBUG: "true",
            },
            reuseExistingServer: false,
            timeout: 60_000,
        },
        {
            command: "cd ../frontend && npm run dev",
            url: "http://localhost:5173",
            reuseExistingServer: !process.env.CI,
            timeout: 30_000,
        },
    ],
    projects: [
        {
            // Separate smoke project for the viewport/zoom/dropdown
            // regression suite. Run with:
            //   npx playwright test --project=smoke
            //
            // The smoke specs mutate the viewport and the CSS zoom
            // factor on document.documentElement, which can interfere
            // with other tests if mixed into the main suite, so it
            // lives in its own directory and is excluded from the
            // default run.
            name: "smoke",
            testDir: "./smoke",
            use: {browserName: "chromium"},
        },
        {
            // Manual-Testplan automation suite (docs/manual-tests/
            // MANUAL-TESTPLAN.md). Closes the automatable TC-* gaps the
            // smoke suite leaves "Teilweise"/"Nein". Run with:
            //   npx playwright test --project=manual-automation
            //
            // Kept out of the default + smoke runs: it is the nightly /
            // release-gate companion (see .github/workflows/
            // manual-automation.yml), not a per-PR gate. Page objects +
            // helpers live in pages/ and helpers/ (non-spec files, so they
            // are not collected as tests).
            name: "manual-automation",
            testDir: "./manual-automation",
            use: {browserName: "chromium"},
        },
        {
            // HELP-DOCS-V0.37.0-GAPS-01 screenshot generator. Run with:
            //   npx playwright test --project=screenshots
            // Output goes under docs/help/assets/screenshots/.
            // Manual-only — kept out of the default suite because it
            // resets DB state per-test for seeded fixtures.
            name: "screenshots",
            testDir: "./screenshots",
            use: {browserName: "chromium", viewport: {width: 1280, height: 800}},
        },
        {
            // FEATURE-SCREENSHOT-CATALOG-01 generator. Run with:
            //   npx playwright test --project=feature-screenshots
            //   (or: make capture-screenshots)
            // Output goes under docs/screenshots/ — a visual catalog of
            // every feature for docs / README / Medium / onboarding, NOT
            // a regression gate (that is the `visual` project). Kept out
            // of the default + smoke runs and out of CI: on-demand only.
            // 16:9 desktop viewport, locale de-DE, default theme.
            name: "feature-screenshots",
            testDir: "./feature-screenshots",
            use: {
                browserName: "chromium",
                viewport: {width: 1280, height: 720},
                locale: "de-DE",
            },
            retries: 0,
        },
        {
            // VISUAL-REGRESSION-SCREENSHOTS-01 pixel-diff suite. Run with:
            //   npx playwright test --project=visual
            // Regenerate the committed baseline with:
            //   npx playwright test --project=visual --update-snapshots
            //
            // Kept out of the smoke gate: visual tests are slow and only
            // meaningful against a committed baseline PNG. A fixed
            // desktop viewport pins the layout so a window-size change in
            // CI/local cannot shift every diff. Snapshots are stored next
            // to the spec (theme-regression.spec.ts-snapshots/) and are
            // committed — they ARE the baseline.
            name: "visual",
            testDir: "./visual",
            // Fixed timezone so a server-derived date renders as the same
            // calendar day on every machine (a UTC-vs-local boundary could
            // otherwise shift the date text across runners). Pairs with the
            // spec's frozen browser clock.
            use: {
                browserName: "chromium",
                viewport: {width: 1440, height: 900},
                timezoneId: "Europe/Berlin",
            },
        },
    ],
});
