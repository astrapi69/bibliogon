/**
 * Comic-book per-panel canvas upload smoke
 * (COMIC-PANEL-CANVAS-UPLOAD).
 *
 * Pins the in-canvas per-panel image upload that works independently
 * of the right sidebar: each panel carries its own upload affordance
 * (``comic-panel-upload-{id}`` button + ``comic-panel-upload-input-{id}``
 * file input), distinct from the sidebar's ``comic-panel-image-input``.
 * This lets a user (especially on mobile, with the side-pane collapsed)
 * set a panel image directly on the canvas.
 *
 * Cycle:
 *   1. Create comic + first page + a panel.
 *   2. Collapse the right side-pane so the sidebar upload is hidden.
 *   3. The empty panel shows its canvas upload affordance.
 *   4. setInputFiles on the panel's canvas input -> the image renders
 *      inside the panel at non-zero dimensions (per "Playwright-visible
 *      != User-visible": assert real bbox, not just visibility).
 *   5. The replace affordance persists on the now-filled panel.
 *
 * The sidebar upload round-trip is covered separately by
 * comic-book-panel-image-upload.spec.ts; this spec proves the
 * canvas path works with the sidebar out of the way.
 */

import {test, expect, createComicBook} from "../fixtures/base";

test.describe("Comic-book per-panel canvas upload", () => {
    test("uploads a panel image from the canvas with the sidebar collapsed", async ({
        page,
    }) => {
        const book = await createComicBook("Canvas Panel Upload", "E2E Author");
        await page.goto(`/book/${book.id}`);

        await expect(page.getByTestId("comic-book-editor-root")).toBeVisible();
        await page.getByTestId("comic-book-editor-add-page").click();
        await expect(
            page.getByTestId("comic-book-editor-page-list"),
        ).toBeVisible();

        await page.getByTestId("comic-book-editor-add-panel").click();
        const panel = page.locator('[data-testid^="comic-panel-"]').first();
        await expect(panel).toBeVisible();

        // Collapse the right side-pane (where the sidebar upload lives)
        // if it is open, so the only available upload path is the canvas.
        const collapse = page.getByTestId("comic-book-editor-side-pane-collapse");
        if (await collapse.isVisible().catch(() => false)) {
            await collapse.click();
        }
        await expect(
            page.getByTestId("comic-book-editor-side-pane-wrapper"),
        ).toHaveAttribute("data-sidebar-open", "false");

        // The empty panel shows its in-canvas upload affordance + input.
        const uploadButton = page
            .locator(
                '[data-testid^="comic-panel-upload-"]:not([data-testid*="-input-"])',
            )
            .first();
        await expect(uploadButton).toBeVisible();
        const uploadInput = page
            .locator('[data-testid^="comic-panel-upload-input-"]')
            .first();
        await expect(uploadInput).toBeAttached();
        await expect(panel.locator("img")).toHaveCount(0);

        // 1x1 transparent PNG (smallest valid PNG), no fixture dependency.
        const tinyPngBuffer = Buffer.from(
            "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4" +
                "890000000a49444154789c63000100000005000170d75e2e0000000049454e" +
                "44ae426082",
            "hex",
        );
        await uploadInput.setInputFiles({
            name: "panel.png",
            mimeType: "image/png",
            buffer: tinyPngBuffer,
        });

        const panelImage = panel.locator("img").first();
        await expect(panelImage).toBeVisible({timeout: 10000});
        const bbox = await panelImage.boundingBox();
        expect(bbox).not.toBeNull();
        expect(bbox!.height).toBeGreaterThan(50);
        expect(bbox!.width).toBeGreaterThan(50);

        // The filled panel keeps a (replace) upload affordance on the canvas.
        await expect(
            page
                .locator(
                    '[data-testid^="comic-panel-upload-"]:not([data-testid*="-input-"])',
                )
                .first(),
        ).toBeAttached();
    });
});
