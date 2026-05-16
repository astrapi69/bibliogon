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
        // Open Settings via the dashboard's Settings icon (any path
        // that navigates programmatically works; the key thing is
        // that location.key is no longer "default" after the nav).
        await page.goto("/settings");
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
    test("AD → Help → Back returns to AD", async ({page}) => {
        await page.goto("/articles");
        await page.goto("/help");
        await page.getByTestId("help-nav-back").click();
        await expect(page).toHaveURL(/\/articles$/);
    });
});

test.describe("GetStarted back-button origin tracking (Bug 1 drive-by)", () => {
    test("AD → GetStarted → Back returns to AD", async ({page}) => {
        await page.goto("/articles");
        await page.goto("/get-started");
        await page.getByTestId("getstarted-nav-back").click();
        await expect(page).toHaveURL(/\/articles$/);
    });
});
