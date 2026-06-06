/**
 * Plain-text export (Maximal-Offline P2).
 *
 * Reuses the node-based `nodeToPlainText` walker (shared with the editor's
 * "Copy as plain text" action) so formatting is stripped consistently. The
 * document title heads the file; each section heading is underlined so the
 * structure survives in a format with no markup.
 */

import { nodeToPlainText } from "../utils/tiptap-markdown";
import type { ExportDocument } from "./documentModel";

/** Convert the export model to a plain-text string. */
export function toText(doc: ExportDocument): string {
  const blocks: string[] = [];
  const header = [doc.title.trim()];
  if (doc.subtitle?.trim()) header.push(doc.subtitle.trim());
  if (doc.author?.trim()) header.push(doc.author.trim());
  blocks.push(header.join("\n"));

  for (const section of doc.sections) {
    const heading = section.heading.trim();
    const body = nodeToPlainText(section.doc).trim();
    if (heading) {
      blocks.push(`${heading}\n${"=".repeat(heading.length)}`);
    }
    if (body) blocks.push(body);
  }
  return blocks.join("\n\n").trim() + "\n";
}
