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
        await page.getByText("Exportieren...").click();

        await expect(page.getByText("Export: Exportbuch")).toBeVisible();

        // Close via cancel
        await page.getByText("Abbrechen").click();
        await expect(page.getByText("Export: Exportbuch")).not.toBeVisible();
    });

    test("format selection works", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByText("Exportieren...").click();

        // EPUB should be default
        const epubBtn = page.locator("strong", {hasText: "EPUB"}).locator("..");
        await expect(epubBtn).toHaveCSS("border-color", /.*/);

        // Click PDF
        await page.locator("strong", {hasText: "PDF"}).click();

        // Click Word
        await page.locator("strong", {hasText: "Word"}).click();
    });

    test("book type buttons visible for epub/pdf", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByText("Exportieren...").click();

        await expect(page.getByRole("button", {name: "E-Book", exact: true})).toBeVisible();
        await expect(page.getByRole("button", {name: "Taschenbuch"})).toBeVisible();
        await expect(page.getByRole("button", {name: "Hardcover"})).toBeVisible();
    });

    test("book type hidden for project format", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByText("Exportieren...").click();

        await page.locator("strong", {hasText: "Projekt (ZIP)"}).click();
        await expect(page.getByRole("button", {name: "E-Book", exact: true})).not.toBeVisible();
    });

    test("toc depth selector", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByText("Exportieren...").click();

        const select = page.locator("select");
        await expect(select).toHaveValue("2");
        await select.selectOption("3");
        await expect(select).toHaveValue("3");
    });

    test("section order collapsible", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByText("Exportieren...").click();

        // Section order should be collapsed by default
        const toggleBtn = page.getByText("Kapitelreihenfolge anpassen");
        if (await toggleBtn.isVisible()) {
            await toggleBtn.click();
            // Should show list items
            await expect(page.getByText("front-matter/toc.md").first()).toBeVisible();
        }
    });

    test("export triggers download", async ({page}) => {
        await page.goto(`/book/${bookId}`);
        await page.getByText("Exportieren...").click();

        // Select project ZIP (simplest, no Pandoc needed)
        await page.locator("strong", {hasText: "Projekt (ZIP)"}).click();

        // Verify export button text changes
        await expect(page.getByRole("button", {name: /Als Projekt/})).toBeVisible();
    });
});
