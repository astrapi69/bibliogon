/**
 * Settings > Backups — selective export smoke (#247).
 *
 * Pins the live-stack selective-export card on the Backups tab:
 * 1. The card + every group checkbox render (positive testid walk per
 *    the testid-namespace-pinning lessons-learned rule).
 * 2. The chapters-auto hint is gated on the books checkbox.
 * 3. "Alle auswählen" toggles every section, then the export button
 *    disables when the selection is cleared.
 * 4. Clicking the export button downloads a bibliogon-export-*.json file.
 *
 * Testid namespace: selective-export-*.
 */

import { test, expect } from "../fixtures/base";

test.describe("Settings > Backups — selective export (#247)", () => {
  test("renders the card and every section checkbox", async ({ page }) => {
    await page.goto("/settings?tab=backups");

    await expect(page.getByTestId("selective-export-section")).toBeVisible();
    for (const key of [
      "books",
      "articles",
      "authors",
      "chapterLabels",
      "storyBible",
      "writingSessions",
      "settings",
    ]) {
      await expect(
        page.getByTestId(`selective-export-item-${key}`),
      ).toBeVisible();
    }
    await expect(page.getByTestId("selective-export-button")).toBeVisible();
  });

  test("chapters-auto hint follows the books checkbox", async ({ page }) => {
    await page.goto("/settings?tab=backups");

    // Books defaults checked -> hint visible.
    await expect(
      page.getByTestId("selective-export-item-chapters"),
    ).toBeVisible();
    await page.getByTestId("selective-export-item-books").click();
    await expect(
      page.getByTestId("selective-export-item-chapters"),
    ).toHaveCount(0);
  });

  test("select-all toggles every section and gates the export button", async ({
    page,
  }) => {
    await page.goto("/settings?tab=backups");

    const selectAll = page.getByTestId("selective-export-select-all");
    await selectAll.click(); // select all
    await expect(
      page.getByTestId("selective-export-item-settings"),
    ).toBeChecked();
    await selectAll.click(); // deselect all
    await expect(
      page.getByTestId("selective-export-item-books"),
    ).not.toBeChecked();
    await expect(page.getByTestId("selective-export-button")).toBeDisabled();
    await expect(page.getByTestId("selective-export-empty-hint")).toBeVisible();
  });

  test("exports the selected sections as a JSON file", async ({ page }) => {
    await page.goto("/settings?tab=backups");

    await expect(page.getByTestId("selective-export-button")).toBeEnabled();
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("selective-export-button").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(
      /^bibliogon-export-\d{4}-\d{2}-\d{2}\.json$/,
    );
  });
});
