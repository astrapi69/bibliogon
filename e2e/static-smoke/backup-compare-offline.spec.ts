/**
 * Backup compare on the backendless build (#748).
 *
 * The compare used to upload both archives to `/api/backup/compare`, which
 * made it desktop-only. It reads two files the user picked and touches
 * nothing else, so the round trip was buying nothing: `fflate` unzips both
 * in the browser and the line diff is the one the offline chapter-version
 * history already uses.
 *
 * This drives the real flow on the real bundle: export a backup, change a
 * chapter, export again, compare the two downloads, read the diff - with
 * no `/api` request anywhere.
 */

import * as path from "node:path";

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

test("two offline exports compare in the browser with no /api call", async ({page}, testInfo) => {
    const apiCalls: string[] = [];
    page.on("request", (request) => {
        if (new URL(request.url()).pathname.includes("/api/")) apiCalls.push(request.url());
    });

    // An article is enough: the bundle carries it, and the compare's book
    // diff only needs the two archives to share a book id - which a second
    // export of the same library guarantees.
    await page.goto("/books/new?type=prose");
    await page.getByTestId("create-book-title").fill("Vergleichsbuch");
    const author = page.getByTestId("create-book-author");
    if (await author.isVisible()) await author.fill("Asterios Raptis");
    await page.getByTestId("create-book-submit").click();
    await page.getByRole("button", {name: /Vergleichsbuch/}).first().click();
    await page.waitForURL(/\/book\//, {timeout: 20_000});

    const exportBackup = async (filename: string): Promise<string> => {
        await page.goto("/settings");
        await page.getByTestId("settings-tab-backups").click();
        await page.getByTestId("backups-settings").waitFor({state: "visible"});
        const download = page.waitForEvent("download");
        await page.getByTestId("backups-export-full").click();
        const saved = path.join(testInfo.outputDir, filename);
        // saveAs, not path(): the reader requires a `.bgb` name, as the
        // backend's compare did, and Playwright's temp path has none.
        await (await download).saveAs(saved);
        return saved;
    };

    const fileA = await exportBackup("a.bgb");

    // Change the library between the two exports so the diff has something
    // to report rather than passing on an empty one. The author field is
    // required, so Erstellen stays disabled without it - the first create
    // above fills it too.
    await page.goto("/books/new?type=prose");
    await page.getByTestId("create-book-title").fill("Zweites Buch");
    const secondAuthor = page.getByTestId("create-book-author");
    if (await secondAuthor.isVisible()) await secondAuthor.fill("Asterios Raptis");
    await page.getByTestId("create-book-submit").click();
    // Submit returns to the dashboard rather than opening the editor, so
    // the card appearing is the signal that the Dexie write landed. Without
    // it the next export could race the commit and both archives would be
    // identical - a green test that measured nothing.
    await page
        .getByRole("button", {name: /Zweites Buch/})
        .first()
        .waitFor({state: "visible", timeout: 20_000});

    const fileB = await exportBackup("b.bgb");

    await page.goto("/settings");
    await page.getByTestId("settings-tab-backups").click();
    // Active, not gated: the notice is what shipped before #748.
    await expect(page.getByTestId("backups-compare-disabled")).toHaveCount(0);
    await page.getByTestId("backups-compare-btn").click();

    await page.getByTestId("backup-compare-file-a").setInputFiles(fileA);
    await page.getByTestId("backup-compare-file-b").setInputFiles(fileB);
    await expect(page.getByTestId("backup-compare-size-a")).toBeVisible();
    await page.getByTestId("backup-compare-run").click();

    await expect(page.getByTestId("backup-compare-summary")).toBeVisible();
    await expect(page.getByTestId("backup-compare-footer")).toBeVisible();
    // The second book exists only in B. Asserting it proves the compare
    // read both archives and found a real difference, rather than
    // rendering an empty result from two identical files.
    await expect(page.getByText(/Nur in B/)).toBeVisible();

    expect(apiCalls).toEqual([]);
});
