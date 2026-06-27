/**
 * #662 E2E smoke: keyboard-shortcuts overview dialog.
 *
 * Pins the new behaviour:
 *   - Ctrl+/ (and ?) open a modal listing the registered shortcuts.
 *   - The search field filters the list.
 *   - Escape closes it.
 *   - Editor-section shortcuts (e.g. Ctrl+B) only appear on an editor
 *     route; the dashboard shows app-global shortcuts only.
 */
import { test, expect } from "../fixtures/base";
import { createBook, createChapter, deleteBook } from "../helpers/api";

test.describe("Keyboard-shortcuts overview dialog (#662)", () => {
    test("Ctrl+/ opens the dialog, search filters, Escape closes", async ({
        page,
    }) => {
        await page.goto("/");
        await expect(page.getByTestId("shortcuts-dialog")).toHaveCount(0);

        await page.keyboard.press("Control+Slash");
        const dialog = page.getByTestId("shortcuts-dialog");
        await expect(dialog).toBeVisible();

        // App-global shortcut is listed; editor-only shortcut is not (we are
        // on the dashboard).
        await expect(page.getByTestId("shortcuts-row-Ctrl+/")).toBeVisible();
        await expect(page.getByTestId("shortcuts-row-Ctrl+B")).toHaveCount(0);

        // Search filters down to a non-matching set -> empty state.
        await page.getByTestId("shortcuts-search").fill("zzzz-no-match");
        await expect(page.getByTestId("shortcuts-empty")).toBeVisible();

        // Escape closes the dialog.
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
    });

    test("editor route also lists editor-section shortcuts", async ({ page }) => {
        const book = await createBook("Tastenkürzel-Testbuch");
        await createChapter(book.id, "Kapitel 1");
        try {
            await page.goto(`/book/${book.id}`);
            await page.keyboard.press("Control+Slash");
            await expect(page.getByTestId("shortcuts-dialog")).toBeVisible();
            // On an editor route the editor formatting shortcuts show up.
            await expect(page.getByTestId("shortcuts-row-Ctrl+B")).toBeVisible();
            await expect(page.getByTestId("shortcuts-row-Ctrl+I")).toBeVisible();
        } finally {
            await deleteBook(book.id);
        }
    });
});
