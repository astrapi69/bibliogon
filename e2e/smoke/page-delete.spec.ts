/**
 * Page-delete smoke spec (PAGES-DELETE-EDITOR-UI-01 C4).
 *
 * Exercises the delete-page flow end-to-end across BOTH editor
 * surfaces (picture_book + comic_book) — the affordance is shared
 * via PageThumbnails' onDelete prop (C1), and both editors wire
 * the confirm + DB call + activePageId cleanup the same way (C2).
 *
 * Positive paths covered:
 *   1. picture-book: create 2 pages → delete page 2 → row count → 1
 *      + remaining row visible at user-perceivable height.
 *   2. picture-book: delete the active page → next page auto-selects.
 *   3. picture-book: delete the LAST remaining page → empty-state
 *      restored.
 *   4. comic-book: same shape — delete a page, sidebar shrinks.
 *
 * Negative path covered:
 *   5. cancel the confirm dialog → page persists, no row removed.
 *
 * Bounding-box-dimension discipline (per LL "Playwright-visible
 * != User-visible"): post-delete rows must remain at non-zero
 * height — otherwise a CSS-collapsed strip would pass
 * toBeVisible() but be useless to the user.
 *
 * AppDialog interaction discipline (per LL "Menu-Dialog Lifecycle:
 * do not preventDefault inside onSelect" — the inverse case for
 * spec authors): the dialog opens above the sidebar; clicking the
 * dialog's Bestätigen / Confirm / OK button resolves the
 * Promise<boolean> the editor's handleDeletePage awaits.
 */

import {test, expect, createPictureBook, createComicBook} from "../fixtures/base";

test.describe("Page-delete smoke", () => {
    test("picture-book: delete a non-active page; row count drops to 1", async ({
        page,
    }) => {
        const book = await createPictureBook("Delete Non-Active", "E2E Author");
        await page.goto(`/book/${book.id}`);

        // Add a second page (the picture-book template creates page 1
        // implicitly on first navigation — fall through to add-page if
        // not yet auto-created).
        await page.getByTestId("page-editor-add-page").click();
        await page.getByTestId("page-editor-add-page").click();

        const rows = page.locator('[data-testid^="page-editor-page-row-"]');
        await expect(rows).toHaveCount(2);

        // Hover on row 1 to surface its delete affordance (CSS makes
        // .deleteBtn opacity:0 → opacity:0.6 on row hover).
        await rows.nth(0).hover();
        const deleteBtns = page.locator(
            '[data-testid^="page-editor-delete-page-"]',
        );
        // Click the first row's delete button.
        await deleteBtns.nth(0).click();

        // AppDialog confirms → click Bestätigen / Confirm / OK.
        await page
            .getByRole("button", {name: /(Bestätigen|Confirm|OK)/})
            .click();

        // Row count drops to 1.
        await expect(rows).toHaveCount(1);

        // Remaining row visible at user-perceivable height.
        const bbox = await rows.nth(0).boundingBox();
        expect(bbox).not.toBeNull();
        expect(bbox!.height).toBeGreaterThan(20);
    });

    test("picture-book: deleting the active page auto-selects the next page", async ({
        page,
    }) => {
        const book = await createPictureBook("Auto-Select Next", "E2E Author");
        await page.goto(`/book/${book.id}`);

        await page.getByTestId("page-editor-add-page").click();
        await page.getByTestId("page-editor-add-page").click();

        const rows = page.locator('[data-testid^="page-editor-page-row-"]');
        await expect(rows).toHaveCount(2);

        // After 2nd add, page 2 is active (handleAddPage auto-selects).
        await expect(rows.nth(1)).toHaveAttribute("data-active", "true");

        // Capture the row 1 id so we can assert it becomes active after
        // deleting row 2.
        const row1TestId = await rows.nth(0).getAttribute("data-testid");
        const row1Id = row1TestId!.replace("page-editor-page-row-", "");

        // Delete the active (2nd) page.
        await rows.nth(1).hover();
        await page
            .getByTestId(
                `page-editor-delete-page-${
                    (await rows.nth(1).getAttribute("data-testid"))!.replace(
                        "page-editor-page-row-",
                        "",
                    )
                }`,
            )
            .click();
        await page
            .getByRole("button", {name: /(Bestätigen|Confirm|OK)/})
            .click();

        await expect(rows).toHaveCount(1);
        // The remaining row (was row 1) is now active.
        await expect(
            page.getByTestId(`page-editor-page-row-${row1Id}`),
        ).toHaveAttribute("data-active", "true");
    });

    test("picture-book: deleting the LAST remaining page restores empty-state", async ({
        page,
    }) => {
        const book = await createPictureBook("Empty After Delete", "E2E Author");
        await page.goto(`/book/${book.id}`);

        await page.getByTestId("page-editor-add-page").click();
        const rows = page.locator('[data-testid^="page-editor-page-row-"]');
        await expect(rows).toHaveCount(1);

        await rows.nth(0).hover();
        const deleteBtn = page.locator(
            '[data-testid^="page-editor-delete-page-"]',
        );
        await deleteBtn.click();
        await page
            .getByRole("button", {name: /(Bestätigen|Confirm|OK)/})
            .click();

        // Empty-state marker reappears + add-page button stays visible
        // (no Half-Wired gap).
        await expect(
            page.getByTestId("page-editor-thumbnails-empty"),
        ).toBeVisible();
        await expect(page.getByTestId("page-editor-add-page")).toBeVisible();
    });

    test("picture-book: cancelling the confirm leaves the page in place", async ({
        page,
    }) => {
        const book = await createPictureBook("Cancel Delete", "E2E Author");
        await page.goto(`/book/${book.id}`);

        await page.getByTestId("page-editor-add-page").click();
        const rows = page.locator('[data-testid^="page-editor-page-row-"]');
        await expect(rows).toHaveCount(1);

        await rows.nth(0).hover();
        await page
            .locator('[data-testid^="page-editor-delete-page-"]')
            .click();

        // Click Abbrechen / Cancel — AppDialog resolves false.
        await page
            .getByRole("button", {name: /(Abbrechen|Cancel)/})
            .click();

        // Row STILL there.
        await expect(rows).toHaveCount(1);
    });

    test("comic-book: delete a page; sidebar shrinks + empty-state if last", async ({
        page,
    }) => {
        const book = await createComicBook("Comic Delete", "E2E Author");
        await page.goto(`/book/${book.id}`);

        await expect(
            page.getByTestId("comic-book-editor-add-page"),
        ).toBeVisible();
        await page.getByTestId("comic-book-editor-add-page").click();

        const rows = page.locator(
            '[data-testid^="comic-book-editor-page-row-"]',
        );
        await expect(rows).toHaveCount(1);

        await rows.nth(0).hover();
        await page
            .locator('[data-testid^="comic-book-editor-delete-page-"]')
            .click();
        await page
            .getByRole("button", {name: /(Bestätigen|Confirm|OK)/})
            .click();

        // Empty-state restored.
        await expect(
            page.getByTestId("comic-book-editor-thumbnails-empty"),
        ).toBeVisible();
        // Add-page button still reachable (no Half-Wired gap).
        await expect(
            page.getByTestId("comic-book-editor-add-page"),
        ).toBeVisible();
    });
});
