/**
 * Editor sidebar overlay-close regression pins (#sidebar-overlay-close).
 *
 * Below the `menu` breakpoint (1200px) the editor sidebar is a fixed overlay
 * covering the writing area. A click toward the editor (i.e. on the dim
 * backdrop) now closes the sidebar — the standard drawer dismissal — instead
 * of leaving it open over the editor. On desktop (sidebar in-flow) the
 * backdrop is `menu:hidden`, so a click in the editor leaves the sidebar open.
 *
 * Verified on the BookEditor (the reported surface); the same `SidebarOverlay`
 * is wired into the Article / picture-book / comic editors.
 */

import {test, expect, createBook, createChapter} from "../fixtures/base";
import type {Page} from "@playwright/test";

const MOBILE = {width: 375, height: 667};
const DESKTOP = {width: 1440, height: 900};

async function seedBook(title: string): Promise<string> {
    const book = await createBook(title);
    await createChapter(book.id, "Kapitel 1", "");
    return book.id;
}

async function openEditor(page: Page, bookId: string) {
    await page.goto(`/book/${bookId}`);
    await expect(page.getByTestId("book-editor-sidebar")).toBeAttached();
}

async function sidebarWidth(page: Page): Promise<number> {
    const box = await page.getByTestId("book-editor-sidebar").boundingBox();
    return box ? box.width : -1;
}

test.describe("Editor sidebar overlay close", () => {
    test("mobile: clicking the backdrop (toward the editor) closes the sidebar", async ({page}) => {
        const bookId = await seedBook("Overlay Close Mobile");
        await page.setViewportSize(MOBILE);
        await openEditor(page, bookId);

        await page.getByTestId("book-editor-sidebar-toggle").click();
        await expect.poll(() => sidebarWidth(page)).toBeGreaterThan(200);

        const overlay = page.getByTestId("book-editor-sidebar-overlay");
        await expect(overlay).toBeVisible();
        // Click toward the editor (right of the 260px sidebar). The overlay is
        // inset-0 full-screen at z-80 but the sidebar sits above it at z-90, so
        // the overlay's geometric centre (x~187 at 375px) lands ON the sidebar
        // and is intercepted. The user dismisses by clicking the visible dim
        // backdrop beside the drawer, which this position mirrors.
        await overlay.click({position: {x: MOBILE.width - 40, y: 300}});
        await expect.poll(() => sidebarWidth(page)).toBeLessThanOrEqual(1);
    });

    test("mobile: no backdrop while the sidebar is closed", async ({page}) => {
        const bookId = await seedBook("Overlay Closed Mobile");
        await page.setViewportSize(MOBILE);
        await openEditor(page, bookId);
        // Sidebar starts collapsed below the menu breakpoint -> no backdrop.
        await expect(page.getByTestId("book-editor-sidebar-overlay")).toHaveCount(0);
    });

    test("desktop: the sidebar is open and the backdrop is not shown", async ({page}) => {
        const bookId = await seedBook("Overlay Desktop");
        await page.setViewportSize(DESKTOP);
        await openEditor(page, bookId);

        // Expanded by default at/above the menu breakpoint.
        await expect.poll(() => sidebarWidth(page)).toBeGreaterThan(200);
        // The overlay is `menu:hidden` -> present in the DOM but not visible,
        // so a click in the editor never dismisses the sidebar on desktop.
        await expect(page.getByTestId("book-editor-sidebar-overlay")).toBeHidden();
        expect(await sidebarWidth(page)).toBeGreaterThan(200);
    });
});
