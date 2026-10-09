/**
 * Read two `.bgb` archives and diff them, entirely in the browser (#748).
 *
 * The thin layer between the shared archive reader and the pure
 * {@link compareBackupArchives} engine: unzip, pull `book.json` plus
 * `chapters/*.json` out of each book directory, hand both sides over.
 *
 * Validation matches the backend's, because the messages are what the
 * user acts on: the file must end in `.bgb`, must unzip, and must carry
 * a Bibliogon manifest if it carries one at all.
 *
 * @example
 * const result = await compareBackupFiles(fileA, fileB);
 */

import {
    compareBackupArchives,
    type BackupChapterSnapshot,
    type BackupBookSnapshot,
} from "../../lib/utils/backup/compareBackups";
import type { BackupCompareResult } from "../../api/types";
import {
    childDirIds,
    openBgbArchive,
    readJsonEntry,
    type BgbArchive,
} from "./archive";

/** Raised for a file the reader cannot treat as a Bibliogon backup. */
export class BackupCompareInputError extends Error {}

function assertBgbName(file: File, label: string): void {
    if (!file.name.endsWith(".bgb")) {
        throw new BackupCompareInputError(
            `Backup ${label}: Datei muss eine .bgb-Datei sein (erhalten: ${file.name})`,
        );
    }
}

/** Every book in the archive, each with its chapters in position order. */
export function readArchiveBooks(archive: BgbArchive): BackupBookSnapshot[] {
    const { entries, prefix } = archive;
    const booksPrefix = `${prefix}books/`;
    const books: BackupBookSnapshot[] = [];
    for (const bookId of childDirIds(entries, booksPrefix)) {
        const bookDir = `${booksPrefix}${bookId}/`;
        const book = readJsonEntry<Record<string, unknown>>(entries, `${bookDir}book.json`);
        // A directory without a readable book.json is not a book. The
        // backend skips it the same way rather than failing the compare.
        if (!book || typeof book.id !== "string") continue;
        books.push({
            ...book,
            id: book.id,
            title: typeof book.title === "string" ? book.title : null,
            chapters: readBookChapters(archive, bookDir),
        });
    }
    return books;
}

function readBookChapters(archive: BgbArchive, bookDir: string): BackupChapterSnapshot[] {
    const chaptersPrefix = `${bookDir}chapters/`;
    const chapters: BackupChapterSnapshot[] = [];
    for (const path of Object.keys(archive.entries)) {
        if (!path.startsWith(chaptersPrefix) || !path.endsWith(".json")) continue;
        const chapter = readJsonEntry<BackupChapterSnapshot>(archive.entries, path);
        if (chapter && typeof chapter.id === "string") chapters.push(chapter);
    }
    chapters.sort((left, right) => (left.position ?? 0) - (right.position ?? 0));
    return chapters;
}

async function readSide(file: File, label: string) {
    assertBgbName(file, label);
    let archive: BgbArchive;
    try {
        archive = await openBgbArchive(file);
    } catch {
        throw new BackupCompareInputError(
            `Backup ${label}: Datei ist beschädigt und kann nicht gelesen werden`,
        );
    }
    const manifest = readJsonEntry<{ format?: string }>(
        archive.entries,
        `${archive.prefix}manifest.json`,
    );
    if (manifest && manifest.format !== "bibliogon-backup") {
        throw new BackupCompareInputError(
            `Backup ${label}: kein gültiges Bibliogon-Backup-Format`,
        );
    }
    const books = readArchiveBooks(archive);
    if (books.length === 0) {
        throw new BackupCompareInputError(
            `Backup ${label}: kein 'books'-Verzeichnis gefunden`,
        );
    }
    return { name: file.name, books };
}

/** Compare two picked `.bgb` files. Reads both, then diffs them. */
export async function compareBackupFiles(
    fileA: File,
    fileB: File,
): Promise<BackupCompareResult> {
    const [sideA, sideB] = await Promise.all([readSide(fileA, "A"), readSide(fileB, "B")]);
    return compareBackupArchives(sideA, sideB);
}
