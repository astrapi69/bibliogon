/**
 * View-mode testid-parity smoke (VIEW-MODE-TESTID-PARITY-01).
 *
 * Regression-pin for the audit finding that the BookCard
 * (`book-card-{id}`) and BookListView (`book-list-row-{id}`)
 * testid namespaces were asymmetric, causing E2E specs to
 * silently skip when the wrong view-mode was persisted in
 * localStorage. The fix added a view-agnostic
 * `data-book-id={id}` attribute to BOTH wrappers (and the
 * matching `data-article-id={id}` to ArticleCard + ArticleRow).
 *
 * This spec proves that a `[data-book-id="X"]` / `[data-article-id="X"]`
 * selector finds the same wrapper regardless of view mode. If a
 * future refactor breaks parity (removes the attribute from one
 * wrapper, renames one side, etc.), this spec catches it.
 *
 * Why "view-agnostic" matters: E2E specs that test data correctness
 * (e.g. "after delete, the row is gone") don't care which view is
 * active. Forcing them to set the view mode before each test, or
 * use two different selectors per test, makes the specs brittle
 * AND prone to silent-skip when the test selects the wrong view.
 * The parity attribute lets the spec use one selector for both.
 */

import {test, expect, createBook, createArticle} from "../fixtures/base";
import type {Page} from "@playwright/test";

async function switchView(page: Page, mode: "grid" | "list"): Promise<void> {
    await page.getByTestId(`view-toggle-${mode}`).click();
}

test.describe("View-mode parity - books", () => {
    test("[data-book-id] selector resolves in both grid and list views", async ({
        page,
    }) => {
        const book = await createBook("View Parity Smoke");

        await page.goto("/");

        // Force grid view first.
        await switchView(page, "grid");
        const selector = `[data-book-id="${book.id}"]`;
        await expect(page.locator(selector)).toHaveCount(1);

        // The grid wrapper carries the view-specific testid too.
        await expect(page.getByTestId(`book-card-${book.id}`)).toBeVisible();

        // Switch to list view.
        await switchView(page, "list");
        await expect(page.locator(selector)).toHaveCount(1);

        // The list wrapper carries its own view-specific testid.
        await expect(page.getByTestId(`book-list-row-${book.id}`)).toBeVisible();
    });
});

test.describe("View-mode parity - articles", () => {
    test("[data-article-id] selector resolves in both grid and list views", async ({
        page,
    }) => {
        const article = await createArticle({title: "View Parity Article Smoke"});

        await page.goto("/articles");

        // Wait for grid render. We use the bulk-check testid as
        // the existing canary for "list loaded".
        await expect(
            page.getByTestId(`article-bulk-check-${article.id}`),
        ).toBeVisible();

        // Grid view first.
        await switchView(page, "grid");
        const selector = `[data-article-id="${article.id}"]`;
        await expect(page.locator(selector)).toHaveCount(1);
        await expect(page.getByTestId(`article-card-${article.id}`)).toBeVisible();

        // List view.
        await switchView(page, "list");
        await expect(page.locator(selector)).toHaveCount(1);
        await expect(
            page.getByTestId(`article-list-row-${article.id}`),
        ).toBeVisible();
    });
});
