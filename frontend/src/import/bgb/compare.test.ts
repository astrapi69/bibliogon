/**
 * Reading two `.bgb` archives for the client-side compare (#748).
 *
 * The engine itself is covered in `lib/utils/backup/compareBackups.test.ts`;
 * these pin the reading and the four refusals the user acts on, built
 * against real ZIP bytes rather than a stub so the prefix resolution and
 * the chapter walk are actually exercised.
 */

import { describe, it, expect } from "vitest";
import { strToU8, zipSync } from "fflate";

import { BackupCompareInputError, compareBackupFiles } from "./compare";

interface BookSpec {
    id: string;
    title?: string;
    author?: string;
    chapters?: {id: string; title?: string; position?: number; content?: string}[];
}

/** Build a `.bgb`-shaped ZIP, optionally wrapped in a top-level folder. */
function bgb(
    name: string,
    books: BookSpec[],
    options: {prefix?: string; manifest?: Record<string, unknown> | null} = {},
): File {
    const prefix = options.prefix ?? "";
    const entries: Record<string, Uint8Array> = {};
    const manifest =
        options.manifest === null ? null : (options.manifest ?? {format: "bibliogon-backup"});
    if (manifest) {
        entries[`${prefix}manifest.json`] = strToU8(JSON.stringify(manifest));
    }
    for (const book of books) {
        const {chapters = [], ...meta} = book;
        entries[`${prefix}books/${book.id}/book.json`] = strToU8(JSON.stringify(meta));
        for (const chapter of chapters) {
            entries[`${prefix}books/${book.id}/chapters/${chapter.id}.json`] = strToU8(
                JSON.stringify(chapter),
            );
        }
    }
    const zipped = zipSync(entries);
    const buffer = new ArrayBuffer(zipped.byteLength);
    new Uint8Array(buffer).set(zipped);
    return new File([buffer], name);
}

describe("compareBackupFiles", () => {
    it("reads both archives and diffs the shared book", async () => {
        const result = await compareBackupFiles(
            bgb("a.bgb", [
                {id: "b1", title: "Buch", chapters: [{id: "c1", content: "<p>Eins</p>"}]},
            ]),
            bgb("b.bgb", [
                {id: "b1", title: "Buch", chapters: [{id: "c1", content: "<p>Zwei</p>"}]},
            ]),
        );
        expect(result.summary.books_in_both).toBe(1);
        expect(result.summary.filename_a).toBe("a.bgb");
        expect(result.books[0].chapters[0].lines.map((line) => [line.type, line.text])).toEqual([
            ["removed", "Eins"],
            ["added", "Zwei"],
        ]);
    });

    it("resolves an archive wrapped in a top-level folder", async () => {
        // Some ZIP tools add one; the backend's find_manifest handles both
        // shapes and so must this, or a user-rezipped backup reads as empty.
        const result = await compareBackupFiles(
            bgb("a.bgb", [{id: "b1", title: "Alt"}], {prefix: "backup-2026/"}),
            bgb("b.bgb", [{id: "b1", title: "Neu"}], {prefix: "backup-2026/"}),
        );
        expect(result.books[0].metadata_changes).toEqual([
            {field: "title", before: "Alt", after: "Neu"},
        ]);
    });

    it("resolves an archive with no manifest at all", async () => {
        const result = await compareBackupFiles(
            bgb("a.bgb", [{id: "b1", title: "Alt"}], {manifest: null}),
            bgb("b.bgb", [{id: "b1", title: "Neu"}], {manifest: null}),
        );
        expect(result.summary.books_in_both).toBe(1);
    });

    it("refuses a file that is not named .bgb", async () => {
        await expect(
            compareBackupFiles(
                bgb("backup.zip", [{id: "b1"}]),
                bgb("b.bgb", [{id: "b1"}]),
            ),
        ).rejects.toThrow(/Backup A.*\.bgb/);
    });

    it("refuses bytes that do not unzip, naming which side", async () => {
        const broken = new File([new Uint8Array([1, 2, 3, 4])], "b.bgb");
        await expect(
            compareBackupFiles(bgb("a.bgb", [{id: "b1"}]), broken),
        ).rejects.toThrow(/Backup B.*beschädigt/);
    });

    it("refuses an archive whose manifest is a different format", async () => {
        await expect(
            compareBackupFiles(
                bgb("a.bgb", [{id: "b1"}], {manifest: {format: "something-else"}}),
                bgb("b.bgb", [{id: "b1"}]),
            ),
        ).rejects.toThrow(BackupCompareInputError);
    });

    it("refuses an archive that carries no books", async () => {
        await expect(
            compareBackupFiles(bgb("a.bgb", []), bgb("b.bgb", [{id: "b1"}])),
        ).rejects.toThrow(/Backup A.*books/);
    });

    it("skips a book directory with no readable book.json", async () => {
        // A stray directory in the archive is not a book. The backend skips
        // it rather than failing the whole compare.
        const entries: Record<string, Uint8Array> = {
            "manifest.json": strToU8(JSON.stringify({format: "bibliogon-backup"})),
            "books/b1/book.json": strToU8(JSON.stringify({id: "b1", title: "Echt"})),
            "books/junk/notes.txt": strToU8("kein Buch"),
        };
        const zipped = zipSync(entries);
        const buffer = new ArrayBuffer(zipped.byteLength);
        new Uint8Array(buffer).set(zipped);
        const withJunk = new File([buffer], "a.bgb");
        const result = await compareBackupFiles(withJunk, bgb("b.bgb", [{id: "b1", title: "Echt"}]));
        expect(result.summary.books_in_both).toBe(1);
        expect(result.summary.books_only_in_a).toEqual([]);
    });
});
