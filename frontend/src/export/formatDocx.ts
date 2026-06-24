/**
 * DOCX export via the `docx` package (Maximal-Offline P2).
 *
 * Walks the export model into docx Paragraphs/TextRuns and packs a .docx
 * Blob entirely in the browser (Packer.toBlob). The `docx` import is lazy so
 * its weight only loads when the user actually exports Word.
 */

import type { Paragraph as DocxParagraph } from "docx";

import type { ExportDocument, TipTapNode } from "./documentModel";

type DocxModule = typeof import("docx");

function inlineRuns(nodes: TipTapNode[], docx: DocxModule): InstanceType<DocxModule["TextRun"]>[] {
  const { TextRun } = docx;
  const runs: InstanceType<DocxModule["TextRun"]>[] = [];
  for (const node of nodes) {
    if ((node.type as string) === "inlineMath") {
      runs.push(
        new TextRun({ text: `$${(node.attrs as { latex?: string })?.latex || ""}$` }),
      );
      continue;
    }
    if ((node.type as string) !== "text") {
      const nested = node.content as TipTapNode[] | undefined;
      if (nested) runs.push(...inlineRuns(nested, docx));
      continue;
    }
    const text = (node.text as string) || "";
    const marks = (node.marks as Record<string, unknown>[] | undefined) || [];
    const has = (t: string) => marks.some((m) => m.type === t);
    runs.push(
      new TextRun({
        text,
        bold: has("bold"),
        italics: has("italic"),
        strike: has("strike"),
      }),
    );
  }
  return runs.length ? runs : [new docx.TextRun("")];
}

function nodeToParagraphs(
  node: TipTapNode,
  docx: DocxModule,
): DocxParagraph[] {
  const { Paragraph, TextRun, HeadingLevel } = docx;
  const type = node.type as string;
  const content = (node.content as TipTapNode[] | undefined) || [];

  switch (type) {
    case "doc":
      return content.flatMap((child) => nodeToParagraphs(child, docx));
    case "paragraph":
      return [new Paragraph({ children: inlineRuns(content, docx) })];
    case "heading": {
      const level = Math.min(Math.max((node.attrs as { level?: number })?.level || 1, 1), 4);
      const headingLevel = [
        HeadingLevel.HEADING_1,
        HeadingLevel.HEADING_2,
        HeadingLevel.HEADING_3,
        HeadingLevel.HEADING_4,
      ][level - 1];
      return [new Paragraph({ heading: headingLevel, children: inlineRuns(content, docx) })];
    }
    case "bulletList":
      return content.flatMap((item) =>
        ((item.content as TipTapNode[]) || []).map(
          (child) =>
            new Paragraph({
              bullet: { level: 0 },
              children: inlineRuns((child.content as TipTapNode[]) || [], docx),
            }),
        ),
      );
    case "orderedList":
      return content.flatMap((item, i) =>
        ((item.content as TipTapNode[]) || []).map(
          (child) =>
            new Paragraph({
              children: [
                new TextRun({ text: `${i + 1}. `, bold: true }),
                ...inlineRuns((child.content as TipTapNode[]) || [], docx),
              ],
            }),
        ),
      );
    case "blockquote":
      return content.flatMap((child) => nodeToParagraphs(child, docx)).map(
        (p) => p,
      );
    case "codeBlock": {
      const code = content.map((n) => (n.text as string) || "").join("");
      return [
        new Paragraph({
          children: [new TextRun({ text: code, font: "Courier New" })],
        }),
      ];
    }
    case "blockMath":
      return [
        new Paragraph({
          children: [
            new TextRun({ text: `$$${(node.attrs as { latex?: string })?.latex || ""}$$` }),
          ],
        }),
      ];
    default:
      return content.length
        ? [new Paragraph({ children: inlineRuns(content, docx) })]
        : [];
  }
}

/** Generate a .docx Blob for the export model. */
export async function toDocxBlob(doc: ExportDocument): Promise<Blob> {
  const docx = await import("docx");
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx;

  const children: DocxParagraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: doc.title })] }),
  ];
  if (doc.subtitle?.trim()) {
    children.push(new Paragraph({ children: [new TextRun({ text: doc.subtitle.trim(), italics: true })] }));
  }
  if (doc.author?.trim()) {
    children.push(new Paragraph({ children: [new TextRun({ text: doc.author.trim() })] }));
  }
  for (const section of doc.sections) {
    if (section.heading.trim()) {
      children.push(
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: section.heading.trim() })] }),
      );
    }
    children.push(...nodeToParagraphs(section.doc, docx));
  }

  // Core document properties (#605): title / creator / description /
  // subject / keywords surface in Word's File > Info panel and in search.
  const keywords = (doc.keywords ?? []).filter((k) => k.trim()).join(", ");
  const document = new Document({
    title: doc.title,
    creator: doc.author?.trim() || undefined,
    description: doc.description?.trim() || undefined,
    subject: doc.genre?.trim() || keywords || undefined,
    keywords: keywords || undefined,
    lastModifiedBy: "Bibliogon",
    sections: [{ children }],
  });
  return Packer.toBlob(document);
}
