/**
 * The file tree of an unpacked write-book-template archive (#736).
 *
 * The backend walks a real directory with `pathlib`; the browser has an
 * in-memory map of ZIP entries. This module is the seam between the two so
 * the ported modules can read "the file at config/metadata.yaml" without
 * caring which side they are on, and so the wrapper-directory rule lives in
 * one place instead of in each of them.
 *
 * Paths are normalised to forward slashes with no leading slash, relative to
 * the project root - so after `buildProjectTree` the marker file is always
 * exactly `config/metadata.yaml`, whether the archive carried it at the top
 * level or one directory down.
 *
 * @example
 * const tree = buildProjectTree({ "book/config/metadata.yaml": bytes });
 * tree.text("config/metadata.yaml"); // the wrapper directory is gone
 */

/** Directory names that never belong to a project, mirroring the backend. */
const IGNORED_SEGMENTS: readonly string[] = ["node_modules", "__MACOSX", ".git"];

/** The file that marks a write-book-template project root. */
export const WBT_MARKER = "config/metadata.yaml";

export interface ProjectTree {
    /** Every file path, sorted, relative to the project root. */
    readonly paths: readonly string[];
    /** True when a file exists at exactly this path. */
    has(path: string): boolean;
    /** The file decoded as UTF-8 text, or null when it does not exist. */
    text(path: string): string | null;
    /** The file's raw bytes, or null when it does not exist. */
    bytes(path: string): Uint8Array | null;
    /** The files directly inside `dir` (not its subdirectories), sorted. */
    list(dir: string): readonly string[];
    /** Every file at or below `dir`, sorted. */
    under(dir: string): readonly string[];
}

function normalise(path: string): string {
    return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

/**
 * The project root inside an archive: the top level, or one directory down.
 *
 * Mirrors `archive_utils.find_project_root`, including its two independent
 * signals - a `manuscript/` directory OR the metadata marker - because a
 * project can legitimately ship either without the other. Returns `""` for
 * the top level, the wrapper's name with a trailing slash when the project
 * sits one level down, and null when neither signal is anywhere.
 */
export function findProjectRoot(paths: readonly string[]): string | null {
    const normalised = paths.map(normalise);
    const hasAt = (prefix: string) =>
        normalised.some(
            (p) => p.startsWith(`${prefix}manuscript/`) || p === `${prefix}${WBT_MARKER}`,
        );

    if (hasAt("")) return "";

    const wrappers = new Set<string>();
    for (const path of normalised) {
        const slash = path.indexOf("/");
        if (slash > 0) wrappers.add(path.slice(0, slash + 1));
    }
    for (const wrapper of [...wrappers].sort()) {
        if (hasAt(wrapper)) return wrapper;
    }
    return null;
}

/**
 * A `ProjectTree` over raw ZIP entries, rooted at the project root.
 *
 * Directory entries (a name ending in `/`) and anything under an ignored
 * segment are dropped, so `paths` holds files only. Throws when no project
 * root can be found, because every caller needs one and an empty tree would
 * silently import a book with no chapters.
 */
export function buildProjectTree(entries: Record<string, Uint8Array>): ProjectTree {
    const names = Object.keys(entries);
    const root = findProjectRoot(names);
    if (root === null) {
        throw new Error("No write-book-template project root in the archive");
    }

    const files = new Map<string, Uint8Array>();
    for (const [rawName, bytes] of Object.entries(entries)) {
        const name = normalise(rawName);
        if (name.endsWith("/")) continue;
        if (!name.startsWith(root)) continue;
        const relative = name.slice(root.length);
        if (!relative) continue;
        const segments = relative.split("/");
        if (segments.some((segment) => IGNORED_SEGMENTS.includes(segment))) continue;
        files.set(relative, bytes);
    }

    const paths = [...files.keys()].sort();
    const decoder = new TextDecoder("utf-8");

    return {
        paths,
        has: (path) => files.has(path),
        bytes: (path) => files.get(path) ?? null,
        text: (path) => {
            const raw = files.get(path);
            return raw === undefined ? null : decoder.decode(raw);
        },
        list: (dir) => {
            const prefix = dir.endsWith("/") ? dir : `${dir}/`;
            return paths.filter(
                (path) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"),
            );
        },
        under: (dir) => {
            const prefix = dir.endsWith("/") ? dir : `${dir}/`;
            return paths.filter((path) => path.startsWith(prefix));
        },
    };
}
