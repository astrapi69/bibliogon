import {describe, it, expect, vi} from "vitest";

import {BACKUP_BUNDLE_VERSION, backupFilename, buildBackupBundle} from "./backupExport";

const fakeStorage = {
    settings: {
        getApp: vi.fn(async () => ({
            theme: "nord",
            author: {name: "Me", pen_names: ["M."]},
            // #985: a real settings blob carries provider keys in three
            // shapes. The bundle must carry none of them.
            ai: {
                active_provider: "google",
                api_key: "AIza-mirror-secret",
                keys: {google: "AIza-canonical-secret"},
                provider_keys: {anthropic: {api_key: "sk-ant-side-secret", model: "claude"}},
                model_overrides: {google: "gemini-2.0-flash"},
                enabled: true,
            },
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
    storyBible: {
        listEntities: vi.fn(async () => [{id: "e1", name: "Hero"}]),
        appearances: vi.fn(async (entityId: string) => [
            {id: "lnk1", entity_id: entityId, page_id: "p1", chapter_id: null, role: "lead"},
        ]),
    },
    pages: {
        list: vi.fn(async (bookId: string) => [
            {id: "p1", book_id: bookId, position: 0, layout: "text_only", text_content: "Seite"},
        ]),
    },
    comics: {
        listPanels: vi.fn(async (_bookId: string, pageId: string) => [
            {id: "pan1", page_id: pageId, position: 0, bounds: {x: 0}},
        ]),
        listBubbles: vi.fn(async (_bookId: string, panelId: string) => [
            {id: "bub1", panel_id: panelId, position: 0, bubble_type: "speech", anchor: {x: 1}},
        ]),
    },
    chapterLabels: {list: vi.fn(async () => [{id: "l1", name: "Draft"}])},
    aplusDocuments: {
        listForBook: vi.fn(async (bookId: string) => [
            {
                book_id: bookId,
                language: "es",
                updated_at: "2026-09-22T10:00:00Z",
                content_name: "El caballo - A+Content",
                short_description: "Kurz",
                bullets: [],
                modules: [],
            },
        ]),
    },
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
        expect(bundle.data.aplus_documents).toEqual([
            expect.objectContaining({book_id: "b1", language: "es", content_name: "El caballo - A+Content"}),
        ]);
        expect(fakeStorage.aplusDocuments.listForBook).toHaveBeenCalledWith("b1");
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

    it("treats a book-type gate as 'no pages' instead of failing the export", async () => {
        // Online the pages router answers 400 for a prose book and the
        // panels router 400 for a picture-book page. Letting that
        // propagate aborted the whole export on the first prose book.
        const gate = Object.assign(new Error("not a picture book"), {status: 400});
        fakeStorage.pages.list.mockRejectedValueOnce(gate);

        const bundle = await buildBackupBundle("2026-09-30T12:00:00Z");

        expect(bundle.data.books[0].pages).toEqual([]);
    });

    it("still fails the export on a real error", async () => {
        const boom = Object.assign(new Error("server exploded"), {status: 500});
        fakeStorage.pages.list.mockRejectedValueOnce(boom);

        await expect(buildBackupBundle("2026-09-30T12:00:00Z")).rejects.toThrow(
            "server exploded",
        );
    });
});

describe("buildBackupBundle secrets (#985)", () => {
    it("carries no provider key in any of the three shapes", async () => {
        const serialised = JSON.stringify(await buildBackupBundle("2026-10-09T00:00:00Z"));
        expect(serialised).not.toContain("AIza-mirror-secret");
        expect(serialised).not.toContain("AIza-canonical-secret");
        expect(serialised).not.toContain("sk-ant-side-secret");
    });

    it("keeps the rest of the AI config so a restore puts the user back", async () => {
        const bundle = await buildBackupBundle("2026-10-09T00:00:00Z");
        const ai = (bundle.data.settings as {ai: Record<string, unknown>}).ai;
        expect(ai.active_provider).toBe("google");
        expect(ai.model_overrides).toEqual({google: "gemini-2.0-flash"});
        expect(ai.enabled).toBe(true);
        expect(ai.keys).toEqual({});
        expect(ai.api_key).toBe("");
    });

    it("leaves the live settings untouched", async () => {
        await buildBackupBundle("2026-10-09T00:00:00Z");
        const live = await fakeStorage.settings.getApp();
        expect(live.ai.keys.google).toBe("AIza-canonical-secret");
    });
});
