/**
 * v0.33.0 Bug 1 E2E smoke: Settings/Help/GetStarted back-button
 * uses browser history.
 *
 * Pins the fix for the user-reported flow:
 *   /articles → Settings → "<" Back → should return to /articles
 *   /         → Settings → "<" Back → should return to /
 *
 * Same pattern verified for Help and GetStarted (drive-by fixes
 * that shipped in the same commit). Direct-URL entry tested via
 * a fresh page.goto() on the Settings route — the back-button
 * falls back to '/' when there is no app history.
 */

import {test, expect} from "../fixtures/base";

test.describe("Settings back-button origin tracking (Bug 1)", () => {
    test("AD → Settings → Back returns to AD", async ({page}) => {
        await page.goto("/articles");
        await expect(page.getByTestId("article-list-page")).toBeVisible();
        // Open Settings via the dashboard's in-app Settings icon. This MUST
        // be a client-side navigation (not page.goto), otherwise the SPA
        // reboots and location.key resets to "default" — which makes the
        // back button fall back to "/" instead of navigate(-1) to /articles.
        await page.getByTestId("article-list-settings").click();
        await expect(page.getByTestId("settings-nav-back")).toBeVisible();
        await page.getByTestId("settings-nav-back").click();
        await expect(page).toHaveURL(/\/articles$/);
    });

    test("BD → Settings → Back returns to BD", async ({page}) => {
        await page.goto("/");
        await page.goto("/settings");
        await page.getByTestId("settings-nav-back").click();
        await expect(page).toHaveURL(/\/$/);
    });

    test("direct URL → Settings → Back falls back to BD", async ({page}) => {
        // Fresh tab, no app history.
        await page.goto("/settings");
        await page.getByTestId("settings-nav-back").click();
        await expect(page).toHaveURL(/\/$/);
    });
});

test.describe("Help back-button origin tracking (Bug 1 drive-by)", () => {
    // The in-app Help affordance (article-list-help) opens the HelpPanel
    // overlay (openHelp), not the /help ROUTE — and nothing in the app
    // navigates client-side to /help. The /help page is reached only by a
    // direct URL / deep link, so its back button correctly falls back to "/"
    // (location.key === "default"). This pins that fallback; an "AD → Help
    // page → back → /articles" flow is not reachable in the current app.
    test("Help (direct entry) → Back falls back to BD", async ({page}) => {
        await page.goto("/help");
        await page.getByTestId("help-nav-back").click();
        await expect(page).toHaveURL(/\/$/);
    });
});

test.describe("GetStarted back-button origin tracking (Bug 1 drive-by)", () => {
    test("AD → GetStarted → Back returns to AD", async ({page}) => {
        await page.goto("/articles");
        await expect(page.getByTestId("article-list-page")).toBeVisible();
        // In-app navigation (see the Settings test for why page.goto fails).
        await page.getByTestId("article-list-get-started").click();
        await expect(page.getByTestId("getstarted-nav-back")).toBeVisible();
        await page.getByTestId("getstarted-nav-back").click();
        await expect(page).toHaveURL(/\/articles$/);
    });
});
