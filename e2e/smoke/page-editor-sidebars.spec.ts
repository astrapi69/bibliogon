/**
 * Smoke tests for the collapsible Picture-Book (PageEditor) sidebars.
 *
 * The picture-book editor has two sidebars -- the page-thumbnail list
 * (left) and the page-properties pane (right) -- around a center canvas.
 * Below the menu breakpoint (1200px) the fixed-pixel columns overflowed
 * a phone viewport. Mirrors the BookEditor collapse pattern. Covers:
 *
 * 1. Below the menu breakpoint both sidebars collapse by default, with
 *    their floating open-toggles visible.
 * 2. At/above the menu breakpoint both are expanded by default.
 * 3. Below the md breakpoint (768px) the two are mutually exclusive --
 *    opening one collapses the other so the canvas keeps full width.
 *
 * Aster runs this spec in a real browser (layout/geometry can't be
 * observed by a component test).
 */

import {test, expect, createPictureBook} from "../fixtures/base";
import type {Page} from "@playwright/test";

const PHONE = {width: 375, height: 667};
const NARROW = {width: 1024, height: 800};
const WIDE = {width: 1440, height: 900};

async function openEditor(page: Page, bookId: string) {
    await page.goto(`/book/${bookId}`);
    await expect(page.getByTestId("page-editor-root")).toBeVisible();
}

async function wrapperWidth(page: Page, testId: string): Promise<number> {
    const box = await page.getByTestId(testId).boundingBox();
    return box ? box.width : -1;
}

const LEFT = "page-editor-thumbnails-wrapper";
const RIGHT = "page-editor-properties-wrapper";

test.describe("PageEditor sidebars collapse", () => {
    test("both collapsed by default below the menu breakpoint", async ({
        page,
    }) => {
        const book = await createPictureBook("Picture Narrow");
        await page.setViewportSize(NARROW);
        await openEditor(page, book.id);

        expect(await wrapperWidth(page, LEFT)).toBeLessThanOrEqual(1);
        expect(await wrapperWidth(page, RIGHT)).toBeLessThanOrEqual(1);
        await expect(
            page.getByTestId("page-editor-thumbnails-toggle"),
        ).toBeVisible();
        await expect(
            page.getByTestId("page-editor-properties-toggle"),
        ).toBeVisible();
    });

    test("both expanded by default at/above the menu breakpoint", async ({
        page,
    }) => {
        const book = await createPictureBook("Picture Wide");
        await page.setViewportSize(WIDE);
        await openEditor(page, book.id);

        expect(await wrapperWidth(page, LEFT)).toBeGreaterThan(160);
        expect(await wrapperWidth(page, RIGHT)).toBeGreaterThan(240);
    });

    test("collapsed-sidebar toggles do not overlap the header icons (#109)", async ({
        page,
    }) => {
        const book = await createPictureBook("Picture Overlap");
        await page.setViewportSize(NARROW);
        await openEditor(page, book.id);

        // Pre-#109 the expand buttons were position:fixed at the viewport
        // top, sitting ON the header: the left one covered the back
        // button, the right one covered the ThemeToggle. toBeVisible()
        // cannot catch stacked elements, so assert bounding-box
        // disjointness (Playwright-visible != user-visible lesson).
        const disjoint = async (aId: string, bId: string) => {
            const a = await page.getByTestId(aId).boundingBox();
            const b = await page.getByTestId(bId).boundingBox();
            expect(a).not.toBeNull();
            expect(b).not.toBeNull();
            const overlaps =
                a!.x < b!.x + b!.width &&
                b!.x < a!.x + a!.width &&
                a!.y < b!.y + b!.height &&
                b!.y < a!.y + a!.height;
            expect(overlaps, `${aId} overlaps ${bId}`).toBe(false);
        };

        await disjoint("page-editor-thumbnails-toggle", "page-editor-back");
        await disjoint("page-editor-properties-toggle", "theme-toggle");

        // Both stay independently clickable.
        await page.getByTestId("page-editor-properties-toggle").click();
        await expect.poll(() => wrapperWidth(page, RIGHT)).toBeGreaterThan(240);
    });

    test("right-sidebar Layout + per-layout config sections collapse with persistence (#109)", async ({
        page,
    }) => {
        const book = await createPictureBook("Picture Collapsible");
        await page.setViewportSize(WIDE);
        await openEditor(page, book.id);

        // The properties pane (LayoutPicker + per-layout config) only
        // renders once a page is active.
        await page.getByTestId("page-editor-add-page").click();

        // The Layout picker folds via its new section trigger...
        const layoutTrigger = page.getByTestId(
            "page-editor-layout-picker-section-trigger",
        );
        await expect(layoutTrigger).toBeVisible();
        await expect(
            page.getByTestId("page-editor-layout-picker-section-content"),
        ).toBeVisible();
        await layoutTrigger.click();
        await expect(
            page.getByTestId("page-editor-layout-picker-section-content"),
        ).toBeHidden();

        // ...and the collapsed choice survives a reload (localStorage).
        await page.reload();
        await expect(page.getByTestId("page-editor-root")).toBeVisible();
        await expect(
            page.getByTestId("page-editor-layout-picker-section-content"),
        ).toBeHidden();
        await page
            .getByTestId("page-editor-layout-picker-section-trigger")
            .click();
        await expect(
            page.getByTestId("page-editor-layout-picker-section-content"),
        ).toBeVisible();
    });

    test("only one sidebar open at a time below 768px", async ({page}) => {
        const book = await createPictureBook("Picture Phone");
        await page.setViewportSize(PHONE);
        await openEditor(page, book.id);

        await page.getByTestId("page-editor-thumbnails-toggle").click();
        await expect.poll(() => wrapperWidth(page, LEFT)).toBeGreaterThan(160);

        await page.getByTestId("page-editor-properties-toggle").click();
        await expect.poll(() => wrapperWidth(page, RIGHT)).toBeGreaterThan(240);
        await expect.poll(() => wrapperWidth(page, LEFT)).toBeLessThanOrEqual(1);
    });
});
