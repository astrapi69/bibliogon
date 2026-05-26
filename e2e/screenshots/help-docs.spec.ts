/**
 * HELP-DOCS-V0.37.0-GAPS-01: screenshot generator for the help pages
 * added in this commit chain. Manual-only — invoke via:
 *
 *   cd e2e && npx playwright test --project=screenshots
 *
 * Each test seeds the minimum state needed for its screenshot, then
 * writes the PNG to docs/help/assets/screenshots/. The DB is reset
 * before every test via the ``resetDatabase`` fixture from
 * fixtures/base.
 *
 * Screenshots are taken in the app's default theme (light + the
 * ``warm-literary`` palette) which is what a fresh install resolves
 * to. The viewport is locked to 1280x800 in playwright.config.ts
 * so file sizes stay reasonable + the layout doesn't shift on
 * developer-monitor mode.
 */

import {test} from "../fixtures/base";
import {createBook, createChapter} from "../helpers/api";

// Resolve the screenshot output dir from the e2e working directory.
const OUT_DIR = "../docs/help/assets/screenshots";

test.describe("Help-doc screenshot generator", () => {
    test("settings-sidebar — Settings page with sidebar nav visible", async ({page}) => {
        await page.goto("/settings");
        await page.getByTestId("settings-sidebar").waitFor({state: "visible"});
        // Crop to the sidebar + a slice of content so the help-doc
        // image highlights the nav structure rather than whichever
        // tab content happens to be active.
        await page.screenshot({
            path: `${OUT_DIR}/settings-sidebar.png`,
            clip: {x: 0, y: 0, width: 800, height: 720},
        });
    });

    test("editor-display-settings — toolbar popover open", async ({page}) => {
        const book = await createBook("Display-Settings Screenshot Book");
        await createChapter(book.id, "Erstes Kapitel");
        await page.goto(`/book/${book.id}`);
        // Wait for the editor toolbar + the display-settings toggle.
        await page.getByTestId("editor-display-settings-toggle").waitFor({state: "visible"});
        await page.getByTestId("editor-display-settings-toggle").click();
        await page.getByTestId("editor-display-settings-panel").waitFor({state: "visible"});
        // Brief settle for the popover transition.
        await page.waitForTimeout(200);
        await page.screenshot({
            path: `${OUT_DIR}/editor-display-settings.png`,
            fullPage: false,
        });
    });

    test("book-metadata-repository-url — free-input branch", async ({page}) => {
        // No git-sync mapping seeded → the free-input branch renders
        // (testid metadata-repository-url-manual). Same shape any user
        // sees before they wire up plugin-git-sync.
        const book = await createBook("Repository-URL Screenshot Book");
        // Deep-link directly into the metadata view via ?view=metadata
        // — same param the audiobook badge uses (BookEditor.tsx:93).
        await page.goto(`/book/${book.id}?view=metadata`);
        await page.getByTestId("metadata-repository-url-manual").waitFor({state: "visible"});
        const field = page.getByTestId("metadata-repository-url-manual");
        await field.screenshot({
            path: `${OUT_DIR}/book-metadata-repository-url.png`,
        });
    });

    test("dashboard-pagination — page-size selector + load-more", async ({page}) => {
        // Seed 30 books so the default page size (25) leaves 5 hidden
        // and "Mehr laden (25 / 30)" renders alongside the page-size
        // dropdown.
        for (let i = 0; i < 30; i++) {
            await createBook(`Pagination-Demo Buch ${String(i + 1).padStart(2, "0")}`);
        }
        await page.goto("/");
        await page.getByTestId("dashboard-pagination").waitFor({state: "visible"});
        // Crop to the pagination row at the bottom of the dashboard
        // grid + a slice of the cards above for context.
        const region = page.getByTestId("dashboard-pagination");
        await region.scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        await region.screenshot({
            path: `${OUT_DIR}/dashboard-pagination.png`,
        });
    });

    test("trash-and-restore — Books trash view with one book", async ({page}) => {
        // Seed two books, move one to trash, screenshot the trash view.
        const keep = await createBook("Bleibt im Dashboard");
        const trashed = await createBook("Wandert in den Papierkorb");
        await page.request.delete(`http://localhost:8000/api/books/${trashed.id}`);
        // ``keep`` is just there so the dashboard has data — the
        // trash view itself only shows the trashed one.
        await page.goto("/");
        await page.getByTestId("trash-toggle").click();
        await page.getByTestId("trash-view").waitFor({state: "visible"});
        await page.waitForTimeout(200);
        // Screenshot the trash view region.
        await page.getByTestId("trash-view").screenshot({
            path: `${OUT_DIR}/trash-and-restore.png`,
        });
        // Reference ``keep`` so the linter doesn't flag it as unused.
        void keep;
    });
});
