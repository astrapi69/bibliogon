import {test as base, type Page} from "@playwright/test";
import {resetDb, resetSettings, createBook, createChapter, deleteBook} from "../helpers/api";

/**
 * Extended test fixtures with DB + settings reset before every test.
 *
 * resetDb wipes all content tables; resetSettings restores the
 * mutation-prone app settings (dashboard view-modes / page-sizes, topics)
 * to the pre-suite baseline so a test that changes a global setting cannot
 * leak into the next — the cross-test state-pollution class that made many
 * specs pass in isolation but fail in the full serial run.
 */
export const test = base.extend<{
    resetDatabase: void;
}>({
    resetDatabase: [async ({page}, use) => {
        await resetDb();
        await resetSettings();
        // Suppress the one-time donation onboarding dialog (S-02).
        // It opens after the FIRST UI-created book and its
        // radix-dialog-overlay then intercepts every subsequent
        // click on the Dashboard. It is not what these specs test;
        // the dedicated donation specs seed their own localStorage.
        // Same baseline-normalisation intent as resetSettings.
        await page.addInitScript(() => {
            try {
                localStorage.setItem(
                    "bibliogon-donation-onboarding-seen",
                    "true",
                );
            } catch {
                // localStorage unavailable (privacy mode); ignore.
            }
        });
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

export {createBook, createChapter, resetDb, deleteBook};
export {updateBook, updateKdpPublishingState} from "../helpers/api";
export {createPictureBook, createComicBook} from "../helpers/api";
export {createArticle, deleteArticle, getArticles} from "../helpers/api";
export {softDeleteArticleViaKebab, softDeleteBookViaKebab} from "../helpers/ui";
export {expect} from "@playwright/test";
