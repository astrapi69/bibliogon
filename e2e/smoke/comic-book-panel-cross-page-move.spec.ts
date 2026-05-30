/**
 * Comic-book cross-page panel move smoke
 * (COMIC-PANEL-CROSS-PAGE-MOVE-01 Phase 2, 2026-05-29).
 *
 * Phase 2 moves a panel to another page via the "Move to page"
 * action menu (the user-adjudicated alternative to drag-to-
 * thumbnail). The menu lists the book's OTHER pages with their
 * capacity ("Seite N - count/max Panels"); full pages are disabled
 * with a "(voll)" hint. Selecting a target PATCHes the panel's
 * page_id (+ append position) and re-normalises the source page.
 *
 * Two cases:
 * 1. move a panel from a grid_2x2 page to a not-full single_panel
 *    page -> source loses a panel, target gains it.
 * 2. a full target page (single_panel already holding its 1 panel)
 *    is disabled + flagged data-full in the menu.
 *
 * Panel roots are comic-panel-{id}; the reorder wrapper/handle use
 * the comic-reorder-* namespace, so [data-testid^="comic-panel-"]
 * (minus image/bubble) counts only the panels on the active page.
 */

import { test, expect, createComicBook } from "../fixtures/base";

const PANEL_SEL =
  '[data-testid^="comic-panel-"]:not([data-testid*="-image-"]):not([data-testid*="-bubble-"])';

test.describe("Comic-book cross-page panel move smoke (Phase 2)", () => {
  test("moves a panel to another page; both pages' counts update", async ({
    page,
  }) => {
    const book = await createComicBook("Cross-Page Move", "E2E Author");
    await page.goto(`/book/${book.id}`);

    // Page 1: grid_2x2 with 2 panels.
    await page.getByTestId("comic-book-editor-add-page").click();
    const picker = page.getByTestId("comic-grid-template-picker-trigger");
    await picker.click();
    await page.getByTestId("comic-grid-template-picker-item-grid_2x2").click();
    await page.getByTestId("comic-book-editor-add-panel").click();
    await page.getByTestId("comic-book-editor-add-panel").click();

    // Page 2: created next, becomes active (single_panel, empty).
    await page.getByTestId("comic-book-editor-add-page").click();

    const rows = page.locator('[data-testid^="comic-book-editor-page-row-"]');
    await expect(rows).toHaveCount(2);

    // Back to page 1, select its first panel.
    await rows.nth(0).click();
    const panels = page.locator(PANEL_SEL);
    await expect(panels).toHaveCount(2);
    await panels.first().click();

    // Open the move menu; page 2 (0/1) is a valid target.
    await page.getByTestId("comic-book-editor-move-panel").click();
    await expect(
      page.getByTestId("comic-book-editor-move-panel-menu"),
    ).toBeVisible();
    const target = page
      .locator('[data-testid^="comic-book-editor-move-panel-target-"]')
      .first();
    await expect(target).toBeEnabled();
    await target.click();

    // Source page 1 now holds 1 panel.
    await expect(panels).toHaveCount(1);

    // Target page 2 now holds the moved panel.
    await rows.nth(1).click();
    await expect(page.locator(PANEL_SEL)).toHaveCount(1);
  });

  test("disables a full target page in the move menu", async ({ page }) => {
    const book = await createComicBook("Full Target", "E2E Author");
    await page.goto(`/book/${book.id}`);

    // Page 1: grid_2x2 with 1 panel.
    await page.getByTestId("comic-book-editor-add-page").click();
    const picker = page.getByTestId("comic-grid-template-picker-trigger");
    await picker.click();
    await page.getByTestId("comic-grid-template-picker-item-grid_2x2").click();
    await page.getByTestId("comic-book-editor-add-panel").click();

    // Page 2: single_panel, fill it to capacity (1/1 -> full).
    await page.getByTestId("comic-book-editor-add-page").click();
    await page.getByTestId("comic-book-editor-add-panel").click();

    // Back to page 1, select its panel, open the move menu.
    const rows = page.locator('[data-testid^="comic-book-editor-page-row-"]');
    await rows.nth(0).click();
    await page.locator(PANEL_SEL).first().click();
    await page.getByTestId("comic-book-editor-move-panel").click();

    const target = page
      .locator('[data-testid^="comic-book-editor-move-panel-target-"]')
      .first();
    await expect(target).toBeDisabled();
    await expect(target).toHaveAttribute("data-full", "true");
  });
});
