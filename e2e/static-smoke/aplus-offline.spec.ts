/**
 * A+ Content in the web app (#891), on the static Dexie build with no
 * backend. The author creates a book, fills the A+ document by hand, and
 * finds it again after a reload - stored in IndexedDB, with not a single
 * `/api` request. "Fill with AI" is visible but disabled with a reason
 * (desktop-only until #890).
 */

import {test, expect} from "@playwright/test";

test.beforeEach(async ({context}) => {
    await context.route(/\/(registerSW\.js|sw\.js)(\?|$)/, (route) => route.abort());
    await context.addInitScript(() => {
        try {
            localStorage.setItem("bibliogon-donation-onboarding-seen", "true");
            localStorage.setItem("bibliogon-ai-setup-dismissed", "true");
            localStorage.setItem("bibliogon-migration-offered", "true");
        } catch {
            /* storage unavailable: the assertions below report it */
        }
    });
});

test("the A+ document is edited and kept offline without any /api call", async ({page}) => {
    const apiCalls: string[] = [];
    page.on("request", (request) => {
        if (new URL(request.url()).pathname.includes("/api/")) apiCalls.push(request.url());
    });

    await page.goto("/books/new?type=prose");
    await page.getByTestId("create-book-title").fill("El caballo que se reía");
    const author = page.getByTestId("create-book-author");
    if (await author.isVisible()) await author.fill("Asterios Raptis");
    await page.getByTestId("create-book-submit").click();
    await page.getByRole("button", {name: /El caballo que se reía/}).first().click();
    await page.waitForURL(/\/book\/[^/?]+/, {timeout: 20_000});
    const bookPath = new URL(page.url()).pathname;

    await page.goto(`${bookPath}?view=metadata`);
    await page.getByTestId("metadata-tab-aplus").click();
    await expect(page.getByTestId("aplus-content-name")).toHaveValue("El caballo que se reía - A+Content");
    await expect(page.getByTestId("aplus-ai-fill")).toBeDisabled();
    await expect(page.getByTestId("aplus-ai-unavailable")).toBeVisible();

    await page.getByTestId("aplus-short-description").fill("Filimón es un caballo que sabe reír.");
    await page.getByTestId("aplus-module-1-slot-0-alt").fill("Caballo marrón mirando una olla de sopa");
    await expect(page.getByTestId("aplus-save-state")).not.toBeEmpty({timeout: 10_000});

    await page.reload();
    await page.getByTestId("metadata-tab-aplus").click();
    await expect(page.getByTestId("aplus-short-description")).toHaveValue(
        "Filimón es un caballo que sabe reír.",
    );
    await expect(page.getByTestId("aplus-module-1-slot-0-alt")).toHaveValue(
        "Caballo marrón mirando una olla de sopa",
    );
    expect(apiCalls).toEqual([]);
});
