/**
 * Build a KDP package in the browser (#741).
 *
 * The seam-aware half: reads the book, its chapters, its pages and its
 * cover through `getStorage()`, renders the manuscripts with the client
 * export engine, validates the cover with the client probe, and hands the
 * bytes to `buildKdpPackageZip`. Fires no `/api` request.
 *
 * Mirrors `build_kdp_package` in
 * `plugins/bibliogon-plugin-kdp/bibliogon_kdp/package.py`: the same
 * metadata gate, the same per-book-type manuscript set, the same archive.
 * Two differences are real and documented rather than hidden:
 *
 *   - the print interior comes from pdfmake, not WeasyPrint, so it has the
 *     right trim and margins but no hyphenation, no bleed box and no crop
 *     marks (the README inside the package says so, per
 *     `CLIENT_PDF_FIDELITY_NOTE`);
 *   - the cover report comes from the client probe, which reads dimensions
 *     and byte size from the image itself and cannot read embedded DPI
 *     metadata (#739 recorded that gap).
 *
 * @example
 * const {blob, filename} = await buildClientKdpPackage(book, {
 *     formatKind: "paperback", trimSize: "6x9", margin: "normal",
 * });
 * downloadBlob(blob, filename);
 */

import {getStorage} from "../../storage";
import type {BookDetail} from "../../api/client";
import {buildBookDocument} from "../buildExportDocument";
import {toEpubBlob} from "../formatEpub";
import {toPdfBlob} from "../formatPdf";
import {picturebookToPdfBlob} from "../picturebook/picturebookPdf";
import {gatherPicturebookPdfPages} from "../picturebook/gatherPicturebookPdf";
import {comicToPdfBlob} from "../comic/comicPdf";
import {gatherComicPdfPages} from "../comic/gatherComicPdf";
import {
    coverFormatFromFilename,
    validateCoverProbe,
    coverPasses,
} from "../../lib/kdp/coverRequirements";
import {checkMetadataCompleteness} from "../../lib/utils/kdp/metadataCheck";
import {
    isPrintFormat,
    kdpPackageMetadata,
    type KdpMetadataBook,
} from "../../lib/kdp/packageMetadata";
import {kdpPackageReadme} from "../../lib/kdp/packageReadme";
import {
    resolveMarginIn,
    resolveTrim,
    trimPoints,
    bledPoints,
    POINTS_PER_INCH,
} from "../../lib/kdp/trim";
import {
    buildKdpPackageZip,
    KDP_EPUB_ENTRY,
    KDP_PRINT_PDF_ENTRY,
    type KdpPackageFile,
} from "./kdpPackage";

/** Raised with a message meant for the user, like the Python
 *  `KdpPackageError` the endpoint turns into a 400. */
export class KdpPackageError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "KdpPackageError";
    }
}

export interface ClientKdpPackageOptions {
    formatKind: string;
    trimSize?: string | null;
    margin?: string | null;
    /** Injected so the metadata is deterministic in tests; defaults to the
     *  build-time version the rest of the app reports. */
    appVersion?: string;
    generatedAt?: Date;
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
    return new Uint8Array(await blob.arrayBuffer());
}

/** The cover bytes plus the report the package carries about them.
 *
 *  A missing or unreadable cover is NOT an error: the Python stages no
 *  cover and writes a report saying why, so the user gets a package that
 *  tells them what to fix rather than a failed build. */
export async function gatherCover(book: BookDetail): Promise<{
    file: KdpPackageFile | null;
    report: unknown;
}> {
    const coverImage = book.cover_image;
    if (!coverImage) {
        return {
            file: null,
            report: {
                valid: false,
                errors: ["No cover image set on the book."],
                warnings: [],
                info: {},
            },
        };
    }
    const filename = coverImage.split("/").pop() || "";
    const blob = await getStorage().assets.getBlob(book.id, filename);
    if (!blob) {
        return {
            file: null,
            report: {
                valid: false,
                errors: [`Cover file not found: ${filename}`],
                warnings: [],
                info: {},
            },
        };
    }

    const bitmap = await createImageBitmap(blob);
    // Read before closing: a closed ImageBitmap reports 0 x 0, and the
    // report below is the only record of the cover's size inside the ZIP.
    const width = bitmap.width;
    const height = bitmap.height;
    const findings = validateCoverProbe({
        width,
        height,
        format: coverFormatFromFilename(filename),
        fileSizeBytes: blob.size,
    });
    bitmap.close();

    const ext = (filename.split(".").pop() || "jpg").toLowerCase();
    return {
        file: {filename: `cover.${ext}`, bytes: await blobBytes(blob)},
        report: {
            valid: coverPasses(findings),
            errors: findings
                .filter((f) => f.severity === "error")
                .map((f) => f.code),
            warnings: findings
                .filter((f) => f.severity === "warning")
                .map((f) => f.code),
            info: {
                width,
                height,
                format: coverFormatFromFilename(filename),
                file_size_bytes: blob.size,
                // Named so a reader of the ZIP knows why the DPI row is
                // absent rather than assuming the cover passed a check
                // nothing ran.
                checked_by: "Bibliogon client cover probe (no embedded-DPI read)",
            },
        },
    };
}

/**
 * Render the manuscripts for `book`, in the archive order the backend
 * writes them.
 *
 * Prose gets the reflowable EPUB always and the print PDF for the print
 * formats, which is the backend's rule. A picture or comic book has no
 * reflowable edition at all, so its PDF is the only manuscript and is
 * always produced - also the backend's rule, and the reason an eBook-format
 * picture book still comes back with a PDF.
 */
export async function gatherManuscripts(
    book: BookDetail,
    options: ClientKdpPackageOptions,
): Promise<KdpPackageFile[]> {
    const {formatKind, trimSize, margin} = options;
    const trim = resolveTrim(trimSize);
    const files: KdpPackageFile[] = [];

    if (book.book_type === "prose") {
        const doc = buildBookDocument(book, book.chapters ?? []);
        files.push({
            filename: KDP_EPUB_ENTRY,
            bytes: await blobBytes(await toEpubBlob(doc)),
        });
        if (isPrintFormat(formatKind)) {
            // Bled page box, because pdfmake's page size IS its media box -
            // there is no trim box to sit inside a larger sheet. The margin
            // is measured from the trim edge, so it grows by the bleed to
            // keep the text block where the preset puts it.
            const page = bledPoints(trim);
            const bleedPt = (page.width - trimPoints(trim).width) / 2;
            const marginPt = resolveMarginIn(margin) * POINTS_PER_INCH + bleedPt;
            files.push({
                filename: KDP_PRINT_PDF_ENTRY,
                bytes: await blobBytes(
                    await toPdfBlob(doc, {
                        size: page,
                        margins: [marginPt, marginPt, marginPt, marginPt],
                    }),
                ),
            });
        }
        return files;
    }

    if (book.book_type === "picture_book") {
        const pages = await gatherPicturebookPdfPages(book.id);
        files.push({
            filename: KDP_PRINT_PDF_ENTRY,
            bytes: await blobBytes(await picturebookToPdfBlob(pages, trimSize ?? undefined)),
        });
        return files;
    }

    if (book.book_type === "comic_book") {
        const pages = await gatherComicPdfPages(book.id, trimSize ?? undefined);
        files.push({
            filename: KDP_PRINT_PDF_ENTRY,
            bytes: await blobBytes(await comicToPdfBlob(pages, trimSize ?? undefined)),
        });
        return files;
    }

    throw new KdpPackageError(
        `Unsupported book_type ${book.book_type}; expected one of ` +
            "prose / picture_book / comic_book.",
    );
}

/**
 * The metadata gate the wizard's Step 1 enforces, re-run here.
 *
 * Not defence in depth - a client cannot defend against its own user - but
 * parity: the backend refuses to package an incomplete book, and a package
 * that only builds offline would be a different product. The chapters
 * issue is dropped for page-based types, the same filter the server
 * applies via the book-type registry's content model.
 */
export function assertMetadataComplete(book: BookDetail): void {
    const result = checkMetadataCompleteness({
        ...(book as unknown as Record<string, unknown>),
        chapters: book.chapters ?? [],
    });
    const errors = result.issues.filter(
        (issue) =>
            issue.severity === "error" &&
            !(book.book_type !== "prose" && issue.field === "chapters"),
    );
    if (errors.length > 0) {
        throw new KdpPackageError(
            "Metadata incomplete — fix these fields before exporting: " +
                errors.map((issue) => issue.field).join(", "),
        );
    }
}

export async function buildClientKdpPackage(
    book: BookDetail,
    options: ClientKdpPackageOptions,
): Promise<{blob: Blob; filename: string}> {
    assertMetadataComplete(book);

    const manuscripts = await gatherManuscripts(book, options);
    const cover = await gatherCover(book);

    const metadata = kdpPackageMetadata(book as unknown as KdpMetadataBook, {
        formatKind: options.formatKind,
        trimSize: options.trimSize ?? null,
        // The backend passes None here too: nothing in either pipeline
        // counts the rendered pages back out of the PDF.
        pageCount: null,
        appVersion: options.appVersion ?? __APP_VERSION__,
        generatedAt: options.generatedAt ?? new Date(),
    });

    return buildKdpPackageZip({
        title: book.title,
        metadata,
        coverReport: cover.report,
        publishingState: book,
        readme: kdpPackageReadme(book, book.book_type, {clientRendered: true}),
        cover: cover.file,
        manuscripts,
    });
}
