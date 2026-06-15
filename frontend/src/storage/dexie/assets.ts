/**
 * Book assets namespace for DexieStorage: list / upload / delete / read /
 * cache binary book assets keyed by `[bookId+filename]`.
 */

import type { IStorageService } from "../types";
import { assetRowToMeta, sanitizeAssetName, storeAssetBlob } from "./helpers";
import { offlineDb } from "./schema";
import { ensureSeeded } from "./seed";

export const assets: IStorageService["assets"] = {
    list: async (bookId) => {
        await ensureSeeded();
        const rows = await offlineDb.assets.where("bookId").equals(bookId).toArray();
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
};
