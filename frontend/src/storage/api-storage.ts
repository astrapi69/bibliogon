/**
 * ApiStorage — the server-backed IStorageService (mobile-sync P2-C1).
 *
 * Delegates straight to the existing `api` client, so this is a pure
 * seam with zero behaviour change: a component calling
 * `getStorage().books.list()` hits exactly the same endpoint as
 * `api.books.list()` did. The value of the seam is that a later
 * DexieStorage can implement the same `IStorageService` and be swapped
 * in by `getStorage()` without the component changing.
 *
 * The `api.*` methods are object-literal arrow functions with no `this`
 * binding, so referencing them directly keeps the signatures identical
 * to the `typeof`-derived interface (no drift, no wrapper indirection).
 */

import { api } from "../api/client";
import { bookAssetFileUrl } from "./asset-url";
import type {
    ArticleAssetStorage,
    ArticlePlatformStorage,
    ArticleStorage,
    AssetStorage,
    AuthorStorage,
    BookStorage,
    BookTypesStorage,
    ChapterLabelStorage,
    ChapterStorage,
    CommentStorage,
    ComicsStorage,
    ContentTypesStorage,
    CoverStorage,
    EditorPluginStatusStorage,
    I18nStorage,
    IStorageService,
    PageStorage,
    PublicationStorage,
    SettingsStorage,
    StoryBibleStorage,
    WritingSessionsStorage,
    WritingStatsStorage,
} from "./types";

/**
 * The `api.*` namespaces (supersets of the storage sub-interfaces) are
 * returned via getters so the reference resolves at CALL time, not at
 * module-import time. Capturing `api.books.create` at the top level froze
 * the import and threw under partial `api/client` test mocks once this
 * module entered the dashboard import graph (via useStorageMode ->
 * connectivity). Getters keep the zero-overhead delegation while
 * deferring access - the documented "no frozen imports" fix.
 */
export const apiStorage: IStorageService = {
    mode: "api",
    get books(): BookStorage {
        return api.books;
    },
    get chapters(): ChapterStorage {
        return api.chapters;
    },
    get articles(): ArticleStorage {
        return api.articles;
    },
    get settings(): SettingsStorage {
        return api.settings;
    },
    get i18n(): I18nStorage {
        return api.i18n;
    },
    get bookTypes(): BookTypesStorage {
        return api.bookTypes;
    },
    get contentTypes(): ContentTypesStorage {
        return api.contentTypes;
    },
    get writingSessions(): WritingSessionsStorage {
        return api.writingSessions;
    },
    get writingStats(): WritingStatsStorage {
        return api.writingStats;
    },
    get authors(): AuthorStorage {
        return api.authors;
    },
    get publications(): PublicationStorage {
        return api.publications;
    },
    get articlePlatforms(): ArticlePlatformStorage {
        return api.articlePlatforms;
    },
    get editorPluginStatus(): EditorPluginStatusStorage {
        return { get: api.editorPluginStatus };
    },
    get chapterLabels(): ChapterLabelStorage {
        return api.chapterLabels;
    },
    get storyBible(): StoryBibleStorage {
        return api.storyBible;
    },
    get pages(): PageStorage {
        return api.pages;
    },
    get comics(): ComicsStorage {
        return api.comics;
    },
    get assets(): AssetStorage {
        return {
            list: api.assets.list,
            upload: api.assets.upload,
            delete: api.assets.delete,
            // Online resolution goes straight to the served file; getBlob is only
            // exercised by the lazy offline-cache path (fetch the bytes once a
            // displayed asset belongs to an offline-available book).
            getBlob: async (bookId, filename) => {
                const res = await fetch(bookAssetFileUrl(bookId, filename));
                return res.ok ? res.blob() : null;
            },
            // The server already holds the bytes in api mode; nothing to cache.
            cacheBlob: async () => {},
        };
    },
    get covers(): CoverStorage {
        return api.covers;
    },
    // #157: article featured-image blob plumbing is dexie-only. In api mode
    // uploads go through `api.articleAssets` and the resolver uses
    // `featured_image_url`, so `store`/`getBlob` are never reached here;
    // they fail loud / return null rather than silently no-op.
    get articleAssets(): ArticleAssetStorage {
        return {
            store: async () => {
                throw new Error("articleAssets.store is offline-only (dexie mode)");
            },
            getBlob: async () => null,
            deleteByArticle: async () => {},
        };
    },
    get comments(): CommentStorage {
        return {
            ...api.comments,
            // Online, comments are created server-side (the Medium importer); the
            // offline-only create has no api counterpart.
            create: async () => {
                throw new Error("comments.create is offline-only");
            },
        };
    },
};
