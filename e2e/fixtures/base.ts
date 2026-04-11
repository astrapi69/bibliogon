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
 * Accept a custom confirm/alert dialog by clicking the confirm
 * button. Uses the data-testid on the AppDialog confirm button so
 * the helper stays stable across language changes and ASCII-vs-
 * real-umlaut text variations.
 */
export async function acceptDialog(page: Page) {
    await page.getByTestId("app-dialog-confirm").click();
}

/**
 * Cancel a custom confirm/prompt dialog by clicking the cancel
 * button.
 */
export async function cancelDialog(page: Page) {
    await page.getByTestId("app-dialog-cancel").click();
}

/**
 * Fill and submit a custom prompt dialog.
 */
export async function fillPrompt(page: Page, value: string) {
    await page.locator("input.input").last().fill(value);
    await page.getByTestId("app-dialog-confirm").click();
}

export {createBook, createChapter, resetDb};
export {expect} from "@playwright/test";
