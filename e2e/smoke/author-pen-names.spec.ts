/**
 * Pen-names dropdown regression (#103). In Dexie/offline mode, a pen name
 * added in Settings > Autorenprofil must appear as a selectable option in the
 * book + article create author dropdowns. The old native <datalist> filtered
 * its options by the pre-filled real name, hiding the pen names; the fix
 * renders a real <select> of profile identities.
 *
 * Same hard `/api` gate as the other offline smokes: zero `/api` in Dexie mode.
 *
 * Run by Aster.
 */

import type {Page} from "@playwright/test";

import {test, expect} from "../fixtures/base";

test.describe.configure({mode: "serial"});

/**
 * Wait until BOTH Autoren-tab seam writes have committed. The flow fires two
 * saves: blurring the real-name field auto-saves it, then the Add button
 * saves the pen name. Each "saved" toast renders only after its `updateApp`
 * resolves, so waiting for both toasts gates a reload/navigation that would
 * otherwise abort the in-flight IndexedDB write and lose the pen name.
 */
async function expectProfileSaved(page: Page): Promise<void> {
    await expect(page.locator(".Toastify__toast--success")).toHaveCount(2);
}

let apiHits: string[] = [];

test.beforeEach(async ({page}) => {
    apiHits = [];
    await page.addInitScript(() => {
        try {
            localStorage.setItem("bibliogon.storage_mode", "dexie");
        } catch {
            /* ignore */
        }
    });
    await page.route(/^https?:\/\/[^/]+\/api\//, (route) => {
        apiHits.push(route.request().url());
        return route.abort();
    });
});

test.afterEach(() => {
    expect(
        apiHits,
        `app fired ${apiHits.length} /api call(s) in dexie mode: ${apiHits.join(", ")}`,
    ).toEqual([]);
});

test.describe("Author pen names (Dexie mode)", () => {
    test("a pen name added in Settings shows in the book + article author select", async ({
        page,
    }) => {
        // 1. Set the real name + add a pen name (auto-saved through the seam).
        await page.goto("/settings?tab=autoren");
        await page.getByTestId("author-real-name").fill("Asterios Raptis");
        await page.getByTestId("author-real-name").blur();
        await page.getByTestId("author-pen-name-input").fill("Draven Quantum");
        await page.getByTestId("author-pen-name-add").click();
        await expect(page.getByTestId("author-pen-name-0")).toContainText(
            "Draven Quantum",
        );
        await expectProfileSaved(page);

        // The Dexie write is async; reload Settings to confirm it actually
        // landed in IndexedDB before the create forms read it (otherwise the
        // navigation can race the flush and read a stale profile).
        await page.reload();
        await expect(page.getByTestId("author-real-name")).toHaveValue(
            "Asterios Raptis",
        );
        await expect(page.getByTestId("author-pen-name-0")).toContainText(
            "Draven Quantum",
        );

        // 2. Create book: the select lists the real name AND the pen name.
        const bookSelect = page.getByTestId("create-book-author-select");
        await page.goto("/books/new");
        await expect(bookSelect).toBeVisible();
        await expect
            .poll(async () =>
                bookSelect.evaluate((el) =>
                    Array.from(
                        (el as HTMLSelectElement).querySelectorAll("option"),
                    ).map((o) => (o as HTMLOptionElement).value),
                ),
            )
            .toEqual(
                expect.arrayContaining(["Asterios Raptis", "Draven Quantum"]),
            );

        // 3. Create article: same options.
        const articleSelect = page.getByTestId("create-article-author-select");
        await page.goto("/articles/new");
        await expect(articleSelect).toBeVisible();
        await expect
            .poll(async () =>
                articleSelect.evaluate((el) =>
                    Array.from(
                        (el as HTMLSelectElement).querySelectorAll("option"),
                    ).map((o) => (o as HTMLOptionElement).value),
                ),
            )
            .toEqual(expect.arrayContaining(["Draven Quantum"]));
    });

    test("pen name persists across reload (not transient)", async ({page}) => {
        await page.goto("/settings?tab=autoren");
        await page.getByTestId("author-real-name").fill("Asterios Raptis");
        await page.getByTestId("author-real-name").blur();
        await page.getByTestId("author-pen-name-input").fill("Draven Quantum");
        await page.getByTestId("author-pen-name-add").click();
        await expect(page.getByTestId("author-pen-name-0")).toContainText(
            "Draven Quantum",
        );
        // Gate the reload on both seam writes committing - otherwise reload
        // aborts the in-flight IndexedDB write and the pen name is lost.
        await expectProfileSaved(page);

        await page.reload();
        await expect(page.getByTestId("author-pen-name-0")).toContainText(
            "Draven Quantum",
        );
    });
});
