/**
 * Picture-Book Tier 1+2 sections smoke (PICTURE-BOOK-OVERLAY-TEXT-
 * TIER-PROPERTIES-01 + PICTURE-BOOK-TEXT-CONFIGURATION-01).
 *
 * Drives the Tier 1+2 (Visual Style + Typography) editor across
 * all 3 non-bubble image layouts: image_top_text_bottom,
 * image_left_text_right, image_full_text_overlay. Covers:
 *
 * - Open page with image_top_text_bottom layout
 * - Verify Tier1Section + Tier2Section testids render
 * - Open Tier 1 collapsible + set background_color via picker
 * - Verify the persisted ``layout_config.image_top_text_bottom.background_color``
 *   round-trips via api.pages GET
 * - Switch to image_left_text_right + image_full_text_overlay,
 *   verify the same Tier section testids render in each
 *   (namespaced prefixes: image-top-text-* / image-left-text-* /
 *   overlay-text-*)
 * - Layout-switch preservation pin: after editing image_top
 *   Tier, switch to image_left + back; verify image_top Tier
 *   config still persists in the namespace.
 *
 * Aster runs these specs; Claude Code writes them.
 */

import {test, expect, createPictureBook} from "../fixtures/base"

const API = "http://localhost:8000/api"

interface PageRow {
    id: string
    position: number
    layout: string
    layout_config: Record<string, unknown> | null
}

async function listPages(bookId: string): Promise<PageRow[]> {
    const res = await fetch(`${API}/books/${bookId}/pages`)
    if (!res.ok) throw new Error(`GET pages ${bookId}: ${res.status}`)
    return res.json()
}

async function createPage(
    bookId: string,
    layout: string = "image_top_text_bottom",
): Promise<PageRow> {
    const res = await fetch(`${API}/books/${bookId}/pages`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({layout}),
    })
    if (!res.ok) throw new Error(`POST page: ${res.status}`)
    return res.json()
}

test.describe("Picture-Book Tier 1+2 sections across image layouts", () => {
    test("Tier sections render under per-layout testid namespaces", async ({
        page,
    }) => {
        const book = await createPictureBook("Tier Sections Smoke", "E2E")
        await createPage(book.id, "image_top_text_bottom")
        await page.goto(`/book/${book.id}`)

        // PageEditor mounts the LayoutConfig dispatcher in the
        // properties pane; the active page is image_top_text_bottom
        // so the image-top-text Tier sections should be visible.
        await expect(
            page.getByTestId("layout-config-image-top-text-bottom"),
        ).toBeVisible()
        await expect(
            page.getByTestId("image-top-text-tier1-section"),
        ).toBeVisible()
        await expect(
            page.getByTestId("image-top-text-tier2-section"),
        ).toBeVisible()

        // Switch the page to image_left_text_right (behind the
        // "More layouts" disclosure per LayoutPicker's
        // DEFAULT_LAYOUTS + ADDITIONAL_LAYOUTS split).
        await page.getByTestId("page-editor-layout-more-toggle").click()
        await page
            .getByTestId("page-editor-layout-option-image_left_text_right")
            .click()
        await expect(
            page.getByTestId("layout-config-image-left-text-right"),
        ).toBeVisible()
        await expect(
            page.getByTestId("image-left-text-tier1-section"),
        ).toBeVisible()
        await expect(
            page.getByTestId("image-left-text-tier2-section"),
        ).toBeVisible()

        // Switch to image_full_text_overlay.
        await page
            .getByTestId("page-editor-layout-option-image_full_text_overlay")
            .click()
        await expect(
            page.getByTestId("layout-config-image-full-text-overlay"),
        ).toBeVisible()
        await expect(
            page.getByTestId("overlay-text-tier1-section"),
        ).toBeVisible()
        await expect(
            page.getByTestId("overlay-text-tier2-section"),
        ).toBeVisible()
    })

    test("editing image_top Tier 1 background_color round-trips through the namespace", async ({
        page,
    }) => {
        const book = await createPictureBook("Tier Round-Trip", "E2E")
        await createPage(book.id, "image_top_text_bottom")
        await page.goto(`/book/${book.id}`)

        await expect(
            page.getByTestId("image-top-text-tier1-section"),
        ).toBeVisible()
        // Open the Tier 1 collapsible.
        await page.getByTestId("image-top-text-tier1-trigger").click()
        const colorInput = page.getByTestId("image-top-text-background-color")
        await expect(colorInput).toBeVisible()
        // Native <input type="color"> doesn't accept .fill();
        // dispatch a change event with a hex value.
        await colorInput.evaluate((el, value) => {
            const input = el as HTMLInputElement
            input.value = value
            input.dispatchEvent(new Event("input", {bubbles: true}))
            input.dispatchEvent(new Event("change", {bubbles: true}))
        }, "#ffc857")

        // Wait for the debounced (300ms) save + Fix B namespace
        // wrap, then assert the row's layout_config carries the
        // value under the image_top_text_bottom namespace.
        await expect
            .poll(
                async () => {
                    const pages = await listPages(book.id)
                    const ns = pages[0].layout_config?.image_top_text_bottom
                    return (ns as Record<string, unknown>)?.background_color
                },
                {timeout: 5000},
            )
            .toBe("#ffc857")
    })

    test("Fix B preservation: switching to image_left and back keeps image_top Tier config", async ({
        page,
    }) => {
        const book = await createPictureBook("Tier Preservation", "E2E")
        const created = await createPage(book.id, "image_top_text_bottom")
        // Seed the image_top Tier config via API so the editor
        // starts from a known persisted state.
        await fetch(`${API}/books/${book.id}/pages/${created.id}`, {
            method: "PATCH",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                layout_config: {
                    image_top_text_bottom: {
                        image_position: "right",
                        image_fit: "cover",
                        background_color: "#7fb069",
                    },
                },
            }),
        })

        await page.goto(`/book/${book.id}`)
        await expect(
            page.getByTestId("layout-config-image-top-text-bottom"),
        ).toBeVisible()

        // Switch to image_left_text_right (behind More layouts).
        await page.getByTestId("page-editor-layout-more-toggle").click()
        await page
            .getByTestId("page-editor-layout-option-image_left_text_right")
            .click()
        await expect(
            page.getByTestId("layout-config-image-left-text-right"),
        ).toBeVisible()

        // Trigger a write on image_left so the namespace gets
        // materialised (image_fit dropdown is a discrete control
        // that fires onChange immediately).
        await page
            .getByTestId("image-left-image-fit")
            .selectOption("cover")

        // Wait for the write to land.
        await expect
            .poll(
                async () => {
                    const pages = await listPages(book.id)
                    return pages[0].layout_config?.image_left_text_right
                },
                {timeout: 5000},
            )
            .toBeTruthy()

        // After the write, the image_top namespace must STILL be
        // present (Fix B preservation contract). This is the
        // load-bearing assertion of the test.
        const pages = await listPages(book.id)
        const imageTopNs = pages[0].layout_config
            ?.image_top_text_bottom as Record<string, unknown>
        expect(imageTopNs).toBeTruthy()
        expect(imageTopNs.background_color).toBe("#7fb069")
        expect(imageTopNs.image_position).toBe("right")

        // Switch BACK to image_top_text_bottom — the Tier
        // sections re-render with the preserved namespace.
        await page
            .getByTestId("page-editor-layout-option-image_top_text_bottom")
            .click()
        await expect(
            page.getByTestId("layout-config-image-top-text-bottom"),
        ).toBeVisible()
        // background_color input echoes the preserved value
        // (visible after opening the Tier 1 collapsible).
        await page.getByTestId("image-top-text-tier1-trigger").click()
        await expect(
            page.getByTestId("image-top-text-background-color"),
        ).toHaveValue("#7fb069")
    })
})
