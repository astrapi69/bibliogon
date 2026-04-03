import {test, expect, createBook} from "../fixtures/base";

test.describe("Dashboard", () => {
    test("shows welcome state when no books exist", async ({page}) => {
        await page.goto("/");
        // Welcome text (i18n fallback is German)
        await expect(page.getByText(/Willkommen|Welcome/).first()).toBeVisible();
    });

    test("create book via modal", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: /Neues Buch|New Book/}).click();

        // Two-stage modal: Stage 1 has Title and Author
        await page.getByPlaceholder(/Titel|title/i).fill("E2E Testbuch");
        // Author might be a select (if profile set) or input
        const authorInput = page.getByPlaceholder(/Autor|Author|Pen Name/i);
        if (await authorInput.isVisible({timeout: 1000}).catch(() => false)) {
            await authorInput.fill("E2E Autor");
        }
        await page.getByRole("button", {name: /Erstellen|Create/}).click();

        await expect(page.getByText("E2E Testbuch")).toBeVisible();
    });

    test("open book navigates to editor", async ({page}) => {
        const book = await createBook("Klickbuch");
        await page.goto("/");
        await page.getByText("Klickbuch").click();
        await expect(page).toHaveURL(new RegExp(`/book/${book.id}`));
    });

    test("delete book via dropdown menu", async ({page}) => {
        await createBook("Loeschbuch");
        await page.goto("/");
        await expect(page.getByText("Loeschbuch")).toBeVisible();

        // BookCard has MoreVertical dropdown
        const card = page.locator("text=Loeschbuch").locator("..").locator("..");
        await card.locator("button").last().click();

        // Click "In den Papierkorb" in dropdown (no confirm dialog)
        await page.getByText(/Papierkorb|trash/i).first().click();

        await page.waitForTimeout(500);
        await expect(page.getByText("Loeschbuch")).not.toBeVisible();
    });

    test("trash view shows deleted books", async ({page}) => {
        await createBook("Papierkorbtest");
        await page.goto("/");

        // Delete via dropdown
        const card = page.locator("text=Papierkorbtest").locator("..").locator("..");
        await card.locator("button").last().click();
        await page.getByText(/Papierkorb|trash/i).first().click();
        await page.waitForTimeout(500);

        // Open trash view - button might have title or be in hamburger
        const trashBtn = page.locator("button").filter({hasText: /Papierkorb|Trash/});
        if (await trashBtn.first().isVisible({timeout: 2000}).catch(() => false)) {
            await trashBtn.first().click();
        }
        await expect(page.getByText("Papierkorbtest")).toBeVisible();
    });

    test("restore book from trash", async ({page}) => {
        await createBook("Wiederherstellbar");
        await page.goto("/");

        const card = page.locator("text=Wiederherstellbar").locator("..").locator("..");
        await card.locator("button").last().click();
        await page.getByText(/Papierkorb|trash/i).first().click();
        await page.waitForTimeout(500);

        // Open trash
        const trashBtn = page.locator("button").filter({hasText: /Papierkorb|Trash/});
        if (await trashBtn.first().isVisible({timeout: 2000}).catch(() => false)) {
            await trashBtn.first().click();
        }

        await page.getByText(/Wiederherstellen|Restore/).click();
        // Navigate back
        await page.locator("button").filter({has: page.locator("svg")}).first().click();
        await expect(page.getByText("Wiederherstellbar")).toBeVisible();
    });

    test("shows book count", async ({page}) => {
        await createBook("Buch Eins");
        await createBook("Buch Zwei");
        await page.goto("/");
        // Book count in various i18n formats
        await expect(page.getByText(/2\s+(Bücher|books)/i)).toBeVisible();
    });
});
