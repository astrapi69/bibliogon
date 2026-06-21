# Maximal Offline — Plugin ↔ Module Parity

Audit + map for issue **#34** (Maximal Offline: full desktop parity for the
GitHub-Pages PWA). Every backend plugin (`bibliogon-plugin-{name}`) is paired
with a frontend module (`frontend/src/modules/module-{name}/`) that is the
named home for its browser-side (PWA / Dexie) counterpart.

The module layer is a **barrel seam, not a code relocation**: each
`module-*/index.ts` re-exports the offline implementation from its canonical
concern-first folder (`export/`, `lib/utils/`, `import/`, `medium-import/`,
`components/comics/`, …); the implementation stays the single source of truth.
See [`frontend/src/modules/README.md`](../frontend/src/modules/README.md) and
[`MODULE-ARCHITECTURE.md`](MODULE-ARCHITECTURE.md).

## Parity table (all 13 plugins)

| Plugin | Purpose | Frontend module | Offline impl (canonical) | Offline? | Gate |
|--------|---------|-----------------|--------------------------|----------|------|
| **ms-tools** | Style checks, metrics, Flesch / Schachtelsatz | `module-ms-tools` | `lib/utils/{chapterMetrics,sentenceComplexity,textStats}.ts` | **Partial** — metrics offline; server style-checks not | active |
| **export** (PDF) | PDF export | `module-pdf-export` | `export/formatPdf.ts` (`pdfmake`) | **Yes** | active |
| **export** (EPUB) | EPUB export | `module-epub-export` | `export/formatEpub.ts` (`epub-gen-memory`) | **Yes** | active |
| **export** (DOCX) | DOCX export | `module-docx-export` | `export/formatDocx.ts` (`docx`) | **Yes** | active |
| **export** (LaTeX) | LaTeX export | `module-latex-export` | `export/formatLatex.ts` | **Yes** for `.tex`; PDF compile desktop-only | active / `pandoc-export` |
| **medium-import** | Medium HTML-export importer | `module-medium-import` | `medium-import/{clientImport,walker}.ts` | **Yes** (DOMParser + `fflate`) | `medium-import` |
| **kinderbuch** | Picture-book layouts | `module-kinderbuch` | `lib/utils/{pageLayoutStyles,pageTextContent}.ts` + `components/LayoutPicker.tsx` | **Yes** (storage seam) | `picture-book` |
| **comics** | Multi-panel comic pages | `module-comics` | `components/comics/{bubblePath,tailDerivation,bubbleTypeStyle}.ts` + `storage/dexie/comics.ts` | **Yes** (storage seam) | `comics` |
| **git-sync** (import) | GitHub import | `module-git-sync` | `import/{githubImport,githubToken}.ts` (GitHub REST) | **Partial** — needs network | `github-import` |
| **git-sync** (backup/push) | Git commit/push | `module-git-backup` | — | **No** — needs git binary | `git-sync` / `git-backup` |
| **audiobook** | TTS audiobook | `module-audiobook` | — | **No** — TTS cloud/server | `tts` |
| **story-bible** | Per-book fiction-entity DB | _(no module; storage seam)_ | `storage/dexie/story-bible.ts` + `hooks/useStoryBibleIntegration.ts` | **Partial** — CRUD offline; auto-detect / continuity-check need server | active (`story-bible`) |
| **grammar** | LanguageTool checks | _(no module)_ | — | **No** — LanguageTool server | _(none — gap, see §3)_ |
| **kdp** | KDP metadata + cover validation | _(no module)_ | `components/kdp-wizard/CoverValidation.tsx` (dimension checks) | **Partial** — basic cover preflight offline; catalog desktop-only | `kdp-category-catalog` (catalog) |
| **translation** | DeepL / LMStudio translation | _(no module)_ | `components/TranslationLinks.tsx` (links only, gated) | **Partial** — local LMStudio if self-hosted; DeepL needs key/network | `translation-links` (links); execution: _gap, see §3_ |
| **help** | In-app help | _(no module)_ | `storage/seed/seed-help*.json` | **Yes (static)** | active |
| **getstarted** | Onboarding + sample book | _(no module)_ | `storage/seed/seed-getstarted.json` | **Yes (static)** | active |

> The 11 `module-*` directories cover the plugins named in the #34 module plan.
> Plugins whose offline behaviour is purely storage-seam CRUD (story-bible) or
> seeded static content (help, getstarted) — or that have no browser path at all
> (grammar) — are tracked in the table but did not warrant a barrel in this pass;
> add one if/when a discrete client-side helper is extracted for them.

## 1. Modules created (Phase 2/3)

`frontend/src/modules/` — 11 directories, each with `index.ts` (TSDoc + barrel)
and `README.md` (offline status). Existing code was **not moved**: barrels
re-export from the canonical concern-first locations so no import path changed
and the suite stays green (334 files / 3600 Vitest tests, `tsc` + ESLint clean).
This honours the `MODULE-ARCHITECTURE.md` rule "re-export, never relocate".

## 2. Library-First note

No new dependencies. Every offline path already uses a vetted library at the
right hierarchy stage: `pdfmake` / `epub-gen-memory` / `docx` (export),
`fflate` + native `DOMParser` (Medium import), native `fetch` against the GitHub
REST API (git import), and pure in-browser computation for metrics + comic/
picture-book geometry. The barrels add zero runtime weight.

## 3. Feature-strategy gate review (Phase 5)

Gates are resolved through `@astrapi69/feature-strategy`
(`features/featureConfig.ts`, `useFeature(id)`); browser-impossible surfaces
resolve to `disabled` (visible + explained, policy #78), network-bound surfaces
to `disabled` only when `navigator.onLine === false`.

**Correctly gated** (verified against `featureConfig.ts`):

- `module-audiobook` → `FEATURES.TTS` (`DESKTOP_ONLY` → disabled, reason
  `requires_desktop_app`). ✓
- `module-git-backup` → `FEATURES.GIT_BACKUP` (`DESKTOP_ONLY`). ✓
- `module-git-sync` push/sync → `FEATURES.GIT_SYNC` (`DESKTOP_ONLY`); import →
  `FEATURES.GITHUB_IMPORT` (`NEEDS_NETWORK` → disabled offline). ✓
- `module-latex-export` PDF compile → `FEATURES.PANDOC_EXPORT` (`DESKTOP_ONLY`);
  `.tex` source itself is active. ✓
- `module-pdf/epub/docx-export`, `module-medium-import`, `module-kinderbuch`
  (`picture-book`), `module-comics`, `module-ms-tools` → active in both modes,
  no gate needed (pure client-side / storage seam). ✓

**Findings (gaps, pre-existing — flagged for follow-up, NOT changed here):**

1. **Grammar** (`plugin-grammar`) has no `FEATURES.*` id. Its editor surfaces
   call the backend LanguageTool path; offline they hit the `guardedFetch`
   egress backstop rather than a `disabled`+explained gate. Per the
   architecture rule, a server-bound feature should be gated, not merely
   blocked. Recommend a `FEATURES.GRAMMAR` (`DESKTOP_ONLY`/network) gate.
2. **Translation execution** (`ArticleTranslatePanel`, DeepL/LMStudio) is
   un-gated (only `TranslationLinks` is gated via `TRANSLATION_LINKS`). Same
   backstop-vs-gate situation. Recommend a `FEATURES.TRANSLATION` gate
   (network-dependent; LMStudio-local could keep it active).

Both are out of scope for this structural/parity PR (adding a gate touches
`featureConfig.ts` + the UI surface + i18n + tests). Filing them as the
follow-up keeps this PR a clean re-export + documentation change.
