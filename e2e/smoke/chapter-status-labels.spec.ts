/**
 * Smoke tests for per-chapter status + per-book labels
 * (CHAPTER-STATUS-LABELS-01) in the prose Storyboard.
 *
 * Covers what Vitest can't (RadixSelect open/select is brittle in
 * happy-dom): assigning a status + label via the card dropdowns,
 * the resulting chips, persistence across reload, and the inline
 * label manager create/delete flow.
 *
 * Testid namespace: prose-storyboard-* (cards) +
 * prose-storyboard-labels-* (manager). data-testid selectors only.
 */
import {test, expect, createBook, createChapter} from "../fixtures/base"

const API = "http://localhost:8000/api"

test.describe("Chapter status + labels", () => {
    test("assign status + label via the card, chips persist across reload", async ({page}) => {
        const book = await createBook("Status Labels E2E")
        const ch = await createChapter(book.id, "Opening", "Alice walked into the woods.")
        // Seed a label via the API so its id is known for the select item.
        const label = await (
            await page.request.post(`${API}/books/${book.id}/chapter-labels`, {
                data: {name: "Needs work", color: "#FF6B6B"},
            })
        ).json()

        await page.goto(`/book/${book.id}?view=storyboard`)
        await expect(page.getByTestId(`prose-storyboard-card-${ch.id}`)).toBeVisible()

        // Assign status "revised" via the RadixSelect.
        await page.getByTestId(`prose-storyboard-status-select-${ch.id}-trigger`).click()
        await page.getByTestId(`prose-storyboard-status-select-${ch.id}-item-revised`).click()
        const statusChip = page.getByTestId(`prose-storyboard-status-chip-${ch.id}`)
        await expect(statusChip).toBeVisible()
        await expect(statusChip).toHaveAttribute("data-status", "revised")

        // Assign the label via the RadixSelect.
        await page.getByTestId(`prose-storyboard-label-select-${ch.id}-trigger`).click()
        await page.getByTestId(`prose-storyboard-label-select-${ch.id}-item-${label.id}`).click()
        const labelChip = page.getByTestId(`prose-storyboard-label-chip-${ch.id}`)
        await expect(labelChip).toBeVisible()
        await expect(labelChip).toContainText("Needs work")

        // Persist across reload.
        await page.reload()
        await expect(page.getByTestId(`prose-storyboard-status-chip-${ch.id}`)).toHaveAttribute(
            "data-status",
            "revised",
        )
        await expect(page.getByTestId(`prose-storyboard-label-chip-${ch.id}`)).toContainText(
            "Needs work",
        )
    })

    test("inline label manager creates and deletes labels", async ({page}) => {
        const book = await createBook("Label Manager E2E")
        await createChapter(book.id, "Chapter 1", "Some prose.")

        await page.goto(`/book/${book.id}?view=storyboard`)
        await page.getByTestId("prose-storyboard-manage-labels").click()
        await expect(page.getByTestId("prose-storyboard-labels-manager")).toBeVisible()

        // Create a label.
        await page.getByTestId("prose-storyboard-labels-new-name").fill("To revise")
        await page.getByTestId("prose-storyboard-labels-add").click()
        const rows = page.locator('[data-testid^="prose-storyboard-labels-row-"]')
        await expect(rows).toHaveCount(1)

        // Delete it.
        await page
            .locator('[data-testid^="prose-storyboard-labels-delete-"]')
            .first()
            .click()
        await expect(rows).toHaveCount(0)
    })
})
