/**
 * Smoke test for the Writing-History page (WRITING-HISTORY-STATS-01;
 * Dialog->Pages C5 made it a route at /writing-history).
 *
 * Covers the chart surface Vitest mocks away (recharts needs a real
 * browser): edit a chapter to record writing, open the history from the
 * Dashboard widget (now navigates to the page), and verify the summary +
 * per-book breakdown + window switch + CSV link render.
 *
 * Testid namespace: writing-history-* / writing-goal-history-open.
 */
import { test, expect, createBook, createChapter } from "../fixtures/base"

const API = "http://localhost:8000/api"

test.describe("Writing history", () => {
  test("record writing, open history, see summary + per-book + window switch", async ({
    page,
  }) => {
    const book = await createBook("Writing History E2E")
    const ch = await createChapter(book.id, "Opening", "seed")

    // A content PATCH records a per-book/per-chapter writing delta today.
    const resp = await page.request.patch(
      `${API}/books/${book.id}/chapters/${ch.id}`,
      { data: { content: "one two three four five six seven", version: ch.version } },
    )
    expect(resp.ok()).toBeTruthy()

    await page.goto("/")
    await expect(page.getByTestId("writing-goal-widget")).toBeVisible()

    // The widget's Verlauf button navigates to the Writing-History page.
    await page.getByTestId("writing-goal-history-open").click()
    await expect(page).toHaveURL(/\/writing-history/)
    await expect(page.getByTestId("writing-history-page")).toBeVisible()
    await expect(page.getByTestId("writing-history-summary")).toBeVisible()

    // The book appears in the per-book breakdown.
    await expect(page.getByTestId(`writing-history-book-${book.id}`)).toBeVisible()

    // The CSV export link targets the export endpoint.
    const csv = page.getByTestId("writing-history-export-csv")
    await expect(csv).toHaveAttribute("href", /writing-stats\/export\.csv/)

    // Switching the window keeps the summary rendered.
    await page.getByTestId("writing-history-window-30").click()
    await expect(page.getByTestId("writing-history-summary")).toBeVisible()
  })
})
