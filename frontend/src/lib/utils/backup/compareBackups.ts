/**
 * Compare two `.bgb` backups in the browser (#748).
 *
 * Mirrors `app/services/backup/backup_compare.py`, and needs no server
 * for a reason worth stating: a compare reads two files the user picked.
 * Nothing in it touches their library, so the online path was a round
 * trip that uploaded both archives to learn something the browser could
 * work out on its own.
 *
 * The line diff is {@link lineDiff} from #728 - the same LCS walk the
 * offline chapter-version history uses, which already mirrors the
 * backend's `difflib.ndiff` classification. No diff library is involved
 * and none is needed; what a library would add (word-level intra-line
 * diffing, patch output) is not what this surface renders.
 *
 * Library-grade: pure, no app imports beyond the two sibling utils, and
 * the caller hands it the already-unzipped archives.
 *
 * @example
 * const result = compareBackupArchives(
 *     {name: "a.bgb", books: readBooks(archiveA)},
 *     {name: "b.bgb", books: readBooks(archiveB)},
 * );
 */

import type {
    BackupBookDiff,
    BackupChapterDiff,
    BackupCompareResult,
    BackupMetadataChange,
} from "../../../api/types";
import { lineDiff, snapshotPlainText } from "../content/chapterDiff";

/** One book as a backup archive stores it, with its chapters attached. */
export interface BackupBookSnapshot {
    id: string;
    title?: string | null;
    chapters: BackupChapterSnapshot[];
    [field: string]: unknown;
}

/** One chapter as a backup archive stores it. */
export interface BackupChapterSnapshot {
    id: string;
    title?: string | null;
    chapter_type?: string | null;
    position?: number;
    content?: string | null;
}

/** One side of the comparison: the picked file's name and its books. */
export interface BackupSide {
    name: string;
    books: BackupBookSnapshot[];
}

/** Raised when the two archives share no book, so there is nothing to diff. */
export class BackupCompareError extends Error {}

/**
 * Book fields worth surfacing as a metadata diff.
 *
 * Copied field-for-field from the backend's `_BOOK_METADATA_FIELDS`
 * rather than derived from the Book type, deliberately: the backend list
 * leaves out bookkeeping (ids, timestamps) and large derived blobs
 * (`html_description`, `custom_css`) that are noise in a diff, and a
 * list derived from the type would quietly start reporting them.
 */
export const BOOK_METADATA_FIELDS: readonly string[] = [
    "title",
    "subtitle",
    "author",
    "language",
    "series",
    "series_index",
    "description",
    "genre",
    "edition",
    "publisher",
    "publisher_city",
    "publish_date",
    "isbn_ebook",
    "isbn_paperback",
    "isbn_hardcover",
    "asin_ebook",
    "asin_paperback",
    "asin_hardcover",
    "keywords",
    "backpage_description",
    "backpage_author_bio",
    "cover_image",
    "ai_assisted",
    "tts_engine",
    "tts_voice",
    "tts_language",
    "tts_speed",
    "audiobook_merge",
    "audiobook_filename",
    "ms_tools_max_sentence_length",
    "ms_tools_repetition_window",
    "ms_tools_max_filler_ratio",
];

function sameValue(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    // Python's `!=` compares lists and dicts by value; JSON is the
    // cheapest way to reproduce that for the shapes a book field holds
    // (keywords is a list, the rest are scalars).
    if (typeof a === "object" || typeof b === "object") {
        return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    }
    return false;
}

function diffMetadata(
    bookA: BackupBookSnapshot,
    bookB: BackupBookSnapshot,
): BackupMetadataChange[] {
    const changes: BackupMetadataChange[] = [];
    for (const field of BOOK_METADATA_FIELDS) {
        const before = bookA[field];
        const after = bookB[field];
        if (!sameValue(before, after)) changes.push({ field, before, after });
    }
    return changes;
}

function chapterChange(
    chapterA: BackupChapterSnapshot | null,
    chapterB: BackupChapterSnapshot | null,
    changeType: BackupChapterDiff["change_type"],
): BackupChapterDiff {
    const reference = chapterB ?? chapterA;
    const titleA = chapterA?.title ?? null;
    const titleB = chapterB?.title ?? null;
    const typeA = chapterA?.chapter_type ?? null;
    const typeB = chapterB?.chapter_type ?? null;

    const lines = lineDiff(
        chapterA ? snapshotPlainText(chapterA.content) : "",
        chapterB ? snapshotPlainText(chapterB.content) : "",
    );
    const hasTextChanges = lines.some((line) => line.type !== "unchanged");
    const titleChanged = chapterA !== null && chapterB !== null && titleA !== titleB;
    const typeChanged = chapterA !== null && chapterB !== null && typeA !== typeB;

    return {
        chapter_id: reference?.id ?? "",
        position: reference?.position ?? 0,
        change_type: changeType,
        title_a: titleA,
        title_b: titleB,
        chapter_type_a: typeA,
        chapter_type_b: typeB,
        title_changed: titleChanged,
        type_changed: typeChanged,
        lines,
        has_changes:
            changeType !== "changed" || hasTextChanges || titleChanged || typeChanged,
    };
}

function diffBook(bookA: BackupBookSnapshot, bookB: BackupBookSnapshot): BackupBookDiff {
    const chaptersA = new Map(bookA.chapters.map((chapter) => [chapter.id, chapter]));
    const chaptersB = new Map(bookB.chapters.map((chapter) => [chapter.id, chapter]));

    const removed = [...chaptersA.keys()].filter((id) => !chaptersB.has(id)).sort();
    const added = [...chaptersB.keys()].filter((id) => !chaptersA.has(id)).sort();
    const common = [...chaptersA.keys()].filter((id) => chaptersB.has(id));

    const diffs: BackupChapterDiff[] = [
        ...removed.map((id) => chapterChange(chaptersA.get(id) ?? null, null, "removed")),
        ...added.map((id) => chapterChange(null, chaptersB.get(id) ?? null, "added")),
        ...common
            .map((id) =>
                chapterChange(chaptersA.get(id) ?? null, chaptersB.get(id) ?? null, "changed"),
            )
            .filter((diff) => diff.has_changes),
    ];
    diffs.sort(
        (left, right) =>
            left.position - right.position || left.chapter_id.localeCompare(right.chapter_id),
    );

    return {
        book_id: bookA.id,
        title_a: bookA.title ?? null,
        title_b: bookB.title ?? null,
        metadata_changes: diffMetadata(bookA, bookB),
        chapter_count_a: chaptersA.size,
        chapter_count_b: chaptersB.size,
        chapters: diffs,
    };
}

/**
 * Diff two read archives into the shape {@link BackupCompareResult}
 * consumers already render.
 *
 * @throws BackupCompareError when no book id appears in both, which is
 * the one case the user has to act on rather than read: comparing two
 * backups of different libraries says nothing.
 */
export function compareBackupArchives(
    sideA: BackupSide,
    sideB: BackupSide,
): BackupCompareResult {
    const booksA = new Map(sideA.books.map((book) => [book.id, book]));
    const booksB = new Map(sideB.books.map((book) => [book.id, book]));

    const common = [...booksA.keys()].filter((id) => booksB.has(id)).sort();
    const onlyInA = [...booksA.keys()].filter((id) => !booksB.has(id)).sort();
    const onlyInB = [...booksB.keys()].filter((id) => !booksA.has(id)).sort();

    if (common.length === 0) {
        throw new BackupCompareError(
            "Die beiden Backups enthalten keine gemeinsamen Bücher. " +
                "Ein Vergleich ist nur möglich wenn dasselbe Buch in beiden " +
                "Dateien vorkommt.",
        );
    }

    return {
        summary: {
            books_in_both: common.length,
            books_only_in_a: onlyInA,
            books_only_in_b: onlyInB,
            filename_a: sideA.name,
            filename_b: sideB.name,
        },
        books: common.map((id) => diffBook(booksA.get(id)!, booksB.get(id)!)),
    };
}
