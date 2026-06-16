/**
 * Covers namespace for DexieStorage: upload / delete a book's cover image,
 * stored as an asset with the `cover` type.
 *
 * Both operations also write `book.cover_image` on the book row, mirroring
 * the backend `upload_cover`/`delete_cover` (which update/clear the same
 * column). This makes a cover upload/removal auto-saved offline: it persists
 * immediately rather than waiting for an explicit form "Speichern", so the
 * cover survives navigate-away (issue #344).
 */

import type { CoverUploadResponse } from "../../api/client";
import type { IStorageService } from "../types";
import { imageDimensions, nowIso, storeAssetBlob } from "./helpers";
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
        const coverImage = `assets/covers/${filename}`;
        await offlineDb.books.update(bookId, {
            cover_image: coverImage,
            updated_at: nowIso(),
        });
        const response: CoverUploadResponse = {
            cover_image: coverImage,
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
        await offlineDb.books.update(bookId, {
            cover_image: null,
            updated_at: nowIso(),
        });
    },
};
