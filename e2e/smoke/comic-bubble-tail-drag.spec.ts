/**
 * Comic bubble tail drag-to-position smoke
 * (2026-05-27 audit close-out, tail-integration follow-up to the
 * bubble-drag work in commit 7b6977b).
 *
 * Adjudication settled: pointer events, 5px click-vs-drag
 * threshold, 8-direction snap, derive (direction, position_pct,
 * length_px) on drag-end from the new tip position, no schema
 * change. The tail-drag handle is visible only when the bubble is
 * selected.
 *
 * Spec walk:
 *   1. Create comic_book + page + panel + bubble.
 *   2. Click the bubble to select it.
 *   3. Assert the tail-drag handle appears.
 *   4. Drag the handle to a new position.
 *   5. Assert the bubble's tail field sliders reflect the new
 *      values (controlled-input two-way binding closes the loop).
 */

import {test, expect, createComicBook} from "../fixtures/base";

test.describe("Comic bubble tail drag-to-position", () => {
    test("tail handle appears on selection and drag updates side-pane sliders", async ({
        page,
    }) => {
        const book = await createComicBook(
            "Tail Drag Smoke",
            "E2E Author",
        );
        await page.goto(`/book/${book.id}`);

        await expect(page.getByTestId("comic-book-editor-root")).toBeVisible();
        await page.getByTestId("comic-book-editor-add-page").click();
        await page.getByTestId("comic-book-editor-add-panel").click();

        const panel = page
            .locator('[data-testid^="comic-panel-"]')
            .first();
        await panel.click();
        await page.getByTestId("comic-book-editor-add-bubble").click();

        // Bubble auto-selects after creation; the tail-handle should
        // be visible. Scope to the canvas grid to dodge the side-
        // pane testid-prefix overmatch trap.
        const handle = page
            .locator(
                '[data-testid^="comic-panel-"] [data-testid^="comic-bubble-tail-handle-"]',
            )
            .first();
        await expect(handle).toBeVisible();

        // Capture the current tail-length value (controlled-input
        // surface) before the drag.
        const lengthValue = page.getByTestId(
            "comic-bubble-tail-length-value",
        );
        await expect(lengthValue).toBeVisible();
        const beforeLengthText = await lengthValue.textContent();

        // Drag the handle ~30px in a diagonal direction. The
        // derivation should produce a non-default tail-length AND
        // (very likely) a non-default direction.
        const startBox = await handle.boundingBox();
        expect(startBox).not.toBeNull();
        const startX = startBox!.x + startBox!.width / 2;
        const startY = startBox!.y + startBox!.height / 2;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + 20, startY + 15, {steps: 4});
        await page.mouse.move(startX + 30, startY + 25, {steps: 4});
        await page.mouse.up();

        // Two-way binding: the controlled tail-length value should
        // have changed (since the drag changed the underlying field).
        await expect(async () => {
            const afterLengthText = await lengthValue.textContent();
            expect(afterLengthText).not.toBe(beforeLengthText);
        }).toPass({timeout: 2000});
    });

    test("short-drag (< 5px) does NOT commit tail changes", async ({
        page,
    }) => {
        const book = await createComicBook(
            "Tail Drag Threshold",
            "E2E Author",
        );
        await page.goto(`/book/${book.id}`);

        await page.getByTestId("comic-book-editor-add-page").click();
        await page.getByTestId("comic-book-editor-add-panel").click();
        await page
            .locator('[data-testid^="comic-panel-"]')
            .first()
            .click();
        await page.getByTestId("comic-book-editor-add-bubble").click();

        const handle = page
            .locator(
                '[data-testid^="comic-panel-"] [data-testid^="comic-bubble-tail-handle-"]',
            )
            .first();
        await expect(handle).toBeVisible();

        const lengthValue = page.getByTestId(
            "comic-bubble-tail-length-value",
        );
        const beforeLengthText = await lengthValue.textContent();

        const startBox = await handle.boundingBox();
        expect(startBox).not.toBeNull();
        const startX = startBox!.x + startBox!.width / 2;
        const startY = startBox!.y + startBox!.height / 2;

        // 2px movement — below the 5px threshold.
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + 2, startY + 1);
        await page.mouse.up();

        // Value should NOT have changed.
        await page.waitForTimeout(300);
        const afterLengthText = await lengthValue.textContent();
        expect(afterLengthText).toBe(beforeLengthText);
    });
});
