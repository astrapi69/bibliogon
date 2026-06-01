/**
 * Smoke tests for writing goals (WRITING-GOALS-PROGRESS-TRACKING-01).
 *
 * Covers the three surfaces: the Dashboard daily-goal widget (consumes
 * the WritingSession history recorded by a chapter content PATCH), the
 * per-chapter target in the prose Storyboard (persists across reload),
 * and the book word-target + deadline in the metadata editor (with the
 * words/day hint). data-testid selectors only.
 */
import {test, expect, createBook, createChapter} from "../fixtures/base"

const API = "http://localhost:8000/api"

test.describe("Writing goals", () => {
    test("dashboard widget shows today's words + a streak after writing", async ({page}) => {
        const book = await createBook("Writing Goals E2E")
        const ch = await createChapter(book.id, "Opening", "alpha beta")
        // A content PATCH records the day's net word delta.
        await page.request.patch(`${API}/books/${book.id}/chapters/${ch.id}`, {
            data: {version: ch.version, content: "alpha beta gamma delta epsilon zeta"},
        })

        await page.goto("/")
        await expect(page.getByTestId("writing-goal-widget")).toBeVisible()
        await expect(page.getByTestId("writing-goal-today")).toBeVisible()

        // Lower the daily goal to 1 so today's words clear it -> a streak.
        await page.getByTestId("writing-goal-input").fill("1")
        await page.getByTestId("writing-goal-input").blur()
        await expect(page.getByTestId("writing-goal-streak")).toBeVisible()
    })

    test("per-chapter target persists across reload (Storyboard)", async ({page}) => {
        const book = await createBook("Chapter Target E2E")
        const ch = await createChapter(book.id, "Chapter 1", "some prose")

        await page.goto(`/book/${book.id}?view=storyboard`)
        const target = page.getByTestId(`prose-storyboard-target-${ch.id}`)
        await expect(target).toBeVisible()
        await target.fill("2500")
        await target.blur()

        await page.reload()
        await expect(page.getByTestId(`prose-storyboard-target-${ch.id}`)).toHaveValue("2500")
    })

    test("book word-target + deadline shows the words/day hint", async ({page}) => {
        const book = await createBook("Book Target E2E")

        await page.goto(`/book/${book.id}?view=metadata`)
        await page.getByTestId("metadata-tab-story").click()
        await page.getByTestId("metadata-word-target").fill("80000")
        // A clearly-future deadline so days-left is positive.
        await page.getByTestId("metadata-word-target-deadline").fill("2099-12-31")
        await expect(page.getByTestId("metadata-words-per-day")).toBeVisible()
    })
})
