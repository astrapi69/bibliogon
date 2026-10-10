import { afterEach, describe, expect, it, vi } from "vitest";

const storageMock = vi.hoisted(() => ({
    pages: { list: vi.fn() },
    assets: { list: vi.fn(), getBlob: vi.fn() },
    comics: { listPanels: vi.fn(), listBubbles: vi.fn() },
}));

vi.mock("../../storage", () => ({ getStorage: () => storageMock }));

import { MAX_IMAGE_DIM } from "../picturebook/gatherPicturebookPdf";
import { coverCropTarget, gatherComicPdfPages, toPdfBubble } from "./gatherComicPdf";

afterEach(() => {
    vi.clearAllMocks();
});

describe("coverCropTarget", () => {
    it("trims the sides of an image wider than its cell", () => {
        // Cover, not contain: a 2:1 image in a square cell keeps its full
        // height and loses the left and right thirds, centred.
        const crop = coverCropTarget(2000, 1000, 1);
        expect(crop.sy).toBe(0);
        expect(crop.sHeight).toBe(1000);
        expect(crop.sWidth).toBe(1000);
        expect(crop.sx).toBe(500);
        expect(crop.needsCrop).toBe(true);
    });

    it("trims the top and bottom of an image taller than its cell", () => {
        const crop = coverCropTarget(1000, 2000, 1);
        expect(crop.sx).toBe(0);
        expect(crop.sWidth).toBe(1000);
        expect(crop.sHeight).toBe(1000);
        expect(crop.sy).toBe(500);
    });

    it("crops nothing when the image already matches its cell", () => {
        const crop = coverCropTarget(800, 400, 2);
        expect(crop).toMatchObject({
            sx: 0,
            sy: 0,
            sWidth: 800,
            sHeight: 400,
            needsCrop: false,
        });
    });

    it("still redraws a matching image that exceeds the dimension cap", () => {
        // Matching aspect is not enough on its own - the cap exists to keep
        // base64 and pdfmake memory bounded on a phone.
        const crop = coverCropTarget(MAX_IMAGE_DIM * 3, MAX_IMAGE_DIM * 3, 1);
        expect(crop.needsCrop).toBe(true);
        expect(crop.width).toBe(MAX_IMAGE_DIM);
        expect(crop.height).toBe(MAX_IMAGE_DIM);
    });

    it("gives the output the cell's aspect, not the source's", () => {
        // The point of the crop: pdfmake's fit letterboxes, so the bitmap
        // handed to it has to BE the cell's shape or white bars appear.
        const crop = coverCropTarget(3000, 1000, 0.75);
        expect(crop.width / crop.height).toBeCloseTo(0.75, 4);
    });

    it("falls back to a square cell for a nonsense aspect", () => {
        for (const bad of [0, -2, NaN, Infinity]) {
            const crop = coverCropTarget(1000, 500, bad);
            expect(crop.width / crop.height, String(bad)).toBeCloseTo(1, 4);
        }
    });
});

describe("toPdfBubble", () => {
    it("maps the stored row onto the builder's field names", () => {
        expect(
            toPdfBubble({
                bubble_type: "thought",
                anchor: { x_pct: 5, y_pct: 10 },
                width_pct: 40,
                height_pct: 30,
                tail_direction: "NE",
                tail_position_pct: 70,
                tail_length_px: 25,
                bubble_config: { font_size: 12 },
                text_content: "Hmm.",
            }),
        ).toEqual({
            bubbleType: "thought",
            anchor: { x_pct: 5, y_pct: 10 },
            widthPct: 40,
            heightPct: 30,
            tailDirection: "NE",
            tailPositionPct: 70,
            tailLengthPx: 25,
            config: { font_size: 12 },
            text: "Hmm.",
        });
    });
});

describe("gatherComicPdfPages", () => {
    const page = (id: string, template?: string) => ({
        id,
        layout_config: template ? { comic_grid_template: template } : null,
    });

    it("reads panels and bubbles per page through the seam", async () => {
        storageMock.pages.list.mockResolvedValue([page("p1", "grid_1x2")]);
        storageMock.assets.list.mockResolvedValue([]);
        storageMock.comics.listPanels.mockResolvedValue([
            { id: "panel-a", image_asset_id: null, panel_config: null },
            { id: "panel-b", image_asset_id: null, panel_config: { border_style: "none" } },
        ]);
        storageMock.comics.listBubbles.mockImplementation((_book: string, panelId: string) =>
            Promise.resolve(
                panelId === "panel-b"
                    ? [
                          {
                              bubble_type: "speech",
                              anchor: {},
                              width_pct: 30,
                              height_pct: 20,
                              tail_direction: "S",
                              tail_position_pct: 50,
                              tail_length_px: 20,
                              bubble_config: null,
                              text_content: "Da!",
                          },
                      ]
                    : [],
            ),
        );

        const pages = await gatherComicPdfPages("book-1", "8.5x11");

        expect(pages).toHaveLength(1);
        expect(pages[0].template).toBe("grid_1x2");
        expect(pages[0].panels).toHaveLength(2);
        expect(pages[0].panels[0].bubbles).toEqual([]);
        expect(pages[0].panels[1].bubbles[0].text).toBe("Da!");
        expect(pages[0].panels[1].config).toEqual({ border_style: "none" });
        expect(storageMock.comics.listBubbles).toHaveBeenCalledTimes(2);
    });

    it("falls back to single_panel for a page with no template", async () => {
        storageMock.pages.list.mockResolvedValue([page("p1")]);
        storageMock.assets.list.mockResolvedValue([]);
        storageMock.comics.listPanels.mockResolvedValue([]);
        const pages = await gatherComicPdfPages("book-1");
        expect(pages[0].template).toBe("single_panel");
    });

    it("skips the image when the asset id resolves to no filename", async () => {
        // A panel pointing at an asset that is not in this book's list -
        // a half-migrated row, or an asset deleted since. The panel still
        // renders; it just has no picture.
        storageMock.pages.list.mockResolvedValue([page("p1")]);
        storageMock.assets.list.mockResolvedValue([{ id: "other", filename: "x.png" }]);
        storageMock.comics.listPanels.mockResolvedValue([
            { id: "panel-a", image_asset_id: "missing", panel_config: null },
        ]);
        storageMock.comics.listBubbles.mockResolvedValue([]);

        const pages = await gatherComicPdfPages("book-1");

        expect(pages[0].panels[0].imageDataUrl).toBeNull();
        expect(storageMock.assets.getBlob).not.toHaveBeenCalled();
    });

    it("crops each panel image to its own cell's aspect ratio", async () => {
        // The regression this guards: cropping every panel to the PAGE's
        // aspect would letterbox or over-crop every multi-panel layout,
        // and a square grid cell is nothing like a 6.625x10.25 page.
        storageMock.pages.list.mockResolvedValue([page("p1", "grid_1x2")]);
        storageMock.assets.list.mockResolvedValue([{ id: "a1", filename: "panel.png" }]);
        storageMock.comics.listPanels.mockResolvedValue([
            { id: "panel-a", image_asset_id: "a1", panel_config: null },
        ]);
        storageMock.comics.listBubbles.mockResolvedValue([]);
        storageMock.assets.getBlob.mockResolvedValue(new Blob(["x"]));

        const aspects: number[] = [];
        vi.stubGlobal("createImageBitmap", async () => ({
            width: 1000,
            height: 1000,
            close: () => {},
        }));
        // The crop path needs a canvas; record the aspect it was asked for
        // by reading the canvas it sizes.
        const canvas = {
            width: 0,
            height: 0,
            getContext: () => ({
                fillStyle: "",
                fillRect: () => {},
                drawImage: () => {
                    aspects.push(canvas.width / canvas.height);
                },
            }),
            toDataURL: () => "data:image/jpeg;base64,AAA",
        };
        const create = vi
            .spyOn(document, "createElement")
            .mockImplementation(() => canvas as unknown as HTMLElement);

        const pages = await gatherComicPdfPages("book-1", "8.5x11");
        create.mockRestore();

        // grid_1x2 on 8.5x11: 540 wide minus one 6pt gutter, over 720 tall.
        const cellAspect = ((540 - 6) / 2) / 720;
        expect(aspects).toHaveLength(1);
        expect(aspects[0]).toBeCloseTo(cellAspect, 3);
        expect(aspects[0]).not.toBeCloseTo(540 / 720, 2);
        expect(pages[0].panels[0].imageDataUrl).toBe("data:image/jpeg;base64,AAA");
        vi.unstubAllGlobals();
    });
});
