import {test, expect, acceptDialog, createBook, createChapter} from "../fixtures/base";

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
        // Radix DropdownMenu trigger (+ button in sidebar)
        await page.locator("button").filter({has: page.locator("svg")}).nth(2).click();
        await page.waitForTimeout(300);
        // Click "Neues Kapitel" or "New Chapter" in dropdown
        await page.getByText(/Neues Kapitel|New Chapter/).click();
        await page.waitForTimeout(500);
        // Chapter should be created with default title
    });

    test("create front-matter chapter", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        // Open chapter add dropdown
        await page.locator("button").filter({has: page.locator("svg")}).nth(2).click();
        await page.waitForTimeout(300);
        await page.getByText(/Vorwort|Preface/).click();
        await page.waitForTimeout(500);
        await expect(page.getByText("Front Matter")).toBeVisible();
    });

    test("delete chapter", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        // Hover over chapter to show delete button (Tooltip wrapped)
        const chapterItem = page.getByText("Kapitel Zwei").locator("..").locator("..");
        await chapterItem.hover();
        // Click the delete button (Trash icon)
        const deleteBtn = chapterItem.locator("button").last();
        await deleteBtn.click();
        // Custom confirm dialog
        await acceptDialog(page);
        await expect(page.getByText("Kapitel Zwei")).not.toBeVisible();
    });

    test("autosave indicator appears on edit", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByText("Kapitel Eins").click();
        await page.locator(".tiptap-editor").click();
        await page.keyboard.type("Neuer Text");
        // i18n: "Speichert..." or "Saving..."
        await expect(page.getByText(/Speichert|Saving/)).toBeVisible({timeout: 3000});
    });

    test("word counter updates", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByText("Kapitel Eins").click();
        // i18n: "Wörter" or "Words"
        await expect(page.getByText(/\d+\s+(Wörter|Words)/)).toBeVisible();
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
        // First button in sidebar header (ChevronLeft)
        await page.locator("aside button").first().click();
        await expect(page).toHaveURL("/");
    });

    test("empty book shows chapter type selection", async ({page}) => {
        const emptyBook = await createBook("Leerbuch");
        await page.goto(`/book/${emptyBook.id}`);
        await expect(page.getByText("Front Matter")).toBeVisible();
        await expect(page.getByText("Back Matter")).toBeVisible();
        // Should show some chapter type buttons
        await expect(page.getByText(/Neues Kapitel|New Chapter/)).toBeVisible();
    });
});
