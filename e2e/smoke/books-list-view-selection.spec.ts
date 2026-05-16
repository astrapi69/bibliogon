/**
 * v0.33.0 Bug 2 E2E smoke: BookDashboard list-view bulk-select +
 * bulk-action flow.
 *
 * Pins the fix where BookListView gained selection checkboxes.
 * Six tests:
 *
 *   1. List view shows a checkbox per row.
 *   2. Clicking a row's checkbox selects it; BulkActionBar appears.
 *   3. Selection state persists when switching to grid view + back.
 *   4. AD list-view STILL has its checkbox (cross-surface regression
 *      pin against a symmetric break).
 *
 * The "bulk delete" action itself is exercised by the existing
 * bulk-delete smoke; this spec covers ONLY the selection wiring
 * that was missing on the BD list-view surface.
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

test.describe("BookDashboard list-view selection checkboxes (Bug 2)", () => {
    test("checkbox renders on every list-view row", async ({page}) => {
        const a = await postJson<{id: string}>("/books", {title: "BD smoke A", author: "T"});
        const b = await postJson<{id: string}>("/books", {title: "BD smoke B", author: "T"});

        await page.goto("/");
        // Switch to list view (view-toggle is testid-stable).
        await page.getByTestId("view-toggle-list").click();

        await expect(page.getByTestId(`book-bulk-check-${a.id}`)).toBeVisible();
        await expect(page.getByTestId(`book-bulk-check-${b.id}`)).toBeVisible();
    });

    test("checking a row shows the BulkActionBar", async ({page}) => {
        const a = await postJson<{id: string}>("/books", {title: "BD smoke C", author: "T"});

        await page.goto("/");
        await page.getByTestId("view-toggle-list").click();

        await page.getByTestId(`book-bulk-check-${a.id}`).check();

        // BulkActionBar is the shared component shown when count > 0.
        await expect(page.getByTestId("book-bulk-action-bar")).toBeVisible();
    });

    test("selection persists across list <-> grid view switches", async ({page}) => {
        const a = await postJson<{id: string}>("/books", {title: "BD smoke D", author: "T"});

        await page.goto("/");
        await page.getByTestId("view-toggle-list").click();
        await page.getByTestId(`book-bulk-check-${a.id}`).check();

        // Switch to grid view and back. The grid view's checkbox is
        // already at the same testid pattern; selection state lives in
        // the page-level hook so the checkbox stays checked.
        await page.getByTestId("view-toggle-grid").click();
        await expect(page.getByTestId(`book-bulk-check-${a.id}`)).toBeChecked();

        await page.getByTestId("view-toggle-list").click();
        await expect(page.getByTestId(`book-bulk-check-${a.id}`)).toBeChecked();
    });
});

test.describe("AD list-view regression pin (cross-surface)", () => {
    test("ArticleList list-view STILL renders checkboxes", async ({page}) => {
        const a = await postJson<{id: string}>("/articles", {title: "AD regression"});

        await page.goto("/articles");
        await page.getByTestId("view-toggle-list").click();

        // Regression pin: ArticleList list-view had this feature first;
        // the BookListView fix MUST NOT have regressed it (symmetric
        // break pattern).
        await expect(page.getByTestId(`article-bulk-check-${a.id}`)).toBeVisible();
    });
});
