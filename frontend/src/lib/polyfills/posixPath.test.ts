/**
 * The shim is asserted against Node's own `path.posix`, not against
 * hand-written expectations (#1070).
 *
 * Writing the answers out by hand is how a shim ends up subtly wrong in
 * exactly the corners that matter - a leading dot, a trailing slash, an
 * `ext` equal to the whole basename. Vitest runs in Node, so the real
 * implementation is available as an oracle, and every case below is a
 * comparison rather than a claim.
 *
 * `resolve` is compared only for inputs carrying an absolute segment:
 * without one, Node falls back to `process.cwd()` and a browser has no
 * such thing, so that case is pinned on its own terms.
 */

import {describe, it, expect} from "vitest";
import {posix as node} from "node:path";

import * as shim from "./posixPath";

const PATHS = [
    "",
    ".",
    "..",
    "/",
    "//",
    "///",
    "a",
    "a/b",
    "a/b/c.txt",
    "/a/b/c.txt",
    "/a/b/",
    "/a//b",
    "a/./b",
    "a/../b",
    "../a",
    "/../a",
    "a/b/..",
    "a/b/../..",
    "a/b/../../..",
    ".gitignore",
    "/etc/.gitignore",
    "index.html",
    "index.",
    "index",
    ".index.md",
    "a.b.c.md",
    "...",
    "....",
    "a.",
    "..a",
    "a..",
    "..b..",
    "0_chapter.xhtml",
    "OEBPS/0_chapter.xhtml",
    "dir.with.dots/file",
    "trailing/",
    " ",
];

describe("posixPath matches node:path.posix", () => {
    it.each(PATHS)("extname(%j)", (input) => {
        expect(shim.extname(input)).toBe(node.extname(input));
    });

    it.each(PATHS)("basename(%j)", (input) => {
        expect(shim.basename(input)).toBe(node.basename(input));
    });

    it.each(PATHS)("dirname(%j)", (input) => {
        expect(shim.dirname(input)).toBe(node.dirname(input));
    });

    it.each(PATHS)("normalize(%j)", (input) => {
        if (input === "") {
            // Node throws on "" for normalize in some versions; the shim
            // returns "." like the documented behaviour, asserted below.
            return;
        }
        expect(shim.normalize(input)).toBe(node.normalize(input));
    });

    // The pair ejs calls together, which is the whole reason this exists:
    // `path.basename(filename, path.extname(filename))`.
    it.each([
        "0_chapter.xhtml",
        "OEBPS/0_chapter.xhtml",
        "content.opf",
        "toc.ncx",
        ".gitignore",
        "a.md",
        ".md",
        "no-extension",
    ])("basename(%j, extname(...)) - the call ejs makes", (input) => {
        expect(shim.basename(input, shim.extname(input))).toBe(
            node.basename(input, node.extname(input)),
        );
    });

    const JOINS: string[][] = [
        [],
        ["a"],
        ["a", "b"],
        ["a", "", "b"],
        ["/a", "b"],
        ["a", "../b"],
        ["a", "./b"],
        ["/", "a"],
        ["a/", "/b"],
        ["OEBPS", "0_chapter.xhtml"],
    ];

    it.each(JOINS.map((parts) => [parts] as const))("join(%j)", (parts) => {
        expect(shim.join(...parts)).toBe(node.join(...parts));
    });

    it.each(PATHS)("isAbsolute(%j)", (input) => {
        expect(shim.isAbsolute(input)).toBe(node.isAbsolute(input));
    });

    const ABSOLUTE_RESOLVES: string[][] = [
        ["/"],
        ["/a", "b"],
        ["/a/b", "../c"],
        ["a", "/b", "c"],
        ["/a", "/b"],
        ["/a/b/", "./c/"],
        ["/a", "..", "..", "b"],
    ];

    it.each(ABSOLUTE_RESOLVES.map((parts) => [parts] as const))(
        "resolve(%j)",
        (parts) => {
            expect(shim.resolve(...parts)).toBe(node.resolve(...parts));
        },
    );
});

describe("posixPath's documented divergences", () => {
    it("resolves a relative-only call against / rather than a cwd", () => {
        // Node would prepend process.cwd(); a browser has none, and "/" is
        // the only base that cannot depend on where the bundle was built.
        expect(shim.resolve("a", "b")).toBe("/a/b");
        expect(shim.resolve()).toBe("/");
    });

    it("normalizes the empty path to '.'", () => {
        expect(shim.normalize("")).toBe(".");
    });

    it("rejects a non-string the way Node does", () => {
        // ejs passes whatever the caller put in the data object, so a
        // silent coercion here would turn a type error into a wrong path.
        // @ts-expect-error deliberate: the guard is the subject
        expect(() => shim.extname(undefined)).toThrow(TypeError);
        // @ts-expect-error deliberate: the guard is the subject
        expect(() => shim.basename(42)).toThrow(TypeError);
    });

    it("exposes the separator and a posix namespace, like the module it stands in for", () => {
        expect(shim.sep).toBe(node.sep);
        expect(shim.posix.extname("a.md")).toBe(".md");
        expect(shim.default.basename("/a/b")).toBe("b");
    });
});
