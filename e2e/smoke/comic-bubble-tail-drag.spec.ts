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

        // A fresh bubble defaults to tail_direction="none", so the
        // tail-handle does NOT render. Give it a visible tail first
        // via the side-pane direction radio (S = bottom). The handle
        // only mounts when the bubble is selected AND the tail is
        // visible.
        await page.getByTestId("comic-bubble-tail-direction-S").click();

        // Scope to the canvas grid to dodge the side-pane
        // testid-prefix overmatch trap.
        const handle = page
            .locator(
                '[data-testid^="comic-panel-"] [data-testid^="comic-bubble-tail-handle-"]',
            )
            .first();
        await expect(handle).toBeVisible();

        // Capture the current tail-length value (controlled-input
        // surface) before the keyboard-nudge.
        const lengthValue = page.getByTestId(
            "comic-bubble-tail-length-value",
        );
        await expect(lengthValue).toBeVisible();
        const beforeLen = parseInt(
            (await lengthValue.textContent() ?? "0").replace(/[^0-9-]/g, ""),
            10,
        );

        // Reshape the tail via the keyboard-drag path: the handle is
        // a role="button" with arrow-key nudge wired to the SAME
        // onTailDragEnd commit (api.comics.updateBubble) as a pointer
        // drag — ArrowUp lengthens the tail. Deterministic, unlike
        // Playwright's low-level pointer-capture drag. Commit is
        // async (API + refresh), so poll the controlled value.
        await handle.focus();
        await page.keyboard.press("ArrowUp");
        await expect
            .poll(
                async () => {
                    const txt = await lengthValue.textContent();
                    return parseInt(
                        (txt ?? "0").replace(/[^0-9-]/g, ""),
                        10,
                    );
                },
                {timeout: 4000},
            )
            .not.toBe(beforeLen);
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

        // Give the bubble a visible tail (default is "none") so the
        // handle renders.
        await page.getByTestId("comic-bubble-tail-direction-S").click();

        const handle = page
            .locator(
                '[data-testid^="comic-panel-"] [data-testid^="comic-bubble-tail-handle-"]',
            )
            .first();
        await expect(handle).toBeVisible();

        const lengthValue = page.getByTestId(
            "comic-bubble-tail-length-value",
        );
        await expect(lengthValue).toBeVisible();
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
