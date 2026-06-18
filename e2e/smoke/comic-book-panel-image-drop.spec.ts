/**
 * Comic-book panel image drag-and-drop smoke (#437).
 *
 * Pins the new HTML5 drag-and-drop path: dragging an image file onto
 * a panel sets the panel image (same upload + persist path as the
 * button-based upload, just triggered by a native file drop).
 *
 * Cycle exercised:
 *   1. Create-First-Page -> page nav appears
 *   2. Add Panel -> panel count 0 -> 1
 *   3. dragenter over the panel drop-zone -> the drag-over overlay
 *      appears (visual feedback)
 *   4. drop a tiny PNG via a synthesized DataTransfer -> onUploadImage
 *      -> assets.upload -> updatePanel(image_asset_id) -> assetUrls
 *      refresh -> <img> renders inside the panel
 *   5. Per "Playwright-visible != User-visible" LL: assert the
 *      rendered <img> has non-zero dimensions (not a 0-height strip).
 *
 * The ImageDropZone.test.tsx + ComicPanel.test.tsx cover the
 * drag/drop event handling + mime-filter + first-file logic in
 * isolation. This Playwright closes the last mile through the real
 * backend asset-serving path.
 */

import {test, expect, createComicBook} from "../fixtures/base";

// 1x1 transparent PNG (smallest valid PNG), hex-encoded so the spec
// needs no filesystem fixture.
const TINY_PNG_HEX =
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4" +
    "890000000a49444154789c63000100000005000170d75e2e0000000049454e" +
    "44ae426082";

test.describe("Comic-book panel image drag-and-drop", () => {
    test("dropping an image onto a panel sets the panel image", async ({
        page,
    }) => {
        const book = await createComicBook("Panel Image Drop", "E2E Author");
        await page.goto(`/book/${book.id}`);

        await expect(page.getByTestId("comic-book-editor-root")).toBeVisible();
        await page.getByTestId("comic-book-editor-add-page").click();
        await expect(
            page.getByTestId("comic-book-editor-page-list"),
        ).toBeVisible();

        await page.getByTestId("comic-book-editor-add-panel").click();
        const dropZone = page
            .locator('[data-testid^="comic-drop-zone-"]')
            .first();
        await expect(dropZone).toBeVisible();
        await expect(dropZone.locator("img")).toHaveCount(0);

        // Build a real DataTransfer carrying the PNG file. Adding a
        // File via items.add makes dataTransfer.types include "Files",
        // which the drop-zone's hasFiles() guard checks.
        const dataTransfer = await page.evaluateHandle((hex) => {
            const bytes = new Uint8Array(
                (hex.match(/.{2}/g) ?? []).map((h) => parseInt(h, 16)),
            );
            const file = new File([bytes], "dropped.png", {type: "image/png"});
            const dt = new DataTransfer();
            dt.items.add(file);
            return dt;
        }, TINY_PNG_HEX);

        // Step 3: dragenter surfaces the visual overlay.
        await dropZone.dispatchEvent("dragenter", {dataTransfer});
        await expect(
            page
                .locator(
                    '[data-testid^="comic-drop-zone-"][data-testid$="-overlay"]',
                )
                .first(),
        ).toBeVisible();

        // Step 4: drop. The upload + persist chain renders the <img>.
        await dropZone.dispatchEvent("drop", {dataTransfer});

        const panelImage = dropZone.locator("img").first();
        await expect(panelImage).toBeVisible({timeout: 10000});

        // Step 5: assert real rendered dimensions, not just presence.
        const bbox = await panelImage.boundingBox();
        expect(bbox).not.toBeNull();
        expect(bbox!.height).toBeGreaterThan(50);
        expect(bbox!.width).toBeGreaterThan(50);
    });
});
