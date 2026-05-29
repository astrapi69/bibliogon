/**
 * Comic-book same-page panel drag-reorder smoke
 * (COMIC-PANEL-CROSS-PAGE-MOVE-01 Phase 1, 2026-05-29).
 *
 * Phase 1 ships a dnd-kit SortableContext around the panels in
 * ComicPanelGrid (rectSortingStrategy) with a per-panel GripVertical
 * drag handle. Dropping a panel calls the new bulk reorder endpoint
 * POST /api/books/{id}/comic-pages/{page_id}/panels/reorder, which
 * runs a two-phase position update in one transaction.
 *
 * dnd-kit drag is brittle under Vitest/happy-dom (per the
 * "Radix DropdownMenu + happy-dom" lessons-learned, which also
 * applies to @dnd-kit pointer simulation) — so the actual
 * drag-and-persist behaviour lives HERE in Playwright against a
 * real browser, while Vitest covers the reorderable-mode contract
 * (handles present, sortable wrappers, read-only fallback).
 *
 * Testid namespace (Phase 1 C2): comic-reorder-item-{id} +
 * comic-reorder-handle-{id}; the grid root carries
 * data-reorderable="true" in editor mode.
 */

import { test, expect, createComicBook } from "../fixtures/base";

async function addPanels(page: import("@playwright/test").Page, count: number) {
  for (let i = 0; i < count; i++) {
    await page.getByTestId("comic-book-editor-add-panel").click();
  }
}

test.describe("Comic-book same-page panel reorder smoke (Phase 1)", () => {
  test("each panel exposes a drag handle in the editor", async ({ page }) => {
    const book = await createComicBook("Panel Handles", "E2E Author");
    await page.goto(`/book/${book.id}`);
    await page.getByTestId("comic-book-editor-add-page").click();

    const picker = page.getByTestId("comic-grid-template-picker-select");
    await picker.selectOption("grid_2x2");
    await expect(picker).toHaveValue("grid_2x2");

    await addPanels(page, 3);

    // Editor grid is reorderable; each panel has a drag handle.
    await expect(page.getByTestId("comic-page-grid")).toHaveAttribute(
      "data-reorderable",
      "true",
    );
    await expect(
      page.locator('[data-testid^="comic-reorder-handle-"]'),
    ).toHaveCount(3);
    await expect(
      page.locator('[data-testid^="comic-reorder-item-"]'),
    ).toHaveCount(3);
  });

  test("dragging the first panel's handle to the last cell reorders + persists", async ({
    page,
  }) => {
    const book = await createComicBook("Panel Reorder", "E2E Author");
    await page.goto(`/book/${book.id}`);
    await page.getByTestId("comic-book-editor-add-page").click();

    const picker = page.getByTestId("comic-grid-template-picker-select");
    await picker.selectOption("grid_2x2");
    await expect(picker).toHaveValue("grid_2x2");

    await addPanels(page, 3);

    const sortables = page.locator('[data-testid^="comic-reorder-item-"]');
    await expect(sortables).toHaveCount(3);

    const idsBefore = await sortables.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-testid")),
    );
    const firstId = idsBefore[0];

    // Drag the first panel's handle onto the last panel's cell.
    const firstHandle = page
      .locator('[data-testid^="comic-reorder-handle-"]')
      .first();
    const lastSortable = sortables.last();
    const handleBox = await firstHandle.boundingBox();
    const targetBox = await lastSortable.boundingBox();
    expect(handleBox).not.toBeNull();
    expect(targetBox).not.toBeNull();

    const startX = handleBox!.x + handleBox!.width / 2;
    const startY = handleBox!.y + handleBox!.height / 2;
    const endX = targetBox!.x + targetBox!.width / 2;
    const endY = targetBox!.y + targetBox!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // Cross the 5px PointerSensor activation threshold first.
    await page.mouse.move(startX + 8, startY + 8, { steps: 5 });
    await page.mouse.move(endX, endY, { steps: 10 });
    await page.mouse.up();

    // The dragged panel is no longer first.
    await expect
      .poll(async () =>
        sortables.evaluateAll((els) =>
          els.map((el) => el.getAttribute("data-testid")),
        ),
      )
      .not.toEqual(idsBefore);

    // The new order persisted to the backend: reload and confirm
    // the dragged panel is not back at the front.
    await page.reload();
    await expect(sortables).toHaveCount(3);
    const idsAfterReload = await sortables.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-testid")),
    );
    expect(idsAfterReload[0]).not.toBe(firstId);
  });
});
