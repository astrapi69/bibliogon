import {defineConfig} from "@playwright/test";

/**
 * Prod-container browser gate (#704).
 *
 * Every other gate checks the production stack through a proxy: the
 * compose healthcheck curls `/api/health`, the launcher waits for a
 * status code, `docker build` proves the image compiles. None of them
 * ever opened the BUILT container in a real browser, so the capability
 * "the app renders" was unmeasured - which is how a white page over the
 * launcher shipped in the sister project (a CSP that blocked every
 * resource; the health endpoint answered 200 throughout).
 *
 * What this config measures that `playwright.config.ts` and
 * `playwright.static-smoke.config.ts` cannot:
 *   - the bundle nginx serves from the image, not a Vite dev or preview
 *     server,
 *   - nginx's own config: the security-header include, the SPA fallback,
 *     the `/api/` proxy into the backend container,
 *   - the backend in its container, reached the way the browser reaches
 *     it in production.
 *
 * It starts no server. The compose stack is brought up by the caller -
 * `.github/workflows/prod-container-smoke.yml` in CI, `make prod` by
 * hand - and `BIBLIOGON_PROD_URL` points this at it.
 *
 * Run with:
 *   make prod   # then, in another shell:
 *   cd e2e && npx playwright test --config=playwright.prod-container.config.ts
 */
export default defineConfig({
    testDir: "./prod-container",
    fullyParallel: false,
    workers: 1,
    // No retries. A gate whose job is "the container renders" must not
    // absorb a failure: there is no backend-timing tail here that a
    // retry would legitimately smooth over, and a flaky green is exactly
    // the outcome this gate exists to prevent.
    retries: 0,
    timeout: 60_000,
    expect: {timeout: 15_000},
    reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
    use: {
        baseURL: process.env.BIBLIOGON_PROD_URL || "http://127.0.0.1:7880",
        actionTimeout: 15_000,
        trace: "retain-on-failure",
    },
    projects: [
        {
            name: "prod-container",
            testDir: "./prod-container",
            use: {browserName: "chromium"},
        },
    ],
});
