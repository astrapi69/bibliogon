import {describe, it, expect, vi, beforeEach} from "vitest";

import {BackupImportError, importFullBackup, parseBackupBundle} from "./backupImport";

const updateApp = vi.fn(async (d: Record<string, unknown>) => d);
const authorsList = vi.fn(async () => [] as unknown[]);
const authorsCreate = vi.fn(async (d: {name: string}) => ({id: "na", ...d}));
const booksList = vi.fn(async () => [] as {id: string}[]);
const booksCreate = vi.fn(async (_d: Record<string, unknown>) => ({id: "new-b1"}));
const chaptersCreate = vi.fn(
    async (_bookId: string, _d: {title: string; content?: string}) => ({id: "nc"}),
);
const articlesList = vi.fn(async () => [] as {id: string}[]);
const articlesCreate = vi.fn(async (_d: Record<string, unknown>) => ({id: "new-ar1"}));
const articlesUpdate = vi.fn(async (_id: string, _d: Record<string, unknown>) => ({}));
const createEntity = vi.fn(async (_bookId: string, _d: {name: string}) => ({id: "ne"}));
const labelsCreate = vi.fn(async (_bookId: string, _d: {name: string; color: string}) => ({
    id: "nl",
}));

vi.mock("../storage", () => ({
    getStorage: () => ({
        settings: {updateApp},
        authors: {list: authorsList, create: authorsCreate},
        books: {list: booksList, create: booksCreate},
        chapters: {create: chaptersCreate},
        articles: {list: articlesList, create: articlesCreate, update: articlesUpdate},
        storyBible: {createEntity},
        chapterLabels: {create: labelsCreate},
    }),
}));

function bundle(overrides: Record<string, unknown> = {}) {
    return {
        version: 1,
        app_version: "0.49.0",
        exported_at: "2026-06-10T12:00:00Z",
        data: {
            settings: {theme: "nord", author: {name: "Me"}},
            author_profile: {name: "Me"},
            authors: [{name: "King", slug: "king"}],
            books: [
                {
                    book: {id: "b1", title: "Book One", language: "de"},
                    chapters: [
                        {id: "c2", title: "Two", content: "{}", position: 1},
                        {id: "c1", title: "One", content: "{}", position: 0},
                    ],
                },
            ],
            articles: [{id: "ar1", title: "Art", content_json: '{"a":1}'}],
            story_bible: {entities: [{id: "e1", book_id: "b1", entity_type: "character", name: "Hero"}], relationships: [], links: []},
            writing_sessions: [],
            chapter_labels: [{id: "l1", book_id: "b1", name: "Draft", color: "#fff"}],
            storyboard: [],
            publications: [],
            article_platforms: [],
            ...overrides,
        },
    };
}

function fileOf(obj: unknown): File {
    return {text: async () => JSON.stringify(obj)} as unknown as File;
}

beforeEach(() => {
    [
        updateApp,
        authorsList,
        authorsCreate,
        booksList,
        booksCreate,
        chaptersCreate,
        articlesList,
        articlesCreate,
        articlesUpdate,
        createEntity,
        labelsCreate,
    ].forEach((m) => m.mockClear());
    authorsList.mockResolvedValue([]);
    booksList.mockResolvedValue([]);
    articlesList.mockResolvedValue([]);
});

describe("parseBackupBundle", () => {
    it("throws on non-JSON", () => {
        expect(() => parseBackupBundle("nope")).toThrow(BackupImportError);
    });
    it("throws on an unsupported version", () => {
        expect(() => parseBackupBundle(JSON.stringify({version: 99, data: {}}))).toThrow(
            BackupImportError,
        );
    });
});

describe("importFullBackup", () => {
    it("restores settings WITHOUT overwriting the author profile", async () => {
        await importFullBackup(fileOf(bundle()));
        expect(updateApp).toHaveBeenCalledTimes(1);
        const payload = updateApp.mock.calls[0][0];
        expect(payload).toMatchObject({theme: "nord"});
        expect(payload).not.toHaveProperty("author");
    });

    it("creates chapters under the NEW book id, in position order", async () => {
        await importFullBackup(fileOf(bundle()));
        expect(booksCreate).toHaveBeenCalledTimes(1);
        expect(chaptersCreate).toHaveBeenCalledTimes(2);
        expect(chaptersCreate.mock.calls[0][0]).toBe("new-b1");
        expect(chaptersCreate.mock.calls[0][1].title).toBe("One");
        expect(chaptersCreate.mock.calls[1][1].title).toBe("Two");
    });

    it("restores article content via create + update", async () => {
        await importFullBackup(fileOf(bundle()));
        expect(articlesCreate).toHaveBeenCalledTimes(1);
        expect(articlesUpdate).toHaveBeenCalledWith(
            "new-ar1",
            expect.objectContaining({content_json: '{"a":1}'}),
        );
    });

    it("re-parents story entities + chapter labels to the new book id", async () => {
        await importFullBackup(fileOf(bundle()));
        expect(createEntity).toHaveBeenCalledWith("new-b1", expect.objectContaining({name: "Hero"}));
        expect(labelsCreate).toHaveBeenCalledWith("new-b1", {name: "Draft", color: "#fff"});
    });

    it("returns accurate imported counts", async () => {
        const result = await importFullBackup(fileOf(bundle()));
        expect(result.imported).toMatchObject({
            settings: 1,
            authors: 1,
            books: 1,
            chapters: 2,
            articles: 1,
            story_entities: 1,
            chapter_labels: 1,
        });
    });

    it("skips a book whose id already exists (no overwrite)", async () => {
        booksList.mockResolvedValue([{id: "b1"}]);
        const result = await importFullBackup(fileOf(bundle()));
        expect(booksCreate).not.toHaveBeenCalled();
        expect(result.skipped.books).toBe(1);
        expect(result.imported.books).toBe(0);
    });
});
