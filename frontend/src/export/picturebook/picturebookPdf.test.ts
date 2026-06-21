import { describe, it, expect } from "vitest";
import {
  buildPicturebookPdfDefinition,
  picturebookFormatDims,
  PICTUREBOOK_PDF_FORMAT_DIMS,
} from "./picturebookPdf";

describe("picturebookFormatDims", () => {
  it("maps a known trim size to its point dimensions", () => {
    expect(picturebookFormatDims("8x10")).toEqual([576, 720]);
  });
  it("falls back to 8.5x8.5 for unknown / missing format", () => {
    expect(picturebookFormatDims(undefined)).toEqual([612, 612]);
    expect(picturebookFormatDims("nonsense")).toEqual([612, 612]);
  });
  it("covers a landscape trim size", () => {
    expect(PICTUREBOOK_PDF_FORMAT_DIMS["11x8.5"]).toEqual([792, 612]);
  });
});

describe("buildPicturebookPdfDefinition", () => {
  it("sets the page size from the selected format", () => {
    const def = buildPicturebookPdfDefinition(
      [{ text: "Hi" }],
      "8.5x11",
    );
    expect(def.pageSize).toEqual({ width: 612, height: 792 });
    expect(def.pageMargins).toEqual([36, 36, 36, 36]);
  });

  it("renders a text-only page (no image) — picture-book without images", () => {
    const def = buildPicturebookPdfDefinition([{ text: "Once upon a time" }]);
    const content = def.content as Record<string, unknown>[];
    expect(content).toHaveLength(1);
    expect(content[0].text).toBe("Once upon a time");
    expect(content[0].image).toBeUndefined();
  });

  it("renders an image+text page with the image first", () => {
    const def = buildPicturebookPdfDefinition([
      { imageDataUrl: "data:image/jpeg;base64,AAAA", text: "Caption" },
    ]);
    const content = def.content as Record<string, unknown>[];
    expect(content).toHaveLength(2);
    expect(content[0].image).toBe("data:image/jpeg;base64,AAAA");
    expect(content[0].fit).toBeDefined();
    expect(content[1].text).toBe("Caption");
  });

  it("inserts a pageBreak before every page after the first", () => {
    const def = buildPicturebookPdfDefinition([
      { text: "Page 1" },
      { text: "Page 2" },
      { imageDataUrl: "data:image/png;base64,BBBB", text: "Page 3" },
    ]);
    const content = def.content as Record<string, unknown>[];
    // page1 (1 block), page2 (1 block), page3 (image+text = 2 blocks)
    expect(content).toHaveLength(4);
    expect(content[0].pageBreak).toBeUndefined();
    expect(content[1].pageBreak).toBe("before"); // page 2 text
    expect(content[2].pageBreak).toBe("before"); // page 3 image
    expect(content[3].pageBreak).toBeUndefined(); // page 3 text (same page)
  });

  it("emits a blank page for an empty Page so pagination matches", () => {
    const def = buildPicturebookPdfDefinition([{}, { text: "Two" }]);
    const content = def.content as Record<string, unknown>[];
    expect(content).toHaveLength(2);
    expect(content[0].text).toBe("");
    expect(content[1].pageBreak).toBe("before");
  });

  it("returns a single blank page when there are no pages at all", () => {
    const def = buildPicturebookPdfDefinition([]);
    const content = def.content as Record<string, unknown>[];
    expect(content).toHaveLength(1);
    expect(content[0].text).toBe("");
  });

  it("gives an imageless page more vertical room than an image+text page", () => {
    const imageOnly = buildPicturebookPdfDefinition([
      { imageDataUrl: "data:image/jpeg;base64,AAAA" },
    ]);
    const imageText = buildPicturebookPdfDefinition([
      { imageDataUrl: "data:image/jpeg;base64,AAAA", text: "x" },
    ]);
    const fitOnly = (imageOnly.content as Record<string, unknown>[])[0]
      .fit as number[];
    const fitText = (imageText.content as Record<string, unknown>[])[0]
      .fit as number[];
    expect(fitOnly[1]).toBeGreaterThan(fitText[1]);
  });
});
