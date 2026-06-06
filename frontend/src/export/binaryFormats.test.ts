/**
 * Client-side export — binary formats (Maximal-Offline P2).
 *
 * DOCX + EPUB produce real Blobs under happy-dom (both are zip-based and use
 * only Blob/Uint8Array). The PDF content walker is asserted as a pure
 * function; the pdfmake render itself needs a browser canvas/font stack and
 * is verified in the offline E2E (flagged for Aster), so it is not invoked
 * here.
 */

import { describe, it, expect } from "vitest";

import type { ExportDocument } from "./documentModel";
import { toDocxBlob } from "./formatDocx";
import { toEpubBlob } from "./formatEpub";
import { docToPdfContent } from "./formatPdf";

const DOC: ExportDocument = {
  title: "Binärbuch",
  subtitle: "Untertitel",
  author: "Asterios Raptis",
  language: "de",
  sections: [
    {
      heading: "Kapitel 1",
      doc: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Abschnitt" }] },
          { type: "paragraph", content: [{ type: "text", text: "Fett", marks: [{ type: "bold" }] }] },
          {
            type: "bulletList",
            content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "punkt" }] }] }],
          },
        ],
      },
    },
    { heading: "Kapitel 2", doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Ende" }] }] } },
  ],
};

describe("toDocxBlob", () => {
  it("produces a non-empty .docx (zip) Blob", async () => {
    const blob = await toDocxBlob(DOC);
    expect(blob.size).toBeGreaterThan(0);
    // OOXML is a zip; the magic bytes start with "PK".
    const head = new Uint8Array(await blob.arrayBuffer()).slice(0, 2);
    expect(String.fromCharCode(head[0], head[1])).toBe("PK");
  });
});

describe("toEpubBlob", () => {
  it("produces a non-empty EPUB (zip) Blob with the right MIME", async () => {
    const blob = await toEpubBlob(DOC);
    expect(blob.type).toBe("application/epub+zip");
    expect(blob.size).toBeGreaterThan(0);
    const head = new Uint8Array(await blob.arrayBuffer()).slice(0, 2);
    expect(String.fromCharCode(head[0], head[1])).toBe("PK");
  });
});

describe("docToPdfContent", () => {
  it("emits title, page-broken section headings and rich runs", () => {
    const content = docToPdfContent(DOC) as Record<string, unknown>[];
    expect(content[0]).toMatchObject({ text: "Binärbuch", style: "title" });
    const headings = content.filter((c) => c.style === "h1");
    expect(headings.map((h) => h.text)).toEqual(["Kapitel 1", "Kapitel 2"]);
    // First section heading has no page break; the second does.
    expect(headings[0].pageBreak).toBeUndefined();
    expect(headings[1].pageBreak).toBe("before");
    // A bold run survives into the pdfmake text-run shape.
    const json = JSON.stringify(content);
    expect(json).toContain('"bold":true');
  });
});
