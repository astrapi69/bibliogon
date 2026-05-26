/**
 * Screenshot generator for the in-app help docs.
 *
 * Manual-only — invoke via:
 *
 *   cd e2e && npx playwright test --project=screenshots
 *
 * Each test seeds the minimum state needed for its screenshot, then
 * writes the PNG to ``docs/help/assets/screenshots/``. The DB is
 * reset before every test via the ``resetDatabase`` fixture from
 * ``fixtures/base``.
 *
 * Screenshots are taken in the app's default theme (light +
 * ``warm-literary`` palette) at the 1280x800 viewport locked in
 * playwright.config.ts. Theme-specific screenshots (themes.md)
 * override the palette via localStorage before navigation.
 *
 * Re-run only when the screenshotted surface changes. The
 * committed PNGs render the help-doc site without re-running
 * Playwright.
 */

import {test} from "../fixtures/base";
import {
    createArticle,
    createBook,
    createChapter,
} from "../helpers/api";

// Resolve the screenshot output dir from the e2e working directory.
const OUT_DIR = "../docs/help/assets/screenshots";

const TIPTAP_PARAGRAPH = (text: string) => JSON.stringify({
    type: "doc",
    content: [
        {
            type: "heading",
            attrs: {level: 2},
            content: [{type: "text", text: "Kapitel-Auftakt"}],
        },
        {
            type: "paragraph",
            content: [{type: "text", text}],
        },
        {
            type: "paragraph",
            content: [{
                type: "text",
                text: "Ein zweiter Absatz, damit die Editor-Vorschau Zeilenumbrüche und Absatzabstände zeigt — ohne Lorem-Ipsum-Mauerwerk, dafür mit echtem Satz.",
            }],
        },
    ],
});

/** Set the active palette + light/dark mode before any goto. */
async function applyTheme(
    page: import("@playwright/test").Page,
    palette: string,
    mode: "light" | "dark" = "light",
) {
    await page.addInitScript(
        ([p, m]: [string, string]) => {
            localStorage.setItem("bibliogon-app-theme", p);
            localStorage.setItem("bibliogon-theme", m);
        },
        [palette, mode],
    );
}

test.describe("Help-doc screenshot generator", () => {
    // ============================================================
    // Settings — sidebar + each tab
    // ============================================================

    test("settings-sidebar — Settings page with sidebar nav visible", async ({page}) => {
        await page.goto("/settings");
        await page.getByTestId("settings-sidebar").waitFor({state: "visible"});
        await page.screenshot({
            path: `${OUT_DIR}/settings-sidebar.png`,
            clip: {x: 0, y: 0, width: 800, height: 720},
        });
    });

    test("settings-erscheinungsbild — Appearance tab", async ({page}) => {
        await page.goto("/settings?tab=erscheinungsbild");
        await page.getByTestId("erscheinungsbild-settings").waitFor({state: "visible"});
        await page.waitForTimeout(200);
        await page.screenshot({path: `${OUT_DIR}/settings-erscheinungsbild.png`});
    });

    test("settings-verhalten — Behavior tab", async ({page}) => {
        await page.goto("/settings?tab=verhalten");
        await page.getByTestId("verhalten-settings").waitFor({state: "visible"});
        await page.waitForTimeout(200);
        await page.screenshot({path: `${OUT_DIR}/settings-verhalten.png`});
    });

    test("settings-editor — Editor tab", async ({page}) => {
        await page.goto("/settings?tab=editor");
        await page.getByTestId("editor-settings").waitFor({state: "visible"});
        await page.waitForTimeout(200);
        await page.screenshot({path: `${OUT_DIR}/settings-editor.png`});
    });

    test("settings-ai — AI Assistant tab", async ({page}) => {
        await page.goto("/settings?tab=ai");
        await page.getByTestId("ai-assistant-settings").waitFor({state: "visible"});
        await page.waitForTimeout(200);
        await page.screenshot({path: `${OUT_DIR}/settings-ai.png`});
    });

    test("settings-autoren — Authors tab", async ({page}) => {
        await page.goto("/settings?tab=autoren");
        await page.getByTestId("autoren-settings").waitFor({state: "visible"});
        await page.waitForTimeout(200);
        await page.screenshot({path: `${OUT_DIR}/settings-autoren.png`});
    });

    test("settings-plugins — Plugins tab (replaces stale settings-plugins.png)", async ({page}) => {
        await page.goto("/settings?tab=plugins");
        await page.locator(".sidebar").first().waitFor({state: "visible"}).catch(() => {});
        await page.getByTestId("settings-sidebar").waitFor({state: "visible"});
        await page.waitForTimeout(400);
        await page.screenshot({path: `${OUT_DIR}/settings-plugins.png`});
    });

    test("settings-backups — Backups tab", async ({page}) => {
        await page.goto("/settings?tab=backups");
        await page.getByTestId("settings-sidebar").waitFor({state: "visible"});
        await page.waitForTimeout(400);
        await page.screenshot({path: `${OUT_DIR}/settings-backups.png`});
    });

    test("settings-erweitert — Advanced tab", async ({page}) => {
        await page.goto("/settings?tab=erweitert");
        await page.getByTestId("erweitert-settings").waitFor({state: "visible"});
        await page.waitForTimeout(200);
        await page.screenshot({path: `${OUT_DIR}/settings-erweitert.png`});
    });

    test("settings-gefahrenzone — Danger Zone tab", async ({page}) => {
        await page.goto("/settings?tab=danger_zone");
        await page.getByTestId("danger-zone-section").waitFor({state: "visible"});
        await page.waitForTimeout(200);
        await page.screenshot({path: `${OUT_DIR}/settings-gefahrenzone.png`});
    });

    test("danger-zone-dialog — 3-step reset confirmation open", async ({page}) => {
        await page.goto("/settings?tab=danger_zone");
        await page.getByTestId("danger-zone-reset-button").waitFor({state: "visible"});
        await page.getByTestId("danger-zone-reset-button").click();
        await page.getByTestId("danger-zone-dialog").waitFor({state: "visible"});
        await page.waitForTimeout(300);
        await page.screenshot({path: `${OUT_DIR}/danger-zone-dialog.png`});
    });

    // ============================================================
    // Dashboards — Books + Articles, grid + list, trash
    // ============================================================

    test("book-dashboard-grid — Book Dashboard with 3 books in grid view", async ({page}) => {
        await createBook("Die Lange Nacht der Sterne", "Asterios Raptis");
        await createBook("Schreiben am Meer", "Asterios Raptis");
        await createBook("Werkstatt der Ideen", "Asterios Raptis");
        await page.goto("/");
        await page.getByTestId("new-book-btn").waitFor({state: "visible"});
        // The view-mode is server-side persisted (ui.dashboard.books_view)
        // and ``/api/test/reset`` only clears Books/Articles/Chapters/Assets,
        // NOT settings. Force grid via the toggle to make this test
        // order-independent.
        await page.getByTestId("view-toggle-grid").click();
        await page.waitForTimeout(400);
        await page.screenshot({path: `${OUT_DIR}/book-dashboard-grid.png`});
    });

    test("book-dashboard-list — Book Dashboard with 3 books in list view", async ({page}) => {
        await createBook("Die Lange Nacht der Sterne", "Asterios Raptis");
        await createBook("Schreiben am Meer", "Asterios Raptis");
        await createBook("Werkstatt der Ideen", "Asterios Raptis");
        await page.goto("/");
        await page.getByTestId("new-book-btn").waitFor({state: "visible"});
        await page.getByTestId("view-toggle-list").click();
        await page.waitForTimeout(400);
        await page.screenshot({path: `${OUT_DIR}/book-dashboard-list.png`});
    });

    test("article-dashboard-grid — Article Dashboard with 3 articles in grid view", async ({page}) => {
        await createArticle("Wie ich angefangen habe zu schreiben");
        await createArticle("Drei Buecher, die meine Schreibweise veraenderten");
        await createArticle("Was Bibliogon (nicht) ist");
        await page.goto("/articles");
        await page.getByTestId("article-list-page").waitFor({state: "visible"});
        // Same view-mode-persists-across-tests pin as book-dashboard-grid.
        await page.getByTestId("view-toggle-grid").click();
        await page.waitForTimeout(400);
        await page.screenshot({path: `${OUT_DIR}/article-dashboard-grid.png`});
    });

    test("article-dashboard-list — Article Dashboard with 3 articles in list view", async ({page}) => {
        await createArticle("Wie ich angefangen habe zu schreiben");
        await createArticle("Drei Buecher, die meine Schreibweise veraenderten");
        await createArticle("Was Bibliogon (nicht) ist");
        await page.goto("/articles");
        await page.getByTestId("article-list-page").waitFor({state: "visible"});
        await page.getByTestId("view-toggle-list").click();
        await page.waitForTimeout(400);
        await page.screenshot({path: `${OUT_DIR}/article-dashboard-list.png`});
    });

    test("dashboard-pagination — page-size selector + load-more", async ({page}) => {
        for (let i = 0; i < 30; i++) {
            await createBook(`Pagination-Demo Buch ${String(i + 1).padStart(2, "0")}`);
        }
        await page.goto("/");
        await page.getByTestId("dashboard-pagination").waitFor({state: "visible"});
        const region = page.getByTestId("dashboard-pagination");
        await region.scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        await region.screenshot({path: `${OUT_DIR}/dashboard-pagination.png`});
    });

    test("trash-and-restore — Books trash view with one book", async ({page}) => {
        const trashed = await createBook("Wandert in den Papierkorb");
        await page.request.delete(`http://localhost:8000/api/books/${trashed.id}`);
        await page.goto("/");
        await page.getByTestId("trash-toggle").click();
        await page.getByTestId("trash-view").waitFor({state: "visible"});
        await page.waitForTimeout(200);
        await page.getByTestId("trash-view").screenshot({
            path: `${OUT_DIR}/trash-and-restore.png`,
        });
    });

    // ============================================================
    // Editors
    // ============================================================

    test("book-editor — BookEditor with chapter sidebar + content", async ({page}) => {
        const book = await createBook("Schreiben am Meer", "Asterios Raptis");
        await createChapter(book.id, "Vorwort", TIPTAP_PARAGRAPH(
            "Dieses Buch entstand zwischen zwei Reisen — eine über offenes Wasser, eine ins Innere des Schreibens.",
        ), "preface");
        await createChapter(book.id, "Kapitel 1: Anker lichten", TIPTAP_PARAGRAPH(
            "Wenn der Bug das Wasser teilt, ahnt der Schreibende die ersten Sätze schon, bevor sie auf dem Papier landen.",
        ));
        await createChapter(book.id, "Kapitel 2: Tiefenrausch");
        await createChapter(book.id, "Kapitel 3: Heimkehr");
        await page.goto(`/book/${book.id}`);
        // Wait for the chapter sidebar + editor toolbar to render.
        await page.getByTestId("editor-display-settings-toggle").waitFor({state: "visible"});
        await page.waitForTimeout(500);
        await page.screenshot({path: `${OUT_DIR}/book-editor.png`});
    });

    test("article-editor — ArticleEditor", async ({page}) => {
        const article = await createArticle("Wie ich angefangen habe zu schreiben");
        // Route is /articles/:id (plural) per App.tsx, not /article/<id>.
        await page.goto(`/articles/${article.id}`);
        await page.getByTestId("article-editor").waitFor({state: "visible"});
        await page.waitForTimeout(500);
        await page.screenshot({path: `${OUT_DIR}/article-editor.png`});
    });

    test("editor-display-settings — toolbar popover open", async ({page}) => {
        const book = await createBook("Display-Settings Screenshot Book");
        await createChapter(book.id, "Erstes Kapitel");
        await page.goto(`/book/${book.id}`);
        await page.getByTestId("editor-display-settings-toggle").waitFor({state: "visible"});
        await page.getByTestId("editor-display-settings-toggle").click();
        await page.getByTestId("editor-display-settings-panel").waitFor({state: "visible"});
        await page.waitForTimeout(200);
        await page.screenshot({path: `${OUT_DIR}/editor-display-settings.png`, fullPage: false});
    });

    test("book-metadata-repository-url — free-input branch", async ({page}) => {
        const book = await createBook("Repository-URL Screenshot Book");
        await page.goto(`/book/${book.id}?view=metadata`);
        await page.getByTestId("metadata-repository-url-manual").waitFor({state: "visible"});
        await page.getByTestId("metadata-repository-url-manual").screenshot({
            path: `${OUT_DIR}/book-metadata-repository-url.png`,
        });
    });

    test("book-metadata-editor — full metadata tab", async ({page}) => {
        const book = await createBook("Schreiben am Meer", "Asterios Raptis");
        await page.goto(`/book/${book.id}?view=metadata`);
        // metadata-repository-url-manual is at the bottom of the
        // General tab and only renders after the metadata view has
        // fully mounted, so it's a reliable "tab is ready" signal.
        await page.getByTestId("metadata-repository-url-manual").waitFor({state: "visible"});
        await page.waitForTimeout(500);
        await page.screenshot({path: `${OUT_DIR}/book-metadata-editor.png`});
    });

    // ============================================================
    // Get-Started
    // ============================================================

    test("get-started — onboarding page default state", async ({page}) => {
        // Capture the GetStarted page in its default state (no help
        // expanded). The page shows the current onboarding step + the
        // primary action buttons, which is what new users see first.
        await page.goto("/get-started");
        await page.getByTestId("getstarted-nav-back").waitFor({state: "visible"});
        await page.waitForTimeout(600);
        await page.screenshot({path: `${OUT_DIR}/get-started.png`});
    });

    // ============================================================
    // Medium import
    // ============================================================

    test("medium-import-page — landing page (no archive uploaded)", async ({page}) => {
        await page.goto("/articles/import/medium");
        await page.getByTestId("medium-import-home-btn").waitFor({state: "visible"}).catch(() => {});
        await page.waitForTimeout(400);
        await page.screenshot({path: `${OUT_DIR}/medium-import-page.png`});
    });

    // ============================================================
    // Themes (Nord / Classic / Studio / Notebook)
    // ============================================================
    // Each theme screenshot opens the BookEditor with realistic chapter
    // content so the help-doc reader can see the actual typography +
    // color contrast of the palette, not just the chrome.

    test("theme-warm-literary — default palette", async ({page}) => {
        await applyTheme(page, "warm-literary");
        const book = await createBook("Themes-Demo: Warm Literary");
        await createChapter(book.id, "Kapitel 1: Stille Räume", TIPTAP_PARAGRAPH(
            "Die warmen Cremetöne der Standardpalette erinnern an gut gepflegtes Buchdruckpapier — der Editor wird zur Schreibstube, nicht zur Software-Oberfläche.",
        ));
        await page.goto(`/book/${book.id}`);
        await page.getByTestId("editor-display-settings-toggle").waitFor({state: "visible"});
        await page.waitForTimeout(500);
        await page.screenshot({path: `${OUT_DIR}/theme-warm-literary.png`});
    });

    test("theme-nord — Nord palette", async ({page}) => {
        await applyTheme(page, "nord");
        const book = await createBook("Themes-Demo: Nord");
        await createChapter(book.id, "Kapitel 1: Gedämpfte Pastelle", TIPTAP_PARAGRAPH(
            "Nord nimmt der Oberfläche jede Härte und macht lange Lese- und Schreibsessions angenehm — besonders abends.",
        ));
        await page.goto(`/book/${book.id}`);
        await page.getByTestId("editor-display-settings-toggle").waitFor({state: "visible"});
        await page.waitForTimeout(500);
        await page.screenshot({path: `${OUT_DIR}/theme-nord.png`});
    });

    test("theme-classic — Classic palette", async ({page}) => {
        await applyTheme(page, "classic");
        const book = await createBook("Themes-Demo: Klassisch");
        await createChapter(book.id, "Kapitel 1: Papier und Geduld", TIPTAP_PARAGRAPH(
            "Die klassische Palette legt Wert auf den literarischen Eindruck — Erst-Zeilen-Einrückung, Bordeaux-Akzent, papierhafte Beige-Töne.",
        ));
        await page.goto(`/book/${book.id}`);
        await page.getByTestId("editor-display-settings-toggle").waitFor({state: "visible"});
        await page.waitForTimeout(500);
        await page.screenshot({path: `${OUT_DIR}/theme-classic.png`});
    });

    test("theme-studio — Studio palette", async ({page}) => {
        await applyTheme(page, "studio");
        const book = await createBook("Themes-Demo: Studio");
        await createChapter(book.id, "Kapitel 1: Lange Sessions", TIPTAP_PARAGRAPH(
            "Studio bringt hohe Kontraste und einen Mint-Akzent — gemacht für Autoren, die mehrere Stunden am Stück arbeiten.",
        ));
        await page.goto(`/book/${book.id}`);
        await page.getByTestId("editor-display-settings-toggle").waitFor({state: "visible"});
        await page.waitForTimeout(500);
        await page.screenshot({path: `${OUT_DIR}/theme-studio.png`});
    });

    test("theme-notebook — Notebook palette", async ({page}) => {
        await applyTheme(page, "notebook");
        const book = await createBook("Themes-Demo: Notizbuch");
        await createChapter(book.id, "Kapitel 1: Linien und Brainstorming", TIPTAP_PARAGRAPH(
            "Notizbuch ist gemacht für freies Denken — horizontale Linien, roter Rand-Strich, Lora als Serifen-Schrift.",
        ));
        await page.goto(`/book/${book.id}`);
        await page.getByTestId("editor-display-settings-toggle").waitFor({state: "visible"});
        await page.waitForTimeout(500);
        await page.screenshot({path: `${OUT_DIR}/theme-notebook.png`});
    });
});
