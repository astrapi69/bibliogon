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
