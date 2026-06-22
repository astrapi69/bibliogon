/**
 * module-docx-export seam tests (Maximal Offline, #34).
 *
 * Exercises DOCX export through the plugin-parity barrel
 * (`modules/module-docx-export`) so the offline `.docx` surface is pinned by
 * its public module name. The engine internals live in
 * `export/binaryFormats.test.ts`; here we assert the barrel re-exports a
 * working browser-side `toDocxBlob` that packs a real OOXML zip.
 */

import { describe, it, expect } from "vitest";

import type { ExportDocument } from "../../export/documentModel";
import { toDocxBlob } from "./index";

const DOC: ExportDocument = {
  title: "Offline-Dokument",
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
            content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Punkt" }] }] }],
          },
        ],
      },
    },
  ],
};

async function zipMagic(blob: Blob): Promise<string> {
  const head = new Uint8Array(await blob.arrayBuffer()).slice(0, 2);
  return String.fromCharCode(head[0], head[1]);
}

describe("module-docx-export barrel", () => {
  it("re-exports toDocxBlob as a callable", () => {
    expect(typeof toDocxBlob).toBe("function");
  });

  it("produces a non-empty DOCX Blob", async () => {
    const blob = await toDocxBlob(DOC);
    expect(blob.size).toBeGreaterThan(0);
  });

  it("emits an OOXML zip container (PK magic bytes)", async () => {
    const blob = await toDocxBlob(DOC);
    expect(await zipMagic(blob)).toBe("PK");
  });

  it("tolerates an empty-content section without throwing", async () => {
    const empty: ExportDocument = {
      title: "Leer",
      sections: [{ heading: "Kapitel", doc: { type: "doc", content: [] } }],
    };
    const blob = await toDocxBlob(empty);
    expect(await zipMagic(blob)).toBe("PK");
  });
});
