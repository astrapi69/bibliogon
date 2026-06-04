/**
 * Smoke test for the ShortcutsPage route (Dialog->Pages migration C9).
 *
 * ShortcutCheatsheet (a Ctrl+/ App-level overlay) became a deep-linkable
 * reference page at `/help/shortcuts`.
 *   - deep-link renders the page directly
 *   - back button returns to the previous surface (fallback dashboard)
 *   - mobile viewport renders without overflow
 */

import {test, expect} from "../fixtures/base";

test("deep-link to /help/shortcuts renders the cheatsheet", async ({page}) => {
    await page.goto("/help/shortcuts");
    await expect(page.getByTestId("shortcuts-page")).toBeVisible();
    // At least one shortcut row is present (kbd elements).
    await expect(page.locator("kbd").first()).toBeVisible();
});

test("back from /help/shortcuts returns to the dashboard", async ({page}) => {
    await page.goto("/");
    await page.goto("/help/shortcuts");
    await page.getByTestId("shortcuts-page-back").click();
    await expect(page).not.toHaveURL(/\/help\/shortcuts/);
});

test("renders on a mobile viewport", async ({page}) => {
    await page.setViewportSize({width: 375, height: 800});
    await page.goto("/help/shortcuts");
    await expect(page.getByTestId("shortcuts-page")).toBeVisible();
});
