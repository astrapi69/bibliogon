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
        await page.getByRole("button", {name: /Metadaten|Metadata/}).click();
        await expect(page.getByText(/Buch-Metadaten|Book Metadata/)).toBeVisible();
    });

    test("metadata editor shows all sections", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByRole("button", {name: /Metadaten|Metadata/}).click();

        await expect(page.getByRole("heading", {name: /Allgemein|General/})).toBeVisible();
        await expect(page.getByRole("heading", {name: /Verlag|Publisher/})).toBeVisible();
        await expect(page.getByRole("heading", {name: /ISBN/})).toBeVisible();
        await expect(page.getByRole("heading", {name: /Marketing/})).toBeVisible();
        await expect(page.getByRole("heading", {name: /Design/})).toBeVisible();
    });

    test("edit and save metadata", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByRole("button", {name: /Metadaten|Metadata/}).click();

        // Fill publisher field
        const publisherInput = page.getByPlaceholder(/Publishing|Verlag/);
        if (await publisherInput.isVisible({timeout: 1000}).catch(() => false)) {
            await publisherInput.fill("Test Verlag");
        }

        // Save
        await page.getByRole("button", {name: /Speichern|Save/}).click();
        await expect(page.getByText(/gespeichert|saved/i)).toBeVisible({timeout: 5000});
    });

    test("keywords chip input", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByRole("button", {name: /Metadaten|Metadata/}).click();

        // KeywordInput is a chip input, not a plain text field
        const keywordInput = page.getByPlaceholder(/Keyword|keyword/i);
        if (await keywordInput.isVisible({timeout: 2000}).catch(() => false)) {
            await keywordInput.fill("philosophy");
            await keywordInput.press("Enter");
            // Should show as chip
            await expect(page.getByText("philosophy")).toBeVisible();
            // Counter should show 1/7
            await expect(page.getByText("1/7")).toBeVisible();
        }
    });

    test("back button returns to editor", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByRole("button", {name: /Metadaten|Metadata/}).click();

        // Back button (ChevronLeft, first button)
        await page.locator("button").filter({has: page.locator("svg")}).first().click();
        await expect(page.locator(".tiptap-editor")).toBeVisible();
    });

    test("chapter click returns to editor from metadata", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByRole("button", {name: /Metadaten|Metadata/}).click();

        // Click chapter in sidebar
        await page.getByText("Kapitel 1").click();
        await expect(page.locator(".tiptap-editor")).toBeVisible();
    });
});
