/**
 * Unified backup-restore dispatcher (#340).
 *
 * The Settings backup/import surfaces accept BOTH the new `.bgb` archive
 * (ZIP with image bytes) and the legacy `.json` bundle (no images). This
 * routes a user-picked file to the matching client-side importer and
 * normalises the two count shapes into one, so the calling UI needs a single
 * code path.
 *
 * Routing is by CONTENT (the ZIP "PK" magic), not the filename extension: a
 * downloaded backup can reach the importer without its `.bgb` suffix (e.g. a
 * Playwright `download.path()` temp file), so sniffing the bytes is both more
 * robust and correct regardless of how the file was named.
 */

import { importBgbFile } from "../import/bgbImport";
import { importFullBackup } from "./backupImport";

/** The subset of restore counts every backup surface reports. */
export interface RestoreCounts {
    books: number;
    chapters: number;
    articles: number;
    skippedBooks: number;
}

/** First two bytes of every ZIP / `.bgb` archive ("PK"). */
async function isZipArchive(file: File): Promise<boolean> {
    const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    return head[0] === 0x50 && head[1] === 0x4b;
}

/**
 * Restore a backup file, auto-detecting `.bgb` (ZIP) vs `.json`.
 *
 * A ZIP archive carries image bytes and routes through {@link importBgbFile};
 * everything else is treated as the legacy JSON bundle via
 * {@link importFullBackup} (which throws `BackupImportError` on a bad shape,
 * so the existing invalid-format toast still fires).
 */
export async function restoreBackupFile(file: File): Promise<RestoreCounts> {
    if (await isZipArchive(file)) {
        const result = await importBgbFile(file);
        return {
            books: result.imported.books,
            chapters: result.imported.chapters,
            articles: result.imported.articles,
            skippedBooks: result.skipped.books,
        };
    }
    const result = await importFullBackup(file);
    return {
        books: result.imported.books,
        chapters: result.imported.chapters,
        articles: result.imported.articles,
        skippedBooks: result.skipped.books,
    };
}
