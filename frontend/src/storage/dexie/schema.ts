import Dexie, { type Table } from "dexie";
import type {
  Article,
  ArticleComment,
  Author,
  Book,
  BookTypeDef,
  Chapter,
  ContentTypeDef,
  DiscoveredPlugin,
  StoryEntityTypeDef,
} from "../../api/client";

export interface KeyedBlob<T> {
  key: string;
  data: T;
}
/** One language's i18n catalog row. */

export interface I18nCatalogRow {
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

export class BibliogonOfflineDB extends Dexie {
  books!: Table<OfflineBookRow, string>;
  chapters!: Table<Chapter, string>;
  articles!: Table<Article, string>;
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
  storyEntityTypesRef!: Table<
    KeyedBlob<Record<string, StoryEntityTypeDef>>,
    string
  >;
  pluginMetaRef!: Table<KeyedBlob<DiscoveredPlugin[]>, string>;
  authors!: Table<Author, string>;
  assets!: Table<AssetRow, string>;
  articleComments!: Table<CommentRow, string>;

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
  }
}

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

export async function getBaseline(
  model: string,
  entityId: string,
): Promise<string | null> {
  const row = await offlineDb.syncBaselines.get(`${model}:${entityId}`);
  return row?.updated_at ?? null;
}

export const offlineDb = new BibliogonOfflineDB();

export const nowIso = (): string => new Date().toISOString();

export const newId = (): string => crypto.randomUUID();

export const EMPTY_DOC = '{"type":"doc","content":[]}';

// --- offline reference data (Track B) ------------------------------------

/** Constant primary key for the single-row reference blobs. */

export const REF_KEY = "all";
/** Primary key for the single settings row. */

export const SETTINGS_KEY = "app";

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
