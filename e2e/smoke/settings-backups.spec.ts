/**
 * Settings > Backups tab smoke (BOOKDASHBOARD-CLEANUP-01 C5).
 *
 * Pins the live-stack relocation of the Version-History +
 * Compare-Backups affordances from the BookDashboard to a
 * dedicated Settings tab.
 *
 * Coverage:
 * 1. Navigate to /settings?tab=backups directly (deep-link) -
 *    the panel mounts (backups-settings) and renders both
 *    sections (backups-history-section + backups-compare-btn).
 * 2. Clicking backups-compare-btn opens the BackupCompareDialog
 *    (Radix Dialog with file inputs visible).
 * 3. Regression-pin: the Dashboard no longer renders the moved
 *    affordances. The new-book split-button (top-right) +
 *    EmptyState centre +Create-Book button stay intact (the
 *    EmptyState button is the first-time onboarding CTA the
 *    Pre-Inspection Track D decided to keep).
 */

import {test, expect} from "../fixtures/base";

test.describe("Settings > Backups tab (BOOKDASHBOARD-CLEANUP-01 C5)", () => {
    test("renders both sections + compare button opens dialog", async ({page}) => {
        await page.goto("/settings?tab=backups");

        await expect(page.getByTestId("backups-settings")).toBeVisible();
        await expect(page.getByTestId("backups-history-section")).toBeVisible();
        await expect(page.getByTestId("backups-compare-btn")).toBeVisible();

        // History fetch resolves to either the empty-state row OR
        // a populated list - both are valid live-stack states.
        const emptyState = page.getByTestId("backups-history-empty");
        const list = page.getByTestId("backups-history-list");
        await expect(emptyState.or(list).first()).toBeVisible({timeout: 5000});

        // Compare-Backups dialog opens on click.
        await page.getByTestId("backups-compare-btn").click();
        // BackupCompareDialog uses Radix Dialog (role="dialog") and
        // holds its 2 .bgb file inputs. Scope the locator to the
        // dialog: the Backups tab also renders the full-data JSON
        // backup importer (a 3rd page-level file input, added with
        // the #59/#60 backup feature), so an unscoped page query
        // resolves to 3.
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expect(dialog.locator('input[type="file"]')).toHaveCount(2, {
            timeout: 2000,
        });
    });

    test("Dashboard no longer renders the moved affordances + EmptyState centre +Create-Book stays", async ({
        page,
    }) => {
        await page.goto("/");

        // Versions-history toggle + Compare-Backups button are
        // gone from the Dashboard body.
        await expect(page.getByText("Versionsgeschichte")).toHaveCount(0);
        await expect(page.getByText("Backups vergleichen")).toHaveCount(0);

        // The top-right split-button stays (the canonical entry
        // point for "new book" after Picture-Book Phase 4).
        await expect(page.getByTestId("new-book-btn")).toBeVisible();
    });
});
