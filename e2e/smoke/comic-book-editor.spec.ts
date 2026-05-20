/**
 * Comic-book editor smoke (plugin-comics Session 2 C7
 * + Session 3 PAGES-CRUD-01 close).
 *
 * Exercises the comic-book full editor wiring end-to-end:
 *   - create a comic_book via API
 *   - open /book/{id} and assert the ComicBookEditor mounts
 *     (not the chapter editor, not the picture-book PageEditor)
 *   - the empty-state surfaces a create-first-page action button
 *     (Session 3 close of PLUGIN-COMICS-SESSION-3-PAGES-CRUD-01;
 *     pages-CRUD now accepts comic_book at the core router)
 *   - clicking the button creates page 1 + the page nav appears
 *   - the PdfExportControls mount under the comic-book-editor
 *     testid namespace (validates the C6 3-surface rename)
 *
 * Every namespaced testid here is exercised positively per the
 * "Testid namespace pinning prevents silent E2E skips" rule.
 */

import {test, expect, createComicBook} from "../fixtures/base";

test.describe("Comic-book editor smoke", () => {
    test("create comic_book -> editor mounts -> empty-state has create-first-page button", async ({
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

        // Empty-state with action button (Session 3 close).
        await expect(
            page.getByTestId("comic-book-editor-no-pages"),
        ).toBeVisible();
        await expect(
            page.getByTestId("comic-book-editor-create-first-page"),
        ).toBeVisible();
    });

    test("clicking create-first-page creates page 1 and reveals the page nav", async ({
        page,
    }) => {
        const book = await createComicBook("Create Page Comic", "E2E Author");

        await page.goto(`/book/${book.id}`);
        await expect(
            page.getByTestId("comic-book-editor-create-first-page"),
        ).toBeVisible();

        await page.getByTestId("comic-book-editor-create-first-page").click();

        // After the create + refresh, the page nav appears and the
        // empty-state disappears.
        await expect(
            page.getByTestId("comic-book-editor-page-nav"),
        ).toBeVisible();
        await expect(
            page.getByTestId("comic-book-editor-no-pages"),
        ).toHaveCount(0);
        // The new page chip is rendered with the page's id in its
        // testid (``comic-book-editor-page-{id}``); the grid-wrapper
        // is also visible once a page exists. Use the grid-wrapper
        // testid as the unambiguous "pages exist now" signal; the
        // prefix selector would overmatch the ``page-nav`` container.
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
