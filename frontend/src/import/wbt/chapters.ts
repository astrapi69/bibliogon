/**
 * Browser mirror of `project_chapter_importer` (#736).
 *
 * Decides WHICH files become chapters, in which order, with which title and
 * which type. It does not read their content or write anything: the plan it
 * returns is a list of file paths plus the metadata the backend derives from
 * the filename, so the parity test can compare the plan against what the
 * backend persisted without standing up storage.
 *
 * The two layouts and the type maps are the backend's, including the parts
 * that look arbitrary and are not: the position bases (0 / 100 / 900) leave
 * room for a user to insert chapters between the matter groups, and the
 * `-print` suffix skip exists because write-book-template ships a separate
 * print variant of a chapter beside the ebook one.
 *
 * @example
 * planChapters(tree, readSectionOrder(tree));
 */

import { parseAllDocuments } from "yaml";

import type { ProjectTree } from "./projectFiles";

/** Front-matter filename stems and the chapter type each one means. */
export const FRONT_MATTER_MAP: Readonly<Record<string, string>> = {
    toc: "toc",
    dedication: "dedication",
    epigraph: "epigraph",
    preface: "preface",
    foreword: "foreword",
    prologue: "prologue",
    introduction: "introduction",
    "translators-note": "preface",
};

/** Back-matter filename stems and the chapter type each one means. */
export const BACK_MATTER_MAP: Readonly<Record<string, string>> = {
    epilogue: "epilogue",
    afterword: "afterword",
    "about-the-author": "about_author",
    acknowledgments: "acknowledgments",
    appendix: "appendix",
    bibliography: "bibliography",
    endnotes: "endnotes",
    glossary: "glossary",
    index: "index",
    imprint: "imprint",
    "next-in-series": "next_in_series",
    "other-publications": "next_in_series",
};

export const ALL_SPECIAL_MAP: Readonly<Record<string, string>> = {
    ...FRONT_MATTER_MAP,
    ...BACK_MATTER_MAP,
};

/** Free-form stems that still carry a type, checked as a prefix. */
const CHAPTER_FILENAME_PATTERNS: Readonly<Record<string, string>> = {
    part: "part_intro",
    "part-intro": "part_intro",
    interludium: "interlude",
    interlude: "interlude",
};

/**
 * A leading numeric ordering prefix: `03-` or `03-2-`.
 *
 * The `security/detect-unsafe-regex` rule flags the `\d+` inside a group
 * after a `\d+` as nested quantifiers, which is the ReDoS shape - but not
 * here: the pattern is anchored, the group is optional and consumes a
 * leading `-` the outer `\d+` cannot match, so a long digit run with no
 * dash backtracks one position at a time and the match is linear. Verified
 * against CPython's `^[\d]+(-[\d]+)?-`, which this mirrors character for
 * character.
 */
// eslint-disable-next-line security/detect-unsafe-regex
const ORDER_PREFIX_RE = /^\d+(-\d+)?-/;

/** One planned chapter: where to read it and what the backend would call it. */
export interface PlannedChapter {
    path: string;
    title: string;
    chapter_type: string;
    position: number;
}

function stemOf(path: string): string {
    const base = path.split("/").pop() ?? path;
    const dot = base.lastIndexOf(".");
    return dot > 0 ? base.slice(0, dot) : base;
}

/**
 * `str.title()` as CPython implements it.
 *
 * A character is upper-cased when the character before it is not alphabetic,
 * and lower-cased otherwise - which is why Python turns `a1b` into `A1B` and
 * `don't` into `Don'T`. Reproducing the rule rather than using a word-split
 * matters because the filename stems this runs on are hyphen-separated, and a
 * naive split on whitespace would leave `der-lange-weg` as `Der-lange-weg`.
 *
 * Two inputs this does NOT reproduce, both outside the space a filename stem
 * covers: a ligature (Python title-cases `ﬁ` to `Fi`, `toUpperCase` gives
 * `FI`) and a word-initial `ß` (`Ss` against `SS`). Full title-case mapping
 * has no JS equivalent, and a filename carrying either is not a case worth
 * a mapping table.
 */
export function pythonTitle(text: string): string {
    const isAlpha = (char: string) => /\p{L}/u.test(char);
    let previousIsAlpha = false;
    let out = "";
    for (const char of text) {
        out += previousIsAlpha ? char.toLowerCase() : char.toUpperCase();
        previousIsAlpha = isAlpha(char);
    }
    return out;
}

/**
 * The chapter type a free-form filename stem implies.
 *
 * `01-0-part-1-intro` is a part intro, `05-1-interludium` an interlude,
 * `02-kapitel` a plain chapter. The numeric prefix is stripped first so the
 * patterns match what the author actually named the file.
 */
export function detectChapterType(stem: string): string {
    const cleaned = stem.replace(ORDER_PREFIX_RE, "").toLowerCase();
    for (const [pattern, chapterType] of Object.entries(CHAPTER_FILENAME_PATTERNS)) {
        if (cleaned.startsWith(pattern)) return chapterType;
    }
    return "chapter";
}

/**
 * The chapter's title: its first H1, else its filename stem title-cased.
 *
 * `## ` is excluded explicitly rather than by a stricter pattern, mirroring
 * the backend: a line is a title only when it opens with exactly one `#`
 * followed by a space.
 */
export function extractTitle(content: string, fallback: string): string {
    for (const line of content.split("\n")) {
        const stripped = line.trim();
        if (stripped.startsWith("# ") && !stripped.startsWith("## ")) {
            return stripped.slice(2).trim();
        }
    }
    const cleaned = fallback.replace(ORDER_PREFIX_RE, "") || fallback;
    return pythonTitle(cleaned.replace(/-/g, " ").trim());
}

/**
 * `section_order.ebook`, or `.paperback`, from `config/export-settings.yaml`.
 *
 * An empty list means "no explicit order", which selects the alphabetical
 * layout - so a malformed or missing file degrades to the fallback rather
 * than failing the import.
 */
export function readSectionOrder(tree: ProjectTree): string[] {
    const raw = tree.text("config/export-settings.yaml");
    if (!raw) return [];
    let settings: unknown = null;
    try {
        for (const document of parseAllDocuments(raw)) {
            const value = document.toJS({ maxAliasCount: 100 }) as unknown;
            if (value) {
                settings = value;
                break;
            }
        }
    } catch {
        return [];
    }
    if (typeof settings !== "object" || settings === null) return [];
    const sectionOrder = (settings as Record<string, unknown>).section_order;
    if (typeof sectionOrder !== "object" || sectionOrder === null) return [];
    const byTarget = sectionOrder as Record<string, unknown>;
    const order = byTarget.ebook ?? byTarget.paperback;
    return Array.isArray(order) ? order.filter((e): e is string => typeof e === "string") : [];
}

/** Markdown files directly in a manuscript subdirectory, `-print` excluded. */
function markdownIn(tree: ProjectTree, dir: string): string[] {
    return tree
        .list(dir)
        .filter((path) => path.toLowerCase().endsWith(".md"))
        .filter((path) => !stemOf(path).endsWith("-print"));
}

interface PlanState {
    position: number;
    planned: PlannedChapter[];
    seen: Set<string>;
}

function push(
    state: PlanState,
    tree: ProjectTree,
    path: string,
    chapterType: string,
): void {
    const stem = stemOf(path);
    state.planned.push({
        path,
        title: extractTitle(tree.text(path) ?? "", stem),
        chapter_type: chapterType,
        position: state.position,
    });
    state.position += 1;
}

/**
 * The explicit layout: the order `export-settings.yaml` declares.
 *
 * Entries name a file relative to `manuscript/`, except the literal
 * `chapters`, which stands for every file in `manuscript/chapters/`. Typed
 * front/back-matter files the order forgot are appended afterwards, so an
 * incomplete `section_order` loses nothing.
 */
function planWithSectionOrder(
    tree: ProjectTree,
    sectionOrder: readonly string[],
): PlannedChapter[] {
    const state: PlanState = { position: 0, planned: [], seen: new Set() };

    for (const rawEntry of sectionOrder) {
        const entry = rawEntry.trim();
        if (entry === "chapters") {
            for (const path of markdownIn(tree, "manuscript/chapters")) {
                push(state, tree, path, detectChapterType(stemOf(path)));
            }
            continue;
        }
        const path = `manuscript/${entry}`;
        if (!tree.has(path)) continue;
        const stem = stemOf(path);
        if (stem.endsWith("-print")) continue;
        const key = stem.toLowerCase();
        if (state.seen.has(key)) continue;
        state.seen.add(key);
        push(state, tree, path, ALL_SPECIAL_MAP[key] ?? "chapter");
    }

    for (const [dir, map] of [
        ["manuscript/front-matter", FRONT_MATTER_MAP],
        ["manuscript/back-matter", BACK_MATTER_MAP],
    ] as const) {
        for (const path of tree.list(dir)) {
            if (!path.toLowerCase().endsWith(".md")) continue;
            const key = stemOf(path).toLowerCase();
            if (key.endsWith("-print") || state.seen.has(key)) continue;
            const chapterType = map[key];
            if (!chapterType) continue;
            state.seen.add(key);
            push(state, tree, path, chapterType);
        }
    }

    return state.planned;
}

/**
 * The fallback layout, used when no `section_order` is declared.
 *
 * Each matter group gets its own position base - 0, 100, 900 - which is not
 * cosmetic: it leaves the author room to insert chapters inside a group
 * without renumbering the others. Only typed files are taken from
 * front/back-matter; an untyped file there is dropped, the same way the
 * backend's map lookup drops it.
 */
function planAlphabetical(tree: ProjectTree): PlannedChapter[] {
    const planned: PlannedChapter[] = [];

    const special = (dir: string, map: Readonly<Record<string, string>>, base: number) => {
        const state: PlanState = { position: base, planned, seen: new Set() };
        for (const path of tree.list(dir)) {
            if (!path.toLowerCase().endsWith(".md")) continue;
            const key = stemOf(path).toLowerCase();
            if (key.endsWith("-print")) continue;
            const chapterType = map[key];
            if (!chapterType) continue;
            push(state, tree, path, chapterType);
        }
    };

    special("manuscript/front-matter", FRONT_MATTER_MAP, 0);

    const main: PlanState = { position: 100, planned, seen: new Set() };
    for (const path of markdownIn(tree, "manuscript/chapters")) {
        push(main, tree, path, detectChapterType(stemOf(path)));
    }

    special("manuscript/back-matter", BACK_MATTER_MAP, 900);

    return planned;
}

/** The chapter plan for a project, picking the layout the project declares. */
export function planChapters(
    tree: ProjectTree,
    sectionOrder: readonly string[],
): PlannedChapter[] {
    return sectionOrder.length
        ? planWithSectionOrder(tree, sectionOrder)
        : planAlphabetical(tree);
}
