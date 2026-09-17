/**
 * Medium images are stored locally, never left on the CDN (#882).
 *
 * Pure parts (filename, type allowlist, doc rewrite) plus the download
 * loop against a fake fetch and a fake asset store.
 */

import { describe, it, expect, vi } from "vitest";

import type { ImageRef } from "./walker";
import {
    ALLOWED_IMAGE_TYPES,
    applyImageRewrites,
    imageFilename,
    localizeImages,
} from "./localImages";

const img = (src: string, over: Partial<ImageRef> = {}): ImageRef => ({
    src,
    alt: "",
    caption: "",
    dataImageId: "",
    ...over,
});

const pngResponse = (type = "image/png") => ({
    ok: true,
    status: 200,
    headers: new Headers({ "Content-Type": type }),
    blob: async () => new Blob(["bytes"], { type }),
});

describe("imageFilename (mirrors the desktop importer's filename_for)", () => {
    it("prefers Medium's data-image-id, sanitised", () => {
        expect(imageFilename(img("https://x/y.png", { dataImageId: "1*ab/c:d.png" }))).toBe(
            "1_ab_c_d.png",
        );
    });

    it("falls back to the last URL segment without the query", () => {
        expect(imageFilename(img("https://cdn-images-1.medium.com/max/800/feat.png?q=20"))).toBe(
            "feat.png",
        );
    });

    it("adds .jpg when the segment has no extension", () => {
        expect(imageFilename(img("https://miro.medium.com/v2/1*abc"))).toBe("1_abc.jpg");
    });

    it("never returns an empty name", () => {
        expect(imageFilename(img("https://cdn-images-1.medium.com/"))).toBe("medium-image.jpg");
    });
});

describe("ALLOWED_IMAGE_TYPES", () => {
    it("allows raster images only - an SVG could carry script on the app origin", () => {
        for (const type of ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]) {
            expect(ALLOWED_IMAGE_TYPES.has(type), type).toBe(true);
        }
        for (const type of ["image/svg+xml", "text/html", "application/octet-stream", ""]) {
            expect(ALLOWED_IMAGE_TYPES.has(type), type).toBe(false);
        }
    });
});

describe("applyImageRewrites", () => {
    const doc = {
        type: "doc",
        content: [
            { type: "imageFigure", attrs: { src: "https://cdn/a.png", alt: "A" } },
            { type: "paragraph", content: [{ type: "text", text: "between" }] },
            { type: "imageFigure", attrs: { src: "https://cdn/b.png" } },
            { type: "image", attrs: { src: "https://cdn/c.png" } },
        ],
    };

    it("points downloaded images at the local asset URL and keeps other attrs", () => {
        const out = applyImageRewrites(
            doc,
            new Map([
                ["https://cdn/a.png", "/api/articles/x/assets/file/a.png"],
                ["https://cdn/b.png", "/api/articles/x/assets/file/b.png"],
                ["https://cdn/c.png", "/api/articles/x/assets/file/c.png"],
            ]),
        );
        expect(out.content[0]).toEqual({
            type: "imageFigure",
            attrs: { src: "/api/articles/x/assets/file/a.png", alt: "A" },
        });
        expect(out.content[3].attrs?.src).toBe("/api/articles/x/assets/file/c.png");
    });

    it("removes every image node that was not downloaded, so no remote URL stays behind", () => {
        const out = applyImageRewrites(doc, new Map([["https://cdn/a.png", "/local/a.png"]]));
        expect(out.content.map((n: { type: string }) => n.type)).toEqual(["imageFigure", "paragraph"]);
        expect(JSON.stringify(out)).not.toContain("https://cdn/");
    });

    it("does not mutate the input doc", () => {
        const before = JSON.stringify(doc);
        applyImageRewrites(doc, new Map());
        expect(JSON.stringify(doc)).toBe(before);
    });
});

describe("localizeImages", () => {
    const store = () => {
        const calls: { articleId: string; filename: string; type?: string }[] = [];
        return {
            calls,
            api: {
                store: vi.fn(async (articleId: string, _blob: Blob, filename: string, type?: string) => {
                    calls.push({ articleId, filename, type });
                    return `asset-${calls.length}`;
                }),
            },
        };
    };

    it("downloads each distinct image once and maps it to its local URL", async () => {
        const s = store();
        const fetchImpl = vi.fn(async () => pngResponse());
        const result = await localizeImages(
            "art-1",
            [img("https://cdn/a.png"), img("https://cdn/a.png"), img("https://cdn/b.jpg")],
            s.api,
            fetchImpl as unknown as typeof fetch,
        );
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(result.urls.get("https://cdn/a.png")).toBe("/api/articles/art-1/assets/file/a.png");
        expect(result.urls.get("https://cdn/b.jpg")).toBe("/api/articles/art-1/assets/file/b.jpg");
        expect(result.assetIds.get("https://cdn/a.png")).toBe("asset-1");
        expect(result.failed).toEqual([]);
        expect(s.calls.map((c) => c.filename)).toEqual(["a.png", "b.jpg"]);
    });

    it("reports a network failure, an HTTP error and a non-raster type as failed", async () => {
        const s = store();
        const fetchImpl = vi.fn(async (url: string) => {
            if (url.endsWith("net.png")) throw new Error("offline");
            if (url.endsWith("404.png")) return { ...pngResponse(), ok: false, status: 404 };
            if (url.endsWith("evil.svg")) return pngResponse("image/svg+xml");
            return pngResponse();
        });
        const result = await localizeImages(
            "art-1",
            [img("https://cdn/net.png"), img("https://cdn/404.png"), img("https://cdn/evil.svg"), img("https://cdn/ok.png")],
            s.api,
            fetchImpl as unknown as typeof fetch,
        );
        expect(result.failed.map((f) => f.src)).toEqual([
            "https://cdn/net.png",
            "https://cdn/404.png",
            "https://cdn/evil.svg",
        ]);
        expect(result.failed[2].reason).toContain("image/svg+xml");
        expect([...result.urls.keys()]).toEqual(["https://cdn/ok.png"]);
        expect(s.calls).toHaveLength(1);
    });

    it("refuses non-http(s) sources without fetching them", async () => {
        const s = store();
        const fetchImpl = vi.fn(async () => pngResponse());
        const result = await localizeImages(
            "art-1",
            [img("javascript:alert(1)"), img("data:image/png;base64,AAAA"), img("")],
            s.api,
            fetchImpl as unknown as typeof fetch,
        );
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(result.failed.map((f) => f.src)).toEqual(["javascript:alert(1)", "data:image/png;base64,AAAA"]);
    });
});
