/**
 * The client-side backup compare (#748).
 *
 * These pin the contract the dialog renders, and the three cases where
 * getting it wrong is worse than a cosmetic diff:
 *
 * - no shared book throws rather than returning an empty diff, because
 *   comparing two backups of different libraries says nothing;
 * - an unchanged chapter is omitted, but an added or removed one is
 *   always listed - a chapter that vanished between two backups is the
 *   single most important thing this surface can tell the user;
 * - `keywords` is a list, so the metadata diff has to compare by value
 *   the way Python's `!=` does, or every compare would report it changed.
 */

import { describe, it, expect } from "vitest";

import {
    BOOK_METADATA_FIELDS,
    BackupCompareError,
    compareBackupArchives,
    type BackupBookSnapshot,
} from "./compareBackups";

function book(overrides: Partial<BackupBookSnapshot> = {}): BackupBookSnapshot {
    return {
        id: "b1",
        title: "Mein Buch",
        author: "Asterios",
        keywords: ["eins", "zwei"],
        chapters: [],
        ...overrides,
    };
}

function chapter(id: string, content: string, extra: Record<string, unknown> = {}) {
    return { id, title: `Kapitel ${id}`, position: 1, content, ...extra };
}

describe("compareBackupArchives", () => {
    it("summarises books present in one side only", () => {
        const result = compareBackupArchives(
            { name: "a.bgb", books: [book(), book({ id: "only-a" })] },
            { name: "b.bgb", books: [book(), book({ id: "only-b" })] },
        );
        expect(result.summary).toEqual({
            books_in_both: 1,
            books_only_in_a: ["only-a"],
            books_only_in_b: ["only-b"],
            filename_a: "a.bgb",
            filename_b: "b.bgb",
        });
    });

    it("throws when the two backups share no book", () => {
        expect(() =>
            compareBackupArchives(
                { name: "a.bgb", books: [book({ id: "x" })] },
                { name: "b.bgb", books: [book({ id: "y" })] },
            ),
        ).toThrow(BackupCompareError);
    });

    it("reports a changed metadata field with both values", () => {
        const result = compareBackupArchives(
            { name: "a.bgb", books: [book({ title: "Alt" })] },
            { name: "b.bgb", books: [book({ title: "Neu" })] },
        );
        expect(result.books[0].metadata_changes).toEqual([
            { field: "title", before: "Alt", after: "Neu" },
        ]);
        expect(result.books[0].title_a).toBe("Alt");
        expect(result.books[0].title_b).toBe("Neu");
    });

    it("compares a list field by value, not by reference", () => {
        // Two separate arrays with the same contents. Reference equality
        // would report `keywords` changed on every single compare.
        const result = compareBackupArchives(
            { name: "a.bgb", books: [book({ keywords: ["eins", "zwei"] })] },
            { name: "b.bgb", books: [book({ keywords: ["eins", "zwei"] })] },
        );
        expect(result.books[0].metadata_changes).toEqual([]);
    });

    it("reports a genuinely changed list field", () => {
        const result = compareBackupArchives(
            { name: "a.bgb", books: [book({ keywords: ["eins"] })] },
            { name: "b.bgb", books: [book({ keywords: ["eins", "zwei"] })] },
        );
        expect(result.books[0].metadata_changes).toEqual([
            { field: "keywords", before: ["eins"], after: ["eins", "zwei"] },
        ]);
    });

    it("ignores fields outside the metadata list", () => {
        // `updated_at` differs on every export; reporting it would bury
        // the changes the author cares about.
        const result = compareBackupArchives(
            { name: "a.bgb", books: [book({ updated_at: "2026-01-01" })] },
            { name: "b.bgb", books: [book({ updated_at: "2026-02-02" })] },
        );
        expect(result.books[0].metadata_changes).toEqual([]);
        expect(BOOK_METADATA_FIELDS).not.toContain("updated_at");
    });

    it("omits an unchanged chapter but lists an added and a removed one", () => {
        const result = compareBackupArchives(
            {
                name: "a.bgb",
                books: [
                    book({
                        chapters: [
                            chapter("same", "<p>Unveraendert</p>"),
                            chapter("gone", "<p>Weg</p>", { position: 2 }),
                        ],
                    }),
                ],
            },
            {
                name: "b.bgb",
                books: [
                    book({
                        chapters: [
                            chapter("same", "<p>Unveraendert</p>"),
                            chapter("new", "<p>Neu</p>", { position: 3 }),
                        ],
                    }),
                ],
            },
        );
        const byId = Object.fromEntries(
            result.books[0].chapters.map((diff) => [diff.chapter_id, diff.change_type]),
        );
        expect(byId).toEqual({ gone: "removed", new: "added" });
        expect(result.books[0].chapter_count_a).toBe(2);
        expect(result.books[0].chapter_count_b).toBe(2);
    });

    it("classifies the changed lines of a changed chapter", () => {
        const result = compareBackupArchives(
            { name: "a.bgb", books: [book({ chapters: [chapter("c1", "<p>Eins</p><p>Zwei</p>")] })] },
            { name: "b.bgb", books: [book({ chapters: [chapter("c1", "<p>Eins</p><p>Drei</p>")] })] },
        );
        const diff = result.books[0].chapters[0];
        expect(diff.change_type).toBe("changed");
        expect(diff.has_changes).toBe(true);
        expect(diff.lines.filter((line) => line.type === "removed").map((l) => l.text)).toEqual([
            "Zwei",
        ]);
        expect(diff.lines.filter((line) => line.type === "added").map((l) => l.text)).toEqual([
            "Drei",
        ]);
    });

    it("flags a renamed chapter even when its text is identical", () => {
        const result = compareBackupArchives(
            { name: "a.bgb", books: [book({ chapters: [chapter("c1", "<p>Gleich</p>")] })] },
            {
                name: "b.bgb",
                books: [
                    book({
                        chapters: [
                            { ...chapter("c1", "<p>Gleich</p>"), title: "Anderer Titel" },
                        ],
                    }),
                ],
            },
        );
        const diff = result.books[0].chapters[0];
        expect(diff.title_changed).toBe(true);
        expect(diff.has_changes).toBe(true);
        expect(diff.lines.every((line) => line.type === "unchanged")).toBe(true);
    });

    it("diffs a chapter stored as TipTap JSON against one stored as HTML", () => {
        // An imported chapter stays HTML until someone opens and saves it
        // (#787), so the two sides of a real compare routinely differ in
        // SHAPE while carrying the same text. Reporting that as a rewrite
        // would make every post-edit compare useless.
        const tiptap = JSON.stringify({
            type: "doc",
            content: [
                { type: "paragraph", content: [{ type: "text", text: "Gleicher Satz" }] },
            ],
        });
        const result = compareBackupArchives(
            { name: "a.bgb", books: [book({ chapters: [chapter("c1", "<p>Gleicher Satz</p>")] })] },
            { name: "b.bgb", books: [book({ chapters: [chapter("c1", tiptap)] })] },
        );
        expect(result.books[0].chapters).toEqual([]);
    });

    it("orders chapters by position, then by id", () => {
        const result = compareBackupArchives(
            { name: "a.bgb", books: [book({ chapters: [] })] },
            {
                name: "b.bgb",
                books: [
                    book({
                        chapters: [
                            chapter("late", "<p>x</p>", { position: 9 }),
                            chapter("early", "<p>y</p>", { position: 1 }),
                        ],
                    }),
                ],
            },
        );
        expect(result.books[0].chapters.map((diff) => diff.chapter_id)).toEqual([
            "early",
            "late",
        ]);
    });
});
