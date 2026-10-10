/**
 * #743: the bulk paths on top of the single-file export engine.
 *
 * The ZIP is read back with `unzipSync` rather than asserted on byte
 * length: the thing that matters is which entries exist under which
 * names, and a duplicate name silently loses a document.
 */

import { describe, expect, it, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate";

// Only the PDF generator is faked, and only one test asks for "pdf": the
// error path needs a generator that actually fails, and a document whose
// body is malformed does not qualify - the walkers tolerate that by
// design, which the first version of this test discovered by passing.
vi.mock("../formatPdf", () => ({
    toPdfBlob: vi.fn(async () => {
        throw new Error("pdfmake blew up");
    }),
}));

import type { ExportDocument } from "../documentModel";
import {
    buildBulkZip,
    bulkArchiveFilename,
    combineArticleDocuments,
    combinedFilename,
    zipEntryNames,
} from "./bulkExport";

function para(text: string) {
    return {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    };
}

/** An article: one body, no section heading of its own. */
function article(title: string, body: string): ExportDocument {
    return {
        title,
        kind: "article",
        author: "Asterios Raptis",
        language: "de",
        sections: [{ heading: "", doc: para(body) }],
    };
}

/** A book: one section per chapter. */
function book(title: string, chapters: [string, string][]): ExportDocument {
    return {
        title,
        kind: "book",
        author: "Asterios Raptis",
        language: "de",
        sections: chapters.map(([heading, body]) => ({
            heading,
            doc: para(body),
        })),
    };
}

async function entriesOf(blob: Blob): Promise<Record<string, Uint8Array>> {
    return unzipSync(new Uint8Array(await blob.arrayBuffer()));
}

describe("zipEntryNames", () => {
    it("slugifies each title", () => {
        expect(zipEntryNames(["Der Kater auf dem Dach"], "md")).toEqual([
            "der-kater-auf-dem-dach.md",
        ]);
    });

    it("suffixes a colliding slug instead of overwriting it", () => {
        // "Der Käter" and "Der Kater" slugify the same. A ZIP with a
        // duplicate entry name keeps one of them and loses the other
        // without an error, which is the bug this prevents.
        expect(zipEntryNames(["Der Kater", "Der Käter", "Der Kater"], "md")).toEqual([
            "der-kater.md",
            "der-kater-2.md",
            "der-kater-3.md",
        ]);
    });

    it("falls back to a usable name for a title that slugifies to nothing", () => {
        expect(zipEntryNames(["???", "!!!"], "md")).toEqual([
            "export.md",
            "export-2.md",
        ]);
    });
});

describe("output filenames", () => {
    it("date-stamp the archive per dashboard", () => {
        const day = new Date("2026-10-10T08:30:00Z");
        expect(bulkArchiveFilename("books", day)).toBe("books-2026-10-10.zip");
        expect(bulkArchiveFilename("articles", day)).toBe("articles-2026-10-10.zip");
    });

    it("date-stamp the combined document with its own extension", () => {
        expect(combinedFilename("articles", "md", new Date("2026-10-10T08:30:00Z")))
            .toBe("articles-2026-10-10.md");
    });
});

describe("buildBulkZip", () => {
    it("puts one entry per document in selection order", async () => {
        const docs = [article("Erster Text", "Eins."), article("Zweiter Text", "Zwei.")];
        const entries = await entriesOf(await buildBulkZip(docs, "markdown"));
        expect(Object.keys(entries)).toEqual(["erster-text.md", "zweiter-text.md"]);
        expect(strFromU8(entries["erster-text.md"])).toContain("Eins.");
        expect(strFromU8(entries["zweiter-text.md"])).toContain("Zwei.");
    });

    it("keeps both documents when their titles collide", async () => {
        const docs = [article("Der Kater", "Erste Fassung."), article("Der Käter", "Zweite Fassung.")];
        const entries = await entriesOf(await buildBulkZip(docs, "markdown"));
        expect(Object.keys(entries)).toHaveLength(2);
        expect(strFromU8(entries["der-kater.md"])).toContain("Erste Fassung.");
        expect(strFromU8(entries["der-kater-2.md"])).toContain("Zweite Fassung.");
    });

    it("carries a book's chapters into its entry", async () => {
        const docs = [book("Das Buch", [["Kapitel eins", "Anfang."], ["Kapitel zwei", "Ende."]])];
        const entries = await entriesOf(await buildBulkZip(docs, "markdown"));
        const text = strFromU8(entries["das-buch.md"]);
        expect(text).toContain("Kapitel eins");
        expect(text).toContain("Kapitel zwei");
    });

    it("uses the format's own extension, not the format name", async () => {
        // "markdown" is the format; "md" is the extension. An archive full
        // of `.markdown` files is the bug.
        const entries = await entriesOf(await buildBulkZip([article("T", "x")], "markdown"));
        expect(Object.keys(entries)).toEqual(["t.md"]);
    });

    it("reports progress per document and once for archiving", async () => {
        const seen: string[] = [];
        await buildBulkZip(
            [article("Eins", "a"), article("Zwei", "b")],
            "markdown",
            (p) => seen.push(`${p.step}:${p.current}/${p.total}:${p.title ?? ""}`),
        );
        expect(seen).toEqual([
            "rendering:0/2:Eins",
            "rendering:1/2:Zwei",
            "archiving:2/2:",
        ]);
    });

    it("produces an empty archive for an empty selection rather than throwing", async () => {
        const entries = await entriesOf(await buildBulkZip([], "markdown"));
        expect(Object.keys(entries)).toEqual([]);
    });

    it("names the document that failed instead of failing anonymously", async () => {
        // A 40-book selection that reports "export failed" tells the user
        // nothing they can act on.
        await expect(
            buildBulkZip([article("Kaputtes Buch", "x")], "pdf"),
        ).rejects.toThrow(/Kaputtes Buch/);
    });

    it("keeps the original failure as the cause", async () => {
        // The wrapper adds the title; it must not swallow what broke.
        let error: Error | undefined;
        try {
            await buildBulkZip([article("Kaputt", "x")], "pdf");
        } catch (err) {
            error = err as Error;
        }
        expect(error?.message).toContain("pdfmake blew up");
        expect((error?.cause as Error).message).toBe("pdfmake blew up");
    });

    it("stops at the first failure instead of finishing the archive", async () => {
        // A partially-rendered archive that downloads anyway is worse than
        // an error: the user cannot see which document is missing.
        const seen: number[] = [];
        await buildBulkZip(
            [article("Eins", "a"), article("Zwei", "b"), article("Drei", "c")],
            "pdf",
            (p) => seen.push(p.current),
        ).catch(() => undefined);
        expect(seen).toEqual([0]);
    });
});

describe("combineArticleDocuments", () => {
    it("turns each article's title into its section heading", () => {
        const combined = combineArticleDocuments(
            [article("Erster Text", "Eins."), article("Zweiter Text", "Zwei.")],
            "Sammlung",
        );
        expect(combined.title).toBe("Sammlung");
        expect(combined.sections.map((s) => s.heading)).toEqual([
            "Erster Text",
            "Zweiter Text",
        ]);
    });

    it("keeps sections an article already named", () => {
        const sectioned: ExportDocument = {
            title: "Mit Abschnitten",
            sections: [
                { heading: "Teil A", doc: para("a") },
                { heading: "Teil B", doc: para("b") },
            ],
        };
        expect(
            combineArticleDocuments([sectioned], "Sammlung").sections.map((s) => s.heading),
        ).toEqual(["Teil A", "Teil B"]);
    });

    it("takes author and language from the first article", () => {
        const combined = combineArticleDocuments(
            [
                { ...article("Eins", "a"), author: "A", language: "de" },
                { ...article("Zwei", "b"), author: "B", language: "en" },
            ],
            "Sammlung",
        );
        expect(combined.author).toBe("A");
        expect(combined.language).toBe("de");
    });

    it("survives an empty selection", () => {
        const combined = combineArticleDocuments([], "Sammlung");
        expect(combined.sections).toEqual([]);
        expect(combined.author).toBeUndefined();
    });
});
