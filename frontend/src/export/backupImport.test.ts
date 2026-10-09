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
const pagesCreate = vi.fn(async (_bookId: string, _d: Record<string, unknown>) => ({id: "np"}));
const createPanel = vi.fn(
    async (_bookId: string, _pageId: string, _d: Record<string, unknown>) => ({id: "npan"}),
);
const createBubble = vi.fn(
    async (_bookId: string, _panelId: string, _d: Record<string, unknown>) => ({id: "nbub"}),
);
const createLink = vi.fn(async (_d: Record<string, unknown>) => ({id: "nlink"}));

// #1008: the three tables that became seam-writable offline and were
// therefore newly losable through the client backup.
const pubCreate = vi.fn(async (_articleId: string, _d: Record<string, unknown>) => ({
    id: "new-pub1",
}));
const pubUpdate = vi.fn(
    async (_articleId: string, _pubId: string, _d: Record<string, unknown>) => ({}),
);
const pubMarkPublished = vi.fn(
    async (_articleId: string, _pubId: string, _d: Record<string, unknown>) => ({}),
);
const kdpUpsert = vi.fn(async (_bookId: string, _d: Record<string, unknown>) => ({}));
const kdpAddReviewer = vi.fn(async (_bookId: string, _d: Record<string, unknown>) => ({
    id: "new-rev1",
}));
const kdpUpdateReviewer = vi.fn(
    async (_bookId: string, _revId: string, _d: Record<string, unknown>) => ({}),
);
const translationsLink = vi.fn(async (_ids: string[]) => ({}));

// #985: the live settings the restore merges its secrets from. A bundle
// taken since the export scrubber carries empty keys, and writing those
// over this would clear the user's provider keys.
const getApp = vi.fn(async () => ({
    theme: "classic",
    ai: {
        active_provider: "google",
        keys: {google: "AIza-live"},
        api_key: "AIza-live",
        base_url: "https://generativelanguage.googleapis.com/v1beta",
        base_url_overrides: {custom: "http://localhost:1234/v1"},
    },
}));

const aplusSave = vi.fn(async (bookId: string, language: string, doc: Record<string, unknown>) => ({
    ...doc,
    book_id: bookId,
    language,
    updated_at: "t",
}));

vi.mock("../storage", () => ({
    getStorage: () => ({
        settings: {updateApp, getApp},
        authors: {list: authorsList, create: authorsCreate},
        books: {list: booksList, create: booksCreate},
        chapters: {create: chaptersCreate},
        pages: {create: pagesCreate},
        comics: {createPanel, createBubble},
        articles: {list: articlesList, create: articlesCreate, update: articlesUpdate},
        storyBible: {createEntity, createLink},
        chapterLabels: {create: labelsCreate},
        aplusDocuments: {save: aplusSave},
        publications: {create: pubCreate, update: pubUpdate, markPublished: pubMarkPublished},
        kdp: {
            upsertPublishingState: kdpUpsert,
            addReviewer: kdpAddReviewer,
            updateReviewer: kdpUpdateReviewer,
        },
        translations: {link: translationsLink},
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
        pagesCreate,
        createPanel,
        createBubble,
        createLink,
        createEntity,
        labelsCreate,
        aplusSave,
        pubCreate,
        pubUpdate,
        pubMarkPublished,
        kdpUpsert,
        kdpAddReviewer,
        kdpUpdateReviewer,
        translationsLink,
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

    it("restores A+ documents under the new book id, without the record metadata", async () => {
        const doc = {
            content_name: "El caballo - A+Content",
            short_description: "Kurz",
            bullets: [{heading: "H", body: "B"}],
            modules: [{id: "m1", template: "image_header_text", module_title: "", slots: []}],
        };
        const result = await importFullBackup(
            fileOf(
                bundle({
                    aplus_documents: [
                        {...doc, book_id: "b1", language: "es", updated_at: "old"},
                        {...doc, book_id: "unknown-book", language: "de", updated_at: "old"},
                    ],
                }),
            ),
        );
        expect(aplusSave).toHaveBeenCalledTimes(1);
        expect(aplusSave).toHaveBeenCalledWith("new-b1", "es", doc);
        expect(result.imported.aplus_documents).toBe(1);
        expect(result.skipped.aplus_documents).toBe(1);
    });

    it("accepts a bundle written before A+ documents existed", async () => {
        const result = await importFullBackup(fileOf(bundle()));
        expect(aplusSave).not.toHaveBeenCalled();
        expect(result.imported.aplus_documents).toBe(0);
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

    it("restores pages with their comic panels and bubbles under the new ids (#931)", async () => {
        const payload = bundle({
            books: [
                {
                    book: {id: "b1", title: "Comic", author: "A", language: "de"},
                    chapters: [],
                    pages: [
                        {
                            page: {
                                id: "p1",
                                book_id: "b1",
                                position: 0,
                                layout: "comic_panel_grid",
                                text_content: "Seitentext",
                                layout_config: {grid: "2x2"},
                                notes: "Notiz",
                                story_beat: "setup",
                                mood_color: "#abc",
                                act_group: "Akt 1",
                            },
                            panels: [
                                {
                                    panel: {id: "pan1", bounds: {x: 0}, panel_config: {z: 1}},
                                    bubbles: [
                                        {
                                            id: "bub1",
                                            bubble_type: "speech",
                                            anchor: {x: 5},
                                            width_pct: 30,
                                            height_pct: 20,
                                            tail_direction: "down",
                                            tail_position_pct: 50,
                                            tail_length_px: 12,
                                            bubble_config: null,
                                            text_content: "Hallo!",
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        });

        const result = await importFullBackup(fileOf(payload));

        expect(pagesCreate).toHaveBeenCalledWith(
            "new-b1",
            expect.objectContaining({
                layout: "comic_panel_grid",
                text_content: "Seitentext",
                layout_config: {grid: "2x2"},
                notes: "Notiz",
                mood_color: "#abc",
            }),
        );
        expect(createPanel).toHaveBeenCalledWith("new-b1", "np", expect.objectContaining({bounds: {x: 0}}));
        expect(createBubble).toHaveBeenCalledWith(
            "new-b1",
            "npan",
            expect.objectContaining({text_content: "Hallo!", tail_length_px: 12}),
        );
        expect(result.imported.pages).toBe(1);
        expect(result.imported.comic_panels).toBe(1);
        expect(result.imported.comic_bubbles).toBe(1);
    });

    it("re-parents story-entity links onto the new entity and page ids (#931)", async () => {
        const payload = bundle({
            books: [
                {
                    book: {id: "b1", title: "Comic", author: "A", language: "de"},
                    chapters: [],
                    pages: [
                        {
                            page: {id: "p1", book_id: "b1", position: 0, layout: "text_only"},
                            panels: [],
                        },
                    ],
                },
            ],
            story_bible: {
                entities: [{id: "e1", book_id: "b1", entity_type: "character", name: "Held"}],
                relationships: [],
                links: [
                    {id: "lnk1", entity_id: "e1", page_id: "p1", chapter_id: null, role: "lead"},
                ],
            },
        });

        const result = await importFullBackup(fileOf(payload));

        expect(createLink).toHaveBeenCalledWith(
            expect.objectContaining({entity_id: "ne", page_id: "np", role: "lead"}),
        );
        expect(result.imported.story_entity_links).toBe(1);
    });

    it("skips a link whose page did not survive the restore", async () => {
        const payload = bundle({
            books: [],
            story_bible: {
                entities: [],
                relationships: [],
                links: [{id: "lnk1", entity_id: "gone", page_id: "gone", chapter_id: null}],
            },
        });

        const result = await importFullBackup(fileOf(payload));

        expect(createLink).not.toHaveBeenCalled();
        expect(result.skipped.story_entity_links).toBe(1);
    });

    it("still accepts a v1 bundle, which carries no pages or links", async () => {
        const payload = {
            ...bundle({
                books: [
                    {
                        book: {id: "b1", title: "Prosa", author: "A", language: "de"},
                        chapters: [],
                    },
                ],
            }),
            version: 1,
        };

        const result = await importFullBackup(fileOf(payload));

        expect(result.imported.books).toBe(1);
        expect(result.imported.pages).toBe(0);
        expect(createLink).not.toHaveBeenCalled();
    });
});

describe("importFullBackup secrets (#985)", () => {
    it("does not clear a live provider key when the bundle carries none", async () => {
        const scrubbed = bundle();
        (scrubbed.data as Record<string, unknown>).settings = {
            theme: "nord",
            ai: {active_provider: "google", keys: {}, api_key: ""},
        };
        await importFullBackup(fileOf(scrubbed));
        const payload = updateApp.mock.calls[0][0] as {ai: Record<string, unknown>};
        expect(payload.ai.keys).toEqual({google: "AIza-live"});
        expect(payload.ai.api_key).toBe("AIza-live");
    });

    it("still restores a real key from a bundle taken before the scrubber", async () => {
        const old = bundle();
        (old.data as Record<string, unknown>).settings = {
            ai: {keys: {google: "AIza-from-backup"}},
        };
        await importFullBackup(fileOf(old));
        const payload = updateApp.mock.calls[0][0] as {ai: {keys: Record<string, string>}};
        expect(payload.ai.keys.google).toBe("AIza-from-backup");
    });

    it("restores everything but the AI section when the live settings cannot be read", async () => {
        getApp.mockRejectedValueOnce(new Error("storage unavailable"));
        const scrubbed = bundle();
        (scrubbed.data as Record<string, unknown>).settings = {
            theme: "nord",
            ai: {keys: {}, api_key: ""},
        };
        await importFullBackup(fileOf(scrubbed));
        const payload = updateApp.mock.calls[0][0] as Record<string, unknown>;
        expect(payload.theme).toBe("nord");
        expect(payload).not.toHaveProperty("ai");
    });
});

describe("importFullBackup base URLs (#985)", () => {
    function bundleWithBaseUrl() {
        const b = bundle();
        (b.data as Record<string, unknown>).settings = {
            theme: "nord",
            ai: {
                keys: {},
                api_key: "",
                base_url: "https://proxy.example.test/v1",
            },
        };
        return b;
    }

    it("declines on the user's behalf when nobody was asked", async () => {
        await importFullBackup(fileOf(bundleWithBaseUrl()));
        const payload = updateApp.mock.calls[0][0] as {ai: Record<string, unknown>};
        expect(payload.ai.base_url).toBe(
            "https://generativelanguage.googleapis.com/v1beta",
        );
        // Everything that is not an endpoint still restores.
        expect((payload as Record<string, unknown>).theme).toBe("nord");
    });

    it("keeps this device's endpoint when the user declines", async () => {
        const confirm = vi.fn(async () => false);
        await importFullBackup(fileOf(bundleWithBaseUrl()), confirm);
        expect(confirm).toHaveBeenCalledWith([
            {
                provider: "",
                from: "https://generativelanguage.googleapis.com/v1beta",
                to: "https://proxy.example.test/v1",
            },
        ]);
        const payload = updateApp.mock.calls[0][0] as {ai: Record<string, unknown>};
        expect(payload.ai.base_url).toBe(
            "https://generativelanguage.googleapis.com/v1beta",
        );
        expect(payload.ai.keys).toEqual({google: "AIza-live"});
    });

    it("applies the bundle's endpoint when the user accepts", async () => {
        await importFullBackup(fileOf(bundleWithBaseUrl()), async () => true);
        const payload = updateApp.mock.calls[0][0] as {ai: Record<string, unknown>};
        expect(payload.ai.base_url).toBe("https://proxy.example.test/v1");
        // The key still does not come from the bundle.
        expect(payload.ai.keys).toEqual({google: "AIza-live"});
    });

    it("does not ask when the bundle names no endpoint", async () => {
        const confirm = vi.fn(async () => true);
        const plain = bundle();
        (plain.data as Record<string, unknown>).settings = {
            theme: "nord",
            ai: {keys: {}, api_key: ""},
        };
        await importFullBackup(fileOf(plain), confirm);
        expect(confirm).not.toHaveBeenCalled();
    });

    it("does not ask for a provider this device holds no key for", async () => {
        const confirm = vi.fn(async () => true);
        getApp.mockResolvedValueOnce({
            theme: "classic",
            ai: {
                active_provider: "google",
                keys: {},
                api_key: "",
                base_url: "https://generativelanguage.googleapis.com/v1beta",
            },
        } as Awaited<ReturnType<typeof getApp>>);
        await importFullBackup(fileOf(bundleWithBaseUrl()), confirm);
        expect(confirm).not.toHaveBeenCalled();
    });
});

describe("importFullBackup — the seam-writable tables (#1008)", () => {
    const pub = (overrides: Record<string, unknown> = {}) => ({
        id: "p1",
        article_id: "ar1",
        platform: "medium",
        is_promo: false,
        status: "planned",
        platform_metadata: {title: "T", tags: ["a"]},
        content_snapshot_at_publish: null,
        scheduled_at: null,
        published_at: null,
        last_verified_at: null,
        notes: null,
        created_at: "t",
        updated_at: "t",
        ...overrides,
    });

    it("restores a publication under the NEW article id", async () => {
        await importFullBackup(fileOf(bundle({publications: [pub()]})));
        expect(pubCreate).toHaveBeenCalledTimes(1);
        const [articleId, payload] = pubCreate.mock.calls[0];
        // "ar1" is the id in the bundle; "new-ar1" is what articles.create
        // returned. Creating it under the old id would orphan the row.
        expect(articleId).toBe("new-ar1");
        expect(payload).toMatchObject({platform: "medium"});
    });

    it("re-runs mark-published so the snapshot survives", async () => {
        await importFullBackup(
            fileOf(
                bundle({
                    publications: [
                        pub({
                            status: "published",
                            published_at: "2026-01-02T00:00:00Z",
                            content_snapshot_at_publish: '{"type":"doc"}',
                        }),
                    ],
                }),
            ),
        );
        // A create always lands as "planned"; without this the restored row
        // has a null snapshot and the panel reads it as out_of_sync.
        expect(pubMarkPublished).toHaveBeenCalledWith("new-ar1", "new-pub1", {
            published_at: "2026-01-02T00:00:00Z",
        });
    });

    it("re-publishes an out_of_sync row too, rather than leaving it planned", async () => {
        await importFullBackup(
            fileOf(bundle({publications: [pub({status: "out_of_sync"})]})),
        );
        expect(pubMarkPublished).toHaveBeenCalledTimes(1);
    });

    it("skips a publication whose article did not restore", async () => {
        const result = await importFullBackup(
            fileOf(bundle({publications: [pub({article_id: "gone"})]})),
        );
        expect(pubCreate).not.toHaveBeenCalled();
        expect(result.skipped.publications).toBe(1);
    });

    it("restores the KDP state and each reviewer's accumulated fields", async () => {
        await importFullBackup(
            fileOf(
                bundle({
                    kdp_publishing_state: [
                        {
                            book_id: "b1",
                            state: {
                                id: "s1",
                                book_id: "b1",
                                royalty_plan: "70",
                                kdp_select_enrolled: true,
                                kdp_select_enrollment_date: null,
                                expanded_distribution: false,
                                prices: {US: {currency: "USD", list_price: 4.99}},
                                launch_checklist_state: {cover: "done"},
                                publication_target_date: "2026-03-01",
                                last_kdp_upload_at: null,
                                created_at: "t",
                                updated_at: "t",
                                arc_reviewers: [
                                    {
                                        id: "r1",
                                        publishing_state_id: "s1",
                                        reviewer_name: "Lena",
                                        reviewer_email: "lena@example.com",
                                        review_status: "reviewed",
                                        copy_version: "v2",
                                        review_permalink: "https://example.com/r",
                                        review_text_excerpt: "Stark.",
                                        invited_at: "t",
                                        reviewed_at: "2026-02-02T00:00:00Z",
                                        created_at: "t",
                                        updated_at: "t",
                                    },
                                ],
                            },
                        },
                    ],
                }),
            ),
        );
        expect(kdpUpsert).toHaveBeenCalledWith(
            "new-b1",
            expect.objectContaining({royalty_plan: "70", prices: {US: {currency: "USD", list_price: 4.99}}}),
        );
        expect(kdpAddReviewer).toHaveBeenCalledWith("new-b1", {
            reviewer_name: "Lena",
            reviewer_email: "lena@example.com",
        });
        // addReviewer takes only name + email, so the review itself is lost
        // without the follow-up update.
        expect(kdpUpdateReviewer).toHaveBeenCalledWith(
            "new-b1",
            "new-rev1",
            expect.objectContaining({review_status: "reviewed", copy_version: "v2"}),
        );
    });

    it("links a translation group under the new book ids", async () => {
        booksCreate
            .mockResolvedValueOnce({id: "new-b1"})
            .mockResolvedValueOnce({id: "new-b2"});
        await importFullBackup(
            fileOf(
                bundle({
                    books: [
                        {book: {id: "b1", title: "Das Muster", language: "de"}, chapters: []},
                        {book: {id: "b2", title: "The Pattern", language: "en"}, chapters: []},
                    ],
                    story_bible: {entities: [], relationships: [], links: []},
                    chapter_labels: [],
                    translation_groups: [["b1", "b2"]],
                }),
            ),
        );
        expect(translationsLink).toHaveBeenCalledWith(["new-b1", "new-b2"]);
    });

    it("skips a group whose members did not all restore", async () => {
        const result = await importFullBackup(
            fileOf(bundle({translation_groups: [["b1", "never-restored"]]})),
        );
        // Half a group would claim two books are translations of each other
        // while a third is missing - worse than no group at all.
        expect(translationsLink).not.toHaveBeenCalled();
        expect(result.skipped.translation_groups).toBe(1);
    });

    it("parses a bundle written before any of these keys existed", async () => {
        const result = await importFullBackup(fileOf(bundle()));
        expect(result.imported.publications).toBe(0);
        expect(result.imported.kdp_publishing_state).toBe(0);
        expect(result.imported.translation_groups).toBe(0);
    });
});
