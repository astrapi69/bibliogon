import {test, expect, acceptDialog, fillPrompt, createBook, createChapter} from "../fixtures/base";

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
        await expect(page.locator(".tiptap-editor")).toBeVisible();
    });

    test("create chapter via dropdown", async ({page}) => {
        await page.goto(`/book/${bookId}`);

        await page.locator("button[title='Hinzufuegen']").click();
        await page.getByText("Neues Kapitel").click();

        // Custom prompt dialog
        await fillPrompt(page, "Neues Testkapitel");

        await expect(page.getByText("Neues Testkapitel")).toBeVisible();
    });

    test("create front-matter chapter", async ({page}) => {
        await page.goto(`/book/${bookId}`);

        await page.locator("button[title='Hinzufuegen']").click();
        await page.getByRole("button", {name: "Vorwort"}).click();

        await fillPrompt(page, "Mein Vorwort");

        await expect(page.getByText("Mein Vorwort")).toBeVisible();
        await expect(page.getByText("Front Matter")).toBeVisible();
    });

    test("delete chapter", async ({page}) => {
        await page.goto(`/book/${bookId}`);

        const chapterItem = page.getByText("Kapitel Zwei").locator("..");
        await chapterItem.locator("button[title='Kapitel loeschen']").click();

        // Custom confirm dialog
        await acceptDialog(page);

        await expect(page.getByText("Kapitel Zwei")).not.toBeVisible();
        await expect(page.getByText("Kapitel Eins")).toBeVisible();
    });

    test("autosave indicator appears on edit", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByText("Kapitel Eins").click();

        await page.locator(".tiptap-editor").click();
        await page.keyboard.type("Neuer Text");

        await expect(page.getByText("Speichert...")).toBeVisible({timeout: 2000});
    });

    test("word counter updates", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByText("Kapitel Eins").click();
        await expect(page.getByText(/\d+ Woerter?/)).toBeVisible();
    });

    test("markdown mode toggle", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByText("Kapitel Eins").click();

        await page.getByText("Markdown").click();
        await expect(page.locator("textarea")).toBeVisible();

        await page.getByText("WYSIWYG").click();
        await expect(page.locator(".tiptap-editor")).toBeVisible();
    });

    test("back to dashboard", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.locator("button[title='Zurueck']").click();
        await expect(page).toHaveURL("/");
    });

    test("empty book shows chapter type selection", async ({page}) => {
        const emptyBook = await createBook("Leerbuch");
        await page.goto(`/book/${emptyBook.id}`);
        await expect(page.getByText("Erstelle dein erstes Kapitel, um zu beginnen.")).toBeVisible();
        await expect(page.getByText("Front Matter")).toBeVisible();
        await expect(page.getByText("Neues Kapitel")).toBeVisible();
        await expect(page.getByText("Back Matter")).toBeVisible();
        await expect(page.getByText("Vorwort")).toBeVisible();
        await expect(page.getByText("Glossar")).toBeVisible();
    });
});
