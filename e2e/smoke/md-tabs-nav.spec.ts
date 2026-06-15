/**
 * BookMetadataEditor section-navigation smoke
 * (MD-TABS-SETTINGS-NAV).
 *
 * The Radix Tabs bar was replaced with the responsive
 * sidebar+hamburger pattern (NavigationSidebar, shared with the
 * Settings menu). This spec exercises both surfaces:
 *
 *  - Desktop: the sidebar item switches the visible section, and
 *    the active item carries aria-current="page".
 *  - Mobile (narrow viewport): the hamburger trigger is visible and
 *    its popover switches sections on select.
 *
 * For Aster to run. Uses data-testid selectors only (the per-tab
 * ``metadata-tab-*`` testids are preserved verbatim from the old
 * Radix triggers; the mobile items carry a ``-mobile`` suffix).
 */

import { test, expect, createBook } from "../fixtures/base";

test.describe("BookMetadataEditor section nav (MD-TABS-SETTINGS-NAV)", () => {
    test("desktop sidebar switches sections + marks active item", async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        const book = await createBook("MD Tabs Nav Desktop", "E2E Author");
        await page.goto(`/book/${book.id}?view=metadata`);

        // General is active by default: subtitle field is visible.
        const general = page.getByTestId("metadata-tab-general");
        await expect(general).toBeVisible({ timeout: 10000 });
        await expect(general).toHaveAttribute("aria-current", "page");

        // Switch to ISBN: its content mounts, General's leaves.
        const isbn = page.getByTestId("metadata-tab-isbn");
        await isbn.click();
        await expect(isbn).toHaveAttribute("aria-current", "page");
        await expect(general).not.toHaveAttribute("aria-current", "page");
        await expect(page.getByText("ISBN E-Book")).toBeVisible();
    });

    test("mobile hamburger is visible + switches sections", async ({ page }) => {
        await page.setViewportSize({ width: 600, height: 900 });
        const book = await createBook("MD Tabs Nav Mobile", "E2E Author");
        await page.goto(`/book/${book.id}?view=metadata`);

        // The desktop sidebar is hidden < md; the hamburger trigger
        // is the navigation affordance.
        const trigger = page.getByTestId("navigation-sidebar-mobile-trigger");
        await expect(trigger).toBeVisible({ timeout: 10000 });

        // Open the popover and pick the Design section.
        await trigger.click();
        const designItem = page.getByTestId("metadata-tab-design-mobile");
        await expect(designItem).toBeVisible();
        await designItem.click();

        // Design content mounts (cover upload affordance is unique to it).
        await expect(page.getByTestId("metadata-tab-design")).toHaveAttribute(
            "aria-current",
            "page",
        );
    });
});
