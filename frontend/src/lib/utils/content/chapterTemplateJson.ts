/**
 * The portable `.chapter-template.json` format: serialize a chapter template
 * for download, and parse + validate one back.
 *
 * Mirrors `backend/app/routers/chapter_templates.py` (`export_chapter_template`
 * + `import_chapter_template`) so a file exported offline and one exported
 * from the desktop app are byte-compatible, and an import rejects the same
 * files with the same reasons in both modes (#731).
 *
 * Library-grade: no app imports beyond the `ChapterType` type, no i18n, no
 * storage, no DOM. The caller turns a rejection into whatever its surface
 * needs (a toast offline, an `ApiError` detail online).
 *
 * @example
 * const blob = new Blob([JSON.stringify(serializeChapterTemplate(tpl), null, 2)]);
 * downloadBlob(blob, chapterTemplateFilename(tpl.name));
 */

import type { ChapterType } from "../../../api/types";

/** Marker every Bibliogon chapter-template file carries. */
export const CHAPTER_TEMPLATE_FORMAT = "bibliogon-chapter-template";

/** Version of the file layout below. Bumped only on a breaking change. */
export const CHAPTER_TEMPLATE_FORMAT_VERSION = "1.0";

/**
 * Every `chapter_type` the BACKEND enum accepts.
 *
 * Deliberately a superset of the frontend `ChapterType` union, which is five
 * values behind (`half_title`, `title_page`, `copyright`, `section`,
 * `conclusion` exist in `backend/app/models/ChapterType` but not in
 * `api/types.ts`). Validating against the narrower union would reject a file
 * the desktop app exports and re-imports happily, so the wire format is
 * checked against the backend's set. Widening the union is its own change —
 * it touches every consumer of the type.
 */
export const CHAPTER_TEMPLATE_TYPE_VALUES = [
    "chapter",
    "preface",
    "foreword",
    "acknowledgments",
    "about_author",
    "appendix",
    "bibliography",
    "glossary",
    "epilogue",
    "imprint",
    "next_in_series",
    "part",
    "part_intro",
    "interlude",
    "toc",
    "dedication",
    "prologue",
    "introduction",
    "afterword",
    "final_thoughts",
    "index",
    "epigraph",
    "endnotes",
    "also_by_author",
    "excerpt",
    "call_to_action",
    "half_title",
    "title_page",
    "copyright",
    "section",
    "conclusion",
] as const;

/** Compile-time guard: every frontend `ChapterType` must be in the runtime
 *  list above, so widening the union cannot silently leave the validator
 *  behind. The list may be a superset (see the note above); it may not be a
 *  subset. */
type _UncoveredChapterType = Exclude<
    ChapterType,
    (typeof CHAPTER_TEMPLATE_TYPE_VALUES)[number]
>;
const _chapterTypesCovered: _UncoveredChapterType extends never ? true : never = true;
void _chapterTypesCovered;

/** The portable fields of a chapter template, as written to / read from a
 *  `.chapter-template.json` file. `is_builtin` and `id` are deliberately
 *  absent so a re-imported file always lands as a new user template. */
export interface ChapterTemplateFile {
    format: typeof CHAPTER_TEMPLATE_FORMAT;
    format_version: string;
    name: string;
    description: string;
    chapter_type: string;
    content: string | null;
    language: string;
    child_template_ids: string[];
}

/** The validated fields a parsed file yields (no format envelope). */
export type ParsedChapterTemplate = Omit<ChapterTemplateFile, "format" | "format_version">;

/** Thrown when a file is not a usable chapter template. The `message` is
 *  user-facing and mirrors the endpoint's 400 detail. */
export class ChapterTemplateFormatError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ChapterTemplateFormatError";
    }
}

/** Fields of a stored template this module needs; structurally satisfied by
 *  the API `ChapterTemplate` and by a Dexie row. */
interface SerializableChapterTemplate {
    name: string;
    description: string;
    chapter_type: string;
    content: string | null;
    language: string;
    child_template_ids: string[] | null;
}

/** Build the file payload for a stored template. */
export function serializeChapterTemplate(
    template: SerializableChapterTemplate,
): ChapterTemplateFile {
    return {
        format: CHAPTER_TEMPLATE_FORMAT,
        format_version: CHAPTER_TEMPLATE_FORMAT_VERSION,
        name: template.name,
        description: template.description,
        chapter_type: template.chapter_type,
        content: template.content,
        language: template.language,
        child_template_ids: template.child_template_ids ?? [],
    };
}

/**
 * Parse + validate a `.chapter-template.json` file's text.
 *
 * Applies the endpoint's checks in the same order: valid JSON, object root,
 * format marker, required fields (trimmed), known `chapter_type`, and a
 * `child_template_ids` that is a list of strings. Referential checks on those
 * ids (existence, self-reference, cycles) are the caller's: they need the
 * stored set, which this module has no access to.
 *
 * @throws {ChapterTemplateFormatError} with the endpoint's message.
 */
export function parseChapterTemplateJson(text: string): ParsedChapterTemplate {
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw new ChapterTemplateFormatError("File is not valid JSON");
    }
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
        throw new ChapterTemplateFormatError("JSON root must be an object");
    }
    const record = data as Record<string, unknown>;
    if (record.format !== CHAPTER_TEMPLATE_FORMAT) {
        throw new ChapterTemplateFormatError(
            "Not a Bibliogon chapter template (missing or wrong 'format' marker)",
        );
    }

    const name = typeof record.name === "string" ? record.name.trim() : "";
    const description =
        typeof record.description === "string" ? record.description.trim() : "";
    const chapterType = record.chapter_type;
    if (!name || !description || !chapterType) {
        throw new ChapterTemplateFormatError(
            "Required fields missing: name, description, chapter_type",
        );
    }
    if (
        typeof chapterType !== "string" ||
        !(CHAPTER_TEMPLATE_TYPE_VALUES as readonly string[]).includes(chapterType)
    ) {
        throw new ChapterTemplateFormatError(`Unknown chapter_type: ${String(chapterType)}`);
    }

    const rawChildIds = record.child_template_ids ?? [];
    if (
        !Array.isArray(rawChildIds) ||
        !rawChildIds.every((id) => typeof id === "string")
    ) {
        throw new ChapterTemplateFormatError("child_template_ids must be a list of strings");
    }

    return {
        name,
        description,
        chapter_type: chapterType,
        content: typeof record.content === "string" ? record.content : null,
        language: typeof record.language === "string" && record.language ? record.language : "en",
        child_template_ids: rawChildIds as string[],
    };
}

/**
 * Download filename for a template, mirroring the backend's
 * `_slugify_filename`: every run of characters outside `[A-Za-z0-9._-]`
 * becomes a single hyphen, leading/trailing hyphens are trimmed, the result
 * is lowercased, and an empty slug falls back to `chapter-template`.
 *
 * Deliberately NOT `shared/utils/slugify`: that one keeps German umlauts
 * (`Über uns` -> `über-uns`) while the backend drops them (`ber-uns`). The
 * same template exported online and offline must produce the same filename,
 * so this mirrors the backend rather than reusing the nicer helper.
 */
export function chapterTemplateFilename(name: string): string {
    const slug =
        name
            .replace(/[^A-Za-z0-9._-]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .toLowerCase() || "chapter-template";
    return `${slug}.chapter-template.json`;
}
