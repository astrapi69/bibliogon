/**
 * Offline A+ documents (#891): the Dexie namespace behind
 * `getStorage().aplusDocuments`, so the editor works in the web app and on
 * a phone without a backend.
 */

import { beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";

import { __resetSeedForTests, dexieStorage, offlineDb } from "../../dexie-storage";
import { removeBookGraph } from "../graph";

const DOC = {
    content_name: "El caballo que se reía - A+Content",
    short_description: "Filimón sabe reír.",
    bullets: [{ heading: "Uno", body: "Primero." }],
    modules: [
        {
            id: "m1",
            template: "image_header_text",
            module_title: "El caballo",
            slots: [{ title: "T", text: "x", image_prompt: "farm --ar 97:60", alt_text: "Granja" }],
        },
    ],
};

beforeEach(async () => {
    await Promise.all(offlineDb.tables.map((t) => t.clear()));
    __resetSeedForTests();
});

describe("dexie aplusDocuments", () => {
    it("returns null before anything was saved", async () => {
        expect(await dexieStorage.aplusDocuments.get("b1", "es")).toBeNull();
    });

    it("saves and reads back the document with its record metadata", async () => {
        const saved = await dexieStorage.aplusDocuments.save("b1", "es", DOC);
        expect(saved).toMatchObject({ ...DOC, book_id: "b1", language: "es" });
        expect(saved.updated_at).toBeTruthy();
        const loaded = await dexieStorage.aplusDocuments.get("b1", "es");
        expect(loaded).toEqual(saved);
        expect(loaded).not.toHaveProperty("id");
    });

    it("replaces in place on a second save (one row per book and language)", async () => {
        await dexieStorage.aplusDocuments.save("b1", "es", DOC);
        await dexieStorage.aplusDocuments.save("b1", "es", { ...DOC, content_name: "Neu" });
        expect((await dexieStorage.aplusDocuments.get("b1", "es"))?.content_name).toBe("Neu");
        expect(await offlineDb.aplusDocuments.count()).toBe(1);
    });

    it("keeps languages and books apart and lists one book's documents by language", async () => {
        await dexieStorage.aplusDocuments.save("b1", "es", DOC);
        await dexieStorage.aplusDocuments.save("b1", "de", { ...DOC, content_name: "Deutsch" });
        await dexieStorage.aplusDocuments.save("b2", "es", DOC);
        const list = await dexieStorage.aplusDocuments.listForBook("b1");
        expect(list.map((d) => d.language)).toEqual(["de", "es"]);
        expect(list.every((d) => d.book_id === "b1")).toBe(true);
    });

    it("removes only the given language", async () => {
        await dexieStorage.aplusDocuments.save("b1", "es", DOC);
        await dexieStorage.aplusDocuments.save("b1", "de", DOC);
        await dexieStorage.aplusDocuments.remove("b1", "es");
        expect(await dexieStorage.aplusDocuments.get("b1", "es")).toBeNull();
        expect(await dexieStorage.aplusDocuments.get("b1", "de")).not.toBeNull();
    });

    it("two concurrent saves of the same document both land, the last one wins", async () => {
        await Promise.all([
            dexieStorage.aplusDocuments.save("b1", "es", { ...DOC, content_name: "eins" }),
            dexieStorage.aplusDocuments.save("b1", "es", { ...DOC, content_name: "zwei" }),
        ]);
        expect(await offlineDb.aplusDocuments.count()).toBe(1);
        expect((await dexieStorage.aplusDocuments.get("b1", "es"))?.content_name).toBe("zwei");
    });

    it("soft delete keeps the document, permanent delete of the book removes it", async () => {
        const book = await dexieStorage.books.create({ title: "Buch" });
        await dexieStorage.aplusDocuments.save(book.id, "es", DOC);
        await dexieStorage.books.delete(book.id);
        expect(await dexieStorage.aplusDocuments.get(book.id, "es")).not.toBeNull();
        await dexieStorage.books.permanentDelete(book.id);
        expect(await dexieStorage.aplusDocuments.listForBook(book.id)).toEqual([]);
    });

    it("dropping a book from the offline graph drops its documents", async () => {
        const book = await dexieStorage.books.create({ title: "Buch" });
        await dexieStorage.aplusDocuments.save(book.id, "es", DOC);
        await removeBookGraph(book.id);
        expect(await dexieStorage.aplusDocuments.listForBook(book.id)).toEqual([]);
    });
});
