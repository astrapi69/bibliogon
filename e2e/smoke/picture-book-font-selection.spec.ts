/**
 * Picture-Book Font-Selection smoke (PB-PHASE4 Session 4c-B-1
 * Finding G5).
 *
 * Closes the Finding G fix-track. G1-G4 shipped:
 *  - G1: ``@tiptap/extension-font-family`` + 5-font catalog
 *  - G2: RichTextToolbar Font dropdown + i18n × 8 catalogs
 *  - G3: 5 OFL font files bundled + @font-face URL embedding
 *  - G4: PDF TipTap walker honours fontFamily marks
 *
 * G5 (this spec) is the end-to-end browser smoke: an author
 * picks a font from the dropdown, the choice writes a TipTap
 * mark, the mark persists through the autosave debounce, and
 * the dropdown reflects the active mark on the next page load.
 *
 * Per the "Testid namespace pinning prevents silent E2E skips"
 * lessons-learned rule, every testid the spec touches is a
 * positive assertion against the live page render.
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

test.describe("Picture-Book Font-Selection smoke (4c-B-1 G5)", () => {
    test("Font dropdown renders with the 5 OFL fonts + Default sentinel on a TipTap layout", async ({
        page,
    }) => {
        const book = await createPictureBook("Font Dropdown", "T. Tester")
        await createPicturePageViaAPI(book.id, "text_only")

        await page.goto(`/book/${book.id}`)
        await expect(page.getByTestId("page-editor-toolbar-root")).toBeVisible()

        const fontSelect = page.getByTestId(
            "page-editor-toolbar-font-family-trigger",
        )
        await expect(fontSelect).toBeVisible()

        // 1 sentinel + 5 fonts = 6 options. Pin the full set per
        // the D8 5-font decision so a catalog change is caught.
        // RadixSelect: open the trigger, assert each item is present.
        await fontSelect.click()
        for (const v of [
            "__default__",
            "Atkinson Hyperlegible",
            "Andika",
            "Comic Neue",
            "Lexend",
            "OpenDyslexic",
        ]) {
            await expect(
                page.getByTestId(`page-editor-toolbar-font-family-item-${v}`),
            ).toBeVisible()
        }
    })

    test("Font dropdown does NOT render on a Tier-Property layout (speech_bubble)", async ({
        page,
    }) => {
        // The toolbar itself unmounts for Tier-Property layouts
        // (see picture-book-richtext.spec.ts). Pinning here that
        // the font-family testid in particular is absent — the
        // contract any future "toolbar-on-Tier-Property" change
        // would need to deliberately reconsider.
        const book = await createPictureBook(
            "Font Tier-Property",
            "T. Tester",
        )
        await createPicturePageViaAPI(book.id, "speech_bubble")

        await page.goto(`/book/${book.id}`)
        await expect(page.getByTestId("page-editor-toolbar-root")).toHaveCount(
            0,
        )
        await expect(
            page.getByTestId("page-editor-toolbar-font-family-trigger"),
        ).toHaveCount(0)
    })

    test("Bug 3: picking Andika WITHOUT a prior selection writes the mark across the whole document", async ({
        page,
    }) => {
        // Picture-book convention is one page one consistent font.
        // The dropdown wraps (un)setFontFamily in selectAll() so a
        // user who just clicks the picker without first selecting
        // text still gets the font applied to the entire page.
        const book = await createPictureBook("Font Persist", "T. Tester")
        const pageRow = await createPicturePageViaAPI(
            book.id,
            "text_only",
        )

        await page.goto(`/book/${book.id}`)
        const editor = page.getByTestId(
            `page-canvas-richtext-${pageRow.id}-content`,
        )
        await expect(editor).toBeVisible()

        // Type multiple paragraphs (two paragraphs ensures the
        // assertion catches per-mark vs document-wide application
        // — without selectAll, only one paragraph would carry the
        // mark).
        await editor.click()
        await page.keyboard.type("First sentence.")
        await page.keyboard.press("Enter")
        await page.keyboard.type("Second sentence.")

        // No explicit Ctrl/Cmd+A. The dropdown's onChange must
        // auto-select-all before applying the font.
        await page.getByTestId("page-editor-toolbar-font-family-trigger").click()
        await page.getByTestId("page-editor-toolbar-font-family-item-Andika").click()

        // Wait for the autosave debounce (800 ms) + PATCH round-trip.
        await page.waitForTimeout(2000)

        const persisted = await getPage(book.id, pageRow.id)
        expect(persisted.text_content).not.toBeNull()
        const serialised = persisted.text_content!
        // The textStyle mark with fontFamily=Andika is the
        // contract the G4 PDF walker reads. Pin via substring +
        // structural parse.
        expect(serialised).toContain('"textStyle"')
        expect(serialised).toContain('"fontFamily":"Andika"')
        const doc = JSON.parse(serialised) as {
            type: string
            content: unknown[]
        }
        expect(doc.type).toBe("doc")
        // Bug 3: BOTH paragraphs carry the Andika mark (2 occurrences
        // in the serialised JSON). Without auto-select-all, only one
        // would have it.
        const occurrences = (
            serialised.match(/"fontFamily":"Andika"/g) || []
        ).length
        expect(occurrences).toBe(2)
    })

    test("Picking the Default sentinel removes the fontFamily mark (round-trip)", async ({
        page,
    }) => {
        const book = await createPictureBook("Font Revert", "T. Tester")
        const pageRow = await createPicturePageViaAPI(
            book.id,
            "text_only",
        )

        await page.goto(`/book/${book.id}`)
        const editor = page.getByTestId(
            `page-canvas-richtext-${pageRow.id}-content`,
        )
        await expect(editor).toBeVisible()

        // Type + apply Comic Neue.
        await editor.click()
        await page.keyboard.type("Round trip")
        await page.keyboard.press(
            process.platform === "darwin" ? "Meta+A" : "Control+A",
        )
        await page.getByTestId("page-editor-toolbar-font-family-trigger").click()
        await page.getByTestId("page-editor-toolbar-font-family-item-Comic Neue").click()
        await page.waitForTimeout(2000)

        // Sanity: the mark IS persisted.
        let persisted = await getPage(book.id, pageRow.id)
        expect(persisted.text_content!).toContain(
            '"fontFamily":"Comic Neue"',
        )

        // Re-select all → pick Default sentinel.
        await editor.click()
        await page.keyboard.press(
            process.platform === "darwin" ? "Meta+A" : "Control+A",
        )
        await page.getByTestId("page-editor-toolbar-font-family-trigger").click()
        await page.getByTestId("page-editor-toolbar-font-family-item-__default__").click()
        await page.waitForTimeout(2000)

        // The mark must be gone — D11 backward-compat: a page
        // without a fontFamily mark renders with the hardcoded
        // Atkinson Hyperlegible default in the PDF.
        persisted = await getPage(book.id, pageRow.id)
        expect(persisted.text_content!).not.toContain('"fontFamily"')
    })

    test("Dropdown reflects the active fontFamily mark on a reload", async ({
        page,
    }) => {
        // Pre-seed a page with a fontFamily=Lexend mark via the
        // API; load the editor and assert the dropdown shows
        // Lexend as the selected value. Pins the read-side
        // contract: ``editor.getAttributes('textStyle').fontFamily``
        // drives the <select>'s ``value`` prop.
        const book = await createPictureBook("Font Reload", "T. Tester")
        const pageRow = await createPicturePageViaAPI(
            book.id,
            "text_only",
        )

        const seededDoc = {
            type: "doc",
            content: [
                {
                    type: "paragraph",
                    content: [
                        {
                            type: "text",
                            text: "Lexend body",
                            marks: [
                                {
                                    type: "textStyle",
                                    attrs: {fontFamily: "Lexend"},
                                },
                            ],
                        },
                    ],
                },
            ],
        }
        const patchRes = await fetch(
            `${API}/books/${book.id}/pages/${pageRow.id}`,
            {
                method: "PATCH",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    text_content: JSON.stringify(seededDoc),
                }),
            },
        )
        expect(patchRes.ok).toBe(true)

        await page.goto(`/book/${book.id}`)
        const editor = page.getByTestId(
            `page-canvas-richtext-${pageRow.id}-content`,
        )
        await expect(editor).toBeVisible()

        // Click into the text so the editor selection moves into
        // the marked span (the dropdown's value tracks the active
        // selection's mark, not the doc's overall marks).
        await editor.click()
        // Move the caret to the start of the text so the active
        // mark resolves predictably across the seeded run.
        await page.keyboard.press(
            process.platform === "darwin" ? "Meta+Home" : "Control+Home",
        )

        const fontSelect = page.getByTestId(
            "page-editor-toolbar-font-family-trigger",
        )
        await expect(fontSelect).toHaveAttribute("data-value", "Lexend")
    })
})
