/**
 * Non-functional-UI audit (#101) regression smoke. Forces Dexie/offline mode
 * (the GitHub-Pages build) and verifies the surfaces that used to be empty or
 * crash offline now work AND fire zero `/api`:
 *
 *  - unknown route       -> custom 404 page (catch-all <Route path="*">)
 *  - /help               -> shortcuts render from the offline seed
 *  - /get-started        -> onboarding guide renders from the offline seed
 *
 * Same hard `/api` gate as offline-pwa.spec.ts: any `/api` call in dexie mode
 * fails the test.
 *
 * Run by Aster (Claude Code writes the spec; Aster runs it).
 */

import {test, expect} from "../fixtures/base";

test.describe.configure({mode: "serial"});

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

test.describe("Non-functional UI offline (Dexie mode)", () => {
    test("unknown route renders the custom 404 page", async ({page}) => {
        await page.goto("/this/route/does/not/exist");
        await expect(page.getByTestId("not-found-page")).toBeVisible();
        await expect(page.getByTestId("not-found-home-link")).toBeVisible();
        // Route home works.
        await page.getByTestId("not-found-home-link").click();
        await expect(page).toHaveURL(/\/$/);
    });

    test("/help renders keyboard shortcuts from the offline seed", async ({
        page,
    }) => {
        await page.goto("/help");
        // Shortcut keys are not localized, so this is language-agnostic and
        // proves the offline help seed populated the (default) shortcuts tab.
        await expect(page.getByText("Ctrl+B").first()).toBeVisible();
    });

    test("/get-started renders the onboarding guide from the offline seed", async ({
        page,
    }) => {
        await page.goto("/get-started");
        // The first guide step ("choose-book-type") renders the book-type
        // grid; an empty guide (the pre-fix offline state) would crash before
        // this. Its presence proves the seed-backed guide loaded.
        await expect(
            page.getByTestId("getstarted-book-type-grid"),
        ).toBeVisible();
    });
});
