import {test, expect, createBook, createChapter} from "../fixtures/base";

test.describe("Book Metadata Editor", () => {
    let bookId: string;

    test.beforeEach(async () => {
        const book = await createBook("Metadaten-Test");
        bookId = book.id;
        await createChapter(bookId, "Kapitel 1", "Inhalt");
    });

    test("open metadata editor via sidebar button", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByRole("button", {name: "Metadaten"}).click();
        await expect(page.getByRole("heading", {name: "Buch-Metadaten"})).toBeVisible();
    });

    test("metadata editor shows all sections", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByRole("button", {name: "Metadaten"}).click();

        await expect(page.getByRole("heading", {name: "Allgemein"})).toBeVisible();
        await expect(page.getByRole("heading", {name: "Verlag"})).toBeVisible();
        await expect(page.getByRole("heading", {name: "ISBN und ASIN"})).toBeVisible();
        await expect(page.getByRole("heading", {name: "Marketing und Amazon"})).toBeVisible();
        await expect(page.getByRole("heading", {name: "Design"})).toBeVisible();
    });

    test("edit and save metadata", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByRole("button", {name: "Metadaten"}).click();

        // Fill publisher field
        await page.getByPlaceholder("z.B. Conscious Path Publishing").fill("Test Verlag");
        await page.getByPlaceholder("z.B. Ludwigsburg").fill("Berlin");

        // Save
        await page.getByRole("button", {name: "Speichern"}).click();

        // Verify toast
        await expect(page.getByText("Metadaten gespeichert")).toBeVisible({timeout: 5000});
    });

    test("edit ISBN fields", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByRole("button", {name: "Metadaten"}).click();

        await page.getByPlaceholder("z.B. 9798253911952").fill("9781234567890");
        await page.getByPlaceholder("z.B. B0GV3XBGVB").fill("B0TESTTEST");

        await page.getByRole("button", {name: "Speichern"}).click();
        await expect(page.getByText("Metadaten gespeichert")).toBeVisible({timeout: 5000});
    });

    test("edit keywords", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByRole("button", {name: "Metadaten"}).click();

        await page.getByPlaceholder("z.B. philosophy, AI, consciousness").fill("philosophy, AI, consciousness");

        await page.getByRole("button", {name: "Speichern"}).click();
        await expect(page.getByText("Metadaten gespeichert")).toBeVisible({timeout: 5000});
    });

    test("back button returns to editor", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByRole("button", {name: "Metadaten"}).click();
        await expect(page.getByRole("heading", {name: "Buch-Metadaten"})).toBeVisible();

        // Click back
        await page.locator("button[title='Zurück zum Editor']").click();

        // Should show the editor again
        await expect(page.locator(".tiptap-editor")).toBeVisible();
    });

    test("chapter click returns to editor from metadata", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByRole("button", {name: "Metadaten"}).click();
        await expect(page.getByRole("heading", {name: "Buch-Metadaten"})).toBeVisible();

        // Click chapter in sidebar
        await page.getByText("Kapitel 1").click();

        // Should show editor
        await expect(page.locator(".tiptap-editor")).toBeVisible();
    });

    test("config sharing wizard shows other books", async ({page}) => {
        // Create a second book
        await createBook("Zweites Buch");

        await page.goto(`/book/${bookId}`);
        await page.getByRole("button", {name: "Metadaten"}).click();

        // Click copy button
        await page.getByRole("button", {name: "Von Buch uebernehmen"}).click();

        // Should show the other book
        await expect(page.getByText("Zweites Buch")).toBeVisible();
    });
});

test.describe("Extended Chapter Types", () => {
    let bookId: string;

    test.beforeEach(async () => {
        const book = await createBook("Kapiteltypen-Test");
        bookId = book.id;
    });

    test("create epilogue chapter", async ({page}) => {
        await page.goto(`/book/${bookId}`);

        // Empty state should show all types including Epilog
        await expect(page.getByRole("button", {name: "Epilog"})).toBeVisible();
    });

    test("create imprint chapter", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await expect(page.getByRole("button", {name: "Impressum"})).toBeVisible();
    });

    test("create part-intro via dropdown", async ({page}) => {
        await page.goto(`/book/${bookId}`);

        // First create a chapter so we get the sidebar dropdown
        await createChapter(bookId, "Kapitel 1");
        await page.reload();

        await page.locator("button[title='Hinzufügen']").click();
        await expect(page.getByRole("button", {name: "Teil-Einleitung"})).toBeVisible();
    });

    test("create interlude via dropdown", async ({page}) => {
        await page.goto(`/book/${bookId}`);

        await createChapter(bookId, "Kapitel 1");
        await page.reload();

        await page.locator("button[title='Hinzufügen']").click();
        await expect(page.getByRole("button", {name: "Interludium"})).toBeVisible();
    });

    test("all back matter types visible in empty state", async ({page}) => {
        await page.goto(`/book/${bookId}`);

        await expect(page.getByRole("button", {name: "Epilog"})).toBeVisible();
        await expect(page.getByRole("button", {name: "Impressum"})).toBeVisible();
        await expect(page.getByRole("button", {name: "Naechster Band"})).toBeVisible();
        await expect(page.getByRole("button", {name: "Ueber den Autor"})).toBeVisible();
        await expect(page.getByRole("button", {name: "Glossar"})).toBeVisible();
    });
});
