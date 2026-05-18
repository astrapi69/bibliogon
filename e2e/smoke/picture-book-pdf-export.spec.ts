/**
 * Picture-Book PDF export smoke (PB-PHASE4 Session 6 Commit 7).
 *
 * Exercises the full happy path:
 *   - create a picture-book via API
 *   - add a text-only page via API (no image upload needed for
 *     the cheapest possible PDF render)
 *   - open /book/{id} and assert PageEditor mounts
 *   - click the Export PDF button in the PageEditor header
 *   - assert Playwright observes a download event with .pdf
 *     suggested filename
 *
 * Plus the BookMetadataEditor parallel entry-point:
 *   - open BookMetadataEditor via the PageEditor header button
 *   - switch to Design tab
 *   - click the Export PDF button (picture-book-only; gated on
 *     book.book_type === "picture_book")
 *   - assert download event fires
 *
 * Plus a prose regression pin:
 *   - existing prose PDF route stays untouched by the
 *     book_type dispatch shipped in Commit 2. Smoke verifies the
 *     dispatch routes correctly + does NOT misclassify a prose
 *     book as a picture-book non-PDF guard 400.
 *
 * Per the "Testid namespace pinning prevents silent E2E skips"
 * rule: every namespaced testid added in Commits 4 + 5 is
 * exercised positively here.
 */

import {test, expect, createPictureBook} from "../fixtures/base"

const API = "http://localhost:8000/api"

interface BookRow {
    id: string
    title: string
    book_type: string
}

async function createPictureBookWithPage(
    title: string,
    author: string,
): Promise<BookRow> {
    const book = await createPictureBook(title, author)
    const res = await fetch(`${API}/books/${book.id}/pages`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            layout: "text_only",
            text_content: "Once upon a time.",
        }),
    })
    if (!res.ok) {
        throw new Error(`POST page ${book.id}: ${res.status} ${await res.text()}`)
    }
    return book
}

async function createProseBookWithChapter(
    title: string,
    author: string,
): Promise<BookRow> {
    const bookRes = await fetch(`${API}/books`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({title, author}),
    })
    if (!bookRes.ok) {
        throw new Error(`POST book: ${bookRes.status} ${await bookRes.text()}`)
    }
    const book: BookRow = await bookRes.json()
    const chapterRes = await fetch(`${API}/books/${book.id}/chapters`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            title: "Chapter One",
            content:
                '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Body."}]}]}',
        }),
    })
    if (!chapterRes.ok) {
        throw new Error(
            `POST chapter ${book.id}: ${chapterRes.status} ${await chapterRes.text()}`,
        )
    }
    return book
}

test.describe("Picture-Book PDF export smoke", () => {
    test("PageEditor: click Export PDF -> download .pdf", async ({page}) => {
        const book = await createPictureBookWithPage("PDF Smoke", "T. Tester")

        await page.goto(`/book/${book.id}`)
        await expect(page.getByTestId("page-editor-root")).toBeVisible()

        // Pre-flight: the Export PDF button is rendered + enabled.
        // Testid namespace pin (per the discipline rule).
        const exportBtn = page.getByTestId("page-editor-export-pdf")
        await expect(exportBtn).toBeVisible()
        await expect(exportBtn).toBeEnabled()

        // Picture-book PDF render is 1-3 s sync; wait for the
        // download event with a 30 s timeout for CI variance.
        const downloadPromise = page.waitForEvent("download", {
            timeout: 30_000,
        })
        await exportBtn.click()

        const download = await downloadPromise
        expect(download.suggestedFilename()).toMatch(/\.pdf$/)
        // Sanity: a non-empty file lands. WeasyPrint produces
        // a non-trivial PDF even for one text_only page.
        const filePath = await download.path()
        if (filePath !== null) {
            // Playwright's path() can return null on certain
            // configurations; only assert when defined.
            const fs = await import("fs")
            const stat = fs.statSync(filePath)
            expect(stat.size).toBeGreaterThan(500)
        }
    })

    test("BookMetadataEditor Design tab: click Export PDF -> download .pdf (picture-book-only)", async ({page}) => {
        const book = await createPictureBookWithPage(
            "PDF Smoke from BME",
            "T. Tester",
        )

        await page.goto(`/book/${book.id}`)
        await expect(page.getByTestId("page-editor-root")).toBeVisible()

        // Open BookMetadataEditor via the PageEditor header button.
        await page.getByTestId("page-editor-show-metadata").click()

        // Switch to the Design tab. Per the "Radix Tabs onMouseDown
        // not onClick" lessons-learned rule, Radix Tabs.Trigger
        // listens to onMouseDown internally — but Playwright's
        // `.click()` synthesizes a full pointer interaction
        // (pointerdown + pointerup + click), so this works at the
        // real-browser level (only happy-dom needs the explicit
        // mouseDown workaround).
        await page.getByTestId("metadata-tab-design").click()

        const exportBtn = page.getByTestId("metadata-export-picture-pdf")
        await expect(exportBtn).toBeVisible()

        const downloadPromise = page.waitForEvent("download", {
            timeout: 30_000,
        })
        await exportBtn.click()

        const download = await downloadPromise
        expect(download.suggestedFilename()).toMatch(/\.pdf$/)
    })

    test("prose book: Design tab does NOT show the picture-book Export PDF button", async ({page}) => {
        const book = await createProseBookWithChapter(
            "Prose Smoke",
            "T. Tester",
        )

        // BookEditor's metadata view is driven by ?view=metadata
        // (see frontend/src/pages/BookEditor.tsx _setShowMetadata).
        // Deep-link to it directly to avoid testid coupling with
        // the ChapterSidebar's Metadata button.
        await page.goto(`/book/${book.id}?view=metadata`)

        await page.getByTestId("metadata-tab-design").click()

        // Picture-book-only button is correctly absent.
        await expect(
            page.getByTestId("metadata-export-picture-pdf"),
        ).toHaveCount(0)
    })

    test("regression: prose PDF route still works (book_type dispatch did not break chapters)", async ({
        request,
    }) => {
        // API-level smoke (avoids dragging the ExportDialog UI into
        // this commit's E2E scope; the existing ExportDialog test
        // covers the UI path). The regression pin is: a prose book
        // hitting /export/pdf does NOT 400 (which would mean the
        // picture-book non-PDF guard incorrectly fired).
        const book = await createProseBookWithChapter(
            "Prose Regression",
            "T. Tester",
        )
        const res = await request.get(`${API}/books/${book.id}/export/pdf`)
        expect(res.status()).not.toBe(400)
        // Either 200 (Pandoc present) or 500 (Pandoc missing in
        // some CI configurations) is acceptable — both prove the
        // dispatch did NOT classify the prose book as
        // picture-book-non-PDF. 400 would be the dispatch bug.
    })
})
