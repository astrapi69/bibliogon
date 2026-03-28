import {test as base, type Page} from "@playwright/test";
import {resetDb, createBook, createChapter} from "../helpers/api";

/**
 * Extended test fixtures with DB reset.
 */
export const test = base.extend<{
    resetDatabase: void;
}>({
    resetDatabase: [async ({}, use) => {
        await resetDb();
        await use();
    }, {auto: true}],
});

/**
 * Accept a custom confirm/alert dialog by clicking the confirm button.
 */
export async function acceptDialog(page: Page) {
    await page.getByRole("button", {name: "Bestaetigen"}).or(page.getByRole("button", {name: "OK"})).click();
}

/**
 * Fill and submit a custom prompt dialog.
 */
export async function fillPrompt(page: Page, value: string) {
    await page.locator("input.input").last().fill(value);
    await page.getByRole("button", {name: "Bestaetigen"}).click();
}

export {createBook, createChapter, resetDb};
export {expect} from "@playwright/test";
