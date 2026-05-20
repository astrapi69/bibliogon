/**
 * Comic-book editor smoke (plugin-comics Session 2 C7).
 *
 * Exercises the comic-book full editor wiring end-to-end:
 *   - create a comic_book via API
 *   - open /book/{id} and assert the ComicBookEditor mounts
 *     (not the chapter editor, not the picture-book PageEditor)
 *   - the degraded "no pages yet" state surfaces by default
 *     (page-CRUD for comic_book defers to Session 3 — see
 *     PLUGIN-COMICS-SESSION-3-PAGES-CRUD-01)
 *   - the PdfExportControls mount under the comic-book-editor
 *     testid namespace (validates the C6 3-surface rename)
 *
 * Every namespaced testid here is exercised positively per the
 * "Testid namespace pinning prevents silent E2E skips" rule.
 */

import {test, expect, createComicBook} from "../fixtures/base";

test.describe("Comic-book editor smoke", () => {
    test("create comic_book -> editor mounts -> degraded no-pages state", async ({
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

        // Page-CRUD for comic_book is gated by plugin-kinderbuch's
        // picture_book-only rule (filed as
        // PLUGIN-COMICS-SESSION-3-PAGES-CRUD-01). The editor
        // surfaces the degraded state.
        await expect(
            page.getByTestId("comic-book-editor-no-pages"),
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
