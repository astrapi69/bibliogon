/**
 * Comic-book editor smoke (plugin-comics Session 2 C7
 * + Session 3 PAGES-CRUD-01 close
 * + PLUGIN-COMICS-MULTI-PAGE-NAVIGATION-01 C1 sidebar adoption).
 *
 * Exercises the comic-book full editor wiring end-to-end:
 *   - create a comic_book via API
 *   - open /book/{id} and assert the ComicBookEditor mounts
 *     (not the chapter editor, not the picture-book PageEditor)
 *   - the empty-state surfaces the PageThumbnails sidebar with
 *     an add-page button (post-C1: replaces the prior dedicated
 *     "Create first comic page" section + button — the sidebar's
 *     add-page button serves both first-create and subsequent-adds)
 *   - clicking the button creates page 1 + the sidebar row appears
 *   - the PdfExportControls mount under the comic-book-editor
 *     testid namespace (validates the C6 3-surface rename)
 *
 * Every namespaced testid here is exercised positively per the
 * "Testid namespace pinning prevents silent E2E skips" rule.
 */

import {test, expect, createComicBook} from "../fixtures/base";

test.describe("Comic-book editor smoke", () => {
    test("create comic_book -> editor mounts -> empty sidebar has add-page button", async ({
        page,
    }) => {
        const book = await createComicBook("My Comic Book", "E2E Author");

        await page.goto(`/book/${book.id}`);

        // The router branches on book_type; comic_book lands on
        // ComicBookEditor, NOT PageEditor.
        await expect(
            page.getByTestId("comic-book-editor-root"),
        ).toBeVisible();
        await expect(
            page.getByTestId("comic-book-editor-title-text"),
        ).toContainText("My Comic Book");

        // Empty-state surfaced through PageThumbnails sidebar; the
        // add-page button doubles as the first-create affordance.
        await expect(
            page.getByTestId("comic-book-editor-thumbnails-empty"),
        ).toBeVisible();
        await expect(
            page.getByTestId("comic-book-editor-add-page"),
        ).toBeVisible();
    });

    // PLUGIN-COMICS-E2E-SMOKE-01: live-dev plugin-discovery probe.
    //
    // pytest with TestClient masks the operational class this
    // assertion catches — backend lifespan + plugin discovery run
    // fresh per-test, so a broken plugin-load path (stale entry
    // points, env-var absence, post-install rediscover gap)
    // silently passes there but 404s against a long-running
    // uvicorn. The frontend ComicBookEditor renders one of two
    // surfaces based on the GET /api/comics/info probe:
    //   - ``comic-book-editor-plugin-info``: green panel with
    //     plugin name + version + session. Comics is reachable.
    //   - ``comic-book-editor-plugin-error``: role="alert" with
    //     the unreachable message. The plugin failed to load OR
    //     the route was never mounted.
    // Both testids cannot coexist; this test pins the healthy
    // branch (info visible, error absent) on every smoke run.
    test("plugin-info panel renders + no plugin-unreachable alert", async ({
        page,
    }) => {
        const book = await createComicBook("Plugin Info Probe", "E2E Author");
        await page.goto(`/book/${book.id}`);

        // Healthy branch: green panel with the comics-plugin
        // identity. ``toContainText("comics")`` is the contract
        // (matches "comics v1.X.Y (session N)"); version + session
        // numbers float across releases so we don't pin them.
        await expect(
            page.getByTestId("comic-book-editor-plugin-info"),
        ).toBeVisible();
        await expect(
            page.getByTestId("comic-book-editor-plugin-info"),
        ).toContainText("comics");

        // Negative-path regression-pin: the role="alert"
        // plugin-unreachable element MUST NOT be in the DOM. If
        // this fires the plugin is broken in the live stack even
        // though pytest is green.
        await expect(
            page.getByTestId("comic-book-editor-plugin-error"),
        ).toHaveCount(0);
    });

    test("clicking add-page from empty state creates page 1 and reveals the sidebar row", async ({
        page,
    }) => {
        const book = await createComicBook("Create Page Comic", "E2E Author");

        await page.goto(`/book/${book.id}`);
        await expect(
            page.getByTestId("comic-book-editor-add-page"),
        ).toBeVisible();

        await page.getByTestId("comic-book-editor-add-page").click();

        // After create + refresh, the sidebar list appears (replacing
        // the empty-state marker) and the canvas grid is visible.
        await expect(
            page.getByTestId("comic-book-editor-page-list"),
        ).toBeVisible();
        await expect(
            page.getByTestId("comic-book-editor-thumbnails-empty"),
        ).toHaveCount(0);
        await expect(
            page.getByTestId("comic-book-editor-grid-wrapper"),
        ).toBeVisible();
    });

    test("PdfExportControls mounts under comic-book-editor namespace", async ({
        page,
    }) => {
        const book = await createComicBook("PDF Test Comic", "E2E Author");
        await page.goto(`/book/${book.id}`);

        await expect(
            page.getByTestId("comic-book-editor-root"),
        ).toBeVisible();
        // The renamed PdfExportControls (was
        // PictureBookPdfExportControls) is the 3rd caller surface
        // landed in C6. Both its format dropdown + export button
        // mount under the comic-book-editor testid prefix.
        await expect(
            page.getByTestId("comic-book-editor-pdf-format-select"),
        ).toBeVisible();
        await expect(
            page.getByTestId("comic-book-editor-export-pdf"),
        ).toBeVisible();
    });

    test("back button returns to dashboard", async ({page}) => {
        const book = await createComicBook("Back Test Comic", "E2E Author");
        await page.goto(`/book/${book.id}`);

        await expect(
            page.getByTestId("comic-book-editor-back"),
        ).toBeVisible();
        await page.getByTestId("comic-book-editor-back").click();
        await expect(page).toHaveURL("/");
    });

    // COMIC-BOOK-EDITOR-METADATA-BUTTON-01 C3: header metadata
    // button + BookEditor swap path. Closes the Half-Wired-Visible-
    // in-Production gap surfaced during EXPOSE-BUCHIDEE-METADATA-01
    // Track 5 — comic-book authors can now reach BookMetadataEditor
    // and ALL book metadata (Categories, BISAC, ISBN, the new Story
    // tab with book_idea + expose, etc.).
    test("metadata button is visible in the header at non-zero height", async ({
        page,
    }) => {
        const book = await createComicBook("Metadata Visible", "E2E Author");
        await page.goto(`/book/${book.id}`);

        const btn = page.getByTestId("comic-book-editor-show-metadata");
        await expect(btn).toBeVisible();

        // Bounding-box-dimension assertion per LL "Playwright-
        // visible != User-visible": a clickable button must render
        // at user-perceivable height (>20px). Catches CSS-collapse
        // regressions that toBeVisible() would silently accept.
        const bbox = await btn.boundingBox();
        expect(bbox).not.toBeNull();
        expect(bbox!.height).toBeGreaterThan(20);
    });

    test("clicking metadata button swaps to BookMetadataEditor; onBack returns to ComicBookEditor", async ({
        page,
    }) => {
        const book = await createComicBook("Metadata Swap", "E2E Author");
        await page.goto(`/book/${book.id}`);

        // Pre-click: ComicBookEditor mounted; BookMetadataEditor
        // not yet on screen.
        await expect(
            page.getByTestId("comic-book-editor-root"),
        ).toBeVisible();

        // Click the new metadata button.
        await page.getByTestId("comic-book-editor-show-metadata").click();

        // BookMetadataEditor mounts in place of ComicBookEditor.
        // metadata-tab-general is a stable testid from
        // BookMetadataEditor's Radix Tabs trigger list.
        await expect(
            page.getByTestId("metadata-tab-general"),
        ).toBeVisible();
        await expect(
            page.getByTestId("comic-book-editor-root"),
        ).toHaveCount(0);

        // The Story tab from yesterday's EXPOSE-BUCHIDEE-METADATA-01
        // ship is now reachable — pin the bridge between the two
        // sessions' work.
        await expect(
            page.getByTestId("metadata-tab-story"),
        ).toBeVisible();

        // Click the metadata onBack to return to ComicBookEditor
        // (NOT all the way to the dashboard — same UX as
        // picture_book).
        await page.getByTestId("metadata-back").click();
        await expect(
            page.getByTestId("comic-book-editor-root"),
        ).toBeVisible();
        // Confirm we're still on /book/{id} (not /).
        await expect(page).not.toHaveURL("/");
    });
});
