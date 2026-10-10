/**
 * Assemble a KDP package ZIP from parts that are already bytes (#741).
 *
 * The split is deliberate. This module knows the archive's shape - which
 * entries it carries, in which order, under which names - and nothing
 * about where the bytes came from. `gatherKdpPackage` knows the storage
 * seam, the export engine and the cover probe, and nothing about ZIP
 * layout. The shape is the part worth pinning against the backend, and it
 * is testable with four string literals.
 *
 * Mirrors the ZIP that `build_kdp_package` writes: entry names, entry
 * order and the `{slug}-kdp-package.zip` filename.
 *
 * @example
 * const {blob, filename} = buildKdpPackageZip({
 *     title: "Mein Buch",
 *     metadata: {...},
 *     coverReport: {...},
 *     publishingState: {...},
 *     readme: "…",
 *     cover: {filename: "cover.jpg", bytes: new Uint8Array()},
 *     manuscripts: [{filename: "manuscript-ebook.epub", bytes: new Uint8Array()}],
 * });
 */

import {zipSync} from "fflate";

/** One binary entry: the archive-internal name and its bytes. */
export interface KdpPackageFile {
    filename: string;
    bytes: Uint8Array;
}

export interface KdpPackageParts {
    /** Book title; only used to name the ZIP. */
    title: string;
    metadata: unknown;
    coverReport: unknown;
    publishingState: unknown;
    readme: string;
    /** Absent when the book has no cover - the report then says why. */
    cover?: KdpPackageFile | null;
    /** EPUB and/or print PDF, in the order the backend writes them. */
    manuscripts: KdpPackageFile[];
}

/** The manuscript entry names the backend uses, so a package built in the
 *  browser and one built on the server carry the same files. */
export const KDP_EPUB_ENTRY = "manuscript-ebook.epub";
export const KDP_PRINT_PDF_ENTRY = "manuscript-paperback.pdf";

/**
 * Slug for the package filename.
 *
 * ASCII, like the backend's `_slugify`, because this is a download name -
 * but via NFKD decomposition (`slugifyFilename`'s rule, shared with every
 * other client download), so "Über uns" becomes `uber-uns` rather than the
 * backend's `ber-uns`. The backend drops a non-ASCII letter instead of
 * folding it; matching that bug to match the filename would be the wrong
 * trade. The fallback is the backend's `book`, not the export engine's
 * `export`, because this file is a book package.
 */
export function kdpPackageSlug(title: string): string {
    const slug = title
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return slug || "book";
}

export function kdpPackageFilename(title: string): string {
    return `${kdpPackageSlug(title)}-kdp-package.zip`;
}

function jsonBytes(value: unknown): Uint8Array {
    // indent 2 + non-escaped non-ASCII, matching the backend's
    // `json.dumps(..., indent=2, ensure_ascii=False)` so a diff between a
    // server-built and a browser-built package is about content.
    return new TextEncoder().encode(JSON.stringify(value, null, 2) + "\n");
}

export function buildKdpPackageZip(parts: KdpPackageParts): {
    blob: Blob;
    filename: string;
} {
    const entries: Record<string, Uint8Array> = {};
    // Insertion order is the archive order, and it follows the backend's
    // list: metadata, cover, cover report, manuscripts, state, README.
    entries["metadata.json"] = jsonBytes(parts.metadata);
    if (parts.cover) entries[parts.cover.filename] = parts.cover.bytes;
    entries["cover-validation-report.json"] = jsonBytes(parts.coverReport);
    for (const manuscript of parts.manuscripts) {
        entries[manuscript.filename] = manuscript.bytes;
    }
    entries["publishing-state-snapshot.json"] = jsonBytes(parts.publishingState);
    entries["README.txt"] = new TextEncoder().encode(parts.readme);

    return {
        blob: new Blob([zipSync(entries) as BlobPart], {type: "application/zip"}),
        filename: kdpPackageFilename(parts.title),
    };
}
