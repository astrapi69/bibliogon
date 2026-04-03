import {test, expect, createBook, createChapter} from "../fixtures/base";

test.describe("Export Dialog", () => {
    let bookId: string;

    test.beforeEach(async () => {
        const book = await createBook("Exportbuch");
        bookId = book.id;
        await createChapter(bookId, "Kapitel 1", "Inhalt fuer Export");
    });

    test("open and close export dialog", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByText(/Exportieren|Export/).click();

        // Radix Dialog should open
        await expect(page.getByText("Export: Exportbuch")).toBeVisible();

        // Close via cancel
        await page.getByRole("button", {name: /Abbrechen|Cancel/}).click();
        await expect(page.getByText("Export: Exportbuch")).not.toBeVisible();
    });

    test("format selection works", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByText(/Exportieren|Export/).click();

        // Click PDF
        await page.locator("strong", {hasText: "PDF"}).click();
        // Click Word
        await page.locator("strong", {hasText: "Word"}).click();
    });

    test("book type buttons visible", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByText(/Exportieren|Export/).click();

        await expect(page.getByRole("button", {name: /E-Book/})).toBeVisible();
        await expect(page.getByRole("button", {name: /Taschenbuch|Paperback/})).toBeVisible();
        await expect(page.getByRole("button", {name: /Hardcover/})).toBeVisible();
    });

    test("batch export button visible", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByText(/Exportieren|Export/).click();

        // "Alle Formate" batch button
        await expect(page.getByRole("button", {name: /Alle Formate|All Formats/})).toBeVisible();
    });

    test("toc depth selector", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByText(/Exportieren|Export/).click();

        const select = page.locator("select");
        if (await select.isVisible({timeout: 1000}).catch(() => false)) {
            await expect(select).toHaveValue("2");
        }
    });

    test("export button shows format name", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByText(/Exportieren|Export/).click();

        // Should show "Als EPUB exportieren" or similar
        await expect(page.getByRole("button", {name: /EPUB|exportieren|Export/})).toBeVisible();
    });
});
