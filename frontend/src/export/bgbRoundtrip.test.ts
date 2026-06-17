/**
 * BGB image round-trip — the Vitest counterpart of BACKUP-AKZEPTANZTEST for
 * the offline (#340) path: fill the real DexieStorage with a book + cover, an
 * article + featured image, and a setting → export `.bgb` → wipe → import →
 * assert EVERY image's bytes are back and the references resolve.
 *
 * This is the test the JSON backup could never pass: JSON drops binary data,
 * so the cover + thumbnail vanished. A red run here is real image data loss in
 * the export/import seam — never loosen the byte assertions.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";

import { dexieStorage, offlineDb } from "../storage/dexie-storage";
import { exportBgbBackup } from "./bgbExport";
import { importBgbFile } from "../import/bgbImport";

vi.mock("../storage", async () => {
    const real = await import("../storage/dexie-storage");
    return { getStorage: () => real.dexieStorage };
});

const coverBytes = new Uint8Array([1, 2, 3, 4, 5]);
const featuredBytes = new Uint8Array([9, 8, 7, 6]);

async function bytesOf(blob: Blob): Promise<number[]> {
    return [...new Uint8Array(await blob.arrayBuffer())];
}

function fileFromBlob(blob: Blob, name: string): File {
    return new File([blob], name);
}

beforeEach(async () => {
    await Promise.all(offlineDb.tables.map((t) => t.clear()));
});

describe("BGB image round-trip", () => {
    it("export → wipe → import restores the cover, the thumbnail, and settings", async () => {
        // 1. Seed a book with a cover.
        const book = await dexieStorage.books.create({ title: "Bildband", author: "A" });
        const coverResp = await dexieStorage.covers.upload(
            book.id,
            fileFromBlob(new Blob([coverBytes], { type: "image/png" }), "cover.png"),
        );
        await dexieStorage.books.update(book.id, { cover_image: coverResp.cover_image });
        await dexieStorage.chapters.create(book.id, {
            title: "Kapitel 1",
            content: "{}",
            chapter_type: "chapter",
            position: 0,
        });

        // 2. Seed an article with a featured image.
        const article = await dexieStorage.articles.create({
            title: "Mein Post",
            language: "en",
            content_type: "blogpost",
        });
        const assetId = await dexieStorage.articleAssets.store(
            article.id,
            new Blob([featuredBytes], { type: "image/png" }),
            "thumb.png",
        );
        await dexieStorage.articles.update(article.id, { featured_image_asset_id: assetId });

        // 3. Seed a setting.
        await dexieStorage.settings.updateApp({ ui: { theme: "nord" } });

        // 4. Export .bgb.
        const blob = await exportBgbBackup("2026-06-16T10:00:00Z");

        // 5. Wipe everything (Danger-Zone reset equivalent).
        await Promise.all(offlineDb.tables.map((t) => t.clear()));
        expect(await dexieStorage.books.list()).toHaveLength(0);

        // 6. Import the .bgb back.
        const result = await importBgbFile(fileFromBlob(blob, "backup.bgb"));
        expect(result.imported.books).toBe(1);
        expect(result.imported.articles).toBe(1);
        expect(result.imported.settings).toBe(1);

        // 7. Verify the cover bytes round-tripped and the reference resolves.
        const books = await dexieStorage.books.list();
        expect(books).toHaveLength(1);
        const newBook = books[0];
        expect(newBook.cover_image).toBe(coverResp.cover_image);
        const coverFilename = coverResp.cover_image.split("/").pop() as string;
        const restoredCover = await dexieStorage.assets.getBlob(newBook.id, coverFilename);
        expect(restoredCover).not.toBeNull();
        expect(await bytesOf(restoredCover as Blob)).toEqual([...coverBytes]);

        // 8. Verify the article thumbnail bytes round-tripped and resolve.
        const articles = await dexieStorage.articles.list();
        expect(articles).toHaveLength(1);
        const newArticle = await dexieStorage.articles.get(articles[0].id);
        expect(newArticle.featured_image_asset_id).toBeTruthy();
        const restoredThumb = await dexieStorage.articleAssets.getBlob(
            newArticle.featured_image_asset_id as string,
        );
        expect(restoredThumb).not.toBeNull();
        expect(await bytesOf(restoredThumb as Blob)).toEqual([...featuredBytes]);

        // 9. Verify the setting round-tripped.
        const settings = await dexieStorage.settings.getApp();
        expect((settings.ui as { theme?: string }).theme).toBe("nord");
    });
});
