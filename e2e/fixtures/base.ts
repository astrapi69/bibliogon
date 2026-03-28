import {test as base, type Page} from "@playwright/test";
import {resetDb, createBook, createChapter} from "../helpers/api";

/**
 * Extended test fixtures with DB reset and dialog auto-handling.
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
 * Auto-accept confirm/prompt/alert dialogs.
 * Call before actions that trigger native dialogs.
 */
export function autoAcceptDialogs(page: Page, promptValue: string = "Testkapitel") {
    page.on("dialog", async (dialog) => {
        if (dialog.type() === "prompt") {
            await dialog.accept(promptValue);
        } else {
            await dialog.accept();
        }
    });
}

export {createBook, createChapter, resetDb};
export {expect} from "@playwright/test";
