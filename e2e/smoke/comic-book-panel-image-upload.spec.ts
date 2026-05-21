/**
 * Comic-book panel-image upload + render + clear smoke
 * (PLUGIN-COMICS-PHASE-2-PANEL-CONFIG-01 C6).
 *
 * Closes the round-trip on Phase 2's Finding #1 (Panel-Image-
 * Upload) end-to-end: a user uploads an image inside the
 * LayoutConfigComicPanel side-pane, the editor renders it on the
 * panel (closing the assetUrls Half-Wired gap from C4), then the
 * image-clear button removes it.
 *
 * Cycle exercised:
 *   1. Create-First-Page → page nav appears
 *   2. Add Panel → panel count 0 → 1; auto-selects so the side-
 *      pane mounts LayoutConfigComicPanel
 *   3. side-pane: comic-panel-image-input present + no <img> on
 *      the panel yet
 *   4. setInputFiles → upload fires → handleUpdatePanel → assetUrls
 *      refresh → <img> renders inside the panel with non-zero
 *      bounding-box (per the "Playwright-visible ≠ User-visible"
 *      LL: visibility alone is not enough; assert real dimensions
 *      to catch a CSS-collapse class regression)
 *   5. image-clear button visible → click → <img> disappears
 *      from the panel
 *
 * The Vitest at LayoutConfigComicPanel.test.tsx covers the
 * frontend chain (file → api.assets.upload → onChange). The
 * ComicBookEditor.test.tsx covers handleUpdatePanel + refreshAssets
 * wiring. This Playwright closes the LAST mile: the actual
 * <img> render path through real backend asset serving.
 */

import {test, expect, createComicBook} from "../fixtures/base";

test.describe("Comic-book panel-image upload round-trip", () => {
    test("upload + render + clear closes Finding #1 end-to-end", async ({
        page,
    }) => {
        const book = await createComicBook("Panel Image Upload", "E2E Author");
        await page.goto(`/book/${book.id}`);

        // Step 1: Create first page.
        await expect(page.getByTestId("comic-book-editor-root")).toBeVisible();
        await page
            .getByTestId("comic-book-editor-create-first-page")
            .click();
        await expect(page.getByTestId("comic-book-editor-page-nav")).toBeVisible();

        // Step 2: Add panel. Auto-select fires so the side-pane
        // mounts LayoutConfigComicPanel.
        await page.getByTestId("comic-book-editor-add-panel").click();
        const panel = page.locator('[data-testid^="comic-panel-"]').first();
        await expect(panel).toBeVisible();
        await expect(
            page.getByTestId("layout-config-comic-panel"),
        ).toBeVisible();

        // Step 3: No <img> in the panel yet; the image input is
        // present and the clear button is hidden.
        await expect(panel.locator("img")).toHaveCount(0);
        const fileInput = page.getByTestId("comic-panel-image-input");
        await expect(fileInput).toBeAttached();
        await expect(
            page.getByTestId("comic-panel-image-clear"),
        ).toHaveCount(0);

        // Step 4: Upload a tiny PNG via setInputFiles. Playwright
        // sends the buffer through the multipart form path.
        // 1x1 transparent PNG (smallest valid PNG) so the test
        // doesn't depend on filesystem fixtures.
        const tinyPngBuffer = Buffer.from(
            "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4" +
                "890000000a49444154789c63000100000005000170d75e2e0000000049454e" +
                "44ae426082",
            "hex",
        );
        await fileInput.setInputFiles({
            name: "panel.png",
            mimeType: "image/png",
            buffer: tinyPngBuffer,
        });

        // After upload completes, the <img> mounts inside the
        // panel. The chain: upload -> onChange(image_asset_id) ->
        // handleUpdatePanel -> updatePanel + refreshPanelsAndBubbles
        // + refreshAssets -> ComicPanelGrid resolves the new
        // assetUrls[image_asset_id] -> <img> renders.
        const panelImage = panel.locator("img").first();
        await expect(panelImage).toBeVisible({timeout: 10000});

        // Per the "Playwright-visible ≠ User-visible" LL (filed
        // 2026-05-20): assert non-zero rendered dimensions. The
        // image must actually paint pixels, not collapse to a
        // 0-height strip. CSS for ComicPanel sets the inner img
        // to width/height: 100% with object-fit: cover, so the
        // bbox tracks the panel's rendered size.
        const bbox = await panelImage.boundingBox();
        expect(bbox).not.toBeNull();
        expect(bbox!.height).toBeGreaterThan(50);
        expect(bbox!.width).toBeGreaterThan(50);

        // Step 5: image-clear button visible after upload because
        // image_asset_id is set. Click clears the image_asset_id
        // back to null; the <img> disappears.
        const clearButton = page.getByTestId("comic-panel-image-clear");
        await expect(clearButton).toBeVisible();
        await clearButton.click();
        await expect(panel.locator("img")).toHaveCount(0);
        await expect(
            page.getByTestId("comic-panel-image-clear"),
        ).toHaveCount(0);
    });
});
