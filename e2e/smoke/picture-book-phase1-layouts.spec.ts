/**
 * Picture-Book Layout Expansion Phase 1 — smoke spec (C6,
 * 2026-05-28).
 *
 * Exercises the 3 new single-image layouts end-to-end in a real
 * Chromium against the live dev backend:
 *   - image_bottom_text_top — mirror of image_top_text_bottom
 *     (rows swapped). Shares the parent's LayoutConfig body via
 *     the flipDirection prop (Q6 adjudication).
 *   - image_right_text_left — mirror of image_left_text_right
 *     (columns swapped). Same body-share pattern.
 *   - image_full_no_text — full-bleed image with NO text region
 *     (Q5: silent-ignore stored text_content).
 *
 * Every namespaced testid is exercised positively per the
 * "Testid namespace pinning prevents silent E2E skips" rule.
 *
 * The structural Vitest pins in PageCanvas.test.tsx +
 * LayoutPicker.test.tsx + LayoutConfig.test.tsx cover the
 * dispatcher contracts; this spec closes the "actually renders in
 * Chromium" gap that no Vitest can.
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

test.describe("Picture-Book Phase 1 layouts (C6 smoke)", () => {
    test("LayoutPicker shows 4 categories with the 3 new layouts in their slots", async ({
        page,
    }) => {
        const book = await createPictureBook("Phase 1 Layouts", "E2E Author")
        await page.goto(`/book/${book.id}`)
        await expect(page.getByTestId("page-editor-root")).toBeVisible()

        // Add one page so the LayoutPicker mounts.
        await page.getByTestId("page-editor-add-page").click()
        await expect(
            page.locator('[data-testid^="page-editor-page-row-"]'),
        ).toHaveCount(1)

        // 4 category headers visible.
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

        // The 3 new layout options each rendered + clickable.
        await expect(
            page.getByTestId("page-editor-layout-option-image_bottom_text_top"),
        ).toBeVisible()
        await expect(
            page.getByTestId("page-editor-layout-option-image_right_text_left"),
        ).toBeVisible()
        await expect(
            page.getByTestId("page-editor-layout-option-image_full_no_text"),
        ).toBeVisible()
    })

    test("image_bottom_text_top: pick layout, LayoutConfig body mounts, row updates", async ({
        page,
    }) => {
        const book = await createPictureBook("Bottom Text Top", "E2E Author")
        await page.goto(`/book/${book.id}`)
        await page.getByTestId("page-editor-add-page").click()

        await page
            .getByTestId("page-editor-layout-option-image_bottom_text_top")
            .click()
        await expect(
            page.getByTestId("page-editor-layout-option-image_bottom_text_top"),
        ).toHaveAttribute("data-selected", "true")

        // The mirror LayoutConfig body mounts (shared with the parent
        // via the flipDirection prop). Its dedicated testid pins the
        // dispatch path.
        await expect(
            page.getByTestId("layout-config-image-bottom-text-top"),
        ).toBeVisible()

        // The page row's data-layout updates.
        const pages = await listPages(book.id)
        expect(pages[0].layout).toBe("image_bottom_text_top")
        await expect(
            page.getByTestId(`page-editor-page-row-${pages[0].id}`),
        ).toHaveAttribute("data-layout", "image_bottom_text_top")
    })

    test("image_right_text_left: pick layout, mirror body mounts, row updates", async ({
        page,
    }) => {
        const book = await createPictureBook("Right Text Left", "E2E Author")
        await page.goto(`/book/${book.id}`)
        await page.getByTestId("page-editor-add-page").click()

        await page
            .getByTestId("page-editor-layout-option-image_right_text_left")
            .click()
        await expect(
            page.getByTestId("page-editor-layout-option-image_right_text_left"),
        ).toHaveAttribute("data-selected", "true")
        await expect(
            page.getByTestId("layout-config-image-right-text-left"),
        ).toBeVisible()

        const pages = await listPages(book.id)
        expect(pages[0].layout).toBe("image_right_text_left")
        await expect(
            page.getByTestId(`page-editor-page-row-${pages[0].id}`),
        ).toHaveAttribute("data-layout", "image_right_text_left")
    })

    test("image_full_no_text: text region suppressed in canvas (Q5 silent-ignore)", async ({
        page,
    }) => {
        const book = await createPictureBook("Full No Text", "E2E Author")
        await page.goto(`/book/${book.id}`)
        await page.getByTestId("page-editor-add-page").click()

        await page
            .getByTestId("page-editor-layout-option-image_full_no_text")
            .click()
        await expect(
            page.getByTestId("page-editor-layout-option-image_full_no_text"),
        ).toHaveAttribute("data-selected", "true")

        // The dedicated LayoutConfig body mounts.
        await expect(
            page.getByTestId("layout-config-image-full-no-text"),
        ).toBeVisible()

        // The page canvas suppresses the text region. The image
        // region still renders (this is an image-only layout).
        await expect(
            page.getByTestId("page-canvas-image-area"),
        ).toBeVisible()
        await expect(
            page.getByTestId("page-canvas-region-text"),
        ).toHaveCount(0)
        await expect(
            page.getByTestId("page-canvas-speech-bubble"),
        ).toHaveCount(0)
        await expect(
            page.getByTestId("page-canvas-text-input"),
        ).toHaveCount(0)
    })
})
