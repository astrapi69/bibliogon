import {defineConfig} from "@playwright/test";

export default defineConfig({
    // Default testDir is the main suite under ./tests. Each project
    // overrides testDir below so `npx playwright test` runs the main
    // suite and `--project=smoke` picks up the separate ./smoke
    // directory.
    testDir: "./tests",
    fullyParallel: false,
    workers: 1, // SQLite = no parallelism
    retries: process.env.CI ? 1 : 0,
    timeout: 30_000,
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
            command: "cd ../backend && poetry run uvicorn app.main:app --port 8000",
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
            name: "chromium",
            testDir: "./tests",
            use: {browserName: "chromium"},
        },
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
            // HELP-DOCS-V0.37.0-GAPS-01 screenshot generator. Run with:
            //   npx playwright test --project=screenshots
            // Output goes under docs/help/assets/screenshots/.
            // Manual-only — kept out of the default suite because it
            // resets DB state per-test for seeded fixtures.
            name: "screenshots",
            testDir: "./screenshots",
            use: {browserName: "chromium", viewport: {width: 1280, height: 800}},
        },
    ],
});
