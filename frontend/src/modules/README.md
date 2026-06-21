# `src/modules/` — plugin-parity offline modules

One `module-{name}/` per backend plugin (`bibliogon-plugin-{name}`), forming the
**Maximal Offline** parity seam (issue #34): each module is the named home for a
backend plugin's browser-side (PWA / Dexie) counterpart.

This is a **public-seam / barrel layer, not a code relocation.** Each
`module-*/index.ts` re-exports the offline implementation from its canonical,
concern-first location (`export/`, `lib/utils/`, `import/`, `medium-import/`,
`components/comics/`, …) with TSDoc + an `@example`. The implementations stay
where they are (the single source of truth); the module barrels give every
offline feature a stable, plugin-named import path and a `README.md` recording
its offline status. Gated, browser-impossible plugins (audiobook, git-backup)
carry a module too, so the parity map is complete and each gate's rationale has
a home.

| Module | Plugin | Offline |
|--------|--------|---------|
| `module-ai` | (core AI routes) | Partial (browser-direct for CORS-capable providers; SSE review + template file-I/O desktop-only) |
| `module-ms-tools` | ms-tools | Partial (metrics yes; style checks no) |
| `module-pdf-export` | export (PDF) | Yes (`pdfmake`) |
| `module-epub-export` | export (EPUB) | Yes (`epub-gen-memory`) |
| `module-docx-export` | export (DOCX) | Yes (`docx`) |
| `module-latex-export` | export (LaTeX) | Yes for `.tex`; PDF compile desktop-only |
| `module-medium-import` | medium-import | Yes (DOMParser + `fflate`) |
| `module-kinderbuch` | kinderbuch | Yes (storage seam + layout helpers) |
| `module-comics` | comics | Yes (storage seam + bubble geometry) |
| `module-git-sync` | git-sync (import) | Partial (GitHub REST, needs network) |
| `module-git-backup` | git-sync (backup) | No (needs git binary) |
| `module-audiobook` | audiobook | No (TTS cloud/server) |

Full audit + every plugin's verdict: [`docs/MAXIMAL-OFFLINE-PARITY.md`](../../../docs/MAXIMAL-OFFLINE-PARITY.md).
