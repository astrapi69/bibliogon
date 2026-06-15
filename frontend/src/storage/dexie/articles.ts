/**
 * Articles namespace for DexieStorage: CRUD plus the soft-delete trash
 * lifecycle (list-trash / restore / permanent-delete / empty-trash / bulk),
 * cascading the article's cached featured-image bytes on permanent delete.
 */

import type { Article, BulkDeleteResponse, BulkRestoreResponse } from "../../api/client";
import type { IStorageService } from "../types";
import { buildArticle, newId, nowIso, notFound } from "./helpers";
import { offlineDb } from "./schema";
import { serializedUpdate } from "./serialized-update";

export const articles: IStorageService["articles"] = {
    list: async (status) => {
        const all = await offlineDb.articles.toArray();
        // Exclude soft-deleted (trashed) rows from the main list.
        const active = all.filter((a) => !a.deleted_at);
        const filtered = status ? active.filter((a) => a.status === status) : active;
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

    update: async (id, data) =>
        serializedUpdate("articles", id, async () => {
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
        }),

    delete: async (id) => {
        // Soft-delete: move to trash (deleted_at set). Cached
        // featured-image bytes are kept so a restore brings the
        // article back whole; they drop on permanent delete.
        await offlineDb.articles.update(id, { deleted_at: nowIso() });
    },

    listTrash: async () =>
        (await offlineDb.articles.toArray())
            .filter((a) => !!a.deleted_at)
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),

    restore: async (id) => {
        await offlineDb.articles.update(id, { deleted_at: null });
        const row = await offlineDb.articles.get(id);
        if (!row) notFound("Article", id);
        return row;
    },

    permanentDelete: async (id) => {
        await offlineDb.articles.delete(id);
        // #157: drop the article's cached featured-image bytes too.
        await offlineDb.articleAssets.where("articleId").equals(id).delete();
    },

    emptyTrash: async () => {
        const trashed = (await offlineDb.articles.toArray())
            .filter((a) => !!a.deleted_at)
            .map((a) => a.id);
        if (trashed.length) {
            await offlineDb.articles.bulkDelete(trashed);
            await offlineDb.articleAssets.where("articleId").anyOf(trashed).delete();
        }
    },

    bulkDelete: async (ids, permanent) => {
        if (permanent) {
            await offlineDb.articles.bulkDelete(ids);
            await offlineDb.articleAssets.where("articleId").anyOf(ids).delete();
        } else {
            const ts = nowIso();
            await Promise.all(ids.map((id) => offlineDb.articles.update(id, { deleted_at: ts })));
        }
        const response: BulkDeleteResponse = {
            deleted_count: ids.length,
            skipped_already_trashed: [],
            failed: [],
        };
        return response;
    },

    bulkRestore: async (ids) => {
        await Promise.all(ids.map((id) => offlineDb.articles.update(id, { deleted_at: null })));
        const response: BulkRestoreResponse = {
            restored_count: ids.length,
            skipped_not_in_trash: [],
            failed: [],
        };
        return response;
    },
};
