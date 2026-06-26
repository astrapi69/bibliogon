import {defineConfig} from "@playwright/test";

/**
 * Static-build smoke gate.
 *
 * Bibliogon ships on GitHub Pages as a static, backend-less build
 * (VITE_STORAGE_MODE=dexie baked in at build time -> the bundle forces
 * the offline IndexedDB storage backend). Features are migrated from the
 * Python backend to the static build incrementally, and the failure mode
 * this gate guards is "works against a running backend, crashes in the
 * static build": a route that throws on mount, a chunk that 404s, a
 * seed/registry that never loads, an unguarded /api call that surfaces an
 * error toast.
 *
 * Unlike playwright.config.ts (which starts the FastAPI backend + the Vite
 * DEV server and only blocks /api with route.abort), this config:
 *   - starts NO backend at all,
 *   - serves the actual BUILT dist via `vite preview` (the real bundle,
 *     not the dev server's on-the-fly modules).
 *
 * The dist must already be built (with VITE_STORAGE_MODE=dexie) before
 * this runs - `make test-static-smoke` builds it first. If dist is
 * missing, `vite preview` fails loudly.
 *
 * Run with:
 *   make test-static-smoke
 *   # or, against an already-built dist:
 *   cd e2e && npx playwright test --config=playwright.static-smoke.config.ts
 */
export default defineConfig({
    testDir: "./static-smoke",
    fullyParallel: false,
    workers: 1,
    // A bundled static build is deterministic (no backend timing, no
    // SQLite serialization), so a real crash fails every attempt. One
    // retry only absorbs a cold-start preview-server hiccup.
    retries: 1,
    timeout: 30_000,
    expect: {timeout: 10_000},
    reporter: [["list"]],
    use: {
        baseURL: "http://localhost:4173",
        actionTimeout: 10_000,
        trace: "on-first-retry",
    },
    webServer: [
        {
            // Serve the pre-built dist. No backend: the build forces Dexie
            // mode, so the app must run entirely from the seeded IndexedDB.
            // reuseExistingServer:false so a stale preview from a prior run
            // (possibly built from different sources) is never silently
            // reused.
            command:
                "cd ../frontend && npm run preview -- --port 4173 --strictPort",
            url: "http://localhost:4173",
            reuseExistingServer: false,
            timeout: 60_000,
        },
    ],
    projects: [
        {
            name: "static-smoke",
            testDir: "./static-smoke",
            use: {browserName: "chromium"},
        },
    ],
});
