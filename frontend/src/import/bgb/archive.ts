/**
 * Reading a `.bgb` archive in the browser.
 *
 * A `.bgb` is a plain ZIP (`shutil.make_archive` on the backend) of JSON
 * plus binary asset files, so nothing about reading one needs a server.
 * These four helpers were private to `bgbImport.ts` until the client-side
 * backup COMPARE needed exactly the same reading (#748): locate the
 * archive-internal prefix, read a JSON entry, list the child directory
 * ids under a segment. Two consumers of the same shape is the
 * extraction threshold, and the alternative - a second ZIP walker with
 * its own idea of where `books/` lives - is how the two paths would come
 * to disagree about what a backup contains.
 *
 * @example
 * const {entries, prefix} = await openBgbArchive(file);
 * const manifest = readJsonEntry<Manifest>(entries, `${prefix}manifest.json`);
 */

import { strFromU8, unzipSync } from "fflate";

/** The ZIP's decompressed entries, keyed by archive-internal path. */
export type ZipEntries = Record<string, Uint8Array>;

/** A `.bgb` opened for reading: its entries plus the path prefix they share. */
export interface BgbArchive {
    entries: ZipEntries;
    prefix: string;
}

/** Thrown when the bytes are not a readable Bibliogon backup archive. */
export class BgbArchiveError extends Error {}

/**
 * Locate the archive-internal prefix that holds `manifest.json` / `books/`.
 *
 * `shutil.make_archive` puts them at the root, but some ZIP tools wrap a
 * single top-level folder, so both shapes resolve (mirrors the backend's
 * `find_manifest` / `find_books_dir`).
 */
export function findArchivePrefix(entries: ZipEntries): string {
    const manifest = Object.keys(entries).find((path) => path.endsWith("manifest.json"));
    if (manifest) return manifest.slice(0, manifest.length - "manifest.json".length);
    const book = Object.keys(entries).find((path) =>
        /(^|\/)books\/[^/]+\/book\.json$/.test(path),
    );
    if (book) return book.slice(0, book.indexOf("books/"));
    return "";
}

/** Parse one JSON entry, or `null` when it is absent or unparseable. */
export function readJsonEntry<T>(entries: ZipEntries, path: string): T | null {
    const bytes = entries[path];
    if (!bytes) return null;
    try {
        return JSON.parse(strFromU8(bytes)) as T;
    } catch {
        return null;
    }
}

/** The immediate child directory ids under `<prefix><segment>/`. */
export function childDirIds(entries: ZipEntries, segmentPrefix: string): string[] {
    const ids = new Set<string>();
    for (const path of Object.keys(entries)) {
        if (!path.startsWith(segmentPrefix)) continue;
        const rest = path.slice(segmentPrefix.length);
        const slash = rest.indexOf("/");
        if (slash > 0) ids.add(rest.slice(0, slash));
    }
    return [...ids];
}

/**
 * Unzip a picked file and resolve its internal prefix.
 *
 * @throws BgbArchiveError when the bytes do not unzip, which is what a
 * user handed the wrong file looks like.
 */
export async function openBgbArchive(file: File): Promise<BgbArchive> {
    let entries: ZipEntries;
    try {
        entries = unzipSync(new Uint8Array(await file.arrayBuffer())) as ZipEntries;
    } catch {
        throw new BgbArchiveError(`${file.name}: not a readable .bgb archive`);
    }
    return { entries, prefix: findArchivePrefix(entries) };
}
