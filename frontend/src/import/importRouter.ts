/**
 * Client-side import router for the offline import path (#76).
 *
 * Dispatches a detected {@link ImportFormat} to its browser-side importer,
 * reusing the existing offline importers where they already exist
 * (`importFullBackup` for the JSON backup bundle, the Medium client importer
 * for a Medium ZIP) and the new single-file chapter importers for
 * Markdown/Text/HTML, and the new client-side `.bgb` parser
 * (`importBgbFile`). Anything else is an `UnknownFormatError`.
 */

import type { MediumImportResponse } from "../api/client";
import { importFullBackup, type ImportResult } from "../export/backupImport";
import { importBgbFile, type BgbImportResult } from "./bgbImport";
import { importParsed, parseMediumZip } from "../medium-import/clientImport";
import { getStorage } from "../storage";
import {
    importHtmlAsChapter,
    importMarkdownAsChapter,
    importTextAsChapter,
    type ChapterImportResult,
    type ChapterImportTarget,
} from "./chapterImporters";
import type { ImportFormat } from "./detectFormat";

/** Thrown when a recognised format cannot be imported in the browser. */
export class OfflineNotSupportedError extends Error {
    constructor(public readonly format: ImportFormat) {
        super(`Format "${format}" requires the desktop app`);
        this.name = "OfflineNotSupportedError";
    }
}

/** Thrown when the file is not a recognised import format. */
export class UnknownFormatError extends Error {
    constructor() {
        super("Unrecognised import format");
        this.name = "UnknownFormatError";
    }
}

/** Unified outcome of {@link importFile}, discriminated by source kind. */
export type ImportFileResult =
    | {
          kind: "chapter";
          format: "markdown" | "text" | "html";
          result: ChapterImportResult;
      }
    | { kind: "backup"; format: "json-backup"; result: ImportResult }
    | { kind: "bgb-backup"; format: "bgb"; result: BgbImportResult }
    | { kind: "medium"; format: "medium-zip"; result: MediumImportResponse };

export interface ImportFileOptions {
    /** Destination for single-file (md/txt/html) imports. Defaults to a new book. */
    target?: ChapterImportTarget;
    /** Injectable clock for deterministic Medium preview ids in tests. */
    now?: number;
}

async function importMediumAll(
    file: File,
    now: number,
): Promise<MediumImportResponse> {
    const { preview, parsed } = await parseMediumZip(file, now);
    const app = await getStorage().settings.getApp();
    const defaultLanguage =
        ((app.app as Record<string, unknown> | undefined)
            ?.default_language as string) || "en";
    return importParsed(
        parsed,
        preview.items.map((item) => item.filename),
        {
            defaultStatus: "draft",
            defaultLanguage,
            skipExistingCanonicalUrls: true,
        },
    );
}

/**
 * Import a file that has already been format-detected.
 *
 * @param file - the user-selected file.
 * @param format - the {@link ImportFormat} from `detectImportFormat`.
 * @param options - destination for chapter imports + an injectable clock.
 * @returns the {@link ImportFileResult} for the source kind.
 * @throws {@link UnknownFormatError} for `unknown`.
 */
export async function importFile(
    file: File,
    format: ImportFormat,
    options: ImportFileOptions = {},
): Promise<ImportFileResult> {
    const target = options.target ?? { kind: "new-book" };

    switch (format) {
        case "markdown":
            return {
                kind: "chapter",
                format,
                result: await importMarkdownAsChapter(file, target),
            };
        case "text":
            return {
                kind: "chapter",
                format,
                result: await importTextAsChapter(file, target),
            };
        case "html":
            return {
                kind: "chapter",
                format,
                result: await importHtmlAsChapter(file, target),
            };
        case "json-backup":
            return {
                kind: "backup",
                format,
                result: await importFullBackup(file),
            };
        case "medium-zip":
            return {
                kind: "medium",
                format,
                result: await importMediumAll(file, options.now ?? Date.now()),
            };
        case "bgb":
            return {
                kind: "bgb-backup",
                format,
                result: await importBgbFile(file),
            };
        default:
            throw new UnknownFormatError();
    }
}
