/**
 * Bulk-delete UI smoke spec (BULK-DELETE-PLAYWRIGHT-SMOKE-01).
 *
 * Filed by the v0.31.0 pre-release coverage audit (A1, critical):
 * bulk-delete is data-destructive — the 200-row cap was removed
 * in v0.31.0 and the only user-facing guards are the
 * TypeToConfirmDialog numeric gate (permanent path) and the
 * notify.bulkAction Undo toast (soft path). Neither was pinned
 * end-to-end before this commit; ai-workflow.md step 7 requires
 * at least one Playwright smoke per new UI feature.
 *
 * Covers the three call-outs from the audit triage:
 *
 *   1. type-to-confirm gate blocks the confirm button until the
 *      typed value matches the count.
 *   2. soft-delete (move to trash) shows the Undo toast and
 *      restores books on Undo.
 *   3. count=1 falls through correctly: the bulk-delete dropdown
 *      stays disabled at count < 2, forcing the user to the
 *      existing per-card delete flow.
 *
 * Books used over Articles because Books carry the larger UX
 * surface (Dashboard + BookCard tile checkboxes + bulk action
 * bar with both AI + delete dropdowns). The article path is
 * structurally identical (same TypeToConfirmDialog + same
 * notify.bulkAction toast); covering Books is enough for the
 * smoke pyramid.
 */

import {test, expect, createBook} from "../fixtures/base"
import {clickMenuItem} from "../helpers/ui";

const API = "http://localhost:8000/api"

test.describe("Bulk delete - data-destructive UI guards", () => {
    test("count=1: bulk-delete dropdown stays disabled and forces per-card flow", async ({
        page,
    }) => {
        const a = await createBook("Single Book Alpha", "Author A")

        await page.goto("/")
        await expect(page.getByTestId(`book-bulk-check-${a.id}`)).toBeVisible()

        // Select a single book.
        await page.getByTestId(`book-bulk-check-${a.id}`).check()

        // Bulk-action bar appears with count=1.
        const bar = page.getByTestId("book-bulk-action-bar")
        await expect(bar).toBeVisible()
        await expect(page.getByTestId("book-bulk-count")).toContainText(/^1/)

        // The delete-menu trigger MUST be disabled because count < 2.
        // This is the load-bearing assertion of this test: it pins the
        // count >= 2 gate that protects users from accidentally
        // bulk-deleting via a flow meant for genuine bulk operations.
        const deleteMenu = page.getByTestId("book-bulk-delete-menu")
        await expect(deleteMenu).toBeVisible()
        await expect(deleteMenu).toBeDisabled()

        // The dropdown should not open even when clicked (Radix
        // respects the disabled attribute on the trigger). The
        // permanent-delete option must NOT be reachable from here.
        // Use a short timeout because a successful open would already
        // be visible by then.
        await deleteMenu.click({force: true}).catch(() => undefined)
        await expect(
            page.getByTestId("book-bulk-delete-menu-content"),
        ).toBeHidden({timeout: 1000})
        await expect(
            page.getByTestId("book-bulk-delete-permanent"),
        ).toBeHidden()
    })

    test("soft-delete + Undo: trashed books restore from the toast", async ({
        page,
    }) => {
        const a = await createBook("Trash Roundtrip Alpha", "Author A")
        const b = await createBook("Trash Roundtrip Beta", "Author B")

        await page.goto("/")
        await expect(page.getByTestId(`book-bulk-check-${a.id}`)).toBeVisible()

        // Select both.
        await page.getByTestId(`book-bulk-check-${a.id}`).check()
        await page.getByTestId(`book-bulk-check-${b.id}`).check()
        await expect(page.getByTestId("book-bulk-count")).toContainText(/^2/)

        // Open the bulk-delete dropdown and choose "Move to trash".
        await clickMenuItem(page, "book-bulk-delete-menu")
        await expect(
            page.getByTestId("book-bulk-delete-menu-content"),
        ).toBeVisible()
        await page.getByTestId("book-bulk-delete-trash").click()

        // Both tiles disappear from the dashboard grid (they are
        // soft-deleted; deleted_at is set so the default GET /books
        // filter hides them).
        await expect(
            page.getByTestId(`book-bulk-check-${a.id}`),
        ).toBeHidden({timeout: 5000})
        await expect(
            page.getByTestId(`book-bulk-check-${b.id}`),
        ).toBeHidden()

        // The notify.bulkAction toast carries the Undo button. The
        // testid lives in BulkActionContent (see utils/notify.ts).
        const undoBtn = page.getByTestId("bulk-action-undo")
        await expect(undoBtn).toBeVisible({timeout: 5000})

        // Backend confirms the trash row count via /api/trash. Two
        // entries pre-Undo.
        const trashBefore = await page.request.get(`${API}/books/trash/list`)
        expect(trashBefore.ok()).toBe(true)
        const trashBeforeBody = (await trashBefore.json()) as Array<{id: string}>
        expect(trashBeforeBody.map((x) => x.id).sort()).toEqual(
            [a.id, b.id].sort(),
        )

        // Click Undo.
        await undoBtn.click()

        // Both tiles return to the dashboard grid.
        await expect(
            page.getByTestId(`book-bulk-check-${a.id}`),
        ).toBeVisible({timeout: 5000})
        await expect(page.getByTestId(`book-bulk-check-${b.id}`)).toBeVisible()

        // Trash is now empty.
        const trashAfter = await page.request.get(`${API}/books/trash/list`)
        expect(trashAfter.ok()).toBe(true)
        expect((await trashAfter.json()) as unknown[]).toEqual([])
    })

    test("permanent delete: type-to-confirm gate blocks confirm until exact count typed", async ({
        page,
    }) => {
        const a = await createBook("Permanent Delete Alpha", "Author A")
        const b = await createBook("Permanent Delete Beta", "Author B")
        const c = await createBook("Permanent Delete Gamma", "Author C")

        await page.goto("/")
        await expect(page.getByTestId(`book-bulk-check-${a.id}`)).toBeVisible()

        // Select all three.
        await page.getByTestId(`book-bulk-check-${a.id}`).check()
        await page.getByTestId(`book-bulk-check-${b.id}`).check()
        await page.getByTestId(`book-bulk-check-${c.id}`).check()
        await expect(page.getByTestId("book-bulk-count")).toContainText(/^3/)

        // Open dropdown -> Endgültig löschen.
        await clickMenuItem(page, "book-bulk-delete-menu")
        await page.getByTestId("book-bulk-delete-permanent").click()

        // Dialog opens. Confirm button is disabled because nothing
        // has been typed yet.
        const dialog = page.getByTestId("type-to-confirm-dialog")
        await expect(dialog).toBeVisible()
        const confirmBtn = page.getByTestId("type-to-confirm-confirm")
        await expect(confirmBtn).toBeDisabled()

        const input = page.getByTestId("type-to-confirm-input")
        await expect(input).toBeFocused()

        // Type a WRONG count. Confirm stays disabled; the
        // type-to-confirm-error message appears.
        await input.fill("2")
        await expect(confirmBtn).toBeDisabled()
        await expect(page.getByTestId("type-to-confirm-error")).toBeVisible()

        // Clear and type the CORRECT count. Confirm enables; error
        // message goes away.
        await input.fill("")
        await input.fill("3")
        await expect(confirmBtn).toBeEnabled()
        await expect(page.getByTestId("type-to-confirm-error")).toBeHidden()

        // Confirm. All three books are gone from BOTH the dashboard
        // grid AND the trash list (permanent delete bypasses trash).
        await confirmBtn.click()
        await expect(dialog).toBeHidden({timeout: 5000})
        await expect(
            page.getByTestId(`book-bulk-check-${a.id}`),
        ).toBeHidden({timeout: 5000})
        await expect(
            page.getByTestId(`book-bulk-check-${b.id}`),
        ).toBeHidden()
        await expect(
            page.getByTestId(`book-bulk-check-${c.id}`),
        ).toBeHidden()

        // Trash must be empty: permanent delete skips trash entirely.
        const trash = await page.request.get(`${API}/books/trash/list`)
        expect(trash.ok()).toBe(true)
        expect((await trash.json()) as unknown[]).toEqual([])

        // Backend sanity: GET /books returns 0 of the deleted ids.
        const remaining = await page.request.get(`${API}/books`)
        const remainingBody = (await remaining.json()) as Array<{id: string}>
        const remainingIds = remainingBody.map((x) => x.id)
        expect(remainingIds).not.toContain(a.id)
        expect(remainingIds).not.toContain(b.id)
        expect(remainingIds).not.toContain(c.id)
    })

    // Regression pin for #417: the frontend delete handlers reused the
    // export cost-profile cap (BOOK_BULK_LIMIT_HARD / BULK_LIMIT_HARD =
    // 200) as a guard, so selecting more than 200 made the handler
    // silently early-return -- no toast, no trash, nothing. The backend
    // is uncapped; delete is a DB UPDATE per row. This seeds 201 books
    // (one past the old cap), selects all, and moves them to trash. On
    // the pre-fix code the trash stays EMPTY and this fails.
    test("soft-delete above the old 200 cap trashes every selected book (#417)", async ({
        page,
    }) => {
        const OVER_CAP = 201
        const seeded: string[] = []
        for (let start = 0; start < OVER_CAP; start += 20) {
            const batch = await Promise.all(
                Array.from(
                    {length: Math.min(20, OVER_CAP - start)},
                    (_unused, offset) =>
                        page.request.post(`${API}/books`, {
                            data: {
                                title: `Cap Regression Book ${start + offset}`,
                                author: "Author Cap",
                            },
                        }),
                ),
            )
            for (const resp of batch) {
                expect(resp.ok()).toBe(true)
                seeded.push(((await resp.json()) as {id: string}).id)
            }
        }
        expect(seeded).toHaveLength(OVER_CAP)

        await page.goto("/")
        await expect(page.getByTestId("book-bulk-select-all")).toBeVisible()

        // Select-all replaces the selection with the full filtered set
        // (all 201), not just the visible page.
        await page.getByTestId("book-bulk-select-all").check()
        await expect(page.getByTestId("book-bulk-count")).toContainText(
            String(OVER_CAP),
        )

        // The delete-menu trigger must be enabled at 201 (count >= 2);
        // the 200 cap must NOT leak onto the delete path.
        const deleteMenu = page.getByTestId("book-bulk-delete-menu")
        await expect(deleteMenu).toBeEnabled()
        await deleteMenu.click()
        await expect(
            page.getByTestId("book-bulk-delete-menu-content"),
        ).toBeVisible()
        await page.getByTestId("book-bulk-delete-trash").click()

        // Undo toast confirms the soft-delete actually ran.
        await expect(page.getByTestId("bulk-action-undo")).toBeVisible({
            timeout: 10000,
        })

        // Backend is the arbiter: all 201 rows are in trash.
        const trash = await page.request.get(`${API}/books/trash/list`)
        expect(trash.ok()).toBe(true)
        const trashed = (await trash.json()) as Array<{id: string}>
        expect(trashed).toHaveLength(OVER_CAP)
    })
})
