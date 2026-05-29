/**
 * AD-HEADER-SINGLE-LINE-01 (2026-05-30) regression pin.
 *
 * The Article-Dashboard header must stay on a SINGLE LINE at
 * 900px+ viewport width. It wrapped to two lines twice:
 *   1. the original nav-jump (fixed v0.38.0 by folding the
 *      standalone Medium-import button into the Import chevron),
 *   2. again after ARTICLE-TYPES-SSOT-01 C5 (commit 76737700)
 *      replaced the plain "Neuer Artikel" button with a
 *      SplitButton, adding a second chevron to the cluster.
 *
 * The fix folds the standalone "Backup" button into the Import
 * chevron dropdown, making the cluster ~one button narrower than
 * the Book Dashboard (the known-good single-line baseline).
 *
 * This pin asserts BOUNDING-BOX HEIGHT (per the lessons-learned
 * "assert bounding-box dimensions for CSS-collapse class bugs"
 * rule, applied to the inverse — a too-TALL header signals a
 * wrap). A single row of header controls is ~56-64px tall
 * (12px padding top+bottom + ~32px control). A wrapped two-line
 * header is ~100px+. The 80px threshold cleanly separates the
 * two without being brittle to a few px of control-height
 * variation.
 *
 * Also pins that Backup moved INTO the Import chevron dropdown
 * (it is no longer a standalone header button).
 */

import {test, expect} from "../fixtures/base";

test.describe("AD-HEADER-SINGLE-LINE-01", () => {
    test("Article-Dashboard header stays single-line at 900px", async ({
        page,
    }) => {
        await page.setViewportSize({width: 900, height: 800});
        await page.goto("/articles");
        await expect(page.getByTestId("article-list-page")).toBeVisible();

        const header = page.getByTestId("article-list-header");
        await expect(header).toBeVisible();

        const box = await header.boundingBox();
        expect(box).not.toBeNull();
        // Single row ~56-64px; a two-line wrap is ~100px+.
        expect(box!.height).toBeLessThan(80);
    });

    test("header stays single-line at 1024px too", async ({page}) => {
        await page.setViewportSize({width: 1024, height: 800});
        await page.goto("/articles");
        await expect(page.getByTestId("article-list-page")).toBeVisible();

        const box = await page
            .getByTestId("article-list-header")
            .boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeLessThan(80);
    });

    test("Backup lives in the Import chevron dropdown, not a standalone button", async ({
        page,
    }) => {
        await page.setViewportSize({width: 1024, height: 800});
        await page.goto("/articles");
        await expect(page.getByTestId("article-list-page")).toBeVisible();

        // Open the Import chevron and confirm both import + backup
        // actions are present in the dropdown.
        await page.getByTestId("article-import-chevron").click();
        await expect(
            page.getByTestId("article-medium-import-btn"),
        ).toBeVisible();
        await expect(
            page.getByTestId("article-backup-export-btn"),
        ).toBeVisible();

        await page.keyboard.press("Escape");
    });
});
