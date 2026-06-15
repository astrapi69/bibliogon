/**
 * Comments namespace for DexieStorage: imported article comments with the
 * soft-delete trash lifecycle + reclassify-as-article.
 */

import type { BulkDeleteResponse } from "../../api/client";
import type { IStorageService } from "../types";
import { articles } from "./articles";
import { commentTextToDoc, nowIso, notFound, stripDeletedAt } from "./helpers";
import { type CommentRow, offlineDb } from "./schema";

export const comments: IStorageService["comments"] = {
    list: async (params = {}) => {
        let rows = (await offlineDb.articleComments.toArray()).filter((c) => !c.deleted_at);
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
        const article = await articles.create({
            title,
            author: comment.author,
            language: comment.language,
            content_type: "blogpost",
        });
        await articles.update(article.id, {
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
                ids.map((id) => offlineDb.articleComments.update(id, { deleted_at: nowIso() })),
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
        const rows = (await offlineDb.articleComments.toArray()).filter((c) => !!c.deleted_at);
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
        const ids = await offlineDb.articleComments
            .toArray()
            .then((rows) => rows.filter((c) => !!c.deleted_at).map((c) => c.id));
        if (ids.length) await offlineDb.articleComments.bulkDelete(ids);
    },
    bulkRestore: async (ids) => {
        await Promise.all(
            ids.map((id) => offlineDb.articleComments.update(id, { deleted_at: null })),
        );
        return { restored_count: ids.length, skipped_not_in_trash: [], failed: [] };
    },
    create: async (comment) => {
        const row: CommentRow = { ...comment, deleted_at: null };
        await offlineDb.articleComments.put(row);
        return stripDeletedAt(row);
    },
};
