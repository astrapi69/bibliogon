/**
 * Static-build smoke gate (see playwright.static-smoke.config.ts).
 *
 * Runs against the BUILT static dist served by `vite preview`, with NO
 * backend running. The build was produced with VITE_STORAGE_MODE=dexie,
 * so the bundle auto-forces the offline IndexedDB storage backend - the
 * same shape as the GitHub-Pages deploy.
 *
 * What it proves, per core route:
 *   1. The route mounts without a CRASH - a known root testid renders
 *      (a blank/white-screen crash leaves the root absent).
 *   2. No uncaught JS exception fired (page.on("pageerror")).
 *   3. No ERROR toast appeared (.Toastify__toast--error). An unguarded
 *      /api call in the static build surfaces exactly that, so an error
 *      toast is the canonical "works with backend, broken static"
 *      signal.
 *
 * Any of the three failing exits the run non-zero. Lean by design: the
 * core navigable surfaces, not the full offline-pwa behaviour suite
 * (that lives in smoke/offline-pwa.spec.ts and runs against the dev
 * server).
 */

import {test, expect, type Page} from "@playwright/test";

// Neutralize the PWA service worker for this gate. In `vite preview` over
// plain http on localhost the SW registration enters an "invalid state"
// and intercepts SPA navigations, stalling lazy route chunks - a
// preview-environment artifact, NOT a product bug (the SW's real
// behaviour runs on the HTTPS GitHub-Pages deploy). Blocking the
// registration script keeps the SW out of the way so this gate measures
// what it is meant to: whether the bundled ROUTES render. Applied
// context-wide so it also covers any tab a route might open.
test.beforeEach(async ({context}) => {
    await context.route(/\/(registerSW\.js|sw\.js)(\?|$)/, (route) =>
        route.abort(),
    );
});

// Core navigable routes + a stable root testid that proves the route
// rendered (not a blank crash). Kept lean: one representative root per
// surface, drawn from the same testids the offline-pwa suite relies on.
const ROUTES: ReadonlyArray<{path: string; root: string; label: string}> = [
    {path: "/", root: "new-book-group", label: "Dashboard"},
    {path: "/articles", root: "article-list-page", label: "Article list"},
    {path: "/settings", root: "settings-tab-erscheinungsbild", label: "Settings"},
    {path: "/books/new", root: "create-book-title", label: "Create book"},
    {path: "/get-started", root: "getstarted-step-title", label: "Get started"},
    {path: "/writing-history", root: "writing-history-view", label: "Writing history"},
    {path: "/help", root: "help-nav-back", label: "Help"},
];

// Collect uncaught page errors so a route that throws on mount is caught
// even when it still renders some chrome.
function trackPageErrors(page: Page): string[] {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    return errors;
}

test.describe("Static build smoke (no backend, Dexie bundle)", () => {
    for (const {path, root, label} of ROUTES) {
        test(`${label} (${path}) loads with no crash, no error toast`, async ({
            page,
        }) => {
            const pageErrors = trackPageErrors(page);

            await page.goto(path);

            // 1. The route mounted - its root rendered.
            await expect(
                page.getByTestId(root),
                `${label} root testid "${root}" did not render - the static build may have crashed on this route`,
            ).toBeVisible();

            // 3. No error toast (the static-build "unguarded /api" tell).
            await expect(
                page.locator(".Toastify__toast--error"),
                `${label} surfaced an error toast in the static build`,
            ).toHaveCount(0);

            // 2. No uncaught exception fired while rendering the route.
            expect(
                pageErrors,
                `${label} threw ${pageErrors.length} uncaught error(s) in the static build: ${pageErrors.join(" | ")}`,
            ).toEqual([]);
        });
    }
});
