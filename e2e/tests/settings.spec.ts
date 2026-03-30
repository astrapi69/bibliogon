import {test, expect} from "../fixtures/base";

test.describe("Settings", () => {
    test("navigate to settings", async ({page}) => {
        await page.goto("/");
        await page.locator("button[title='Einstellungen']").click();
        await expect(page).toHaveURL("/settings");
        await expect(page.getByRole("heading", {name: "Einstellungen", exact: true})).toBeVisible();
    });

    test("app settings tab shows fields", async ({page}) => {
        await page.goto("/settings");
        await expect(page.getByText("App-Einstellungen")).toBeVisible();
        await expect(page.getByText("Standard-Sprache")).toBeVisible();
        await expect(page.getByText("Titel", {exact: true})).toBeVisible();
    });

    test("plugins tab shows plugin cards", async ({page}) => {
        await page.goto("/settings");
        await page.getByRole("tab", {name: "Plugins"}).click();

        // At least export plugin should be visible
        await expect(page.getByText("Buch-Export").first()).toBeVisible();
    });

    test("plugin enable/disable toggle", async ({page}) => {
        await page.goto("/settings");
        await page.getByRole("tab", {name: "Plugins"}).click();

        // Wait for plugin cards to load, then find any An/Aus button
        await page.waitForTimeout(1000);
        const anBtn = page.getByRole("button", {name: "An", exact: true}).first();
        const ausBtn = page.getByRole("button", {name: "Aus", exact: true}).first();

        if (await anBtn.isVisible({timeout: 3000}).catch(() => false)) {
            await anBtn.click();
        } else if (await ausBtn.isVisible({timeout: 3000}).catch(() => false)) {
            await ausBtn.click();
        }
    });

    test("plugin settings expand", async ({page}) => {
        await page.goto("/settings");
        await page.getByRole("tab", {name: "Plugins"}).click();

        // Click "Einstellungen" on first plugin that has it
        const settingsBtn = page.getByRole("button", {name: "Einstellungen"}).first();
        if (await settingsBtn.isVisible()) {
            await settingsBtn.click();
            // Should show some form fields or lists
            // Verify expanded content is visible (either scalar inputs or ordered lists)
            await expect(page.locator("input.input").first()).toBeVisible();
        }
    });

    test("licenses tab", async ({page}) => {
        await page.goto("/settings");
        await page.getByRole("tab", {name: "Lizenzen"}).click();
        await expect(page.getByText("Lizenz aktivieren")).toBeVisible();
        await expect(page.getByPlaceholder("Plugin-Name")).toBeVisible();
        await expect(page.getByPlaceholder("Lizenzschluessel")).toBeVisible();
    });

    test("back to dashboard", async ({page}) => {
        await page.goto("/settings");
        await page.locator("button").filter({has: page.locator("svg")}).first().click();
        await expect(page).toHaveURL("/");
    });
});
