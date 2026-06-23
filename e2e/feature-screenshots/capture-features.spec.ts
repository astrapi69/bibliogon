/**
 * FEATURE-SCREENSHOT-CATALOG-01 — capture spec.
 *
 * Generates the visual feature catalog under ``docs/screenshots/`` for
 * documentation, README, Medium articles, and onboarding. This is NOT a
 * regression gate — that is the ``visual`` project (e2e/visual/, pixel
 * diff). Here every test only takes a screenshot; the success criterion
 * is "all screenshots generated without crash".
 *
 * Run on-demand (never in CI, never in the smoke gate):
 *
 *   cd e2e && npx playwright test --project=feature-screenshots
 *   # or: make capture-screenshots
 *
 * Conventions (locked in playwright.config.ts for this project):
 *   - Viewport 1280x720 (16:9 desktop), locale de-DE, default theme
 *     (warm-literary light — no dark mode), retries 0.
 *   - fullPage:false (visible area only) unless a shot needs the
 *     below-the-fold metadata.
 *   - Reduced motion + disabled animations so a shot can't catch a
 *     mid-transition frame.
 *   - The ``resetDatabase`` fixture (auto) wipes the DB + suppresses the
 *     onboarding dialogs before every test.
 *
 * Each test seeds realistic German data (real titles + prose, never
 * "Test-Buch 1"). Waits are crash-resistant (``.catch(() => {})``) so a
 * single drifted testid degrades to "screenshot whatever rendered"
 * rather than failing the whole catalog run.
 *
 * Re-run only when a screenshotted surface changes. The committed PNGs
 * render the catalog without re-running Playwright (the chromium binary
 * is not downloadable in every environment).
 */

import {test} from "../fixtures/base";
import {
    createArticle,
    createBook,
    createChapter,
    createComicBook,
    createPictureBook,
    deleteBook,
} from "../helpers/api";

const OUT = "../docs/screenshots";
const API = "http://localhost:8000/api";

/** Reduced-motion before any navigation so transitions are frozen. */
test.beforeEach(async ({page}) => {
    await page.emulateMedia({reducedMotion: "reduce"});
});

/** Create a page on a picture-book / comic book via the API (node-side
 * absolute URL — same rationale as the helpers in helpers/api.ts). */
async function createPage(bookId: string, layout: string): Promise<void> {
    await fetch(`${API}/books/${bookId}/pages`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({layout, position: 0, text_content: ""}),
    }).catch(() => {});
}

const PROSE = (lead: string) =>
    JSON.stringify({
        type: "doc",
        content: [
            {
                type: "heading",
                attrs: {level: 2},
                content: [{type: "text", text: "Kapitel-Auftakt"}],
            },
            {type: "paragraph", content: [{type: "text", text: lead}]},
            {
                type: "paragraph",
                content: [
                    {
                        type: "text",
                        text: "Ein zweiter Absatz, damit die Vorschau Zeilenumbrüche und Absatzabstände zeigt — echte Sätze statt Lorem-Ipsum, weil der Katalog die wirkliche Typografie dokumentiert.",
                    },
                ],
            },
        ],
    });

/** A multi-sentence German paragraph long enough to drive the quality
 * metrics (Flesch, Schachtelsatz candidates, word counts). */
const QUALITY_TEXT = JSON.stringify({
    type: "doc",
    content: [
        {
            type: "heading",
            attrs: {level: 2},
            content: [{type: "text", text: "Die Souveränität des Musters"}],
        },
        {
            type: "paragraph",
            content: [
                {
                    type: "text",
                    text: "Wer ein Buch schreibt, das nicht nur gelesen, sondern auch verstanden werden will, der muss sich, bevor er den ersten Satz formuliert, darüber im Klaren sein, dass jede verschachtelte Konstruktion, so elegant sie im Kopf auch klingen mag, den Leser an der Schwelle zum nächsten Gedanken ins Stolpern bringen kann.",
                },
            ],
        },
        {
            type: "paragraph",
            content: [
                {
                    type: "text",
                    text: "Kurze Sätze tragen. Sie geben dem Auge Rast. Sie lassen den Rhythmus atmen, und sie machen aus einem Manuskript einen Text, dem man gerne folgt.",
                },
            ],
        },
    ],
});

async function seedProseBook(title: string) {
    const book = await createBook(title, "Asterios Raptis");
    await createChapter(
        book.id,
        "Vorwort",
        PROSE(
            "Dieses Buch entstand zwischen zwei Reisen — eine über offenes Wasser, eine ins Innere des Schreibens.",
        ),
        "preface",
    );
    await createChapter(
        book.id,
        "Kapitel 1: Anker lichten",
        PROSE(
            "Wenn der Bug das Wasser teilt, ahnt der Schreibende die ersten Sätze schon, bevor sie auf dem Papier landen.",
        ),
    );
    await createChapter(book.id, "Kapitel 2: Tiefenrausch");
    await createChapter(book.id, "Kapitel 3: Heimkehr");
    return book;
}

test.describe("Feature Screenshots", () => {
    // ===================== Dashboard =====================
    test.describe("Dashboard", () => {
        test("book dashboard grid view", async ({page}) => {
            await createBook("Die Souveränität des Musters", "Asterios Raptis");
            await createBook("Schreiben am Meer", "Asterios Raptis");
            await createBook("Werkstatt der Ideen", "Asterios Raptis");
            await page.goto("/");
            await page.getByTestId("new-book-btn").waitFor({state: "visible"}).catch(() => {});
            await page.getByTestId("view-toggle-grid").click().catch(() => {});
            await page.waitForTimeout(400);
            await page.screenshot({path: `${OUT}/dashboard/book-dashboard-grid.png`});
        });

        test("book dashboard list view", async ({page}) => {
            await createBook("Die Souveränität des Musters", "Asterios Raptis");
            await createBook("Schreiben am Meer", "Asterios Raptis");
            await createBook("Werkstatt der Ideen", "Asterios Raptis");
            await page.goto("/");
            await page.getByTestId("new-book-btn").waitFor({state: "visible"}).catch(() => {});
            await page.getByTestId("view-toggle-list").click().catch(() => {});
            await page.waitForTimeout(400);
            await page.screenshot({path: `${OUT}/dashboard/book-dashboard-list.png`});
        });

        test("article dashboard", async ({page}) => {
            await createArticle("Wie ich angefangen habe zu schreiben");
            await createArticle("Drei Bücher, die meine Schreibweise veränderten");
            await createArticle("Was Bibliogon (nicht) ist");
            await createArticle("Vom Notizbuch zum Manuskript");
            await createArticle("Warum Offline-First für Autoren zählt");
            await page.goto("/articles");
            await page.getByTestId("article-list-page").waitFor({state: "visible"}).catch(() => {});
            await page.getByTestId("view-toggle-grid").click().catch(() => {});
            await page.waitForTimeout(400);
            await page.screenshot({path: `${OUT}/dashboard/article-dashboard.png`});
        });

        test("recent documents", async ({page}) => {
            await seedProseBook("Schreiben am Meer");
            await createArticle("Wie ich angefangen habe zu schreiben");
            await page.goto("/");
            const region = page.getByTestId("recent-documents");
            await region.waitFor({state: "visible"}).catch(() => {});
            await region.scrollIntoViewIfNeeded().catch(() => {});
            await page.waitForTimeout(300);
            await page.screenshot({path: `${OUT}/dashboard/recent-documents.png`});
        });

        test("trash view", async ({page}) => {
            const trashed = await createBook("Wandert in den Papierkorb", "Asterios Raptis");
            await deleteBook(trashed.id);
            await page.goto("/");
            await page.getByTestId("trash-toggle").click().catch(() => {});
            await page.getByTestId("trash-view").waitFor({state: "visible"}).catch(() => {});
            await page.waitForTimeout(300);
            await page.screenshot({path: `${OUT}/dashboard/trash-view.png`});
        });
    });

    // ===================== Book Editor =====================
    test.describe("Book Editor", () => {
        test("chapter sidebar", async ({page}) => {
            const book = await seedProseBook("Schreiben am Meer");
            await page.goto(`/book/${book.id}`);
            await page
                .getByTestId("editor-display-settings-toggle")
                .waitFor({state: "visible"})
                .catch(() => {});
            await page.waitForTimeout(500);
            await page.screenshot({path: `${OUT}/book-editor/chapter-sidebar.png`});
        });

        test("editor with toolbar", async ({page}) => {
            const book = await seedProseBook("Schreiben am Meer");
            await page.goto(`/book/${book.id}`);
            const toolbar = page.getByTestId("collapsible-toolbar");
            await toolbar.waitFor({state: "visible"}).catch(() => {});
            await page.waitForTimeout(400);
            await (toolbar.screenshot({path: `${OUT}/book-editor/editor-with-toolbar.png`}).catch(
                () => page.screenshot({path: `${OUT}/book-editor/editor-with-toolbar.png`}),
            ));
        });

        test("composition mode", async ({page}) => {
            const book = await seedProseBook("Schreiben am Meer");
            await page.goto(`/book/${book.id}`);
            await page.getByTestId("toolbar-composition").click().catch(() => {});
            await page.waitForTimeout(500);
            await page.screenshot({path: `${OUT}/book-editor/composition-mode.png`});
        });

        test("chapter status labels", async ({page}) => {
            const book = await seedProseBook("Schreiben am Meer");
            await page.goto(`/book/${book.id}?view=storyboard`);
            await page.getByTestId("prose-storyboard").waitFor({state: "visible"}).catch(() => {});
            await page.getByTestId("prose-storyboard-manage-labels").click().catch(() => {});
            await page.waitForTimeout(400);
            await page.screenshot({path: `${OUT}/book-editor/chapter-status-labels.png`});
        });

        test("chapter outliner", async ({page}) => {
            const book = await seedProseBook("Schreiben am Meer");
            // Seed synopsis + Inspector notes so the Outliner shot shows the
            // Synopsis + Notizen columns populated (CHAPTER-SYNOPSIS-NOTES-01).
            const chapters = await page.request
                .get(`${API}/books/${book.id}/chapters`)
                .then((r) => r.json())
                .catch(() => [] as Array<{id: string; version: number; title?: string}>);
            const seedNotes: Record<string, {synopsis: string; inspector_notes: string}> = {
                Vorwort: {
                    synopsis: "Der Erzähler blickt aufs offene Wasser zurück.",
                    inspector_notes: "Rückblende prüfen — passt der Einstieg zum Ton?",
                },
                "Kapitel 1: Anker lichten": {
                    synopsis: "Der Aufbruch in See, erste Zweifel an Bord.",
                    inspector_notes: "Zeitlinie prüfen.",
                },
            };
            for (const c of chapters) {
                const n = seedNotes[c.title ?? ""];
                if (!n) continue;
                await page.request
                    .patch(`${API}/books/${book.id}/chapters/${c.id}`, {
                        data: {version: c.version, synopsis: n.synopsis, inspector_notes: n.inspector_notes},
                    })
                    .catch(() => {});
            }
            await page.goto(`/book/${book.id}?view=outline`);
            await page.getByTestId("outliner").waitFor({state: "visible"}).catch(() => {});
            await page.waitForTimeout(400);
            await page.screenshot({path: `${OUT}/book-editor/chapter-outliner.png`});
        });

        test("chapter collections", async ({page}) => {
            const book = await seedProseBook("Schreiben am Meer");
            const chapters = await page.request
                .get(`${API}/books/${book.id}/chapters`)
                .then((r) => r.json())
                .catch(() => [] as Array<{id: string}>);
            const ids = chapters.slice(0, 2).map((c: {id: string}) => c.id);
            // Seed two colour-coded collections (CHAPTER-COLLECTIONS-01 +
            // collection colours) so the Sammlungen bar + coloured dot show.
            await page.request
                .patch(`${API}/books/${book.id}`, {
                    data: {
                        collections: [
                            {id: "kampf", name: "Kampfszenen", chapter_ids: ids, color: "#ef4444"},
                            {id: "backstory", name: "Backstory", chapter_ids: [], color: "#3b82f6"},
                        ],
                    },
                })
                .catch(() => {});
            await page.goto(`/book/${book.id}?view=outline`);
            await page.getByTestId("outliner").waitFor({state: "visible"}).catch(() => {});
            await page
                .selectOption('[data-testid="outliner-collection-select"]', "kampf")
                .catch(() => {});
            await page.waitForTimeout(400);
            await page.screenshot({path: `${OUT}/book-editor/chapter-collections.png`});
        });

        test("writing goals", async ({page}) => {
            const book = await seedProseBook("Schreiben am Meer");
            await page.request
                .patch(`${API}/books/${book.id}`, {data: {word_target: 50000}})
                .catch(() => {});
            // WritingGoalWidget renders null with zero writing sessions, and
            // word_target alone creates none. record_progress fires only on a
            // chapter content PATCH, so patch one chapter's content to log a
            // positive daily delta -> a session exists -> the widget renders.
            const chapters = await page.request
                .get(`${API}/books/${book.id}/chapters`)
                .then((r) => r.json())
                .catch(() => [] as Array<{id: string; title?: string; version: number}>);
            const target =
                chapters.find((c: {title?: string}) => c.title?.includes("Kapitel 2")) ??
                chapters[0];
            if (target) {
                await page.request
                    .patch(`${API}/books/${book.id}/chapters/${target.id}`, {
                        data: {
                            content: PROSE(
                                "Heute kamen die Sätze leicht — eine ganze Szene entstand zwischen Sonnenaufgang und dem ersten Kaffee.",
                            ),
                            version: target.version,
                        },
                    })
                    .catch(() => {});
            }
            await page.goto("/");
            const widget = page.getByTestId("writing-goal-widget");
            await widget.waitFor({state: "visible"}).catch(() => {});
            await widget.scrollIntoViewIfNeeded().catch(() => {});
            await page.waitForTimeout(300);
            await (widget.screenshot({path: `${OUT}/book-editor/writing-goals.png`}).catch(() =>
                page.screenshot({path: `${OUT}/book-editor/writing-goals.png`}),
            ));
        });

        test("storyboard", async ({page}) => {
            const book = await seedProseBook("Schreiben am Meer");
            await page.goto(`/book/${book.id}?view=storyboard`);
            await page.getByTestId("prose-storyboard").waitFor({state: "visible"}).catch(() => {});
            await page.waitForTimeout(500);
            await page.screenshot({path: `${OUT}/book-editor/storyboard.png`});
        });

        test("story bible", async ({page}) => {
            const book = await seedProseBook("Schreiben am Meer");
            await page.goto(`/book/${book.id}`);
            await page.getByTestId("story-bible-toggle").click().catch(() => {});
            await page.getByTestId("story-bible-sidebar").waitFor({state: "visible"}).catch(() => {});
            await page.waitForTimeout(400);
            await page.screenshot({path: `${OUT}/book-editor/story-bible.png`});
        });

        test("context menu", async ({page}) => {
            const book = await seedProseBook("Schreiben am Meer");
            await page.goto(`/book/${book.id}`);
            await page.getByTestId("editor-display-settings-toggle").waitFor({state: "visible"}).catch(
                () => {},
            );
            await page.locator(".ProseMirror").first().click({button: "right"}).catch(() => {});
            await page.getByTestId("editor-context-menu").waitFor({state: "visible"}).catch(() => {});
            await page.waitForTimeout(300);
            await page.screenshot({path: `${OUT}/book-editor/context-menu.png`});
        });
    });

    // ===================== Article Editor =====================
    test.describe("Article Editor", () => {
        test("article editor", async ({page}) => {
            const article = await createArticle("Wie ich angefangen habe zu schreiben", "de");
            await page.goto(`/articles/${article.id}`);
            await page.getByTestId("article-editor").waitFor({state: "visible"}).catch(() => {});
            await page.waitForTimeout(500);
            await page.screenshot({path: `${OUT}/article-editor/article-editor.png`});
        });

        test("article metadata", async ({page}) => {
            const article = await createArticle("Wie ich angefangen habe zu schreiben", "de");
            await page.goto(`/articles/${article.id}`);
            await page.getByTestId("article-editor").waitFor({state: "visible"}).catch(() => {});
            await page.waitForTimeout(500);
            // fullPage so the tags / excerpt / SEO metadata fields below the
            // editor fold are visible — the distinction from article-editor.png.
            await page.screenshot({
                path: `${OUT}/article-editor/article-metadata.png`,
                fullPage: true,
            });
        });
    });

    // ===================== Comic Editor =====================
    test.describe("Comic Editor", () => {
        test("comic page with panels", async ({page}) => {
            const book = await createComicBook("Die Reise der Linien", "Asterios Raptis");
            await createPage(book.id, "comic_panel_grid");
            await page.goto(`/book/${book.id}`);
            await page.getByTestId("comic-book-editor-root").waitFor({state: "visible"}).catch(
                () => {},
            );
            await page.getByTestId("comic-page-grid").waitFor({state: "visible"}).catch(() => {});
            await page.waitForTimeout(500);
            await page.screenshot({path: `${OUT}/comic-editor/comic-page-with-panels.png`});
        });

        test("fullscreen mode", async ({page}) => {
            const book = await createComicBook("Die Reise der Linien", "Asterios Raptis");
            await createPage(book.id, "comic_panel_grid");
            await page.goto(`/book/${book.id}`);
            await page.getByTestId("comic-book-editor-root").waitFor({state: "visible"}).catch(
                () => {},
            );
            await page.getByTestId("comic-book-editor-fullscreen").click().catch(() => {});
            await page.waitForTimeout(500);
            await page.screenshot({path: `${OUT}/comic-editor/fullscreen-mode.png`});
        });
    });

    // ===================== Picture Book Editor =====================
    test.describe("Picture Book Editor", () => {
        test("page editor", async ({page}) => {
            const book = await createPictureBook("Der Leuchtturm und das Meer", "Asterios Raptis");
            await createPage(book.id, "image_top_text_bottom");
            await page.goto(`/book/${book.id}`);
            await page.getByTestId("page-editor-root").waitFor({state: "visible"}).catch(() => {});
            await page.waitForTimeout(500);
            await page.screenshot({path: `${OUT}/picture-book-editor/page-editor.png`});
        });

        test("page canvas", async ({page}) => {
            const book = await createPictureBook("Der Leuchtturm und das Meer", "Asterios Raptis");
            await createPage(book.id, "image_top_text_bottom");
            await page.goto(`/book/${book.id}`);
            const canvas = page.getByTestId("page-editor-canvas");
            await canvas.waitFor({state: "visible"}).catch(() => {});
            await page.waitForTimeout(500);
            await (canvas.screenshot({path: `${OUT}/picture-book-editor/page-canvas.png`}).catch(() =>
                page.screenshot({path: `${OUT}/picture-book-editor/page-canvas.png`}),
            ));
        });
    });

    // ===================== Settings =====================
    test.describe("Settings", () => {
        test("general settings", async ({page}) => {
            await page.goto("/settings");
            await page.getByTestId("settings-sidebar").waitFor({state: "visible"}).catch(() => {});
            await page.waitForTimeout(400);
            await page.screenshot({path: `${OUT}/settings/general-settings.png`});
        });

        test("ki provider table", async ({page}) => {
            await page.goto("/settings?tab=ai");
            await page.getByTestId("ai-assistant-settings").waitFor({state: "visible"}).catch(
                () => {},
            );
            await page.waitForTimeout(400);
            await page.screenshot({path: `${OUT}/settings/ki-provider-table.png`});
        });

        test("update checker", async ({page}) => {
            await page.goto("/settings?tab=verhalten");
            const section = page.getByTestId("settings-updates-section");
            await section.waitFor({state: "visible"}).catch(() => {});
            await section.scrollIntoViewIfNeeded().catch(() => {});
            await page.waitForTimeout(300);
            await (section.screenshot({path: `${OUT}/settings/update-checker.png`}).catch(() =>
                page.screenshot({path: `${OUT}/settings/update-checker.png`}),
            ));
        });

        test("data management", async ({page}) => {
            await page.goto("/settings?tab=daten");
            await page.getByTestId("data-management-section").waitFor({state: "visible"}).catch(
                () => {},
            );
            await page.waitForTimeout(400);
            await page.screenshot({path: `${OUT}/settings/data-management.png`});
        });

        test("about version", async ({page}) => {
            await page.goto("/settings?tab=about");
            const section = page.getByTestId("about-version-section");
            await section.waitFor({state: "visible"}).catch(() => {});
            await section.scrollIntoViewIfNeeded().catch(() => {});
            await page.waitForTimeout(300);
            await (section.screenshot({path: `${OUT}/settings/about-version.png`}).catch(() =>
                page.screenshot({path: `${OUT}/settings/about-version.png`}),
            ));
        });

        test("auto-save behaviour tab", async ({page}) => {
            // Settings auto-save on change (#473): no manual "Speichern"
            // button — the Behaviour tab is a representative auto-saving form.
            await page.goto("/settings?tab=verhalten");
            await page.getByTestId("verhalten-settings").waitFor({state: "visible"}).catch(() => {});
            await page.waitForTimeout(300);
            await page.screenshot({path: `${OUT}/settings/auto-save.png`});
        });
    });

    // ===================== Quality Report =====================
    test.describe("Quality Report", () => {
        async function openQuality(page: import("@playwright/test").Page) {
            const book = await createBook("Die Souveränität des Musters", "Asterios Raptis");
            await createChapter(book.id, "Kapitel 1: Satzbau", QUALITY_TEXT);
            await createChapter(book.id, "Kapitel 2: Klarheit", QUALITY_TEXT);
            await page.goto(`/book/${book.id}?view=metadata`);
            await page.getByTestId("metadata-tab-quality").click().catch(() => {});
            await page.waitForTimeout(800);
            return book;
        }

        test("metrics table", async ({page}) => {
            await openQuality(page);
            await page.screenshot({path: `${OUT}/quality/metrics-table.png`});
        });

        test("flesch scale", async ({page}) => {
            await openQuality(page);
            await page.screenshot({path: `${OUT}/quality/flesch-scale.png`, fullPage: true});
        });

        test("complex sentences", async ({page}) => {
            await openQuality(page);
            const section = page.getByTestId("nested-sentence-candidates");
            await section.scrollIntoViewIfNeeded().catch(() => {});
            await page.waitForTimeout(300);
            await (section.screenshot({path: `${OUT}/quality/complex-sentences.png`}).catch(() =>
                page.screenshot({path: `${OUT}/quality/complex-sentences.png`, fullPage: true}),
            ));
        });
    });

    // ===================== Import / Export =====================
    test.describe("Import Export", () => {
        test("import wizard", async ({page}) => {
            await createBook("Schreiben am Meer", "Asterios Raptis");
            await page.goto("/");
            await page.getByTestId("import-wizard-btn").click().catch(() => {});
            await page.getByTestId("import-wizard-modal").waitFor({state: "visible"}).catch(() => {});
            await page.waitForTimeout(400);
            await page.screenshot({path: `${OUT}/import-export/import-wizard.png`});
        });

        test("scrivener import", async ({page}) => {
            // SCRIVENER-PROJECT-IMPORT-01: a .scriv bundle imports via the
            // .zip path; the upload step lists Scrivener in the accepted
            // formats. (No dedicated tab — the wizard auto-detects format.)
            await page.goto("/");
            await page.getByTestId("import-wizard-btn").click().catch(() => {});
            await page.getByTestId("import-wizard-modal").waitFor({state: "visible"}).catch(() => {});
            await page.getByTestId("upload-step").waitFor({state: "visible"}).catch(() => {});
            await page.waitForTimeout(400);
            await page.screenshot({path: `${OUT}/import-export/scrivener-import.png`});
        });

        test("export preview", async ({page}) => {
            const book = await seedProseBook("Schreiben am Meer");
            await page.goto(`/books/${book.id}/export`);
            await page.getByTestId("export-page-client").waitFor({state: "visible"}).catch(() => {});
            await page.waitForTimeout(500);
            await page.screenshot({path: `${OUT}/import-export/export-preview.png`});
        });

        test("bgb backup", async ({page}) => {
            await page.goto("/settings?tab=backups");
            const section = page.getByTestId("backups-fulldata-section");
            await section.waitFor({state: "visible"}).catch(() => {});
            await section.scrollIntoViewIfNeeded().catch(() => {});
            await page.waitForTimeout(300);
            await (section.screenshot({path: `${OUT}/import-export/bgb-backup.png`}).catch(() =>
                page.screenshot({path: `${OUT}/import-export/bgb-backup.png`}),
            ));
        });
    });
});
