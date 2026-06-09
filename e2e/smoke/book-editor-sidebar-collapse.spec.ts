/**
 * Smoke tests for the collapsible BookEditor chapter sidebar.
 *
 * Regression-pins the fix for the sidebar blocking the writing area on
 * narrow screens (phone / GitHub-Pages PWA). Covers:
 *
 * 1. Below the menu breakpoint (1024px) the sidebar is collapsed by
 *    default — width 0, the floating open-toggle visible, the writing
 *    area unobstructed.
 * 2. Clicking the toggle expands the sidebar (~260px); the in-sidebar
 *    collapse control then hides it again.
 * 3. The chosen state survives a reload (localStorage persistence).
 * 4. At/above the menu breakpoint (1440px) the sidebar is expanded by
 *    default.
 *
 * CC must run this spec (Aster) before release per the Pre-Release
 * Gate — the collapse behaviour is CSS/layout-driven and a component
 * test cannot observe the rendered width.
 */

import {test, expect, createBook, createChapter} from "../fixtures/base";
import type {Page} from "@playwright/test";

const NARROW = {width: 1024, height: 800};
const WIDE = {width: 1440, height: 900};

async function seedBook(title: string): Promise<string> {
    const book = await createBook(title);
    await createChapter(book.id, "Kapitel 1", "");
    await createChapter(book.id, "Kapitel 2", "");
    return book.id;
}

async function openEditor(page: Page, bookId: string) {
    await page.goto(`/book/${bookId}`);
    // Wait for the sidebar to mount, not to be visible: below the menu
    // breakpoint it renders collapsed (width 0), which Playwright reports as
    // hidden. The per-test width assertions cover the open/closed state.
    await expect(page.getByTestId("book-editor-sidebar")).toBeAttached();
}

async function sidebarWidth(page: Page): Promise<number> {
    const box = await page.getByTestId("book-editor-sidebar").boundingBox();
    return box ? box.width : -1;
}

test.describe("BookEditor sidebar collapse", () => {
    test("collapsed by default below the menu breakpoint", async ({page}) => {
        const bookId = await seedBook("Narrow Default");
        await page.setViewportSize(NARROW);
        await openEditor(page, bookId);

        expect(await sidebarWidth(page)).toBeLessThanOrEqual(1);
        await expect(
            page.getByTestId("book-editor-sidebar-toggle"),
        ).toBeVisible();
    });

    test("expanded by default at/above the menu breakpoint", async ({page}) => {
        const bookId = await seedBook("Wide Default");
        await page.setViewportSize(WIDE);
        await openEditor(page, bookId);

        expect(await sidebarWidth(page)).toBeGreaterThan(200);
    });

    test("toggle expands and the in-sidebar control collapses", async ({
        page,
    }) => {
        const bookId = await seedBook("Toggle Roundtrip");
        await page.setViewportSize(NARROW);
        await openEditor(page, bookId);

        await page.getByTestId("book-editor-sidebar-toggle").click();
        await expect
            .poll(() => sidebarWidth(page))
            .toBeGreaterThan(200);

        await page.getByTestId("chapter-sidebar-collapse").click();
        await expect.poll(() => sidebarWidth(page)).toBeLessThanOrEqual(1);
    });

    test("expanded state persists across reload", async ({page}) => {
        const bookId = await seedBook("Persist Open");
        await page.setViewportSize(NARROW);
        await openEditor(page, bookId);

        await page.getByTestId("book-editor-sidebar-toggle").click();
        await expect.poll(() => sidebarWidth(page)).toBeGreaterThan(200);

        await page.reload();
        await expect(page.getByTestId("book-editor-sidebar")).toBeVisible();
        expect(await sidebarWidth(page)).toBeGreaterThan(200);
    });
});
