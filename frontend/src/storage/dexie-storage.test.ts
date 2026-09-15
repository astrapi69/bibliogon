/**
 * DexieStorage round-trips (mobile-sync Phase 3, C1).
 *
 * Exercises the IndexedDB CRUD path for each method-backed domain
 * (books, chapters, articles) via fake-indexeddb, including the
 * book->chapter cascade-on-delete and chapter reorder/version bump.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import {
    __resetSeedForTests,
    dexieStorage,
    ensureSeeded,
    offlineDb,
} from "./dexie-storage";

beforeEach(async () => {
    await Promise.all(offlineDb.tables.map((t) => t.clear()));
    // The seed memo outlives the table contents, so clearing alone would
    // leave every case after the first one un-seeded (#731).
    __resetSeedForTests();
});

/** Read a (reconstructed) Blob's bytes as text via arrayBuffer. */
const readText = async (blob: Blob): Promise<string> =>
    new TextDecoder().decode(await blob.arrayBuffer());

/**
 * Run a download-triggering call and capture what it handed the browser.
 * `exportJson` mirrors the api contract (a download side effect, not a
 * return value), so the assertion target is the blob + filename the anchor
 * received. Same stub shape as `shared/utils/downloadBlob.test.ts`.
 */
async function captureDownload(
    run: () => Promise<void>,
): Promise<{ text: string; filename: string }> {
    let blob: Blob | null = null;
    let filename = "";
    const createSpy = vi
        .spyOn(URL, "createObjectURL")
        .mockImplementation((source: Blob | MediaSource) => {
            blob = source as Blob;
            return "blob:mock-url";
        });
    const revokeSpy = vi
        .spyOn(URL, "revokeObjectURL")
        .mockImplementation(() => undefined);
    const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(function (this: HTMLAnchorElement) {
            filename = this.download;
        });
    try {
        await run();
    } finally {
        createSpy.mockRestore();
        revokeSpy.mockRestore();
        clickSpy.mockRestore();
    }
    if (!blob) throw new Error("no download was triggered");
    return { text: await readText(blob), filename };
}

describe("DexieStorage — books", () => {
    it("create -> get -> list -> update -> delete round-trip", async () => {
        const created = await dexieStorage.books.create({
            title: "Offline Buch",
            author: "A",
        });
        expect(created.id).toBeTruthy();
        expect(created.status).toBe("draft");
        expect(created.keywords).toEqual([]);

        const got = await dexieStorage.books.get(created.id);
        expect(got.title).toBe("Offline Buch");
        expect(got.chapters).toEqual([]); // includeContent defaults false

        expect(await dexieStorage.books.list()).toHaveLength(1);

        const updated = await dexieStorage.books.update(created.id, {
            title: "Neuer Titel",
        });
        expect(updated.title).toBe("Neuer Titel");
        expect(updated.author).toBe("A"); // merge preserves other fields

        await dexieStorage.books.delete(created.id);
        expect(await dexieStorage.books.list()).toHaveLength(0);
    });

    it("get(id, true) embeds chapters sorted by position; soft-delete keeps them, permanent-delete cascades", async () => {
        const book = await dexieStorage.books.create({ title: "Mit Kapiteln" });
        await dexieStorage.chapters.create(book.id, { title: "Zwei", position: 1 });
        await dexieStorage.chapters.create(book.id, { title: "Eins", position: 0 });

        const detail = await dexieStorage.books.get(book.id, true);
        expect(detail.chapters.map((c) => c.title)).toEqual(["Eins", "Zwei"]);

        // Soft-delete leaves the chapters intact (so a restore is whole).
        await dexieStorage.books.delete(book.id);
        expect(await dexieStorage.chapters.list(book.id)).toHaveLength(2);

        // Permanent-delete cascades the child graph away.
        await dexieStorage.books.permanentDelete(book.id);
        expect(await dexieStorage.chapters.list(book.id)).toHaveLength(0);
    });

    it("get throws for an id that is not offline-available", async () => {
        await expect(dexieStorage.books.get("nope")).rejects.toThrow(/not available offline/);
    });
});

describe("DexieStorage — books trash lifecycle (Finding 7)", () => {
    it("delete soft-deletes: gone from list, present in listTrash, restorable", async () => {
        const book = await dexieStorage.books.create({ title: "Trash Me" });

        await dexieStorage.books.delete(book.id);
        expect(await dexieStorage.books.list()).toHaveLength(0);

        const trashed = await dexieStorage.books.listTrash();
        expect(trashed.map((b) => b.id)).toEqual([book.id]);

        const restored = await dexieStorage.books.restore(book.id);
        expect(restored.id).toBe(book.id);
        expect(await dexieStorage.books.list()).toHaveLength(1);
        expect(await dexieStorage.books.listTrash()).toHaveLength(0);
    });

    it("permanentDelete removes a trashed book for good", async () => {
        const book = await dexieStorage.books.create({ title: "Permanent" });
        await dexieStorage.books.delete(book.id);

        await dexieStorage.books.permanentDelete(book.id);
        expect(await dexieStorage.books.list()).toHaveLength(0);
        expect(await dexieStorage.books.listTrash()).toHaveLength(0);
    });

    it("emptyTrash removes every trashed book but keeps active ones", async () => {
        const active = await dexieStorage.books.create({ title: "Active" });
        const a = await dexieStorage.books.create({ title: "A" });
        const b = await dexieStorage.books.create({ title: "B" });
        await dexieStorage.books.delete(a.id);
        await dexieStorage.books.delete(b.id);

        await dexieStorage.books.emptyTrash();
        expect(await dexieStorage.books.listTrash()).toHaveLength(0);
        expect((await dexieStorage.books.list()).map((x) => x.id)).toEqual([active.id]);
    });

    it("bulkDelete soft path trashes; bulkRestore brings them back", async () => {
        const a = await dexieStorage.books.create({ title: "A" });
        const b = await dexieStorage.books.create({ title: "B" });

        const del = await dexieStorage.books.bulkDelete([a.id, b.id], false);
        expect(del.deleted_count).toBe(2);
        expect(await dexieStorage.books.list()).toHaveLength(0);
        expect(await dexieStorage.books.listTrash()).toHaveLength(2);

        const res = await dexieStorage.books.bulkRestore([a.id, b.id]);
        expect(res.restored_count).toBe(2);
        expect(await dexieStorage.books.list()).toHaveLength(2);
        expect(await dexieStorage.books.listTrash()).toHaveLength(0);
    });

    it("bulkDelete permanent path hard-deletes immediately", async () => {
        const a = await dexieStorage.books.create({ title: "A" });
        const b = await dexieStorage.books.create({ title: "B" });

        await dexieStorage.books.bulkDelete([a.id, b.id], true);
        expect(await dexieStorage.books.list()).toHaveLength(0);
        expect(await dexieStorage.books.listTrash()).toHaveLength(0);
    });
});

describe("DexieStorage — chapters", () => {
    it("create -> list -> update (version bump) -> reorder -> delete", async () => {
        const book = await dexieStorage.books.create({ title: "B" });
        const c1 = await dexieStorage.chapters.create(book.id, { title: "K1" });
        const c2 = await dexieStorage.chapters.create(book.id, { title: "K2" });
        expect([c1.position, c2.position]).toEqual([0, 1]);
        expect(c1.version).toBe(0);

        const updated = await dexieStorage.chapters.update(book.id, c1.id, {
            version: c1.version,
            title: "K1 neu",
        });
        expect(updated.title).toBe("K1 neu");
        expect(updated.version).toBe(1);

        const reordered = await dexieStorage.chapters.reorder(book.id, [c2.id, c1.id]);
        expect(reordered.map((c) => c.id)).toEqual([c2.id, c1.id]);

        await dexieStorage.chapters.delete(book.id, c1.id);
        expect(await dexieStorage.chapters.list(book.id)).toHaveLength(1);
    });
});

describe("DexieStorage — chapter versions + snapshots (#728)", () => {
    const doc = (text: string): string =>
        JSON.stringify({
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text }] }],
        });

    it("snapshots the pre-update state on every chapter update, newest first", async () => {
        const book = await dexieStorage.books.create({ title: "B" });
        const ch = await dexieStorage.chapters.create(book.id, {
            title: "K1",
            content: doc("erste Fassung"),
        });

        const v1 = await dexieStorage.chapters.update(book.id, ch.id, {
            version: ch.version,
            content: doc("zweite Fassung"),
        });
        await dexieStorage.chapters.update(book.id, ch.id, {
            version: v1.version,
            content: doc("dritte Fassung"),
        });

        const versions = await dexieStorage.chapters.listVersions(book.id, ch.id);
        expect(versions.map((v) => v.version)).toEqual([1, 0]);
        expect(versions.every((v) => v.is_manual === false)).toBe(true);
        expect(versions.every((v) => v.name === null)).toBe(true);

        // The snapshot holds the PRE-update content, like the backend PATCH.
        const oldest = await dexieStorage.chapters.getVersion(book.id, ch.id, versions[1].id);
        expect(oldest.content).toBe(doc("erste Fassung"));
    });

    it("keeps only the last 20 automatic versions but never trims manual ones", async () => {
        const book = await dexieStorage.books.create({ title: "B" });
        let ch = await dexieStorage.chapters.create(book.id, { title: "K1" });
        const manual = await dexieStorage.chapters.createSnapshot(book.id, ch.id, "Fassung A");
        expect(manual.is_manual).toBe(true);
        expect(manual.name).toBe("Fassung A");

        for (let i = 0; i < 25; i++) {
            ch = await dexieStorage.chapters.update(book.id, ch.id, {
                version: ch.version,
                content: doc(`Fassung ${i}`),
            });
        }

        const versions = await dexieStorage.chapters.listVersions(book.id, ch.id);
        const autos = versions.filter((v) => !v.is_manual);
        const manuals = versions.filter((v) => v.is_manual);
        expect(autos).toHaveLength(20);
        expect(manuals.map((v) => v.name)).toEqual(["Fassung A"]);
        // The trim drops the OLDEST autos, keeping the most recent saves.
        expect(Math.min(...autos.map((v) => v.version))).toBe(5);
    });

    it("restores content + title and snapshots the current state first", async () => {
        const book = await dexieStorage.books.create({ title: "B" });
        const ch = await dexieStorage.chapters.create(book.id, {
            title: "Alter Titel",
            content: doc("alter Inhalt"),
        });
        await dexieStorage.chapters.update(book.id, ch.id, {
            version: ch.version,
            title: "Neuer Titel",
            content: doc("neuer Inhalt"),
        });
        const [snapshot] = await dexieStorage.chapters.listVersions(book.id, ch.id);

        const restored = await dexieStorage.chapters.restoreVersion(book.id, ch.id, snapshot.id);
        expect(restored.title).toBe("Alter Titel");
        expect(restored.content).toBe(doc("alter Inhalt"));
        expect(restored.version).toBe(2);

        // The pre-restore state is now itself a version, so the restore is undoable.
        const versions = await dexieStorage.chapters.listVersions(book.id, ch.id);
        expect(versions).toHaveLength(2);
        const newest = await dexieStorage.chapters.getVersion(book.id, ch.id, versions[0].id);
        expect(newest.content).toBe(doc("neuer Inhalt"));
        expect(newest.title).toBe("Neuer Titel");
    });

    it("diffs a version against the chapter's current content", async () => {
        const book = await dexieStorage.books.create({ title: "B" });
        const ch = await dexieStorage.chapters.create(book.id, {
            title: "Titel",
            content: doc("gleiche Zeile"),
        });
        await dexieStorage.chapters.update(book.id, ch.id, {
            version: ch.version,
            title: "Titel neu",
            content: JSON.stringify({
                type: "doc",
                content: [
                    { type: "paragraph", content: [{ type: "text", text: "gleiche Zeile" }] },
                    { type: "paragraph", content: [{ type: "text", text: "neue Zeile" }] },
                ],
            }),
        });
        const [snapshot] = await dexieStorage.chapters.listVersions(book.id, ch.id);

        const diff = await dexieStorage.chapters.diffVersion(book.id, ch.id, snapshot.id);
        expect(diff.version_id).toBe(snapshot.id);
        expect(diff.title_changed).toBe(true);
        expect(diff.snapshot_title).toBe("Titel");
        expect(diff.current_title).toBe("Titel neu");
        expect(diff.lines).toEqual([
            { type: "unchanged", text: "gleiche Zeile" },
            { type: "added", text: "neue Zeile" },
        ]);
    });

    it("deletes only manual snapshots and rejects automatic versions", async () => {
        const book = await dexieStorage.books.create({ title: "B" });
        const ch = await dexieStorage.chapters.create(book.id, { title: "K1" });
        const manual = await dexieStorage.chapters.createSnapshot(book.id, ch.id, null);
        expect(manual.name).toBeNull();
        await dexieStorage.chapters.update(book.id, ch.id, {
            version: ch.version,
            content: doc("geaendert"),
        });
        const auto = (await dexieStorage.chapters.listVersions(book.id, ch.id)).find(
            (v) => !v.is_manual,
        )!;

        await expect(
            dexieStorage.chapters.deleteVersion(book.id, ch.id, auto.id),
        ).rejects.toThrow(/manual/i);
        expect(await dexieStorage.chapters.listVersions(book.id, ch.id)).toHaveLength(2);

        await dexieStorage.chapters.deleteVersion(book.id, ch.id, manual.id);
        expect(await dexieStorage.chapters.listVersions(book.id, ch.id)).toHaveLength(1);
    });

    it("scopes every read to the owning book and chapter", async () => {
        const bookA = await dexieStorage.books.create({ title: "A" });
        const bookB = await dexieStorage.books.create({ title: "B" });
        const chA = await dexieStorage.chapters.create(bookA.id, { title: "KA" });
        const chB = await dexieStorage.chapters.create(bookB.id, { title: "KB" });
        const snapA = await dexieStorage.chapters.createSnapshot(bookA.id, chA.id, "A1");
        await dexieStorage.chapters.createSnapshot(bookB.id, chB.id, "B1");

        expect(
            (await dexieStorage.chapters.listVersions(bookA.id, chA.id)).map((v) => v.name),
        ).toEqual(["A1"]);
        // A version of chapter A is not reachable through book B or chapter B.
        await expect(
            dexieStorage.chapters.getVersion(bookB.id, chB.id, snapA.id),
        ).rejects.toThrow();
        await expect(dexieStorage.chapters.listVersions(bookB.id, chA.id)).rejects.toThrow();
    });

    it("drops a chapter's versions when the chapter or its book is deleted", async () => {
        const book = await dexieStorage.books.create({ title: "B" });
        const keep = await dexieStorage.chapters.create(book.id, { title: "bleibt" });
        const drop = await dexieStorage.chapters.create(book.id, { title: "weg" });
        await dexieStorage.chapters.createSnapshot(book.id, keep.id, "K");
        await dexieStorage.chapters.createSnapshot(book.id, drop.id, "D");

        await dexieStorage.chapters.delete(book.id, drop.id);
        expect(await offlineDb.chapterVersions.count()).toBe(1);

        await dexieStorage.books.delete(book.id);
        await dexieStorage.books.permanentDelete(book.id);
        expect(await offlineDb.chapterVersions.count()).toBe(0);
    });
});

describe("DexieStorage — book templates (#730)", () => {
    const chapter = (position: number, title: string, content: string | null = null) => ({
        position,
        title,
        chapter_type: "chapter" as const,
        content,
    });

    it("create -> list -> get -> delete round-trip, user templates never builtin", async () => {
        const created = await dexieStorage.templates.create({
            name: "Mein Roman",
            description: "Drei Akte",
            genre: "scifi",
            language: "de",
            chapters: [chapter(0, "Prolog", '{"type":"doc"}'), chapter(1, "Kapitel 1")],
        });
        expect(created.id).toBeTruthy();
        // The endpoint forces is_builtin false on POST; so does the seam.
        expect(created.is_builtin).toBe(false);
        expect(created.chapters).toHaveLength(2);
        expect(created.created_at).toBeTruthy();

        expect(await dexieStorage.templates.list()).toHaveLength(1);
        const got = await dexieStorage.templates.get(created.id);
        expect(got.name).toBe("Mein Roman");
        // Chapter content survives the round-trip (the "preserve" save mode).
        expect(got.chapters[0].content).toBe('{"type":"doc"}');

        await dexieStorage.templates.delete(created.id);
        expect(await dexieStorage.templates.list()).toEqual([]);
    });

    it("ignores a client-sent is_builtin: true", async () => {
        const created = await dexieStorage.templates.create({
            name: "Nicht builtin",
            description: "d",
            genre: "nonfiction",
            language: "de",
            is_builtin: true,
            chapters: [chapter(0, "K1")],
        });
        expect(created.is_builtin).toBe(false);
    });

    it("rejects a duplicate name with a 409, like the endpoint", async () => {
        const payload = {
            name: "Doppelt",
            description: "d",
            genre: "nonfiction",
            language: "de",
            chapters: [chapter(0, "K1")],
        };
        await dexieStorage.templates.create(payload);
        // The modal branches on ApiError.status === 409 to show the inline
        // name-taken error, so the offline path must raise the same shape.
        await expect(dexieStorage.templates.create(payload)).rejects.toMatchObject({
            status: 409,
        });
        expect(await dexieStorage.templates.list()).toHaveLength(1);
    });

    it("lists by name and rejects an unknown id", async () => {
        for (const name of ["Zeta", "Alpha", "Mitte"]) {
            await dexieStorage.templates.create({
                name,
                description: "d",
                genre: "nonfiction",
                language: "de",
                chapters: [chapter(0, "K1")],
            });
        }
        expect((await dexieStorage.templates.list()).map((t) => t.name)).toEqual([
            "Alpha",
            "Mitte",
            "Zeta",
        ]);
        await expect(dexieStorage.templates.get("nope")).rejects.toThrow();
        await expect(dexieStorage.templates.delete("nope")).rejects.toThrow();
    });

    it("creates a book with the template's chapters via createFromTemplate", async () => {
        const tpl = await dexieStorage.templates.create({
            name: "Sachbuch",
            description: "Struktur",
            genre: "nonfiction",
            language: "de",
            chapters: [
                chapter(0, "Vorwort", '{"type":"doc","content":[]}'),
                chapter(1, "Einleitung"),
            ],
        });

        const book = await dexieStorage.books.createFromTemplate({
            template_id: tpl.id,
            title: "Neues Sachbuch",
            author: "Aster",
            language: "de",
            subtitle: "Untertitel",
        });
        expect(book.title).toBe("Neues Sachbuch");
        expect(book.subtitle).toBe("Untertitel");

        const chapters = await dexieStorage.chapters.list(book.id);
        expect(chapters.map((c) => c.title)).toEqual(["Vorwort", "Einleitung"]);
        expect(chapters.map((c) => c.position)).toEqual([0, 1]);
        // Preserved content comes through; a null body seeds an empty doc.
        expect(chapters[0].content).toBe('{"type":"doc","content":[]}');
        expect(chapters[1].content).toBeTruthy();
    });

    it("createFromTemplate seeds chapters in template position order, not insert order", async () => {
        const tpl = await dexieStorage.templates.create({
            name: "Unsortiert",
            description: "d",
            genre: "nonfiction",
            language: "de",
            chapters: [chapter(2, "Drittes"), chapter(0, "Erstes"), chapter(1, "Zweites")],
        });
        const book = await dexieStorage.books.createFromTemplate({
            template_id: tpl.id,
            title: "B",
            author: "A",
            language: "de",
        });
        expect((await dexieStorage.chapters.list(book.id)).map((c) => c.title)).toEqual([
            "Erstes",
            "Zweites",
            "Drittes",
        ]);
    });

    it("createFromTemplate rejects an unknown id and a client builtin id", async () => {
        await expect(
            dexieStorage.books.createFromTemplate({
                template_id: "nope",
                title: "B",
                author: "A",
                language: "de",
            }),
        ).rejects.toThrow();
        // Client built-ins carry i18n keys, so they are instantiated by the
        // caller (which has `t`), never by the storage layer.
        await expect(
            dexieStorage.books.createFromTemplate({
                template_id: "client-roman-3akt",
                title: "B",
                author: "A",
                language: "de",
            }),
        ).rejects.toThrow();
        expect(await dexieStorage.books.list()).toEqual([]);
    });
});

describe("DexieStorage — chapter templates (#731)", () => {
    // The built-ins are seed ROWS of this table, so the cases below need a
    // first-install state. Going through the real seed path also pins that
    // ensureSeeded actually inserts them.
    beforeEach(async () => {
        await ensureSeeded();
    });

    const payload = (name: string, extra: Record<string, unknown> = {}) => ({
        name,
        description: `Beschreibung ${name}`,
        chapter_type: "chapter" as const,
        content: '{"type":"doc","content":[]}',
        ...extra,
    });

    it("seeds the 4 builtins and keeps them read-only", async () => {
        const list = await dexieStorage.chapterTemplates.list();
        const builtins = list.filter((t) => t.is_builtin);
        expect(builtins.map((t) => t.name).sort()).toEqual([
            "FAQ",
            "Interview",
            "Photo Report",
            "Recipe",
        ]);
        // Stable ids so an exported file's child ids keep resolving.
        expect(builtins.every((t) => t.id.startsWith("builtin-"))).toBe(true);

        const interview = builtins.find((t) => t.name === "Interview")!;
        await expect(
            dexieStorage.chapterTemplates.delete(interview.id),
        ).rejects.toMatchObject({ status: 403 });
        await expect(
            dexieStorage.chapterTemplates.update(interview.id, { name: "Neu" }),
        ).rejects.toMatchObject({ status: 403 });
        expect(await dexieStorage.chapterTemplates.get(interview.id)).toMatchObject({
            name: "Interview",
        });
    });

    it("create -> get -> update -> delete round-trip for a user template", async () => {
        const created = await dexieStorage.chapterTemplates.create(payload("Meine Vorlage"));
        expect(created.is_builtin).toBe(false);
        expect(created.language).toBe("en");
        expect(created.child_template_ids).toBeNull();

        const updated = await dexieStorage.chapterTemplates.update(created.id, {
            description: "Geaendert",
        });
        expect(updated.description).toBe("Geaendert");
        expect(updated.name).toBe("Meine Vorlage");
        expect((await dexieStorage.chapterTemplates.get(created.id)).description).toBe(
            "Geaendert",
        );

        await dexieStorage.chapterTemplates.delete(created.id);
        await expect(dexieStorage.chapterTemplates.get(created.id)).rejects.toThrow();
        // The builtins survive a user template's deletion.
        expect(await dexieStorage.chapterTemplates.list()).toHaveLength(4);
    });

    it("rejects a duplicate name with a 409, builtin names included", async () => {
        await dexieStorage.chapterTemplates.create(payload("Einzig"));
        await expect(
            dexieStorage.chapterTemplates.create(payload("Einzig")),
        ).rejects.toMatchObject({ status: 409 });
        await expect(
            dexieStorage.chapterTemplates.create(payload("Interview")),
        ).rejects.toMatchObject({ status: 409 });
    });

    it("lists builtins first, then user templates by name", async () => {
        await dexieStorage.chapterTemplates.create(payload("Zeta"));
        await dexieStorage.chapterTemplates.create(payload("Alpha"));
        const names = (await dexieStorage.chapterTemplates.list()).map((t) => t.name);
        expect(names.slice(0, 4).every((n) => !["Alpha", "Zeta"].includes(n))).toBe(true);
        expect(names.slice(4)).toEqual(["Alpha", "Zeta"]);
    });

    it("validates child_template_ids: unknown, self-reference and cycles", async () => {
        const a = await dexieStorage.chapterTemplates.create(payload("A"));
        const b = await dexieStorage.chapterTemplates.create(
            payload("B", { child_template_ids: [a.id] }),
        );
        expect(b.child_template_ids).toEqual([a.id]);

        await expect(
            dexieStorage.chapterTemplates.create(payload("C", { child_template_ids: ["nope"] })),
        ).rejects.toThrow(/unknown child/i);
        await expect(
            dexieStorage.chapterTemplates.update(a.id, { child_template_ids: [a.id] }),
        ).rejects.toThrow(/itself/i);
        // a -> [b] would close the cycle b -> [a].
        await expect(
            dexieStorage.chapterTemplates.update(a.id, { child_template_ids: [b.id] }),
        ).rejects.toThrow(/cycle/i);
    });

    it("imports a previously exported file and refuses a foreign one", async () => {
        const source = await dexieStorage.chapterTemplates.create(payload("Export-Quelle"));
        const exported = await captureDownload(() =>
            dexieStorage.chapterTemplates.exportJson(source.id),
        );
        // Deleting the source frees the name, so the import is a clean insert.
        await dexieStorage.chapterTemplates.delete(source.id);

        const imported = await dexieStorage.chapterTemplates.importJson(
            new File([exported.text], "t.json", { type: "application/json" }),
        );
        expect(imported.name).toBe("Export-Quelle");
        expect(imported.content).toBe('{"type":"doc","content":[]}');
        // A re-imported file always lands as a user template.
        expect(imported.is_builtin).toBe(false);
        expect(imported.id).not.toBe(source.id);

        await expect(
            dexieStorage.chapterTemplates.importJson(
                new File(['{"hello":"world"}'], "x.json"),
            ),
        ).rejects.toThrow(/format/i);
        // A name that already exists is a 409, same as create.
        await expect(
            dexieStorage.chapterTemplates.importJson(
                new File([exported.text], "t.json"),
            ),
        ).rejects.toMatchObject({ status: 409 });
    });

    it("downloads a builtin as a portable user template", async () => {
        const [builtin] = (await dexieStorage.chapterTemplates.list()).filter(
            (t) => t.is_builtin,
        );
        const download = await captureDownload(() =>
            dexieStorage.chapterTemplates.exportJson(builtin.id),
        );
        // The filename mirrors the backend's Content-Disposition.
        expect(download.filename).toBe(
            `${builtin.name.toLowerCase().replace(/ /g, "-")}.chapter-template.json`,
        );
        const parsed = JSON.parse(download.text);
        expect(parsed.format).toBe("bibliogon-chapter-template");
        expect(parsed.name).toBe(builtin.name);
        // is_builtin is never serialized, so a re-import is a user template.
        expect(parsed).not.toHaveProperty("is_builtin");
    });

    it("rejects exporting an unknown id", async () => {
        await expect(dexieStorage.chapterTemplates.exportJson("nope")).rejects.toThrow();
    });
});

describe("DexieStorage — writing stats (Finding 6)", () => {
    const doc = (text: string): string =>
        JSON.stringify({
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text }] }],
        });

    it("records a per-chapter words-written delta on content update", async () => {
        const book = await dexieStorage.books.create({ title: "Saga" });
        const ch = await dexieStorage.chapters.create(book.id, { title: "One" });

        await dexieStorage.chapters.update(book.id, ch.id, {
            version: 0,
            content: doc("one two three four five"),
        });

        const summary = await dexieStorage.writingStats.summary(90);
        expect(summary.total_words).toBe(5);
        expect(summary.days_active).toBe(1);
        expect(summary.current_streak).toBe(1);
        expect(summary.daily).toHaveLength(1);
    });

    it("floors deletions to zero (gross words, never negative)", async () => {
        const book = await dexieStorage.books.create({ title: "Saga" });
        const ch = await dexieStorage.chapters.create(book.id, {
            title: "One",
            content: doc("a b c d"),
        });

        await dexieStorage.chapters.update(book.id, ch.id, {
            version: 0,
            content: doc("a b c d e f"),
        });
        await dexieStorage.chapters.update(book.id, ch.id, {
            version: 1,
            content: doc("a"),
        });

        const summary = await dexieStorage.writingStats.summary(90);
        expect(summary.total_words).toBe(2);
    });

    it("breaks totals down by book and by chapter", async () => {
        const book = await dexieStorage.books.create({ title: "Alpha" });
        const c1 = await dexieStorage.chapters.create(book.id, { title: "Opening" });
        const c2 = await dexieStorage.chapters.create(book.id, { title: "Middle" });
        await dexieStorage.chapters.update(book.id, c1.id, {
            version: 0,
            content: doc("one two three"),
        });
        await dexieStorage.chapters.update(book.id, c2.id, {
            version: 0,
            content: doc("four five"),
        });

        const byBook = await dexieStorage.writingStats.byBook(90);
        expect(byBook).toHaveLength(1);
        expect(byBook[0]).toMatchObject({ book_id: book.id, total_words: 5 });

        const byChapter = await dexieStorage.writingStats.byChapter(book.id, 90);
        expect(byChapter.map((c) => [c.chapter_title, c.total_words])).toEqual([
            ["Opening", 3],
            ["Middle", 2],
        ]);
    });

    it("summary is empty when no sessions exist", async () => {
        const summary = await dexieStorage.writingStats.summary(90);
        expect(summary.total_words).toBe(0);
        expect(summary.daily).toEqual([]);
        expect(summary.best_day).toBeNull();
    });
});

describe("DexieStorage — articles", () => {
    it("create -> get -> list (status filter) -> update -> delete", async () => {
        const a = await dexieStorage.articles.create({ title: "Notiz" });
        expect(a.status).toBe("draft");
        expect(a.content_type).toBe("blogpost");

        expect((await dexieStorage.articles.get(a.id)).title).toBe("Notiz");
        expect(await dexieStorage.articles.list("draft")).toHaveLength(1);
        expect(await dexieStorage.articles.list("published")).toHaveLength(0);

        const updated = await dexieStorage.articles.update(a.id, {
            title: "Notiz 2",
        });
        expect(updated.title).toBe("Notiz 2");

        await dexieStorage.articles.delete(a.id);
        expect(await dexieStorage.articles.list()).toHaveLength(0);
    });

    it("create produces the ArticleOut API shape (no undefined fields)", async () => {
        // Regression for the offline /articles render crash: an article
        // loaded from Dexie must carry the same defaults the API decoder
        // populates, not undefined. article_metadata in particular is {} on
        // the server; leaving it undefined offline diverges from the online
        // shape that consumers are written against.
        const a = await dexieStorage.articles.create({ title: "Shape" });
        expect(a.article_metadata).toEqual({});
        expect(a.comments_count).toBe(0);
        expect(a.original_published_at).toBeNull();
        expect(a.deleted_at).toBeNull();
        expect(a.tags).toEqual([]);
    });
});

describe("DexieStorage — article assets (#157)", () => {
    it("store -> getBlob round-trips the bytes + mime type", async () => {
        const id = await dexieStorage.articleAssets.store(
            "art-1",
            new Blob(["hello-image"], { type: "image/png" }),
            "featured.png",
        );
        expect(id).toBeTruthy();

        const blob = await dexieStorage.articleAssets.getBlob(id);
        expect(blob).not.toBeNull();
        expect(blob!.type).toBe("image/png");
        expect(await readText(blob!)).toBe("hello-image");
    });

    it("getBlob returns null for an unknown asset id", async () => {
        expect(await dexieStorage.articleAssets.getBlob("nope")).toBeNull();
    });

    it("explicit mimeType overrides the blob type", async () => {
        const id = await dexieStorage.articleAssets.store(
            "art-1",
            new Blob(["x"]),
            "f.webp",
            "image/webp",
        );
        expect((await dexieStorage.articleAssets.getBlob(id))!.type).toBe("image/webp");
    });

    it("deleteByArticle drops only that article's images", async () => {
        const keep = await dexieStorage.articleAssets.store(
            "art-keep",
            new Blob(["k"], { type: "image/png" }),
            "k.png",
        );
        const drop = await dexieStorage.articleAssets.store(
            "art-drop",
            new Blob(["d"], { type: "image/png" }),
            "d.png",
        );
        await dexieStorage.articleAssets.deleteByArticle("art-drop");
        expect(await dexieStorage.articleAssets.getBlob(drop)).toBeNull();
        expect(await dexieStorage.articleAssets.getBlob(keep)).not.toBeNull();
    });

    it("permanent-deleting the article cascades to its cached images (soft-delete keeps them for restore)", async () => {
        const article = await dexieStorage.articles.create({ title: "With image" });
        const assetId = await dexieStorage.articleAssets.store(
            article.id,
            new Blob(["bytes"], { type: "image/jpeg" }),
            "feat.jpg",
        );
        expect(await dexieStorage.articleAssets.getBlob(assetId)).not.toBeNull();

        // Soft-delete (trash) keeps the cached image bytes so a restore
        // brings the article back whole.
        await dexieStorage.articles.delete(article.id);
        expect(await dexieStorage.articleAssets.getBlob(assetId)).not.toBeNull();

        // Permanent delete (from trash) drops the cached image bytes (#157).
        await dexieStorage.articles.permanentDelete(article.id);
        expect(await dexieStorage.articleAssets.getBlob(assetId)).toBeNull();
    });
});

describe("DexieStorage — chapter labels", () => {
    it("create -> list (position order) -> update -> remove round-trip", async () => {
        const first = await dexieStorage.chapterLabels.create("b1", {
            name: "Draft",
            color: "#aaa",
        });
        const second = await dexieStorage.chapterLabels.create("b1", {
            name: "Final",
            color: "#bbb",
        });
        expect(first.position).toBe(0);
        expect(second.position).toBe(1);

        // Scoped to the book + ordered by position.
        await dexieStorage.chapterLabels.create("other", { name: "X", color: "#ccc" });
        const labels = await dexieStorage.chapterLabels.list("b1");
        expect(labels.map((l) => l.name)).toEqual(["Draft", "Final"]);

        const updated = await dexieStorage.chapterLabels.update("b1", first.id, {
            name: "Entwurf",
        });
        expect(updated.name).toBe("Entwurf");
        expect(updated.color).toBe("#aaa");

        await dexieStorage.chapterLabels.remove("b1", first.id);
        expect((await dexieStorage.chapterLabels.list("b1")).map((l) => l.name)).toEqual(["Final"]);
    });
});

describe("DexieStorage — story bible", () => {
    it("entity CRUD + relationships + links + export round-trip", async () => {
        // Entity types come from the seeded registry.
        const types = await dexieStorage.storyBible.listEntityTypes();
        expect(Object.keys(types)).toContain("character");

        const hero = await dexieStorage.storyBible.createEntity("b1", {
            entity_type: "character",
            name: "Hero",
            description: "The protagonist.",
        });
        const villain = await dexieStorage.storyBible.createEntity("b1", {
            entity_type: "character",
            name: "Villain",
            relationships: [{ target_entity_id: hero.id, relationship_type: "rival" }],
        });
        expect(hero.position).toBe(0);
        expect(hero.entity_metadata).toEqual({});

        // List is book-scoped + type/search filterable.
        await dexieStorage.storyBible.createEntity("other", {
            entity_type: "setting",
            name: "Elsewhere",
        });
        expect((await dexieStorage.storyBible.listEntities("b1")).map((e) => e.name)).toEqual([
            "Hero",
            "Villain",
        ]);
        expect(
            (await dexieStorage.storyBible.listEntities("b1", undefined, "vill")).map(
                (e) => e.name,
            ),
        ).toEqual(["Villain"]);

        // Relationships resolve to the full target entity.
        const rels = await dexieStorage.storyBible.getRelationships("b1", villain.id);
        expect(rels).toHaveLength(1);
        expect(rels[0].relationship_type).toBe("rival");
        expect(rels[0].target.name).toBe("Hero");

        // Links embed their entity; appearances + pageEntities read them back.
        const link = await dexieStorage.storyBible.createLink({
            entity_id: hero.id,
            page_id: "p1",
            role: "lead",
        });
        expect(link.entity.name).toBe("Hero");
        expect(
            (await dexieStorage.storyBible.pageEntities("p1")).map((l) => l.entity.name),
        ).toEqual(["Hero"]);
        expect(await dexieStorage.storyBible.appearances(hero.id)).toHaveLength(1);

        // Markdown export groups by type.
        const exported = await dexieStorage.storyBible.exportBible("b1");
        expect(exported.format).toBe("markdown");
        expect(exported.content).toContain("# Story Bible");
        expect(exported.content).toContain("### Hero");

        // Deleting an entity cascades its links + drops stale relationships.
        await dexieStorage.storyBible.deleteEntity(hero.id);
        expect(await dexieStorage.storyBible.appearances(hero.id)).toEqual([]);
        expect(await dexieStorage.storyBible.pageEntities("p1")).toEqual([]);
        expect(await dexieStorage.storyBible.getRelationships("b1", villain.id)).toEqual([]);

        // Text-analysis methods are empty offline (not an error).
        expect(await dexieStorage.storyBible.autoDetect("b1")).toEqual([]);
        expect(await dexieStorage.storyBible.continuityCheck("b1")).toEqual([]);
        // getInfo reports availability so the UI un-gates.
        expect((await dexieStorage.storyBible.getInfo()).plugin).toBe("story-bible");
    });
});

describe("DexieStorage — picture-book pages", () => {
    it("create -> list (order) -> update -> reorder -> delete round-trip", async () => {
        const p1 = await dexieStorage.pages.create("b1", { layout: "text_only" });
        const p2 = await dexieStorage.pages.create("b1", {
            layout: "image_top_text_bottom",
        });
        expect(p1.position).toBe(0);
        expect(p2.position).toBe(1);
        expect(p1.layout_config).toBeNull();

        expect((await dexieStorage.pages.list("b1")).map((p) => p.id)).toEqual([p1.id, p2.id]);

        const updated = await dexieStorage.pages.update("b1", p1.id, {
            text_content: "Hi",
        });
        expect(updated.text_content).toBe("Hi");

        const reordered = await dexieStorage.pages.reorder("b1", [p2.id, p1.id]);
        expect(reordered.map((p) => p.id)).toEqual([p2.id, p1.id]);

        await dexieStorage.pages.delete("b1", p1.id);
        expect((await dexieStorage.pages.list("b1")).map((p) => p.id)).toEqual([p2.id]);
    });
});

describe("DexieStorage — comic panels + bubbles", () => {
    it("panel + bubble CRUD with cascade on delete", async () => {
        const page = await dexieStorage.pages.create("b1", {
            layout: "comic_panel_grid",
        });
        const panel = await dexieStorage.comics.createPanel("b1", page.id, {
            bounds: { x: 0, y: 0, w: 100, h: 100 },
        });
        expect(panel.position).toBe(0);
        expect(await dexieStorage.comics.listPanels("b1", page.id)).toHaveLength(1);

        const bubble = await dexieStorage.comics.createBubble("b1", panel.id, {
            bubble_type: "speech",
            anchor: { x: 50, y: 50 },
        });
        // Backend defaults are mirrored offline.
        expect(bubble.width_pct).toBe(30);
        expect(bubble.tail_direction).toBe("none");
        expect(bubble.tail_length_px).toBe(16);

        const reBubble = await dexieStorage.comics.updateBubble("b1", bubble.id, {
            text_content: "Boom!",
        });
        expect(reBubble.text_content).toBe("Boom!");
        expect(await dexieStorage.comics.listBubbles("b1", panel.id)).toHaveLength(1);

        // Deleting the panel cascades its bubbles; deleting the page cascades
        // its panels.
        await dexieStorage.comics.deletePanel("b1", panel.id);
        expect(await dexieStorage.comics.listBubbles("b1", panel.id)).toEqual([]);

        const panel2 = await dexieStorage.comics.createPanel("b1", page.id, {
            bounds: {},
        });
        await dexieStorage.comics.createBubble("b1", panel2.id, {
            bubble_type: "thought",
            anchor: {},
        });
        await dexieStorage.pages.delete("b1", page.id);
        expect(await dexieStorage.comics.listPanels("b1", page.id)).toEqual([]);
        expect(await dexieStorage.comics.listBubbles("b1", panel2.id)).toEqual([]);

        expect((await dexieStorage.comics.getInfo()).name).toBe("comics");
    });
});

describe("DexieStorage — publishing surfaces (offline defaults)", () => {
    it("returns empty publications/platforms + an empty plugin-status map", async () => {
        // These backend-only reads must resolve to empty offline so opening
        // the article/chapter editor in Dexie mode fires no /api request and
        // never errors. Publishing + plugins stay desktop-only.
        expect(await dexieStorage.publications.list("any-article")).toEqual([]);
        expect(await dexieStorage.articlePlatforms.list()).toEqual({});
        expect(await dexieStorage.editorPluginStatus.get()).toEqual({});
    });
});

describe("DexieStorage — assets (blob round-trip)", () => {
    const makeFile = (name: string, body = "PNGDATA"): File =>
        new File([body], name, { type: "image/png" });

    it("upload -> getBlob (by filename) -> list -> delete", async () => {
        const meta = await dexieStorage.assets.upload("book-1", makeFile("fig.png"), "figure");
        expect(meta.id).toBeTruthy();
        expect(meta.book_id).toBe("book-1");
        expect(meta.filename).toBe("fig.png");
        expect(meta.asset_type).toBe("figure");

        const blob = await dexieStorage.assets.getBlob("book-1", "fig.png");
        expect(blob).not.toBeNull();
        expect(await readText(blob!)).toBe("PNGDATA");

        expect(await dexieStorage.assets.list("book-1")).toHaveLength(1);

        await dexieStorage.assets.delete("book-1", meta.id);
        expect(await dexieStorage.assets.list("book-1")).toHaveLength(0);
        expect(await dexieStorage.assets.getBlob("book-1", "fig.png")).toBeNull();
    });

    it("re-upload of the same filename replaces (no duplicate row)", async () => {
        await dexieStorage.assets.upload("b", makeFile("x.png", "v1"), "figure");
        await dexieStorage.assets.upload("b", makeFile("x.png", "v2"), "figure");
        const rows = await dexieStorage.assets.list("b");
        expect(rows).toHaveLength(1);
        const blob = await dexieStorage.assets.getBlob("b", "x.png");
        expect(await readText(blob!)).toBe("v2");
    });

    it("sanitizes unsafe filenames to a bare basename", async () => {
        const meta = await dexieStorage.assets.upload("b", makeFile("../../etc/p w.png"), "figure");
        expect(meta.filename).toBe("p_w.png");
    });

    it("getBlob is scoped per book (same filename, different book)", async () => {
        await dexieStorage.assets.upload("b1", makeFile("same.png", "one"), "figure");
        await dexieStorage.assets.upload("b2", makeFile("same.png", "two"), "figure");
        const b1 = await dexieStorage.assets.getBlob("b1", "same.png");
        const b2 = await dexieStorage.assets.getBlob("b2", "same.png");
        expect(await readText(b1!)).toBe("one");
        expect(await readText(b2!)).toBe("two");
    });

    it("cacheBlob stores bytes retrievable by filename", async () => {
        await dexieStorage.assets.cacheBlob(
            "b",
            "cached.png",
            new Blob(["bytes"], { type: "image/png" }),
        );
        const blob = await dexieStorage.assets.getBlob("b", "cached.png");
        expect(await readText(blob!)).toBe("bytes");
    });
});

describe("DexieStorage — covers", () => {
    it("upload stores a cover-{id} blob + returns the cover_image path", async () => {
        const resp = await dexieStorage.covers.upload(
            "bk",
            new File(["JPGDATA"], "my-cover.jpg", { type: "image/jpeg" }),
        );
        expect(resp.filename).toBe("cover-bk.jpg");
        expect(resp.cover_image).toBe("assets/covers/cover-bk.jpg");

        const blob = await dexieStorage.assets.getBlob("bk", "cover-bk.jpg");
        expect(await readText(blob!)).toBe("JPGDATA");
    });

    it("delete removes the cover blob(s) for the book", async () => {
        await dexieStorage.covers.upload("bk", new File(["x"], "c.png", { type: "image/png" }));
        await dexieStorage.covers.delete("bk");
        expect(await dexieStorage.assets.getBlob("bk", "cover-bk.png")).toBeNull();
    });

    it("upload auto-saves book.cover_image so it survives without an explicit save (#344)", async () => {
        const book = await dexieStorage.books.create({ title: "Mit Cover" });
        expect(book.cover_image).toBeFalsy();

        const resp = await dexieStorage.covers.upload(
            book.id,
            new File(["JPGDATA"], "art.jpg", { type: "image/jpeg" }),
        );

        const persisted = await dexieStorage.books.get(book.id);
        expect(persisted.cover_image).toBe(resp.cover_image);
        expect(persisted.cover_image).toBe(`assets/covers/cover-${book.id}.jpg`);
    });

    it("delete auto-clears book.cover_image (#344)", async () => {
        const book = await dexieStorage.books.create({ title: "Cover entfernen" });
        await dexieStorage.covers.upload(
            book.id,
            new File(["x"], "c.png", { type: "image/png" }),
        );
        expect((await dexieStorage.books.get(book.id)).cover_image).toBeTruthy();

        await dexieStorage.covers.delete(book.id);
        expect((await dexieStorage.books.get(book.id)).cover_image).toBeNull();
    });
});

describe("DexieStorage — comments (admin + trash lifecycle)", () => {
    let seq = 0;
    const makeComment = (over: Partial<import("../api/client").ArticleComment> = {}) => {
        seq += 1;
        const ts = `2020-01-${String(seq).padStart(2, "0")}T00:00:00Z`;
        return {
            id: `c${seq}`,
            author: "Reader",
            body_text: "Nice post!",
            body_json: null,
            language: "en",
            published_at: null,
            canonical_url: null,
            responds_to_article_id: null,
            responds_to_url: null,
            imported_from: "medium",
            imported_at: ts,
            source_filename: "x.html",
            created_at: ts,
            updated_at: ts,
            ...over,
        };
    };

    it("create -> list -> soft-delete -> listTrashed -> restore", async () => {
        await dexieStorage.comments.create(makeComment({ id: "k1" }));
        expect((await dexieStorage.comments.list()).map((c) => c.id)).toEqual(["k1"]);
        // Returned shape has no deleted_at (matches the API ArticleComment).
        expect("deleted_at" in (await dexieStorage.comments.list())[0]).toBe(false);

        await dexieStorage.comments.delete("k1");
        expect(await dexieStorage.comments.list()).toHaveLength(0);
        expect((await dexieStorage.comments.listTrashed()).map((c) => c.id)).toEqual(["k1"]);

        await dexieStorage.comments.restore("k1");
        expect((await dexieStorage.comments.list()).map((c) => c.id)).toEqual(["k1"]);
        expect(await dexieStorage.comments.listTrashed()).toHaveLength(0);
    });

    it("scopes getComments to one article, newest-first (#729)", async () => {
        await dexieStorage.comments.create(
            makeComment({ id: "mine-old", responds_to_article_id: "art-1" }),
        );
        await dexieStorage.comments.create(
            makeComment({ id: "mine-new", responds_to_article_id: "art-1" }),
        );
        await dexieStorage.comments.create(
            makeComment({ id: "theirs", responds_to_article_id: "art-2" }),
        );
        await dexieStorage.comments.create(
            makeComment({ id: "orphan", responds_to_article_id: null }),
        );

        const rows = await dexieStorage.articles.getComments("art-1");

        // Only this article's comments, and the same newest-first order the
        // admin list uses, so the panel reads identically in both modes.
        expect(rows.map((c) => c.id)).toEqual(["mine-new", "mine-old"]);
        expect("deleted_at" in rows[0]).toBe(false);
    });

    it("getComments excludes trashed comments and unknown articles (#729)", async () => {
        await dexieStorage.comments.create(
            makeComment({ id: "kept", responds_to_article_id: "art-1" }),
        );
        await dexieStorage.comments.create(
            makeComment({ id: "trashed", responds_to_article_id: "art-1" }),
        );
        await dexieStorage.comments.delete("trashed");

        expect((await dexieStorage.articles.getComments("art-1")).map((c) => c.id)).toEqual([
            "kept",
        ]);
        // An article nobody commented on reads as empty, not as an error -
        // the panel's empty state is a legitimate answer.
        expect(await dexieStorage.articles.getComments("art-unknown")).toEqual([]);
    });

    it("filters by importedFrom + orphansOnly, orders newest-first, caps to limit", async () => {
        await dexieStorage.comments.create(
            makeComment({ id: "a", imported_from: "medium", responds_to_article_id: null }),
        );
        await dexieStorage.comments.create(
            makeComment({ id: "b", imported_from: "medium", responds_to_article_id: "art-1" }),
        );
        await dexieStorage.comments.create(
            makeComment({ id: "c", imported_from: "manual", responds_to_article_id: null }),
        );

        const medium = await dexieStorage.comments.list({ importedFrom: "medium" });
        expect(medium.map((c) => c.id).sort()).toEqual(["a", "b"]);
        const orphans = await dexieStorage.comments.list({ orphansOnly: true });
        expect(orphans.map((c) => c.id).sort()).toEqual(["a", "c"]);
        // Newest created_at first; limit clamps.
        expect(await dexieStorage.comments.list({ limit: 1 })).toHaveLength(1);
    });

    it("bulkDelete (soft) -> bulkRestore; bulkDelete (permanent) hard-removes", async () => {
        await dexieStorage.comments.create(makeComment({ id: "p1" }));
        await dexieStorage.comments.create(makeComment({ id: "p2" }));
        const res = await dexieStorage.comments.bulkDelete(["p1", "p2"], false);
        expect(res.deleted_count).toBe(2);
        expect(await dexieStorage.comments.list()).toHaveLength(0);
        await dexieStorage.comments.bulkRestore(["p1", "p2"]);
        expect(await dexieStorage.comments.list()).toHaveLength(2);

        await dexieStorage.comments.bulkDelete(["p1"], true);
        expect(await offlineDb.articleComments.get("p1")).toBeUndefined();
    });

    it("permanentDelete + emptyTrash hard-remove trashed rows", async () => {
        await dexieStorage.comments.create(makeComment({ id: "t1" }));
        await dexieStorage.comments.create(makeComment({ id: "t2" }));
        await dexieStorage.comments.delete("t1");
        await dexieStorage.comments.delete("t2");
        await dexieStorage.comments.permanentDelete("t1");
        expect(await offlineDb.articleComments.get("t1")).toBeUndefined();
        await dexieStorage.comments.emptyTrash();
        expect(await offlineDb.articleComments.count()).toBe(0);
    });

    it("reclassifyAsArticle creates an article from the comment + removes it", async () => {
        await dexieStorage.comments.create(
            makeComment({ id: "r1", body_text: "This deserves its own piece.", author: "Sam" }),
        );
        const result = await dexieStorage.comments.reclassifyAsArticle("r1");
        expect(result.success).toBe(true);
        expect(result.deleted_comment_id).toBe("r1");
        expect(await offlineDb.articleComments.get("r1")).toBeUndefined();
        const article = await offlineDb.articles.get(result.article_id);
        expect(article?.title).toBe("This deserves its own piece.");
        expect(article?.author).toBe("Sam");
        expect(article?.content_json).toContain("This deserves its own piece.");
    });
});

describe("DexieStorage — concurrent read-modify-write (serializedUpdate)", () => {
    // Each update is a get -> shallow-merge -> put. Before serialization, two
    // near-simultaneous updates to the SAME record both read the pre-other
    // state, and the later put() (built from a stale read) dropped the other
    // call's field. These pin that two concurrent updates writing DIFFERENT
    // fields of one record both survive. They FAIL on the pre-serialization
    // code (one field is clobbered); they pass once serializedUpdate chains
    // the writes per record.

    it("chapters.update: concurrent title + content updates both persist", async () => {
        const book = await dexieStorage.books.create({ title: "B" });
        const ch = await dexieStorage.chapters.create(book.id, { title: "Orig" });

        await Promise.all([
            dexieStorage.chapters.update(book.id, ch.id, {
                version: ch.version,
                title: "New Title",
            }),
            dexieStorage.chapters.update(book.id, ch.id, {
                version: ch.version,
                content: '{"type":"doc","content":[]}',
            }),
        ]);

        const got = await dexieStorage.chapters.get(book.id, ch.id);
        expect(got.title).toBe("New Title");
        expect(got.content).toBe('{"type":"doc","content":[]}');
    });

    it("articles.update: concurrent title + content_json updates both persist", async () => {
        const article = await dexieStorage.articles.create({ title: "Orig" });

        await Promise.all([
            dexieStorage.articles.update(article.id, { title: "New Title" }),
            dexieStorage.articles.update(article.id, {
                content_json: '{"type":"doc","content":[{"type":"paragraph"}]}',
            }),
        ]);

        const got = await dexieStorage.articles.get(article.id);
        expect(got.title).toBe("New Title");
        expect(got.content_json).toBe('{"type":"doc","content":[{"type":"paragraph"}]}');
    });

    it("books.update: concurrent title + subtitle updates both persist", async () => {
        const book = await dexieStorage.books.create({ title: "Orig" });

        await Promise.all([
            dexieStorage.books.update(book.id, { title: "New Title" }),
            dexieStorage.books.update(book.id, { subtitle: "New Subtitle" }),
        ]);

        const got = await dexieStorage.books.get(book.id);
        expect(got.title).toBe("New Title");
        expect(got.subtitle).toBe("New Subtitle");
    });

    it("different records are not serialized against each other (per-(table,id) keying)", async () => {
        const a = await dexieStorage.books.create({ title: "A" });
        const b = await dexieStorage.books.create({ title: "B" });

        // Two concurrent field-updates per book, across two distinct records.
        // Each book's own pair must serialize (both fields survive), while the
        // two books proceed on independent queues - a single global queue would
        // still be correct here, so the value of this test is guarding that the
        // key is per-record (different ids never block or clobber one another).
        await Promise.all([
            dexieStorage.books.update(a.id, { title: "A2" }),
            dexieStorage.books.update(a.id, { subtitle: "A-sub" }),
            dexieStorage.books.update(b.id, { title: "B2" }),
            dexieStorage.books.update(b.id, { subtitle: "B-sub" }),
        ]);

        const gotA = await dexieStorage.books.get(a.id);
        const gotB = await dexieStorage.books.get(b.id);
        expect(gotA.title).toBe("A2");
        expect(gotA.subtitle).toBe("A-sub");
        expect(gotB.title).toBe("B2");
        expect(gotB.subtitle).toBe("B-sub");
    });
});

describe("DexieStorage — articles trash + bulk (offline seam, Bug fix)", () => {
  it("soft bulkDelete moves to trash; list excludes, listTrash includes; bulkRestore brings back", async () => {
    const a1 = await dexieStorage.articles.create({ title: "A1" });
    const a2 = await dexieStorage.articles.create({ title: "A2" });
    const a3 = await dexieStorage.articles.create({ title: "A3" });
    expect(await dexieStorage.articles.list()).toHaveLength(3);

    const res = await dexieStorage.articles.bulkDelete([a1.id, a2.id], false);
    expect(res.deleted_count).toBe(2);
    expect((await dexieStorage.articles.list()).map((a) => a.id)).toEqual([
      a3.id,
    ]);
    const trashIds = (await dexieStorage.articles.listTrash()).map((a) => a.id);
    expect(trashIds.sort()).toEqual([a1.id, a2.id].sort());

    const restored = await dexieStorage.articles.bulkRestore([a1.id, a2.id]);
    expect(restored.restored_count).toBe(2);
    expect(await dexieStorage.articles.list()).toHaveLength(3);
    expect(await dexieStorage.articles.listTrash()).toHaveLength(0);
  });

  it("permanent bulkDelete hard-deletes (not recoverable)", async () => {
    const a1 = await dexieStorage.articles.create({ title: "A1" });
    await dexieStorage.articles.bulkDelete([a1.id], true);
    expect(await dexieStorage.articles.list()).toHaveLength(0);
    expect(await dexieStorage.articles.listTrash()).toHaveLength(0);
  });

  // Bug 1 (offline ConvertToBookWizard): the wizard called
  // api.books.fromArticles directly, which guardedFetch rejects on the
  // backendless build, so "Buch erstellen" did nothing. The fix routes
  // through getStorage(); this pins the offline conversion path.
  it("books.fromArticles builds a book + chapters from articles offline", async () => {
    const a1 = await dexieStorage.articles.create({ title: "First" });
    const a2 = await dexieStorage.articles.create({ title: "Second" });
    await dexieStorage.articles.update(a1.id, {
      content_json: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"alpha body"}]}]}',
      tags: ["Shared", "OnlyA"],
    });
    await dexieStorage.articles.update(a2.id, {
      content_json: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"beta body"}]}]}',
      tags: ["shared", "OnlyB"],
    });

    const book = await dexieStorage.books.fromArticles({
      article_ids: [a1.id, a2.id],
      title: "Collected",
      author: "Aster",
      sort_strategy: "manual",
      manual_order: [a2.id, a1.id],
      keywords: ["Extra"],
      front_matter: { include_title_page: true },
      chapter_settings: { use_article_title_as_chapter_title: true },
    });

    expect(book.title).toBe("Collected");
    expect(book.author).toBe("Aster");
    // Keywords: explicit "Extra" first, then article tags, deduped casefold
    // ("Shared" + "shared" collapse to one).
    expect(book.keywords).toEqual(["Extra", "Shared", "OnlyA", "OnlyB"]);

    // The book persisted into Dexie (no API call involved).
    expect((await dexieStorage.books.list()).map((b) => b.id)).toContain(book.id);

    const chapters = await dexieStorage.chapters.list(book.id);
    expect(chapters.map((c) => c.chapter_type)).toEqual([
      "title_page",
      "chapter",
      "chapter",
    ]);
    // Manual order [a2, a1] => Second before First.
    expect(chapters.map((c) => c.title)).toEqual(["Collected", "Second", "First"]);
    expect(chapters[1].content).toContain("beta body");
    expect(chapters[2].content).toContain("alpha body");
  });

  it("single delete soft-deletes; restore + permanentDelete + emptyTrash work", async () => {
    const a1 = await dexieStorage.articles.create({ title: "A1" });
    await dexieStorage.articles.delete(a1.id);
    expect(await dexieStorage.articles.list()).toHaveLength(0);
    expect(await dexieStorage.articles.listTrash()).toHaveLength(1);

    const restored = await dexieStorage.articles.restore(a1.id);
    expect(restored.id).toBe(a1.id);
    expect(await dexieStorage.articles.list()).toHaveLength(1);

    await dexieStorage.articles.delete(a1.id);
    await dexieStorage.articles.emptyTrash();
    expect(await dexieStorage.articles.listTrash()).toHaveLength(0);
  });
});
