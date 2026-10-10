/**
 * Comic-book PDF on the static Dexie build, with no backend (#742).
 *
 * The comic PDF used to render only through the plugin's WeasyPrint
 * walker, so `PdfExportControls` offered the picture-book client engine
 * and left comics disabled with "requires the desktop app". There is now
 * a pdfmake engine that lays the panel grid out, crops each image to its
 * cell and draws every bubble from the same path geometry the editor
 * renders on screen.
 *
 * Asserted here rather than in Vitest for two reasons the unit tests
 * cannot cover: pdfmake only produces a document in a real browser, and
 * the zero-`/api` contract means nothing except against the built bundle.
 */

import {test, expect, type Page} from "@playwright/test";
import path from "node:path";

const PANEL_IMAGE = path.resolve(__dirname, "../fixtures/kdp-cover-pass.png");

/** Panels on the canvas, excluding the side-pane controls that share the
 *  `comic-panel-` prefix (per the prefix-overmatch lesson). */
const CANVAS_PANELS =
    '[data-testid="comic-page-grid"] [data-testid^="comic-panel-"]' +
    ':not([data-testid*="-bubble-"]):not([data-testid*="-image-"])' +
    ':not([data-testid*="-upload"]):not([data-testid*="-tier"])';

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

/** A fresh comic book, returning its `/book/{id}` path. */
async function createComicBook(page: Page, title: string): Promise<string> {
    await page.goto("/books/new?type=comic_book");
    await page.getByTestId("create-book-title").fill(title);
    const author = page.getByTestId("create-book-author");
    if (await author.isVisible()) await author.fill("Asterios Raptis");
    await page.getByTestId("create-book-submit").click();
    // A comic book is a pageable type, so CreateBookPage navigates
    // straight into the editor. The dashboard-then-click dance the prose
    // specs do would wait for a button that is never reached.
    await page.waitForURL(/\/book\/[^/?]+/, {timeout: 20_000});
    return new URL(page.url()).pathname;
}

test("a comic page with panels, an image and a bubble exports to PDF offline", async ({
    page,
}) => {
    test.setTimeout(120_000);
    const apiCalls: string[] = [];
    page.on("request", (request) => {
        if (new URL(request.url()).pathname.includes("/api/")) apiCalls.push(request.url());
    });

    await createComicBook(page, "Offline Comic PDF");
    await page.getByTestId("comic-book-editor-add-page").click();
    await expect(page.getByTestId("comic-page-grid")).toBeVisible({timeout: 20_000});

    // A multi-cell template, because that is where the geometry can be
    // wrong in a way a single full-bleed panel would hide: the cell rects,
    // the per-cell image crop and the panel-relative bubble position all
    // collapse to "the whole page" at single_panel.
    const picker = page.getByTestId("comic-grid-template-picker-trigger");
    await picker.click();
    await page.getByTestId("comic-grid-template-picker-item-grid_1x2").click();
    await expect(picker).toHaveAttribute("data-value", "grid_1x2");

    await page.getByTestId("comic-book-editor-add-panel").click();
    await page.getByTestId("comic-book-editor-add-panel").click();
    await expect(page.locator(CANVAS_PANELS)).toHaveCount(2);

    // The image goes through the storage seam into IndexedDB, so the
    // export's cover-crop reads real bytes rather than a stub.
    const firstPanel = page.locator(CANVAS_PANELS).first();
    const panelId = (await firstPanel.getAttribute("data-testid"))!.replace("comic-panel-", "");
    await page
        .getByTestId(`comic-panel-upload-input-${panelId}`)
        .setInputFiles(PANEL_IMAGE);
    // The panel image carries no testid of its own, so it is addressed
    // through its panel. naturalWidth, not visibility: a blob: URL that
    // failed to resolve still leaves a visible img box of the right size.
    const panelImage = firstPanel.locator("img").first();
    await expect(panelImage).toBeVisible({timeout: 20_000});
    await expect
        .poll(async () => panelImage.evaluate((img: HTMLImageElement) => img.naturalWidth), {
            timeout: 15_000,
        })
        .toBeGreaterThan(0);

    await firstPanel.click();
    await page.getByTestId("comic-book-editor-add-bubble").click();
    await expect(page.locator('[data-testid^="comic-bubble-"]').first()).toBeVisible({
        timeout: 20_000,
    });

    const exportButton = page.getByTestId("comic-book-editor-export-pdf");
    // The gate: this button carried "requires the desktop app" before
    // #742, so an enabled one is the regression pin for the gate change
    // as much as for the engine.
    await expect(exportButton).toBeEnabled();

    const download = page.waitForEvent("download", {timeout: 90_000});
    await exportButton.click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.pdf$/);
    // Visible is not saved: a rejected download still fires the event in
    // some builds, and an empty file is the failure this catches.
    const saved = await file.path();
    expect(saved, "the browser did not hand over a file").toBeTruthy();

    expect(apiCalls, `offline comic PDF hit the backend:\n${apiCalls.join("\n")}`).toEqual([]);
});

test("the Design tab offers the comic PDF too", async ({page}) => {
    test.setTimeout(90_000);
    // ContentTabs rendered the control for picture books only while the
    // comic PDF was backend-bound. A comic author reaching the metadata
    // editor and finding no export is the half-wired secondary surface
    // PDF-KDP-FORMATS-01 shipped once already.
    const apiCalls: string[] = [];
    page.on("request", (request) => {
        if (new URL(request.url()).pathname.includes("/api/")) apiCalls.push(request.url());
    });

    const bookPath = await createComicBook(page, "Comic Design Tab");
    await page.goto(`${bookPath}?view=metadata`);
    await page.getByTestId("metadata-tab-design").click();

    const exportButton = page.getByTestId("metadata-export-pdf");
    await expect(exportButton).toBeVisible({timeout: 20_000});
    await expect(exportButton).toBeEnabled();

    const download = page.waitForEvent("download", {timeout: 60_000});
    await exportButton.click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
    expect(apiCalls, `the Design tab hit the backend:\n${apiCalls.join("\n")}`).toEqual([]);
});
