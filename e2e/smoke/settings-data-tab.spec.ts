/**
 * Settings > Daten — data-management hub smoke (#338).
 *
 * Pins the live-stack Daten tab (positive testid walk per the
 * testid-namespace-pinning lessons-learned rule):
 * 1. The sidebar tab + the section render; the tab is reachable via
 *    the ?tab=daten deep-link.
 * 2. Storage overview: the usage bar + the per-category breakdown
 *    render, and the usage bar has real height (not a CSS-collapsed
 *    strip — see "Playwright-visible != User-visible").
 * 3. "Alle Daten anzeigen" reveals the raw table list.
 * 4. Export / Import / Maintenance controls render.
 * 5. Full-backup export downloads a .bgb file (ZIP with image bytes, #341).
 *
 * Testid namespace: data-*.
 */

import { test, expect } from "../fixtures/base";

test.describe("Settings > Daten (#338)", () => {
  test("renders the data-management hub via the deep-link", async ({ page }) => {
    await page.goto("/settings?tab=daten");

    await expect(page.getByTestId("data-management-section")).toBeVisible();

    // Storage overview loads (loading -> stats).
    await expect(page.getByTestId("data-storage-overview")).toBeVisible();
    await expect(page.getByTestId("data-category-list")).toBeVisible();
    for (const key of [
      "books",
      "articles",
      "assets",
      "writing_sessions",
      "event_log",
    ]) {
      await expect(page.getByTestId(`data-category-${key}`)).toBeVisible();
    }

    // Usage bar renders with real height (collapse-class regression pin).
    const bar = page.getByTestId("data-usage-bar");
    await expect(bar).toBeVisible();
    const box = await bar.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThan(4);
  });

  test("reveals the raw table list via the debug toggle", async ({ page }) => {
    await page.goto("/settings?tab=daten");
    const toggle = page.getByTestId("data-show-all-toggle");
    await expect(toggle).toBeVisible();
    await expect(page.getByTestId("data-tables-list")).toHaveCount(0);
    await toggle.click();
    await expect(page.getByTestId("data-tables-list")).toBeVisible();
  });

  test("renders export, import, and maintenance controls", async ({ page }) => {
    await page.goto("/settings?tab=daten");
    for (const testid of [
      "data-export-full",
      "data-export-authors",
      "data-import-full",
      "data-import-authors",
      "data-medium-import-link",
      "data-clear-event-log",
      "data-clear-image-cache",
    ]) {
      await expect(page.getByTestId(testid)).toBeVisible();
    }
  });

  test("exports a full backup as a .bgb download", async ({ page }) => {
    // Full backup switched from imageless JSON to a .bgb ZIP that carries
    // image bytes (#341); the download filename follows.
    await page.goto("/settings?tab=daten");
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("data-export-full").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain(".bgb");
  });
});
