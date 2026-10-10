/**
 * Browser mirror of `project_metadata_parser` (#736).
 *
 * Turns a write-book-template `config/metadata.yaml` plus the sidecar files
 * beside it into the book fields the storage seam writes. One concern: the
 * project's metadata. Chapters and assets have their own modules.
 *
 * The shapes accepted here are not a guess - each one is a real export in the
 * wild, and the parity record in this directory carries a fixture per shape.
 * The YAML-typing hazard the backend documents at length (#1091) is quieter in
 * the browser: `yaml` follows the 1.2 core schema and hands back a string for
 * `date: 2026-03-01`, where PyYAML's 1.1 timestamp type hands back a
 * `datetime.date` that then has to be rendered ISO. Both arrive as the same
 * string, which is what the record pins - but the coercion stays in `scalar`
 * rather than being dropped, because `edition: 2` is a number on both sides
 * and a 1.1-flavoured `yes` would be a boolean on one of them.
 *
 * @example
 * parseProjectMetadata(parseMetadataYaml(tree), tree, "Mein Buch");
 */

import { parseAllDocuments } from "yaml";

import type { ProjectTree } from "./projectFiles";

/** Every book field a write-book-template project can supply. */
export interface ProjectMetadata {
    title: string;
    subtitle: string | null;
    author: string;
    language: string;
    series: string | null;
    series_index: number | null;
    description: string | null;
    edition: string | null;
    publisher: string | null;
    publisher_city: string | null;
    publish_date: string | null;
    isbn_ebook: string | null;
    isbn_paperback: string | null;
    isbn_hardcover: string | null;
    asin_ebook: string | null;
    asin_paperback: string | null;
    asin_hardcover: string | null;
    keywords: string | null;
    html_description: string | null;
    backpage_description: string | null;
    backpage_author_bio: string | null;
    cover_image: string | null;
    custom_css: string | null;
}

type YamlValue = unknown;
type YamlMap = Record<string, YamlValue>;

function isMap(value: YamlValue): value is YamlMap {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * One YAML scalar as a string, or null when there is nothing in it.
 *
 * Null and whitespace-only collapse to null rather than to the string
 * "null" - the same trap #1086 closed in the A+ generator. A container
 * collapses to null too, because a list or a mapping where one of these
 * fields belongs is not a scalar and its repr has no business in a book
 * title (#1103, fixed on both sides).
 *
 * There is deliberately no `Date` branch. `yaml` follows the 1.2 core
 * schema, which has no timestamp type, so `date: 2026-03-01` arrives here as
 * the string the author wrote - the same value PyYAML's 1.1 timestamp
 * produces once rendered ISO. A branch for a type this parser cannot produce
 * would also be unfaithful: JS has no date-without-time, so it could not
 * reproduce the backend's distinction between a date and a datetime.
 */
export function scalar(value: YamlValue): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "object") return null;
    const text = String(value).trim();
    return text || null;
}

/**
 * One YAML scalar as an integer, or null when it is not one.
 *
 * `series_index` is a number on the Book row, so a volume written as a word
 * ("volume: zwei") has to become null rather than a NaN that reaches storage.
 */
export function optionalInt(value: YamlValue): number | null {
    if (value === null || value === undefined || typeof value === "boolean") return null;
    if (typeof value === "number") return Number.isInteger(value) ? value : null;
    const parsed = Number.parseInt(String(value).trim(), 10);
    return Number.isNaN(parsed) ? null : parsed;
}

/**
 * The first non-empty document of `config/metadata.yaml`, or `{}`.
 *
 * Project exports wrap the file in Pandoc-style `---` / `---` markers,
 * producing a stream of one real document followed by an empty trailing one,
 * so both shapes have to parse. A malformed file yields `{}` rather than
 * throwing: the import still has a filename to fall back on for the title,
 * and failing the whole archive over an unreadable sidecar would be worse
 * than importing the manuscript without its metadata.
 */
export function parseMetadataYaml(tree: ProjectTree): YamlMap {
    const raw = tree.text("config/metadata.yaml");
    if (!raw) return {};
    try {
        for (const document of parseAllDocuments(raw)) {
            const value = document.toJS({ maxAliasCount: 100 }) as YamlValue;
            if (isMap(value)) return value;
            if (value) return {};
        }
    } catch {
        return {};
    }
    return {};
}

/** A sidecar's trimmed content, or null when it is missing or empty. */
function sidecar(tree: ProjectTree, ...candidates: string[]): string | null {
    for (const candidate of candidates) {
        const text = tree.text(candidate);
        if (text && text.trim()) return text.trim();
    }
    return null;
}

/**
 * The `author` field as one string.
 *
 * Real-world shapes: a plain string, a Pandoc-style list of strings, or a
 * list of mappings carrying `name` (plus role/affiliation). List entries join
 * with ", "; an unusable value falls back to "Unknown" rather than to the
 * YAML's own repr, which is what a user would see on the dashboard.
 */
export function parseAuthor(raw: YamlValue): string {
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    const entries = isMap(raw) ? [raw] : Array.isArray(raw) ? raw : null;
    if (entries) {
        const names: string[] = [];
        for (const entry of entries) {
            if (typeof entry === "string" && entry.trim()) {
                names.push(entry.trim());
            } else if (isMap(entry)) {
                const name = String(entry.name ?? "").trim();
                if (name) names.push(name);
            }
        }
        if (names.length) return names.join(", ");
    }
    return "Unknown";
}

/** `en-US` becomes `en`; an already short code passes through. */
export function normalizeLanguage(raw: YamlValue): string {
    const text = String(raw ?? "de");
    return text.includes("-") ? text.split("-")[0] : text;
}

function parseSeries(metadata: YamlMap): [string | null, number | null] {
    const raw = metadata.series;
    if (isMap(raw)) return [scalar(raw.title), optionalInt(raw.volume)];
    if (raw !== null && raw !== undefined && !Array.isArray(raw)) {
        return [scalar(raw), optionalInt(metadata.series_index)];
    }
    return [null, null];
}

/** Supports both `isbn.{ebook,paperback,hardcover}` and `identifiers.isbn_*`. */
function parseIsbn(metadata: YamlMap): [string | null, string | null, string | null] {
    const isbn = metadata.isbn;
    const identifiers = metadata.identifiers;
    const pick = (key: string, fallbackKey: string) =>
        scalar(isMap(isbn) ? isbn[key] : null) ??
        scalar(isMap(identifiers) ? identifiers[fallbackKey] : null);
    return [
        pick("ebook", "isbn_ebook"),
        pick("paperback", "isbn_paperback"),
        pick("hardcover", "isbn_hardcover"),
    ];
}

function parseAsin(metadata: YamlMap): [string | null, string | null, string | null] {
    const asin = metadata.asin;
    if (!isMap(asin)) return [null, null, null];
    return [scalar(asin.ebook), scalar(asin.paperback), scalar(asin.hardcover)];
}

/**
 * One value as `json.dumps` would render it.
 *
 * The keywords column stores a JSON string, and the two deployments have to
 * write the same bytes for the same keywords or a `.bgb` diff and the
 * backup comparison report a change nobody made. Python differs from
 * `JSON.stringify` in exactly two ways, both visible in the parity record:
 *
 * - separators are `", "` and `": "`, not `","` and `":"`;
 * - `ensure_ascii` is on by default, so every code point at or above U+007F
 *   becomes `\uXXXX`. Iterating UTF-16 code units reproduces Python's
 *   surrogate pairs for astral characters for free - `json.dumps(["😀"])` is
 *   `["\ud83d\ude00"]` on both sides.
 *
 * Everything else (the short escapes for quote, backslash, newline, tab, and
 * the `\uXXXX` form for the other control characters) is the JSON spec, which
 * both follow.
 */
function pythonJson(value: YamlValue): string {
    if (Array.isArray(value)) {
        return `[${value.map(pythonJson).join(", ")}]`;
    }
    if (isMap(value)) {
        const pairs = Object.entries(value).map(
            ([key, item]) => `${pythonJson(key)}: ${pythonJson(item)}`,
        );
        return `{${pairs.join(", ")}}`;
    }
    return JSON.stringify(value ?? null).replace(/[\u007f-\uffff]/g, (char) => {
        return `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
    });
}

/**
 * The keywords as the JSON array the Book column stores.
 *
 * A non-list or empty value is null, not `"[]"`, so the field stays
 * indistinguishable from "the project did not declare any".
 */
function parseKeywords(metadata: YamlMap): string | null {
    const raw = metadata.keywords;
    return Array.isArray(raw) && raw.length ? pythonJson(raw) : null;
}

/**
 * The user's stylesheet, found anywhere in the project.
 *
 * First non-empty file wins, in the backend's order: `config/`, then
 * `assets/css/` and `assets/styles/`, then anywhere in the tree. The order
 * matters because projects in the wild name this file every possible way
 * (`styles.css`, `custom.css`, `styles-de.css`, a translated `stile.css`),
 * and a directory scan catches every one where the old hardcoded filename
 * list missed them one by one.
 */
export function readCustomCss(tree: ProjectTree): string | null {
    const isCss = (path: string) => path.toLowerCase().endsWith(".css");
    for (const directory of ["config", "assets/css", "assets/styles"]) {
        for (const path of tree.list(directory)) {
            if (!isCss(path)) continue;
            const content = tree.text(path);
            if (content && content.trim()) return content.trim();
        }
    }
    for (const path of tree.paths) {
        if (!isCss(path)) continue;
        const content = tree.text(path);
        if (content && content.trim()) return content.trim();
    }
    return null;
}

/**
 * A parsed `metadata.yaml` plus its sidecars as the book's fields.
 *
 * `fallbackTitle` stands in for the backend's `project_root.name`: the
 * browser has no directory to name a book after, so the caller passes the
 * archive's filename stem.
 */
export function parseProjectMetadata(
    metadata: YamlMap,
    tree: ProjectTree,
    fallbackTitle: string,
): ProjectMetadata {
    const [series, seriesIndex] = parseSeries(metadata);
    const [isbnEbook, isbnPaperback, isbnHardcover] = parseIsbn(metadata);
    const [asinEbook, asinPaperback, asinHardcover] = parseAsin(metadata);

    return {
        title: scalar(metadata.title) ?? fallbackTitle,
        subtitle: scalar(metadata.subtitle),
        author: parseAuthor(metadata.author),
        language: normalizeLanguage(metadata.lang ?? metadata.language ?? "de"),
        series,
        series_index: seriesIndex,
        description: scalar(metadata.description),
        edition: scalar(metadata.edition),
        publisher: scalar(metadata.publisher),
        publisher_city: scalar(metadata.publisher_city),
        publish_date: scalar(metadata.date),
        isbn_ebook: isbnEbook,
        isbn_paperback: isbnPaperback,
        isbn_hardcover: isbnHardcover,
        asin_ebook: asinEbook,
        asin_paperback: asinPaperback,
        asin_hardcover: asinHardcover,
        keywords: parseKeywords(metadata),
        html_description: sidecar(tree, "config/book-description.html"),
        // write-book-template renamed these sidecars from the legacy
        // cover-back-page-* form to backpage-*. Current convention first, so
        // an older export still imports cleanly.
        backpage_description: sidecar(
            tree,
            "config/backpage-description.md",
            "config/cover-back-page-description.md",
        ),
        backpage_author_bio: sidecar(
            tree,
            "config/backpage-author-description.md",
            "config/cover-back-page-author-introduction.md",
        ),
        // Pandoc ships this under the hyphenated key; older Bibliogon exports
        // and hand-written YAMLs use the snake_case variant or a plain cover.
        cover_image:
            scalar(metadata["cover-image"]) ?? scalar(metadata.cover_image) ?? scalar(metadata.cover),
        custom_css: readCustomCss(tree),
    };
}
