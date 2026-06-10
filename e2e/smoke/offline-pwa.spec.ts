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

import * as path from "node:path";

import {test, expect} from "../fixtures/base";

// Resolve the fixture via __dirname (CJS) rather than import.meta.url: the
// latter forces Playwright to load this spec as ESM, which breaks the runner's
// require shim ("require is not defined in ES module scope") under the e2e
// package's default CommonJS module mode.
const MEDIUM_ZIP = path.join(__dirname, "..", "fixtures", "medium-export.zip");

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

    test("book trash works offline: soft-delete -> trash -> restore (Finding 7)", async ({
        page,
    }) => {
        // Create a prose book offline (returns to the dashboard).
        await page.goto("/books/new");
        await page.getByTestId("create-book-title").fill("Trash Book");
        await page.getByTestId("create-book-author").fill("Aster");
        await page.getByTestId("create-book-submit").click();
        await expect(page.getByText("Trash Book").first()).toBeVisible({
            timeout: 10000,
        });

        // Soft-delete via the card menu — moves it to the trash (Dexie
        // deleted_at), so it vanishes from the library but the trash
        // badge appears.
        await page
            .locator('[data-testid^="book-card-menu-"]')
            .filter({ hasNot: page.locator("[data-testid*='-delete']") })
            .first()
            .click();
        await page
            .locator(
                '[data-testid^="book-card-menu-delete-"]:not([data-testid*="permanent"])',
            )
            .first()
            .click();
        await expect(page.getByText("Trash Book")).toHaveCount(0);
        await expect(page.getByTestId("trash-badge")).toHaveText("1");

        // Open the trash — the soft-deleted book shows there.
        await page.getByTestId("trash-toggle").click();
        await expect(page.getByTestId("trash-view")).toBeVisible();
        await expect(page.getByText("Trash Book").first()).toBeVisible();

        // Restore brings it back to the active library.
        await page
            .locator('[data-testid="trash-grid"] [data-testid$="-restore"]')
            .first()
            .click();
        await page.getByTestId("trash-toggle").click();
        await expect(page.getByText("Trash Book").first()).toBeVisible();

        // Persisted across reload (restore cleared deleted_at in Dexie).
        await page.reload();
        await expect(page.getByText("Trash Book").first()).toBeVisible();
    });

    test("export a book offline downloads a file via the client engine", async ({
        page,
    }) => {
        // Create a prose book offline, then open it to learn its id.
        await page.goto("/books/new");
        await page.getByTestId("create-book-title").fill("Export Me");
        await page.getByTestId("create-book-author").fill("Aster");
        await page.getByTestId("create-book-submit").click();
        await expect(page.getByText("Export Me").first()).toBeVisible({
            timeout: 10000,
        });
        await page.getByText("Export Me").first().click();
        await page.waitForURL(/\/book\//);
        const bookId = page.url().match(/\/book\/([^/?]+)/)?.[1];
        expect(bookId).toBeTruthy();

        // The dedicated export surface shows the client export offline (not the
        // backend-only gate), and a format pick yields a real browser download.
        await page.goto(`/books/${bookId}/export`);
        await expect(page.getByTestId("export-page-client")).toBeVisible();
        const downloadPromise = page.waitForEvent("download");
        await page.getByTestId("export-page-client-trigger").click();
        await page.getByTestId("client-export-markdown").click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.md$/);
    });

    test("story bible works offline: add an entity, it persists in Dexie", async ({
        page,
    }) => {
        await page.goto("/books/new");
        await page.getByTestId("create-book-title").fill("Saga");
        await page.getByTestId("create-book-author").fill("Aster");
        await page.getByTestId("create-book-submit").click();
        await expect(page.getByText("Saga").first()).toBeVisible({ timeout: 10000 });
        await page.getByText("Saga").first().click();
        await page.waitForURL(/\/book\//);

        // The Story Bible is un-gated offline (seam getInfo reports available).
        // Story Bible lives in the collapsible sidebar tools group; expand it
        // if collapsed (the default is viewport-responsive — Issue #42).
        const toolsToggle = page.getByTestId("chapter-sidebar-tools-toggle");
        if ((await toolsToggle.getAttribute("data-state")) === "closed") {
            await toolsToggle.click();
        }
        await page.getByTestId("story-bible-toggle").click();
        await expect(page.getByTestId("story-bible-sidebar")).toBeVisible();

        // Add a character; the seeded entity-type registry drives the group.
        await page.getByTestId("story-bible-group-toggle-character").click();
        await page.getByTestId("story-bible-add-character").click();
        await page.getByTestId("story-bible-add-input-character").fill("Frodo");
        await page.getByTestId("story-bible-add-save-character").click();
        await expect(page.getByText("Frodo").first()).toBeVisible();
    });

    test("picture-book editor works offline: add a page via Dexie", async ({
        page,
    }) => {
        // Picture-book is a pageable type -> creating it opens the page editor.
        await page.goto("/books/new?type=picture_book");
        await page.getByTestId("create-book-title").fill("Bilderbuch");
        await page.getByTestId("create-book-author").fill("Aster");
        await page.getByTestId("create-book-submit").click();
        await page.waitForURL(/\/book\//);

        // The editor is no longer gated offline; pages persist to Dexie.
        await expect(page.getByTestId("page-editor-root")).toBeVisible();
        await page.getByTestId("page-editor-add-page").click();
        await expect(page.getByTestId("page-editor-page-list")).toBeVisible();
    });

    test("book cover uploads + displays offline from IndexedDB, persists across reload", async ({
        page,
    }) => {
        // A 1x1 PNG — valid image bytes so the browser renders the blob.
        const PNG_1x1 =
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        const coverFile = {
            name: "cover.png",
            mimeType: "image/png",
            buffer: Buffer.from(PNG_1x1, "base64"),
        };

        // Create a prose book offline, learn its id.
        await page.goto("/books/new");
        await page.getByTestId("create-book-title").fill("Cover Book");
        await page.getByTestId("create-book-author").fill("Aster");
        await page.getByTestId("create-book-submit").click();
        await expect(page.getByText("Cover Book").first()).toBeVisible({
            timeout: 10000,
        });
        await page.getByText("Cover Book").first().click();
        await page.waitForURL(/\/book\//);
        const bookId = page.url().match(/\/book\/([^/?]+)/)?.[1];
        expect(bookId).toBeTruthy();

        // Design tab → upload a cover. Stored in IndexedDB (covers seam), not /api.
        await page.goto(`/book/${bookId}?view=metadata`);
        await page.getByTestId("metadata-tab-design").click();
        await page
            .getByTestId("cover-upload-input")
            .setInputFiles(coverFile);

        // The cover displays from a blob: URL resolved out of IndexedDB.
        const preview = page.getByTestId("cover-preview-img");
        await expect(preview).toBeVisible({ timeout: 10000 });
        await expect(preview).toHaveAttribute("src", /^blob:/);

        // Persist cover_image to the book row (Dexie), then reload from scratch.
        // Wait for the save to COMPLETE before navigating: the button re-enables
        // only after the awaited books.update commits (handleSave: setSaving(false)
        // runs after onSave resolves). Navigating on the bare click() destroys the
        // JS context mid-write, so cover_image never persists and the reload shows
        // the empty cover state (the deterministic failure this guards).
        await page.getByTestId("metadata-save").click();
        await expect(page.getByTestId("metadata-save")).toBeEnabled();
        await page.goto(`/book/${bookId}?view=metadata`);
        await page.getByTestId("metadata-tab-design").click();
        const reloaded = page.getByTestId("cover-preview-img");
        await expect(reloaded).toBeVisible({ timeout: 10000 });
        await expect(reloaded).toHaveAttribute("src", /^blob:/);
    });

    test("AI works offline: configure a key + the test call goes browser->provider", async ({
        page,
    }) => {
        // Mock the provider so the browser-direct call gets a canned OK. The
        // provider URL is NOT under /api/, so the hard gate does not abort it.
        await page.route("https://api.openai.com/**", (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    model: "gpt-4o",
                    choices: [{message: {content: "OK"}}],
                    usage: {total_tokens: 3},
                }),
            }),
        );

        await page.goto("/settings?tab=ai");
        await expect(page.getByTestId("ai-assistant-settings")).toBeVisible();

        // AI is enabled by default in the seeded config, so the provider
        // section is interactive without toggling ai-enabled (which would turn
        // it OFF and make the section pointer-events:none). Pick OpenAI
        // (auto-fills base_url + model), enter a key.
        await page.getByTestId("ai-provider-trigger").click();
        await page.getByTestId("ai-provider-item-openai").click();
        await page.getByTestId("ai-api-key-input").fill("sk-test");

        // "Test connection" runs entirely in the browser against the provider.
        const providerCall = page.waitForRequest(
            "https://api.openai.com/v1/chat/completions",
        );
        await page.getByTestId("ai-test").click();
        await providerCall;
        // The config (incl. the key) persisted to IndexedDB via the seam.
        // afterEach proves the whole flow fired zero /api calls.
    });

    test("comments work offline: imported comment -> admin -> soft-delete -> trash -> restore", async ({
        page,
    }) => {
        // Import the fixture (1 article + 1 comment) offline.
        await page.goto("/articles/import/medium");
        await page.getByTestId("medium-import-upload-input").setInputFiles(MEDIUM_ZIP);
        await page.getByTestId("medium-import-start").click();
        await expect(page.getByTestId("medium-import-preview-section")).toBeVisible({
            timeout: 10000,
        });
        await page.getByTestId("medium-import-preview-import-btn").click();
        await expect(page.getByTestId("medium-import-result")).toBeVisible({
            timeout: 10000,
        });

        // The imported comment shows in Settings > Kommentare (from Dexie).
        await page.goto("/settings?tab=comments");
        await expect(page.getByTestId("comments-admin-section")).toBeVisible();
        await expect(page.getByText("Thanks, great post!").first()).toBeVisible({
            timeout: 10000,
        });

        // Soft-delete it (confirm dialog) — moves it to trash.
        await page
            .locator('[data-testid^="comments-admin-delete-"]')
            .first()
            .click();
        await page.getByTestId("app-dialog-confirm").click();
        await expect(page.getByText("Thanks, great post!")).toHaveCount(0);

        // It now shows in the trash view; restore brings it back.
        await page.getByTestId("comments-trash-toggle").click();
        await expect(page.getByText("Thanks, great post!").first()).toBeVisible();
        await page
            .locator('[data-testid^="comments-trash-restore-"]')
            .first()
            .click();
        await page.getByTestId("comments-active-toggle").click();
        await expect(page.getByText("Thanks, great post!").first()).toBeVisible();
    });

    test("writing history works offline: computed from Dexie, not desktop-gated (Finding 6)", async ({
        page,
    }) => {
        await page.goto("/writing-history");
        // The view renders (no "requires desktop app" gate) and computes
        // from the Dexie writingSessions table — empty until the user
        // writes, but functional and firing no /api.
        await expect(page.getByTestId("writing-history-view")).toBeVisible();
        await expect(page.getByTestId("writing-history-offline")).toHaveCount(0);
        await expect(page.getByTestId("writing-history-empty")).toBeVisible();
        // CSV export is backend-only, so it is hidden offline.
        await expect(page.getByTestId("writing-history-export-csv")).toHaveCount(0);
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

    test("settings danger-zone reset works offline: enabled, no /api", async ({
        page,
    }) => {
        // The full-system reset works offline via a Dexie wipe + reseed (NOT
        // the backend POST /api/system/reset). The trigger therefore stays
        // ENABLED offline - only the .bgb backup-create button is gated.
        // Opening the tab must fire no /api on mount.
        await page.goto("/settings?tab=danger_zone");
        await expect(page.getByTestId("danger-zone-section")).toBeVisible();
        await expect(page.getByTestId("danger-zone-reset-button")).toBeEnabled();
        // The old offline gate-notice on the reset trigger is gone now that
        // the reset itself runs offline.
        await expect(
            page.getByTestId("danger-zone-offline-notice"),
        ).toHaveCount(0);
        // We do NOT click reset here - it would wipe the offline DB mid-suite;
        // the Dexie-wipe-and-reseed path is covered by
        // DangerZoneSettings.test.tsx. afterEach proves zero /api on mount.
    });

    test("settings backups history is gated offline: notice shown, no /api", async ({
        page,
    }) => {
        // Backup history is backend-only (.bgb archives + server-side store).
        // Offline the history fetch is skipped and the OfflineFeatureNotice
        // renders in place of the history list.
        await page.goto("/settings?tab=backups");
        await expect(page.getByTestId("backups-settings")).toBeVisible();
        await expect(page.getByTestId("backups-offline-notice")).toBeVisible();
        // The history list (which would require the skipped fetch) is absent.
        await expect(page.getByTestId("backups-history-list")).toHaveCount(0);
    });

    test("book metadata tabs open offline with no /api and no error toast", async ({
        page,
    }) => {
        // The metadata editor fetches the KDP category catalog + the git-sync
        // mapping on mount; both are backend-only and skipped offline. Opening
        // the general + publisher tabs must fire no /api and surface no error
        // toast (the offline guard downgrades those to console.warn).
        await page.goto("/books/new");
        await page.getByTestId("create-book-title").fill("Metadata Book");
        await page.getByTestId("create-book-author").fill("Aster");
        await page.getByTestId("create-book-submit").click();
        await expect(page.getByText("Metadata Book").first()).toBeVisible({
            timeout: 10000,
        });
        await page.getByText("Metadata Book").first().click();
        await page.waitForURL(/\/book\//);
        const bookId = page.url().match(/\/book\/([^/?]+)/)?.[1];
        expect(bookId).toBeTruthy();

        await page.goto(`/book/${bookId}?view=metadata`);
        // General is the default tab; its mount triggers the gated kdp fetch.
        await expect(page.getByTestId("metadata-tab-general")).toBeVisible();
        // Publisher hosts the git-sync-aware repo-URL field.
        await page.getByTestId("metadata-tab-publisher").click();
        await expect(page.getByTestId("metadata-tab-publisher")).toBeVisible();
        // No red error toast from a doomed offline /api call.
        await expect(page.locator(".Toastify__toast--error")).toHaveCount(0);
        // afterEach proves zero /api across both tab mounts.
    });

    test("medium import works offline: parse a zip + create articles in Dexie", async ({
        page,
    }) => {
        // The page is un-gated offline (browser-side parse + create).
        await page.goto("/articles/import/medium");
        await expect(page.getByTestId("medium-import-upload-zone")).toBeVisible();

        // Upload the fixture export (2 posts: 1 article + 1 comment) and preview.
        await page.getByTestId("medium-import-upload-input").setInputFiles(MEDIUM_ZIP);
        await page.getByTestId("medium-import-start").click();
        await expect(page.getByTestId("medium-import-preview-section")).toBeVisible({
            timeout: 10000,
        });

        // Import the selection — runs entirely against IndexedDB.
        await page.getByTestId("medium-import-preview-import-btn").click();
        await expect(page.getByTestId("medium-import-result")).toBeVisible({
            timeout: 10000,
        });
        // 1 imported (the article); the comment is skipped offline.
        await expect(
            page.getByTestId("medium-import-result-imported-count"),
        ).toContainText("1");

        // The imported article now shows in the Articles list (from Dexie).
        await page.goto("/articles");
        await expect(page.getByText("Real Article").first()).toBeVisible({
            timeout: 10000,
        });
    });
});
