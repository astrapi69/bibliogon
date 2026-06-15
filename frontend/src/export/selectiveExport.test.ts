import { describe, it, expect, vi, beforeEach } from "vitest";

import {
    EMPTY_SELECTION,
    FULL_SELECTION,
    buildSelectiveBundle,
    exportSelectiveBackup,
    hasAnySelection,
    selectiveExportFilename,
    type ExportSelection,
} from "./selectiveExport";
import { BACKUP_BUNDLE_VERSION } from "./backupExport";

const fakeStorage = {
    settings: {
        getApp: vi.fn(async () => ({
            theme: "nord",
            author: { name: "Me", pen_names: ["M."] },
        })),
    },
    authors: { list: vi.fn(async () => [{ id: "a1", name: "King", slug: "king" }]) },
    books: { list: vi.fn(async () => [{ id: "b1", title: "Book One" }]) },
    chapters: {
        list: vi.fn(async (bookId: string) => [
            { id: "c1", book_id: bookId, title: "Ch 1", content: '{"doc":1}' },
        ]),
    },
    articles: {
        list: vi.fn(async () => [{ id: "ar1", title: "Art" }]),
        get: vi.fn(async (id: string) => ({ id, title: "Art", content_json: '{"a":1}' })),
    },
    writingSessions: { list: vi.fn(async () => [{ id: "ws1", words: 100 }]) },
    storyBible: { listEntities: vi.fn(async () => [{ id: "e1", name: "Hero" }]) },
    chapterLabels: { list: vi.fn(async () => [{ id: "l1", name: "Draft" }]) },
};

vi.mock("../storage", () => ({ getStorage: () => fakeStorage }));

beforeEach(() => {
    vi.clearAllMocks();
});

function selectionWith(overrides: Partial<ExportSelection>): ExportSelection {
    return { ...EMPTY_SELECTION, ...overrides };
}

describe("buildSelectiveBundle", () => {
    it("includes only the selected sections and leaves the rest empty", async () => {
        const bundle = await buildSelectiveBundle(
            selectionWith({ books: true }),
            "2026-06-10T12:00:00Z",
        );

        expect(bundle.version).toBe(BACKUP_BUNDLE_VERSION);
        expect(bundle.data.books).toHaveLength(1);
        expect(bundle.data.books[0].chapters[0].content).toBe('{"doc":1}');
        expect(bundle.data.articles).toHaveLength(0);
        expect(bundle.data.authors).toHaveLength(0);
        expect(bundle.data.settings).toEqual({});
        expect(bundle.data.author_profile).toBeNull();
        expect(bundle.data.story_bible.entities).toHaveLength(0);
        expect(bundle.data.writing_sessions).toHaveLength(0);
    });

    it("does not fetch books when no book-derived section is selected", async () => {
        await buildSelectiveBundle(selectionWith({ articles: true }), "2026-06-10T12:00:00Z");
        expect(fakeStorage.books.list).not.toHaveBeenCalled();
        expect(fakeStorage.articles.get).toHaveBeenCalledWith("ar1");
    });

    it("fetches books once when several book-derived sections are selected", async () => {
        await buildSelectiveBundle(
            selectionWith({ books: true, storyBible: true, chapterLabels: true }),
            "2026-06-10T12:00:00Z",
        );
        expect(fakeStorage.books.list).toHaveBeenCalledTimes(1);
    });

    it("carries the author profile only when settings are selected", async () => {
        const withSettings = await buildSelectiveBundle(
            selectionWith({ settings: true }),
            "2026-06-10T12:00:00Z",
        );
        expect(withSettings.data.settings).toMatchObject({ theme: "nord" });
        expect(withSettings.data.author_profile).toEqual({ name: "Me", pen_names: ["M."] });

        const withoutSettings = await buildSelectiveBundle(
            selectionWith({ authors: true }),
            "2026-06-10T12:00:00Z",
        );
        expect(withoutSettings.data.settings).toEqual({});
        expect(fakeStorage.settings.getApp).toHaveBeenCalledTimes(1);
    });

    it("exports every section under the full selection", async () => {
        const bundle = await buildSelectiveBundle(FULL_SELECTION, "2026-06-10T12:00:00Z");
        expect(bundle.data.books).toHaveLength(1);
        expect(bundle.data.articles).toHaveLength(1);
        expect(bundle.data.authors).toHaveLength(1);
        expect(bundle.data.chapter_labels).toHaveLength(1);
        expect(bundle.data.story_bible.entities).toHaveLength(1);
        expect(bundle.data.writing_sessions).toHaveLength(1);
    });
});

describe("exportSelectiveBackup", () => {
    it("returns a JSON blob of the selected sections", async () => {
        const blob = await exportSelectiveBackup(
            selectionWith({ authors: true }),
            "2026-06-10T12:00:00Z",
        );
        expect(blob.type).toBe("application/json");
        const parsed = JSON.parse(await blob.text());
        expect(parsed.data.authors).toHaveLength(1);
        expect(parsed.data.books).toHaveLength(0);
    });
});

describe("hasAnySelection", () => {
    it("is false for the empty selection and true otherwise", () => {
        expect(hasAnySelection(EMPTY_SELECTION)).toBe(false);
        expect(hasAnySelection(selectionWith({ settings: true }))).toBe(true);
    });
});

describe("selectiveExportFilename", () => {
    it("uses only the date part with the export prefix", () => {
        expect(selectiveExportFilename("2026-06-10T12:34:56Z")).toBe(
            "bibliogon-export-2026-06-10.json",
        );
    });
});
