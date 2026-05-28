/**
 * Picture-Book Layout Expansion Phase 3 — collage smoke spec (C6,
 * 2026-05-28).
 *
 * Exercises the collage layout end-to-end in a real Chromium
 * against the live dev backend:
 *   - LayoutPicker exposes ``collage`` in the ``mehrere_bilder``
 *     category alongside the Phase 2 multi-image layouts.
 *   - Picking ``collage`` mounts CollageCanvas (empty state shows
 *     the empty-collage hint + the toolbar with Add image + Add
 *     text region buttons).
 *   - Adding a text region renders the new region at default
 *     coords; the textarea is editable.
 *   - The page row's data-layout reflects ``collage``.
 *
 * Image add via file upload is excluded — Playwright's file
 * upload + asset persistence chain is slow + flaky in CI; the
 * unit tests cover that path. This spec pins the structural
 * surface that no Vitest can: PageCanvas's dispatch actually
 * mounts CollageCanvas when the user picks ``collage`` from the
 * picker.
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

test.describe("Picture-Book Phase 3 collage (C6 smoke)", () => {
    test("collage layout appears in the mehrere_bilder category", async ({
        page,
    }) => {
        const book = await createPictureBook("Collage Layout", "E2E Author")
        await page.goto(`/book/${book.id}`)
        await expect(page.getByTestId("page-editor-root")).toBeVisible()
        await page.getByTestId("page-editor-add-page").click()
        await expect(
            page.locator('[data-testid^="page-editor-page-row-"]'),
        ).toHaveCount(1)

        // mehrere_bilder category header + collage layout option both
        // visible.
        await expect(
            page.getByTestId("page-editor-layout-category-mehrere_bilder"),
        ).toBeVisible()
        await expect(
            page.getByTestId("page-editor-layout-option-collage"),
        ).toBeVisible()
    })

    test("picking collage mounts CollageCanvas with empty hint + toolbar", async ({
        page,
    }) => {
        const book = await createPictureBook("Empty Collage", "E2E Author")
        await page.goto(`/book/${book.id}`)
        await page.getByTestId("page-editor-add-page").click()

        await page
            .getByTestId("page-editor-layout-option-collage")
            .click()
        await expect(
            page.getByTestId("page-editor-layout-option-collage"),
        ).toHaveAttribute("data-selected", "true")

        // CollageCanvas's empty-state hint is visible.
        await expect(
            page.getByTestId("collage-empty-hint"),
        ).toBeVisible()

        // Toolbar with the two add buttons.
        await expect(
            page.getByTestId("collage-toolbar"),
        ).toBeVisible()
        await expect(
            page.getByTestId("collage-add-image"),
        ).toBeVisible()
        await expect(
            page.getByTestId("collage-add-text-region"),
        ).toBeVisible()

        // The page row's data-layout updates.
        const pages = await listPages(book.id)
        expect(pages[0].layout).toBe("collage")
        await expect(
            page.getByTestId(`page-editor-page-row-${pages[0].id}`),
        ).toHaveAttribute("data-layout", "collage")
    })

    test("Add text region creates an editable region", async ({page}) => {
        const book = await createPictureBook("Text Region", "E2E Author")
        await page.goto(`/book/${book.id}`)
        await page.getByTestId("page-editor-add-page").click()
        await page
            .getByTestId("page-editor-layout-option-collage")
            .click()

        await page.getByTestId("collage-add-text-region").click()

        // A new text region wrapper + textarea mount. The id is
        // ``text-${timestamp}`` so we locate via the data-testid
        // prefix.
        const textRegion = page.locator(
            '[data-testid^="collage-text-region-text-"]',
        )
        await expect(textRegion).toHaveCount(1)
        const textareaLocator = page.locator(
            '[data-testid^="collage-text-region-input-text-"]',
        )
        await expect(textareaLocator).toBeVisible()
        await expect(textareaLocator).toBeEditable()
    })
})
