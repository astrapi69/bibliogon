/**
 * EPUB export via `epub-gen-memory` (Maximal-Offline P2).
 *
 * Assembles one EPUB chapter per export section, reusing the HTML walker for
 * chapter bodies, and returns an in-memory EPUB3 Blob (no filesystem). The
 * import is lazy so the EPUB toolchain only loads on demand.
 */

import type { ExportDocument } from "./documentModel";
import { tiptapDocToHtml } from "./tiptapToHtml";

/** epub-gen-memory ships as CJS; depending on the bundler the callable lands
 *  at `default`, `default.default`, or the module root. Resolve all shapes. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- CJS/ESM interop unwrap
function resolveEpubFn(mod: any): (options: unknown, chapters: unknown) => Promise<unknown> {
  return mod?.default?.default ?? mod?.default ?? mod;
}

/** Generate an EPUB3 Blob for the export model. */
export async function toEpubBlob(doc: ExportDocument): Promise<Blob> {
  const mod = await import("epub-gen-memory");
  const epub = resolveEpubFn(mod);

  const chapters = doc.sections.map((section, index) => ({
    title: section.heading.trim() || `${doc.title} (${index + 1})`,
    content: tiptapDocToHtml(section.doc) || "<p></p>",
  }));

  // OPF Dublin-Core metadata (#605): epub-gen-memory maps these to
  // dc:title / dc:creator / dc:language / dc:description / dc:publisher /
  // dc:date / dc:identifier. Emit only the fields that are present.
  const options: Record<string, unknown> = {
    title: doc.title,
    author: doc.author?.trim() || "Unknown",
    lang: doc.language || "en",
  };
  if (doc.description?.trim()) options.description = doc.description.trim();
  if (doc.publisher?.trim()) options.publisher = doc.publisher.trim();
  if (doc.publishDate?.trim()) options.date = doc.publishDate.trim();
  if (doc.isbn?.trim()) options.id = doc.isbn.trim();

  const output = (await epub(options, chapters)) as BlobPart;
  return new Blob([output], { type: "application/epub+zip" });
}
