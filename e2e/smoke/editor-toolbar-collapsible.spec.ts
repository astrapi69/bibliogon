/**
 * Smoke test for the collapsible mobile editor toolbar (#432).
 *
 * On narrow viewports the prose toolbar (Editor.tsx -> Toolbar.tsx, used by the
 * book + article editors) collapses to a single row with a toggle; on desktop
 * it is always fully expanded with no toggle. The collapse is a CSS max-height
 * clip that Vitest/happy-dom cannot measure, so the visual behaviour lives here.
 *
 * Per the "Playwright-visible != User-visible" rule the height assertions use
 * boundingBox(), not just toBeVisible(): a CSS-collapsed strip would still pass
 * toBeVisible().
 *
 * Testid namespace: collapsible-toolbar / toolbar-collapse-toggle.
 */
import { test, expect, createBook, createChapter } from "../fixtures/base";

test.describe("Collapsible editor toolbar (mobile)", () => {
    test("375px: toolbar starts collapsed to one row with a toggle", async ({ page }) => {
        const book = await createBook("Toolbar Collapse E2E");
        await createChapter(book.id, "Opening", "Alice walked into the woods.");

        await page.setViewportSize({ width: 375, height: 720 });
        await page.goto(`/book/${book.id}`);
        // The single chapter auto-loads; at 375px the sidebar collapses to an
        // icon rail so its chapter-item is off-screen (and the content-loading
        // overlay would intercept it anyway). Wait for the editor to be ready
        // rather than clicking the off-screen sidebar row.
        await expect(page.locator(".ProseMirror")).toBeVisible();

        const shell = page.getByTestId("collapsible-toolbar").first();
        await expect(shell).toBeVisible();
        await expect(shell).toHaveAttribute("data-expanded", "false");

        const toggle = page.getByTestId("toolbar-collapse-toggle").first();
        await expect(toggle).toBeVisible();

        // Collapsed: the clipped toolbar is about one row tall (not the ~5 rows
        // it would wrap to at 375px). Assert the measured height, not just
        // visibility, so a non-collapsed multi-row strip fails here.
        const collapsedBox = await shell.boundingBox();
        expect(collapsedBox).not.toBeNull();
        expect(collapsedBox!.height).toBeLessThan(160);
    });

    test("375px: the toggle expands the toolbar to its full height", async ({ page }) => {
        const book = await createBook("Toolbar Expand E2E");
        await createChapter(book.id, "Opening", "Bob opened the door.");

        await page.setViewportSize({ width: 375, height: 720 });
        await page.goto(`/book/${book.id}`);
        // The single chapter auto-loads; at 375px the sidebar collapses to an
        // icon rail so its chapter-item is off-screen (and the content-loading
        // overlay would intercept it anyway). Wait for the editor to be ready
        // rather than clicking the off-screen sidebar row.
        await expect(page.locator(".ProseMirror")).toBeVisible();

        const shell = page.getByTestId("collapsible-toolbar").first();
        // Measure the collapsed height only once the collapse has settled
        // (it is a CSS max-height transition; a too-early read captures a
        // taller mid-transition frame).
        await expect(shell).toHaveAttribute("data-expanded", "false");
        const collapsedBox = await shell.boundingBox();

        await page.getByTestId("toolbar-collapse-toggle").first().click();
        await expect(shell).toHaveAttribute("data-expanded", "true");

        // Expanded is taller than collapsed (the wrapped rows are revealed).
        // Poll the height until the expand transition settles taller, rather
        // than reading a single mid-transition frame.
        await expect
            .poll(async () => (await shell.boundingBox())!.height)
            .toBeGreaterThan(collapsedBox!.height + 30);
    });

    test("1920px: desktop is always expanded with no toggle", async ({ page }) => {
        const book = await createBook("Toolbar Desktop E2E");
        await createChapter(book.id, "Opening", "Carol read the map.");

        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.goto(`/book/${book.id}`);
        // The single chapter auto-loads; at 375px the sidebar collapses to an
        // icon rail so its chapter-item is off-screen (and the content-loading
        // overlay would intercept it anyway). Wait for the editor to be ready
        // rather than clicking the off-screen sidebar row.
        await expect(page.locator(".ProseMirror")).toBeVisible();

        const shell = page.getByTestId("collapsible-toolbar").first();
        await expect(shell).toBeVisible();
        await expect(shell).toHaveAttribute("data-expanded", "true");
        await expect(page.getByTestId("toolbar-collapse-toggle")).toHaveCount(0);
    });
});
