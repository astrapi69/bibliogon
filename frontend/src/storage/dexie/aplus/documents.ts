/**
 * A+ documents namespace for DexieStorage (#891): the author's editable A+
 * Content, one row per book and language, so the editor works offline. Kept
 * in its own folder so the flat dexie/ directory stays within its dir-size
 * ratchet.
 */

import type { AplusDocumentRecord } from "../../../api/platform";
import type { IStorageService } from "../../types";
import { newId, nowIso } from "../helpers";
import { type AplusDocumentRow, offlineDb } from "../schema";
import { serializedUpdate } from "../serialized-update";

function findRow(bookId: string, language: string): Promise<AplusDocumentRow | undefined> {
    return offlineDb.aplusDocuments.where("[book_id+language]").equals([bookId, language]).first();
}

function toRecord(row: AplusDocumentRow): AplusDocumentRecord {
    const { id: _id, ...record } = row;
    return record;
}

export const aplusDocuments: IStorageService["aplusDocuments"] = {
    get: async (bookId, language) => {
        const row = await findRow(bookId, language);
        return row ? toRecord(row) : null;
    },
    save: (bookId, language, document) =>
        serializedUpdate("aplus_documents", `${bookId}:${language}`, async () => {
            const existing = await findRow(bookId, language);
            const row: AplusDocumentRow = {
                id: existing?.id ?? newId(),
                book_id: bookId,
                language,
                content_name: document.content_name,
                short_description: document.short_description,
                bullets: document.bullets,
                modules: document.modules,
                updated_at: nowIso(),
            };
            await offlineDb.aplusDocuments.put(row);
            return toRecord(row);
        }),
    remove: async (bookId, language) => {
        await offlineDb.aplusDocuments.where("[book_id+language]").equals([bookId, language]).delete();
    },
    listForBook: async (bookId) => {
        const rows = await offlineDb.aplusDocuments.where("book_id").equals(bookId).sortBy("language");
        return rows.map(toRecord);
    },
};
