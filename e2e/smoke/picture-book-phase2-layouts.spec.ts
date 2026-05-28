/**
 * Picture-Book Layout Expansion Phase 2 — smoke spec (C7,
 * 2026-05-28).
 *
 * Exercises the 4 new Phase 2 layouts end-to-end in a real
 * Chromium against the live dev backend:
 *   - two_images_text_center — multi-image (40 / 20 / 40 rows):
 *     PRIMARY top, centred Tier-Property text band, SECONDARY
 *     bottom. M1 storage.
 *   - split_horizontal — multi-image (50 / 50 cols, 75 / 25
 *     rows): two images side by side, Tier-Property caption
 *     row below.
 *   - split_vertical — multi-image (45 / 45 / 10 rows): two
 *     images stacked, thin Tier-Property caption strip below.
 *   - image_border_text_center — single-image: image fills
 *     the page as a decorative frame, centred semi-transparent
 *     text panel on top (Tier-Property).
 *
 * Every namespaced testid is exercised positively per the
 * "Testid namespace pinning prevents silent E2E skips" rule.
 *
 * The structural Vitest pins in PageCanvas.test.tsx +
 * LayoutPicker.test.tsx + LayoutConfig.test.tsx cover the
 * dispatcher contracts; this spec closes the "actually renders
 * in Chromium" gap that no Vitest can — including the secondary
 * image region's mount semantics on multi-image layouts and the
 * single-image discipline for image_border_text_center.
 */

import {test, expect, createPictureBook} from "../fixtures/base"

const API = "http://localhost:8000/api"

interface PageRow {
    id: string
    position: number
    layout: string
}

async function listPages(bookId: string): Promise<PageRow[]> {
    const res = await fetch(`${API}/books/${bookId}/pages`)
    if (!res.ok) throw new Error(`GET pages ${bookId}: ${res.status}`)
    return res.json()
}

test.describe("Picture-Book Phase 2 layouts (C7 smoke)", () => {
    test("LayoutPicker shows the new mehrere_bilder category + Phase 2 layout options", async ({
        page,
    }) => {
        const book = await createPictureBook("Phase 2 Layouts", "E2E Author")
        await page.goto(`/book/${book.id}`)
        await expect(page.getByTestId("page-editor-root")).toBeVisible()

        await page.getByTestId("page-editor-add-page").click()
        await expect(
            page.locator('[data-testid^="page-editor-page-row-"]'),
        ).toHaveCount(1)

        // Phase 1 category headers still visible.
        await expect(
            page.getByTestId("page-editor-layout-category-bild_mit_text"),
        ).toBeVisible()
        await expect(
            page.getByTestId("page-editor-layout-category-nur_bild"),
        ).toBeVisible()
        await expect(
            page.getByTestId("page-editor-layout-category-nur_text"),
        ).toBeVisible()
        await expect(
            page.getByTestId("page-editor-layout-category-spezial"),
        ).toBeVisible()

        // New Phase 2 category header.
        await expect(
            page.getByTestId("page-editor-layout-category-mehrere_bilder"),
        ).toBeVisible()

        // 4 new Phase 2 layout options each rendered + clickable.
        await expect(
            page.getByTestId(
                "page-editor-layout-option-two_images_text_center",
            ),
        ).toBeVisible()
        await expect(
            page.getByTestId("page-editor-layout-option-split_horizontal"),
        ).toBeVisible()
        await expect(
            page.getByTestId("page-editor-layout-option-split_vertical"),
        ).toBeVisible()
        await expect(
            page.getByTestId(
                "page-editor-layout-option-image_border_text_center",
            ),
        ).toBeVisible()
    })

    test("two_images_text_center: multi-image canvas renders both regions; LayoutConfig body mounts", async ({
        page,
    }) => {
        const book = await createPictureBook("Two Images Center", "E2E Author")
        await page.goto(`/book/${book.id}`)
        await page.getByTestId("page-editor-add-page").click()

        await page
            .getByTestId("page-editor-layout-option-two_images_text_center")
            .click()
        await expect(
            page.getByTestId(
                "page-editor-layout-option-two_images_text_center",
            ),
        ).toHaveAttribute("data-selected", "true")

        // LayoutConfig body mounts.
        await expect(
            page.getByTestId("layout-config-two-images-text-center"),
        ).toBeVisible()

        // Page canvas: BOTH image regions + text region render.
        await expect(
            page.getByTestId("page-canvas-image-area"),
        ).toBeVisible()
        await expect(
            page.getByTestId("page-canvas-image-area-secondary"),
        ).toBeVisible()
        await expect(
            page.getByTestId("page-canvas-region-text"),
        ).toBeVisible()

        // Secondary image placeholder + upload affordance visible
        // (no asset uploaded yet).
        await expect(
            page.getByTestId("page-canvas-image-secondary-placeholder"),
        ).toBeVisible()
        await expect(
            page.getByTestId("page-canvas-image-secondary-replace"),
        ).toBeVisible()

        // The page row's data-layout updates.
        const pages = await listPages(book.id)
        expect(pages[0].layout).toBe("two_images_text_center")
        await expect(
            page.getByTestId(`page-editor-page-row-${pages[0].id}`),
        ).toHaveAttribute("data-layout", "two_images_text_center")
    })

    test("split_horizontal: multi-image canvas renders both regions; LayoutConfig body mounts", async ({
        page,
    }) => {
        const book = await createPictureBook("Split Horizontal", "E2E Author")
        await page.goto(`/book/${book.id}`)
        await page.getByTestId("page-editor-add-page").click()

        await page
            .getByTestId("page-editor-layout-option-split_horizontal")
            .click()
        await expect(
            page.getByTestId("page-editor-layout-option-split_horizontal"),
        ).toHaveAttribute("data-selected", "true")

        await expect(
            page.getByTestId("layout-config-split-horizontal"),
        ).toBeVisible()
        await expect(
            page.getByTestId("page-canvas-image-area"),
        ).toBeVisible()
        await expect(
            page.getByTestId("page-canvas-image-area-secondary"),
        ).toBeVisible()
        await expect(
            page.getByTestId("page-canvas-region-text"),
        ).toBeVisible()

        const pages = await listPages(book.id)
        expect(pages[0].layout).toBe("split_horizontal")
    })

    test("split_vertical: multi-image canvas renders both regions; LayoutConfig body mounts", async ({
        page,
    }) => {
        const book = await createPictureBook("Split Vertical", "E2E Author")
        await page.goto(`/book/${book.id}`)
        await page.getByTestId("page-editor-add-page").click()

        await page
            .getByTestId("page-editor-layout-option-split_vertical")
            .click()
        await expect(
            page.getByTestId("page-editor-layout-option-split_vertical"),
        ).toHaveAttribute("data-selected", "true")

        await expect(
            page.getByTestId("layout-config-split-vertical"),
        ).toBeVisible()
        await expect(
            page.getByTestId("page-canvas-image-area"),
        ).toBeVisible()
        await expect(
            page.getByTestId("page-canvas-image-area-secondary"),
        ).toBeVisible()
        await expect(
            page.getByTestId("page-canvas-region-text"),
        ).toBeVisible()

        const pages = await listPages(book.id)
        expect(pages[0].layout).toBe("split_vertical")
    })

    test("image_border_text_center: SINGLE-image layout — no secondary region", async ({
        page,
    }) => {
        // Phase 2 C5 (2026-05-28): image_border_text_center is in
        // bild_mit_text NOT mehrere_bilder. The PRIMARY image fills
        // the page as a decorative frame; text panel sits on top.
        // Regression pin against accidentally including it in
        // MULTI_IMAGE_LAYOUTS — the secondary region MUST NOT mount.
        const book = await createPictureBook("Border Center", "E2E Author")
        await page.goto(`/book/${book.id}`)
        await page.getByTestId("page-editor-add-page").click()

        await page
            .getByTestId("page-editor-layout-option-image_border_text_center")
            .click()
        await expect(
            page.getByTestId(
                "page-editor-layout-option-image_border_text_center",
            ),
        ).toHaveAttribute("data-selected", "true")

        await expect(
            page.getByTestId("layout-config-image-border-text-center"),
        ).toBeVisible()

        // Primary image region + text region render.
        await expect(
            page.getByTestId("page-canvas-image-area"),
        ).toBeVisible()
        await expect(
            page.getByTestId("page-canvas-region-text"),
        ).toBeVisible()

        // SECONDARY image region MUST NOT render (single-image layout).
        await expect(
            page.getByTestId("page-canvas-image-area-secondary"),
        ).toHaveCount(0)
        await expect(
            page.getByTestId("page-canvas-image-secondary-placeholder"),
        ).toHaveCount(0)
    })
})
