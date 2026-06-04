/**
 * Smoke test for the Git per-book pages (Dialog->Pages migration C8).
 *
 * GitBackupDialog + GitSyncDialog became deep-linkable per-book pages at
 * `/books/:bookId/git-backup` and `/books/:bookId/git-sync`. A freshly
 * created book has no git repo, so the pages render their "not
 * initialized" state — enough to assert the page mounts + Back works.
 *
 * data-testid selectors only. Builds its own book via the API.
 */

import {test, expect} from "../fixtures/base";

const API = "http://localhost:8000/api";

async function makeBook(): Promise<string> {
    const res = await fetch(`${API}/books`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({title: "E2E Git Book", author: "Playwright"}),
    });
    if (!res.ok) throw new Error(`POST /books: ${res.status}`);
    return (await res.json()).id;
}

test("git-backup page deep-links + back returns to the editor", async ({page}) => {
    const bookId = await makeBook();
    await page.goto(`/books/${bookId}/git-backup`);
    await expect(page.getByTestId("git-backup-page")).toBeVisible();
    await page.getByTestId("git-backup-page-back").click();
    await expect(page).toHaveURL(new RegExp(`/book/${bookId}`));
});

test("git-sync page deep-links + back returns to the editor", async ({page}) => {
    const bookId = await makeBook();
    await page.goto(`/books/${bookId}/git-sync`);
    await expect(page.getByTestId("git-sync-page")).toBeVisible();
    await page.getByTestId("git-sync-page-back").click();
    await expect(page).toHaveURL(new RegExp(`/book/${bookId}`));
});

test("git-backup renders on a mobile viewport", async ({page}) => {
    const bookId = await makeBook();
    await page.setViewportSize({width: 375, height: 800});
    await page.goto(`/books/${bookId}/git-backup`);
    await expect(page.getByTestId("git-backup-page")).toBeVisible();
});
