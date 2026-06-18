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
    resetDatabase: [async ({context}, use) => {
        await resetDb();
        await resetSettings();
        // Suppress the one-time onboarding dialogs that auto-open on the
        // Dashboard and whose overlays intercept every subsequent click.
        // Neither is what these specs test; the dedicated onboarding specs
        // seed their own localStorage. Same baseline-normalisation intent
        // as resetSettings.
        //   - donation onboarding (S-02): opens after the first UI-created
        //     book.
        //   - AI-setup wizard: opens on the Dashboard whenever the app
        //     config reports AI is not enabled (or omits the ai block),
        //     the state an isolated/fresh E2E backend data dir can land in.
        // Applied to the CONTEXT (not a single page) so every page created
        // in the test inherits it - including `context.newPage()` tabs in
        // multi-tab specs (e.g. content-safety's 409-conflict two-tab race),
        // whose fresh tabs would otherwise show the AI-setup wizard and have
        // its Radix overlay intercept the sidebar click (#441).
        await context.addInitScript(() => {
            try {
                localStorage.setItem(
                    "bibliogon-donation-onboarding-seen",
                    "true",
                );
                localStorage.setItem("bibliogon-ai-setup-dismissed", "true");
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
