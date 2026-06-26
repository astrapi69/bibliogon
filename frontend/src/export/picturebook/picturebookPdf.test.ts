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

  // --- #615: content pages must never print the raw TipTap JSON ---

  const tiptapDoc = (text: string, align?: string): string =>
    JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          ...(align ? { attrs: { textAlign: align } } : {}),
          content: [{ type: "text", text }],
        },
      ],
    });

  it("does not emit raw TipTap JSON for a content page (repro #615)", () => {
    const def = buildPicturebookPdfDefinition([
      {
        imageDataUrl: "data:image/jpeg;base64,AAAA",
        text: tiptapDoc("Once upon a time"),
      },
    ]);
    const content = def.content as Record<string, unknown>[];
    const serialized = JSON.stringify(content);
    // The page must not leak the stringified doc as visible text.
    expect(serialized).not.toContain('{\\"type\\":\\"doc\\"');
    expect(content.some((b) => b.text === '{"type":"doc"')).toBe(false);
  });

  it("renders harvested prose once for an image + TipTap content page", () => {
    const def = buildPicturebookPdfDefinition([
      {
        imageDataUrl: "data:image/jpeg;base64,AAAA",
        text: tiptapDoc("Once upon a time"),
      },
    ]);
    const content = def.content as Record<string, unknown>[];
    // Exactly one image block + one text block.
    expect(content).toHaveLength(2);
    expect(content[0].image).toBe("data:image/jpeg;base64,AAAA");
    expect(content[1].text).toBe("Once upon a time");
  });

  it("harvests a centered paragraph without leaking the textAlign mark", () => {
    const def = buildPicturebookPdfDefinition([
      { text: tiptapDoc("Centered line", "center") },
    ]);
    const content = def.content as Record<string, unknown>[];
    expect(content).toHaveLength(1);
    expect(content[0].text).toBe("Centered line");
  });

  it("treats an empty-paragraph TipTap doc as having no text", () => {
    const emptyDoc = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
    const def = buildPicturebookPdfDefinition([
      { imageDataUrl: "data:image/png;base64,BBBB", text: emptyDoc },
    ]);
    const content = def.content as Record<string, unknown>[];
    // Image only — no JSON text block.
    expect(content).toHaveLength(1);
    expect(content[0].image).toBe("data:image/png;base64,BBBB");
  });

  it("renders an image-only content page (TipTap text empty) without text", () => {
    const def = buildPicturebookPdfDefinition([
      {
        imageDataUrl: "data:image/jpeg;base64,CCCC",
        text: JSON.stringify({ type: "doc", content: [] }),
      },
    ]);
    const content = def.content as Record<string, unknown>[];
    expect(content).toHaveLength(1);
    expect(content[0].image).toBe("data:image/jpeg;base64,CCCC");
    // The lone image block gets the wider imageless fit (no text below).
    const fit = content[0].fit as number[];
    expect(fit[1]).toBeGreaterThan(0.9 * (612 - 36 * 2));
  });

  it("renders a text-only TipTap content page (no image)", () => {
    const def = buildPicturebookPdfDefinition([
      { text: tiptapDoc("Just words") },
    ]);
    const content = def.content as Record<string, unknown>[];
    expect(content).toHaveLength(1);
    expect(content[0].text).toBe("Just words");
    expect(content[0].image).toBeUndefined();
  });

  it("leaves a legacy plain-text (title) page untouched", () => {
    const def = buildPicturebookPdfDefinition([
      { text: "My Picture Book" },
      { imageDataUrl: "data:image/jpeg;base64,DDDD", text: tiptapDoc("p2") },
    ]);
    const content = def.content as Record<string, unknown>[];
    // Title page: plain text passes through unchanged.
    expect(content[0].text).toBe("My Picture Book");
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
