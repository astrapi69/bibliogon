/**
 * The POSIX parts of Node's `path`, for browser bundles (#1070).
 *
 * Vite externalizes a bare `require('path')` for a browser build and
 * substitutes a stub whose members are `undefined`, so a dependency that
 * reads `path.extname` gets "not a function" at runtime while the build
 * and the Node-hosted test suite both stay green. `ejs` - reached through
 * `epub-gen-memory` - does exactly that on every EPUB render, which broke
 * client-side EPUB export in every built bundle.
 *
 * This is aliased as `path` in `frontend/vite.config.ts`, for the test run
 * as well as the build: a shim the tests do not exercise is the same gap
 * that let the original bug ship.
 *
 * Everything here is pure string arithmetic over a frozen spec, and
 * `posixPath.test.ts` asserts each function against Node's own
 * `path.posix` rather than against hand-written expectations. `resolve`
 * is the one deliberate divergence: there is no working directory in a
 * browser, so a relative-only call resolves against `/`.
 *
 * Not implemented, because nothing in the bundle asks for them and a
 * wrong answer is worse than a missing one: `relative`, `parse`,
 * `format`, `toNamespacedPath`, and the Windows (`win32`) variants.
 *
 * @example
 * import {extname, basename} from "./posixPath";
 * extname("OEBPS/0_chapter.xhtml"); // ".xhtml"
 * basename("OEBPS/0_chapter.xhtml", ".xhtml"); // "0_chapter"
 */

export const sep = "/";
export const delimiter = ":";

function assertString(value: unknown, name: string): string {
    if (typeof value !== "string") {
        throw new TypeError(
            `The "${name}" argument must be of type string. Received ${typeof value}`,
        );
    }
    return value;
}

/** Whether `path` starts at the root. */
export function isAbsolute(path: string): boolean {
    return assertString(path, "path").charCodeAt(0) === 47;
}

/**
 * Collapse `.` and `..` segments. `allowAboveRoot` keeps leading `..`
 * segments, which a relative path needs and an absolute one must not have.
 */
function normalizeSegments(path: string, allowAboveRoot: boolean): string {
    const out: string[] = [];
    for (const segment of path.split("/")) {
        if (segment === "" || segment === ".") continue;
        if (segment === "..") {
            if (out.length > 0 && out[out.length - 1] !== "..") {
                out.pop();
            } else if (allowAboveRoot) {
                out.push("..");
            }
            continue;
        }
        out.push(segment);
    }
    return out.join("/");
}

/** Collapse `.`, `..` and repeated separators, keeping a trailing slash. */
export function normalize(path: string): string {
    assertString(path, "path");
    if (path.length === 0) return ".";
    const absolute = isAbsolute(path);
    const trailing = path.charCodeAt(path.length - 1) === 47;
    let out = normalizeSegments(path, !absolute);
    if (out.length === 0) {
        if (absolute) return "/";
        return trailing ? "./" : ".";
    }
    if (trailing) out += "/";
    return absolute ? `/${out}` : out;
}

/** Join segments with `/` and normalize the result. */
export function join(...parts: string[]): string {
    let joined = "";
    for (const part of parts) {
        assertString(part, "path");
        if (part.length === 0) continue;
        joined = joined.length === 0 ? part : `${joined}/${part}`;
    }
    return joined.length === 0 ? "." : normalize(joined);
}

/**
 * Resolve to an absolute path, reading right to left until a segment is
 * absolute. With no absolute segment the base is `/`, because a browser
 * has no working directory - the one place this diverges from Node.
 */
export function resolve(...parts: string[]): string {
    let resolved = "";
    let absolute = false;
    for (let i = parts.length - 1; i >= 0 && !absolute; i -= 1) {
        const part = assertString(parts[i], "path");
        if (part.length === 0) continue;
        resolved = resolved.length === 0 ? part : `${part}/${resolved}`;
        absolute = isAbsolute(part);
    }
    const out = normalizeSegments(resolved, false);
    return out.length === 0 ? "/" : `/${out}`;
}

/** The directory part: everything before the last separator. */
export function dirname(path: string): string {
    assertString(path, "path");
    if (path.length === 0) return ".";
    const absolute = isAbsolute(path);
    let end = -1;
    let sawNonSep = false;
    for (let i = path.length - 1; i >= 1; i -= 1) {
        if (path.charCodeAt(i) === 47) {
            if (sawNonSep) {
                end = i;
                break;
            }
        } else {
            sawNonSep = true;
        }
    }
    if (end === -1) return absolute ? "/" : ".";
    if (absolute && end === 1) return "//";
    return path.slice(0, end);
}

/** The last segment, with `ext` removed when it is a suffix of it. */
export function basename(path: string, ext?: string): string {
    assertString(path, "path");
    if (ext !== undefined) assertString(ext, "ext");
    let end = path.length;
    while (end > 0 && path.charCodeAt(end - 1) === 47) end -= 1;
    let start = end;
    while (start > 0 && path.charCodeAt(start - 1) !== 47) start -= 1;
    const name = path.slice(start, end);
    if (
        ext !== undefined &&
        ext.length > 0 &&
        ext.length < name.length &&
        name.endsWith(ext)
    ) {
        return name.slice(0, name.length - ext.length);
    }
    // Node returns the whole name when ext equals it, so `basename("a.md",
    // ".md")` is "a" but `basename(".md", ".md")` is ".md".
    return name;
}

/**
 * The extension of the last segment, including the dot.
 *
 * Three of Node's edge cases, all pinned by the tests against the real
 * implementation: a leading dot does not start an extension (`.gitignore`
 * has none), a trailing dot IS an extension of just `.` (`a.` -> `.`), and
 * the relative names `.` and `..` have none even though `...` does.
 */
export function extname(path: string): string {
    assertString(path, "path");
    const name = basename(path);
    if (name === "." || name === "..") return "";
    const dot = name.lastIndexOf(".");
    if (dot <= 0) return "";
    return name.slice(dot);
}

export const posix = {
    sep,
    delimiter,
    isAbsolute,
    normalize,
    join,
    resolve,
    dirname,
    basename,
    extname,
};

export default posix;
