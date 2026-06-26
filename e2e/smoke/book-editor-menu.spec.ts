/**
 * Smoke test for the structured BookEditor menu (issue #322).
 *
 * The book editor mounts a generic `EditorMenu` (lib/components/EditorMenu)
 * in the chapter-sidebar header: one grouped hamburger that gathers the
 * book-level actions (Datei / Ansicht / Kapitel / Werkzeuge / Hilfe). This
 * spec verifies the user-visible contract in a real browser: the hamburger
 * opens a grouped panel, items render, and choosing an action dispatches +
 * closes the menu. The component logic (groups, separators, submenu,
 * disabled+reason) is unit-pinned in EditorMenu.test.tsx.
 *
 * data-testid selectors only. CC writes; Aster runs (Pre-Release Gate).
 */

import { test, expect, createBook, createChapter } from "../fixtures/base";

const WIDE = { width: 1440, height: 900 };
const NARROW = { width: 600, height: 900 };

test.describe("BookEditor structured menu", () => {
    test("hamburger opens a grouped menu and an action navigates + closes it", async ({
        page,
    }) => {
        const book = await createBook("Menu Smoke");
        await createChapter(book.id, "Chapter One");

        await page.setViewportSize(WIDE);
        await page.goto(`/book/${book.id}`);

        // Let the book + chapters finish loading before opening the menu.
        // A late data-load re-render can otherwise detach an open menu
        // item mid-click, which a single click() doesn't survive (#533).
        await page.waitForLoadState("networkidle");

        // Sidebar header carries the menu trigger.
        const trigger = page.getByTestId("book-editor-menu-trigger");
        await expect(trigger).toBeVisible();

        // Closed initially.
        await expect(page.getByTestId("book-editor-menu-panel")).toHaveCount(0);

        await trigger.click();
        const panel = page.getByTestId("book-editor-menu-panel");
        await expect(panel).toBeVisible();

        // Grouped structure + representative items.
        await expect(page.getByTestId("book-editor-menu-group-0")).toBeVisible();
        await expect(page.getByTestId("book-editor-menu-item-export")).toBeVisible();
        await expect(page.getByTestId("book-editor-menu-item-metadata")).toBeVisible();
        await expect(page.getByTestId("book-editor-menu-item-new-chapter")).toBeVisible();
        await expect(page.getByTestId("book-editor-menu-item-shortcuts")).toBeVisible();

        // Choosing an action dispatches (navigates) and closes the menu.
        // Under CI load a late editor re-render (TipTap mount / word-count)
        // can remount the Radix portal AFTER networkidle and detach the open
        // item mid-click ("element was detached from the DOM"), which a single
        // click() does not survive. Re-open + re-click inside a toPass; the
        // action navigates away, so the early-return guard stops the loop the
        // moment the navigation lands (the trigger no longer exists after nav).
        await expect(async () => {
            if (page.url().includes("/help/shortcuts")) return;
            const open = await page
                .getByTestId("book-editor-menu-panel")
                .isVisible()
                .catch(() => false);
            if (!open) await page.getByTestId("book-editor-menu-trigger").click();
            const shortcuts = page.getByTestId("book-editor-menu-item-shortcuts");
            await expect(shortcuts).toBeVisible({timeout: 2000});
            await shortcuts.click({timeout: 2000});
            await expect.poll(() => page.url(), {timeout: 2000}).toContain("/help/shortcuts");
        }).toPass({timeout: 20_000});
        // After navigating away the editor (and its menu) unmount entirely.
        await expect(page.getByTestId("book-editor-menu-panel")).toHaveCount(0);
    });

    test("the menu trigger meets the 44px touch target on a narrow viewport", async ({
        page,
    }) => {
        const book = await createBook("Menu Touch");
        await createChapter(book.id, "Chapter One");

        await page.setViewportSize(NARROW);
        await page.goto(`/book/${book.id}`);

        // Open the sidebar if it auto-collapsed on the narrow viewport.
        const toggle = page.getByTestId("book-editor-sidebar-toggle");
        if (await toggle.isVisible().catch(() => false)) {
            await toggle.click();
        }

        const trigger = page.getByTestId("book-editor-menu-trigger");
        await expect(trigger).toBeVisible();
        const box = await trigger.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
    });
});
