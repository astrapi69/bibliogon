import { describe, it, expect, vi, beforeEach } from "vitest";
import { strToU8, zipSync } from "fflate";

import { importBgbFile, BgbImportError } from "./bgbImport";

/** Live state the mocked storage seam records, asserted by the tests. */
const recorded = vi.hoisted(() => ({
    existingBooks: [] as { id: string }[],
    existingArticles: [] as { id: string }[],
    existingAuthors: [] as { name: string; slug: string }[],
    books: [] as Record<string, unknown>[],
    chapters: [] as { bookId: string; data: Record<string, unknown> }[],
    assets: [] as { bookId: string; filename: string; assetType?: string }[],
    bookUpdates: [] as { id: string; data: Record<string, unknown> }[],
    articles: [] as Record<string, unknown>[],
    authors: [] as { name: string }[],
    entities: [] as { bookId: string; data: Record<string, unknown> }[],
    labels: [] as { bookId: string; data: Record<string, unknown> }[],
    bookSeq: 0,
    articleSeq: 0,
}));

vi.mock("../storage", () => ({
    getStorage: () => ({
        mode: "dexie",
        books: {
            list: vi.fn(async () => recorded.existingBooks),
            create: vi.fn(async (data: Record<string, unknown>) => {
                const row = { ...data, id: `new-book-${++recorded.bookSeq}` };
                recorded.books.push(row);
                return row;
            }),
            update: vi.fn(async (id: string, data: Record<string, unknown>) => {
                recorded.bookUpdates.push({ id, data });
                return { id, ...data };
            }),
        },
        chapters: {
            create: vi.fn(async (bookId: string, data: Record<string, unknown>) => {
                recorded.chapters.push({ bookId, data });
                return { id: `ch-${recorded.chapters.length}`, ...data };
            }),
        },
        assets: {
            cacheBlob: vi.fn(
                async (bookId: string, filename: string, _blob: Blob, assetType?: string) => {
                    recorded.assets.push({ bookId, filename, assetType });
                },
            ),
        },
        articles: {
            list: vi.fn(async () => recorded.existingArticles),
            create: vi.fn(async (data: Record<string, unknown>) => {
                const row = { ...data, id: `new-art-${++recorded.articleSeq}` };
                recorded.articles.push(row);
                return row;
            }),
            update: vi.fn(async () => {}),
        },
        authors: {
            list: vi.fn(async () => recorded.existingAuthors),
            create: vi.fn(async (data: { name: string }) => {
                recorded.authors.push(data);
                return { ...data, id: "au", slug: data.name.toLowerCase() };
            }),
        },
        storyBible: {
            createEntity: vi.fn(async (bookId: string, data: Record<string, unknown>) => {
                recorded.entities.push({ bookId, data });
                return { id: "se", ...data };
            }),
        },
        chapterLabels: {
            create: vi.fn(async (bookId: string, data: Record<string, unknown>) => {
                recorded.labels.push({ bookId, data });
                return { id: "cl", ...data };
            }),
        },
    }),
}));

function bgbFile(files: Record<string, string | Uint8Array>): File {
    const entries: Record<string, Uint8Array> = {};
    for (const [path, content] of Object.entries(files)) {
        entries[path] = typeof content === "string" ? strToU8(content) : content;
    }
    const zipped = zipSync(entries);
    const buffer = new ArrayBuffer(zipped.byteLength);
    new Uint8Array(buffer).set(zipped);
    return new File([buffer], "backup.bgb");
}

const MANIFEST = JSON.stringify({ format: "bibliogon-backup", version: "3.0" });
const OLD_ID = "11111111-2222-3333-4444-555555555555";

function bookJson(id: string, extra: Record<string, unknown> = {}): string {
    return JSON.stringify({
        id,
        title: "My Book",
        author: "Aster",
        language: "de",
        book_type: "prose",
        status: "draft",
        ...extra,
    });
}

function chapterJson(id: string, bookId: string, content: string, position = 0): string {
    return JSON.stringify({
        id,
        book_id: bookId,
        title: `Chapter ${position}`,
        content,
        position,
        chapter_type: "chapter",
    });
}

beforeEach(() => {
    recorded.existingBooks = [];
    recorded.existingArticles = [];
    recorded.existingAuthors = [];
    recorded.books = [];
    recorded.chapters = [];
    recorded.assets = [];
    recorded.bookUpdates = [];
    recorded.articles = [];
    recorded.authors = [];
    recorded.entities = [];
    recorded.labels = [];
    recorded.bookSeq = 0;
    recorded.articleSeq = 0;
});

describe("importBgbFile", () => {
    it("imports a book + its chapters and rewrites chapter asset URLs", async () => {
        const content = JSON.stringify({
            type: "doc",
            content: [
                {
                    type: "imageFigure",
                    attrs: {
                        src: `/api/books/${OLD_ID}/assets/file/fig.png`,
                    },
                },
            ],
        });
        const png = new Uint8Array([1, 2, 3, 4]);
        const file = bgbFile({
            "manifest.json": MANIFEST,
            [`books/${OLD_ID}/book.json`]: bookJson(OLD_ID),
            [`books/${OLD_ID}/chapters/ch1.json`]: chapterJson("ch1", OLD_ID, content, 0),
            [`books/${OLD_ID}/assets.json`]: JSON.stringify([
                { id: "a1", book_id: OLD_ID, filename: "fig.png", asset_type: "figure", path: "x" },
            ]),
            [`books/${OLD_ID}/assets/fig.png`]: png,
        });

        const result = await importBgbFile(file);

        expect(result.imported.books).toBe(1);
        expect(result.imported.chapters).toBe(1);
        expect(result.imported.assets).toBe(1);

        const newBookId = recorded.books[0].id as string;
        // The asset bytes are cached under the NEW book id...
        expect(recorded.assets[0]).toMatchObject({
            bookId: newBookId,
            filename: "fig.png",
            assetType: "figure",
        });
        // ...and the chapter content URL is rewritten to the new id.
        const savedContent = recorded.chapters[0].data.content as string;
        expect(savedContent).toContain(`/api/books/${newBookId}/assets/file/fig.png`);
        expect(savedContent).not.toContain(OLD_ID);
    });

    it("orders chapters by position", async () => {
        const file = bgbFile({
            "manifest.json": MANIFEST,
            [`books/${OLD_ID}/book.json`]: bookJson(OLD_ID),
            [`books/${OLD_ID}/chapters/b.json`]: chapterJson("b", OLD_ID, "{}", 1),
            [`books/${OLD_ID}/chapters/a.json`]: chapterJson("a", OLD_ID, "{}", 0),
        });
        await importBgbFile(file);
        expect(recorded.chapters.map((c) => c.data.position)).toEqual([0, 1]);
    });

    it("skips a book whose id already exists (dedup)", async () => {
        recorded.existingBooks = [{ id: OLD_ID }];
        const file = bgbFile({
            "manifest.json": MANIFEST,
            [`books/${OLD_ID}/book.json`]: bookJson(OLD_ID),
            [`books/${OLD_ID}/chapters/ch1.json`]: chapterJson("ch1", OLD_ID, "{}", 0),
        });
        const result = await importBgbFile(file);
        expect(result.imported.books).toBe(0);
        expect(result.skipped.books).toBe(1);
        expect(recorded.chapters).toHaveLength(0);
    });

    it("imports story entities + chapter labels re-parented to the new book", async () => {
        const file = bgbFile({
            "manifest.json": MANIFEST,
            [`books/${OLD_ID}/book.json`]: bookJson(OLD_ID),
            [`books/${OLD_ID}/story_entities.json`]: JSON.stringify([
                {
                    id: "e1",
                    book_id: OLD_ID,
                    entity_type: "character",
                    name: "Mira",
                    description: "{}",
                    entity_metadata: {},
                    relationships: [],
                },
            ]),
            [`books/${OLD_ID}/chapter_labels.json`]: JSON.stringify([
                { id: "l1", book_id: OLD_ID, name: "Draft", color: "#abc" },
            ]),
        });
        const result = await importBgbFile(file);
        expect(result.imported.story_entities).toBe(1);
        expect(result.imported.chapter_labels).toBe(1);
        const newBookId = recorded.books[0].id;
        expect(recorded.entities[0].bookId).toBe(newBookId);
        expect(recorded.labels[0].bookId).toBe(newBookId);
    });

    it("imports articles + dedups authors by name", async () => {
        const file = bgbFile({
            "manifest.json": MANIFEST,
            "books/.keep": "",
            [`articles/aaa/article.json`]: JSON.stringify({
                id: "aaa",
                title: "Post",
                author: "Aster",
                language: "en",
                content_type: "blogpost",
                content_json: "{}",
                status: "draft",
            }),
            "globals/authors.json": JSON.stringify([
                { id: "au1", name: "Aster", slug: "aster", bio: null },
            ]),
        });
        const result = await importBgbFile(file);
        expect(result.imported.articles).toBe(1);
        expect(result.imported.authors).toBe(1);
        expect(recorded.authors[0].name).toBe("Aster");
    });

    it("throws BgbImportError on a non-ZIP file", async () => {
        const file = new File(["not a zip"], "broken.bgb");
        await expect(importBgbFile(file)).rejects.toBeInstanceOf(BgbImportError);
    });

    it("throws BgbImportError on a wrong-format manifest", async () => {
        const file = bgbFile({
            "manifest.json": JSON.stringify({ format: "something-else" }),
        });
        await expect(importBgbFile(file)).rejects.toBeInstanceOf(BgbImportError);
    });
});
