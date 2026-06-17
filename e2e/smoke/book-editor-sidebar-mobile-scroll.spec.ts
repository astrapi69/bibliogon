/**
 * Mobile BookEditor sidebar reachability regression pins (#sidebar-mobile).
 *
 * Below the `menu` breakpoint (1200px) the chapter sidebar is a fixed
 * overlay. It used to be a flex column where ONLY the chapter list
 * scrolled while the footer (Metadaten + Werkzeuge + Exportieren) was
 * pinned (`flex-shrink: 0`); on short / mobile viewports the footer
 * overflowed below the fold with no way to scroll to it, and `height:
 * 100vh` ignored the iOS browser chrome. The fix makes the WHOLE sidebar
 * scroll on overlay viewports (`100dvh` + `overflow-y: auto`), so every
 * menu item is reachable.
 *
 * `Playwright-visible != User-visible`: the reachability checks scroll the
 * last footer control into view and assert `toBeInViewport()` (the item is
 * actually inside the visible viewport box), not merely present in the DOM.
 *
 * CC writes this spec; Aster runs it (Pre-Release Gate) — the behaviour is
 * CSS/layout-driven and a component test cannot observe scroll/viewport.
 */

import {test, expect, createBook, createChapter} from "../fixtures/base";
import type {Page} from "@playwright/test";

const IPHONE_SE = {width: 375, height: 667};
const IPHONE_SE_SHORT = {width: 375, height: 480}; // very short (landscape-ish)

async function seedBook(title: string, chapterCount = 3): Promise<string> {
    const book = await createBook(title);
    for (let i = 1; i <= chapterCount; i++) {
        await createChapter(book.id, `Kapitel ${i}`, "");
    }
    return book.id;
}

async function openSidebar(page: Page, bookId: string) {
    await page.goto(`/book/${bookId}`);
    await expect(page.getByTestId("book-editor-sidebar")).toBeAttached();
    // Below the menu breakpoint the sidebar starts collapsed; open it.
    await page.getByTestId("book-editor-sidebar-toggle").click();
    await expect(page.getByTestId("chapter-sidebar")).toBeVisible();
}

test.describe("BookEditor sidebar mobile reachability", () => {
    test("last footer item (Exportieren) is reachable at 375px", async ({page}) => {
        const bookId = await seedBook("Mobile Reachable");
        await page.setViewportSize(IPHONE_SE);
        await openSidebar(page, bookId);

        const exportBtn = page.getByTestId("chapter-sidebar-export");
        await exportBtn.scrollIntoViewIfNeeded();
        await expect(exportBtn).toBeInViewport();
    });

    test("all key menu items are present and clickable (happy path)", async ({page}) => {
        const bookId = await seedBook("Mobile Navigable");
        await page.setViewportSize(IPHONE_SE);
        await openSidebar(page, bookId);

        // The footer controls exist and the Metadaten action navigates.
        const metadataBtn = page.getByTestId("chapter-sidebar-metadata");
        await metadataBtn.scrollIntoViewIfNeeded();
        await expect(metadataBtn).toBeInViewport();
        await metadataBtn.click();
        await expect(page).toHaveURL(/view=metadata/);
    });

    test("with 20+ chapters the list scrolls and the footer stays reachable", async ({page}) => {
        const bookId = await seedBook("Mobile Long Book", 22);
        await page.setViewportSize(IPHONE_SE);
        await openSidebar(page, bookId);

        // The first chapter is near the top...
        await expect(page.getByText("Kapitel 1").first()).toBeVisible();
        // ...and the Export button at the very bottom is still reachable by
        // scrolling the sidebar.
        const exportBtn = page.getByTestId("chapter-sidebar-export");
        await exportBtn.scrollIntoViewIfNeeded();
        await expect(exportBtn).toBeInViewport();
    });

    test("footer is reachable on a very short viewport (notch/home-indicator)", async ({page}) => {
        const bookId = await seedBook("Mobile Short", 8);
        await page.setViewportSize(IPHONE_SE_SHORT);
        await openSidebar(page, bookId);

        const exportBtn = page.getByTestId("chapter-sidebar-export");
        await exportBtn.scrollIntoViewIfNeeded();
        await expect(exportBtn).toBeInViewport();
        // The bottom of the button sits within the viewport (not clipped
        // behind the home indicator).
        const box = await exportBtn.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.y + box!.height).toBeLessThanOrEqual(IPHONE_SE_SHORT.height + 1);
    });
});
