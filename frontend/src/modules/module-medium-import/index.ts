/**
 * module-medium-import — browser-side counterpart of `plugin-medium-import`.
 *
 * Full offline parity (Maximal Offline, #34). A Medium HTML-export ZIP is parsed
 * entirely in the browser (`fflate` unzip + `DOMParser` walker) and imported as
 * Article + Publication rows through the storage seam, with no `/api` call.
 * Implementation lives in `src/medium-import/{clientImport,walker}.ts`; this
 * barrel is the stable plugin-parity seam under `modules/`.
 *
 * @example
 * import { parseMediumZip, importParsed } from "@/modules/module-medium-import";
 */
export { parseMediumZip, importParsed } from "../../medium-import/clientImport";
export type {
    ClientMediumPreview,
    ClientImportSettings,
    ImportProgress,
    ImportProgressCallback,
} from "../../medium-import/clientImport";
export { parseMediumPost, detectLanguage, classifyAsComment } from "../../medium-import/walker";
export type { TipTapMark, TipTapNode, TipTapDoc, ImageRef, ParsedPost } from "../../medium-import/walker";
