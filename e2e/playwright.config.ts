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
            command: "cd ../backend && poetry run uvicorn app.main:app --port 8000",
            url: "http://localhost:8000/api/health",
            reuseExistingServer: !process.env.CI,
            timeout: 30_000,
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
    ],
});
