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
    expect((await dexieStorage.chapterLabels.list("b1")).map((l) => l.name)).toEqual([
      "Final",
    ]);
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
    expect((await dexieStorage.storyBible.pageEntities("p1")).map((l) => l.entity.name)).toEqual([
      "Hero",
    ]);
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
