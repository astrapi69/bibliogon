import {describe, it, expect} from "vitest";

import {type Author} from "../../api/client";
import {
    AUTHORS_EXPORT_VERSION,
    AuthorsImportError,
    authorsExportFilename,
    buildAuthorsExport,
    parseAuthorsImport,
    planAuthorsImport,
} from "./authorsImportExport";

function author(partial: Partial<Author> & {name: string; slug: string}): Author {
    return {
        id: partial.id ?? partial.slug,
        bio: partial.bio ?? null,
        is_profile_author: partial.is_profile_author ?? false,
        created_at: "2026-06-10T12:00:00Z",
        updated_at: "2026-06-10T12:00:00Z",
        ...partial,
    };
}

describe("buildAuthorsExport", () => {
    it("wraps authors in a versioned envelope with the given timestamp", () => {
        const out = buildAuthorsExport(
            [author({name: "Stephen King", slug: "stephen-king", is_profile_author: false})],
            "2026-06-10T12:00:00Z",
        );
        expect(out.version).toBe(AUTHORS_EXPORT_VERSION);
        expect(out.exported_at).toBe("2026-06-10T12:00:00Z");
        expect(out.authors).toEqual([
            {name: "Stephen King", slug: "stephen-king", is_profile_author: false},
        ]);
    });

    it("carries the is_profile_author flag through", () => {
        const out = buildAuthorsExport(
            [author({name: "Me", slug: "me", is_profile_author: true})],
            "2026-06-10T12:00:00Z",
        );
        expect(out.authors[0].is_profile_author).toBe(true);
    });
});

describe("authorsExportFilename", () => {
    it("uses only the date part of the timestamp", () => {
        expect(authorsExportFilename("2026-06-10T12:34:56Z")).toBe(
            "bibliogon-authors-2026-06-10.json",
        );
    });
});

describe("parseAuthorsImport", () => {
    it("returns the envelope for a valid version-1 export", () => {
        const env = parseAuthorsImport(
            JSON.stringify({version: 1, exported_at: "x", authors: [{name: "A", slug: "a"}]}),
        );
        expect(env.authors).toHaveLength(1);
    });

    it("throws on non-JSON", () => {
        expect(() => parseAuthorsImport("not json")).toThrow(AuthorsImportError);
    });

    it("throws on a wrong version", () => {
        expect(() => parseAuthorsImport(JSON.stringify({version: 2, authors: []}))).toThrow(
            AuthorsImportError,
        );
    });

    it("throws when authors is not an array", () => {
        expect(() => parseAuthorsImport(JSON.stringify({version: 1, authors: {}}))).toThrow(
            AuthorsImportError,
        );
    });
});

describe("planAuthorsImport", () => {
    it("creates all entries against an empty database", () => {
        const plan = planAuthorsImport(
            [
                {name: "Stephen King", slug: "stephen-king"},
                {name: "Ursula K. Le Guin", slug: "ursula-k-le-guin"},
            ],
            [],
        );
        expect(plan.toCreate).toEqual(["Stephen King", "Ursula K. Le Guin"]);
        expect(plan.skipped).toBe(0);
    });

    it("skips an entry whose slug already exists", () => {
        const plan = planAuthorsImport(
            [{name: "Stephen King", slug: "stephen-king"}],
            [author({name: "Different Display", slug: "stephen-king"})],
        );
        expect(plan.toCreate).toEqual([]);
        expect(plan.skipped).toBe(1);
    });

    it("skips an entry whose name already exists case-insensitively", () => {
        const plan = planAuthorsImport(
            [{name: "stephen king", slug: "other-slug"}],
            [author({name: "Stephen King", slug: "stephen-king"})],
        );
        expect(plan.toCreate).toEqual([]);
        expect(plan.skipped).toBe(1);
    });

    it("dedupes within the file too", () => {
        const plan = planAuthorsImport(
            [
                {name: "Stephen King", slug: "stephen-king"},
                {name: "Stephen King", slug: "stephen-king"},
            ],
            [],
        );
        expect(plan.toCreate).toEqual(["Stephen King"]);
        expect(plan.skipped).toBe(1);
    });

    it("skips nameless entries", () => {
        const plan = planAuthorsImport([{name: "   ", slug: "x"}], []);
        expect(plan.toCreate).toEqual([]);
        expect(plan.skipped).toBe(1);
    });
});
