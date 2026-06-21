# module-latex-export

Frontend offline counterpart of **`bibliogon-plugin-export`** (LaTeX format).

- **Offline status:** Available for `.tex` source; PDF compile is desktop-only.
- **Implemented:** `toLatex` emits LaTeX `.tex` source directly in the browser.
  `escapeLatex` / `stripMarkdownAnchor` are the pure escaping helpers.
- **Backed by:** `src/export/formatLatex.ts` (re-exported, not relocated).
- **Missing / desktop-only:** compiling `.tex` → PDF needs a LaTeX/Pandoc
  toolchain and stays desktop-only (`FEATURES.PANDOC_EXPORT`). The browser
  produces source the user can compile elsewhere.
