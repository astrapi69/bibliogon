/**
 * DexieStorage — IStorageService backed by IndexedDB via Dexie
 * (mobile-sync Phase 3, C1).
 *
 * The offline mirror of the user-selected sync scope. Implements the
 * SAME IStorageService as ApiStorage, so `getStorage()` can return this
 * when offline and components keep calling the same methods.
 *
 * Schema design (per the Phase 3 stop-condition): the model graph is
 * stored FLAT — one table per model keyed by `id`, with FK columns
 * (`book_id`, `chapter_id`, …) as indexes. No nested objects; joins are
 * done in code (e.g. `books.get(id, includeContent)` reads the book row
 * then its chapter rows). This mirrors how SQLite holds the same graph
 * on the desktop. All 11 selectable-scope tables are declared in v1 so
 * the offline-download (C3) can populate the full graph without a Dexie
 * version bump; only books / chapters / articles have IStorageService
 * methods today (the rest gain methods as their call-sites migrate).
 *
 * Create/update write `updated_at` (ISO) on every row so the sync engine
 * (C6/C7) can compare local vs server versions. Ids are minted with
 * `crypto.randomUUID()` so an offline create has a stable key before it
 * ever reaches the server.
 *
 * Pattern adapted from adaptive-learner `frontend/src/storage/
 * dexie-storage.ts` (id-keyed rows, manual cascade on delete); the
 * schema + domains are Bibliogon's.
 */

import Dexie, { type Table } from "dexie";

import type {
  Article,
  ArticleComment,
  Asset,
  Author,
  AuthorCreate,
  AuthorUpdate,
  Book,
  BulkDeleteResponse,
  BookDetail,
  BookTypeDef,
  Chapter,
  ChapterLabel,
  ComicBubbleOut,
  ComicPanelOut,
  ContentTypeDef,
  CoverUploadResponse,
  DiscoveredPlugin,
  Page,
  StoryEntityLinkOut,
  StoryEntityOut,
  StoryEntityRelationshipResolved,
  StoryEntityTypeDef,
  WritingSession,
} from "../api/client";
import type { IStorageService } from "./types";
import {
  SEED_BOOK_TYPES,
  SEED_CONTENT_TYPES,
  SEED_I18N,
  SEED_PLUGIN_METADATA,
  SEED_SETTINGS,
  SEED_STORY_ENTITY_TYPES,
} from "./seed";

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
 *  (C3) sets; it is structurally a `Book` plus that optional marker. */
export type OfflineBookRow = Book & { offline_available?: boolean };

/** Minimal shape for the not-yet-method-backed graph tables: a primary
 *  `id` plus arbitrary columns. C3 populates these during download. */
type GraphRow = { id: string } & Record<string, unknown>;

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

class BibliogonOfflineDB extends Dexie {
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

const nowIso = (): string => new Date().toISOString();
const newId = (): string => crypto.randomUUID();
const EMPTY_DOC = '{"type":"doc","content":[]}';

// --- offline reference data (Track B) ------------------------------------

/** Constant primary key for the single-row reference blobs. */
const REF_KEY = "all";
/** Primary key for the single settings row. */
const SETTINGS_KEY = "app";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

let seedPromise: Promise<void> | null = null;

/** Populate the reference tables from the committed seed. Idempotent +
 *  non-destructive: writes only an ABSENT row, so a user-edited settings
 *  row (or a newly-added i18n language on seed regen) is never clobbered.
 *  Memoized so concurrent reads seed exactly once. */
export function ensureSeeded(): Promise<void> {
  if (!seedPromise) seedPromise = doSeed();
  return seedPromise;
}

async function doSeed(): Promise<void> {
  if (!(await offlineDb.appSettings.get(SETTINGS_KEY))) {
    await offlineDb.appSettings.put({ key: SETTINGS_KEY, data: SEED_SETTINGS });
  }
  if (!(await offlineDb.bookTypesRef.get(REF_KEY))) {
    await offlineDb.bookTypesRef.put({ key: REF_KEY, data: SEED_BOOK_TYPES });
  }
  if (!(await offlineDb.contentTypesRef.get(REF_KEY))) {
    await offlineDb.contentTypesRef.put({
      key: REF_KEY,
      data: SEED_CONTENT_TYPES,
    });
  }
  if (!(await offlineDb.storyEntityTypesRef.get(REF_KEY))) {
    await offlineDb.storyEntityTypesRef.put({
      key: REF_KEY,
      data: SEED_STORY_ENTITY_TYPES,
    });
  }
  if (!(await offlineDb.pluginMetaRef.get(REF_KEY))) {
    await offlineDb.pluginMetaRef.put({
      key: REF_KEY,
      data: SEED_PLUGIN_METADATA,
    });
  }
  for (const [lang, catalog] of Object.entries(SEED_I18N)) {
    if (!(await offlineDb.i18nCatalogs.get(lang))) {
      await offlineDb.i18nCatalogs.put({ lang, catalog });
    }
  }
}

function buildBook(
  data: import("../api/client").BookCreate,
  id: string,
): OfflineBookRow {
  const ts = nowIso();
  return {
    id,
    book_type: data.book_type ?? "prose",
    status: data.status ?? "draft",
    title: data.title,
    subtitle: data.subtitle ?? null,
    author: data.author ?? null,
    language: data.language ?? "de",
    genre: data.genre ?? null,
    series: data.series ?? null,
    series_index: data.series_index ?? null,
    description: data.description ?? null,
    book_idea: null,
    expose: null,
    edition: null,
    publisher: null,
    publisher_city: null,
    publish_date: null,
    isbn_ebook: null,
    isbn_paperback: null,
    isbn_hardcover: null,
    asin_ebook: null,
    asin_paperback: null,
    asin_hardcover: null,
    keywords: [],
    categories: [],
    bisac_codes: [],
    html_description: null,
    backpage_description: null,
    backpage_author_bio: null,
    cover_image: null,
    custom_css: null,
    repository_url: null,
    ai_assisted: false,
    ai_tokens_used: 0,
    tts_engine: null,
    tts_voice: null,
    tts_language: null,
    tts_speed: null,
    audiobook_merge: null,
    audiobook_filename: null,
    audiobook_overwrite_existing: false,
    audiobook_skip_chapter_types: [],
    created_at: ts,
    updated_at: ts,
  };
}

function buildArticle(
  data: import("../api/client").ArticleCreate,
  id: string,
): Article {
  const ts = nowIso();
  return {
    id,
    title: data.title,
    subtitle: data.subtitle ?? null,
    author: data.author ?? null,
    language: data.language ?? "de",
    content_type: data.content_type ?? "blogpost",
    // Match the ArticleOut API shape exactly: the Pydantic decoder always
    // populates these (metadata -> {}, comments_count -> 0,
    // original_published_at -> null for a native article with no
    // publications). Leaving them undefined offline diverges from the
    // online shape and is the kind of gap that surfaces as a downstream
    // render crash, so seed the same defaults the backend would.
    article_metadata: data.article_metadata ?? {},
    content_json: EMPTY_DOC,
    status: "draft",
    canonical_url: null,
    featured_image_url: null,
    excerpt: null,
    tags: [],
    topic: null,
    seo_title: null,
    seo_description: null,
    series: null,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
    original_published_at: null,
    comments_count: 0,
  };
}

/** Client-side slug from a name (lowercase, hyphenated, diacritics folded),
 *  mirroring the server's slug shape closely enough for offline use. Empty
 *  input falls back to "author". */
function slugify(name: string): string {
  const folded = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return folded || "author";
}

function buildAuthor(data: AuthorCreate, id: string): Author {
  const ts = nowIso();
  return {
    id,
    name: data.name,
    slug: slugify(data.name),
    bio: data.bio ?? null,
    created_at: ts,
    updated_at: ts,
  };
}

function buildStoryEntity(
  bookId: string,
  data: import("../api/client").StoryEntityCreate,
  id: string,
  position: number,
): StoryEntityOut {
  const ts = nowIso();
  return {
    id,
    book_id: bookId,
    entity_type: data.entity_type,
    name: data.name,
    description: data.description ?? null,
    entity_metadata: data.entity_metadata ?? {},
    image_asset_id: data.image_asset_id ?? null,
    position,
    relationships: data.relationships ?? [],
    created_at: ts,
    updated_at: ts,
  };
}

function buildPage(
  bookId: string,
  data: import("../api/client").PageCreate,
  id: string,
  position: number,
): Page {
  const ts = nowIso();
  return {
    id,
    book_id: bookId,
    position,
    layout: data.layout,
    text_content: data.text_content ?? null,
    image_asset_id: data.image_asset_id ?? null,
    layout_config: data.layout_config ?? null,
    notes: data.notes ?? null,
    story_beat: data.story_beat ?? null,
    mood_color: data.mood_color ?? null,
    act_group: data.act_group ?? null,
    created_at: ts,
    updated_at: ts,
  };
}

function notFound(kind: string, id: string): never {
  throw new Error(`${kind} not available offline: ${id}`);
}

export const dexieStorage: IStorageService = {
  mode: "dexie",

  books: {
    list: async () => offlineDb.books.toArray(),

    get: async (id, includeContent = false) => {
      const book = await offlineDb.books.get(id);
      if (!book) notFound("Book", id);
      // Match the API contract: the chapter LIST (titles/positions) is
      // always present; only the heavy `content` is stripped when
      // includeContent is false (BookEditor loads it per-chapter).
      const chapters = (
        await offlineDb.chapters.where("book_id").equals(id).toArray()
      )
        .sort((a, b) => a.position - b.position)
        .map((c) => (includeContent ? c : { ...c, content: "" }));
      const detail: BookDetail = { ...book, chapters };
      return detail;
    },

    create: async (data) => {
      const row = buildBook(data, newId());
      await offlineDb.books.add(row);
      return row;
    },

    update: async (id, data) => {
      const existing = await offlineDb.books.get(id);
      if (!existing) notFound("Book", id);
      const merged: OfflineBookRow = {
        ...existing,
        ...data,
        id,
        updated_at: nowIso(),
      };
      await offlineDb.books.put(merged);
      return merged;
    },

    delete: async (id) => {
      // Manual cascade — IndexedDB has no foreign keys.
      await offlineDb.transaction(
        "rw",
        [
          offlineDb.books,
          offlineDb.chapters,
          offlineDb.pages,
          offlineDb.chapterLabels,
          offlineDb.writingSessions,
          offlineDb.storyEntities,
          offlineDb.assets,
        ],
        async () => {
          await offlineDb.books.delete(id);
          await offlineDb.chapters.where("book_id").equals(id).delete();
          await offlineDb.pages.where("book_id").equals(id).delete();
          await offlineDb.chapterLabels.where("book_id").equals(id).delete();
          await offlineDb.writingSessions.where("book_id").equals(id).delete();
          await offlineDb.storyEntities.where("book_id").equals(id).delete();
          await offlineDb.assets.where("bookId").equals(id).delete();
        },
      );
    },
  },

  chapters: {
    list: async (bookId) =>
      (await offlineDb.chapters.where("book_id").equals(bookId).toArray()).sort(
        (a, b) => a.position - b.position,
      ),

    get: async (bookId, chapterId) => {
      const chapter = await offlineDb.chapters.get(chapterId);
      if (!chapter || chapter.book_id !== bookId)
        notFound("Chapter", chapterId);
      return chapter;
    },

    create: async (bookId, data) => {
      const ts = nowIso();
      const count = await offlineDb.chapters
        .where("book_id")
        .equals(bookId)
        .count();
      const chapter: Chapter = {
        id: newId(),
        book_id: bookId,
        title: data.title,
        content: data.content ?? EMPTY_DOC,
        position: data.position ?? count,
        chapter_type: data.chapter_type ?? "chapter",
        created_at: ts,
        updated_at: ts,
        version: 0,
      };
      await offlineDb.chapters.add(chapter);
      return chapter;
    },

    update: async (bookId, chapterId, data) => {
      const existing = await offlineDb.chapters.get(chapterId);
      if (!existing || existing.book_id !== bookId)
        notFound("Chapter", chapterId);
      const merged: Chapter = {
        ...existing,
        ...data,
        id: chapterId,
        book_id: bookId,
        version: existing.version + 1,
        updated_at: nowIso(),
      };
      await offlineDb.chapters.put(merged);
      return merged;
    },

    delete: async (bookId, chapterId) => {
      await offlineDb.chapters.delete(chapterId);
    },

    reorder: async (bookId, chapterIds) => {
      await offlineDb.transaction("rw", offlineDb.chapters, async () => {
        for (let i = 0; i < chapterIds.length; i++) {
          await offlineDb.chapters.update(chapterIds[i], { position: i });
        }
      });
      return (
        await offlineDb.chapters.where("book_id").equals(bookId).toArray()
      ).sort((a, b) => a.position - b.position);
    },
  },

  articles: {
    list: async (status) => {
      const all = await offlineDb.articles.toArray();
      const filtered = status ? all.filter((a) => a.status === status) : all;
      return filtered.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    },

    get: async (id) => {
      const article = await offlineDb.articles.get(id);
      if (!article) notFound("Article", id);
      return article;
    },

    create: async (data) => {
      const row = buildArticle(data, newId());
      await offlineDb.articles.add(row);
      return row;
    },

    update: async (id, data) => {
      const existing = await offlineDb.articles.get(id);
      if (!existing) notFound("Article", id);
      const merged: Article = {
        ...existing,
        ...data,
        id,
        updated_at: nowIso(),
      };
      await offlineDb.articles.put(merged);
      return merged;
    },

    delete: async (id) => {
      await offlineDb.articles.delete(id);
    },
  },

  settings: {
    getApp: async () => {
      await ensureSeeded();
      const row = await offlineDb.appSettings.get(SETTINGS_KEY);
      return (row?.data ?? SEED_SETTINGS) as Record<string, unknown>;
    },

    /**
     * Apply a settings patch with a shallow per-section merge, mirroring the
     * backend PATCH semantics (`current.setdefault(section, {}).update(...)`):
     * object sections merge key-by-key, scalars replace.
     */
    updateApp: async (patch) => {
      await ensureSeeded();
      const row = await offlineDb.appSettings.get(SETTINGS_KEY);
      const current = (row?.data ?? SEED_SETTINGS) as Record<string, unknown>;
      const merged: Record<string, unknown> = { ...current };
      for (const [key, value] of Object.entries(patch)) {
        const prev = merged[key];
        merged[key] =
          isPlainObject(prev) && isPlainObject(value)
            ? { ...prev, ...value }
            : value;
      }
      await offlineDb.appSettings.put({ key: SETTINGS_KEY, data: merged });
      return merged;
    },

    discoveredPlugins: async () => {
      await ensureSeeded();
      const row = await offlineDb.pluginMetaRef.get(REF_KEY);
      return row?.data ?? SEED_PLUGIN_METADATA;
    },
  },

  i18n: {
    get: async (lang: string) => {
      await ensureSeeded();
      const row = await offlineDb.i18nCatalogs.get(lang);
      if (row) return row.catalog;
      const fallback = await offlineDb.i18nCatalogs.get("en");
      return fallback?.catalog ?? {};
    },
  },

  bookTypes: {
    list: async () => {
      await ensureSeeded();
      const row = await offlineDb.bookTypesRef.get(REF_KEY);
      return row?.data ?? SEED_BOOK_TYPES;
    },
  },

  contentTypes: {
    list: async () => {
      await ensureSeeded();
      const row = await offlineDb.contentTypesRef.get(REF_KEY);
      return row?.data ?? SEED_CONTENT_TYPES;
    },
  },

  writingSessions: {
    /**
     * Writing history is server-computed; offline it returns empty so the
     * writing-history page renders its empty state.
     */
    list: async (_days = 30) => {
      void _days;
      return [] as WritingSession[];
    },
  },

  authors: {
    list: async ({ search, limit = 200 } = {}) => {
      let rows = await offlineDb.authors.toArray();
      if (search?.trim()) {
        const query = search.trim().toLowerCase();
        rows = rows.filter((author) => author.name.toLowerCase().includes(query));
      }
      rows.sort((left, right) => left.name.localeCompare(right.name));
      return rows.slice(0, limit);
    },
    get: async (id) => {
      const row = await offlineDb.authors.get(id);
      if (!row) notFound("Author", id);
      return row;
    },
    create: async (data: AuthorCreate) => {
      const row = buildAuthor(data, newId());
      await offlineDb.authors.add(row);
      return row;
    },
    update: async (id, data: AuthorUpdate) => {
      const existing = await offlineDb.authors.get(id);
      if (!existing) notFound("Author", id);
      const merged: Author = { ...existing, ...data, id, updated_at: nowIso() };
      await offlineDb.authors.put(merged);
      return merged;
    },
    delete: async (id) => {
      await offlineDb.authors.delete(id);
    },
  },

  // Publishing surfaces are backend-only: offline these reads return the
  // empty defaults the editor expects (no publications, no platform
  // schemas) so opening an article offline never fires a doomed `/api`
  // request. The publish MUTATIONS are not seam-routed (they push to
  // external platforms via the desktop backend).
  publications: {
    list: async () => [],
  },

  articlePlatforms: {
    list: async () => ({}),
  },

  // AI / grammar / audiobook / ms-tools are backend plugins. Offline the
  // probe returns an empty map, so every editor plugin reads as
  // unavailable (the toolbar already degrades gracefully on that shape).
  editorPluginStatus: {
    get: async () => ({}),
  },

  chapterLabels: {
    list: async (bookId) => {
      const rows = await offlineDb.chapterLabels
        .where("book_id")
        .equals(bookId)
        .toArray();
      return (rows as unknown as ChapterLabel[]).sort(
        (a, b) => a.position - b.position,
      );
    },
    create: async (bookId, data) => {
      const position = await offlineDb.chapterLabels
        .where("book_id")
        .equals(bookId)
        .count();
      const row: ChapterLabel = {
        id: newId(),
        book_id: bookId,
        name: data.name,
        color: data.color,
        position,
      };
      await offlineDb.chapterLabels.add(row as unknown as GraphRow);
      return row;
    },
    update: async (_bookId, labelId, data) => {
      const existing = await offlineDb.chapterLabels.get(labelId);
      if (!existing) notFound("ChapterLabel", labelId);
      const merged = { ...existing, ...data } as unknown as ChapterLabel;
      await offlineDb.chapterLabels.put(merged as unknown as GraphRow);
      return merged;
    },
    remove: async (_bookId, labelId) => {
      await offlineDb.chapterLabels.delete(labelId);
    },
  },

  // Story Bible. Entity + link CRUD over the existing offline tables; the
  // entity-type registry is seeded; the text-analysis methods return empty
  // offline and exportBible is generated client-side.
  storyBible: {
    getInfo: async () => ({
      plugin: "story-bible",
      version: "offline",
      phase: "offline",
    }),

    listEntityTypes: async () => {
      await ensureSeeded();
      const row = await offlineDb.storyEntityTypesRef.get(REF_KEY);
      return row?.data ?? {};
    },

    listEntities: async (bookId, entityType, search) => {
      let rows = (await offlineDb.storyEntities
        .where("book_id")
        .equals(bookId)
        .toArray()) as unknown as StoryEntityOut[];
      if (entityType) rows = rows.filter((e) => e.entity_type === entityType);
      if (search?.trim()) {
        const query = search.trim().toLowerCase();
        rows = rows.filter((e) => e.name.toLowerCase().includes(query));
      }
      return rows.sort((a, b) => a.position - b.position);
    },

    createEntity: async (bookId, data) => {
      const position = await offlineDb.storyEntities
        .where("book_id")
        .equals(bookId)
        .count();
      const row = buildStoryEntity(bookId, data, newId(), position);
      await offlineDb.storyEntities.add(row as unknown as GraphRow);
      return row;
    },

    getEntity: async (entityId) => {
      const row = await offlineDb.storyEntities.get(entityId);
      if (!row) notFound("StoryEntity", entityId);
      return row as unknown as StoryEntityOut;
    },

    updateEntity: async (entityId, data) => {
      const existing = await offlineDb.storyEntities.get(entityId);
      if (!existing) notFound("StoryEntity", entityId);
      const merged = {
        ...existing,
        ...data,
        updated_at: nowIso(),
      } as unknown as StoryEntityOut;
      await offlineDb.storyEntities.put(merged as unknown as GraphRow);
      return merged;
    },

    deleteEntity: async (entityId) => {
      await offlineDb.storyEntities.delete(entityId);
      // Cascade the entity's links (no entity_id index -> filter scan).
      const linkIds = (await offlineDb.storyEntityPageLinks
        .filter((l) => (l as { entity_id?: string }).entity_id === entityId)
        .primaryKeys()) as string[];
      if (linkIds.length) await offlineDb.storyEntityPageLinks.bulkDelete(linkIds);
    },

    getRelationships: async (_bookId, entityId) => {
      const entity = (await offlineDb.storyEntities.get(
        entityId,
      )) as unknown as StoryEntityOut | undefined;
      if (!entity?.relationships?.length) return [];
      const resolved: StoryEntityRelationshipResolved[] = [];
      for (const rel of entity.relationships) {
        const target = (await offlineDb.storyEntities.get(
          rel.target_entity_id,
        )) as unknown as StoryEntityOut | undefined;
        if (!target) continue; // drop stale (deleted-target) relationships
        resolved.push({
          relationship_type: rel.relationship_type,
          description: rel.description ?? null,
          target,
        });
      }
      return resolved;
    },

    // Text analysis needs the backend; offline it yields nothing rather than
    // erroring, so the buttons degrade to "no proposals" / "no warnings".
    autoDetect: async () => [],
    continuityCheck: async () => [],

    appearances: async (entityId) => {
      const links = (await offlineDb.storyEntityPageLinks
        .filter((l) => (l as { entity_id?: string }).entity_id === entityId)
        .toArray()) as unknown as StoryEntityLinkOut[];
      return embedLinkEntities(links);
    },

    pageEntities: async (pageId) => {
      const links = (await offlineDb.storyEntityPageLinks
        .where("page_id")
        .equals(pageId)
        .toArray()) as unknown as StoryEntityLinkOut[];
      return embedLinkEntities(links);
    },

    createLink: async (data) => {
      const row = {
        id: newId(),
        entity_id: data.entity_id,
        page_id: data.page_id ?? null,
        chapter_id: data.chapter_id ?? null,
        role: data.role ?? null,
        notes: data.notes ?? null,
        created_at: nowIso(),
      };
      await offlineDb.storyEntityPageLinks.add(row as unknown as GraphRow);
      const entity = (await offlineDb.storyEntities.get(
        data.entity_id,
      )) as unknown as StoryEntityOut;
      return { ...row, entity } as StoryEntityLinkOut;
    },

    deleteLink: async (linkId) => {
      await offlineDb.storyEntityPageLinks.delete(linkId);
    },

    exportBible: async (bookId) => {
      const entities = (await offlineDb.storyEntities
        .where("book_id")
        .equals(bookId)
        .toArray()) as unknown as StoryEntityOut[];
      return {
        filename: `story-bible-${bookId}.md`,
        content: storyBibleToMarkdown(entities),
        format: "markdown",
      };
    },
  },

  // Picture-book pages over the existing pages table.
  pages: {
    list: async (bookId) => {
      const rows = (await offlineDb.pages
        .where("book_id")
        .equals(bookId)
        .toArray()) as unknown as Page[];
      return rows.sort((a, b) => a.position - b.position);
    },
    create: async (bookId, data) => {
      const position = await offlineDb.pages
        .where("book_id")
        .equals(bookId)
        .count();
      const row = buildPage(bookId, data, newId(), position);
      await offlineDb.pages.add(row as unknown as GraphRow);
      return row;
    },
    update: async (_bookId, pageId, data) => {
      const existing = await offlineDb.pages.get(pageId);
      if (!existing) notFound("Page", pageId);
      const merged = {
        ...existing,
        ...data,
        updated_at: nowIso(),
      } as unknown as Page;
      await offlineDb.pages.put(merged as unknown as GraphRow);
      return merged;
    },
    delete: async (_bookId, pageId) => {
      // Cascade the page's comic panels + their bubbles.
      const panelIds = (await offlineDb.comicPanels
        .where("page_id")
        .equals(pageId)
        .primaryKeys()) as string[];
      if (panelIds.length) {
        const bubbleIds = (await offlineDb.comicBubbles
          .filter((b) => panelIds.includes((b as { panel_id?: string }).panel_id ?? ""))
          .primaryKeys()) as string[];
        if (bubbleIds.length) await offlineDb.comicBubbles.bulkDelete(bubbleIds);
        await offlineDb.comicPanels.bulkDelete(panelIds);
      }
      await offlineDb.pages.delete(pageId);
    },
    reorder: async (bookId, pageIds) => {
      await Promise.all(
        pageIds.map((id, index) =>
          offlineDb.pages.update(id, { position: index } as Partial<GraphRow>),
        ),
      );
      const rows = (await offlineDb.pages
        .where("book_id")
        .equals(bookId)
        .toArray()) as unknown as Page[];
      return rows.sort((a, b) => a.position - b.position);
    },
  },

  // Comic panels + speech bubbles over the existing comicPanels /
  // comicBubbles tables.
  comics: {
    getInfo: async () => ({
      name: "comics",
      version: "offline",
      session: 0,
      status: "offline",
      description: "offline",
    }),
    listPanels: async (_bookId, pageId) => {
      const rows = (await offlineDb.comicPanels
        .where("page_id")
        .equals(pageId)
        .toArray()) as unknown as ComicPanelOut[];
      return rows.sort((a, b) => a.position - b.position);
    },
    createPanel: async (_bookId, pageId, data) => {
      const position = await offlineDb.comicPanels
        .where("page_id")
        .equals(pageId)
        .count();
      const ts = nowIso();
      const row: ComicPanelOut = {
        id: newId(),
        page_id: pageId,
        position,
        image_asset_id: data.image_asset_id ?? null,
        bounds: data.bounds,
        panel_config: data.panel_config ?? null,
        created_at: ts,
        updated_at: ts,
      };
      await offlineDb.comicPanels.add(row as unknown as GraphRow);
      return row;
    },
    updatePanel: async (_bookId, panelId, data) => {
      const existing = await offlineDb.comicPanels.get(panelId);
      if (!existing) notFound("ComicPanel", panelId);
      const merged = {
        ...existing,
        ...data,
        updated_at: nowIso(),
      } as unknown as ComicPanelOut;
      await offlineDb.comicPanels.put(merged as unknown as GraphRow);
      return merged;
    },
    deletePanel: async (_bookId, panelId) => {
      const bubbleIds = (await offlineDb.comicBubbles
        .where("panel_id")
        .equals(panelId)
        .primaryKeys()) as string[];
      if (bubbleIds.length) await offlineDb.comicBubbles.bulkDelete(bubbleIds);
      await offlineDb.comicPanels.delete(panelId);
    },
    reorderPanels: async (_bookId, pageId, panelIds) => {
      await Promise.all(
        panelIds.map((id, index) =>
          offlineDb.comicPanels.update(id, {
            position: index,
          } as Partial<GraphRow>),
        ),
      );
      const rows = (await offlineDb.comicPanels
        .where("page_id")
        .equals(pageId)
        .toArray()) as unknown as ComicPanelOut[];
      return rows.sort((a, b) => a.position - b.position);
    },
    listBubbles: async (_bookId, panelId) => {
      const rows = (await offlineDb.comicBubbles
        .where("panel_id")
        .equals(panelId)
        .toArray()) as unknown as ComicBubbleOut[];
      return rows.sort((a, b) => a.position - b.position);
    },
    createBubble: async (_bookId, panelId, data) => {
      const position = await offlineDb.comicBubbles
        .where("panel_id")
        .equals(panelId)
        .count();
      const ts = nowIso();
      const row: ComicBubbleOut = {
        id: newId(),
        panel_id: panelId,
        position,
        bubble_type: data.bubble_type,
        anchor: data.anchor,
        width_pct: data.width_pct ?? 30,
        height_pct: data.height_pct ?? 20,
        tail_direction: data.tail_direction ?? "none",
        tail_position_pct: data.tail_position_pct ?? 50,
        tail_length_px: data.tail_length_px ?? 16,
        bubble_config: data.bubble_config ?? null,
        text_content: data.text_content ?? null,
        created_at: ts,
        updated_at: ts,
      };
      await offlineDb.comicBubbles.add(row as unknown as GraphRow);
      return row;
    },
    updateBubble: async (_bookId, bubbleId, data) => {
      const existing = await offlineDb.comicBubbles.get(bubbleId);
      if (!existing) notFound("ComicBubble", bubbleId);
      const merged = {
        ...existing,
        ...data,
        updated_at: nowIso(),
      } as unknown as ComicBubbleOut;
      await offlineDb.comicBubbles.put(merged as unknown as GraphRow);
      return merged;
    },
    deleteBubble: async (_bookId, bubbleId) => {
      await offlineDb.comicBubbles.delete(bubbleId);
    },
  },

  assets: {
    list: async (bookId) => {
      await ensureSeeded();
      const rows = await offlineDb.assets
        .where("bookId")
        .equals(bookId)
        .toArray();
      return rows.map(assetRowToMeta);
    },
    upload: async (bookId, file, assetType) => {
      const row = await storeAssetBlob(
        bookId,
        sanitizeAssetName(file.name),
        file,
        file.type || "application/octet-stream",
        assetType,
      );
      return assetRowToMeta(row);
    },
    delete: async (_bookId, assetId) => {
      await ensureSeeded();
      await offlineDb.assets.delete(assetId);
    },
    getBlob: async (bookId, filename) => {
      await ensureSeeded();
      const row = await offlineDb.assets
        .where("[bookId+filename]")
        .equals([bookId, filename])
        .first();
      return row ? new Blob([row.data], { type: row.mimeType }) : null;
    },
    cacheBlob: async (bookId, filename, blob, assetType = "figure") => {
      await storeAssetBlob(
        bookId,
        filename,
        blob,
        blob.type || "application/octet-stream",
        assetType,
      );
    },
  },

  covers: {
    upload: async (bookId, file) => {
      const extension = (file.name.split(".").pop() || "png").toLowerCase();
      const filename = `cover-${bookId}.${extension}`;
      await storeAssetBlob(
        bookId,
        filename,
        file,
        file.type || `image/${extension}`,
        "cover",
      );
      const dims = await imageDimensions(file);
      const response: CoverUploadResponse = {
        cover_image: `assets/covers/${filename}`,
        filename,
        width: dims.width,
        height: dims.height,
        aspect_ratio: dims.width ? Number((dims.height / dims.width).toFixed(4)) : 0,
        size_bytes: file.size,
      };
      return response;
    },
    delete: async (bookId) => {
      const ids = (await offlineDb.assets
        .where("bookId")
        .equals(bookId)
        .filter((row) => row.assetType === "cover")
        .primaryKeys()) as string[];
      if (ids.length) await offlineDb.assets.bulkDelete(ids);
    },
  },

  comments: {
    list: async (params = {}) => {
      let rows = (await offlineDb.articleComments.toArray()).filter(
        (c) => !c.deleted_at,
      );
      if (params.importedFrom) {
        rows = rows.filter((c) => c.imported_from === params.importedFrom);
      }
      if (params.orphansOnly) {
        rows = rows.filter((c) => !c.responds_to_article_id);
      }
      rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
      return rows.slice(0, params.limit ?? 100).map(stripDeletedAt);
    },
    delete: async (id) => {
      // Soft-delete: move to trash (deleted_at set). Idempotent.
      await offlineDb.articleComments.update(id, { deleted_at: nowIso() });
    },
    reclassifyAsArticle: async (id) => {
      const comment = await offlineDb.articleComments.get(id);
      if (!comment) notFound("Comment", id);
      const title =
        comment.body_text.length > 200
          ? comment.body_text.slice(0, 200) + "..."
          : comment.body_text || "(untitled)";
      const article = await dexieStorage.articles.create({
        title,
        author: comment.author,
        language: comment.language,
        content_type: "blogpost",
      });
      await dexieStorage.articles.update(article.id, {
        content_json: comment.body_json ?? commentTextToDoc(comment.body_text),
        canonical_url: comment.canonical_url,
        status: "draft",
      });
      await offlineDb.articleComments.delete(id);
      return {
        success: true,
        article_id: article.id,
        deleted_comment_id: id,
      };
    },
    bulkDelete: async (ids, permanent) => {
      if (permanent) {
        await offlineDb.articleComments.bulkDelete(ids);
      } else {
        await Promise.all(
          ids.map((id) =>
            offlineDb.articleComments.update(id, { deleted_at: nowIso() }),
          ),
        );
      }
      const response: BulkDeleteResponse = {
        deleted_count: ids.length,
        skipped_already_trashed: [],
        failed: [],
      };
      return response;
    },
    listTrashed: async () => {
      const rows = (await offlineDb.articleComments.toArray()).filter(
        (c) => !!c.deleted_at,
      );
      rows.sort((a, b) => (b.deleted_at ?? "").localeCompare(a.deleted_at ?? ""));
      return rows.map(stripDeletedAt);
    },
    restore: async (id) => {
      await offlineDb.articleComments.update(id, { deleted_at: null });
      const row = await offlineDb.articleComments.get(id);
      if (!row) notFound("Comment", id);
      return stripDeletedAt(row);
    },
    permanentDelete: async (id) => {
      await offlineDb.articleComments.delete(id);
    },
    emptyTrash: async () => {
      const ids = (await offlineDb.articleComments
        .toArray()
        .then((rows) => rows.filter((c) => !!c.deleted_at).map((c) => c.id)));
      if (ids.length) await offlineDb.articleComments.bulkDelete(ids);
    },
    bulkRestore: async (ids) => {
      await Promise.all(
        ids.map((id) =>
          offlineDb.articleComments.update(id, { deleted_at: null }),
        ),
      );
      return { restored_count: ids.length, skipped_not_in_trash: [], failed: [] };
    },
    create: async (comment) => {
      const row: CommentRow = { ...comment, deleted_at: null };
      await offlineDb.articleComments.put(row);
      return stripDeletedAt(row);
    },
  },
};

/** Drop the offline-only `deleted_at` so the returned shape matches the API
 *  `ArticleComment` exactly. */
function stripDeletedAt(row: CommentRow): ArticleComment {
  const { deleted_at: _deleted_at, ...comment } = row;
  return comment;
}

/** Wrap a comment's plain body text in a minimal TipTap doc (used when a
 *  reclassified comment has no `body_json`). */
function commentTextToDoc(text: string): string {
  return JSON.stringify({
    type: "doc",
    content: text
      ? [{ type: "paragraph", content: [{ type: "text", text }] }]
      : [],
  });
}

/** Map an IndexedDB asset row to the API `Asset` shape components expect
 *  (the server-only `path` is irrelevant offline). */
function assetRowToMeta(row: AssetRow): Asset {
  return {
    id: row.id,
    book_id: row.bookId,
    filename: row.filename,
    asset_type: row.assetType,
    path: "",
    uploaded_at: row.createdAt,
  };
}

/** Reduce a client filename to a safe basename, mirroring the backend's
 *  `safe_upload_filename` so the offline-minted URL stays stable. */
function sanitizeAssetName(name: string): string {
  const base = name.split(/[\\/]/).pop() || "asset";
  return base.replace(/[^A-Za-z0-9._-]/g, "_") || "asset";
}

/** Best-effort intrinsic dimensions of an image blob (0 when the env has
 *  no `createImageBitmap`, e.g. happy-dom). */
async function imageDimensions(
  blob: Blob,
): Promise<{ width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(blob);
    const dims = { width: bitmap.width, height: bitmap.height };
    bitmap.close?.();
    return dims;
  } catch {
    return { width: 0, height: 0 };
  }
}

/** Upsert an asset blob keyed by (bookId, filename). Mirrors the backend's
 *  overwrite-by-filename: any existing row for the same pair is dropped
 *  first, so a re-upload replaces rather than duplicates. Exported so the
 *  offline-download byte-fetch + the lazy online cache reuse it. */
export async function storeAssetBlob(
  bookId: string,
  filename: string,
  blob: Blob,
  mimeType: string,
  assetType: string,
  id?: string,
): Promise<AssetRow> {
  await ensureSeeded();
  const data = await blobToArrayBuffer(blob);
  const existing = (await offlineDb.assets
    .where("[bookId+filename]")
    .equals([bookId, filename])
    .primaryKeys()) as string[];
  if (existing.length) await offlineDb.assets.bulkDelete(existing);
  const row: AssetRow = {
    // The offline-download byte-fetch passes the SERVER asset id so the
    // id-served picture-book / collage URLs (`/assets/{id}/file`) resolve;
    // fresh uploads mint a uuid.
    id: id ?? newId(),
    bookId,
    filename,
    mimeType,
    assetType,
    data,
    createdAt: nowIso(),
  };
  await offlineDb.assets.put(row);
  return row;
}

/** Whether a (bookId, filename) asset blob is already cached. Lets the lazy
 *  online-view cache skip a redundant re-download. */
export async function hasAssetBlob(
  bookId: string,
  filename: string,
): Promise<boolean> {
  const count = await offlineDb.assets
    .where("[bookId+filename]")
    .equals([bookId, filename])
    .count();
  return count > 0;
}

/** Read a Blob/File into an ArrayBuffer, with a FileReader fallback for
 *  environments whose Blob lacks `.arrayBuffer()`. */
async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/** Attach each link's full entity (skipping links whose entity was deleted),
 *  matching the API's embedded-entity link shape. */
async function embedLinkEntities(
  links: StoryEntityLinkOut[],
): Promise<StoryEntityLinkOut[]> {
  const out: StoryEntityLinkOut[] = [];
  for (const link of links) {
    const entity = (await offlineDb.storyEntities.get(
      link.entity_id,
    )) as unknown as StoryEntityOut | undefined;
    if (entity) out.push({ ...link, entity });
  }
  return out;
}

/** Render a book's story entities as Markdown, grouped by entity type, for
 *  the offline Story-Bible export (mirrors the backend C12 export shape). */
function storyBibleToMarkdown(entities: StoryEntityOut[]): string {
  if (!entities.length) return "# Story Bible\n\n(empty)\n";
  const byType = new Map<string, StoryEntityOut[]>();
  for (const entity of entities) {
    const list = byType.get(entity.entity_type) ?? [];
    list.push(entity);
    byType.set(entity.entity_type, list);
  }
  const lines: string[] = ["# Story Bible", ""];
  for (const [type, list] of byType) {
    lines.push(`## ${type}`, "");
    for (const entity of list.sort((a, b) => a.position - b.position)) {
      lines.push(`### ${entity.name}`, "");
      if (entity.description?.trim()) lines.push(entity.description.trim(), "");
    }
  }
  return lines.join("\n").trim() + "\n";
}

// --- offline-download support (C3) ---------------------------------------

/** The full book graph as returned by GET /api/books/{id}/full. */
type BookGraph = {
  book: Book;
  chapters: Chapter[];
  pages: Array<Record<string, unknown>>;
  comic_panels: Array<Record<string, unknown>>;
  comic_bubbles: Array<Record<string, unknown>>;
  story_entities: Array<Record<string, unknown>>;
  story_entity_page_links: Array<Record<string, unknown>>;
  chapter_labels: Array<Record<string, unknown>>;
  assets: Array<Record<string, unknown>>;
};

// The graph child rows carry a string `id` at runtime; the wire type is
// the looser Record<string, unknown>, so cast once at the boundary.
const asGraphRows = (rows: Array<Record<string, unknown>>): GraphRow[] =>
  rows as unknown as GraphRow[];

/** Write a complete book graph into IndexedDB and flag the book
 *  offline-available. Idempotent (bulkPut overwrites). */
export async function ingestBookGraph(graph: BookGraph): Promise<void> {
  await offlineDb.transaction("rw", offlineDb.tables, async () => {
    await offlineDb.books.put({ ...graph.book, offline_available: true });
    await offlineDb.chapters.bulkPut(graph.chapters);
    await offlineDb.pages.bulkPut(asGraphRows(graph.pages));
    await offlineDb.comicPanels.bulkPut(asGraphRows(graph.comic_panels));
    await offlineDb.comicBubbles.bulkPut(asGraphRows(graph.comic_bubbles));
    await offlineDb.storyEntities.bulkPut(asGraphRows(graph.story_entities));
    await offlineDb.storyEntityPageLinks.bulkPut(
      asGraphRows(graph.story_entity_page_links),
    );
    await offlineDb.chapterLabels.bulkPut(asGraphRows(graph.chapter_labels));
    // Conflict baselines: the server version each record was downloaded
    // at, so the sync engine (C7) can detect a desktop-side edit.
    await offlineDb.syncBaselines.bulkPut([
      { id: `book:${graph.book.id}`, updated_at: graph.book.updated_at },
      ...graph.chapters.map((c) => ({
        id: `chapter:${c.id}`,
        updated_at: c.updated_at,
      })),
    ]);
  });
}

/** Drop a book + its whole offline graph from IndexedDB. */
export async function removeBookGraph(bookId: string): Promise<void> {
  await offlineDb.transaction("rw", offlineDb.tables, async () => {
    const pageIds = (await offlineDb.pages
      .where("book_id")
      .equals(bookId)
      .primaryKeys()) as string[];
    const panelIds =
      pageIds.length > 0
        ? ((await offlineDb.comicPanels
            .where("page_id")
            .anyOf(pageIds)
            .primaryKeys()) as string[])
        : [];
    await offlineDb.books.delete(bookId);
    await offlineDb.chapters.where("book_id").equals(bookId).delete();
    await offlineDb.pages.where("book_id").equals(bookId).delete();
    await offlineDb.storyEntities.where("book_id").equals(bookId).delete();
    await offlineDb.chapterLabels.where("book_id").equals(bookId).delete();
    await offlineDb.assets.where("bookId").equals(bookId).delete();
    if (pageIds.length > 0) {
      await offlineDb.storyEntityPageLinks
        .where("page_id")
        .anyOf(pageIds)
        .delete();
    }
    if (panelIds.length > 0) {
      await offlineDb.comicPanels.where("page_id").anyOf(pageIds).delete();
      await offlineDb.comicBubbles.where("panel_id").anyOf(panelIds).delete();
    }
  });
}

/** Ids of books currently available offline. */
export async function listOfflineBookIds(): Promise<string[]> {
  const rows = await offlineDb.books.toArray();
  return rows.filter((b) => b.offline_available).map((b) => b.id);
}

/** Whether a specific book is available offline. */
export async function isBookOffline(bookId: string): Promise<boolean> {
  const row = await offlineDb.books.get(bookId);
  return !!row?.offline_available;
}
