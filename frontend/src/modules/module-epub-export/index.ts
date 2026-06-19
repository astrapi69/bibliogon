/**
 * module-epub-export — browser-side counterpart of `plugin-export` (EPUB format).
 *
 * Offline parity layer (Maximal Offline, #34). Implementation lives in the
 * client export engine (`src/export/formatEpub.ts`, backed by `epub-gen-memory`)
 * and assembles an in-memory EPUB3 Blob with no filesystem and no Pandoc. This
 * barrel is the stable plugin-parity seam under `modules/`; it re-exports the
 * engine rather than relocating it.
 *
 * @example
 * import { toEpubBlob } from "@/modules/module-epub-export";
 * const blob = await toEpubBlob(doc);
 */
export { toEpubBlob } from "../../export/formatEpub";
