/**
 * Comic bubble drag-to-position smoke
 * (Settings-Completeness audit close-out, 2026-05-27).
 *
 * Adjudication settled: pointer events, 5px click-vs-drag threshold,
 * clamp anchor to keep the bubble fully inside its panel, local
 * draft state during drag + API commit on pointer-up, two-way
 * binding into the side-pane sliders.
 *
 * The spec walks the full UX path:
 *   1. Create a comic_book + first page + first panel + first bubble
 *   2. Pointer-drag the bubble across the panel
 *   3. Assert the side-pane anchor sliders reflect the new pct
 *      (closes the load-bearing controlled-input conversion)
 *   4. Assert the bubble's CSS left/top reflect the new pct
 *      (closes the API commit path)
 */

import {test, expect, createComicBook} from "../fixtures/base";

test.describe("Comic bubble drag-to-position", () => {
    test("pointer-drag updates anchor + sidebar sliders + bubble position", async ({
        page,
    }) => {
        const book = await createComicBook(
            "Bubble Drag Smoke",
            "E2E Author",
        );
        await page.goto(`/book/${book.id}`);

        await expect(page.getByTestId("comic-book-editor-root")).toBeVisible();
        await page.getByTestId("comic-book-editor-add-page").click();
        await page.getByTestId("comic-book-editor-add-panel").click();

        // Select panel so Add-Bubble enables (idempotent post-C2).
        const panel = page
            .locator('[data-testid^="comic-panel-"]')
            .first();
        await panel.click();
        await page.getByTestId("comic-book-editor-add-bubble").click();

        // Scope to the canvas grid (side-pane testids share the
        // ``comic-bubble-*`` prefix once auto-select mounts the
        // LayoutConfigComicBubble; documented overmatch trap).
        const bubble = page
            .locator(
                '[data-testid^="comic-panel-"] [data-testid^="comic-bubble-"]',
            )
            .first();
        await expect(bubble).toBeVisible();

        // Capture starting position + panel bounds for delta math.
        const startBox = await bubble.boundingBox();
        const panelBox = await panel.boundingBox();
        expect(startBox).not.toBeNull();
        expect(panelBox).not.toBeNull();

        // Drag the bubble ~80px right + 60px down. This is far above
        // the 5px threshold, so the pointer-up handler commits the
        // new anchor via api.comics.updateBubble.
        const startX = startBox!.x + startBox!.width / 2;
        const startY = startBox!.y + startBox!.height / 2;
        const endX = startX + 80;
        const endY = startY + 60;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        // Move in a few steps so the pointermove handler runs more
        // than once (mirrors a real drag).
        await page.mouse.move(startX + 20, startY + 15, {steps: 4});
        await page.mouse.move(endX, endY, {steps: 4});
        await page.mouse.up();

        // The bubble should have moved (left/top changed). Allow a
        // small tolerance for layout rounding.
        const endBox = await bubble.boundingBox();
        expect(endBox).not.toBeNull();
        const dx = Math.abs(endBox!.x - startBox!.x);
        const dy = Math.abs(endBox!.y - startBox!.y);
        expect(dx).toBeGreaterThan(20);
        expect(dy).toBeGreaterThan(15);

        // Two-way binding: the side-pane anchor sliders should now
        // reflect the new pct. They are controlled inputs reading
        // the bubble's anchor.x_pct / y_pct.
        const anchorXValue = page.getByTestId("comic-bubble-anchor-x-value");
        const anchorYValue = page.getByTestId("comic-bubble-anchor-y-value");
        await expect(anchorXValue).toBeVisible();
        await expect(anchorYValue).toBeVisible();
        // Expected anchor: ~20pct extra X, ~20pct extra Y (80/400 +
        // 60/300 against a roughly-square panel — exact pct depends
        // on the rendered panel size, so assert "changed" not exact).
        const xText = await anchorXValue.textContent();
        const yText = await anchorYValue.textContent();
        const xNum = parseInt((xText ?? "0").replace(/[^0-9-]/g, ""), 10);
        const yNum = parseInt((yText ?? "0").replace(/[^0-9-]/g, ""), 10);
        // Drag started at the initial anchor (~25 / ~25 for a fresh
        // bubble) and moved right+down — values must have grown.
        expect(xNum).toBeGreaterThan(25);
        expect(yNum).toBeGreaterThan(25);
    });

    test("short-drag (< 5px) is treated as a click, not a reposition", async ({
        page,
    }) => {
        const book = await createComicBook(
            "Short Drag Threshold",
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

        const bubble = page
            .locator(
                '[data-testid^="comic-panel-"] [data-testid^="comic-bubble-"]',
            )
            .first();
        await expect(bubble).toBeVisible();

        const startBox = await bubble.boundingBox();
        expect(startBox).not.toBeNull();
        const startX = startBox!.x + 10;
        const startY = startBox!.y + 10;

        // Mouse down + 2px movement + up. Below the 5px threshold,
        // so the pointer-up handler should call onClick (select)
        // rather than onDragEnd.
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + 2, startY + 1);
        await page.mouse.up();

        // Bubble stays at its starting position (no commit).
        const endBox = await bubble.boundingBox();
        expect(endBox).not.toBeNull();
        expect(Math.abs(endBox!.x - startBox!.x)).toBeLessThan(2);
        expect(Math.abs(endBox!.y - startBox!.y)).toBeLessThan(2);

        // Side-pane LayoutConfigComicBubble should be visible —
        // the click selected the bubble.
        await expect(
            page.getByTestId("layout-config-comic-bubble"),
        ).toBeVisible();
    });
});
