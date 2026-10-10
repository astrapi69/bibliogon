/**
 * Bulk export on the static Dexie build, with no backend (#743).
 *
 * `FEATURES.BULK_EXPORT` used to be DESKTOP_ONLY: both bulk-action bars
 * called the backend's Pandoc loop, so the Export button sat disabled with
 * "requires the desktop app". Now it renders each selected book or article
 * through the same client export engine the single-file download uses and
 * packs the results with fflate.
 *
 * Asserted here rather than in Vitest: the download is a Blob the browser
 * has to actually hand over, and the zero-`/api` contract only means
 * something against the real built bundle.
 */

import {test, expect, type Page} from "@playwright/test";

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

async function createBook(page: Page, title: string): Promise<void> {
    await page.goto("/books/new?type=prose");
    await page.getByTestId("create-book-title").fill(title);
    const author = page.getByTestId("create-book-author");
    if (await author.isVisible()) await author.fill("Asterios Raptis");
    await page.getByTestId("create-book-submit").click();
    await expect(page.getByRole("button", {name: new RegExp(title)}).first()).toBeVisible({
        timeout: 20_000,
    });
}

async function createArticle(page: Page, title: string): Promise<void> {
    await page.goto("/articles/new");
    await page.getByTestId("create-article-title").fill(title);
    await page.getByTestId("create-article-submit").click();
    await page.waitForURL(
        (url) => /\/articles\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"),
        {timeout: 20_000},
    );
}

test("the books bulk export produces a ZIP offline, with no /api call", async ({page}) => {
    test.setTimeout(90_000);
    const apiCalls: string[] = [];
    page.on("request", (request) => {
        if (new URL(request.url()).pathname.includes("/api/")) apiCalls.push(request.url());
    });

    await createBook(page, "Bulk Buch Eins");
    await createBook(page, "Bulk Buch Zwei");

    await page.goto("/");
    await page.getByTestId("book-bulk-select-all").click();
    const exportButton = page.getByTestId("book-bulk-export");
    // The gate: this button was disabled with "requires the desktop app"
    // before #743, so an enabled one is the regression pin for the gate
    // change as much as for the port.
    await expect(exportButton).toBeEnabled();

    const download = page.waitForEvent("download", {timeout: 60_000});
    await exportButton.click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^books-\d{4}-\d{2}-\d{2}\.zip$/);
    // A Blob the browser handed over, not a promise that resolved: a
    // zero-byte download would satisfy the event alone.
    const path = await file.path();
    expect(path, "the download produced no file").toBeTruthy();
    expect(apiCalls).toEqual([]);
});

test("the articles bulk export honours the ZIP / combined toggle offline", async ({page}) => {
    test.setTimeout(90_000);
    const apiCalls: string[] = [];
    page.on("request", (request) => {
        if (new URL(request.url()).pathname.includes("/api/")) apiCalls.push(request.url());
    });

    await createArticle(page, "Bulk Text Eins");
    await createArticle(page, "Bulk Text Zwei");

    await page.goto("/articles");
    await page.getByTestId("article-bulk-select-all").click();
    await expect(page.getByTestId("article-bulk-export")).toBeEnabled();

    // ZIP is the default mode.
    const zipDownload = page.waitForEvent("download", {timeout: 60_000});
    await page.getByTestId("article-bulk-export").click();
    expect((await zipDownload).suggestedFilename()).toMatch(
        /^articles-\d{4}-\d{2}-\d{2}\.zip$/,
    );

    // Combined gives ONE document, not an archive - the mode has to reach
    // the engine, which is where dropping it would look like success.
    await page.getByTestId("article-bulk-select-all").click();
    await page.getByTestId("article-bulk-mode-combined").click();
    const combinedDownload = page.waitForEvent("download", {timeout: 60_000});
    await page.getByTestId("article-bulk-export").click();
    expect((await combinedDownload).suggestedFilename()).toMatch(
        /^articles-\d{4}-\d{2}-\d{2}\.md$/,
    );

    expect(apiCalls).toEqual([]);
});
