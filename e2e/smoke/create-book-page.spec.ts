/**
 * Smoke test for the CreateBookPage route (Dialog->Pages migration C2).
 *
 * CreateBookModal became a deep-linkable full page at
 * `/books/new?type=<id>`. These specs cover the page contract:
 *   - deep-link: the URL renders the form directly (no dashboard step)
 *   - create (blank prose): the new book appears in /api/books and the
 *     user returns to the dashboard
 *   - page-based type (picture_book): create lands in the page editor
 *   - back button: returns to the dashboard when navigated from it
 *   - mobile viewport: the form renders without a fixed-dialog overflow
 *
 * data-testid selectors only (i18n-stable). Book existence is verified
 * via /api/books since the dashboard card list does not surface enough.
 */

import {test, expect} from "../fixtures/base";
import type {Page} from "@playwright/test";

const API = "http://localhost:8000/api";

/**
 * Fill the author field. AuthorSelectInput swaps the plain
 * <input data-testid="create-book-author"> for a Radix Select
 * (data-testid="create-book-author-select") when a profile author name
 * is configured; settings load async, so race the two variants.
 */
async function pickAuthor(page: Page, fallbackName: string) {
    await page.getByTestId("create-book-title").waitFor({state: "visible"});
    const input = page.getByTestId("create-book-author");
    const select = page.getByTestId("create-book-author-select");
    await Promise.race([
        input.waitFor({state: "visible", timeout: 5000}).catch(() => {}),
        select.waitFor({state: "visible", timeout: 5000}).catch(() => {}),
    ]);
    if (await select.count()) {
        await select.click();
        await page.locator('[role="option"]').first().click();
        return;
    }
    await input.fill(fallbackName);
}

test("deep-link to /books/new renders the create form directly", async ({page}) => {
    await page.goto("/books/new");
    await expect(page.getByTestId("create-book-page")).toBeVisible();
    await expect(page.getByTestId("create-book-title")).toBeVisible();
    await expect(page.getByTestId("create-book-submit")).toBeVisible();
    // Default (prose) title surface is present.
    await expect(page.getByTestId("create-book-title-prose")).toBeVisible();
});

test("create a blank prose book returns to the dashboard and persists", async ({page}) => {
    await page.goto("/books/new");
    await page.getByTestId("create-book-title").fill("E2E Page Book");
    await pickAuthor(page, "Playwright");

    const submit = page.getByTestId("create-book-submit");
    await expect(submit).toBeEnabled();
    await submit.click();

    // The new prose book persists and the user is no longer on the form.
    await page.waitForFunction(async () => {
        const res = await fetch("/api/books");
        if (!res.ok) return false;
        const books = await res.json();
        return books.some((b: {title: string}) => b.title === "E2E Page Book");
    }, undefined, {timeout: 10_000});
    await expect(page).not.toHaveURL(/\/books\/new/);
});

test("picture-book type deep-links and lands in the page editor", async ({page}) => {
    await page.goto("/books/new?type=picture_book");
    // Per-type title surface confirms the ?type= was honoured.
    await expect(page.getByTestId("create-book-title-picture_book")).toBeVisible();
    await page.getByTestId("create-book-title").fill("E2E Picture Book");
    await pickAuthor(page, "Playwright");
    await page.getByTestId("create-book-submit").click();

    // Page-based types jump straight to their editor at /book/<id>.
    await expect(page).toHaveURL(/\/book\/[^/]+$/, {timeout: 10_000});

    const created = await page.evaluate(async () => {
        const r = await fetch("/api/books");
        const books = await r.json();
        return (books as {id: string; title: string; book_type: string}[]).find(
            (b) => b.title === "E2E Picture Book",
        );
    });
    expect(created?.book_type).toBe("picture_book");
});

test("back button returns to the dashboard", async ({page}) => {
    await page.goto("/");
    await page.getByTestId("new-book-btn").click();
    await expect(page).toHaveURL(/\/books\/new/);
    await page.getByTestId("create-book-page-back").click();
    // Back to the dashboard (the New-book split-button is dashboard-only).
    await expect(page.getByTestId("new-book-btn")).toBeVisible();
    await expect(page).not.toHaveURL(/\/books\/new/);
});

test("renders on a mobile viewport without overflow", async ({page}) => {
    await page.setViewportSize({width: 375, height: 800});
    await page.goto("/books/new");
    const title = page.getByTestId("create-book-title");
    await expect(title).toBeVisible();
    const box = await title.boundingBox();
    expect(box).not.toBeNull();
    // The field fits inside the mobile viewport (no horizontal overflow).
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
});
