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
    // Hard gate: record + abort every backend /api request. With the storage
    // seam + the request-layer offline guard, none should ever fire. The
    // matcher is anchored to a `/api/` path right after the origin so it does
    // NOT catch the Vite dev server serving the source module
    // `/src/api/client.ts` (a glob `**\/api/**` over-matches that and aborting
    // it breaks module loading); the bundled GH-Pages build has no `/src/` path.
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

    test("create a book offline, reload - persisted in Dexie", async ({
        page,
    }) => {
        await page.goto("/books/new");
        await page.getByTestId("create-book-title").fill("Offline Book");
        await page.getByTestId("create-book-author").fill("Aster");
        await page.getByTestId("create-book-submit").click();

        // A prose book returns to the dashboard (only pageable types open the
        // editor), so the book was created in IndexedDB and now shows in the
        // library. `.first()` because an optimistic placeholder card and the
        // persisted card can both carry the title for a moment.
        await expect(page.getByText("Offline Book").first()).toBeVisible({
            timeout: 10000,
        });

        // Reload from Dexie - the book persists.
        await page.reload();
        await expect(page.getByTestId("new-book-group")).toBeVisible();
        await expect(page.getByText("Offline Book").first()).toBeVisible();
    });

    test("settings default-type dropdowns are populated from the seeded registries", async ({
        page,
    }) => {
        await page.goto("/settings?tab=verhalten");
        await expect(page.getByTestId("verhalten-settings")).toBeVisible();

        // Regression pin: the book-type + content-type registries must load
        // from the seam on first mount. If DexieStorage is not preloaded
        // before render, the one-shot providers race the lazy import, fall
        // back to ApiStorage (rejected offline), and the dropdowns stay empty.
        await page.getByTestId("settings-default-book-type-trigger").click();
        await expect(
            page.getByTestId("settings-default-book-type-item-prose"),
        ).toBeVisible();
        await page.keyboard.press("Escape");

        await page.getByTestId("settings-default-content-type-trigger").click();
        await expect(
            page.getByTestId("settings-default-content-type-item-blogpost"),
        ).toBeVisible();
    });

    test("authors work offline: creating a book adds the author to the local DB", async ({
        page,
    }) => {
        await page.goto("/books/new");
        await page.getByTestId("create-book-title").fill("Author Seam Book");
        await page.getByTestId("create-book-author").fill("Jane Offline");
        await page.getByTestId("create-book-submit").click();

        // The book is created AND (addToAuthorsDb defaults on) the new author
        // is written to the local Authors-DB. The afterEach hard gate proves
        // both went to Dexie, not a doomed /api call.
        await expect(page.getByText("Author Seam Book").first()).toBeVisible({
            timeout: 10000,
        });

        // The author persisted: it shows in Settings > Autoren.
        await page.goto("/settings?tab=autoren");
        await expect(page.getByTestId("authors-database-section")).toBeVisible();
        await expect(page.getByText("Jane Offline").first()).toBeVisible();
    });
});
