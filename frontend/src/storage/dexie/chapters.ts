/**
 * Chapters namespace for DexieStorage: per-book chapter CRUD, reorder,
 * version bump + offline writing-progress recording on content edits, and
 * the chapter version history / manual snapshots (#728).
 */

import type { Chapter, ChapterVersionRead, ChapterVersionSummary } from "../../api/client";
import { lineDiff, snapshotPlainText } from "../../lib/utils/content/chapterDiff";
import type { IStorageService } from "../types";
import { countWords, EMPTY_DOC, newId, nowIso, notFound, recordWritingProgress } from "./helpers";
import { offlineDb } from "./schema";
import { serializedUpdate } from "./serialized-update";

/**
 * Retention: keep at most the last N AUTOMATIC snapshots per chapter,
 * mirroring `VERSION_RETENTION` in `backend/app/routers/chapters.py`.
 * Manual (named) snapshots are exempt and survive until deleted.
 */
const VERSION_RETENTION = 20;

/** Drop `content` so the row matches the summary shape `listVersions`
 *  returns (the endpoint's response_model does the same server-side). */
function toSummary(row: ChapterVersionRead): ChapterVersionSummary {
    const { content: _content, ...summary } = row;
    return summary;
}

/** Newest first: version desc, then created_at desc as a deterministic
 *  tiebreak — a manual snapshot shares the chapter's current version
 *  number with the next automatic one, which leaves the backend's
 *  `ORDER BY version DESC` alone ambiguous. */
function newestFirst(rows: ChapterVersionRead[]): ChapterVersionRead[] {
    return [...rows].sort(
        (a, b) => b.version - a.version || b.created_at.localeCompare(a.created_at),
    );
}

/** Resolve a chapter inside its book or throw the offline not-found. */
async function requireChapter(bookId: string, chapterId: string): Promise<Chapter> {
    const chapter = await offlineDb.chapters.get(chapterId);
    if (!chapter || chapter.book_id !== bookId) notFound("Chapter", chapterId);
    return chapter;
}

/** Resolve a version scoped to both its chapter and the owning book. */
async function requireVersion(
    bookId: string,
    chapterId: string,
    versionId: string,
): Promise<ChapterVersionRead> {
    await requireChapter(bookId, chapterId);
    const version = await offlineDb.chapterVersions.get(versionId);
    if (!version || version.chapter_id !== chapterId) notFound("Chapter version", versionId);
    return version;
}

/** Write a snapshot row for a chapter's state as it stands right now. */
function buildVersion(
    chapter: Chapter,
    options: { name?: string | null; isManual?: boolean } = {},
): ChapterVersionRead {
    return {
        id: newId(),
        chapter_id: chapter.id,
        title: chapter.title,
        content: chapter.content,
        version: chapter.version,
        name: options.name ?? null,
        is_manual: options.isManual ?? false,
        created_at: nowIso(),
    };
}

/**
 * Trim automatic versions for a chapter down to the last
 * {@link VERSION_RETENTION}, mirroring `trim_auto_versions`. Manual rows
 * are excluded from both the count and the deletion.
 */
async function trimAutoVersions(chapterId: string): Promise<void> {
    const rows = await offlineDb.chapterVersions.where("chapter_id").equals(chapterId).toArray();
    const autos = newestFirst(rows.filter((row) => !row.is_manual));
    if (autos.length <= VERSION_RETENTION) return;
    await offlineDb.chapterVersions.bulkDelete(
        autos.slice(VERSION_RETENTION).map((row) => row.id),
    );
}

export const chapters: IStorageService["chapters"] = {
    list: async (bookId) =>
        (await offlineDb.chapters.where("book_id").equals(bookId).toArray()).sort(
            (a, b) => a.position - b.position,
        ),

    get: async (bookId, chapterId) => requireChapter(bookId, chapterId),

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

    update: async (bookId, chapterId, data) => {
        const merged = await serializedUpdate("chapters", chapterId, async () => {
            const existing = await requireChapter(bookId, chapterId);
            // Snapshot the PRE-update state before the version bump, so a
            // restore brings back what the user had before this save. Mirrors
            // the backend PATCH handler (#728).
            await offlineDb.chapterVersions.add(buildVersion(existing));
            const next: Chapter = {
                ...existing,
                ...data,
                id: chapterId,
                book_id: bookId,
                version: existing.version + 1,
                updated_at: nowIso(),
            };
            await offlineDb.chapters.put(next);
            // Record the day's net words-written delta (Finding 6) so the
            // offline Writing-History view has data, mirroring the backend
            // chapter-PATCH handler. Only a content change moves the counter.
            if (data.content !== undefined) {
                await recordWritingProgress(
                    bookId,
                    chapterId,
                    countWords(next.content) - countWords(existing.content),
                );
            }
            return next;
        });
        await trimAutoVersions(chapterId);
        return merged;
    },

    delete: async (bookId, chapterId) => {
        // IndexedDB has no foreign keys, so the version rows the backend
        // drops via ON DELETE CASCADE have to be removed here (#728).
        await offlineDb.transaction(
            "rw",
            [offlineDb.chapters, offlineDb.chapterVersions],
            async () => {
                await offlineDb.chapters.delete(chapterId);
                await offlineDb.chapterVersions.where("chapter_id").equals(chapterId).delete();
            },
        );
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

    listVersions: async (bookId, chapterId) => {
        await requireChapter(bookId, chapterId);
        const rows = await offlineDb.chapterVersions
            .where("chapter_id")
            .equals(chapterId)
            .toArray();
        return newestFirst(rows).map(toSummary);
    },

    getVersion: async (bookId, chapterId, versionId) =>
        requireVersion(bookId, chapterId, versionId),

    restoreVersion: async (bookId, chapterId, versionId) => {
        const version = await requireVersion(bookId, chapterId, versionId);
        const restored = await serializedUpdate("chapters", chapterId, async () => {
            const chapter = await requireChapter(bookId, chapterId);
            // Snapshot the current state before overwriting, same as the
            // update path, so the restore itself is undoable.
            await offlineDb.chapterVersions.add(buildVersion(chapter));
            const next: Chapter = {
                ...chapter,
                content: version.content,
                title: version.title,
                version: chapter.version + 1,
                updated_at: nowIso(),
            };
            await offlineDb.chapters.put(next);
            return next;
        });
        await trimAutoVersions(chapterId);
        return restored;
    },

    createSnapshot: async (bookId, chapterId, name) => {
        const chapter = await requireChapter(bookId, chapterId);
        // Manual snapshots capture the CURRENT saved state and are exempt
        // from the retention trim, so no trim call here.
        const snapshot = buildVersion(chapter, { name: name ?? null, isManual: true });
        await offlineDb.chapterVersions.add(snapshot);
        return snapshot;
    },

    diffVersion: async (bookId, chapterId, versionId) => {
        const version = await requireVersion(bookId, chapterId, versionId);
        const chapter = await requireChapter(bookId, chapterId);
        return {
            version_id: version.id,
            title_changed: version.title !== chapter.title,
            snapshot_title: version.title,
            current_title: chapter.title,
            lines: lineDiff(
                snapshotPlainText(version.content),
                snapshotPlainText(chapter.content),
            ),
        };
    },

    deleteVersion: async (bookId, chapterId, versionId) => {
        const version = await requireVersion(bookId, chapterId, versionId);
        if (!version.is_manual) {
            // Mirrors the endpoint's 400: automatic versions are the
            // retention trim's to manage, so the save history stays a
            // faithful record.
            throw new Error("Only manual snapshots can be deleted");
        }
        await offlineDb.chapterVersions.delete(versionId);
    },
};
