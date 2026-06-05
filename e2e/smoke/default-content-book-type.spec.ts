/**
 * Configurable default book-type + content-type smoke
 * (CONFIGURABLE-DEFAULT-CONTENT-BOOK-TYPE-01).
 *
 * Pins the user-visible behaviour of the two new Settings > Verhalten
 * "Standardwerte" dropdowns and how they flow into book/article
 * creation:
 *   1. the Verhalten tab exposes both dropdowns and a change persists
 *      to ui.defaults.book_type via PATCH /api/settings/app
 *   2. /books/new pre-selects the configured default book-type; an
 *      explicit ?type= overrides it
 *   3. the Dashboard "Neues Buch" primary button creates the configured
 *      default type
 *   4. /articles/new pre-selects the configured default content-type;
 *      an explicit ?type= overrides it
 *   5. the Article-list "Neuer Artikel" primary button creates the
 *      configured default content-type
 *
 * The auto resetSettings fixture restores ui.* to the pre-suite
 * baseline before each test, so each test seeds its own default and
 * cannot leak into the next.
 */

import {test, expect} from "../fixtures/base";

const API = "http://localhost:8000/api";

async function setDefaults(defaults: {
    book_type?: string;
    content_type?: string;
}): Promise<void> {
    const res = await fetch(`${API}/settings/app`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ui: {defaults}}),
    });
    if (!res.ok) {
        throw new Error(`PATCH defaults: ${res.status} ${await res.text()}`);
    }
}

test.describe("Configurable default book-type + content-type", () => {
    test("Verhalten tab exposes both dropdowns and persists a book-type change", async ({page}) => {
        await page.goto("/settings?tab=verhalten");

        await expect(page.getByTestId("settings-defaults")).toBeVisible();
        const bookTrigger = page.getByTestId("settings-default-book-type-trigger");
        await expect(bookTrigger).toBeVisible();
        await expect(
            page.getByTestId("settings-default-content-type-trigger"),
        ).toBeVisible();

        // Change the default book-type to comic_book via the Radix select.
        await bookTrigger.click();
        await page
            .getByTestId("settings-default-book-type-item-comic_book")
            .click();
        // Wait for the Radix listbox to close, which guarantees the
        // onChange has committed the new value into React state before
        // we click save (clicking mid-transition raced the selection).
        await expect(
            page.getByTestId("settings-default-book-type-item-comic_book"),
        ).toBeHidden();
        await page.getByTestId("verhalten-settings-save").click();

        // The change round-trips to the backend. Generous timeout: the
        // PATCH writes the user-overlay config file and the GET reads it
        // back, which can lag under parallel E2E load.
        await expect
            .poll(
                async () => {
                    const r = await fetch(`${API}/settings/app`);
                    const b = await r.json();
                    return b.ui?.defaults?.book_type;
                },
                {timeout: 10000},
            )
            .toBe("comic_book");
    });

    test("/books/new pre-selects the configured default; ?type= overrides", async ({page}) => {
        await setDefaults({book_type: "comic_book"});

        await page.goto("/books/new");
        await expect(
            page.getByTestId("create-book-title-comic_book"),
        ).toBeVisible();

        // An explicit ?type= always wins over the configured default.
        await page.goto("/books/new?type=picture_book");
        await expect(
            page.getByTestId("create-book-title-picture_book"),
        ).toBeVisible();
    });

    test("Dashboard 'Neues Buch' primary creates the configured default type", async ({page}) => {
        await setDefaults({book_type: "comic_book"});

        await page.goto("/");
        await page.getByTestId("new-book-btn").click();
        await expect(page).toHaveURL(/\/books\/new$/);
        await expect(
            page.getByTestId("create-book-title-comic_book"),
        ).toBeVisible();
    });

    test("/articles/new pre-selects the configured default; ?type= overrides", async ({page}) => {
        await setDefaults({content_type: "tutorial"});

        await page.goto("/articles/new");
        await expect(
            page.getByTestId("create-article-title-tutorial"),
        ).toBeVisible();

        // An explicit ?type= always wins over the configured default.
        await page.goto("/articles/new?type=blogpost");
        await expect(
            page.getByTestId("create-article-title-blogpost"),
        ).toBeVisible();
    });

    test("Article-list 'Neuer Artikel' primary creates the configured default type", async ({page}) => {
        await setDefaults({content_type: "tutorial"});

        await page.goto("/articles");
        await page.getByTestId("article-list-new").click();
        await expect(page).toHaveURL(/\/articles\/new$/);
        await expect(
            page.getByTestId("create-article-title-tutorial"),
        ).toBeVisible();
    });
});
