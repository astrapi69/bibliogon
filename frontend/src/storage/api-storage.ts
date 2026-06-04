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
import type { IStorageService } from "./types";

export const apiStorage: IStorageService = {
  mode: "api",
  books: {
    list: api.books.list,
    get: api.books.get,
    create: api.books.create,
    update: api.books.update,
    delete: api.books.delete,
  },
  chapters: {
    list: api.chapters.list,
    get: api.chapters.get,
    create: api.chapters.create,
    update: api.chapters.update,
    delete: api.chapters.delete,
    reorder: api.chapters.reorder,
  },
  articles: {
    list: api.articles.list,
    get: api.articles.get,
    create: api.articles.create,
    update: api.articles.update,
    delete: api.articles.delete,
  },
};
