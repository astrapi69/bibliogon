/**
 * Comic-book editor smoke (plugin-comics Session 2 C7
 * + Session 3 PAGES-CRUD-01 close
 * + PLUGIN-COMICS-MULTI-PAGE-NAVIGATION-01 C1 sidebar adoption).
 *
 * Exercises the comic-book full editor wiring end-to-end:
 *   - create a comic_book via API
 *   - open /book/{id} and assert the ComicBookEditor mounts
 *     (not the chapter editor, not the picture-book PageEditor)
 *   - the empty-state surfaces the PageThumbnails sidebar with
 *     an add-page button (post-C1: replaces the prior dedicated
 *     "Create first comic page" section + button — the sidebar's
 *     add-page button serves both first-create and subsequent-adds)
 *   - clicking the button creates page 1 + the sidebar row appears
 *   - the PdfExportControls mount under the comic-book-editor
 *     testid namespace (validates the C6 3-surface rename)
 *
 * Every namespaced testid here is exercised positively per the
 * "Testid namespace pinning prevents silent E2E skips" rule.
 */

import {test, expect, createComicBook} from "../fixtures/base";

test.describe("Comic-book editor smoke", () => {
    test("create comic_book -> editor mounts -> empty sidebar has add-page button", async ({
        page,
    }) => {
        const book = await createComicBook("My Comic Book", "E2E Author");

        await page.goto(`/book/${book.id}`);

        // The router branches on book_type; comic_book lands on
        // ComicBookEditor, NOT PageEditor.
        await expect(
            page.getByTestId("comic-book-editor-root"),
        ).toBeVisible();
        await expect(
            page.getByTestId("comic-book-editor-title"),
        ).toContainText("My Comic Book");

        // Empty-state surfaced through PageThumbnails sidebar; the
        // add-page button doubles as the first-create affordance.
        await expect(
            page.getByTestId("comic-book-editor-thumbnails-empty"),
        ).toBeVisible();
        await expect(
            page.getByTestId("comic-book-editor-add-page"),
        ).toBeVisible();
    });

    test("clicking add-page from empty state creates page 1 and reveals the sidebar row", async ({
        page,
    }) => {
        const book = await createComicBook("Create Page Comic", "E2E Author");

        await page.goto(`/book/${book.id}`);
        await expect(
            page.getByTestId("comic-book-editor-add-page"),
        ).toBeVisible();

        await page.getByTestId("comic-book-editor-add-page").click();

        // After create + refresh, the sidebar list appears (replacing
        // the empty-state marker) and the canvas grid is visible.
        await expect(
            page.getByTestId("comic-book-editor-page-list"),
        ).toBeVisible();
        await expect(
            page.getByTestId("comic-book-editor-thumbnails-empty"),
        ).toHaveCount(0);
        await expect(
            page.getByTestId("comic-book-editor-grid-wrapper"),
        ).toBeVisible();
    });

    test("PdfExportControls mounts under comic-book-editor namespace", async ({
        page,
    }) => {
        const book = await createComicBook("PDF Test Comic", "E2E Author");
        await page.goto(`/book/${book.id}`);

        await expect(
            page.getByTestId("comic-book-editor-root"),
        ).toBeVisible();
        // The renamed PdfExportControls (was
        // PictureBookPdfExportControls) is the 3rd caller surface
        // landed in C6. Both its format dropdown + export button
        // mount under the comic-book-editor testid prefix.
        await expect(
            page.getByTestId("comic-book-editor-pdf-format-select"),
        ).toBeVisible();
        await expect(
            page.getByTestId("comic-book-editor-export-pdf"),
        ).toBeVisible();
    });

    test("back button returns to dashboard", async ({page}) => {
        const book = await createComicBook("Back Test Comic", "E2E Author");
        await page.goto(`/book/${book.id}`);

        await expect(
            page.getByTestId("comic-book-editor-back"),
        ).toBeVisible();
        await page.getByTestId("comic-book-editor-back").click();
        await expect(page).toHaveURL("/");
    });
});
