/**
 * module-docx-export — browser-side counterpart of `plugin-export` (DOCX format).
 *
 * Offline parity layer (Maximal Offline, #34). Implementation lives in the
 * client export engine (`src/export/formatDocx.ts`, backed by the `docx`
 * package) and packs a `.docx` Blob entirely in the browser (`Packer.toBlob`).
 * This barrel is the stable plugin-parity seam under `modules/`; it re-exports
 * the engine rather than relocating it.
 *
 * @example
 * import { toDocxBlob } from "@/modules/module-docx-export";
 * const blob = await toDocxBlob(doc);
 */
export { toDocxBlob } from "../../export/formatDocx";
