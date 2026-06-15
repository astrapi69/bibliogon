/**
 * Real-render regression for the client-side PDF engine (#292).
 *
 * `binaryFormats.test.ts` covers the pure `docToPdfContent` walker but
 * deliberately stops short of the actual pdfmake render. That gap let the
 * pdfmake 0.2 -> 0.3 API break ship undetected: `pdfMake.vfs = vfs` is
 * ignored by 0.3.x (fonts live in `virtualfs`, set via
 * `addVirtualFileSystem`) and `getBlob(cb)` no longer fires its callback
 * (it returns a Promise). Both faults make `toPdfBlob` reject or hang.
 *
 * This test exercises the REAL render end-to-end (vfs registration +
 * Promise-form getBlob) and asserts a valid PDF blob. On the pre-fix code
 * it fails (reject / timeout); after the fix it produces a `%PDF-` blob.
 */

import { describe, it, expect } from "vitest";

import { toPdfBlob } from "./formatPdf";
import type { ExportDocument } from "./documentModel";

const REPORT: ExportDocument = {
  title: "Qualitaetsbericht",
  subtitle: "Mein Buch",
  sections: [
    {
      heading: "",
      doc: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Woerter gesamt: 1234" }],
          },
          {
            type: "paragraph",
            content: [
              { type: "text", text: "1. Kapitel", marks: [{ type: "bold" }] },
              { type: "text", text: " - Flesch: 60" },
            ],
          },
        ],
      },
    },
  ],
};

describe("toPdfBlob (real pdfmake 0.3 render)", () => {
  it("registers the vfs and resolves a non-empty PDF blob", async () => {
    const blob = await toPdfBlob(REPORT);
    expect(blob).toBeInstanceOf(Blob);
    // A real rendered PDF is several KB; a broken vfs/getBlob path would
    // reject or hang rather than reach here.
    expect(blob.size).toBeGreaterThan(1000);
  });

  it("emits a valid %PDF- header", async () => {
    const blob = await toPdfBlob(REPORT);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const header = String.fromCharCode(...bytes.subarray(0, 5));
    expect(header).toBe("%PDF-");
  });
});
