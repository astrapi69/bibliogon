/**
 * Covers namespace for DexieStorage: upload / delete a book's cover image,
 * stored as an asset with the `cover` type.
 */

import type { CoverUploadResponse } from "../../api/client";
import type { IStorageService } from "../types";
import { imageDimensions, storeAssetBlob } from "./helpers";
import { offlineDb } from "./schema";

export const covers: IStorageService["covers"] = {
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
};
