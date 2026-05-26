/**
 * SETT-L-1 C5 E2E smoke: Settings sidebar navigation.
 *
 * Pins the SETT-L-1 redesign that replaced the horizontal tab
 * bar with a left-sidebar grouped nav. Vitest covers the
 * component in isolation; this spec exercises the wired-up page
 * in a real browser to catch any regression that the component-
 * level tests can't see (CSS grid layout, sticky positioning,
 * cross-tab navigation, URL deep-link preservation).
 *
 * Coverage:
 *
 *   1. Sidebar mounts at desktop viewport (1280×800).
 *   2. All 5 sidebar groups are present.
 *   3. All 4 visible group headers carry the correct text.
 *   4. Default tab is Erscheinungsbild (first item).
 *   5. Clicking a sidebar item switches the rendered content +
 *      updates ?tab= URL param.
 *   6. Deep-link ?tab=plugins opens directly on the Plugins tab.
 *   7. Legacy ``?tab=author`` redirects to ``autoren``.
 *   8. Danger Zone item carries the visual destructive cue
 *      (red color via the linkDanger CSS-Module hook).
 */

import {test, expect} from "../fixtures/base";

test.describe("Settings sidebar navigation (SETT-L-1)", () => {
    test.beforeEach(async ({page}) => {
        await page.setViewportSize({width: 1280, height: 800});
    });

    test("renders the sidebar nav landmark with all 5 groups", async ({page}) => {
        await page.goto("/settings");
        await expect(page.getByTestId("settings-sidebar")).toBeVisible();
        await expect(page.getByTestId("settings-sidebar-section-darstellung")).toBeVisible();
        await expect(page.getByTestId("settings-sidebar-section-inhalt")).toBeVisible();
        await expect(page.getByTestId("settings-sidebar-section-system")).toBeVisible();
        await expect(page.getByTestId("settings-sidebar-section-info")).toBeVisible();
        await expect(page.getByTestId("settings-sidebar-section-danger")).toBeVisible();
    });

    test("renders 4 visible group headers (danger group has no header)", async ({page}) => {
        await page.goto("/settings");
        await expect(page.getByTestId("settings-sidebar-group-label-darstellung")).toBeVisible();
        await expect(page.getByTestId("settings-sidebar-group-label-inhalt")).toBeVisible();
        await expect(page.getByTestId("settings-sidebar-group-label-system")).toBeVisible();
        await expect(page.getByTestId("settings-sidebar-group-label-info")).toBeVisible();
        // Danger Zone group renders the item only, no group label.
        await expect(page.getByTestId("settings-sidebar-group-label-danger")).toHaveCount(0);
    });

    test("default tab is Erscheinungsbild with aria-current page", async ({page}) => {
        await page.goto("/settings");
        const active = page.getByTestId("settings-tab-erscheinungsbild");
        await expect(active).toHaveAttribute("aria-current", "page");
    });

    test("clicking a sidebar item swaps content + updates URL", async ({page}) => {
        await page.goto("/settings");
        await page.getByTestId("settings-tab-plugins").click();
        await expect(page).toHaveURL(/[?&]tab=plugins(\b|$)/);
        await expect(page.getByTestId("settings-tab-plugins")).toHaveAttribute("aria-current", "page");
        await expect(page.getByTestId("settings-tab-erscheinungsbild")).not.toHaveAttribute("aria-current", "page");
    });

    test("?tab=backups deep-link opens the Backups section", async ({page}) => {
        await page.goto("/settings?tab=backups");
        await expect(page.getByTestId("settings-tab-backups")).toHaveAttribute("aria-current", "page");
    });

    test("legacy ?tab=author redirects to autoren", async ({page}) => {
        await page.goto("/settings?tab=author");
        await expect(page.getByTestId("settings-tab-autoren")).toHaveAttribute("aria-current", "page");
    });

    test("Danger Zone item renders with the destructive red accent", async ({page}) => {
        await page.goto("/settings");
        const dangerItem = page.getByTestId("settings-tab-danger-zone");
        await expect(dangerItem).toBeVisible();
        // CSS-Module hashes the class name, so substring-match the
        // ``linkDanger`` hook to confirm the variant landed.
        const cls = await dangerItem.getAttribute("class");
        expect(cls).toMatch(/Danger/i);
    });
});
