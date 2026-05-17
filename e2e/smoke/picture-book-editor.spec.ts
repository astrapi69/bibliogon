/**
 * Picture-Book PageEditor smoke (PB-PHASE4 Session 3 Commit 8).
 *
 * Exercises the user-validation happy path:
 *   - create a picture-book (book_type='picture_book') via API
 *   - open /book/{id} and assert PageEditor mounts (not the chapter editor)
 *   - add two pages via the + button — both rows appear with the
 *     namespaced 'page-editor-page-row-{id}' testid
 *   - reorder page 2 above page 1 via @dnd-kit (Playwright pointer
 *     events drive the real drag; happy-dom can't, hence E2E)
 *   - change the active page's layout via LayoutPicker and assert
 *     the row's data-layout attribute updates in lockstep
 *
 * Every namespaced testid is exercised positively per the
 * "Testid namespace pinning prevents silent E2E skips" rule.
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

test.describe("Picture-Book PageEditor smoke", () => {
    test("create -> add 2 pages -> reorder -> change layout", async ({page}) => {
        const book = await createPictureBook("My Picture Book", "Author")

        // Open the editor; the routing branch lives at
        // frontend/src/pages/BookEditor.tsx (Commit 6).
        await page.goto(`/book/${book.id}`)

        // PageEditor scaffold + three panes (Commit 2).
        await expect(page.getByTestId("page-editor-root")).toBeVisible()
        await expect(
            page.getByTestId("page-editor-root"),
        ).toHaveAttribute("data-book-id", book.id)
        await expect(page.getByTestId("page-editor-thumbnails")).toBeVisible()
        await expect(page.getByTestId("page-editor-canvas")).toBeVisible()
        await expect(page.getByTestId("page-editor-properties")).toBeVisible()
        // The chapter-side wrapper must NOT mount for a picture book.
        await expect(page.getByTestId("book-editor")).toHaveCount(0)

        // Empty state from PageThumbnails + canvas (Commit 3 + 5).
        await expect(
            page.getByTestId("page-editor-thumbnails-empty"),
        ).toBeVisible()
        await expect(
            page.getByTestId("page-editor-canvas-empty"),
        ).toBeVisible()

        // Add the first page (Commit 3 + handleAddPage in PageEditor).
        await page.getByTestId("page-editor-add-page").click()
        await expect(
            page.locator('[data-testid^="page-editor-page-row-"]'),
        ).toHaveCount(1)

        // After the first add, the canvas + properties exit empty
        // state and LayoutPicker (Commit 4) + PageCanvas (Commit 5) mount.
        await expect(page.getByTestId("page-editor-layout-picker")).toBeVisible()
        await expect(page.getByTestId("page-canvas-root")).toBeVisible()
        await expect(
            page.getByTestId("page-editor-canvas-empty"),
        ).toHaveCount(0)

        // Add the second page.
        await page.getByTestId("page-editor-add-page").click()
        await expect(
            page.locator('[data-testid^="page-editor-page-row-"]'),
        ).toHaveCount(2)

        // Fetch the page IDs via API so the reorder + layout-change
        // assertions use stable selectors.
        let pages = await listPages(book.id)
        expect(pages).toHaveLength(2)
        const [p1, p2] = pages.sort((a, b) => a.position - b.position)
        expect(p1.position).toBe(1)
        expect(p2.position).toBe(2)

        // Initial: p1 at position 1, p2 at position 2.
        await expect(
            page.getByTestId(`page-editor-page-row-${p1.id}`),
        ).toHaveAttribute("data-position", "1")
        await expect(
            page.getByTestId(`page-editor-page-row-${p2.id}`),
        ).toHaveAttribute("data-position", "2")

        // Drag page 2's handle above page 1. Playwright drives real
        // pointer events; @dnd-kit's PointerSensor (5px activation
        // distance — see PageThumbnails.tsx) responds correctly.
        const handle2 = page.getByTestId(`page-editor-drag-handle-${p2.id}`)
        const target1 = page.getByTestId(`page-editor-page-row-${p1.id}`)
        await handle2.dragTo(target1)

        // After reorder, the API reflects the swap (p2 at position 1,
        // p1 at position 2) and the rows' data-position attributes
        // update in lockstep.
        await expect
            .poll(async () => {
                const after = await listPages(book.id)
                const byId = Object.fromEntries(after.map((p) => [p.id, p.position]))
                return `${byId[p2.id]},${byId[p1.id]}`
            }, {timeout: 5000})
            .toBe("1,2")
        await expect(
            page.getByTestId(`page-editor-page-row-${p2.id}`),
        ).toHaveAttribute("data-position", "1")
        await expect(
            page.getByTestId(`page-editor-page-row-${p1.id}`),
        ).toHaveAttribute("data-position", "2")

        // Pick the active page (whichever the UI auto-selected after
        // reorder) and change its layout via LayoutPicker.
        // Default new-page layout is "image_top_text_bottom"
        // (DEFAULT_NEW_PAGE_LAYOUT in PageEditor.tsx).
        await expect(
            page.getByTestId("page-editor-layout-option-image_top_text_bottom"),
        ).toHaveAttribute("data-selected", "true")
        await page.getByTestId("page-editor-layout-option-speech_bubble").click()
        await expect(
            page.getByTestId("page-editor-layout-option-speech_bubble"),
        ).toHaveAttribute("data-selected", "true")

        // The active row's data-layout updates to match.
        pages = await listPages(book.id)
        const activeRow = pages.find((p) => p.layout === "speech_bubble")
        expect(activeRow).toBeDefined()
        await expect(
            page.getByTestId(`page-editor-page-row-${activeRow!.id}`),
        ).toHaveAttribute("data-layout", "speech_bubble")

        // Expand the 'More layouts' disclosure and pick text_only as
        // a final assertion that the additional set is reachable.
        await page.getByTestId("page-editor-layout-more-toggle").click()
        await expect(
            page.getByTestId("page-editor-layout-options-more"),
        ).toBeVisible()
        await expect(
            page.getByTestId("page-editor-layout-option-text_only"),
        ).toBeVisible()
    })
})
