/**
 * DexieStorage schema — the IndexedDB shape backing IStorageService
 * (mobile-sync Phase 3, C1).
 *
 * The offline mirror of the user-selected sync scope. The model graph is
 * stored FLAT — one table per model keyed by `id`, with FK columns
 * (`book_id`, `chapter_id`, …) as indexes. No nested objects; joins are
 * done in code. All selectable-scope tables are declared so the
 * offline-download (C3) can populate the full graph without a Dexie
 * version bump.
 *
 * The `this.version(N).stores({...})` chain below is migration-critical:
 * the version numbers and store strings are appended in order, never
 * reordered or renumbered, so an existing user DB upgrades cleanly.
 */

import Dexie, { type Table } from "dexie";

import type {
    Article,
    ArticleComment,
    Author,
    BookTypeDef,
    Chapter,
    ContentTypeDef,
    DiscoveredPlugin,
    StoryEntityTypeDef,
    Book,
} from "../../api/client";

/** Single-row reference blob (settings / type registries / plugin meta),
 *  keyed by a constant. Seeded on first init from the committed JSON;
 *  settings is the one the user can mutate offline. */
interface KeyedBlob<T> {
    key: string;
    data: T;
}
/** One language's i18n catalog row. */
interface I18nCatalogRow {
    lang: string;
    catalog: Record<string, unknown>;
}

/** A book row carries the offline-availability flag the Selection UI
 *  (C3) sets plus a `deleted_at` for the soft-delete / trash lifecycle
 *  (Finding 7). `Book` exposes neither column, so both are local-only
 *  extensions; `deleted_at` null means an active (non-trashed) book. */
export type OfflineBookRow = Book & {
    offline_available?: boolean;
    deleted_at?: string | null;
};

/** An article row carries a `deleted_at` for the soft-delete / trash
 *  lifecycle (mirrors {@link OfflineBookRow}); `deleted_at` null/absent
 *  means an active (non-trashed) article. */
export type OfflineArticleRow = Article & {
    deleted_at?: string | null;
};

/** Minimal shape for the not-yet-method-backed graph tables: a primary
 *  `id` plus arbitrary columns. C3 populates these during download. */
export type GraphRow = { id: string } & Record<string, unknown>;

/** A binary image asset held in IndexedDB (P3c). The metadata mirrors the
 *  API `Asset` (minus the server-side `path`); the body is stored as a raw
 *  `ArrayBuffer` (not a `Blob`) so it structured-clones losslessly through
 *  every IndexedDB implementation — the service worker reconstructs a
 *  `Response` from it and the resolver a `Blob`. Looked up BY FILENAME via
 *  the compound `[bookId+filename]` index, because the editor / cover URLs
 *  reference a `/api/books/{id}/assets/file/{filename}` path, not an id. */
export interface AssetRow {
    id: string;
    bookId: string;
    filename: string;
    mimeType: string;
    assetType: string;
    data: ArrayBuffer;
    createdAt: string;
}

/** A stored article featured-image (#157). Unlike book assets (keyed by
 *  `[bookId+filename]` because the served URLs are filename-based),
 *  article images are keyed by their generated `id` — `Article`
 *  references the bytes via `featured_image_asset_id`, and the resolver
 *  (`useArticleImageUrl`) looks the row up by that id. `data` holds the
 *  body natively as an `ArrayBuffer` (structured-clones losslessly under
 *  fake-indexeddb; a stored `Blob` would not — see lessons-learned). */
export interface ArticleAssetRow {
    id: string;
    articleId: string;
    filename: string;
    mimeType: string;
    data: ArrayBuffer;
    createdAt: string;
}

/** A per-day, per-(book, chapter) writing-progress row held offline
 *  (Finding 6). Mirrors the backend ``writing_sessions`` grain: ``day``
 *  is an ISO calendar date (``YYYY-MM-DD``), ``words_written`` is the
 *  gross words written that day (floored at 0). Recorded by the offline
 *  chapter-update path and aggregated by the writingStats reads. */
export interface WritingSessionRow {
    id: string;
    day: string;
    words_written: number;
    book_id: string | null;
    chapter_id: string | null;
}

/** An imported article comment held offline (P3 comments). The API
 *  `ArticleComment` plus a `deleted_at` for the soft-delete / trash lifecycle
 *  (the API model hides the column; the trash endpoints expose the state). */
export type CommentRow = ArticleComment & { deleted_at: string | null };

/** A queued offline mutation awaiting replay against the API on
 *  reconnect (mobile-sync P3-C5). Created by the queueing-storage
 *  wrapper on every offline write; drained by the sync engine (C6). */
export interface SyncQueueEntry {
    /** Auto-increment FIFO key (Dexie-assigned). The replay order (C6) is
     *  ascending `seq` -- a monotonic counter, unlike `created_at` whose
     *  millisecond ties would not preserve creation order. */
    seq?: number;
    id: string;
    model: "book" | "chapter" | "article";
    operation: "create" | "update" | "delete";
    entity_id: string;
    /** Parent book id for chapter ops (needed to build the API path). */
    book_id: string | null;
    /** Replay payload (the created row / the update patch); null for delete. */
    payload: Record<string, unknown> | null;
    created_at: string;
    status: "pending" | "synced" | "failed" | "conflict";
    error: string | null;
}

/** Server-version baseline captured at download (C3) so the sync engine
 *  (C7) can tell whether the desktop moved a record while the phone was
 *  offline. Keyed by ``${model}:${entityId}``. */
export interface SyncBaseline {
    id: string;
    updated_at: string;
}

/** The persisted event-recorder buffer (EVT-02). Stored as a SINGLE
 *  snapshot row (keyed by the constant {@link EVENT_LOG_KEY}) so a
 *  restore is atomic: the whole capped list is written and read back as
 *  one value. `events` holds the sanitized buffer (oldest-first, capped
 *  at 100); `updatedAt` is the ISO timestamp of the last persist. The
 *  diagnostic log survives a tab-refresh / crash so the user can still
 *  export it after the event that caused the crash. */
export interface EventLogSnapshot {
    id: string;
    events: unknown[];
    updatedAt: string;
}

class BibliogonOfflineDB extends Dexie {
    books!: Table<OfflineBookRow, string>;
    chapters!: Table<Chapter, string>;
    articles!: Table<OfflineArticleRow, string>;
    chapterVersions!: Table<GraphRow, string>;
    pages!: Table<GraphRow, string>;
    comicPanels!: Table<GraphRow, string>;
    comicBubbles!: Table<GraphRow, string>;
    storyEntities!: Table<GraphRow, string>;
    storyEntityPageLinks!: Table<GraphRow, string>;
    chapterLabels!: Table<GraphRow, string>;
    writingSessions!: Table<GraphRow, string>;
    syncQueue!: Table<SyncQueueEntry, number>;
    syncBaselines!: Table<SyncBaseline, string>;
    appSettings!: Table<KeyedBlob<Record<string, unknown>>, string>;
    i18nCatalogs!: Table<I18nCatalogRow, string>;
    bookTypesRef!: Table<KeyedBlob<Record<string, BookTypeDef>>, string>;
    contentTypesRef!: Table<KeyedBlob<Record<string, ContentTypeDef>>, string>;
    storyEntityTypesRef!: Table<KeyedBlob<Record<string, StoryEntityTypeDef>>, string>;
    pluginMetaRef!: Table<KeyedBlob<DiscoveredPlugin[]>, string>;
    authors!: Table<Author, string>;
    assets!: Table<AssetRow, string>;
    articleAssets!: Table<ArticleAssetRow, string>;
    articleComments!: Table<CommentRow, string>;
    eventLog!: Table<EventLogSnapshot, string>;

    constructor() {
        // Separate DB from the crash-recovery drafts store ("bibliogon").
        super("bibliogon-offline");
        this.version(1).stores({
            books: "id, updated_at, offline_available, status",
            chapters: "id, book_id, position, updated_at",
            articles: "id, status, updated_at",
            chapterVersions: "id, chapter_id, created_at",
            pages: "id, book_id, position",
            comicPanels: "id, page_id",
            comicBubbles: "id, panel_id",
            storyEntities: "id, book_id",
            storyEntityPageLinks: "id, page_id, chapter_id",
            chapterLabels: "id, book_id",
            writingSessions: "id, book_id, chapter_id",
        });
        // v2 (C5): the offline write queue. created_at indexes the replay
        // order; status filters pending vs synced/failed.
        this.version(2).stores({
            syncQueue: "++seq, id, status, created_at, model",
        });
        // v3 (C7): server-version baselines for conflict detection.
        this.version(3).stores({
            syncBaselines: "id",
        });
        // v4 (Track B): offline reference data. Single-row blobs keyed by a
        // constant ("app" / "all"); i18n keyed by language. Seeded lazily by
        // ensureSeeded() (idempotent, never overwrites user-edited settings).
        this.version(4).stores({
            appSettings: "key",
            i18nCatalogs: "lang",
            bookTypesRef: "key",
            contentTypesRef: "key",
            pluginMetaRef: "key",
        });
        this.version(5).stores({
            authors: "id, name, slug",
        });
        // v6 (Maximal Offline P3): the Story Bible entity-type registry,
        // seeded from story-bible-entities.yaml so the sidebar can offer the
        // per-type create options offline.
        this.version(6).stores({
            storyEntityTypesRef: "key",
        });
        // v7 (Maximal Offline P3c): binary image assets. Looked up by filename
        // (the editor/cover URLs are filename-keyed), so a compound
        // `[bookId+filename]` index backs the resolver AND the service worker's
        // raw-IndexedDB read. The `blob` field holds the file body natively.
        this.version(7).stores({
            assets: "id, bookId, filename, [bookId+filename]",
        });
        // v8 (Maximal Offline P3): imported article comments + the soft-delete /
        // trash lifecycle. Indexed by source (filter), responds_to_article_id
        // (orphan filter), deleted_at (active vs trash), created_at (ordering).
        this.version(8).stores({
            articleComments: "id, imported_from, responds_to_article_id, deleted_at, created_at",
        });
        // v9 (Finding 7): the book soft-delete / trash lifecycle. Adds
        // deleted_at to the books index so the active list and the trash
        // list can each filter on it. Existing rows have no deleted_at,
        // which reads as null (active) — Dexie indexes them as absent and
        // the in-code filters treat absent/null identically.
        this.version(9).stores({
            books: "id, updated_at, offline_available, status, deleted_at",
        });
        // v10 (#157): offline article featured-images. Keyed by the
        // generated `id` (Article.featured_image_asset_id references it);
        // `articleId` is indexed so all of an article's images can be
        // dropped on delete.
        this.version(10).stores({
            articleAssets: "id, articleId",
        });
        // v11 (EVT-02): the persisted event-recorder buffer. A single
        // snapshot row keyed by `id` (the constant EVENT_LOG_KEY) so the
        // diagnostic log survives a tab-refresh / crash.
        this.version(11).stores({
            eventLog: "id",
        });
    }
}

export const offlineDb = new BibliogonOfflineDB();

/** Record the server's current `updated_at` as the conflict baseline. */
export async function setBaseline(
    model: string,
    entityId: string,
    updatedAt: string,
): Promise<void> {
    await offlineDb.syncBaselines.put({
        id: `${model}:${entityId}`,
        updated_at: updatedAt,
    });
}

/** The baseline `updated_at` for a record, or null if none recorded. */
export async function getBaseline(model: string, entityId: string): Promise<string | null> {
    const row = await offlineDb.syncBaselines.get(`${model}:${entityId}`);
    return row?.updated_at ?? null;
}

/** Constant primary key for the single-row reference blobs. */
export const REF_KEY = "all";
/** Primary key for the single settings row. */
export const SETTINGS_KEY = "app";
/** Primary key for the single event-recorder snapshot row (EVT-02). */
export const EVENT_LOG_KEY = "current";
