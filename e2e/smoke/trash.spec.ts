/**
 * Smoke tests for the trash / soft-delete flow on the dashboard.
 *
 * Data safety is the reason this ranks ahead of dashboard search
 * in the tier-2 smoke backlog: a regression that accidentally
 * wipes books without a trash step is silent data loss. This
 * spec pins the full lifecycle end-to-end:
 *
 *   delete -> appears in trash -> restore -> back on dashboard
 *   delete -> appears in trash -> permanent delete -> gone
 *   delete via BookCard "Endgueltig loeschen" option goes
 *     straight to permanent delete (confirm dialog required)
 *   empty trash clears every trashed book
 *   trash toggle has a badge count that matches the trash size
 *
 * Uses data-testid selectors exclusively. The confirm dialog
 * (AppDialog) is accepted via the ``acceptDialog`` helper from
 * fixtures/base.ts, which uses a text-role locator as an
 * inherited exception.
 */

import {test, expect, acceptDialog, createBook, resetDb} from "../fixtures/base";
import type {Page} from "@playwright/test";

const API = "http://localhost:8000/api";

/** Fetches the current non-trashed book list straight from the
 * API. Used for assertions that do not depend on UI rehydration
 * timing. */
async function getBooks(): Promise<{id: string; title: string}[]> {
    const res = await fetch(`${API}/books`);
    if (!res.ok) throw new Error(`GET books: ${res.status}`);
    return res.json();
}

async function getTrashList(): Promise<{id: string; title: string}[]> {
    const res = await fetch(`${API}/books/trash/list`);
    if (!res.ok) throw new Error(`GET trash: ${res.status}`);
    return res.json();
}

async function openDashboard(page: Page) {
    await page.goto("/");
    // Wait for the header toggle to be available as a proxy for
    // "Dashboard finished its initial load".
    await expect(page.getByTestId("trash-toggle")).toBeVisible();
}

async function openBookMenu(page: Page, bookId: string) {
    await page.getByTestId(`book-card-menu-${bookId}`).click();
}

async function moveBookToTrashViaUI(page: Page, bookId: string) {
    await openBookMenu(page, bookId);
    await page.getByTestId(`book-card-menu-delete-${bookId}`).click();
    // The card disappears from the main grid.
    await expect(page.getByTestId(`book-card-${bookId}`)).not.toBeVisible();
}

async function openTrashView(page: Page) {
    await page.getByTestId("trash-toggle").click();
    await expect(page.getByTestId("trash-view")).toBeVisible();
}

test.describe("Trash - move to trash", () => {
    let bookId: string;

    test.beforeEach(async () => {
        // Fresh DB from the auto resetDatabase fixture. Seed one
        // book per test so the dashboard always has something to
        // click on.
        const book = await createBook("Trash Smoke");
        bookId = book.id;
    });

    test("moving a book to trash removes it from the dashboard grid", async ({page}) => {
        await openDashboard(page);
        await expect(page.getByTestId(`book-card-${bookId}`)).toBeVisible();

        await moveBookToTrashViaUI(page, bookId);

        // Verified at the API level so we are not just watching a
        // React state transition.
        const remaining = await getBooks();
        expect(remaining.find((b) => b.id === bookId)).toBeUndefined();
    });

    test("the trashed book appears in the trash view", async ({page}) => {
        await openDashboard(page);
        await moveBookToTrashViaUI(page, bookId);
        await openTrashView(page);

        await expect(page.getByTestId(`trash-card-${bookId}`)).toBeVisible();
    });

    test("the trash toggle shows a badge with the trash count", async ({page}) => {
        await openDashboard(page);
        await moveBookToTrashViaUI(page, bookId);

        const badge = page.getByTestId("trash-badge");
        await expect(badge).toBeVisible();
        await expect(badge).toHaveText("1");
    });
});

test.describe("Trash - restore", () => {
    let bookId: string;

    test.beforeEach(async () => {
        const book = await createBook("Restore Smoke");
        bookId = book.id;
    });

    test("restore button returns the book to the dashboard", async ({page}) => {
        await openDashboard(page);
        await moveBookToTrashViaUI(page, bookId);

        await openTrashView(page);
        await page.getByTestId(`trash-restore-${bookId}`).click();

        // Trash card is gone from the trash view.
        await expect(page.getByTestId(`trash-card-${bookId}`)).not.toBeVisible();

        // Leave trash view to verify the book shows up on the main
        // dashboard grid. The trash toggle is a view switch, not a
        // separate route; restore keeps the user in the trash view
        // by design so they can restore multiple items in a row.
        await page.getByTestId("trash-toggle").click();

        // Dashboard card is back.
        await expect(page.getByTestId(`book-card-${bookId}`)).toBeVisible();

        // API state matches what the UI claims.
        const books = await getBooks();
        expect(books.find((b) => b.id === bookId)).toBeDefined();
        const trash = await getTrashList();
        expect(trash.find((b) => b.id === bookId)).toBeUndefined();
    });
});

test.describe("Trash - permanent delete from trash view", () => {
    let bookId: string;

    test.beforeEach(async () => {
        const book = await createBook("Permanent Delete From Trash");
        bookId = book.id;
    });

    test("permanent delete from trash view removes the book", async ({page}) => {
        await openDashboard(page);
        await moveBookToTrashViaUI(page, bookId);
        await openTrashView(page);

        await page.getByTestId(`trash-delete-permanent-${bookId}`).click();
        await acceptDialog(page);

        await expect(page.getByTestId(`trash-card-${bookId}`)).not.toBeVisible();

        // Gone from both lists.
        const books = await getBooks();
        const trash = await getTrashList();
        expect(books.find((b) => b.id === bookId)).toBeUndefined();
        expect(trash.find((b) => b.id === bookId)).toBeUndefined();
    });
});

test.describe("Trash - permanent delete from BookCard menu", () => {
    let bookId: string;

    test.beforeEach(async () => {
        const book = await createBook("Permanent Delete From Card");
        bookId = book.id;
    });

    test("BookCard > Endgueltig loeschen requires confirm and wipes the book", async ({page}) => {
        await openDashboard(page);

        await openBookMenu(page, bookId);
        await page.getByTestId(`book-card-menu-delete-permanent-${bookId}`).click();
        await acceptDialog(page);

        // The card disappears from the main grid and does NOT
        // appear in trash (permanent delete skips the trash step).
        await expect(page.getByTestId(`book-card-${bookId}`)).not.toBeVisible();

        const books = await getBooks();
        const trash = await getTrashList();
        expect(books.find((b) => b.id === bookId)).toBeUndefined();
        expect(trash.find((b) => b.id === bookId)).toBeUndefined();
    });
});

test.describe("Trash - empty trash", () => {
    test("empty trash removes every trashed book", async ({page}) => {
        // Seed three books and trash all of them. resetDatabase
        // runs in the auto-fixture, so we start from a clean DB.
        const alpha = await createBook("Alpha");
        const beta = await createBook("Beta");
        const gamma = await createBook("Gamma");

        await openDashboard(page);
        for (const b of [alpha, beta, gamma]) {
            await moveBookToTrashViaUI(page, b.id);
        }

        await openTrashView(page);
        await expect(page.getByTestId(`trash-card-${alpha.id}`)).toBeVisible();
        await expect(page.getByTestId(`trash-card-${beta.id}`)).toBeVisible();
        await expect(page.getByTestId(`trash-card-${gamma.id}`)).toBeVisible();

        await page.getByTestId("trash-empty").click();
        await acceptDialog(page);

        // Trash is now empty - the empty-state placeholder renders.
        await expect(page.getByTestId("trash-empty-state")).toBeVisible();
        await expect(page.getByTestId(`trash-card-${alpha.id}`)).not.toBeVisible();
        await expect(page.getByTestId(`trash-card-${beta.id}`)).not.toBeVisible();
        await expect(page.getByTestId(`trash-card-${gamma.id}`)).not.toBeVisible();

        const trash = await getTrashList();
        expect(trash).toHaveLength(0);
    });
});

test.describe("Trash - empty state", () => {
    test("empty state renders when there are no trashed books", async ({page}) => {
        // resetDb is already auto-run, but we want to be explicit:
        // no books, no trash, open the trash view directly.
        await resetDb();
        await openDashboard(page);
        await openTrashView(page);

        await expect(page.getByTestId("trash-empty-state")).toBeVisible();
    });
});
