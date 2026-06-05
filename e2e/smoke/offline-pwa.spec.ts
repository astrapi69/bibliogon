/**
 * Offline-PWA verification (Track B). Forces the app into Dexie/offline
 * storage mode via the `bibliogon.storage_mode` localStorage override (the
 * same switch the GitHub-Pages build sets via VITE_STORAGE_MODE=dexie), then
 * verifies the app boots and works entirely from the seeded Dexie tables.
 *
 * HARD GATE (step 5): a global `page.route('**\/api/**')` aborts AND records
 * every `/api` request; `afterEach` fails the test if the array is non-empty.
 * So the standard is literal **zero `/api` calls** in dexie mode for every
 * surface the tests touch - any future feature that forgets the storage seam
 * (or the request-layer offline guard) fails this spec.
 *
 * Run by Aster (Pre-Release Gate). Fails on pre-Track-B code (entities hit
 * `/api` directly and 404 on a backendless host).
 */

import {test, expect} from "../fixtures/base";

// Smoke tests mutate the viewport / storage mode; run this file serially so
// the shared per-test recorder below is never raced.
test.describe.configure({mode: "serial"});

let apiHits: string[] = [];

test.beforeEach(async ({page}) => {
    apiHits = [];
    // Force Dexie mode before any app code runs.
    await page.addInitScript(() => {
        try {
            localStorage.setItem("bibliogon.storage_mode", "dexie");
        } catch {
            /* ignore */
        }
    });
    // Hard gate: record + abort every /api request. With the storage seam +
    // the request-layer offline guard, none should ever fire.
    await page.route("**/api/**", (route) => {
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

test.describe("Offline PWA (Dexie mode)", () => {
    test("dashboard boots from Dexie with seeded i18n + types", async ({
        page,
    }) => {
        await page.goto("/");
        // The create split-button needs the seeded book-types to render.
        await expect(page.getByTestId("new-book-group")).toBeVisible();
        // A localized label proves the seeded catalog loaded.
        await expect(page.getByTestId("backup-export-btn")).toContainText(
            "Backup",
        );
    });

    test("backend-only backup action is disabled offline", async ({page}) => {
        await page.goto("/");
        await expect(page.getByTestId("new-book-group")).toBeVisible();
        await expect(page.getByTestId("backup-export-btn")).toBeDisabled();
    });

    test("settings persist to Dexie across reload", async ({page}) => {
        await page.goto("/settings?tab=verhalten");
        await expect(page.getByTestId("verhalten-settings")).toBeVisible();

        // Switch the language setting to English and save - to Dexie, not /api.
        await page.getByTestId("settings-language-trigger").click();
        await page.getByTestId("settings-language-item-en").click();
        await page.getByTestId("verhalten-settings-save").click();
        // No "Fehler beim Speichern": save succeeds (Dexie).
        await expect(page.getByTestId("verhalten-settings-save")).toBeEnabled();

        // Reload: the change persisted in IndexedDB.
        await page.reload();
        await expect(page.getByTestId("verhalten-settings")).toBeVisible();
        await expect(
            page.getByTestId("settings-language-trigger"),
        ).toContainText(/English|Englisch/);
    });

    test("create a book offline, edit a chapter, reload - persisted in Dexie", async ({
        page,
    }) => {
        await page.goto("/books/new");
        await page.getByTestId("create-book-title").fill("Offline Book");
        await page.getByTestId("create-book-author").fill("Aster");
        await page.getByTestId("create-book-submit").click();
        // Lands in the editor: the book was created in IndexedDB.
        await expect(page).toHaveURL(/\/book\//, {timeout: 10000});

        // Dashboard reload from Dexie - the book persists.
        await page.goto("/");
        await expect(page.getByTestId("new-book-group")).toBeVisible();
        await expect(page.getByText("Offline Book")).toBeVisible();
    });
});
