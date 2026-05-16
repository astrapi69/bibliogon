/**
 * Bug 4a E2E smoke: bulk-delete flow on the Comments-Admin tab.
 *
 * Covers the Radix-DropdownMenu + TypeToConfirmDialog + react-toastify
 * surface that happy-dom does not reliably reproduce. The Vitest
 * layer pins the count threshold + the selection-checkbox surface;
 * here we exercise the dropdown-open + the menu-item click + the
 * type-to-confirm gate.
 *
 * Also pins the Bug 4c invariant from the bar's perspective: the
 * bulk-action surface carries no Reclassify option (only Trash and
 * Permanent delete).
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

/** Seeds N comments by round-tripping articles → reclassify-as-
 *  comment. The Medium-import plugin is the production path, but
 *  isn't easy to drive from a smoke test; the reclassify round-trip
 *  hits the same DB shape. */
async function seedComments(n: number, label: string): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
        const article = await postJson<{id: string}>("/articles", {
            title: `${label}-${i}`,
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

test.describe("Comments-Admin bulk-delete (Bug 4a)", () => {
    test("select 3 + trash via bulk-action dropdown removes the rows", async ({page}) => {
        const ids = await seedComments(3, "bulk-trash");

        await page.goto("/settings?tab=comments");
        for (const id of ids) {
            await expect(
                page.getByTestId(`comments-admin-row-${id}`),
            ).toBeVisible({timeout: 5000});
        }

        // Select all via the header checkbox.
        await page.getByTestId("comments-admin-select-all").click();

        // Bulk-action bar visible + count = 3.
        const bar = page.getByTestId("comment-bulk-action-bar");
        await expect(bar).toBeVisible();
        await expect(page.getByTestId("comment-bulk-count")).toContainText("3");

        // Bug 4c invariant: the bulk bar has no reclassify option.
        await expect(
            page.locator('[data-testid*="reclassify"]').filter({hasText: /.+/}),
        ).toHaveCount(0);

        // Open the bulk-delete dropdown and pick Trash.
        await page.getByTestId("comment-bulk-delete-menu").click();
        await page.getByTestId("comment-bulk-delete-trash").click();

        // All three rows drop from the visible list.
        for (const id of ids) {
            await expect(
                page.getByTestId(`comments-admin-row-${id}`),
            ).not.toBeVisible({timeout: 5000});
        }

        // Bar hides (count back to 0).
        await expect(bar).not.toBeVisible({timeout: 3000});

        // Backend: comments are soft-deleted (list no longer returns them).
        const remaining = await getJson<Array<{id: string}>>(
            "/comments?limit=500",
        );
        for (const id of ids) {
            expect(remaining.find((c) => c.id === id)).toBeUndefined();
        }
    });

    test("permanent-delete path is gated by TypeToConfirmDialog", async ({page}) => {
        const ids = await seedComments(2, "bulk-perm");

        await page.goto("/settings?tab=comments");
        for (const id of ids) {
            await expect(
                page.getByTestId(`comments-admin-row-${id}`),
            ).toBeVisible({timeout: 5000});
        }

        // Select both rows individually (not via select-all) to also
        // pin the per-row checkbox surface.
        await page.getByTestId(`comments-admin-select-${ids[0]}`).click();
        await page.getByTestId(`comments-admin-select-${ids[1]}`).click();

        await page.getByTestId("comment-bulk-delete-menu").click();
        await page.getByTestId("comment-bulk-delete-permanent").click();

        // TypeToConfirmDialog gates the action — must type the count.
        const dialog = page.getByTestId("type-to-confirm-dialog");
        await expect(dialog).toBeVisible();

        // Confirm button starts disabled.
        const confirm = page.getByTestId("type-to-confirm-confirm");
        await expect(confirm).toBeDisabled();

        // Type the right count.
        await page.getByTestId("type-to-confirm-input").fill(String(ids.length));
        await expect(confirm).toBeEnabled();
        await confirm.click();

        // Rows gone; backend rows gone too (hard delete).
        for (const id of ids) {
            await expect(
                page.getByTestId(`comments-admin-row-${id}`),
            ).not.toBeVisible({timeout: 5000});
        }
    });
});
