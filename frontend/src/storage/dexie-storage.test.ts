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
