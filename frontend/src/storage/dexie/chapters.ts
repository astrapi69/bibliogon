/**
 * Chapters namespace for DexieStorage: per-book chapter CRUD, reorder, and
 * version bump + offline writing-progress recording on content edits.
 */

import type { Chapter } from "../../api/client";
import type { IStorageService } from "../types";
import { countWords, EMPTY_DOC, newId, nowIso, notFound, recordWritingProgress } from "./helpers";
import { offlineDb } from "./schema";
import { serializedUpdate } from "./serialized-update";

export const chapters: IStorageService["chapters"] = {
    list: async (bookId) =>
        (await offlineDb.chapters.where("book_id").equals(bookId).toArray()).sort(
            (a, b) => a.position - b.position,
        ),

    get: async (bookId, chapterId) => {
        const chapter = await offlineDb.chapters.get(chapterId);
        if (!chapter || chapter.book_id !== bookId) notFound("Chapter", chapterId);
        return chapter;
    },

    create: async (bookId, data) => {
        const ts = nowIso();
        const count = await offlineDb.chapters.where("book_id").equals(bookId).count();
        const chapter: Chapter = {
            id: newId(),
            book_id: bookId,
            title: data.title,
            content: data.content ?? EMPTY_DOC,
            position: data.position ?? count,
            chapter_type: data.chapter_type ?? "chapter",
            created_at: ts,
            updated_at: ts,
            version: 0,
        };
        await offlineDb.chapters.add(chapter);
        return chapter;
    },

    update: async (bookId, chapterId, data) =>
        serializedUpdate("chapters", chapterId, async () => {
            const existing = await offlineDb.chapters.get(chapterId);
            if (!existing || existing.book_id !== bookId) notFound("Chapter", chapterId);
            const merged: Chapter = {
                ...existing,
                ...data,
                id: chapterId,
                book_id: bookId,
                version: existing.version + 1,
                updated_at: nowIso(),
            };
            await offlineDb.chapters.put(merged);
            // Record the day's net words-written delta (Finding 6) so the
            // offline Writing-History view has data, mirroring the backend
            // chapter-PATCH handler. Only a content change moves the counter.
            if (data.content !== undefined) {
                await recordWritingProgress(
                    bookId,
                    chapterId,
                    countWords(merged.content) - countWords(existing.content),
                );
            }
            return merged;
        }),

    delete: async (bookId, chapterId) => {
        await offlineDb.chapters.delete(chapterId);
    },

    reorder: async (bookId, chapterIds) => {
        await offlineDb.transaction("rw", offlineDb.chapters, async () => {
            for (let i = 0; i < chapterIds.length; i++) {
                await offlineDb.chapters.update(chapterIds[i], { position: i });
            }
        });
        return (await offlineDb.chapters.where("book_id").equals(bookId).toArray()).sort(
            (a, b) => a.position - b.position,
        );
    },
};
