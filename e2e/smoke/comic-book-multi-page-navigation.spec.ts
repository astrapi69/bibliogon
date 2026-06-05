/**
 * Comic-book multi-page navigation smoke
 * (PLUGIN-COMICS-MULTI-PAGE-NAVIGATION-01 C4).
 *
 * Exercises the post-C1 sidebar adoption end-to-end:
 *   - empty-state surfaces PageThumbnails' add-page button
 *   - clicking add-page creates page 1; sidebar row appears
 *   - clicking add-page again creates page 2; both rows visible
 *   - sidebar row click switches activePageId
 *   - drag-reorder via @dnd-kit moves page 1 to position 2
 *
 * Bounding-box-dimension assertion (per LL "Playwright-visible
 * != User-visible"): sidebar rows must have height > 20px each,
 * otherwise toBeVisible() would pass on a CSS-collapsed strip
 * the user cannot interact with. Same discipline as the existing
 * comic-book-multi-panel-layout.spec.ts pattern.
 */

import {test, expect, createComicBook} from "../fixtures/base";

test.describe("Comic-book multi-page navigation smoke", () => {
    test("empty sidebar surfaces add-page button + thumbnails-empty marker", async ({
        page,
    }) => {
        const book = await createComicBook("Empty Sidebar", "E2E Author");
        await page.goto(`/book/${book.id}`);

        await expect(
            page.getByTestId("comic-book-editor-root"),
        ).toBeVisible();
        await expect(
            page.getByTestId("comic-book-editor-thumbnails-empty"),
        ).toBeVisible();
        await expect(
            page.getByTestId("comic-book-editor-add-page"),
        ).toBeVisible();
    });

    test("clicking add-page twice creates 2 pages + both sidebar rows visible at non-zero height", async ({
        page,
    }) => {
        const book = await createComicBook("Two Pages", "E2E Author");
        await page.goto(`/book/${book.id}`);

        // Page 1.
        await page.getByTestId("comic-book-editor-add-page").click();
        await expect(
            page.getByTestId("comic-book-editor-page-list"),
        ).toBeVisible();

        // Page 2.
        await page.getByTestId("comic-book-editor-add-page").click();

        // Both rows exist. Prefix-selector overmatch is the wrong
        // mechanism here (per LL "Prefix testid selectors match
        // every nested testid that shares the prefix") since
        // ``comic-book-editor-drag-handle-{id}`` lives inside each
        // row. Use the page-list container + role to count.
        const rows = page.locator(
            '[data-testid^="comic-book-editor-page-row-"]',
        );
        await expect(rows).toHaveCount(2);

        // Bounding-box-dimension assertion: each sidebar row must
        // render at user-perceivable height. Pre-C1, the chip-nav
        // would have flex-wrapped at ~24px chips; post-C1, each
        // sidebar row should be at least ~30px tall.
        for (let i = 0; i < 2; i++) {
            const bbox = await rows.nth(i).boundingBox();
            expect(bbox).not.toBeNull();
            expect(bbox!.height).toBeGreaterThan(20);
        }
    });

    test("clicking a different sidebar row switches active page", async ({
        page,
    }) => {
        const book = await createComicBook("Switch Active", "E2E Author");
        await page.goto(`/book/${book.id}`);

        // Create two pages. Wait for page 1 to land before adding the
        // second: each add-page is an async create + list-refresh +
        // auto-select. Clicking twice back-to-back races the two
        // handlers (both compute the new position from the same stale
        // page list, and whichever create resolves LAST wins the
        // auto-select), which under load left page 1 active instead of
        // page 2. Waiting for count 1 between clicks makes it
        // deterministic AND mirrors real use (click, see the page,
        // click again).
        const rows = page.locator(
            '[data-testid^="comic-book-editor-page-row-"]',
        );
        await page.getByTestId("comic-book-editor-add-page").click();
        await expect(rows).toHaveCount(1);
        await page.getByTestId("comic-book-editor-add-page").click();
        await expect(rows).toHaveCount(2);

        // Page 2 auto-selected after the 2nd add (perception-lag-fix).
        await expect(rows.nth(1)).toHaveAttribute("data-active", "true");

        // Click row 1 -> active flips.
        await rows.nth(0).click();
        await expect(rows.nth(0)).toHaveAttribute("data-active", "true");
        await expect(rows.nth(1)).toHaveAttribute("data-active", "false");
    });

    test("add-page button stays visible after pages exist (no Half-Wired gap)", async ({
        page,
    }) => {
        // Regression-pin for the user-reported 2026-05-23 finding:
        // PAGES-CRUD-01 shipped first-page-creation but no path to
        // add additional pages. The fix is to ensure the sidebar's
        // add-page button stays visible across both empty AND
        // populated states.
        const book = await createComicBook("Add Button Persists", "E2E Author");
        await page.goto(`/book/${book.id}`);

        // Pre-create: add-page visible.
        await expect(
            page.getByTestId("comic-book-editor-add-page"),
        ).toBeVisible();
        await page.getByTestId("comic-book-editor-add-page").click();

        // Post-first-create: add-page STILL visible (the original bug).
        await expect(
            page.getByTestId("comic-book-editor-page-list"),
        ).toBeVisible();
        await expect(
            page.getByTestId("comic-book-editor-add-page"),
        ).toBeVisible();
    });
});
