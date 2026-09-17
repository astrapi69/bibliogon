/**
 * Client Medium import — create/dedup step tests (#34 P4 C2).
 *
 * Exercises importParsed against the real DexieStorage (fake-indexeddb), so
 * the create+update round-trip, dedup, and comment-skip are verified end to
 * end rather than through a mock.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "fake-indexeddb/auto";

import { dexieStorage, offlineDb } from "../storage/dexie-storage";

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
    // No real network in tests. #157 image caching treats a failed fetch as
    // "keep the URL, leave the asset id unset"; tests that exercise the
    // success path override this stub.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no network in tests")));
});

afterEach(() => {
    vi.unstubAllGlobals();
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
                        content: [
                            { type: "paragraph", content: [{ type: "text", text: "Nice post!" }] },
                        ],
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
        const parsed = new Map([["d.html", makeParsed({ canonicalUrl: "https://m/dup" })]]);
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

    it("sets featured_image_url to the first body image, stored locally (#134, #882)", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                headers: new Headers({ "Content-Type": "image/png" }),
                blob: async () => new Blob(["img"], { type: "image/png" }),
            }),
        );
        const parsed = new Map([
            [
                "withimg.html",
                makeParsed({
                    canonicalUrl: "https://m/withimg",
                    images: [
                        {
                            src: "https://cdn-images-1.medium.com/first.png",
                            alt: "",
                            caption: "",
                            dataImageId: "",
                        },
                        {
                            src: "https://cdn-images-1.medium.com/second.png",
                            alt: "",
                            caption: "",
                            dataImageId: "",
                        },
                    ],
                }),
            ],
            ["noimg.html", makeParsed({ canonicalUrl: "https://m/noimg", images: [] })],
        ]);
        await importParsed(parsed, ["withimg.html", "noimg.html"], SETTINGS);

        const rows = await offlineDb.articles.toArray();
        const withImg = rows.find((r) => r.canonical_url === "https://m/withimg");
        const noImg = rows.find((r) => r.canonical_url === "https://m/noimg");
        expect(withImg?.featured_image_url).toBe(
            `/api/articles/${withImg?.id}/assets/file/first.png`,
        );
        expect(noImg?.featured_image_url).toBeNull();
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

describe("importParsed — images are always stored locally (#157, #882)", () => {
    const FIG = (src: string) => ({ type: "imageFigure", attrs: { src, alt: "" } });
    const post = (srcs: string[]): ParsedPost =>
        makeParsed({
            canonicalUrl: "https://medium.com/@x/with-image",
            images: srcs.map((src) => ({ src, alt: "", caption: "", dataImageId: "" })),
            contentDoc: {
                type: "doc",
                content: [
                    ...srcs.map(FIG),
                    { type: "paragraph", content: [{ type: "text", text: "body" }] },
                ],
            },
        });
    const okFetch = () =>
        vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: new Headers({ "Content-Type": "image/png" }),
            blob: async () => new Blob(["img-bytes"], { type: "image/png" }),
        });

    it("stores every body image and rewrites the body to local asset URLs", async () => {
        vi.stubGlobal("fetch", okFetch());
        const srcs = [
            "https://cdn-images-1.medium.com/max/800/feat.png?q=20",
            "https://miro.medium.com/v2/resize:fit:800/inline.png",
        ];
        const result = await importParsed(new Map([["a.html", post(srcs)]]), ["a.html"], SETTINGS);
        expect(result.imported_count).toBe(1);
        const id = result.imported[0].id;
        const article = await dexieStorage.articles.get(id);

        const body = JSON.parse(article.content_json as string);
        expect(body.content[0].attrs.src).toBe(`/api/articles/${id}/assets/file/feat.png`);
        expect(body.content[1].attrs.src).toBe(`/api/articles/${id}/assets/file/inline.png`);
        expect(article.featured_image_url).toBe(`/api/articles/${id}/assets/file/feat.png`);
        expect(article.featured_image_asset_id).toBeTruthy();

        const assets = await offlineDb.articleAssets.where("articleId").equals(id).toArray();
        expect(assets.map((a) => a.filename).sort()).toEqual(["feat.png", "inline.png"]);
        expect(JSON.stringify(article)).not.toMatch(/medium\.com\/(max|v2)/);
    });

    it("never keeps a CDN URL when a download fails: the image is dropped and reported", async () => {
        // beforeEach stubs fetch to reject - every download fails.
        const src = "https://cdn-images-1.medium.com/max/800/feat.png?q=20";
        const result = await importParsed(new Map([["a.html", post([src])]]), ["a.html"], SETTINGS);
        const id = result.imported[0].id;
        const article = await dexieStorage.articles.get(id);

        expect(article.featured_image_asset_id ?? null).toBeNull();
        expect(article.featured_image_url ?? null).toBeNull();
        expect(article.content_json).not.toContain("medium.com");
        expect(JSON.parse(article.content_json as string).content.map((n: { type: string }) => n.type)).toEqual([
            "paragraph",
        ]);
        expect(result.imported[0].warnings.join("\n")).toContain(src);
    });

    it("uses the first image that was stored as the featured image when the first one fails", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) => {
                if (url.includes("first")) throw new Error("offline");
                return {
                    ok: true,
                    status: 200,
                    headers: new Headers({ "Content-Type": "image/jpeg" }),
                    blob: async () => new Blob(["img"], { type: "image/jpeg" }),
                };
            }),
        );
        const result = await importParsed(
            new Map([["a.html", post(["https://cdn/first.png", "https://cdn/second.jpg"])]]),
            ["a.html"],
            SETTINGS,
        );
        const id = result.imported[0].id;
        const article = await dexieStorage.articles.get(id);
        expect(article.featured_image_url).toBe(`/api/articles/${id}/assets/file/second.jpg`);
        expect(article.content_json).not.toContain("https://cdn/");
    });
});
