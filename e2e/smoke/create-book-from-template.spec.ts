/**
 * Smoke test for the "Create book from template" flow (TM-03).
 *
 * Walks the dashboard path:
 *   1. Click "New book" to open CreateBookModal
 *   2. Switch to the "From template" tab
 *   3. Pick a builtin template (Memoir)
 *   4. Fill title and author
 *   5. Submit
 *   6. Verify the new book appears with the template's chapters
 *      populated (checked directly via the books API because the
 *      Dashboard card list does not surface chapter count).
 *
 * Uses data-testid selectors only so the spec survives i18n
 * changes.
 */

import {test, expect} from "../fixtures/base";
import type {Page} from "@playwright/test";

const API = "http://localhost:8000/api";

interface Template {
    id: string;
    name: string;
    is_builtin: boolean;
    chapters: {position: number; title: string; chapter_type: string}[];
}

async function fetchTemplates(): Promise<Template[]> {
    const res = await fetch(`${API}/templates`);
    if (!res.ok) throw new Error(`GET /templates: ${res.status}`);
    return res.json();
}

async function fetchBookChapters(bookId: string): Promise<{title: string; chapter_type: string; position: number}[]> {
    const res = await fetch(`${API}/books/${bookId}`);
    if (!res.ok) throw new Error(`GET /books/${bookId}: ${res.status}`);
    const book = await res.json();
    return book.chapters;
}

async function clickTab(page: Page, testId: string) {
    // Radix Tabs reacts to the pointerdown event, so dispatch the full
    // pointer+mouse sequence for reliability in Playwright.
    const locator = page.getByTestId(testId);
    await locator.click();
}

/**
 * Fill the author field in CreateBookModal. The modal swaps the plain
 * <input data-testid="create-book-author"> for a Radix Select with
 * data-testid="create-book-author-select" when `config.author.name` is
 * configured. Settings load asynchronously, so the input variant can
 * appear first and then detach when the Select replaces it - wait for
 * the title field to be stable, then race the two variants.
 */
async function pickAuthor(page: Page, fallbackName: string) {
    // Title field renders first and is stable; gate on it before
    // probing the author field so we never read mid-swap.
    await page.getByTestId("create-book-title").waitFor({state: "visible"});
    const input = page.getByTestId("create-book-author");
    const select = page.getByTestId("create-book-author-select");
    // Wait for at least one of the two variants to be visible.
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

test("create book from memoir template populates chapters", async ({page}) => {
    const templates = await fetchTemplates();
    const memoir = templates.find((t) => t.name === "Memoir" && t.is_builtin);
    expect(memoir, "builtin Memoir template must be seeded").toBeTruthy();
    const expectedChapterCount = memoir!.chapters.length;

    await page.goto("/");
    await page.getByTestId("new-book-btn").click();

    // Switch to template mode
    await clickTab(page, "create-book-mode-template");

    // Memoir card should render from the list
    const memoirCard = page.getByTestId(`template-card-${memoir!.id}`);
    await expect(memoirCard).toBeVisible();
    await memoirCard.click();

    // Fill required fields
    await page.getByTestId("create-book-title").fill("E2E Memoir");
    await pickAuthor(page, "Playwright");

    // Submit
    const submit = page.getByTestId("create-book-submit");
    await expect(submit).toBeEnabled();
    await submit.click();

    // The modal closes and the new book appears on the dashboard.
    // Fetch via API to count chapters since the card doesn't show them.
    await page.waitForFunction(async () => {
        const res = await fetch("/api/books");
        if (!res.ok) return false;
        const books = await res.json();
        return books.some((b: {title: string}) => b.title === "E2E Memoir");
    }, undefined, {timeout: 10_000});

    const booksRes = await page.evaluate(async () => {
        const r = await fetch("/api/books");
        return r.json();
    });
    const created = (booksRes as {id: string; title: string}[]).find(
        (b) => b.title === "E2E Memoir",
    );
    expect(created, "created book must appear in /api/books").toBeTruthy();

    const chapters = await fetchBookChapters(created!.id);
    expect(chapters.length).toBe(expectedChapterCount);
    const positions = chapters.map((c) => c.position);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
});

test("create book blank mode still works after template tabs added", async ({page}) => {
    await page.goto("/");
    await page.getByTestId("new-book-btn").click();

    // Blank is the default - no switch needed
    await page.getByTestId("create-book-title").fill("E2E Blank Book");
    await pickAuthor(page, "Playwright");

    const submit = page.getByTestId("create-book-submit");
    await expect(submit).toBeEnabled();
    await submit.click();

    await page.waitForFunction(async () => {
        const res = await fetch("/api/books");
        if (!res.ok) return false;
        const books = await res.json();
        return books.some((b: {title: string}) => b.title === "E2E Blank Book");
    }, undefined, {timeout: 10_000});

    const booksRes = await page.evaluate(async () => {
        const r = await fetch("/api/books");
        return r.json();
    });
    const created = (booksRes as {id: string; title: string}[]).find(
        (b) => b.title === "E2E Blank Book",
    );
    expect(created).toBeTruthy();
    const chapters = await fetchBookChapters(created!.id);
    expect(chapters.length).toBe(0);
});
