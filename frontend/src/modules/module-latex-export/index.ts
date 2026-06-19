/**
 * module-latex-export — browser-side counterpart of `plugin-export` (LaTeX format).
 *
 * Offline parity layer (Maximal Offline, #34). Implementation lives in the
 * client export engine (`src/export/formatLatex.ts`) and emits LaTeX `.tex`
 * source directly in the browser. NOTE: producing the `.tex` source is fully
 * offline; compiling that source to a PDF requires Pandoc/LaTeX and stays
 * desktop-only (`FEATURES.PANDOC_EXPORT`). This barrel is the stable
 * plugin-parity seam under `modules/`; it re-exports the engine rather than
 * relocating it.
 *
 * @example
 * import { toLatex } from "@/modules/module-latex-export";
 * const tex = toLatex(doc);
 */
export { toLatex, escapeLatex, stripMarkdownAnchor } from "../../export/formatLatex";
