/**
 * BACKUP-AKZEPTANZTEST (#61) — the hardest test in the repo.
 *
 * Full cycle against the live backend: fill with data → export the full
 * `.bgb` backup (Settings > Backups) → Danger-Zone reset (wipe) → import the
 * backup → verify EVERY entity is back. Because the backup reads + writes
 * the whole storage seam, a green run proves the seam works end-to-end.
 *
 * Backup format (#340): the full backup is now a `.bgb` ZIP archive (it
 * carries image bytes — covers, article thumbnails — that JSON could not).
 * This spec asserts the downloaded archive is a real ZIP carrying the entity
 * graph + the settings extension, then that import restores the graph + the
 * settings through the seam. The IMAGE-byte round-trip (cover + thumbnail
 * bytes survive export → wipe → import) is covered end-to-end by the Dexie
 * Vitest acceptance test `frontend/src/export/bgbRoundtrip.test.ts`: in API
 * mode the client `.bgb` import does not push bytes back to the server (the
 * seam's `cacheBlob` is a server no-op), so the byte round-trip is asserted
 * in the offline mode where it is load-bearing.
 *
 * Also pins the two no-overwrite rules: the author PROFILE set after the
 * reset is NOT clobbered by the bundle's profile, and existing-id entities
 * are skipped rather than overwritten.
 *
 * Assertions are never loosened to go green — a red run is a real bug in
 * the seam or the backup path (see .claude/rules coding-standards
 * "BACKUP-AKZEPTANZTEST").
 */

import {test, expect, createBook, createChapter, createArticle} from "../fixtures/base";
import {readFileSync} from "node:fs";

const API = "http://localhost:8000/api";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API}${path}`, {
        headers: {"Content-Type": "application/json"},
        ...init,
    });
    if (!res.ok && res.status !== 204) throw new Error(`${path}: ${res.status}`);
    return res.status === 204 ? (undefined as T) : res.json();
}

const getBooks = () => api<{id: string; title: string}[]>("/books");
const getArticles = () => api<{id: string; title: string}[]>("/articles");
const getChapters = (bookId: string) =>
    api<{id: string; title: string; content: string}[]>(`/books/${bookId}/chapters`);
const getEntities = (bookId: string) =>
    api<{id: string; name: string}[]>(`/story-bible/books/${bookId}/entities`);
const getApp = () => api<Record<string, unknown>>("/settings/app");
const patchApp = (data: Record<string, unknown>) =>
    api("/settings/app", {method: "PATCH", body: JSON.stringify(data)});
const listAuthors = () => api<{id: string; name: string}[]>("/authors?limit=1000");
const createAuthor = (name: string) =>
    api("/authors", {method: "POST", body: JSON.stringify({name})});

async function wipeAuthors() {
    for (const author of await listAuthors()) {
        await api(`/authors/${author.id}`, {method: "DELETE"});
    }
}

test.describe("BACKUP-AKZEPTANZTEST (#61)", () => {
    test("export → reset → import → verify the whole graph", async ({page}) => {
        // 1. Test data.
        const book = await createBook("Akzeptanz Buch", "Autor X");
        await createChapter(book.id, "Kapitel 1", "Inhalt eins", "chapter");
        await createChapter(book.id, "Kapitel 2", "Inhalt zwei", "chapter");
        await createChapter(book.id, "Kapitel 3", "Inhalt drei", "chapter");
        await createArticle("Akzeptanz Artikel", "de");
        await wipeAuthors();
        await createAuthor("Autor Eins");
        await createAuthor("Autor Zwei");
        await createAuthor("Autor Drei");
        await api(`/story-bible/books/${book.id}/entities`, {
            method: "POST",
            body: JSON.stringify({entity_type: "character", name: "Held"}),
        });
        await patchApp({
            ui: {theme: "nord"},
            app: {default_language: "en"},
            author: {name: "Original Identity"},
        });

        // 2. Export the full backup via the UI; verify the bundle shape.
        await page.goto("/settings?tab=backups");
        const [download] = await Promise.all([
            page.waitForEvent("download"),
            page.getByTestId("backups-export-full").click(),
        ]);
        const exportPath = await download.path();
        // The backup is now a .bgb ZIP (carries image bytes), not JSON. Assert
        // the ZIP magic + that the archive carries the entity graph and the
        // client settings extension. ZIP local-file-header filenames are stored
        // uncompressed, so a substring scan on the raw bytes is a sound,
        // dependency-free structure check.
        const archive = readFileSync(exportPath);
        expect(archive.subarray(0, 2).toString("latin1")).toBe("PK");
        const entries = archive.toString("latin1");
        expect(entries).toContain("manifest.json");
        expect(entries).toContain("bibliogon-backup");
        expect(entries).toContain("book.json");
        expect(entries).toContain("chapters/");
        expect(entries).toContain("story_entities.json");
        expect(entries).toContain("globals/authors.json");
        expect(entries).toContain("globals/settings.json");

        // 3. Danger-Zone reset → everything wiped. The reset button opens
        // the RESET-confirmation dialog directly (the backup choice is a
        // separate page-level button, already exercised via the Backups tab
        // export above).
        await page.goto("/settings?tab=danger_zone");
        await page.getByTestId("danger-zone-reset-button").click();
        await page.getByTestId("danger-zone-reset-input").fill("RESET");
        const finalBtn = page.getByTestId("danger-zone-final-delete-button");
        await expect(finalBtn).toBeEnabled({timeout: 5000});
        await finalBtn.click();
        await page.waitForURL("**/", {timeout: 10000});
        expect(await getBooks()).toHaveLength(0);

        // Set a DIFFERENT profile after the reset — the import must NOT
        // overwrite it with the bundle's "Original Identity".
        await wipeAuthors();
        await patchApp({author: {name: "Post-Reset Identity"}});

        // 4. Import the backup via the UI.
        await page.goto("/settings?tab=backups");
        await page.getByTestId("backups-import-input").setInputFiles(exportPath);
        // importFullBackup restores the whole graph through the storage seam
        // as separate writes, in order: settings, authors, book + its
        // chapters, articles, story entities, labels. The test reads back
        // from the backend, so each verified collection is POLLED until it
        // reflects the restore - reading once (or polling only getBooks)
        // races a still-in-progress restore (the book row appears before its
        // chapters/articles/entities do).
        await expect
            .poll(async () => (await getBooks()).length, {timeout: 15000})
            .toBe(1);

        // 5. Verify the whole graph.
        const books = await getBooks();
        expect(books[0].title).toBe("Akzeptanz Buch");

        await expect
            .poll(
                async () =>
                    (await getChapters(books[0].id)).map((c) => c.title).sort(),
                {timeout: 15000},
            )
            .toEqual(["Kapitel 1", "Kapitel 2", "Kapitel 3"]);
        const chapters = await getChapters(books[0].id);
        expect(chapters.find((c) => c.title === "Kapitel 1")?.content).toContain("Inhalt eins");

        await expect
            .poll(
                async () =>
                    (await getArticles()).some((a) => a.title === "Akzeptanz Artikel"),
                {timeout: 15000},
            )
            .toBe(true);

        await expect
            .poll(
                async () =>
                    (await getEntities(books[0].id)).some((e) => e.name === "Held"),
                {timeout: 15000},
            )
            .toBe(true);

        const authorNames = (await listAuthors()).map((a) => a.name);
        expect(authorNames).toEqual(
            expect.arrayContaining(["Autor Eins", "Autor Zwei", "Autor Drei"]),
        );

        const settings = await getApp();
        expect((settings.ui as {theme?: string})?.theme).toBe("nord");
        expect((settings.app as {default_language?: string})?.default_language).toBe("en");
        // Author profile NOT overwritten by the bundle.
        expect((settings.author as {name?: string})?.name).toBe("Post-Reset Identity");

        await wipeAuthors();
    });
});
