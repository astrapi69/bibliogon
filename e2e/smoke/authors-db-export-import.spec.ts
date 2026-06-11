/**
 * Authors-Database export/import smoke (#56).
 *
 * Drives the full roundtrip against the live stack:
 *  1. seed 3 authors, export → assert the downloaded JSON shape
 *     (version 1 + the 3 authors) and the bibliogon-authors-YYYY-MM-DD
 *     filename,
 *  2. re-import the same file → all 3 are skipped as duplicates (each
 *     name still appears exactly once),
 *  3. wipe the DB, import the file → the 3 authors are re-created.
 *
 * NOTE: /api/test/reset intentionally does NOT wipe the authors table
 * (main.py: "user-managed catalog some tests rely on"), so this spec
 * clears authors itself for a deterministic clean slate rather than
 * relying on the per-test DB reset.
 */

import {test, expect} from "../fixtures/base";
import {readFileSync} from "node:fs";

const API = "http://localhost:8000/api";

async function listAuthors(): Promise<{id: string}[]> {
    const res = await fetch(`${API}/authors?limit=1000`);
    if (!res.ok) throw new Error(`list authors: ${res.status}`);
    return res.json();
}

async function createAuthor(name: string): Promise<{id: string}> {
    const res = await fetch(`${API}/authors`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({name}),
    });
    if (!res.ok) throw new Error(`create author: ${res.status}`);
    return res.json();
}

async function wipeAuthors(): Promise<void> {
    for (const author of await listAuthors()) {
        const res = await fetch(`${API}/authors/${author.id}`, {method: "DELETE"});
        if (!res.ok && res.status !== 204) throw new Error(`delete author: ${res.status}`);
    }
}

const NAMES = ["Stephen King", "Ursula K. Le Guin", "Terry Pratchett"];

function rows(page: import("@playwright/test").Page) {
    return page.getByTestId("authors-database-list").locator(":scope > div");
}

test.describe("Authors-DB export/import (#56)", () => {
    test("export, re-import dedupes, import re-creates after wipe", async ({page}) => {
        await wipeAuthors();
        for (const name of NAMES) await createAuthor(name);

        await page.goto("/settings?tab=autoren");
        await expect(rows(page)).toHaveCount(3);

        // Export → capture the download and assert its JSON shape.
        const [download] = await Promise.all([
            page.waitForEvent("download"),
            page.getByTestId("authors-database-export").click(),
        ]);
        expect(download.suggestedFilename()).toMatch(
            /^bibliogon-authors-\d{4}-\d{2}-\d{2}\.json$/,
        );
        const exportPath = await download.path();
        const envelope = JSON.parse(readFileSync(exportPath, "utf-8"));
        expect(envelope.version).toBe(1);
        expect(envelope.authors.map((a: {name: string}) => a.name).sort()).toEqual(
            [...NAMES].sort(),
        );

        // Re-import the same file → all duplicates, count stays 3.
        await page.getByTestId("authors-database-import-input").setInputFiles(exportPath);
        await expect(rows(page)).toHaveCount(3);
        await expect(page.getByText("Stephen King", {exact: true})).toHaveCount(1);

        // Wipe the DB out from under the page, reload → empty state.
        await wipeAuthors();
        await page.reload();
        await expect(page.getByTestId("authors-database-empty")).toBeVisible();

        // Import the file into the empty DB → the 3 authors are re-created.
        await page.getByTestId("authors-database-import-input").setInputFiles(exportPath);
        await expect(rows(page)).toHaveCount(3);
        await expect(page.getByText("Stephen King", {exact: true})).toBeVisible();

        await wipeAuthors();
    });
});
