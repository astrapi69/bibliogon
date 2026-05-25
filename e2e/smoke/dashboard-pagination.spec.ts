/**
 * DASHBOARD-PAGINATION-LOAD-MORE-01 C8: dashboard pagination smoke.
 *
 * Positive regression-pin for the "Load more" + page-size dropdown
 * UI shipped in C5 (Book dashboard) + C6 (Article dashboard).
 *
 * Per the testid-namespace-pinning + bounding-box-dimension
 * disciplines in lessons-learned: the spec exercises EVERY pinned
 * testid positively (load-more button + page-size selector) and
 * asserts the slice contract via measurable UI state (visible row
 * count before vs after loadMore).
 *
 * Two surfaces, two test blocks (per the Articles-vs-Books
 * parallel-surface asymmetry rule): each surface gets its own
 * coverage so a future refactor that breaks one cannot hide
 * behind the other's tests.
 */

import { test, expect } from "../fixtures/base";
import { createBook } from "../helpers/api";

const API = "http://localhost:8000/api";

async function createArticle(title: string): Promise<{ id: string; title: string }> {
    const res = await fetch(`${API}/articles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
    });
    if (!res.ok) throw new Error(`create article: ${res.status}`);
    return res.json();
}

async function setPageSize(scope: "books" | "articles", size: number): Promise<void> {
    const key = scope === "books" ? "books_page_size" : "articles_page_size";
    const res = await fetch(`${API}/settings/app`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ui: { dashboard: { [key]: size } } }),
    });
    if (!res.ok) throw new Error(`set page-size: ${res.status}`);
}

test.describe("Dashboard pagination (Books)", () => {
    test("Load more grows the visible book count by pageSize", async ({ page }) => {
        // Seed 12 books — enough to overflow the smallest page-size
        // (10) so the "Load more" button is forced to appear.
        await setPageSize("books", 10);
        for (let i = 0; i < 12; i++) {
            await createBook(`Page Book ${String(i).padStart(2, "0")}`);
        }

        await page.goto("/");

        // Wait for the pagination block to mount (it only renders
        // when there's at least 1 book — guards against flake on
        // the empty-state path).
        await expect(page.getByTestId("dashboard-pagination")).toBeVisible();

        // Page-size dropdown is addressable + shows the persisted value.
        const selector = page.getByTestId("dashboard-page-size-select");
        await expect(selector).toBeVisible();
        await expect(selector).toHaveValue("10");

        // Load-more is visible (12 > 10) + clicking it expands the slice.
        const loadMore = page.getByTestId("dashboard-load-more");
        await expect(loadMore).toBeVisible();

        // Count visible book tiles BEFORE loadMore.
        const tilesBefore = await page.locator('[data-testid^="book-bulk-check-"]').count();
        expect(tilesBefore).toBe(10);

        await loadMore.click();

        // Visible tiles grow by pageSize, capped at total.
        const tilesAfter = await page.locator('[data-testid^="book-bulk-check-"]').count();
        expect(tilesAfter).toBe(12);

        // Load-more disappears once the full list is shown.
        await expect(loadMore).toBeHidden();
        // Page-size selector remains.
        await expect(selector).toBeVisible();
    });

    test("Page-size dropdown persists via settings PATCH", async ({ page }) => {
        await setPageSize("books", 25);
        for (let i = 0; i < 3; i++) {
            await createBook(`Persist Book ${i}`);
        }

        await page.goto("/");
        await expect(page.getByTestId("dashboard-pagination")).toBeVisible();

        const selector = page.getByTestId("dashboard-page-size-select");
        await selector.selectOption("50");

        // Verify the PATCH landed by re-reading from the backend.
        const res = await fetch(`${API}/settings/app`);
        const config = await res.json();
        expect(config.ui?.dashboard?.books_page_size).toBe(50);
    });
});

test.describe("Dashboard pagination (Articles)", () => {
    test("Load more grows the visible article count by pageSize", async ({ page }) => {
        await setPageSize("articles", 10);
        for (let i = 0; i < 12; i++) {
            await createArticle(`Page Article ${String(i).padStart(2, "0")}`);
        }

        await page.goto("/articles");

        await expect(page.getByTestId("article-list-pagination")).toBeVisible();

        const selector = page.getByTestId("article-list-page-size-select");
        await expect(selector).toBeVisible();
        await expect(selector).toHaveValue("10");

        const loadMore = page.getByTestId("article-list-load-more");
        await expect(loadMore).toBeVisible();

        const tilesBefore = await page.locator('[data-testid^="article-bulk-check-"]').count();
        expect(tilesBefore).toBe(10);

        await loadMore.click();

        const tilesAfter = await page.locator('[data-testid^="article-bulk-check-"]').count();
        expect(tilesAfter).toBe(12);

        await expect(loadMore).toBeHidden();
        await expect(selector).toBeVisible();
    });

    test("Page-size dropdown persists via settings PATCH", async ({ page }) => {
        await setPageSize("articles", 25);
        for (let i = 0; i < 3; i++) {
            await createArticle(`Persist Article ${i}`);
        }

        await page.goto("/articles");
        await expect(page.getByTestId("article-list-pagination")).toBeVisible();

        const selector = page.getByTestId("article-list-page-size-select");
        await selector.selectOption("100");

        const res = await fetch(`${API}/settings/app`);
        const config = await res.json();
        expect(config.ui?.dashboard?.articles_page_size).toBe(100);
    });
});
