import { describe, it, expect, vi, beforeEach } from "vitest";

import type { ExportDocument } from "./documentModel";

const addVirtualFileSystem = vi.fn();
const getBlob = vi.fn((cb: (b: Blob) => void) =>
  cb(new Blob(["%PDF"], { type: "application/pdf" })),
);
const createPdf = vi.fn(() => ({ getBlob }));

vi.mock("pdfmake/build/pdfmake.js", () => ({
  default: { createPdf, addVirtualFileSystem },
}));
// resolveVfs probes several shapes (mod.pdfMake / mod.vfs / mod.default);
// declare them so vitest's strict mock namespace doesn't throw on access.
vi.mock("pdfmake/build/vfs_fonts.js", () => ({
  default: { "Roboto-Regular.ttf": "AAA" },
  pdfMake: undefined,
  vfs: undefined,
}));

import { docToPdfContent, toPdfBlob } from "./formatPdf";

function sampleDoc(): ExportDocument {
  return {
    title: "Report",
    subtitle: "My Book",
    sections: [
      {
        heading: "",
        doc: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "hello" }] },
          ],
        },
      },
    ],
  };
}

describe("docToPdfContent", () => {
  it("emits the title, subtitle and paragraph runs", () => {
    const content = docToPdfContent(sampleDoc());
    expect(content[0]).toMatchObject({ text: "Report", style: "title" });
    expect(content[1]).toMatchObject({ text: "My Book", style: "subtitle" });
    const para = content[content.length - 1] as { text: Array<{ text: string }> };
    expect(para.text[0].text).toBe("hello");
  });
});

describe("toPdfBlob (pdfmake 0.3 vfs registration)", () => {
  beforeEach(() => {
    addVirtualFileSystem.mockClear();
    createPdf.mockClear();
    getBlob.mockClear();
  });

  it("registers the vfs via addVirtualFileSystem and resolves a Blob", async () => {
    const blob = await toPdfBlob(sampleDoc());
    expect(addVirtualFileSystem).toHaveBeenCalledWith({
      "Roboto-Regular.ttf": "AAA",
    });
    expect(createPdf).toHaveBeenCalledTimes(1);
    expect(blob).toBeInstanceOf(Blob);
  });

  it("rejects (does not hang) when getBlob never calls back", async () => {
    vi.useFakeTimers();
    try {
      getBlob.mockImplementationOnce(() => {
        /* never invokes the callback — simulates the 0.2-API hang */
      });
      const promise = toPdfBlob(sampleDoc());
      const assertion = expect(promise).rejects.toThrow(/timed out/);
      await vi.advanceTimersByTimeAsync(30000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
