import {describe, it, expect, vi, beforeEach} from "vitest";
import {unzipSync, strFromU8} from "fflate";

const {storage, mocks} = vi.hoisted(() => {
    const mocks = {
        epub: vi.fn(async () => new Blob(["EPUB"])),
        // Typed with the geometry parameter, not just `async () =>`:
        // the assertion below reads calls[0][1], and a zero-arg mock
        // makes that a type error rather than a test.
        pdf: vi.fn(async (_doc: unknown, _geometry?: unknown) => new Blob(["PDF"])),
        picturebookPdf: vi.fn(async () => new Blob(["PB"])),
        comicPdf: vi.fn(async () => new Blob(["COMIC"])),
        picturebookPages: vi.fn(async () => [{imageDataUrl: null, text: "a"}]),
        comicPages: vi.fn(async () => [{panels: []}]),
        getBlob: vi.fn(async () => null as Blob | null),
    };
    return {storage: {mode: "dexie" as const, assets: {getBlob: mocks.getBlob}}, mocks};
});

vi.mock("../../storage", () => ({getStorage: () => storage}));
vi.mock("../formatEpub", () => ({toEpubBlob: mocks.epub}));
vi.mock("../formatPdf", () => ({toPdfBlob: mocks.pdf}));
vi.mock("../picturebook/picturebookPdf", () => ({
    picturebookToPdfBlob: mocks.picturebookPdf,
}));
vi.mock("../picturebook/gatherPicturebookPdf", () => ({
    gatherPicturebookPdfPages: mocks.picturebookPages,
}));
vi.mock("../comic/comicPdf", () => ({comicToPdfBlob: mocks.comicPdf}));
vi.mock("../comic/gatherComicPdf", () => ({gatherComicPdfPages: mocks.comicPages}));

import {
    assertMetadataComplete,
    buildClientKdpPackage,
    gatherCover,
    gatherManuscripts,
    KdpPackageError,
} from "./gatherKdpPackage";
import {KDP_EPUB_ENTRY, KDP_PRINT_PDF_ENTRY} from "./kdpPackage";

/** A book that passes the metadata gate, so a test about something else
 *  is not testing the gate by accident. */
function completeBook(overrides: Record<string, unknown> = {}) {
    return {
        id: "b1",
        title: "Mein Buch",
        subtitle: "Untertitel",
        author: "Asterios Raptis",
        description: "Eine ausreichend lange Beschreibung für den Check, mit genügend Text.",
        language: "de",
        book_type: "prose",
        keywords: ["eins", "zwei", "drei"],
        categories: ["Fiction"],
        bisac_codes: ["FIC000000"],
        cover_image: null,
        chapters: [{id: "c1", title: "Kapitel", content: "{}", position: 0}],
        ...overrides,
    } as never;
}

async function entries(blob: Blob) {
    return unzipSync(new Uint8Array(await blob.arrayBuffer()));
}

describe("gatherManuscripts", () => {
    beforeEach(() => vi.clearAllMocks());

    it("gives a prose eBook the EPUB and no print PDF", async () => {
        const files = await gatherManuscripts(completeBook(), {formatKind: "ebook"});
        expect(files.map((f) => f.filename)).toEqual([KDP_EPUB_ENTRY]);
        expect(mocks.pdf).not.toHaveBeenCalled();
    });

    it("gives a prose paperback both editions", async () => {
        const files = await gatherManuscripts(completeBook(), {
            formatKind: "paperback",
            trimSize: "6x9",
            margin: "normal",
        });
        expect(files.map((f) => f.filename)).toEqual([
            KDP_EPUB_ENTRY,
            KDP_PRINT_PDF_ENTRY,
        ]);
    });

    it("renders the print PDF at the chosen trim, bled, with the margin outside it", async () => {
        await gatherManuscripts(completeBook(), {
            formatKind: "paperback",
            trimSize: "5x8",
            margin: "narrow",
        });
        // 5x8in = 360x576pt, plus 0.125in bleed per side = +18 each way.
        // The margin is measured from the TRIM edge, so the 0.5in preset
        // (36pt) grows by the 9pt bleed to keep the text block where the
        // preset puts it - a margin left at 36pt would push the text 9pt
        // into the trimmed-away area.
        expect(mocks.pdf).toHaveBeenCalledTimes(1);
        expect(mocks.pdf.mock.calls[0][1]).toEqual({
            size: {width: 378, height: 594},
            margins: [45, 45, 45, 45],
        });
    });

    it("gives a picture book its PDF even for the eBook format", async () => {
        // A picture book has no reflowable edition, so the PDF is its only
        // manuscript - the backend's rule, and the reason an eBook
        // selection does not come back empty-handed.
        const files = await gatherManuscripts(
            completeBook({book_type: "picture_book"}),
            {formatKind: "ebook"},
        );
        expect(files.map((f) => f.filename)).toEqual([KDP_PRINT_PDF_ENTRY]);
        expect(mocks.epub).not.toHaveBeenCalled();
    });

    it("routes a comic book through the comic renderer at its trim", async () => {
        const files = await gatherManuscripts(completeBook({book_type: "comic_book"}), {
            formatKind: "paperback",
            trimSize: "7x10",
        });
        expect(files.map((f) => f.filename)).toEqual([KDP_PRINT_PDF_ENTRY]);
        expect(mocks.comicPages).toHaveBeenCalledWith("b1", "7x10");
        expect(mocks.comicPdf).toHaveBeenCalledWith([{panels: []}], "7x10");
        expect(mocks.picturebookPdf).not.toHaveBeenCalled();
    });

    it("refuses a book type it has no renderer for", async () => {
        await expect(
            gatherManuscripts(completeBook({book_type: "cookbook"}), {
                formatKind: "paperback",
            }),
        ).rejects.toThrow(KdpPackageError);
    });
});

describe("gatherCover", () => {
    beforeEach(() => vi.clearAllMocks());

    it("reports why rather than failing when no cover is set", async () => {
        const {file, report} = await gatherCover(completeBook());
        expect(file).toBeNull();
        expect((report as {errors: string[]}).errors[0]).toContain("No cover image");
    });

    it("reports why rather than failing when the bytes are missing", async () => {
        mocks.getBlob.mockResolvedValueOnce(null);
        const {file, report} = await gatherCover(
            completeBook({cover_image: "uploads/b1/cover.png"}),
        );
        expect(file).toBeNull();
        // The filename, because "not found" without it is not actionable.
        expect((report as {errors: string[]}).errors[0]).toContain("cover.png");
    });
});

describe("assertMetadataComplete", () => {
    it("refuses an incomplete book with the offending fields named", () => {
        // Named, because "metadata incomplete" sends the user back to a
        // five-tab editor to find out which field. Empty keywords is a
        // WARNING in the shared checker, so it is deliberately not in
        // here - the gate blocks on errors only, like the backend's.
        let message = "";
        try {
            assertMetadataComplete(completeBook({description: null, author: null}));
        } catch (err) {
            message = (err as Error).message;
        }
        expect(message).toContain("description");
        expect(message).toContain("author");
    });

    it("lets a book with only warnings through", () => {
        // The backend gates on `is_complete`, which ignores warnings. A
        // client gate that blocked on them would refuse packages the
        // desktop app builds.
        expect(() => assertMetadataComplete(completeBook({keywords: []}))).not.toThrow();
    });

    it("drops the chapters requirement for a page-based book", () => {
        // A picture book has pages, not chapters. The backend applies the
        // same filter through the book-type registry's content model;
        // without it every picture book fails the gate.
        expect(() =>
            assertMetadataComplete(completeBook({book_type: "picture_book", chapters: []})),
        ).not.toThrow();
        expect(() =>
            assertMetadataComplete(completeBook({chapters: []})),
        ).toThrow(KdpPackageError);
    });
});

describe("buildClientKdpPackage", () => {
    beforeEach(() => vi.clearAllMocks());

    it("produces the archive with deterministic metadata", async () => {
        const {blob, filename} = await buildClientKdpPackage(completeBook(), {
            formatKind: "paperback",
            trimSize: "6x9",
            margin: "normal",
            appVersion: "0.60.0",
            generatedAt: new Date("2026-10-10T04:00:00.000Z"),
        });
        expect(filename).toBe("mein-buch-kdp-package.zip");
        const unpacked = await entries(blob);
        const metadata = JSON.parse(strFromU8(unpacked["metadata.json"]));
        expect(metadata.generated_by).toBe("Bibliogon v0.60.0");
        expect(metadata.generated_at).toBe("2026-10-10T04:00:00.000Z");
        expect(metadata.trim_size).toBe("6x9");
        expect(metadata.language).toBe("German");
        expect(Object.keys(unpacked)).toContain(KDP_EPUB_ENTRY);
        expect(Object.keys(unpacked)).toContain(KDP_PRINT_PDF_ENTRY);
    });

    it("tells the reader of the ZIP that a browser rendered the PDF", async () => {
        // The ZIP outlives the wizard step that produced it; the person
        // uploading it to KDP has the file and not the toast.
        const {blob} = await buildClientKdpPackage(completeBook(), {
            formatKind: "paperback",
            appVersion: "0",
            generatedAt: new Date(0),
        });
        const readme = strFromU8((await entries(blob))["README.txt"]);
        expect(readme).toContain("rendered in your browser");
    });

    it("refuses before rendering anything when the metadata is incomplete", async () => {
        // Order matters: rendering an EPUB and a PDF takes seconds and
        // holds both in memory, and the gate's whole point is to refuse
        // before paying that.
        await expect(
            buildClientKdpPackage(completeBook({author: null}), {
                formatKind: "paperback",
            }),
        ).rejects.toThrow(KdpPackageError);
        expect(mocks.epub).not.toHaveBeenCalled();
        expect(mocks.pdf).not.toHaveBeenCalled();
    });
});
