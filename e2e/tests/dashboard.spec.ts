import {test, expect, autoAcceptDialogs, createBook} from "../fixtures/base";

test.describe("Dashboard", () => {
    test("shows welcome state when no books exist", async ({page}) => {
        await page.goto("/");
        await expect(page.getByText("Willkommen bei Bibliogon")).toBeVisible();
        await expect(page.getByText("Buch erstellen")).toBeVisible();
        await expect(page.getByText("Projekt importieren")).toBeVisible();
        await expect(page.getByText("Erste Schritte")).toBeVisible();
    });

    test("create book via modal", async ({page}) => {
        await page.goto("/");
        await page.getByText("Neues Buch").click();
        await expect(page.getByText("Neues Buch").nth(1)).toBeVisible(); // modal heading

        await page.getByPlaceholder("Der Titel deines Buches").fill("E2E Testbuch");
        await page.getByPlaceholder("Autorenname oder Pen Name").fill("E2E Autor");
        await page.getByRole("button", {name: "Erstellen", exact: true}).click();

        // Book should appear on dashboard
        await expect(page.getByText("E2E Testbuch")).toBeVisible();
        await expect(page.getByText("E2E Autor")).toBeVisible();
    });

    test("open book navigates to editor", async ({page}) => {
        const book = await createBook("Klickbuch");
        await page.goto("/");
        await page.getByText("Klickbuch").click();
        await expect(page).toHaveURL(new RegExp(`/book/${book.id}`));
    });

    test("delete book moves to trash", async ({page}) => {
        await createBook("Loeschbuch");
        await page.goto("/");
        autoAcceptDialogs(page);

        await expect(page.getByText("Loeschbuch")).toBeVisible();

        // Find and click the delete button on the book card
        const card = page.locator("text=Loeschbuch").locator("..");
        await card.locator("button[title]").last().click();

        await expect(page.getByText("Loeschbuch")).not.toBeVisible();
    });

    test("trash view shows deleted books", async ({page}) => {
        const book = await createBook("Papierkorbtest");
        await page.goto("/");
        autoAcceptDialogs(page);

        // Delete the book
        const card = page.locator("text=Papierkorbtest").locator("..");
        await card.locator("button[title]").last().click();
        await expect(page.getByText("Papierkorbtest")).not.toBeVisible();

        // Open trash
        await page.locator("button[title='Papierkorb']").click();
        await expect(page.getByText("Papierkorb").first()).toBeVisible();
        await expect(page.getByText("Papierkorbtest")).toBeVisible();
    });

    test("restore book from trash", async ({page}) => {
        const book = await createBook("Wiederherstellbar");
        await page.goto("/");
        autoAcceptDialogs(page);

        // Delete
        const card = page.locator("text=Wiederherstellbar").locator("..");
        await card.locator("button[title]").last().click();

        // Open trash and restore
        await page.locator("button[title='Papierkorb']").click();
        await page.getByText("Wiederherstellen").click();

        // Go back to main view
        await page.getByText("Zurueck").click();
        await expect(page.getByText("Wiederherstellbar")).toBeVisible();
    });

    test("shows book count", async ({page}) => {
        await createBook("Buch Eins");
        await createBook("Buch Zwei");
        await page.goto("/");
        await expect(page.getByText("2 Buecher")).toBeVisible();
    });
});
