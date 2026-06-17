/**
 * Manual-Testplan Section 4 — Backup (BACKUP-AKZEPTANZTEST, TC-040..043).
 *
 * TC-040 is a RELEASE BLOCKER. The canonical acceptance test lives at
 * e2e/smoke/backup-acceptance.spec.ts; this section runs the same
 * export -> reset -> import -> verify cycle through the BackupHelper page
 * object so the manual-automation suite carries its own self-contained
 * release-blocker check, and adds:
 *   - TC-041 the pre-reset backup affordance is offered in the Danger-Zone
 *
 * Assertions are NEVER loosened to go green — a red run is a real
 * data-loss bug in the storage seam or the backup path
 * (coding-standards.md "BACKUP-AKZEPTANZTEST").
 */

import {test, expect, createBook, createChapter, createArticle} from "../fixtures/base";
import {BackupHelper} from "./helpers/backup.helper";
import {
    api,
    createAuthor,
    createStoryEntity,
    getStoryEntities,
    patchApp,
    wipeAuthors,
} from "./helpers/setup.helper";

const getBooks = () => api<{id: string; title: string}[]>("/books");
const getArticles = () => api<{id: string; title: string}[]>("/articles");
const getChapters = (bookId: string) =>
    api<{id: string; title: string; content: string}[]>(`/books/${bookId}/chapters`);
const listAuthors = () => api<{id: string; name: string}[]>("/authors?limit=1000");

// ``app.default_language`` is global and NOT restored by the shared
// resetSettings baseline, so the en value this section sets/imports would
// otherwise leak into later tests in the serial run. Reset it to de.
test.afterEach(async () => {
    await patchApp({app: {default_language: "de"}});
});

test.describe("Section 4 — TC-040 full backup cycle (release blocker)", () => {
    test("export -> reset -> import restores the whole graph", async ({page}) => {
        // 1. Seed the verification fixture (books+chapters+content, article,
        //    authors, story entity, changed settings).
        const book = await createBook("Backup Buch", "Autor X");
        await createChapter(book.id, "Kapitel 1", "Inhalt eins", "chapter");
        await createChapter(book.id, "Kapitel 2", "Inhalt zwei", "chapter");
        await createChapter(book.id, "Kapitel 3", "Inhalt drei", "chapter");
        await createArticle("Backup Artikel", "de");
        await wipeAuthors();
        await createAuthor("Autor Eins");
        await createAuthor("Autor Zwei");
        await createAuthor("Autor Drei");
        await createStoryEntity(book.id, "Held");
        await patchApp({ui: {theme: "nord"}, app: {default_language: "en"}});

        const backup = new BackupHelper(page);

        // 2. Export + sanity-check the .bgb archive shape (a ZIP with the
        //    JSON entity graph + image bytes; see bgbExport.ts).
        const {path, bundle} = await backup.exportFull();
        expect(bundle.manifest.format).toBe("bibliogon-backup");
        expect(bundle.manifest.version).toBe("3.0");
        expect(bundle.data.books).toHaveLength(1);
        expect(bundle.data.books[0].chapters).toHaveLength(3);
        expect(bundle.data.articles.length).toBeGreaterThanOrEqual(1);
        expect(bundle.data.story_bible.entities).toHaveLength(1);
        expect(bundle.data.authors.length).toBeGreaterThanOrEqual(3);

        // 3. Reset -> everything wiped.
        await backup.resetApp();
        expect(await getBooks()).toHaveLength(0);

        // 4. Import.
        await backup.importFull(path);

        // 5. Verify the whole graph. Poll because importFullBackup restores
        //    the graph as separate seam writes in order; the book row appears
        //    before its children do.
        await expect.poll(async () => (await getBooks()).length, {timeout: 15_000}).toBe(1);
        const books = await getBooks();
        expect(books[0].title).toBe("Backup Buch");

        await expect
            .poll(
                async () => (await getChapters(books[0].id)).map((c) => c.title).sort(),
                {timeout: 15_000},
            )
            .toEqual(["Kapitel 1", "Kapitel 2", "Kapitel 3"]);
        const chapters = await getChapters(books[0].id);
        expect(chapters.find((c) => c.title === "Kapitel 1")?.content).toContain("Inhalt eins");

        await expect
            .poll(async () => (await getArticles()).some((a) => a.title === "Backup Artikel"), {
                timeout: 15_000,
            })
            .toBe(true);

        await expect
            .poll(async () => (await getStoryEntities(books[0].id)).some((e) => e.name === "Held"), {
                timeout: 15_000,
            })
            .toBe(true);

        const authorNames = (await listAuthors()).map((a) => a.name);
        expect(authorNames).toEqual(
            expect.arrayContaining(["Autor Eins", "Autor Zwei", "Autor Drei"]),
        );

        const settings = await api<Record<string, unknown>>("/settings/app");
        expect((settings.ui as {theme?: string})?.theme).toBe("nord");
        expect((settings.app as {default_language?: string})?.default_language).toBe("en");

        await wipeAuthors();
    });
});

test.describe("Section 4 — TC-041 pre-reset backup affordance", () => {
    test("the Danger-Zone offers a create-backup action before the wipe", async ({page}) => {
        await createBook("Vor-Reset Buch", "Autor");
        await page.goto("/settings?tab=danger_zone");
        // The Danger-Zone surfaces the create-backup button + the import hint
        // so the user can save before the destructive RESET.
        await expect(page.getByTestId("danger-zone-create-backup")).toBeVisible();
        await expect(page.getByTestId("danger-zone-backup-import-hint")).toBeVisible();
        // Opening the reset dialog shows the destructive warning.
        const backup = new BackupHelper(page);
        await backup.openResetDialog();
        await expect(page.getByTestId("danger-zone-warning")).toBeVisible();
    });
});
