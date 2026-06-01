/**
 * Smoke tests for the chapter Outliner (CHAPTER-OUTLINER-VIEW-01).
 *
 * Covers the spreadsheet view: open via ?view=outline, a row per
 * chapter, sort-by-column, inline target edit persisting across
 * reload, title-click opening the chapter, and a status assignment via
 * the RadixSelect (the path that's brittle in happy-dom). data-testid
 * selectors only.
 */
import {test, expect, createBook, createChapter} from "../fixtures/base"

test.describe("Chapter Outliner", () => {
    test("opens, lists chapters, sorts, and inline-edits a target", async ({page}) => {
        const book = await createBook("Outliner E2E")
        const a = await createChapter(book.id, "Alpha", "one two three four five")
        const b = await createChapter(book.id, "Beta", "one two")

        await page.goto(`/book/${book.id}?view=outline`)
        await expect(page.getByTestId("outliner")).toBeVisible()
        await expect(page.getByTestId(`outliner-row-${a.id}`)).toBeVisible()
        await expect(page.getByTestId(`outliner-row-${b.id}`)).toBeVisible()

        // Sort by words (asc): Beta(2) before Alpha(5).
        await page.getByTestId("outliner-sort-words").click()
        const rows = page.locator('[data-testid^="outliner-row-"]')
        await expect(rows.first()).toHaveAttribute("data-testid", `outliner-row-${b.id}`)

        // Inline target edit persists across reload.
        const target = page.getByTestId(`outliner-target-${a.id}`)
        await target.fill("3000")
        await target.blur()
        await page.reload()
        await expect(page.getByTestId(`outliner-target-${a.id}`)).toHaveValue("3000")
    })

    test("title click opens the chapter in the editor", async ({page}) => {
        const book = await createBook("Outliner Open E2E")
        const ch = await createChapter(book.id, "Chapter One", "prose here")

        await page.goto(`/book/${book.id}?view=outline`)
        await page.getByTestId(`outliner-title-${ch.id}`).click()
        // Back in the editor: the view query-param is cleared + the editor mounts.
        await expect(page.locator(".tiptap-editor")).toBeVisible({timeout: 5000})
    })

    test("status assignment via the outliner RadixSelect", async ({page}) => {
        const book = await createBook("Outliner Status E2E")
        const ch = await createChapter(book.id, "Chapter One", "prose")

        await page.goto(`/book/${book.id}?view=outline`)
        await page.getByTestId(`outliner-status-select-${ch.id}-trigger`).click()
        await page.getByTestId(`outliner-status-select-${ch.id}-item-final`).click()
        // Re-open the outliner after a reload; the select reflects the saved value.
        await page.reload()
        await expect(
            page.getByTestId(`outliner-status-select-${ch.id}-trigger`),
        ).toContainText(/Final/i)
    })
})
