/**
 * Article featured-image asset namespace (#157): store / read / cascade
 * the binary bytes an article references via `featured_image_asset_id`.
 */

import type { IStorageService } from "../types";
import { storeArticleAssetBlob } from "./helpers";
import { offlineDb } from "./schema";

export const articleAssets: IStorageService["articleAssets"] = {
    store: async (articleId, blob, filename, mimeType) => {
        const row = await storeArticleAssetBlob(
            articleId,
            blob,
            filename,
            mimeType || blob.type || "application/octet-stream",
        );
        return row.id;
    },
    getBlob: async (assetId) => {
        // No ensureSeeded(): article assets are pure user data with no seed
        // dependency, and Dexie auto-opens on first table access.
        const row = await offlineDb.articleAssets.get(assetId);
        return row ? new Blob([row.data], { type: row.mimeType }) : null;
    },
    deleteByArticle: async (articleId) => {
        await offlineDb.articleAssets.where("articleId").equals(articleId).delete();
    },
};
