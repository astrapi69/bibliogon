import {describe, it, expect} from "vitest";
import {unzipSync, strFromU8} from "fflate";

import {
    buildKdpPackageZip,
    kdpPackageFilename,
    kdpPackageSlug,
    KDP_EPUB_ENTRY,
    KDP_PRINT_PDF_ENTRY,
} from "./kdpPackage";

const PARTS = {
    title: "Mein Buch",
    metadata: {title: "Mein Buch", keywords: ["ä"]},
    coverReport: {valid: true, errors: [], warnings: []},
    publishingState: {id: "b1", status: "draft"},
    readme: "# README\n",
    cover: {filename: "cover.jpg", bytes: new Uint8Array([1, 2, 3])},
    manuscripts: [
        {filename: KDP_EPUB_ENTRY, bytes: new Uint8Array([4, 5])},
        {filename: KDP_PRINT_PDF_ENTRY, bytes: new Uint8Array([6])},
    ],
};

async function entries(blob: Blob): Promise<Record<string, Uint8Array>> {
    return unzipSync(new Uint8Array(await blob.arrayBuffer()));
}

describe("buildKdpPackageZip", () => {
    it("carries every entry the backend package carries, under its name", async () => {
        const {blob} = buildKdpPackageZip(PARTS);
        expect(Object.keys(await entries(blob)).sort()).toEqual([
            "README.txt",
            "cover-validation-report.json",
            "cover.jpg",
            KDP_EPUB_ENTRY,
            KDP_PRINT_PDF_ENTRY,
            "metadata.json",
            "publishing-state-snapshot.json",
        ].sort());
    });

    it("writes the JSON entries as JSON a reader can parse", async () => {
        const unpacked = await entries(buildKdpPackageZip(PARTS).blob);
        expect(JSON.parse(strFromU8(unpacked["metadata.json"]))).toEqual(PARTS.metadata);
        expect(JSON.parse(strFromU8(unpacked["cover-validation-report.json"]))).toEqual(
            PARTS.coverReport,
        );
        expect(
            JSON.parse(strFromU8(unpacked["publishing-state-snapshot.json"])),
        ).toEqual(PARTS.publishingState);
        expect(strFromU8(unpacked["README.txt"])).toBe("# README\n");
    });

    it("keeps non-ASCII readable rather than escaping it", async () => {
        // `ensure_ascii=False` on the Python side. A reader opening
        // metadata.json should see "ä", not "ä".
        const unpacked = await entries(buildKdpPackageZip(PARTS).blob);
        expect(strFromU8(unpacked["metadata.json"])).toContain('"ä"');
    });

    it("carries the manuscript bytes verbatim", async () => {
        // The EPUB and PDF are binary. A text round-trip through a
        // TextEncoder somewhere in the chain would corrupt them silently -
        // the ZIP would still open.
        const unpacked = await entries(buildKdpPackageZip(PARTS).blob);
        expect(Array.from(unpacked[KDP_EPUB_ENTRY])).toEqual([4, 5]);
        expect(Array.from(unpacked[KDP_PRINT_PDF_ENTRY])).toEqual([6]);
        expect(Array.from(unpacked["cover.jpg"])).toEqual([1, 2, 3]);
    });

    it("omits the cover entry when the book has none, and keeps the report", async () => {
        const unpacked = await entries(
            buildKdpPackageZip({...PARTS, cover: null}).blob,
        );
        expect(Object.keys(unpacked)).not.toContain("cover.jpg");
        // The report is where "why is there no cover" is written, so it
        // must survive the cover's absence.
        expect(unpacked["cover-validation-report.json"]).toBeDefined();
    });

    it("names the archive after the title, ASCII-folded, with a book fallback", () => {
        expect(kdpPackageFilename("Mein Buch")).toBe("mein-buch-kdp-package.zip");
        // The backend's _slugify DROPS "ü" (giving "ber-uns"); folding it
        // to "u" is the deliberate divergence, because this is a download
        // name a user reads.
        expect(kdpPackageSlug("Über uns")).toBe("uber-uns");
        // "ß" survives as a dropped character, not as "ss": NFKD has no
        // decomposition for it (that is compatibility case folding, a
        // different operation). The backend's _slugify drops it too, so
        // the two paths agree here.
        expect(kdpPackageSlug("Straße 2")).toBe("stra-e-2");
        expect(kdpPackageSlug("  ---  ")).toBe("book");
        expect(kdpPackageSlug("日本語")).toBe("book");
    });
});
