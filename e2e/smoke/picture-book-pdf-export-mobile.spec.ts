/**
 * #497 — picture-book PDF download on mobile (375px).
 *
 * The bug report: "on the 375px PWA you cannot download a picture-book
 * PDF." Diagnosis (see the issue) found the PageEditor header already
 * wraps (#138/#276), so the Export-PDF control is reachable; the
 * offline-only gap (no client-side picture-book PDF) is fixed separately
 * by the #497 pdfmake path + covered by Vitest
 * (PdfExportControls routing + picturebookPdf walker).
 *
 * This spec pins the user-visible mobile happy path against the standard
 * backend harness: at 375px the Export-PDF control is visible + enabled +
 * actually downloads a .pdf. jsdom cannot do layout, so the
 * reachability + download contract lives here. Aster runs it.
 */

import {test, expect, createPictureBook} from "../fixtures/base"

const API = "http://localhost:8000/api"

async function createPictureBookWithPage(title: string): Promise<{id: string}> {
    const book = await createPictureBook(title, "T. Tester")
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

test.describe("Picture-book PDF export on mobile (#497)", () => {
    test("375px: Export-PDF control is reachable, enabled, and downloads a .pdf", async ({
        page,
    }) => {
        const book = await createPictureBookWithPage("PDF Mobile Smoke")
        await page.setViewportSize({width: 375, height: 667})
        await page.goto(`/book/${book.id}`)
        await expect(page.getByTestId("page-editor-root")).toBeVisible()

        // The header wraps at 375px (no horizontal overflow) so the
        // control is on-screen, not clipped past the right edge.
        const header = page.getByTestId("page-editor-header")
        await expect(header).toBeVisible()
        const headerOverflow = await header.evaluate(
            (el) => el.scrollWidth - el.clientWidth,
        )
        expect(headerOverflow).toBeLessThanOrEqual(1)

        const exportBtn = page.getByTestId("page-editor-export-pdf")
        await expect(exportBtn).toBeVisible()
        await expect(exportBtn).toBeEnabled()

        // The button must be reachable by a real tap (no element
        // intercepts the pointer at 375px).
        const box = await exportBtn.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.height).toBeGreaterThan(20)

        const downloadPromise = page.waitForEvent("download", {timeout: 30_000})
        await exportBtn.click()
        const download = await downloadPromise
        expect(download.suggestedFilename()).toMatch(/\.pdf$/)
    })
})
