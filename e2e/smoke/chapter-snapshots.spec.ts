/**
 * Smoke tests for Scrivener-style chapter snapshots
 * (CHAPTER-SNAPSHOTS-01) on the version-history page (Dialog->Pages C6
 * made it a route at /books/:bookId/chapters/:chapterId/snapshots).
 *
 * Covers what Vitest can't reliably do (Radix ContextMenu open +
 * portal in happy-dom): open the version page from the chapter
 * context menu, take a named manual snapshot, see the Snapshot badge
 * + name, open the diff-vs-current view, and return to the list.
 *
 * Testid namespace: chapter-versions-* / chapter-version-* /
 * chapter-snapshot-*. data-testid selectors only.
 */
import {test, expect, createBook, createChapter} from "../fixtures/base"

test.describe("Chapter snapshots", () => {
    test("take a named snapshot, see badge, open diff, return", async ({page}) => {
        const book = await createBook("Snapshots E2E")
        const ch = await createChapter(book.id, "Opening", "Alice walked into the woods.")

        await page.goto(`/book/${book.id}`)
        const row = page.getByTestId(`chapter-item-${ch.id}`)
        await expect(row).toBeVisible()

        // Open the version-history page from the chapter context menu.
        await row.click({button: "right"})
        await page.getByTestId(`chapter-context-history-${ch.id}`).click()
        await expect(page).toHaveURL(
            new RegExp(`/books/${book.id}/chapters/${ch.id}/snapshots`),
        )
        await expect(page.getByTestId("chapter-versions-page")).toBeVisible()

        // Take a named manual snapshot of the current saved state.
        await page.getByTestId("chapter-snapshot-name").fill("Milestone")
        await page.getByTestId("chapter-snapshot-create").click()

        // The manual snapshot row appears with its Snapshot badge + name.
        const manualBadge = page.locator('[data-testid^="chapter-version-manual-"]')
        await expect(manualBadge.first()).toBeVisible()
        await expect(page.getByTestId("chapter-versions-list")).toContainText("Milestone")

        // Open the diff-vs-current view for that snapshot.
        await page
            .locator('[data-testid^="chapter-version-diff-"]')
            .first()
            .click()
        await expect(page.getByTestId("chapter-version-diff")).toBeVisible()

        // Return to the list.
        await page.getByTestId("chapter-version-diff-back").click()
        await expect(page.getByTestId("chapter-versions-list")).toBeVisible()
    })
})
