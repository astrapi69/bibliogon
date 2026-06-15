/**
 * Chapter-labels namespace for DexieStorage: per-book colour-coded label
 * CRUD over the `chapterLabels` graph table.
 */

import type { ChapterLabel } from "../../api/client";
import type { IStorageService } from "../types";
import { newId, notFound } from "./helpers";
import { type GraphRow, offlineDb } from "./schema";
import { serializedUpdate } from "./serialized-update";

export const chapterLabels: IStorageService["chapterLabels"] = {
    list: async (bookId) => {
        const rows = await offlineDb.chapterLabels.where("book_id").equals(bookId).toArray();
        return (rows as unknown as ChapterLabel[]).sort((a, b) => a.position - b.position);
    },
    create: async (bookId, data) => {
        const position = await offlineDb.chapterLabels.where("book_id").equals(bookId).count();
        const row: ChapterLabel = {
            id: newId(),
            book_id: bookId,
            name: data.name,
            color: data.color,
            position,
        };
        await offlineDb.chapterLabels.add(row as unknown as GraphRow);
        return row;
    },
    update: async (_bookId, labelId, data) =>
        serializedUpdate("chapter_labels", labelId, async () => {
            const existing = await offlineDb.chapterLabels.get(labelId);
            if (!existing) notFound("ChapterLabel", labelId);
            const merged = { ...existing, ...data } as unknown as ChapterLabel;
            await offlineDb.chapterLabels.put(merged as unknown as GraphRow);
            return merged;
        }),
    remove: async (_bookId, labelId) => {
        await offlineDb.chapterLabels.delete(labelId);
    },
};
