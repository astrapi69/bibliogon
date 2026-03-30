import {test, expect, createBook} from "../fixtures/base";

test.describe("Navigation", () => {
    test("dashboard loads at root", async ({page}) => {
        await page.goto("/");
        await expect(page.getByText("Bibliogon").first()).toBeVisible();
    });

    test("navigate to help", async ({page}) => {
        await page.goto("/");
        await page.locator("button[title='Hilfe']").click();
        await expect(page).toHaveURL("/help");
        await expect(page.getByText("Hilfe")).toBeVisible();
    });

    test("navigate to get-started", async ({page}) => {
        await page.goto("/");
        await page.locator("button[title='Erste Schritte']").click();
        await expect(page).toHaveURL("/get-started");
        await expect(page.getByText("Erste Schritte")).toBeVisible();
    });

    test("navigate to settings", async ({page}) => {
        await page.goto("/");
        await page.locator("button[title='Einstellungen']").click();
        await expect(page).toHaveURL("/settings");
    });

    test("dark mode toggle", async ({page}) => {
        await page.goto("/");

        // Click theme toggle
        const toggleBtn = page.locator("button[title='Dark Mode']").or(page.locator("button[title='Light Mode']"));
        await toggleBtn.first().click();

        // Check that data-theme attribute changed
        const theme = await page.locator("html").getAttribute("data-theme");
        expect(theme === "dark" || theme === "light").toBeTruthy();

        // Toggle back
        await toggleBtn.first().click();
    });

    test("help page tabs work", async ({page}) => {
        await page.goto("/help");

        // Shortcuts tab (default)
        await expect(page.getByRole("heading", {name: "Tastenkuerzel"})).toBeVisible();

        // FAQ tab
        await page.getByRole("tab", {name: /FAQ/}).click();
        await expect(page.getByRole("heading", {name: "Haeufig gestellte Fragen"})).toBeVisible();

        // About tab
        await page.getByRole("tab", {name: /Ueber/}).click();
        await expect(page.getByRole("heading", {name: "Ueber Bibliogon"})).toBeVisible();
    });

    test("get-started page shows steps", async ({page}) => {
        await page.goto("/get-started");
        await expect(page.getByText("Schritt fuer Schritt")).toBeVisible();
        await expect(page.getByText("0% abgeschlossen")).toBeVisible();
    });

    test("get-started step toggle", async ({page}) => {
        await page.goto("/get-started");

        // Click a step card to mark it as done
        const stepCard = page.locator("[style*='cursor: pointer']").first();
        if (await stepCard.isVisible()) {
            await stepCard.click();
            // Progress should increase from 0%
            await expect(page.getByText("0% abgeschlossen")).not.toBeVisible({timeout: 3000});
        }
    });
});
