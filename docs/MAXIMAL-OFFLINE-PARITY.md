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
| **audiobook** | TTS audiobook export + editor read-aloud | `module-audiobook` | `lib/utils/webSpeech.ts` + `hooks/ui/useWebSpeechTts.ts` (read-aloud) | **Partial** - multi-engine audiobook export No (cloud/server); editor read-aloud **Yes** (browser-native Web Speech API, #666) | export `tts` (`DESKTOP_ONLY`); read-aloud active |
| **story-bible** | Per-book fiction-entity DB | _(no module; storage seam)_ | `storage/dexie/story-bible.ts` + `hooks/useStoryBibleIntegration.ts` | **Partial** — CRUD offline; auto-detect / continuity-check need server | active (`story-bible`) |
| **grammar** | LanguageTool checks + AI grammar-check | _(no module)_ | `ai/text-tools/aiTextTools.ts` (browser-direct provider) | **Yes** via the configured AI provider (browser-direct, key required, #661/#669); LanguageTool server path No | `ai-grammar` (`REQUIRES_AI_KEY`); server: `grammar` (`DESKTOP_ONLY`) |
| **kdp** | KDP metadata + cover validation | _(no module)_ | `components/kdp-wizard/CoverValidation.tsx` (dimension checks) | **Partial** — basic cover preflight offline; catalog desktop-only | `kdp-category-catalog` (catalog) |
| **translation** | DeepL / LMStudio translation + AI translation | _(no module)_ | `ai/text-tools/aiTextTools.ts` (browser-direct) + `components/TranslationLinks.tsx` (links) | **Yes** via the configured AI provider (browser-direct, key required, #661/#669); DeepL/LMStudio server path No | `ai-translate` (`REQUIRES_AI_KEY`); execution server: `translation` (`DESKTOP_ONLY`) |
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
  `requires_desktop_app`) for the multi-engine audiobook *export*; the
  editor's browser-native **read-aloud** (Web Speech API, `useWebSpeechTts`)
  is a separate, capability-detected feature that runs fully offline (#666). ✓
- `module-git-backup` → `FEATURES.GIT_BACKUP` (`DESKTOP_ONLY`). ✓
- `module-git-sync` push/sync → `FEATURES.GIT_SYNC` (`DESKTOP_ONLY`); import →
  `FEATURES.GITHUB_IMPORT` (`NEEDS_NETWORK` → disabled offline). ✓
- `module-latex-export` PDF compile → `FEATURES.PANDOC_EXPORT` (`DESKTOP_ONLY`);
  `.tex` source itself is active. ✓
- `module-pdf/epub/docx-export`, `module-medium-import`, `module-kinderbuch`
  (`picture-book`), `module-comics`, `module-ms-tools` → active in both modes,
  no gate needed (pure client-side / storage seam). ✓

**Resolved (these two former gaps are now gated — #34 continuation):**

1. **Grammar** (`plugin-grammar`) → `FEATURES.GRAMMAR` (`DESKTOP_ONLY` →
   `disabled`, reason `requires_desktop_app`). The editor spellcheck toggle
   (`Editor.tsx`) now disables + explains offline instead of calling
   `api.grammar.check` on the `guardedFetch` backstop. ✓
2. **Translation execution** (`ArticleTranslatePanel`, DeepL/LMStudio) →
   `FEATURES.TRANSLATION` (`DESKTOP_ONLY`). Offline the panel renders a
   disabled control + desktop-app notice and fires zero `/api`
   (no providers/health fetch). ✓ `TranslationLinks` stays gated via
   `TRANSLATION_LINKS`.

Both verified by `featureConfig.test.ts` (state/reason in api vs dexie) and
`ArticleTranslatePanel.test.tsx` (disabled offline + zero `/api`, active
online).

**Offline browser-direct AI text tools (#661/#669):** alongside the
server-bound grammar/translation paths above, the editor now ships an
offline **AI grammar-check + translation** (`ai/text-tools/aiTextTools.ts`,
`components/editor/ai-tools/AiTextTools.tsx`) that calls the configured AI
provider directly from the browser. These are the `AI_GRAMMAR` /
`AI_TRANSLATE` features, gated `REQUIRES_AI_KEY` (visible-but-disabled with a
"configure a provider key" reason until a key is set), so the offline build
offers a working grammar + translation path with no backend - the
browser-direct counterpart to the desktop-only LanguageTool / DeepL paths.

**Editor server-bound tools — verified disabled offline (correction
2026-06-24):** an earlier revision of this section claimed the inline
ms-tools **style-check** (`api.msTools.check`) and the editor **audio
preview** (`api.audiobook.preview`, a TTS path) "can surface enabled and
fail on the `guardedFetch` backstop" in Dexie mode. That is **inaccurate**.
Both gate on `isPluginAvailable(pluginStatus, …)`, and in Dexie mode
`getStorage().editorPluginStatus.get()` resolves to the empty map `{}`
(`storage/dexie/backend-only.ts` — backend-only probes return the empty
defaults the editor expects, **without** firing `/api`). So
`isPluginAvailable(pluginStatus, "ms-tools" | "audiobook")` is `false`
offline, the toolbar passes `onToggleStyleCheck`/`onPreviewAudio` as
`undefined`, and both controls render **disabled and inert** — zero `/api`,
no `guardedFetch` rejection. The zero-`/api` invariant holds here.

The only residual is cosmetic: the disabled tooltip falls back to the
generic `pluginDisabledMessage` ("Plugin nicht verfügbar") rather than the
policy-#78 `ui.feature.requires_desktop_app` reason used by the
`FEATURES.*`-gated surfaces. Routing these two through a `FEATURES.*`
verdict (`FEATURES.TTS` for preview; a new `FEATURES.STYLE_CHECK` for the
ms-tools decorations) would make the *explanation* consistent — but it is a
tooltip-copy refinement, not a functional or zero-`/api` gap.

## 4. Audit confirmation — #67 items 2/3 (2026-06-24)

**Item 2 — hidden vs disabled (three-state visibility).** Audit of every
gate-bearing surface: **zero** features resolve to `hidden` in product UI.
`featureConfig.ts` emits only `active` or `disabled`+reason; the lone
`hidden` is the library's fail-closed default for *unknown* ids (a typo
safety net, never a product state). Policy #78 ("nothing the user owns is
hidden — it is active or disabled with a reason") holds. No change needed.
The `grep "hidden"` hits in the frontend are all CSS `className="hidden"`
(visually-hidden file inputs) or `input:not([type='hidden'])` focus filters
— not feature gates.

**Item 3 — zero `/api` in Dexie mode.** Every `fetch()` outside the
`guardedFetch` choke point classified:

| Site | Hits `/api`? | Offline behaviour |
|------|-------------|-------------------|
| `api/http.ts` (`guardedFetch`) | n/a | the single egress choke point; rejects `/api` on the backendless build |
| `utils/platform/versionCheck.ts` (`/api/health`) | yes | gated behind `!forcedOffline` in `main.tsx` — not called offline |
| `storage/connectivity.ts` (`/api/health` probe) | yes | online-monitor only; not started in forced-dexie |
| `storage/api-storage.ts`, `storage/offline-download.ts` | yes | `ApiStorage` / take-offline run in **online** mode only |
| `storage/dexie/backend-only.ts` (publications, platforms, **editorPluginStatus**) | no | return empty defaults `[]` / `{}` offline — never fetch |
| `ai/llmClient.ts` | no | browser-direct to the user's AI provider (by design) |
| `import/{githubImport,urlImport}.ts`, `medium-import/clientImport.ts`, `useRemoteDefaultBranch.ts`, `lib/utils/updateChecker.ts` | no | external URLs (GitHub / user URL / Medium CDN / GitHub Releases) — by design |
| `export/bgbExport.ts` | no | fetches the article's external `featured_image_url` (CDN), not `/api` |

No site bypasses `guardedFetch` to reach `/api` in Dexie mode. The offline
E2E (`offline-pwa.spec.ts`) enforces this with a hard
`route.abort('**/api/**')` gate.

**Composition mode in all editors.** The prose composition mode
(`Editor.tsx`, Ctrl+Shift+D — typewriter scroll + paragraph dimming) is
prose-specific. Comic + picture-book use the canvas-appropriate analog:
browser-native fullscreen (`useFullscreenToggle`, Ctrl+Shift+F) in
`ComicBookEditor.tsx` + `PageEditor.tsx`. Distraction-free editing is
available in every editor.
