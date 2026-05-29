/**
 * Title Editing smoke (Title Editing C1-C4).
 *
 * EditableTitle is the shared pencil-toggle inline title editor wired
 * into all four editor surfaces. This smoke covers the unpublished
 * happy path on the two Book surfaces (prose via the chapter sidebar,
 * picture-book via the PageEditor header): open edit -> change ->
 * Enter -> the display updates -> reload -> the change persisted.
 *
 * The published-work warning gate + acknowledge flow are covered by
 * frontend/src/components/EditableTitle.test.tsx (Vitest). There is no
 * e2e fixture that seeds a published Book/Article, so the warning path
 * is not exercised here.
 *
 * Testid namespace pinned per the "Testid namespace pinning prevents
 * silent E2E skips" rule: {surface}-title-text / -edit / -input, with
 * surface prefixes book-editor-title (prose sidebar) and
 * page-editor-title (picture-book header). Every pinned id below is
 * exercised positively.
 */

import {test, expect, createBook, createPictureBook} from "../fixtures/base";

test.describe("Title editing (EditableTitle)", () => {
    test("prose book: pencil-edit the sidebar title, persists across reload", async ({
        page,
    }) => {
        const book = await createBook("Prosa Titel Alt", "E2E Author");
        await page.goto(`/book/${book.id}`);

        // Display node + pencil are present; the input is not yet.
        await expect(
            page.getByTestId("book-editor-title-text"),
        ).toContainText("Prosa Titel Alt");
        await expect(
            page.getByTestId("book-editor-title-input"),
        ).toHaveCount(0);

        await page.getByTestId("book-editor-title-edit").click();

        const input = page.getByTestId("book-editor-title-input");
        await expect(input).toBeVisible();
        await input.fill("Prosa Titel Neu");
        await input.press("Enter");

        // Back to display mode with the new title.
        await expect(
            page.getByTestId("book-editor-title-text"),
        ).toContainText("Prosa Titel Neu");

        // Persisted: a reload re-fetches from the API.
        await page.reload();
        await expect(
            page.getByTestId("book-editor-title-text"),
        ).toContainText("Prosa Titel Neu");
    });

    test("picture book: pencil-edit the header title, persists across reload", async ({
        page,
    }) => {
        const book = await createPictureBook("Bilderbuch Titel Alt", "E2E Author");
        await page.goto(`/book/${book.id}`);

        await page.getByTestId("page-editor-title-edit").click();
        const input = page.getByTestId("page-editor-title-input");
        await expect(input).toBeVisible();
        await input.fill("Bilderbuch Titel Neu");
        await input.press("Enter");

        await expect(
            page.getByTestId("page-editor-title-text"),
        ).toContainText("Bilderbuch Titel Neu");

        await page.reload();
        await expect(
            page.getByTestId("page-editor-title-text"),
        ).toContainText("Bilderbuch Titel Neu");
    });

    test("Escape cancels the edit without persisting", async ({page}) => {
        const book = await createBook("Escape Test Alt", "E2E Author");
        await page.goto(`/book/${book.id}`);

        await page.getByTestId("book-editor-title-edit").click();
        const input = page.getByTestId("book-editor-title-input");
        await input.fill("Should Not Save");
        await input.press("Escape");

        // Reverted in place + still reverted after a reload.
        await expect(
            page.getByTestId("book-editor-title-text"),
        ).toContainText("Escape Test Alt");
        await page.reload();
        await expect(
            page.getByTestId("book-editor-title-text"),
        ).toContainText("Escape Test Alt");
    });
});
