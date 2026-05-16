/**
 * Bug 10 E2E smoke: full trash-lifecycle on the Comments-Admin tab.
 *
 * Pinned flow:
 *
 *   active → soft-delete row → trash-badge appears
 *   → switch to trash view → restore → row reappears in active
 *   → soft-delete again → trash view → permanent-delete-from-trash
 *   → confirm dialog → row gone from DB
 *
 * Plus bulk paths:
 *
 *   → trash view → select 2 → bulk-restore → both reappear active
 *   → trash view → select 2 → bulk-permanent → TypeToConfirmDialog
 *   → confirmed → both gone from DB
 *
 * The Vitest layer pins the testid surface + state machine; this
 * spec proves the full user flow under a real browser (Radix portal
 * + react-toastify + confirm-dialog surfaces all behave under happy-
 * dom unreliably, per the existing "Radix DropdownMenu + happy-dom"
 * lessons-learned rule).
 */

import {test, expect} from "../fixtures/base";

const API = "http://localhost:8000/api";

async function postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        throw new Error(`POST ${path}: ${res.status} ${await res.text()}`);
    }
    return res.json();
}

async function getJson<T>(path: string): Promise<T> {
    const res = await fetch(`${API}${path}`);
    if (!res.ok) {
        throw new Error(`GET ${path}: ${res.status} ${await res.text()}`);
    }
    return res.json();
}

/** Seeds N comments via the article → reclassify-as-comment round-
 *  trip. Same pattern as comments-admin-bulk-delete.spec.ts. */
async function seedComments(n: number, label: string): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
        const article = await postJson<{id: string}>("/articles", {
            title: `${label}-${i}-${Date.now()}`,
            author: "Asterios",
        });
        const reclassified = await postJson<{comment_id: string}>(
            `/articles/${article.id}/reclassify-as-comment`,
            {},
        );
        ids.push(reclassified.comment_id);
    }
    return ids;
}

test.describe("Comments trash-lifecycle (Bug 10)", () => {
    test("single soft-delete → trash view shows row → restore → back in active", async ({
        page,
    }) => {
        const [commentId] = await seedComments(1, "trash-single");

        await page.goto("/settings?tab=comments");
        await expect(
            page.getByTestId(`comments-admin-row-${commentId}`),
        ).toBeVisible({timeout: 5000});

        // Per-row delete → moves to trash.
        await page.getByTestId(`comments-admin-delete-${commentId}`).click();
        // Simple confirm dialog (AppDialog.confirm).
        await page.getByRole("button", {name: /(Bestätigen|Confirm|OK)/}).click();

        await expect(
            page.getByTestId(`comments-admin-row-${commentId}`),
        ).not.toBeVisible({timeout: 5000});

        // Badge appears with count = 1 (refresh probe after delete).
        await expect(page.getByTestId("comments-trash-badge")).toContainText(
            "1",
            {timeout: 5000},
        );

        // Switch to trash view.
        await page.getByTestId("comments-trash-toggle").click();
        await expect(
            page.getByTestId(`comments-trash-row-${commentId}`),
        ).toBeVisible({timeout: 5000});

        // Restore.
        await page.getByTestId(`comments-trash-restore-${commentId}`).click();
        await expect(
            page.getByTestId(`comments-trash-row-${commentId}`),
        ).not.toBeVisible({timeout: 5000});

        // Badge gone.
        await expect(page.getByTestId("comments-trash-badge")).toHaveCount(0);

        // Switch back to active view → row visible again.
        await page.getByTestId("comments-active-toggle").click();
        await expect(
            page.getByTestId(`comments-admin-row-${commentId}`),
        ).toBeVisible({timeout: 5000});

        // Backend confirms: row is live (deleted_at IS NULL).
        const live = await getJson<Array<{id: string}>>(
            "/comments?limit=500",
        );
        expect(live.find((c) => c.id === commentId)).toBeDefined();
    });

    test("permanent-delete-from-trash via confirm dialog removes row from DB", async ({
        page,
    }) => {
        const [commentId] = await seedComments(1, "trash-perm");

        await page.goto("/settings?tab=comments");
        await expect(
            page.getByTestId(`comments-admin-row-${commentId}`),
        ).toBeVisible({timeout: 5000});

        await page.getByTestId(`comments-admin-delete-${commentId}`).click();
        await page.getByRole("button", {name: /(Bestätigen|Confirm|OK)/}).click();

        await page.getByTestId("comments-trash-toggle").click();
        await expect(
            page.getByTestId(`comments-trash-row-${commentId}`),
        ).toBeVisible({timeout: 5000});

        // Click permanent-delete → confirm dialog (danger variant of
        // AppDialog.confirm) → confirm.
        await page
            .getByTestId(`comments-trash-permanent-${commentId}`)
            .click();
        await page.getByRole("button", {name: /(Bestätigen|Confirm|OK)/}).click();

        // Row gone from the trash view + the trash backend list.
        await expect(
            page.getByTestId(`comments-trash-row-${commentId}`),
        ).not.toBeVisible({timeout: 5000});

        const trashed = await getJson<Array<{id: string}>>(
            "/comments/trash/list",
        );
        expect(trashed.find((c) => c.id === commentId)).toBeUndefined();
        const live = await getJson<Array<{id: string}>>(
            "/comments?limit=500",
        );
        expect(live.find((c) => c.id === commentId)).toBeUndefined();
    });

    test("bulk-restore returns selected rows to the active list", async ({
        page,
    }) => {
        const ids = await seedComments(2, "bulk-restore");

        await page.goto("/settings?tab=comments");
        // Move both to trash via the active-view bulk bar.
        for (const id of ids) {
            await expect(
                page.getByTestId(`comments-admin-row-${id}`),
            ).toBeVisible({timeout: 5000});
        }
        await page.getByTestId("comments-admin-select-all").click();
        await page.getByTestId("comment-bulk-delete-menu").click();
        await page.getByTestId("comment-bulk-delete-trash").click();
        for (const id of ids) {
            await expect(
                page.getByTestId(`comments-admin-row-${id}`),
            ).not.toBeVisible({timeout: 5000});
        }

        // Switch to trash view + select both rows + bulk-restore.
        await page.getByTestId("comments-trash-toggle").click();
        for (const id of ids) {
            await expect(
                page.getByTestId(`comments-trash-row-${id}`),
            ).toBeVisible({timeout: 5000});
        }
        await page.getByTestId("comments-trash-select-all").click();
        await expect(
            page.getByTestId("comments-trash-bulk-action-bar"),
        ).toBeVisible();
        await page.getByTestId("comments-trash-bulk-restore").click();

        for (const id of ids) {
            await expect(
                page.getByTestId(`comments-trash-row-${id}`),
            ).not.toBeVisible({timeout: 5000});
        }

        // Backend: both rows are live again.
        const live = await getJson<Array<{id: string}>>(
            "/comments?limit=500",
        );
        for (const id of ids) {
            expect(live.find((c) => c.id === id)).toBeDefined();
        }
    });

    test("bulk-permanent in trash gated by TypeToConfirmDialog hard-deletes the rows", async ({
        page,
    }) => {
        const ids = await seedComments(2, "bulk-trash-perm");

        await page.goto("/settings?tab=comments");
        for (const id of ids) {
            await expect(
                page.getByTestId(`comments-admin-row-${id}`),
            ).toBeVisible({timeout: 5000});
        }
        await page.getByTestId("comments-admin-select-all").click();
        await page.getByTestId("comment-bulk-delete-menu").click();
        await page.getByTestId("comment-bulk-delete-trash").click();
        for (const id of ids) {
            await expect(
                page.getByTestId(`comments-admin-row-${id}`),
            ).not.toBeVisible({timeout: 5000});
        }

        await page.getByTestId("comments-trash-toggle").click();
        await page.getByTestId("comments-trash-select-all").click();
        await page.getByTestId("comments-trash-bulk-permanent").click();

        // Type-to-confirm dialog with count = 2.
        const dialog = page.getByTestId("type-to-confirm-dialog");
        await expect(dialog).toBeVisible();
        const confirmBtn = page.getByTestId("type-to-confirm-confirm");
        await expect(confirmBtn).toBeDisabled();
        await page.getByTestId("type-to-confirm-input").fill(String(ids.length));
        await expect(confirmBtn).toBeEnabled();
        await confirmBtn.click();

        // Rows gone from both lists + DB.
        for (const id of ids) {
            await expect(
                page.getByTestId(`comments-trash-row-${id}`),
            ).not.toBeVisible({timeout: 5000});
        }
        const trashed = await getJson<Array<{id: string}>>(
            "/comments/trash/list",
        );
        for (const id of ids) {
            expect(trashed.find((c) => c.id === id)).toBeUndefined();
        }
    });
});
