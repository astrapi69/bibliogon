import {test, expect, autoAcceptDialogs, createBook, createChapter} from "../fixtures/base";

test.describe("Book Editor", () => {
    let bookId: string;

    test.beforeEach(async () => {
        const book = await createBook("Editorbuch");
        bookId = book.id;
        await createChapter(bookId, "Kapitel Eins", "Erster Inhalt");
        await createChapter(bookId, "Kapitel Zwei", "Zweiter Inhalt");
    });

    test("shows chapters in sidebar", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await expect(page.getByText("Kapitel Eins")).toBeVisible();
        await expect(page.getByText("Kapitel Zwei")).toBeVisible();
    });

    test("switch between chapters", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByText("Kapitel Zwei").click();
        // Editor should load second chapter content
        await expect(page.locator(".tiptap-editor")).toBeVisible();
    });

    test("create chapter via dropdown", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        autoAcceptDialogs(page, "Neues Testkapitel");

        // Open add menu
        await page.locator("button[title='Hinzufuegen']").click();
        await expect(page.getByText("Neues Kapitel")).toBeVisible();

        // Click "Neues Kapitel"
        await page.getByText("Neues Kapitel").click();

        // Verify chapter appears
        await expect(page.getByText("Neues Testkapitel")).toBeVisible();
    });

    test("create front-matter chapter", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        autoAcceptDialogs(page, "Mein Vorwort");

        await page.locator("button[title='Hinzufuegen']").click();
        await page.getByRole("button", {name: "Vorwort"}).click();

        await expect(page.getByText("Mein Vorwort")).toBeVisible();
        await expect(page.getByText("Front Matter")).toBeVisible();
    });

    test("delete chapter", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        autoAcceptDialogs(page);

        // Delete second chapter
        const chapterItem = page.getByText("Kapitel Zwei").locator("..");
        await chapterItem.locator("button[title='Kapitel loeschen']").click();

        await expect(page.getByText("Kapitel Zwei")).not.toBeVisible();
        await expect(page.getByText("Kapitel Eins")).toBeVisible();
    });

    test("autosave indicator appears on edit", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByText("Kapitel Eins").click();

        // Type in editor
        await page.locator(".tiptap-editor").click();
        await page.keyboard.type("Neuer Text");

        // Wait for autosave indicator
        await expect(page.getByText("Speichert...")).toBeVisible({timeout: 2000});
    });

    test("word counter updates", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByText("Kapitel Eins").click();

        // Word count should be visible
        await expect(page.getByText(/\d+ Woerter?/)).toBeVisible();
    });

    test("markdown mode toggle", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByText("Kapitel Eins").click();

        // Switch to markdown
        await page.getByText("Markdown").click();
        await expect(page.locator("textarea")).toBeVisible();

        // Switch back to WYSIWYG
        await page.getByText("WYSIWYG").click();
        await expect(page.locator(".tiptap-editor")).toBeVisible();
    });

    test("back to dashboard", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.locator("button[title='Zurueck']").click();
        await expect(page).toHaveURL("/");
    });

    test("empty book shows create prompt", async ({page}) => {
        const emptyBook = await createBook("Leerbuch");
        await page.goto(`/book/${emptyBook.id}`);
        await expect(page.getByText("Erstelle ein Kapitel, um zu beginnen.")).toBeVisible();
    });
});
