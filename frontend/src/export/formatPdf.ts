/**
 * PDF export via `pdfmake` (Maximal-Offline P2).
 *
 * Walks the export model into a pdfmake document definition (headings,
 * paragraphs with bold/italic runs, lists, blockquotes) and renders a PDF
 * Blob in the browser. pdfmake + its embedded fonts (vfs) are lazy-imported
 * so their ~1 MB weight only loads when the user exports PDF.
 *
 * The content walker (`docToPdfContent`) is a pure function exported for unit
 * testing; the actual pdfmake render is verified in the browser (E2E).
 */

import type { ExportDocument, TipTapNode } from "./documentModel";

type PdfRun = { text: string; bold?: boolean; italics?: boolean };
type PdfContent = Record<string, unknown>;

function inlineRuns(nodes: TipTapNode[]): PdfRun[] {
  const runs: PdfRun[] = [];
  for (const node of nodes) {
    if ((node.type as string) === "inlineMath") {
      runs.push({ text: `$${(node.attrs as { latex?: string })?.latex || ""}$` });
      continue;
    }
    if ((node.type as string) !== "text") {
      const nested = node.content as TipTapNode[] | undefined;
      if (nested) runs.push(...inlineRuns(nested));
      continue;
    }
    const marks = (node.marks as Record<string, unknown>[] | undefined) || [];
    runs.push({
      text: (node.text as string) || "",
      bold: marks.some((m) => m.type === "bold"),
      italics: marks.some((m) => m.type === "italic"),
    });
  }
  return runs;
}

function nodeToPdf(node: TipTapNode): PdfContent[] {
  const type = node.type as string;
  const content = (node.content as TipTapNode[] | undefined) || [];
  switch (type) {
    case "doc":
      return content.flatMap(nodeToPdf);
    case "paragraph":
      return [{ text: inlineRuns(content), margin: [0, 0, 0, 8] }];
    case "heading": {
      const level = Math.min(Math.max((node.attrs as { level?: number })?.level || 1, 1), 4);
      return [{ text: inlineRuns(content), style: `h${level}`, margin: [0, 8, 0, 4] }];
    }
    case "bulletList":
      return [
        {
          ul: content.map((item) =>
            inlineRuns((item.content as TipTapNode[])?.flatMap((c) => (c.content as TipTapNode[]) || []) || []),
          ),
          margin: [0, 0, 0, 8],
        },
      ];
    case "orderedList":
      return [
        {
          ol: content.map((item) =>
            inlineRuns((item.content as TipTapNode[])?.flatMap((c) => (c.content as TipTapNode[]) || []) || []),
          ),
          margin: [0, 0, 0, 8],
        },
      ];
    case "blockquote":
      return [
        {
          text: inlineRuns(content.flatMap((c) => (c.content as TipTapNode[]) || [])),
          italics: true,
          margin: [16, 0, 0, 8],
        },
      ];
    case "codeBlock":
      return [
        {
          text: content.map((n) => (n.text as string) || "").join(""),
          preserveLeadingSpaces: true,
          margin: [0, 0, 0, 8],
        },
      ];
    case "blockMath":
      return [
        {
          text: `$$${(node.attrs as { latex?: string })?.latex || ""}$$`,
          margin: [0, 0, 0, 8],
        },
      ];
    default:
      return content.length ? [{ text: inlineRuns(content), margin: [0, 0, 0, 8] }] : [];
  }
}

/** Build the pdfmake `content` array for the export model (pure; testable). */
export function docToPdfContent(doc: ExportDocument): PdfContent[] {
  const content: PdfContent[] = [{ text: doc.title, style: "title", margin: [0, 0, 0, 4] }];
  if (doc.subtitle?.trim()) content.push({ text: doc.subtitle.trim(), style: "subtitle", margin: [0, 0, 0, 4] });
  if (doc.author?.trim()) content.push({ text: doc.author.trim(), margin: [0, 0, 0, 16] });
  doc.sections.forEach((section, index) => {
    if (section.heading.trim()) {
      content.push({
        text: section.heading.trim(),
        style: "h1",
        pageBreak: index > 0 ? "before" : undefined,
        margin: [0, 8, 0, 8],
      });
    }
    content.push(...nodeToPdf(section.doc));
  });
  return content;
}

const PDF_STYLES = {
  title: { fontSize: 24, bold: true },
  subtitle: { fontSize: 14, italics: true, color: "#555555" },
  h1: { fontSize: 18, bold: true },
  h2: { fontSize: 15, bold: true },
  h3: { fontSize: 13, bold: true },
  h4: { fontSize: 12, bold: true },
};

/** pdfmake's vfs_fonts ships in several shapes across versions; resolve all. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- vfs interop unwrap
function resolveVfs(mod: any): Record<string, string> | undefined {
  return mod?.default?.pdfMake?.vfs ?? mod?.pdfMake?.vfs ?? mod?.default?.vfs ?? mod?.vfs ?? mod?.default;
}

/** A pdfmake document definition (kept loose: callers build it as plain data
 *  so the builders stay framework-free and unit-testable). */
export type PdfDocDefinition = Record<string, unknown>;

/**
 * Render an arbitrary pdfmake document definition to a PDF Blob.
 *
 * Centralises the version-sensitive pdfmake/vfs bootstrap (lazy import,
 * 0.3.x `addVirtualFileSystem`, Promise-form `getBlob()`) so every PDF
 * producer — the generic export engine AND bespoke layouts like the quality
 * report — shares one correct render path.
 */
export async function renderPdfDefinition(
  definition: PdfDocDefinition,
): Promise<Blob> {
  const pdfMakeMod = await import("pdfmake/build/pdfmake.js");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CJS/ESM interop
  const pdfMake: any = (pdfMakeMod as any).default ?? pdfMakeMod;
  const vfsMod = await import("pdfmake/build/vfs_fonts.js");
  const vfs = resolveVfs(vfsMod);
  if (vfs) {
    // pdfmake 0.3.x reads its fonts from `pdfMake.virtualfs`, populated via
    // `addVirtualFileSystem(vfs)`. The legacy `pdfMake.vfs = vfs` assignment
    // (0.2.x) is ignored by the 0.3.x renderer and produces a
    // "font not found" / "virtualfs.existsSync is not a function" error.
    if (typeof pdfMake.addVirtualFileSystem === "function") {
      pdfMake.addVirtualFileSystem(vfs);
    } else {
      pdfMake.vfs = vfs;
    }
  }

  // pdfmake 0.3.x: `getBlob()` returns a Promise; the 0.2.x callback form
  // (`getBlob(cb)`) no longer invokes the callback, which left this promise
  // unresolved (a hung export). Await the Promise form directly.
  return pdfMake.createPdf(definition).getBlob();
}

/** Generate a PDF Blob for the export model. */
export async function toPdfBlob(doc: ExportDocument): Promise<Blob> {
  return renderPdfDefinition({
    content: docToPdfContent(doc),
    styles: PDF_STYLES,
    defaultStyle: { fontSize: 11, lineHeight: 1.3 },
    info: { title: doc.title, author: doc.author || undefined },
  });
}
