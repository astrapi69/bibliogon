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
import type {
  ArticlePlatformStorage,
  ArticleStorage,
  AuthorStorage,
  BookStorage,
  BookTypesStorage,
  ChapterStorage,
  ContentTypesStorage,
  EditorPluginStatusStorage,
  I18nStorage,
  IStorageService,
  PublicationStorage,
  SettingsStorage,
  WritingSessionsStorage,
} from "./types";

/**
 * The `api.*` namespaces (supersets of the storage sub-interfaces) are
 * returned via getters so the reference resolves at CALL time, not at
 * module-import time. Capturing `api.books.create` at the top level froze
 * the import and threw under partial `api/client` test mocks once this
 * module entered the dashboard import graph (via useOfflineFeatureGate ->
 * useStorageMode). Getters keep the zero-overhead delegation while
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
};
