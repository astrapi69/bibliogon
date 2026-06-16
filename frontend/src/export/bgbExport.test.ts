import { describe, it, expect, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate";

import {
    bgbBackupFilename,
    buildBgbFiles,
    exportBgbBackup,
    selectiveBgbFilename,
} from "./bgbExport";
import { buildBackupBundle } from "./backupExport";

const COVER = "cover-b1.png";
const coverBytes = new Uint8Array([10, 20, 30]);
const figBytes = new Uint8Array([1, 2, 3, 4]);
const featuredBytes = new Uint8Array([9, 9, 9]);

const fakeStorage = {
    mode: "dexie" as const,
    settings: {
        getApp: vi.fn(async () => ({ theme: "nord", author: { name: "Me" } })),
    },
    authors: { list: vi.fn(async () => [{ id: "a1", name: "King", slug: "king" }]) },
    books: {
        list: vi.fn(async () => [
            { id: "b1", title: "Book One", cover_image: `assets/covers/${COVER}` },
        ]),
    },
    chapters: {
        list: vi.fn(async (bookId: string) => [
            { id: "c1", book_id: bookId, title: "Ch 1", content: '{"doc":1}', position: 0 },
        ]),
    },
    articles: {
        list: vi.fn(async () => [{ id: "ar1", title: "Art" }]),
        get: vi.fn(async (id: string) => ({
            id,
            title: "Art",
            content_json: "{}",
            featured_image_asset_id: "fa1",
            featured_image_url: null,
        })),
    },
    writingSessions: { list: vi.fn(async () => []) },
    storyBible: {
        listEntities: vi.fn(async () => [{ id: "e1", book_id: "b1", name: "Hero" }]),
    },
    chapterLabels: {
        list: vi.fn(async () => [{ id: "l1", book_id: "b1", name: "Draft", color: "#abc" }]),
    },
    assets: {
        list: vi.fn(async () => [
            {
                id: "as1",
                book_id: "b1",
                filename: COVER,
                asset_type: "cover",
                path: "",
                uploaded_at: "",
            },
            {
                id: "as2",
                book_id: "b1",
                filename: "fig.png",
                asset_type: "figure",
                path: "",
                uploaded_at: "",
            },
        ]),
        getBlob: vi.fn(async (_bookId: string, filename: string) =>
            filename === COVER
                ? new Blob([coverBytes], { type: "image/png" })
                : new Blob([figBytes], { type: "image/png" }),
        ),
    },
    articleAssets: {
        getBlob: vi.fn(async () => new Blob([featuredBytes], { type: "image/png" })),
    },
};

vi.mock("../storage", () => ({ getStorage: () => fakeStorage }));

describe("buildBgbFiles", () => {
    it("packs the entity JSON + binary image bytes into the backend .bgb layout", async () => {
        const bundle = await buildBackupBundle("2026-06-16T12:00:00Z");
        const files = await buildBgbFiles(bundle);

        const manifest = JSON.parse(strFromU8(files["manifest.json"]));
        expect(manifest.format).toBe("bibliogon-backup");
        expect(manifest.client).toBe(true);
        expect(manifest.asset_count).toBe(3);

        expect(JSON.parse(strFromU8(files["books/b1/book.json"])).title).toBe("Book One");
        expect(files["books/b1/chapters/c1.json"]).toBeTruthy();

        // Book assets: the cover + the figure bytes travel with the archive.
        expect(files["books/b1/assets/cover-b1.png"]).toEqual(coverBytes);
        expect(files["books/b1/assets/fig.png"]).toEqual(figBytes);
        const assetMeta = JSON.parse(strFromU8(files["books/b1/assets.json"]));
        expect(assetMeta).toHaveLength(2);

        // Story entities + chapter labels grouped under the book.
        expect(JSON.parse(strFromU8(files["books/b1/story_entities.json"]))[0].name).toBe("Hero");
        expect(JSON.parse(strFromU8(files["books/b1/chapter_labels.json"]))[0].name).toBe("Draft");

        // Article featured image bytes + a one-entry assets.json.
        expect(files["articles/ar1/article.json"]).toBeTruthy();
        expect(files["articles/ar1/assets/featured.png"]).toEqual(featuredBytes);
        const articleAssetMeta = JSON.parse(strFromU8(files["articles/ar1/assets.json"]));
        expect(articleAssetMeta[0].asset_type).toBe("featured_image");

        // Globals: authors + the client-only settings extension.
        expect(JSON.parse(strFromU8(files["globals/authors.json"]))[0].name).toBe("King");
        expect(JSON.parse(strFromU8(files["globals/settings.json"])).theme).toBe("nord");
    });

    it("exportBgbBackup returns a real ZIP blob that unzips", async () => {
        const blob = await exportBgbBackup("2026-06-16T12:00:00Z");
        expect(blob.type).toBe("application/zip");
        const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
        expect(entries["manifest.json"]).toBeTruthy();
        expect(entries["books/b1/assets/cover-b1.png"]).toEqual(coverBytes);
    });
});

describe("bgb filenames", () => {
    it("derive a .bgb name from the ISO date", () => {
        expect(bgbBackupFilename("2026-06-16T09:30:00Z")).toBe("bibliogon-backup-2026-06-16.bgb");
        expect(selectiveBgbFilename("2026-06-16T09:30:00Z")).toBe(
            "bibliogon-export-2026-06-16.bgb",
        );
    });
});
