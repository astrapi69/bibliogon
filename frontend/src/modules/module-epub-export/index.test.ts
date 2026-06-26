/**
 * module-epub-export seam tests (Maximal Offline, #34).
 *
 * Exercises the EPUB export through the plugin-parity barrel
 * (`modules/module-epub-export`) rather than the canonical engine path, so
 * the offline EPUB surface is pinned by its public module name. The engine
 * internals are covered in `export/binaryFormats.test.ts`; here we assert the
 * barrel re-exports a working browser-side `toEpubBlob`.
 */

import { describe, it, expect } from "vitest";

import type { ExportDocument } from "../../export/documentModel";
import { toEpubBlob } from "./index";

const BOOK: ExportDocument = {
  title: "Offline-Buch",
  subtitle: "Untertitel",
  author: "Asterios Raptis",
  language: "de",
  kind: "book",
  sections: [
    {
      heading: "Kapitel 1",
      doc: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Abschnitt" }] },
          { type: "paragraph", content: [{ type: "text", text: "Inhalt" }] },
        ],
      },
    },
    {
      heading: "Kapitel 2",
      doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Ende" }] }] },
    },
  ],
};

async function zipMagic(blob: Blob): Promise<string> {
  const head = new Uint8Array(await blob.arrayBuffer()).slice(0, 2);
  return String.fromCharCode(head[0], head[1]);
}

describe("module-epub-export barrel", () => {
  it("re-exports toEpubBlob as a callable", () => {
    expect(typeof toEpubBlob).toBe("function");
  });

  it("produces a non-empty EPUB Blob with the EPUB MIME type", async () => {
    const blob = await toEpubBlob(BOOK);
    expect(blob.type).toBe("application/epub+zip");
    expect(blob.size).toBeGreaterThan(0);
  });

  it("emits a zip container (PK magic bytes)", async () => {
    const blob = await toEpubBlob(BOOK);
    expect(await zipMagic(blob)).toBe("PK");
  });

  it("handles an article-kind single-section document", async () => {
    const article: ExportDocument = {
      title: "Ein Artikel",
      kind: "article",
      sections: [{ heading: "", doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Text" }] }] } }],
    };
    const blob = await toEpubBlob(article);
    expect(blob.size).toBeGreaterThan(0);
    expect(await zipMagic(blob)).toBe("PK");
  });
});
