import { describe, it, expect, vi, beforeEach } from "vitest";

import record from "./wbtImport.parity.json";
import { recordedZip, type RecordedFiles } from "./recordFixtures";

/**
 * The orchestrator end to end: real ZIP bytes in, storage-seam writes out.
 *
 * The planners are pinned against the backend elsewhere; this asserts the
 * chain actually carries their decisions through - the shape the repo's rules
 * call for, where the assertion is on the OUTPUT of the whole chain rather
 * than on one layer passing its argument along.
 *
 * The seam is faked rather than mocked per-call so the test reads the written
 * state the way a user would see it.
 */
interface FakeBook {
    id: string;
    [key: string]: unknown;
}

const books: FakeBook[] = [];
const chapters: Record<string, unknown>[] = [];
const uploads: { bookId: string; name: string; assetType?: string; size: number }[] = [];

vi.mock("../../storage", () => ({
    getStorage: () => ({
        books: {
            create: async (payload: Record<string, unknown>) => {
                const book = { id: `book-${books.length + 1}`, ...payload };
                books.push(book);
                return book;
            },
            update: async (id: string, payload: Record<string, unknown>) => {
                const book = books.find((b) => b.id === id);
                Object.assign(book as FakeBook, payload);
                return book;
            },
        },
        chapters: {
            create: async (bookId: string, payload: Record<string, unknown>) => {
                const chapter = { id: `ch-${chapters.length + 1}`, bookId, ...payload };
                chapters.push(chapter);
                return chapter;
            },
        },
        assets: {
            upload: async (bookId: string, file: File, assetType?: string) => {
                uploads.push({ bookId, name: file.name, assetType, size: file.size });
                return { id: `asset-${uploads.length}`, filename: file.name };
            },
        },
    }),
}));

function caseNamed(name: string) {
    const entry = record.cases.find((c) => c.name === name);
    if (!entry) throw new Error(`no recorded case ${name}`);
    return entry;
}

function archiveOf(name: string): File {
    const bytes = recordedZip(caseNamed(name).files as RecordedFiles);
    return new File([bytes as BlobPart], `${name}.zip`, { type: "application/zip" });
}

beforeEach(() => {
    books.length = 0;
    chapters.length = 0;
    uploads.length = 0;
});

describe("importWbtArchive", () => {
    it("writes the book, its chapters and its assets from a real archive", async () => {
        const { importWbtArchive } = await import("./wbtImport");
        const entry = caseNamed("full-project-with-section-order");

        const result = await importWbtArchive(archiveOf(entry.name));

        expect(books).toHaveLength(1);
        expect(books[0].title).toBe(entry.book.title);
        expect(books[0].author).toBe(entry.book.author);
        expect(books[0].language).toBe(entry.book.language);
        expect(books[0].isbn_ebook).toBe(entry.book.isbn_ebook);
        expect(result.chapterCount).toBe(entry.chapters.length);
        expect(chapters).toHaveLength(entry.chapters.length);
        expect(uploads).toHaveLength(entry.assets.length);
    });

    it("stores chapter content as a TipTap document, not as HTML", async () => {
        // The shape every other client importer stores, and the one that
        // avoids #787 - imported HTML staying HTML in the database until
        // somebody opens and saves each chapter.
        const { importWbtArchive } = await import("./wbtImport");
        await importWbtArchive(archiveOf("full-project-with-section-order"));

        const parsed = JSON.parse(chapters[0].content as string);
        expect(parsed.type).toBe("doc");
        expect(Array.isArray(parsed.content)).toBe(true);
    });

    it("keeps the recorded order, titles and types", async () => {
        const { importWbtArchive } = await import("./wbtImport");
        const entry = caseNamed("full-project-with-section-order");
        await importWbtArchive(archiveOf(entry.name));

        expect(
            chapters.map((c) => ({
                title: c.title,
                chapter_type: c.chapter_type,
                position: c.position,
            })),
        ).toEqual(
            entry.chapters.map((c) => ({
                title: c.title,
                chapter_type: c.chapter_type,
                position: c.position,
            })),
        );
    });

    it("carries each chapter's text into the document", async () => {
        const { importWbtArchive } = await import("./wbtImport");
        const entry = caseNamed("full-project-with-section-order");
        await importWbtArchive(archiveOf(entry.name));

        const text = (node: unknown): string => {
            if (Array.isArray(node)) return node.map(text).join(" ");
            if (typeof node !== "object" || node === null) return "";
            const n = node as Record<string, unknown>;
            if (typeof n.text === "string") return n.text;
            return text(n.content);
        };
        const body = text(JSON.parse(chapters[2].content as string));
        // The recorded plain text includes the H1 the walker turns into a
        // heading node; assert the prose that follows it.
        expect(body).toContain("Er sitzt oben");
    });

    it("uploads each asset with the type its folder implies", async () => {
        const { importWbtArchive } = await import("./wbtImport");
        const entry = caseNamed("asset-classification-and-cover-fallback");
        await importWbtArchive(archiveOf(entry.name));

        expect(
            uploads.map((u) => ({ name: u.name, assetType: u.assetType })).sort((a, b) =>
                a.name.localeCompare(b.name),
            ),
        ).toEqual(
            entry.assets
                .map((a) => ({ name: a.filename, assetType: a.asset_type }))
                .sort((a, b) => a.name.localeCompare(b.name)),
        );
        expect(uploads.every((u) => u.size > 0)).toBe(true);
    });

    it("sets the cover after the assets, so a stale metadata path is replaced", async () => {
        const { importWbtArchive } = await import("./wbtImport");
        await importWbtArchive(archiveOf("asset-classification-and-cover-fallback"));
        expect(String(books[0].cover_image)).toContain("echtes-cover.png");
    });

    it("carries the keywords as a list, not as the column's JSON string", async () => {
        const { importWbtArchive } = await import("./wbtImport");
        await importWbtArchive(archiveOf("keywords-carry-python-json-escaping"));
        expect(books[0].keywords).toEqual(["Käse", "Stadt", "😀", "ascii"]);
    });

    it("imports a project wrapped in one directory", async () => {
        const { importWbtArchive } = await import("./wbtImport");
        const entry = caseNamed("one-wrapper-directory");
        const result = await importWbtArchive(archiveOf(entry.name));
        expect(result.chapterCount).toBe(entry.chapters.length);
        expect(books[0].title).toBe(entry.book.title);
    });

    it("imports a project with no chapters at all", async () => {
        const { importWbtArchive } = await import("./wbtImport");
        const result = await importWbtArchive(archiveOf("empty-manuscript"));
        expect(result.chapterCount).toBe(0);
        expect(books).toHaveLength(1);
    });

    it("refuses an archive that is not a write-book-template project", async () => {
        const { importWbtArchive } = await import("./wbtImport");
        const { zipSync } = await import("fflate");
        const bytes = zipSync({ "readme.txt": new TextEncoder().encode("hallo") });
        const file = new File([bytes as BlobPart], "nicht-wbt.zip");
        await expect(importWbtArchive(file)).rejects.toThrow(/project root/i);
        expect(books).toHaveLength(0);
    });
});

describe("isWbtArchive", () => {
    it("claims a project archive", async () => {
        const { isWbtArchive, readArchiveEntries } = await import("./wbtImport");
        const bytes = recordedZip(caseNamed("one-wrapper-directory").files as RecordedFiles);
        expect(isWbtArchive(readArchiveEntries(bytes))).toBe(true);
    });

    it("does not claim a ZIP without the marker", async () => {
        const { isWbtArchive, readArchiveEntries } = await import("./wbtImport");
        const { zipSync } = await import("fflate");
        const bytes = zipSync({ "a/b.txt": new Uint8Array([1]) });
        expect(isWbtArchive(readArchiveEntries(bytes))).toBe(false);
    });

    it("does not claim a manuscript-only tree with no metadata.yaml", async () => {
        // findProjectRoot accepts either signal, so the marker check is what
        // keeps this importer from claiming a loose folder of markdown.
        const { isWbtArchive, readArchiveEntries } = await import("./wbtImport");
        const { zipSync } = await import("fflate");
        const bytes = zipSync({
            "manuscript/chapters/01.md": new TextEncoder().encode("# Eins"),
        });
        expect(isWbtArchive(readArchiveEntries(bytes))).toBe(false);
    });
});
