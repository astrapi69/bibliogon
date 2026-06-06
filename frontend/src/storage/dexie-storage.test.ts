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

/** Read a (reconstructed) Blob's bytes as text via arrayBuffer. */
const readText = async (blob: Blob): Promise<string> =>
  new TextDecoder().decode(await blob.arrayBuffer());

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

describe("DexieStorage — picture-book pages", () => {
  it("create -> list (order) -> update -> reorder -> delete round-trip", async () => {
    const p1 = await dexieStorage.pages.create("b1", { layout: "text_only" });
    const p2 = await dexieStorage.pages.create("b1", {
      layout: "image_top_text_bottom",
    });
    expect(p1.position).toBe(0);
    expect(p2.position).toBe(1);
    expect(p1.layout_config).toBeNull();

    expect((await dexieStorage.pages.list("b1")).map((p) => p.id)).toEqual([
      p1.id,
      p2.id,
    ]);

    const updated = await dexieStorage.pages.update("b1", p1.id, {
      text_content: "Hi",
    });
    expect(updated.text_content).toBe("Hi");

    const reordered = await dexieStorage.pages.reorder("b1", [p2.id, p1.id]);
    expect(reordered.map((p) => p.id)).toEqual([p2.id, p1.id]);

    await dexieStorage.pages.delete("b1", p1.id);
    expect((await dexieStorage.pages.list("b1")).map((p) => p.id)).toEqual([
      p2.id,
    ]);
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
    expect((await dexieStorage.comics.listPanels("b1", page.id))).toHaveLength(1);

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
    expect((await dexieStorage.comics.listBubbles("b1", panel.id))).toHaveLength(1);

    // Deleting the panel cascades its bubbles; deleting the page cascades
    // its panels.
    await dexieStorage.comics.deletePanel("b1", panel.id);
    expect((await dexieStorage.comics.listBubbles("b1", panel.id))).toEqual([]);

    const panel2 = await dexieStorage.comics.createPanel("b1", page.id, {
      bounds: {},
    });
    await dexieStorage.comics.createBubble("b1", panel2.id, {
      bubble_type: "thought",
      anchor: {},
    });
    await dexieStorage.pages.delete("b1", page.id);
    expect((await dexieStorage.comics.listPanels("b1", page.id))).toEqual([]);
    expect((await dexieStorage.comics.listBubbles("b1", panel2.id))).toEqual([]);

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
    const meta = await dexieStorage.assets.upload(
      "book-1",
      makeFile("fig.png"),
      "figure",
    );
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
    const meta = await dexieStorage.assets.upload(
      "b",
      makeFile("../../etc/p w.png"),
      "figure",
    );
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
    await dexieStorage.covers.upload(
      "bk",
      new File(["x"], "c.png", { type: "image/png" }),
    );
    await dexieStorage.covers.delete("bk");
    expect(await dexieStorage.assets.getBlob("bk", "cover-bk.png")).toBeNull();
  });
});
