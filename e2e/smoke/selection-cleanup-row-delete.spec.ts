/**
 * Selection-cleanup on row-delete smoke (BULK-SELECTION-ROWDELETE-PLAYWRIGHT-01).
 *
 * Retroactive E2E coverage for commit 02553fb (fix(ui): clear bulk
 * selection when row-deleted item is the selected one). The bug:
 *
 *   1. User selects a single article/book via its bulk-checkbox.
 *   2. BulkActionBar mounts showing "1 selected".
 *   3. User opens the row-menu on the SAME item and clicks Delete.
 *   4. Item disappears from the list (soft-deleted, in trash).
 *   5. Before the fix: BulkActionBar stays visible referencing an
 *      orphan id.
 *   6. After the fix: selection.remove(id) drops the count to 0,
 *      the bar unmounts (Bibliogon's convention is hide-when-empty,
 *      see lessons-learned "Bibliogon's bar-visibility convention
 *      at count===0").
 *
 * Two assertions per surface (Articles + Books):
 *   a) After row-delete, the BulkActionBar is no longer visible.
 *   b) The bulk-count testid no longer exists in the DOM.
 *
 * Inverse coverage (kept in the same spec to pin the contract):
 *   c) Selecting item A, then row-deleting an UNRELATED item B
 *      leaves A's selection intact. This pins that selection.remove
 *      doesn't over-cleanup.
 *
 * Hook-level Vitest tests (useArticleSelection.test.ts +
 * useBookSelection.test.ts) cover the contract semantics; this E2E
 * pins the wiring end-to-end (UI → handler → hook → bar visibility).
 */

import {
    test,
    expect,
    createBook,
    createArticle,
    softDeleteArticleViaKebab,
    softDeleteBookViaKebab,
} from "../fixtures/base"

test.describe("Selection cleanup after row-delete (Articles)", () => {
    test("row-delete on the selected article unmounts the BulkActionBar", async ({
        page,
    }) => {
        const a = await createArticle("Selection Cleanup Alpha")

        await page.goto("/articles")
        await expect(page.getByTestId(`article-bulk-check-${a.id}`)).toBeVisible()

        // Select the article.
        await page.getByTestId(`article-bulk-check-${a.id}`).check()

        // Bar mounts with count=1.
        const bar = page.getByTestId("article-bulk-action-bar")
        await expect(bar).toBeVisible()
        await expect(page.getByTestId("article-bulk-count")).toContainText(/^1/)

        // Row-delete via the article card menu (race-robust helper).
        await softDeleteArticleViaKebab(page, a.id)

        // Item gone from the live grid.
        await expect(page.getByTestId(`article-bulk-check-${a.id}`)).toBeHidden()

        // The load-bearing assertion: BulkActionBar unmounted because
        // selection.count dropped to 0 via the new `remove(id)` call.
        await expect(bar).toBeHidden()
        await expect(page.getByTestId("article-bulk-count")).toBeHidden()
    })

    test("row-delete on an UNRELATED article preserves the selection", async ({
        page,
    }) => {
        const keep = await createArticle("Selection Keeper")
        const drop = await createArticle("Selection Dropper")

        await page.goto("/articles")
        await expect(page.getByTestId(`article-bulk-check-${keep.id}`)).toBeVisible()

        // Select ONLY "keep".
        await page.getByTestId(`article-bulk-check-${keep.id}`).check()
        await expect(page.getByTestId("article-bulk-count")).toContainText(/^1/)

        // Row-delete "drop" (NOT in selection).
        await softDeleteArticleViaKebab(page, drop.id)

        // "drop" gone, but "keep" still selected and the bar still
        // shows count=1 — pins that `remove(id)` does NOT touch other
        // ids in the set.
        await expect(page.getByTestId(`article-bulk-check-${drop.id}`)).toBeHidden()
        await expect(page.getByTestId("article-bulk-action-bar")).toBeVisible()
        await expect(page.getByTestId("article-bulk-count")).toContainText(/^1/)
        await expect(
            page.getByTestId(`article-bulk-check-${keep.id}`),
        ).toBeChecked()
    })
})

test.describe("Selection cleanup after row-delete (Books)", () => {
    test("row-delete on the selected book unmounts the BulkActionBar", async ({
        page,
    }) => {
        const a = await createBook("Selection Cleanup Alpha")

        await page.goto("/")
        await expect(page.getByTestId(`book-bulk-check-${a.id}`)).toBeVisible()

        await page.getByTestId(`book-bulk-check-${a.id}`).check()

        const bar = page.getByTestId("book-bulk-action-bar")
        await expect(bar).toBeVisible()
        await expect(page.getByTestId("book-bulk-count")).toContainText(/^1/)

        await softDeleteBookViaKebab(page, a.id)

        await expect(page.getByTestId(`book-bulk-check-${a.id}`)).toBeHidden()
        await expect(bar).toBeHidden()
        await expect(page.getByTestId("book-bulk-count")).toBeHidden()
    })

    test("row-delete on an UNRELATED book preserves the selection", async ({
        page,
    }) => {
        const keep = await createBook("Selection Keeper")
        const drop = await createBook("Selection Dropper")

        await page.goto("/")
        await expect(page.getByTestId(`book-bulk-check-${keep.id}`)).toBeVisible()

        await page.getByTestId(`book-bulk-check-${keep.id}`).check()
        await expect(page.getByTestId("book-bulk-count")).toContainText(/^1/)

        await softDeleteBookViaKebab(page, drop.id)

        await expect(page.getByTestId(`book-bulk-check-${drop.id}`)).toBeHidden()
        await expect(page.getByTestId("book-bulk-action-bar")).toBeVisible()
        await expect(page.getByTestId("book-bulk-count")).toContainText(/^1/)
        await expect(
            page.getByTestId(`book-bulk-check-${keep.id}`),
        ).toBeChecked()
    })
})
