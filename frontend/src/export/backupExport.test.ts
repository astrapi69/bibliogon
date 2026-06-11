import {describe, it, expect, vi} from "vitest";

import {BACKUP_BUNDLE_VERSION, backupFilename, buildBackupBundle} from "./backupExport";

const fakeStorage = {
    settings: {
        getApp: vi.fn(async () => ({
            theme: "nord",
            author: {name: "Me", pen_names: ["M."]},
        })),
    },
    authors: {list: vi.fn(async () => [{id: "a1", name: "King", slug: "king"}])},
    books: {list: vi.fn(async () => [{id: "b1", title: "Book One"}])},
    chapters: {
        list: vi.fn(async (bookId: string) => [
            {id: "c1", book_id: bookId, title: "Ch 1", content: '{"doc":1}'},
        ]),
    },
    articles: {
        list: vi.fn(async () => [{id: "ar1", title: "Art"}]),
        get: vi.fn(async (id: string) => ({id, title: "Art", content_json: '{"a":1}'})),
    },
    writingSessions: {list: vi.fn(async () => [{id: "ws1", words: 100}])},
    storyBible: {listEntities: vi.fn(async () => [{id: "e1", name: "Hero"}])},
    chapterLabels: {list: vi.fn(async () => [{id: "l1", name: "Draft"}])},
};

vi.mock("../storage", () => ({getStorage: () => fakeStorage}));

describe("buildBackupBundle", () => {
    it("assembles a versioned envelope with all core entities", async () => {
        const bundle = await buildBackupBundle("2026-06-10T12:00:00Z");

        expect(bundle.version).toBe(BACKUP_BUNDLE_VERSION);
        expect(bundle.exported_at).toBe("2026-06-10T12:00:00Z");
        expect(typeof bundle.app_version).toBe("string");

        expect(bundle.data.settings).toMatchObject({theme: "nord"});
        expect(bundle.data.author_profile).toEqual({name: "Me", pen_names: ["M."]});
        expect(bundle.data.authors).toHaveLength(1);

        expect(bundle.data.books).toHaveLength(1);
        expect(bundle.data.books[0].book.id).toBe("b1");
        expect(bundle.data.books[0].chapters[0].content).toBe('{"doc":1}');

        expect(bundle.data.articles[0].content_json).toBe('{"a":1}');
        expect(bundle.data.story_bible.entities[0].name).toBe("Hero");
        expect(bundle.data.writing_sessions).toHaveLength(1);
        expect(bundle.data.chapter_labels).toHaveLength(1);
    });

    it("fetches full article content via get, not just the list summary", async () => {
        await buildBackupBundle("2026-06-10T12:00:00Z");
        expect(fakeStorage.articles.get).toHaveBeenCalledWith("ar1");
    });

    it("defaults author_profile to null when settings has no author", async () => {
        fakeStorage.settings.getApp.mockResolvedValueOnce({theme: "nord"} as never);
        const bundle = await buildBackupBundle("2026-06-10T12:00:00Z");
        expect(bundle.data.author_profile).toBeNull();
    });
});

describe("backupFilename", () => {
    it("uses only the date part", () => {
        expect(backupFilename("2026-06-10T12:34:56Z")).toBe("bibliogon-backup-2026-06-10.json");
    });
});
