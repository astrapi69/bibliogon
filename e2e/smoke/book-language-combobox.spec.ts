/**
 * Book-language combobox smoke (feature/book-language-combobox).
 *
 * Pins the live-stack behaviour of the dependency-free ComboboxSelect
 * that replaced the Radix language dropdowns:
 *
 * 1. Create-book form: the language combobox (behind "Weitere Details")
 *    opens, filters its option list as the user types, selects a fixed
 *    default, and commits a typed custom value via the "+ Add" row.
 * 2. Settings > Verhalten: a custom language can be added through the
 *    custom-language editor and a removable chip appears for it.
 *
 * data-testid selectors only (i18n-stable). Written by Claude Code; run
 * by Aster (Pre-Release Gate).
 */

import { test, expect } from "../fixtures/base";

test.describe("Book-language combobox", () => {
    test("create-book language combobox filters, selects, and commits a custom value", async ({
        page,
    }) => {
        await page.goto("/books/new?type=prose");

        await page.getByTestId("create-book-title").waitFor({ state: "visible" });

        // The language field lives in the optional "Weitere Details" section.
        await page.getByTestId("create-book-more-details").click();

        const combo = page.getByTestId("create-book-language");
        await expect(combo).toBeVisible();

        // Focus opens the listbox; all defaults are present.
        await combo.click();
        await expect(
            page.getByTestId("create-book-language-listbox"),
        ).toBeVisible();
        await expect(
            page.getByTestId("create-book-language-option-de"),
        ).toBeVisible();

        // Typing filters down to a single match.
        await combo.fill("Eng");
        await expect(
            page.getByTestId("create-book-language-option-en"),
        ).toBeVisible();
        await expect(
            page.getByTestId("create-book-language-option-de"),
        ).toHaveCount(0);

        // Select the filtered default; the input reflects the endonym.
        await page.getByTestId("create-book-language-option-en").click();
        await expect(combo).toHaveValue("English");

        // Commit a custom value via the "+ Add" affordance.
        await combo.click();
        await combo.fill("Latin");
        await page.getByTestId("create-book-language-custom-add").click();
        await expect(combo).toHaveValue("Latin");
    });

    test("settings adds a removable custom language", async ({ page }) => {
        await page.goto("/settings?tab=verhalten");

        await expect(
            page.getByTestId("settings-custom-languages"),
        ).toBeVisible();

        const input = page.getByTestId("settings-custom-language-input");
        await input.fill("Klingon");
        await page.getByTestId("settings-custom-language-add").click();

        await expect(
            page.getByTestId("settings-custom-language-remove-Klingon"),
        ).toBeVisible();

        // Removing the chip drops it from the list.
        await page
            .getByTestId("settings-custom-language-remove-Klingon")
            .click();
        await expect(
            page.getByTestId("settings-custom-language-remove-Klingon"),
        ).toHaveCount(0);
    });
});
