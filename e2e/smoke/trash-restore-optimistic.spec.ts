/**
 * Optimistic trash-restore smoke (RESTORE-UX-FEEDBACK-01).
 *
 * Regression-pin for the 2026-05-14 user report where Articles-
 * Trash Restore felt "broken" because the click handler chained
 * two roundtrips (POST .../restore + GET .../list) inside one
 * synchronous handler, producing a ~419ms perception-lag and
 * subtle post-restore feedback (transient toast only).
 *
 * The fix: optimistic update (row leaves trash BEFORE the network
 * roundtrip completes) + use the entity returned by POST /restore
 * instead of a full list refetch + revert on failure. Mirrored
 * across both surfaces (Articles + Books) per the audit's
 * Articles-vs-Books parity rule.
 *
 * Tests use ``page.route()`` to delay or fail the restore request
 * so the optimistic-update behavior is observable.
 */

import {
    test,
    expect,
    createBook,
    softDeleteArticleViaKebab,
    softDeleteBookViaKebab,
} from "../fixtures/base";

const API = "http://localhost:8000/api";

async function createArticleFixture(title: string): Promise<{id: string; title: string}> {
    const res = await fetch(`${API}/articles`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({title}),
    });
    if (!res.ok) throw new Error(`POST /articles: ${res.status}`);
    return res.json();
}

test.describe("Articles trash - optimistic restore", () => {
    test("trash row disappears before the restore request resolves", async ({page}) => {
        const article = await createArticleFixture("Optimistic Restore Smoke");

        // Soft-delete + open trash view.
        await page.goto("/articles");
        await expect(page.getByTestId(`article-bulk-check-${article.id}`)).toBeVisible();
        await softDeleteArticleViaKebab(page, article.id);
        await page.getByTestId("article-list-trash-toggle").click();
        await expect(page.getByTestId("article-trash-panel")).toBeVisible();

        // Delay the restore response by 2000ms via a route handler.
        // The trash row should disappear well before that — proving
        // the optimistic update doesn't await the roundtrip.
        let resolveRestore: () => void = () => {};
        const restorePending = new Promise<void>((resolve) => {
            resolveRestore = resolve;
        });
        await page.route(`**/api/articles/trash/${article.id}/restore`, async (route) => {
            // Hold the request until we let it through. This makes
            // any "row only disappears after the network returns"
            // regression visible as a hang.
            await restorePending;
            // Swallow "already handled": page.unroute below can flush
            // the held route before this resumes.
            await route.continue().catch(() => {});
        });

        const restoreButton = page.getByTestId(`article-trash-restore-${article.id}`);
        await restoreButton.click();

        // Optimistic-update assertion: the restore button must be
        // gone within 500ms even though the underlying network call
        // is still hanging. If the handler regresses back to "await
        // restore + refetch", this assertion fails because the
        // button stays visible until the route is resolved.
        await expect(restoreButton).toBeHidden({timeout: 500});

        // Now let the request through. Eventual consistency check.
        resolveRestore();
        await page.unroute(`**/api/articles/trash/${article.id}/restore`);

        // Back to the live list; the article is present.
        await page.getByTestId("article-trash-back").click();
        await expect(page.getByTestId(`article-bulk-check-${article.id}`)).toBeVisible();
    });

    test("trash row is reverted when the restore request fails", async ({page}) => {
        const article = await createArticleFixture("Revert-on-Error Smoke");

        await page.goto("/articles");
        await expect(page.getByTestId(`article-bulk-check-${article.id}`)).toBeVisible();
        await softDeleteArticleViaKebab(page, article.id);
        await page.getByTestId("article-list-trash-toggle").click();

        // Spoof a 500 on the restore endpoint to exercise the
        // revert-on-error path.
        await page.route(`**/api/articles/trash/${article.id}/restore`, async (route) => {
            await route.fulfill({
                status: 500,
                contentType: "application/json",
                body: JSON.stringify({detail: "simulated failure"}),
            });
        });

        const restoreButton = page.getByTestId(`article-trash-restore-${article.id}`);
        await restoreButton.click();

        // Revert behavior: after the failure, the trash row is
        // re-rendered with the same testid because the handler
        // pushes the article back into trash state on catch.
        await expect(restoreButton).toBeVisible({timeout: 2000});

        await page.unroute(`**/api/articles/trash/${article.id}/restore`);
    });
});

test.describe("Books trash - optimistic restore", () => {
    test("trash card disappears before the restore request resolves", async ({page}) => {
        const book = await createBook("Optimistic Book Restore");

        await page.goto("/");
        await expect(page.getByTestId(`book-card-${book.id}`)).toBeVisible();
        await softDeleteBookViaKebab(page, book.id);
        await page.getByTestId("trash-toggle").click();
        await expect(page.getByTestId("trash-view")).toBeVisible();

        let resolveRestore: () => void = () => {};
        const restorePending = new Promise<void>((resolve) => {
            resolveRestore = resolve;
        });
        await page.route(`**/api/books/trash/${book.id}/restore`, async (route) => {
            await restorePending;
            // Swallow "already handled": page.unroute below can flush
            // the held route before this resumes.
            await route.continue().catch(() => {});
        });

        const restoreButton = page.getByTestId(`book-${book.id}-restore`);
        await restoreButton.click();

        // Optimistic-update assertion.
        await expect(page.getByTestId(`book-${book.id}`)).toBeHidden({timeout: 500});

        resolveRestore();
        await page.unroute(`**/api/books/trash/${book.id}/restore`);

        // Eventual consistency: book is back on the dashboard grid.
        await page.getByTestId("trash-toggle").click();
        await expect(page.getByTestId(`book-card-${book.id}`)).toBeVisible();
    });

    test("trash card is reverted when the restore request fails", async ({page}) => {
        const book = await createBook("Revert-on-Error Book");

        await page.goto("/");
        await expect(page.getByTestId(`book-card-${book.id}`)).toBeVisible();
        await softDeleteBookViaKebab(page, book.id);
        await page.getByTestId("trash-toggle").click();

        await page.route(`**/api/books/trash/${book.id}/restore`, async (route) => {
            await route.fulfill({
                status: 500,
                contentType: "application/json",
                body: JSON.stringify({detail: "simulated failure"}),
            });
        });

        await page.getByTestId(`book-${book.id}-restore`).click();

        // Revert: the trash card reappears with the same testid.
        await expect(page.getByTestId(`book-${book.id}`)).toBeVisible({timeout: 2000});

        await page.unroute(`**/api/books/trash/${book.id}/restore`);
    });
});
