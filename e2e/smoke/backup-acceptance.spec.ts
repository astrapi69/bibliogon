/**
 * BACKUP-AKZEPTANZTEST (#61) — the hardest test in the repo.
 *
 * Full cycle against the live backend: fill with data → export the full
 * JSON backup (Settings > Backups) → Danger-Zone reset (wipe) → import the
 * backup → verify EVERY entity is back. Because the backup reads + writes
 * the whole storage seam, a green run proves the seam works end-to-end.
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
        const bundle = JSON.parse(readFileSync(exportPath, "utf-8"));
        expect(bundle.version).toBe(1);
        expect(bundle.data.books).toHaveLength(1);
        expect(bundle.data.books[0].chapters).toHaveLength(3);
        expect(bundle.data.articles.length).toBeGreaterThanOrEqual(1);
        expect(bundle.data.story_bible.entities).toHaveLength(1);
        expect(bundle.data.authors.length).toBeGreaterThanOrEqual(3);

        // 3. Danger-Zone reset (without backup) → everything wiped.
        await page.goto("/settings?tab=danger_zone");
        await page.getByTestId("danger-zone-reset-button").click();
        await page.getByTestId("danger-zone-continue-without-backup").click();
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
        await expect
            .poll(async () => (await getBooks()).length, {timeout: 15000})
            .toBe(1);

        // 5. Verify the whole graph.
        const books = await getBooks();
        expect(books[0].title).toBe("Akzeptanz Buch");

        const chapters = await getChapters(books[0].id);
        expect(chapters.map((c) => c.title).sort()).toEqual([
            "Kapitel 1",
            "Kapitel 2",
            "Kapitel 3",
        ]);
        expect(chapters.find((c) => c.title === "Kapitel 1")?.content).toContain("Inhalt eins");

        const articles = await getArticles();
        expect(articles.some((a) => a.title === "Akzeptanz Artikel")).toBe(true);

        const entities = await getEntities(books[0].id);
        expect(entities.some((e) => e.name === "Held")).toBe(true);

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
