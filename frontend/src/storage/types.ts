/**
 * Storage-layer types (mobile-sync Phase 2, P2-C1).
 *
 * `IStorageService` is the seam that lets a future DexieStorage
 * (offline mirror of the user-selected sync scope) slot in behind the
 * same calls the components already make, without touching every
 * component. Today only `ApiStorage` exists (delegates to the existing
 * `api` client); DexieStorage + the sync engine land in later P2 commits.
 *
 * Scope for P2-C1 is the sync-relevant CORE content CRUD of the
 * selectable domains (books + their chapters, articles). Trash / bulk /
 * AI-template methods stay on the `api` object directly and join the
 * interface only when offline genuinely needs them — no speculative
 * over-mirroring of the whole client.
 *
 * Each member is typed as `typeof api.<domain>.<method>` so the
 * interface can never drift from the real client signature: change the
 * client and the implementations fail to type-check until they match.
 *
 * Pattern adapted from adaptive-learner `frontend/src/storage/` (a
 * composed IStorageService picked by a `getStorage()` factory); the
 * DOMAINS here are Bibliogon's, not adaptive-learner's.
 */

import type { api } from "../api/client";

/** Which backend `getStorage()` resolves to. */
export type StorageMode = "api" | "dexie";

export interface BookStorage {
  list: typeof api.books.list;
  get: typeof api.books.get;
  create: typeof api.books.create;
  update: typeof api.books.update;
  delete: typeof api.books.delete;
}

export interface ChapterStorage {
  list: typeof api.chapters.list;
  get: typeof api.chapters.get;
  create: typeof api.chapters.create;
  update: typeof api.chapters.update;
  delete: typeof api.chapters.delete;
  reorder: typeof api.chapters.reorder;
}

export interface ArticleStorage {
  list: typeof api.articles.list;
  get: typeof api.articles.get;
  create: typeof api.articles.create;
  update: typeof api.articles.update;
  delete: typeof api.articles.delete;
}

/**
 * App settings + reference data (i18n catalogs, type registries, plugin
 * metadata). Backend-served in `api` mode; served from seeded Dexie tables
 * in offline mode so the backendless PWA boots with real config. The
 * `typeof api.*` typing keeps these from drifting from the real client.
 */
export interface SettingsStorage {
  getApp: typeof api.settings.getApp;
  updateApp: typeof api.settings.updateApp;
  discoveredPlugins: typeof api.settings.discoveredPlugins;
}

export interface I18nStorage {
  get: typeof api.i18n.get;
}

export interface BookTypesStorage {
  list: typeof api.bookTypes.list;
}

export interface ContentTypesStorage {
  list: typeof api.contentTypes.list;
}

export interface WritingSessionsStorage {
  list: typeof api.writingSessions.list;
}

/** The global Authors-Database. Pure CRUD, so it works offline against a
 *  Dexie table (the user can add + pick authors on the backendless PWA). */
export interface AuthorStorage {
  list: typeof api.authors.list;
  get: typeof api.authors.get;
  create: typeof api.authors.create;
  update: typeof api.authors.update;
  delete: typeof api.authors.delete;
}

/**
 * Article publications (which platforms a piece was published to). The
 * READ is seam-routed so opening the article editor offline returns an
 * empty list from Dexie instead of firing a doomed `/api` request; the
 * publish MUTATIONS stay on `api.publications.*` (they push to external
 * platforms via the backend and are genuinely desktop-only for now).
 */
export interface PublicationStorage {
  list: typeof api.publications.list;
}

/** Publishing platform schemas (reference data for the publish UI).
 *  Seam-routed read so the editor's offline load returns an empty map
 *  instead of erroring; publishing itself remains backend-only. */
export interface ArticlePlatformStorage {
  list: typeof api.articlePlatforms.list;
}

/** Editor plugin-availability probe (AI / grammar / audiobook / ms-tools).
 *  These plugins are backend-only, so the offline probe returns an empty
 *  map (everything unavailable) from Dexie without firing `/api`. */
export interface EditorPluginStatusStorage {
  get: typeof api.editorPluginStatus;
}

/** Per-book chapter labels (colour-coded workflow tags). Pure CRUD against a
 *  Dexie table, so the prose chapter-label manager / outliner / storyboard
 *  work offline. */
export interface ChapterLabelStorage {
  list: typeof api.chapterLabels.list;
  create: typeof api.chapterLabels.create;
  update: typeof api.chapterLabels.update;
  remove: typeof api.chapterLabels.remove;
}

export interface IStorageService {
  /** The backend this instance is. Lets the UI show "Current mode: …". */
  readonly mode: StorageMode;
  books: BookStorage;
  chapters: ChapterStorage;
  articles: ArticleStorage;
  settings: SettingsStorage;
  i18n: I18nStorage;
  bookTypes: BookTypesStorage;
  contentTypes: ContentTypesStorage;
  writingSessions: WritingSessionsStorage;
  authors: AuthorStorage;
  publications: PublicationStorage;
  articlePlatforms: ArticlePlatformStorage;
  editorPluginStatus: EditorPluginStatusStorage;
  chapterLabels: ChapterLabelStorage;
}
