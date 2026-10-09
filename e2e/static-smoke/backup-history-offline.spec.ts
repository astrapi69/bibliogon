/**
 * Backup history on the backendless build (#748).
 *
 * The log used to be desktop-only: Settings > Backups read the server's
 * history store, so offline the section rendered a "requires the desktop
 * app" notice. Now it reads the browser's own log through the storage
 * seam, which means the user who exports a backup from the PWA can see
 * that they did - the single most useful fact a backup feature can tell
 * them.
 *
 * Two things this pins that a Vitest cannot: that the section is active
 * rather than gated on the real backendless bundle, and that the whole
 * flow fires no `/api` request.
 */

import {test, expect} from "@playwright/test";

test.beforeEach(async ({context}) => {
    await context.route(/\/(registerSW\.js|sw\.js)(\?|$)/, (route) => route.abort());
    await context.addInitScript(() => {
        try {
            localStorage.setItem("bibliogon-donation-onboarding-seen", "true");
            localStorage.setItem("bibliogon-ai-setup-dismissed", "true");
            localStorage.setItem("bibliogon-migration-offered", "true");
        } catch {
            /* storage unavailable: the assertions below report it */
        }
    });
});

test("an offline export shows up in the history and survives a reload", async ({page}) => {
    const apiCalls: string[] = [];
    page.on("request", (request) => {
        if (new URL(request.url()).pathname.includes("/api/")) apiCalls.push(request.url());
    });

    await page.goto("/settings");
    await page.getByTestId("settings-tab-backups").click();
    await page.getByTestId("backups-settings").waitFor({state: "visible"});

    // Active, not gated: the notice is what shipped before #748.
    await expect(page.getByTestId("backups-history-disabled")).toHaveCount(0);
    await expect(page.getByTestId("backups-history-empty")).toBeVisible();

    const download = page.waitForEvent("download");
    await page.getByTestId("backups-export-full").click();
    await download;

    // The list is read once on mount, so the new row appears after a
    // revisit - which is also the assertion that the row was PERSISTED and
    // not just pushed into component state.
    await page.reload();
    await page.getByTestId("settings-tab-backups").click();
    const firstRow = page.getByTestId("backups-history-entry-0");
    await expect(firstRow).toBeVisible();
    await expect(firstRow).toContainText("backup");
    await expect(firstRow).toContainText(/\.bgb$/);

    await firstRow.getByTestId("backups-history-entry-0-delete").click();
    await expect(page.getByTestId("backups-history-empty")).toBeVisible();

    expect(apiCalls).toEqual([]);
});
