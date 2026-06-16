/**
 * Manual-Testplan Section 3 — Import.
 *
 * Closes the automatable gaps marked "Teilweise":
 *   - TC-037 HTML import: a single .html file flows through the wizard into
 *     a new book + chapter (the existing smoke covers Markdown; this adds
 *     the HTML format path and verifies the persisted content)
 *
 * .bgb import (TC-035/036), Markdown (covered) and Git-URL (TC-039) are
 * already covered by e2e/smoke; Medium ZIP (TC-038) stays partly manual
 * (real corpus survey). Runs against the live backend.
 */

import {test, expect, createBook, createChapter} from "../fixtures/base";
import {ImportWizardPage} from "./pages/import-wizard.page";
import {ExportPage, CLIENT_FORMATS} from "./pages/export.page";
import {patchApp} from "./helpers/setup.helper";

test.describe("Section 3 — TC-037 HTML import", () => {
    test("an HTML file imports into a new book with converted content", async ({page}) => {
        const wizard = new ImportWizardPage(page);
        await wizard.open();

        const html =
            "<h1>HTML Wizard Buch</h1><p>Erster Absatz aus HTML.</p>" +
            "<h2>Abschnitt</h2><p>Zweiter Absatz.</p>";
        const title = await wizard.runFileImport({
            name: "html-import.html",
            mimeType: "text/html",
            buffer: Buffer.from(html, "utf-8"),
        });
        expect(title).toContain("HTML Wizard Buch");

        await wizard.close();

        // The new book persists with at least one chapter carrying the
        // converted body (stored as TipTap JSON, not raw HTML).
        const book = await page.evaluate(async () => {
            const r = await fetch("/api/books");
            const books = (await r.json()) as {id: string; title: string}[];
            return books.find((b) => b.title.includes("HTML Wizard Buch")) ?? null;
        });
        expect(book).not.toBeNull();

        const chapters = await page.evaluate(async (bookId) => {
            const r = await fetch(`/api/books/${bookId}/chapters`);
            return (await r.json()) as {content: string}[];
        }, book!.id);
        expect(chapters.length).toBeGreaterThanOrEqual(1);
        const allContent = chapters.map((c) => c.content).join(" ");
        expect(allContent).toContain("Erster Absatz aus HTML");
    });
});

test.describe("Section 3 — TC-031 client-engine export", () => {
    // ``behavior.export_engine`` is a global setting not restored by the
    // shared baseline; force "client" to render the in-browser export menu
    // even while online, then reset to "auto" afterEach so it doesn't leak.
    test.afterEach(async () => {
        await patchApp({behavior: {export_engine: "auto"}});
    });

    for (const format of ["markdown", "html", "text"] as const) {
        test(`downloads ${format} via the client engine (no Pandoc)`, async ({page}) => {
            const book = await createBook("Client Export Buch", "Autor");
            await createChapter(
                book.id,
                "Kapitel",
                JSON.stringify({
                    type: "doc",
                    content: [{type: "paragraph", content: [{type: "text", text: "Export Inhalt."}]}],
                }),
            );
            await patchApp({behavior: {export_engine: "client"}});

            const exporter = new ExportPage(page);
            await exporter.goto(book.id);
            const download = await exporter.downloadClient(format);
            expect(download.suggestedFilename().length).toBeGreaterThan(0);
        });
    }

    test("all seven client formats are offered in the menu", async ({page}) => {
        const book = await createBook("Client Formats Buch", "Autor");
        await createChapter(book.id, "Kapitel", "<p>Inhalt</p>");
        await patchApp({behavior: {export_engine: "client"}});

        const exporter = new ExportPage(page);
        await exporter.goto(book.id);
        await expect(exporter.clientContainer).toBeVisible({timeout: 10_000});
        await exporter.clientTrigger.click();
        for (const format of CLIENT_FORMATS) {
            await expect(page.getByTestId(`client-export-${format}`)).toBeVisible();
        }
    });
});
