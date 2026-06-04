/**
 * DexieStorage round-trips (mobile-sync Phase 3, C1).
 *
 * Exercises the IndexedDB CRUD path for each method-backed domain
 * (books, chapters, articles) via fake-indexeddb, including the
 * book->chapter cascade-on-delete and chapter reorder/version bump.
 */

import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { dexieStorage, offlineDb } from "./dexie-storage";

beforeEach(async () => {
  await Promise.all(offlineDb.tables.map((t) => t.clear()));
});

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

  it("get(id, true) embeds chapters sorted by position; delete cascades them", async () => {
    const book = await dexieStorage.books.create({ title: "Mit Kapiteln" });
    await dexieStorage.chapters.create(book.id, { title: "Zwei", position: 1 });
    await dexieStorage.chapters.create(book.id, { title: "Eins", position: 0 });

    const detail = await dexieStorage.books.get(book.id, true);
    expect(detail.chapters.map((c) => c.title)).toEqual(["Eins", "Zwei"]);

    await dexieStorage.books.delete(book.id);
    expect(await dexieStorage.chapters.list(book.id)).toHaveLength(0);
  });

  it("get throws for an id that is not offline-available", async () => {
    await expect(dexieStorage.books.get("nope")).rejects.toThrow(
      /not available offline/,
    );
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

    const reordered = await dexieStorage.chapters.reorder(book.id, [
      c2.id,
      c1.id,
    ]);
    expect(reordered.map((c) => c.id)).toEqual([c2.id, c1.id]);

    await dexieStorage.chapters.delete(book.id, c1.id);
    expect(await dexieStorage.chapters.list(book.id)).toHaveLength(1);
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
});
