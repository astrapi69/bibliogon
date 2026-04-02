import {test, expect} from "../fixtures/base";

test.describe("Settings", () => {
    test("navigate to settings", async ({page}) => {
        await page.goto("/");
        // Settings button may be in hamburger menu on mobile or inline on desktop
        const settingsBtn = page.locator("button[title='Einstellungen']");
        if (await settingsBtn.isVisible({timeout: 2000}).catch(() => false)) {
            await settingsBtn.click();
        } else {
            // Try hamburger menu
            await page.locator("button").filter({has: page.locator("svg")}).last().click();
            await page.getByText("Einstellungen").click();
        }
        await expect(page).toHaveURL("/settings");
        await expect(page.getByRole("heading", {name: "Einstellungen", exact: true})).toBeVisible();
    });

    test("app settings tab shows fields", async ({page}) => {
        await page.goto("/settings");
        await expect(page.getByText("App-Einstellungen")).toBeVisible();
        await expect(page.getByText("Sprache", {exact: true})).toBeVisible();
        await expect(page.getByText("App-Name", {exact: true})).toBeVisible();
    });

    test("author tab shows profile fields", async ({page}) => {
        await page.goto("/settings");
        await page.getByRole("tab", {name: "Autor"}).click();
        await expect(page.getByText("Autorenprofil")).toBeVisible();
    });

    test("plugins tab shows plugin cards", async ({page}) => {
        await page.goto("/settings");
        await page.getByRole("tab", {name: "Plugins"}).click();

        // At least export plugin should be visible
        await expect(page.getByText("Buch-Export").first()).toBeVisible();
    });

    test("core plugins have Standard badge", async ({page}) => {
        await page.goto("/settings");
        await page.getByRole("tab", {name: "Plugins"}).click();
        await expect(page.getByText("Standard").first()).toBeVisible();
    });

    test("plugin settings expand", async ({page}) => {
        await page.goto("/settings");
        await page.getByRole("tab", {name: "Plugins"}).click();

        // Click "Einstellungen" on first plugin that has it
        const settingsBtn = page.getByRole("button", {name: "Einstellungen"}).first();
        if (await settingsBtn.isVisible()) {
            await settingsBtn.click();
            await expect(page.locator("input.input").first()).toBeVisible();
        }
    });

    test("licenses tab", async ({page}) => {
        await page.goto("/settings");
        await page.getByRole("tab", {name: "Lizenzen"}).click();
        await expect(page.getByText("Lizenz aktivieren")).toBeVisible();
    });

    test("back to dashboard", async ({page}) => {
        await page.goto("/settings");
        await page.locator("button").filter({has: page.locator("svg")}).first().click();
        await expect(page).toHaveURL("/");
    });
});
