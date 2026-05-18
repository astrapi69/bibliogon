/**
 * Picture-Book TipTap rich-text editing smoke (PB-PHASE4 Session
 * 4c-B-1 Commit 5).
 *
 * Exercises the user-visible flow shipped across Commits 1-4:
 *  - PageCanvas renders ``RichTextEditor`` (TipTap mount) for the
 *    3 TipTap layouts (image_top_text_bottom, image_left_text_right,
 *    text_only). No textarea on those layouts.
 *  - PageEditor's properties pane renders ``RichTextToolbar``
 *    (11 D1 MVP buttons) when the active page is a TipTap layout.
 *  - Toolbar disappears for Tier-Property layouts (speech_bubble +
 *    image_full_text_overlay).
 *  - Clicking Bold in the toolbar toggles the bold mark on the
 *    current selection (full button → editor wiring).
 *  - Typing into the TipTap editor persists via the debounced
 *    onChange flow (800 ms) — after the debounce window, the
 *    backend has the new text_content as JSON.
 *
 * Per the "Testid namespace pinning prevents silent E2E skips"
 * lessons-learned rule, every namespaced testid added in
 * Commits 1-3 is exercised positively here.
 */

import {test, expect, createPictureBook} from "../fixtures/base"

const API = "http://localhost:8000/api"

interface PageRow {
    id: string
    layout: string
    text_content: string | null
}

async function createPicturePageViaAPI(
    bookId: string,
    layout: string,
): Promise<PageRow> {
    const res = await fetch(`${API}/books/${bookId}/pages`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({layout, text_content: null}),
    })
    if (!res.ok) {
        throw new Error(`POST page ${bookId}: ${res.status} ${await res.text()}`)
    }
    return res.json()
}

async function getPage(bookId: string, pageId: string): Promise<PageRow> {
    const res = await fetch(`${API}/books/${bookId}/pages`)
    if (!res.ok) throw new Error(`GET pages: ${res.status}`)
    const pages: PageRow[] = await res.json()
    const found = pages.find((p) => p.id === pageId)
    if (!found) throw new Error(`Page ${pageId} not found`)
    return found
}

test.describe("Picture-Book TipTap rich-text smoke (4c-B-1)", () => {
    test("PageCanvas renders RichTextEditor + Toolbar for a TipTap layout (text_only)", async ({
        page,
    }) => {
        const book = await createPictureBook("TipTap Smoke", "T. Tester")
        const pageRow = await createPicturePageViaAPI(book.id, "text_only")

        await page.goto(`/book/${book.id}`)
        await expect(page.getByTestId("page-editor-root")).toBeVisible()

        // RichTextEditor mounted in PageCanvas.
        await expect(
            page.getByTestId(`page-canvas-richtext-${pageRow.id}-root`),
        ).toBeVisible()
        await expect(
            page.getByTestId(`page-canvas-richtext-${pageRow.id}-content`),
        ).toBeVisible()
        // No textarea on a TipTap layout.
        await expect(page.getByTestId("page-canvas-text-input")).toHaveCount(0)

        // Toolbar mounted in properties pane.
        await expect(page.getByTestId("page-editor-toolbar-root")).toBeVisible()
        // Sanity: a representative D1 button per group.
        await expect(page.getByTestId("page-editor-toolbar-bold")).toBeVisible()
        await expect(page.getByTestId("page-editor-toolbar-h2")).toBeVisible()
        await expect(
            page.getByTestId("page-editor-toolbar-bullet-list"),
        ).toBeVisible()
        await expect(
            page.getByTestId("page-editor-toolbar-align-center"),
        ).toBeVisible()
    })

    test("Toolbar disappears when active layout switches to a Tier-Property layout", async ({
        page,
    }) => {
        const book = await createPictureBook("Toolbar Switch", "T. Tester")
        await createPicturePageViaAPI(book.id, "text_only")

        await page.goto(`/book/${book.id}`)
        await expect(page.getByTestId("page-editor-toolbar-root")).toBeVisible()

        // Switch to speech_bubble via the LayoutPicker (primary
        // default; no More-Layouts disclosure needed).
        await page
            .getByTestId("page-editor-layout-option-speech_bubble")
            .click()
        await expect(page.getByTestId("page-editor-toolbar-root")).toHaveCount(0)
    })

    test("Toolbar reappears when user switches back to a TipTap layout", async ({
        page,
    }) => {
        const book = await createPictureBook("Toolbar Reappear", "T. Tester")
        await createPicturePageViaAPI(book.id, "speech_bubble")

        await page.goto(`/book/${book.id}`)
        // Start: speech_bubble (Tier-Property) → no Toolbar.
        await expect(page.getByTestId("page-editor-toolbar-root")).toHaveCount(0)

        // Switch to image_top_text_bottom (also a primary default
        // in the LayoutPicker) → Toolbar appears.
        await page
            .getByTestId("page-editor-layout-option-image_top_text_bottom")
            .click()
        await expect(page.getByTestId("page-editor-toolbar-root")).toBeVisible()
    })

    test("Click Bold + type → text becomes bold (full button↔editor wiring)", async ({
        page,
    }) => {
        const book = await createPictureBook("Bold Click", "T. Tester")
        const pageRow = await createPicturePageViaAPI(book.id, "text_only")

        await page.goto(`/book/${book.id}`)
        await expect(page.getByTestId("page-editor-toolbar-root")).toBeVisible()

        const editor = page.getByTestId(
            `page-canvas-richtext-${pageRow.id}-content`,
        )
        await editor.click()
        await page.keyboard.type("hello world")

        // Select all the typed text + click Bold.
        await page.keyboard.press(
            process.platform === "darwin" ? "Meta+A" : "Control+A",
        )
        await page.getByTestId("page-editor-toolbar-bold").click()

        // Bold button is aria-pressed=true after activation.
        await expect(page.getByTestId("page-editor-toolbar-bold")).toHaveAttribute(
            "aria-pressed",
            "true",
        )
        // ProseMirror wraps selection in a <strong> node in the
        // rendered DOM.
        await expect(editor.locator("strong")).toContainText("hello world")
    })

    test("typed text persists to the backend after the debounce window", async ({
        page,
    }) => {
        const book = await createPictureBook("Debounce Persist", "T. Tester")
        const pageRow = await createPicturePageViaAPI(book.id, "text_only")

        // Pre-check: page is empty.
        const before = await getPage(book.id, pageRow.id)
        expect(before.text_content).toBeNull()

        await page.goto(`/book/${book.id}`)
        const editor = page.getByTestId(
            `page-canvas-richtext-${pageRow.id}-content`,
        )
        await expect(editor).toBeVisible()
        await editor.click()
        await page.keyboard.type("Once upon a time")

        // Debounce is 800 ms; allow comfortably more for the
        // PATCH round-trip on a slow CI runner.
        await page.waitForTimeout(2000)

        const after = await getPage(book.id, pageRow.id)
        expect(after.text_content).not.toBeNull()
        // text_content is the JSON-serialized TipTap doc — verify
        // by parse + content check.
        const doc = JSON.parse(after.text_content!) as {
            type: string
            content: unknown[]
        }
        expect(doc.type).toBe("doc")
        expect(JSON.stringify(doc)).toContain("Once upon a time")
    })

    test("backward-compat: legacy plain-text text_content on a TipTap layout opens as editable rich-text", async ({
        page,
    }) => {
        // Per D4 backward-compat: existing rows with plain-text
        // text_content for a TipTap layout auto-wrap into a TipTap
        // doc on first read. The user sees their text intact + can
        // now apply formatting on top.
        const book = await createPictureBook("Legacy Compat", "T. Tester")
        const pageRow = await createPicturePageViaAPI(book.id, "text_only")
        // Patch the page to have a plain-text text_content (the
        // legacy shape pre-4c-B-1 storage).
        const patchRes = await fetch(
            `${API}/books/${book.id}/pages/${pageRow.id}`,
            {
                method: "PATCH",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({text_content: "Legacy plain text"}),
            },
        )
        expect(patchRes.ok).toBe(true)

        await page.goto(`/book/${book.id}`)
        const editor = page.getByTestId(
            `page-canvas-richtext-${pageRow.id}-content`,
        )
        await expect(editor).toBeVisible()
        await expect(editor).toContainText("Legacy plain text")
    })
})
