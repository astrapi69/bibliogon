/**
 * Offline-PWA verification (Track B). Forces the app into Dexie/offline
 * storage mode via the `bibliogon.storage_mode` localStorage override (the
 * same switch the GitHub-Pages build sets via VITE_STORAGE_MODE=dexie), then
 * verifies the app boots and works from the seeded Dexie tables WITHOUT
 * hitting the backend for the routed entities.
 *
 * The decisive check: while the routed reference/settings entities are
 * exercised, NO `/api/settings`, `/api/i18n`, `/api/book-types` or
 * `/api/content-types` request fires - they resolve from the storage seam.
 *
 * Run by Aster (Pre-Release Gate). These fail on the pre-Track-B code (the
 * entities hit `/api` directly and 404 on a backendless host).
 */

import {test, expect} from "../fixtures/base";

/** Force Dexie storage mode before any app code runs. */
async function forceDexie(page: import("@playwright/test").Page) {
    await page.addInitScript(() => {
        try {
            localStorage.setItem("bibliogon.storage_mode", "dexie");
        } catch {
            /* ignore */
        }
    });
}

/** Record every /api request the page makes (so we can assert which
 *  endpoints did/didn't fire). Requests still proceed. */
function recordApiCalls(page: import("@playwright/test").Page): string[] {
    const calls: string[] = [];
    page.on("request", (req) => {
        const url = req.url();
        if (url.includes("/api/")) calls.push(url);
    });
    return calls;
}

test.describe("Offline PWA (Dexie mode)", () => {
    test("dashboard boots from Dexie with seeded i18n + types, no /api", async ({
        page,
    }) => {
        await forceDexie(page);
        const apiCalls = recordApiCalls(page);
        await page.goto("/");
        // The create split-button needs the seeded book-types to render.
        await expect(page.getByTestId("new-book-group")).toBeVisible();
        // German is the seeded default; a localized label proves the seeded
        // catalog loaded (not the inline English fallback).
        await expect(page.getByTestId("backup-export-btn")).toContainText(
            "Backup",
        );
        // None of the routed reference/settings entities hit the backend.
        const routed = apiCalls.filter((u) =>
            /\/api\/(settings\/app|i18n\/|book-types|content-types)/.test(u),
        );
        expect(routed, `unexpected /api calls: ${routed.join(", ")}`).toEqual(
            [],
        );
    });

    test("backend-only backup action is disabled offline", async ({page}) => {
        await forceDexie(page);
        await page.goto("/");
        await expect(page.getByTestId("new-book-group")).toBeVisible();
        await expect(page.getByTestId("backup-export-btn")).toBeDisabled();
    });

    test("settings persist to Dexie across reload (no /api save)", async ({
        page,
    }) => {
        await forceDexie(page);
        await page.goto("/settings?tab=verhalten");
        await expect(page.getByTestId("verhalten-settings")).toBeVisible();

        // Switch the language setting to English and save.
        await page.getByTestId("settings-language-trigger").click();
        await page.getByTestId("settings-language-item-en").click();
        const apiCalls = recordApiCalls(page);
        await page.getByTestId("verhalten-settings-save").click();
        // No "Fehler beim Speichern": the save goes to Dexie, not a 405 PATCH.
        await expect(page.getByTestId("verhalten-settings-save")).toBeEnabled();
        expect(
            apiCalls.filter((u) => u.includes("/api/settings/app")),
        ).toEqual([]);

        // Reload: the change persisted in IndexedDB (English label shown).
        await page.reload();
        await expect(page.getByTestId("verhalten-settings")).toBeVisible();
        await expect(
            page.getByTestId("settings-language-trigger"),
        ).toContainText(/English|Englisch/);
    });

    test("create a book offline, reload - persisted in Dexie, no CRUD /api", async ({
        page,
    }) => {
        await forceDexie(page);
        // Fail the test if any book/chapter CRUD endpoint is hit: the create
        // + list must resolve to Dexie, not the backend.
        const crudCalls: string[] = [];
        await page.route("**/api/books**", (route) => {
            crudCalls.push(route.request().url());
            return route.abort();
        });

        await page.goto("/books/new");
        await page.getByTestId("create-book-title").fill("Offline Book");
        await page.getByTestId("create-book-author").fill("Aster");
        await page.getByTestId("create-book-submit").click();
        // Lands in the editor: the book was created in IndexedDB.
        await expect(page).toHaveURL(/\/book\//, {timeout: 10000});

        // Reload the dashboard from Dexie - the book persists.
        await page.goto("/");
        await expect(page.getByTestId("new-book-group")).toBeVisible();
        await expect(page.getByText("Offline Book")).toBeVisible();

        // The create + list never touched /api/books.
        expect(
            crudCalls,
            `book CRUD hit the backend: ${crudCalls.join(", ")}`,
        ).toEqual([]);
    });
});
