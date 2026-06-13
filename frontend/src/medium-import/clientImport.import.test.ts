/**
 * Client Medium import — create/dedup step tests (#34 P4 C2).
 *
 * Exercises importParsed against the real DexieStorage (fake-indexeddb), so
 * the create+update round-trip, dedup, and comment-skip are verified end to
 * end rather than through a mock.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";

import { offlineDb } from "../storage/dexie-storage";

vi.mock("../storage", async () => {
  const dx = await vi.importActual<typeof import("../storage/dexie-storage")>(
    "../storage/dexie-storage",
  );
  return { getStorage: () => dx.dexieStorage };
});

import { importParsed, type ClientImportSettings } from "./clientImport";
import type { ParsedPost } from "./walker";

const SETTINGS: ClientImportSettings = {
  defaultStatus: "draft",
  defaultLanguage: "en",
  skipExistingCanonicalUrls: true,
};

const makeParsed = (over: Partial<ParsedPost>): ParsedPost => ({
  title: "Title",
  subtitle: "",
  canonicalUrl: "https://medium.com/@x/post",
  publishedAt: null,
  author: "Author",
  contentDoc: {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "hello world" }] }],
  },
  images: [],
  warnings: [],
  detectedLanguage: null,
  isComment: false,
  ...over,
});

beforeEach(async () => {
  await Promise.all(offlineDb.tables.map((t) => t.clear()));
});

describe("importParsed", () => {
  it("creates an article with full body + SEO defaults", async () => {
    const parsed = new Map([
      [
        "a.html",
        makeParsed({
          title: "My Post",
          subtitle: "A subtitle",
          canonicalUrl: "https://medium.com/@x/my-post",
        }),
      ],
    ]);
    const res = await importParsed(parsed, ["a.html"], SETTINGS);
    expect(res.imported_count).toBe(1);
    expect(res.imported[0].title).toBe("My Post");

    const rows = await offlineDb.articles.toArray();
    expect(rows).toHaveLength(1);
    const art = rows[0];
    expect(art.canonical_url).toBe("https://medium.com/@x/my-post");
    expect(art.status).toBe("draft");
    expect(art.language).toBe("en");
    expect(art.seo_title).toBe("My Post");
    expect(art.seo_description).toBe("A subtitle");
    expect(art.content_json).toContain("hello world");
  });

  it("uses the detected language over the default", async () => {
    const parsed = new Map([
      ["g.html", makeParsed({ detectedLanguage: "el", canonicalUrl: "https://m/el" })],
    ]);
    await importParsed(parsed, ["g.html"], SETTINGS);
    const art = (await offlineDb.articles.toArray())[0];
    expect(art.language).toBe("el");
  });

  it("creates comment-classified posts in the offline comments store", async () => {
    const parsed = new Map([
      [
        "c.html",
        makeParsed({
          isComment: true,
          canonicalUrl: "https://m/c",
          author: "Reader",
          contentDoc: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Nice post!" }] }],
          },
        }),
      ],
    ]);
    const res = await importParsed(parsed, ["c.html"], SETTINGS);
    expect(res.imported_count).toBe(0);
    expect(res.imported_comments_count).toBe(1);
    expect(res.imported_comments?.[0].filename).toBe("c.html");
    expect(res.skipped_comments_count).toBe(0);
    // Created as a comment, not an article.
    expect(await offlineDb.articles.count()).toBe(0);
    expect(await offlineDb.articleComments.count()).toBe(1);
    const comment = (await offlineDb.articleComments.toArray())[0];
    expect(comment.imported_from).toBe("medium");
    expect(comment.body_text).toContain("Nice post!");
    expect(comment.responds_to_article_id).toBeNull();
  });

  it("dedups against an existing canonical_url (skipExistingCanonicalUrls)", async () => {
    // Seed an existing article with the same canonical_url.
    await offlineDb.articles.add({
      id: "existing-1",
      canonical_url: "https://m/dup",
      // minimal shape for the dedup map (other fields irrelevant here)
    } as never);
    const parsed = new Map([
      ["d.html", makeParsed({ canonicalUrl: "https://m/dup" })],
    ]);
    const res = await importParsed(parsed, ["d.html"], SETTINGS);
    expect(res.imported_count).toBe(0);
    expect(res.skipped_count).toBe(1);
    expect(res.skipped[0]).toEqual({
      filename: "d.html",
      canonical_url: "https://m/dup",
      existing_article_id: "existing-1",
    });
  });

  it("dedups within the same batch (two files, one URL)", async () => {
    const parsed = new Map([
      ["1.html", makeParsed({ canonicalUrl: "https://m/same", title: "First" })],
      ["2.html", makeParsed({ canonicalUrl: "https://m/same", title: "Second" })],
    ]);
    const res = await importParsed(parsed, ["1.html", "2.html"], SETTINGS);
    expect(res.imported_count).toBe(1);
    expect(res.skipped_count).toBe(1);
  });

  it("errors a post with no canonical URL (batch continues)", async () => {
    const parsed = new Map([
      ["ok.html", makeParsed({ canonicalUrl: "https://m/ok" })],
      ["bad.html", makeParsed({ canonicalUrl: "" })],
    ]);
    const res = await importParsed(parsed, ["ok.html", "bad.html"], SETTINGS);
    expect(res.imported_count).toBe(1);
    expect(res.errored_count).toBe(1);
    expect(res.errored[0].filename).toBe("bad.html");
  });

  it("reports progress once per selected post with a running tally (#133)", async () => {
    const parsed = new Map([
      ["a.html", makeParsed({ canonicalUrl: "https://m/a" })],
      ["b.html", makeParsed({ canonicalUrl: "https://m/b" })],
    ]);
    const onProgress = vi.fn();
    await importParsed(parsed, ["a.html", "b.html"], SETTINGS, onProgress);

    expect(onProgress).toHaveBeenCalledTimes(2);
    // First post: nothing done yet.
    expect(onProgress).toHaveBeenNthCalledWith(1, {
      current: 1,
      total: 2,
      filename: "a.html",
      imported: 0,
      skipped: 0,
      errored: 0,
      importedComments: 0,
    });
    // Second post: the first article is already imported.
    expect(onProgress).toHaveBeenNthCalledWith(2, {
      current: 2,
      total: 2,
      filename: "b.html",
      imported: 1,
      skipped: 0,
      errored: 0,
      importedComments: 0,
    });
  });
});
