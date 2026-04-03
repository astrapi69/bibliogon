import {test, expect, createBook} from "../fixtures/base";

test.describe("Navigation", () => {
    test("dashboard loads at root", async ({page}) => {
        await page.goto("/");
        await expect(page.getByText("Bibliogon").first()).toBeVisible();
    });

    test("navigate to help", async ({page}) => {
        await page.goto("/help");
        await expect(page).toHaveURL("/help");
    });

    test("navigate to get-started", async ({page}) => {
        await page.goto("/get-started");
        await expect(page).toHaveURL("/get-started");
        await expect(page.getByText(/Erste Schritte|Get Started/)).toBeVisible();
    });

    test("navigate to settings", async ({page}) => {
        await page.goto("/settings");
        await expect(page).toHaveURL("/settings");
        await expect(page.getByText(/Einstellungen|Settings/)).toBeVisible();
    });

    test("dark mode toggle", async ({page}) => {
        await page.goto("/");
        // Theme toggle button (Toggle icon)
        const toggleBtns = page.locator("button").filter({has: page.locator("svg")});
        // Find the theme toggle by trying to click it
        await toggleBtns.nth(1).click();
        const theme = await page.locator("html").getAttribute("data-theme");
        expect(theme === "dark" || theme === "light").toBeTruthy();
    });

    test("help page has tabs", async ({page}) => {
        await page.goto("/help");
        // Radix tabs
        const tabs = page.getByRole("tab");
        await expect(tabs.first()).toBeVisible();
    });

    test("get-started wizard shows steps", async ({page}) => {
        await page.goto("/get-started");
        // Wizard has step indicators (numbered circles)
        await expect(page.getByText(/Schritt|Step/).first()).toBeVisible();
    });

    test("get-started wizard navigation", async ({page}) => {
        await page.goto("/get-started");
        // Click "Weiter" or "Next" button
        const nextBtn = page.getByText(/Weiter|Next/);
        if (await nextBtn.isVisible({timeout: 2000}).catch(() => false)) {
            await nextBtn.click();
            // Should advance to step 2
            await expect(page.getByText(/Schritt 2|Step 2/)).toBeVisible();
        }
    });
});
