/**
 * Backend-unreachable banner smoke (#765).
 *
 * Simulates a dead backend by aborting /api requests via an
 * ANCHORED-REGEX route (the offline-pwa precedent - a glob like
 * **\/api\/** would also abort Vite module URLs), asserts exactly one
 * persistent banner and ZERO error toasts, then releases the routes
 * and asserts the banner clears via the retry probe - no reload.
 */

import {test, expect} from "../fixtures/base";

const API_ROUTE = /^https?:\/\/[^/]+\/api\//;

test.describe("Backend-unreachable banner", () => {
    test("outage shows one banner and no error toasts; recovery clears it", async ({
        page,
    }) => {
        await page.goto("/");
        await expect(page.getByTestId("backend-unreachable-banner")).toHaveCount(0);

        await page.route(API_ROUTE, (route) => route.abort("connectionrefused"));

        // Trigger several parallel API calls the way a real outage does:
        // navigate between dashboards so books/articles/settings all fire.
        await page.getByTestId("articles-nav-btn").click();
        await page.getByTestId("books-nav-btn").click();

        const banner = page.getByTestId("backend-unreachable-banner");
        await expect(banner).toBeVisible({timeout: 10_000});
        const box = await banner.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeGreaterThan(20);
        await expect(page.getByTestId("backend-unreachable-banner")).toHaveCount(1);

        // The whole point of #765: no per-request red toasts during the outage.
        await expect(page.locator(".Toastify__toast--error")).toHaveCount(0);

        await page.unroute(API_ROUTE);
        await page.getByTestId("backend-unreachable-retry").click();
        await expect(banner).toHaveCount(0, {timeout: 10_000});
    });
});
