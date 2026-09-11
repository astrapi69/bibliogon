/**
 * Portfolio board smoke (#810).
 *
 * The board is the UI over the promotion plugin's per-format retail
 * state (#782/#784): one row per book, one column per format, gaps
 * flagged. It replaces a hand-maintained CSV plus a prose "hardcover
 * fehlt" list, so the two things worth pinning in a real browser are
 * that a write actually reaches the backend and that the gap marking
 * follows it.
 *
 * Positive-coverage walk over the whole `portfolio-board-*` test-id
 * namespace (see frontend/src/components/promotion/portfolioTestIds.ts),
 * per the testid-namespace discipline: every pinned id is asserted
 * visible at least once, so a rename or a forgotten namespace on a new
 * control fails here instead of silently skipping.
 */

import {test, expect, createBook, updateBook} from "../fixtures/base"

const API = "http://localhost:8000/api"

async function getPortfolioRow(bookId: string) {
    const res = await fetch(`${API}/promotion/portfolio/${bookId}`)
    if (!res.ok) throw new Error(`GET portfolio/${bookId}: ${res.status}`)
    return res.json() as Promise<{
        universal_link: string | null
        formats: {book_format: string; status: string; store_url: string | null}[]
        gaps: string[]
    }>
}

test.describe("portfolio board", () => {
    test("shows the first-run empty state while no book exists", async ({page}) => {
        await page.goto("/portfolio")

        await expect(page.getByTestId("portfolio-board-empty")).toBeVisible()
        await expect(page.getByTestId("portfolio-board-matrix")).toHaveCount(0)
    })

    test("is reachable from the dashboard header", async ({page}) => {
        await createBook("Portfolio Nav E2E")

        await page.goto("/")
        await page.getByTestId("portfolio-nav-btn").click()

        await expect(page).toHaveURL(/\/portfolio$/)
        await expect(page.getByTestId("portfolio-board-matrix")).toBeVisible()
    })

    test("renders one column per format and flags every gap of a fresh book", async ({page}) => {
        const book = await createBook("Portfolio Matrix E2E")
        // The ASIN is shown, never edited, from the book's own column -
        // the board composes both sides of the split storage.
        await updateBook(book.id, {asin_ebook: "B00MATRIX1"})

        await page.goto("/portfolio")
        await expect(page.getByTestId("portfolio-board-matrix")).toBeVisible()
        await expect(page.getByTestId(`portfolio-board-row-${book.id}`)).toBeVisible()
        await expect(page.getByTestId(`portfolio-board-title-${book.id}`)).toHaveText(
            "Portfolio Matrix E2E",
        )

        // A book with no retail state reports three missing formats, so
        // all three are gaps - "absent must be visible" is the point.
        for (const bookFormat of ["ebook", "paperback", "hardcover"]) {
            await expect(page.getByTestId(`portfolio-board-column-${bookFormat}`)).toBeVisible()
            const cell = page.getByTestId(`portfolio-board-cell-${book.id}-${bookFormat}`)
            await expect(cell).toBeVisible()
            await expect(cell).toHaveAttribute("data-gap", "true")
            await expect(cell).toHaveAttribute("data-status", "missing")
            await expect(
                page.getByTestId(`portfolio-board-cell-status-${book.id}-${bookFormat}-trigger`),
            ).toBeVisible()
            await expect(
                page.getByTestId(`portfolio-board-cell-edit-${book.id}-${bookFormat}`),
            ).toBeVisible()
        }
        await expect(page.getByTestId(`portfolio-board-cell-asin-${book.id}-ebook`)).toHaveText(
            "B00MATRIX1",
        )
        await expect(page.getByTestId(`portfolio-board-gaps-${book.id}`)).toBeVisible()
        await expect(page.getByTestId("portfolio-board-reload")).toBeVisible()
    })

    test("writes a status change through to the backend and clears the gap", async ({page}) => {
        const book = await createBook("Portfolio Status E2E")

        await page.goto("/portfolio")
        await page.getByTestId(`portfolio-board-cell-status-${book.id}-ebook-trigger`).click()
        await page.getByTestId(`portfolio-board-cell-status-${book.id}-ebook-item-live`).click()

        const cell = page.getByTestId(`portfolio-board-cell-${book.id}-ebook`)
        await expect(cell).toHaveAttribute("data-status", "live")
        await expect(cell).toHaveAttribute("data-gap", "false")

        const row = await getPortfolioRow(book.id)
        expect(row.formats.find((f) => f.book_format === "ebook")?.status).toBe("live")
        expect(row.gaps).toEqual(["paperback", "hardcover"])
    })

    test("saves a store link for one format", async ({page}) => {
        const book = await createBook("Portfolio Link E2E")

        await page.goto("/portfolio")
        await page.getByTestId(`portfolio-board-cell-edit-${book.id}-paperback`).click()
        await page
            .getByTestId(`portfolio-board-cell-url-${book.id}-paperback`)
            .fill("https://www.amazon.de/dp/B00TEST123")
        await page.getByTestId(`portfolio-board-cell-url-save-${book.id}-paperback`).click()

        await expect(
            page.getByTestId(`portfolio-board-cell-link-${book.id}-paperback`),
        ).toHaveAttribute("href", "https://www.amazon.de/dp/B00TEST123")

        const row = await getPortfolioRow(book.id)
        expect(row.formats.find((f) => f.book_format === "paperback")?.store_url).toBe(
            "https://www.amazon.de/dp/B00TEST123",
        )
    })

    test("cancelling a store-link edit leaves the value untouched", async ({page}) => {
        const book = await createBook("Portfolio Cancel E2E")

        await page.goto("/portfolio")
        await page.getByTestId(`portfolio-board-cell-edit-${book.id}-hardcover`).click()
        await page
            .getByTestId(`portfolio-board-cell-url-${book.id}-hardcover`)
            .fill("https://example.invalid/nope")
        await page.getByTestId(`portfolio-board-cell-url-cancel-${book.id}-hardcover`).click()

        await expect(
            page.getByTestId(`portfolio-board-cell-link-${book.id}-hardcover`),
        ).toHaveCount(0)
        const row = await getPortfolioRow(book.id)
        expect(row.formats.find((f) => f.book_format === "hardcover")?.store_url).toBeNull()
    })

    test("saves the universal link for a book", async ({page}) => {
        const book = await createBook("Portfolio Universal E2E")

        await page.goto("/portfolio")
        await page
            .getByTestId(`portfolio-board-universal-link-${book.id}`)
            .fill("https://books2read.com/u/e2e")
        await page.getByTestId(`portfolio-board-universal-link-save-${book.id}`).click()

        await expect
            .poll(async () => (await getPortfolioRow(book.id)).universal_link)
            .toBe("https://books2read.com/u/e2e")
    })

    test("filters by language, by pen name and by gaps only", async ({page}) => {
        const wanted = await createBook("Portfolio Filter Wanted", "Pen A")
        const other = await createBook("Portfolio Filter Other", "Pen B")

        await page.goto("/portfolio")
        await expect(page.getByTestId(`portfolio-board-row-${other.id}`)).toBeVisible()

        await page.getByTestId("portfolio-board-filter-author-trigger").click()
        await page.getByTestId("portfolio-board-filter-author-item-Pen A").click()
        await expect(page.getByTestId(`portfolio-board-row-${wanted.id}`)).toBeVisible()
        await expect(page.getByTestId(`portfolio-board-row-${other.id}`)).toHaveCount(0)

        await page.getByTestId("portfolio-board-filter-language-trigger").click()
        await page.getByTestId("portfolio-board-filter-language-item-de").click()
        await expect(page.getByTestId(`portfolio-board-row-${wanted.id}`)).toBeVisible()

        await page.getByTestId("portfolio-board-filter-reset").click()
        await expect(page.getByTestId(`portfolio-board-row-${other.id}`)).toBeVisible()

        // Every format of both books is still missing, so gaps-only keeps
        // them; the filter's own request is what matters here.
        await page.getByTestId("portfolio-board-filter-gaps").check()
        await expect(page.getByTestId(`portfolio-board-row-${wanted.id}`)).toBeVisible()
        await expect(page.getByTestId(`portfolio-board-row-${other.id}`)).toBeVisible()
    })

    test("distinguishes 'no matches' from the first-run empty state", async ({page}) => {
        await createBook("Portfolio No Match A", "Pen A")
        const english = await createBook("Portfolio No Match B", "Pen B")
        await updateBook(english.id, {language: "en"})

        await page.goto("/portfolio")
        await expect(page.getByTestId("portfolio-board-matrix")).toBeVisible()

        // Pen A wrote nothing in English, so this combination is empty
        // while a filter is active: "no matches", not "nothing seeded".
        await page.getByTestId("portfolio-board-filter-author-trigger").click()
        await page.getByTestId("portfolio-board-filter-author-item-Pen A").click()
        await page.getByTestId("portfolio-board-filter-language-trigger").click()
        await page.getByTestId("portfolio-board-filter-language-item-en").click()

        await expect(page.getByTestId("portfolio-board-no-matches")).toBeVisible()
        await expect(page.getByTestId("portfolio-board-empty")).toHaveCount(0)
    })
})
