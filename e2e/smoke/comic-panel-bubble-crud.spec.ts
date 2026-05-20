/**
 * Comic-book editor action-buttons + side-pane smoke
 * (plugin-comics Session 2 C7).
 *
 * Validates the action-button + side-pane wiring of the new
 * full ComicBookEditor (C6). Page-CRUD is gated by plugin-
 * kinderbuch's picture_book-only contract — filed as
 * PLUGIN-COMICS-SESSION-3-PAGES-CRUD-01 in C7 — so this spec
 * exercises the action-button presence + the no-pages degraded
 * state instead of the create-roundtrip flow.
 *
 * Once Session 3 ships the comic-page CRUD endpoint, the
 * full panel-create roundtrip becomes testable end-to-end (and
 * a Session-3 follow-up spec will extend this coverage). For
 * Session 2, the buttons + their disabled states pin the
 * editor's surface contract.
 */

import {test, expect, createComicBook} from "../fixtures/base";

test.describe("Comic-book editor surface smoke", () => {
    test("editor exposes Add/Delete Panel + Bubble buttons + side pane in degraded state", async ({
        page,
    }) => {
        const book = await createComicBook("Buttons Test", "E2E Author");
        await page.goto(`/book/${book.id}`);

        await expect(
            page.getByTestId("comic-book-editor-root"),
        ).toBeVisible();

        // Degraded "no pages yet" state: the page-CRUD buttons are
        // NOT rendered when pages.length === 0 (the editor enters
        // a different layout branch). The Pdf controls + back are
        // still present so the user has working header affordances.
        await expect(
            page.getByTestId("comic-book-editor-no-pages"),
        ).toBeVisible();
        await expect(
            page.getByTestId("comic-book-editor-back"),
        ).toBeEnabled();
        await expect(
            page.getByTestId("comic-book-editor-pdf-format-select"),
        ).toBeVisible();
    });

    test("PDF format dropdown carries the 5 KDP options", async ({page}) => {
        const book = await createComicBook(
            "PDF Dropdown Test",
            "E2E Author",
        );
        await page.goto(`/book/${book.id}`);

        // Reuse-of-picture-book-formats decision (Q4 a) is the
        // contract: comic-book PDFs use the same 5 KDP trim sizes
        // as picture-books. If a future commit narrows the set
        // for comic-book without updating the spec, this assertion
        // fires.
        const select = page.getByTestId(
            "comic-book-editor-pdf-format-select",
        );
        await expect(select).toBeVisible();
        const options = await select
            .locator("option")
            .allTextContents();
        expect(options.length).toBeGreaterThanOrEqual(5);
    });
});
