# PWA Feature-Parity Audit (Dexie mode)

**Date:** 2026-08-29
**Branch:** `claude/pwa-parity-audit-j3d9fd`
**Umbrella issue:** #727 (epic: full feature parity in PWA / Dexie mode)

## Strategic frame

The GitHub-Pages PWA in Dexie mode is the product. Every feature Bibliogon has
must work in the browser. The Docker/desktop path is demoted to a self-host
option for power users and receives no feature of its own anymore. Consequence:
every `disabled + reason "Benötigt Desktop-App"` is a **port task**, not an
accepted state. The only permanent exception is browser automation against KDP
(no API exists).

## Method (Verify-First)

Three code sweeps plus a live run — the ROADMAP and prior session notes were
NOT trusted for current state:

1. **Feature registry sweep** — every condition in
   `frontend/src/features/featureConfig.ts` (the
   `@astrapi69/feature-strategy` registry) and every `useFeature` consumer.
2. **Plugin-mirror inventory** — all 13 backend plugins vs their TS mirrors
   (`frontend/src/export/`, `lib/`, `ai/`, `medium-import/`, `storage/dexie/`,
   plus the per-plugin verdicts in `frontend/src/modules/module-*/index.ts`).
3. **Seam-bypass sweep** — `settingsSeamGuard.test.ts` scope plus all direct
   `api.*` call sites in `components/` + `pages/`.
4. **Live click-through** — the BUILT `VITE_STORAGE_MODE=dexie` bundle served
   via `vite preview` (no backend), driven with Playwright
   (`scripts/audit/pwa-parity/walk-dexie-build.mjs` +
   `walk-book-surfaces.mjs`, both throwaway). Recorded per route: `/api`
   requests fired (zero everywhere, including after opening the un-gated KDP
   wizard — `guardedFetch` rejects BEFORE the network, so route-abort E2E can
   never see these failures), desktop-only hints, disabled buttons, and
   `#root` bounding-box height (no zero-height collapse found on any route).
5. **CORS preflights** — real `OPTIONS` requests with
   `Origin: https://astrapi69.github.io` for every Class C provider (results
   and environment caveats below).

Key live observations:

- Zero `/api` network requests across all 11 top-level routes and all
  book-level routes (export, git-backup, git-sync, metadata, KDP wizard).
- `/writing-history`: "CSV exportieren" correctly disabled with reason
  "Diese Funktion benötigt die Bibliogon Desktop-App".
- `/books/:id/git-backup` + `/git-sync`: proper `FeatureNotice`.
- Export page: the **audiobook format is silently absent** (hidden, not
  disabled-with-reason — the only DESKTOP_ONLY consumer violating policy #78).
- The **KDP wizard button is enabled** in Dexie mode with no gate; step 0
  fires `POST /kdp/check-metadata` into the `guardedFetch` rejection and
  shows a raw transport error instead of an explanation.

## Parity table — already at parity (state: active)

These work fully offline through the storage seam, seed data, or
browser-native paths. Listed for completeness; no action.

| Feature | Mechanism |
|---|---|
| Books / chapters / articles CRUD, trash, editors | storage seam (`getStorage()`) |
| Picture-book authoring (13 layouts, collage, text stack) | seam + `lib/utils/pageLayoutStyles.ts` |
| Comic authoring (panels, bubbles, tails) | seam + `components/comics/` client geometry |
| Story Bible entity CRUD, relationships, links, Markdown export | `storage/dexie/story-bible.ts` |
| Storyboard (prose + pages), chapter labels, outliner | seam |
| Client export: MD / HTML / Text / PDF / EPUB / DOCX / LaTeX-source | `frontend/src/export/` (pdfmake, epub-gen-memory, docx) |
| Picture-book client PDF (KDP trim sizes, colour-true since #692) | `export/picturebook/` |
| Full-data backup export/import (`.bgb` + JSON), selective export | `export/backup*`, `bgbExport.ts` |
| Import: Markdown / Text / HTML / JSON backup / `.bgb` / Medium ZIP | `frontend/src/import/`, `medium-import/clientImport.ts` |
| GitHub import + URL import (network-gated, not backend-gated) | `import/githubImport.ts` — browser-direct GitHub REST |
| AI: generate, fill, grammar, translate (selection), story extraction, SEO meta | browser-direct with user key (`ai/`), key-gated |
| Read-aloud (Web Speech), keyboard-shortcut dialog | `hooks/ui/useWebSpeechTts.ts` |
| Writing history + statistics dashboards | client aggregation (`lib/utils/writingDashboard.ts`) |
| Quality report chapter metrics (Flesch, style counts) | `lib/utils/chapterMetrics.ts` (port of `readability.py` + `style_checker.py`) |
| Help, FAQ, shortcuts, Get-Started guide + sample book | seed data (`storage/seed/seed-help*.json`), seam writes |
| Book creation from builtin templates ("Aus Vorlage") | `data/bookTemplates.ts` client catalog (#670) |
| Settings (appearance, behaviour, editor, AI keys, data mgmt, danger zone) | seam / client-side |
| Authors DB, pen names, publications (read), platforms (read) | seam |
| Event recorder, storage quota, SW update flow | client-side |

## Parity table — gaps (the port queue)

Port classes: **A** pure TS port · **B** browser-native API · **C** cloud
provider from browser (user key + CORS) · **D** WASM/ONNX in browser ·
**E** needs a relay · **F** reuse from adaptive-learner · **X** structurally
impossible.

Size = estimated agent sessions.

| # | Feature | Current PWA state | Backend dependency | Class | Library candidate | Size |
|---|---|---|---|---|---|---|
| 1 | Chapter version history / snapshots | disabled+Reason (`version-history`) | `chapter_versions` table + `/chapters/*/versions` | A | Dexie table (no new dep) | 2 |
| 2 | Article comments panel offline | silently empty (`comments = []`) | none — seam `CommentStorage` EXISTS, panel bypasses it | A | none | 0.5 |
| 3 | Save-as-template + user book templates | un-gated live button, fails on `guardedFetch` | `/templates` CRUD | A | Dexie table (interface pre-declared in `data/bookTemplates.ts`) | 1.5 |
| 4 | Chapter templates (picker, save, JSON import/export) | un-gated, fails offline | `/chapter-templates` + 4 builtins | A | Dexie table + seed JSON | 1.5 |
| 5 | Story Bible auto-detect + continuity checker | stubs return `[]` | `autodetect.py`, `continuity.py` (pure text scan) | A | none (word-boundary scan) | 1 |
| 6 | ms-tools: sanitizer, style-check endpoint parity, metrics CSV | missing client-side | `sanitizer.py`, `/ms-tools/*` | A | none (port) | 2 |
| 7 | DOCX + EPUB import | backend-only (CIO-04 Pandoc) | Pandoc office readers | A | `mammoth` 1.12.2 (DOCX→HTML); fflate + DOMParser (EPUB) | 2 |
| 8 | Scrivener `.scriv` import | backend-only | `.scrivx` XML parse (defusedxml) | A | fflate (installed) + browser DOMParser (XML) | 1.5 |
| 9 | write-book-template ZIP (`.bgp`) import | backend-only ("smart import") | scaffold reader, MD→TipTap | A | fflate + existing `chapterImporters.ts` | 1.5 |
| 10 | KDP publishing state + ARC reviewers | un-gated, every call fails | `BookPublishingState` + reviewer CRUD | A | Dexie table | 1 |
| 11 | KDP metadata checker + category catalog | wizard stuck at step 0 with transport error; catalog gated | `metadata_checker.py`, `/kdp/categories` (26 static rows) | A | port + seed JSON | 1 |
| 12 | KDP cover validation | backend-only | `cover_validator.py` (dimensions, ratio, format) | B | browser `createImageBitmap` / `Image` | 1 |
| 13 | KDP package export (EPUB + print PDF + metadata ZIP) | backend-only (`/kdp/package`) | `package.py`, WeasyPrint print PDF | A | client EPUB + client PDF + fflate ZIP | 2 |
| 14 | `.bgp` project export (write-book-template ZIP) | missing (only backend `fmt=project`) | `scaffolder.py` | A | fflate + TS scaffolder port | 2 |
| 15 | Comic-book PDF export | backend-only (WeasyPrint) | `comic_book_pdf/` | A | pdfmake vector shapes (extend `export/picturebook/`) | 2.5 |
| 16 | Bulk export (books + articles, multi-format ZIP) | disabled+Reason (`bulk-export`) | `/books/bulk-export` (Pandoc loop) | A | loop client engine + fflate | 1.5 |
| 17 | Writing-history CSV export | disabled+Reason (`writing-history-csv`) | CSV serialization only — data is already client-side | B | none (string build + Blob download) | 0.5 |
| 18 | AI template `.biblio.yaml` export/import | disabled+Reason (`ai-template-file-io`) | YAML build/parse + template schema | A | `yaml` 2.9.0 | 1.5 |
| 19 | Translation links (sibling books) | disabled+Reason (`translation-links`) | server-side sibling grouping | A | Dexie link table | 1 |
| 20 | Publications mutations (create, delete, mark-published, verify-live) | read-only offline, mutations un-gated | `/publications` CRUD | A | seam extension (verify-live degrades w/o CORS) | 1 |
| 21 | Backup history + compare | disabled+Reason (2 ids) | server-held snapshot store + diff | A | IndexedDB/OPFS snapshot store + client `.bgb` diff | 2 |
| 22 | Audiobook export via cloud TTS (user key) | format hidden from export list (policy-#78 violation) | manuscripta TTS engines | C | Google Cloud TTS (CORS **verified PASS**), OpenAI TTS (CORS known-good), ElevenLabs (verify-first) | 3 |
| 23 | Grammar check (LanguageTool, structured findings) | disabled+Reason (`grammar`); AI-grammar exists as alternative | LanguageTool proxy | C | `api.languagetool.org` browser-direct (verify-first) | 1.5 |
| 24 | Article/book translation (DeepL parity) | disabled+Reason (`translation`); AI-translate covers selections | DeepL / LMStudio via backend | C | DeepL browser CORS verify-first; fallback: whole-doc translation on the browser-direct AI path | 2 |
| 25 | Medium import: image mirroring | images stay on Medium CDN (broken offline) | `image_downloader.py` | C | browser fetch of CDN images (verify-first) → `articleAssets` blobs | 1 |
| 26 | Local neural TTS (no key, offline) | missing | — (new capability) | D | `kokoro-js` 1.2.1 (~80-300 MB model, lazy + Cache API) or `@mintplex-labs/piper-tts-web` 1.0.5 (~20-60 MB/voice) | 3 |
| 27 | Print-grade PDF (Pandoc/LaTeX fidelity) | disabled+Reason (`pandoc-export`); client PDF exists as baseline | Pandoc/LaTeX, WeasyPrint | D | `@myriaddreamin/typst.ts` 0.7.0 (WASM, lazy-loaded) | 3 |
| 28 | Git sync + git backup | disabled+Reason (2 ids) | git binary + clone/commit/push | E | GitHub REST (Git Data API) — recommended; `isomorphic-git` 1.41.9 + LightningFS rejected (needs CORS proxy) | 4 |
| 29 | Multi-device / LAN sync | disabled+Reason (`lan-mode`) | FastAPI LAN server + PIN gate | F | lift adaptive-learner Phase-13 (QR pairing, Local-Sync, AI-assisted merge) | 5+ |

**Class totals: A 19 · B 2 · C 4 · D 2 · E 1 · F 1 · X 2 (below).**

## Class X — structurally impossible (permanent exceptions)

1. **KDP browser automation** (upload to kdp.amazon.com): Amazon offers no
   publishing API; automating their web UI from a third-party origin is
   impossible in a browser (frame isolation, CORS, bot protection). Stays
   `disabled + Reason` / guide-step only. Allowed by the strategic decision.
2. **Python plugin ZIP install/runtime** (Settings > Plugins install): the
   plugin mechanism executes Python entry points and shells out to native
   binaries (Pandoc, git, WeasyPrint, TTS engines). A browser has no Python
   runtime with those binaries; Pyodide cannot ship them. Evidence: all 13
   plugins' *capabilities* are ported individually via the TS-Engine-Mirror
   pattern (this queue) — the *install mechanism* is desktop infrastructure
   with no user-owned feature behind it that is not covered by a mirror. The
   Plugins tab already renders empty in Dexie mode by design
   (`pages/Settings.tsx:140`).

## Class C — CORS preflight results

Preflights ran with `Origin: https://astrapi69.github.io` and
`Access-Control-Request-Method`/`-Headers`. **Environment caveat:** this
audit ran in a sandboxed CI environment whose egress proxy denies CONNECT to
several hosts. A proxy denial is NOT a CORS verdict — per the project's own
lesson ("'Provider X is CORS-blocked' must be proven with a live preflight,
not assumed"), those providers are recorded as *unverifiable from this
environment* and every affected port issue carries a mandatory
verify-preflight-first step from a real PWA origin.

| Provider | Endpoint | Result |
|---|---|---|
| Google Cloud TTS | `POST texttospeech.googleapis.com/v1/text:synthesize` | **PASS** — `HTTP/2 200`, `access-control-allow-origin: https://astrapi69.github.io`, `access-control-allow-methods: …POST…`, `access-control-allow-headers: content-type,x-goog-api-key`, `access-control-max-age: 3600` |
| OpenAI (incl. TTS `/v1/audio/speech`) | — | **PASS** (confirmed 2026-06-19, `docs/explorations/openai-cors-browser-direct-analysis.md`; not re-verified per instruction) |
| Mistral | — | **PASS** (confirmed 2026-06-19; not re-verified) |
| Anthropic / Gemini / LM Studio | — | **PASS** (confirmed 2026-06-19 sweep, `featureConfig.ts:31-41`) |
| ElevenLabs | `api.elevenlabs.io` | **UNVERIFIABLE HERE** — proxy `CONNECT api.elevenlabs.io:443` → `HTTP/1.1 403 Forbidden` (gateway policy denial before TLS; no provider response received) |
| DeepL (free + pro) | `api-free.deepl.com`, `api.deepl.com` | **UNVERIFIABLE HERE** — same gateway CONNECT 403 |
| LanguageTool public | `api.languagetool.org/v2/check` | **UNVERIFIABLE HERE** — same gateway CONNECT 403 |
| Edge TTS | `speech.platform.bing.com` (WebSocket) | **UNVERIFIABLE HERE** — gateway 403; additionally a WS endpoint, CORS does not apply, but origin-based rejection is likely; treat as non-candidate |
| Medium CDN | `cdn-images-*.medium.com` | not preflighted (issue #25 carries verify-first) |
| GitHub REST API | `api.github.com` | **PASS by shipped evidence** — the PWA's GitHub import (#352) already runs browser-direct against `api.github.com` in production; this environment mediates GitHub through its own gateway so a raw preflight from here is not meaningful |

Note for Class C audiobook work: cloud TTS providers return encoded audio
(MP3) directly, so no client-side MP3 encoder is needed on the Class C path.
Only Class D (local WASM TTS, raw PCM) needs encoding — prefer the
browser-native WebCodecs `AudioEncoder` (Opus) over the stale `lamejs`
(last published 2021).

## Class E — Git sync: two paths, one recommendation

**Path 1 — isomorphic-git + LightningFS + CORS proxy.** `isomorphic-git`
1.41.9 (maintained, 2026-08) + `@isomorphic-git/lightning-fs` 4.7.0 give a
real git repo in IndexedDB: local history, branches, true clone/push against
any git host. But the git smart-HTTP protocol is not CORS-enabled by any
major host, so every clone/push must go through a CORS proxy
(`cors.isomorphic-git.org` is a community courtesy instance explicitly not
for production). That means Aster runs and pays for a proxy (a Cloudflare
Worker, ~free tier at this scale, but it is operated infrastructure, a
credential-bearing relay, and an availability dependency for every user).

**Path 2 — GitHub REST API (Git Data + Contents endpoints), CORS-enabled.**
No infrastructure at all: the browser talks to `api.github.com` with the
user's PAT (the PWA already does exactly this for GitHub *import*). Commits
are created via blob/tree/commit/ref endpoints, pulls via
compare/contents. Lost semantics: no local git history (history lives on
GitHub only), no offline commits (operations need network), no non-GitHub
remotes, no branch juggling beyond what the UI exposes. For the actual use
case — write-book-template chapter backup/sync of an author's manuscript to
their own GitHub repo — none of these losses matter: the feature's existing
UI is "commit + push" / "pull changed chapters", not a git client.

**Recommendation: Path 2.** Library-First prefers the path that adds no
infrastructure Aster has to operate; the sync semantics the feature actually
uses survive intact. Path 1 remains documented as the upgrade path if
non-GitHub remotes or offline-commit queues ever become requirements.

## Class F — reuse from adaptive-learner

Source design: `docs/explorations/exploration-bibliogon-mobile-selective-sync.md`
(2026-06-04 decision block) + adaptive-learner Phase 13.

- **Already lifted:** the entire storage-seam shape (`getStorage()`,
  `IStorageService`, `ApiStorage`/`DexieStorage`) was inherited from
  adaptive-learner in Phase 2 — the pattern transfer works.
- **Liftable modules:** QR pairing flow (Bibliogon already ships `segno` QR +
  PIN gate server-side and `qrcode.react` client-side), the Local-Sync
  engine (scope-selection, offline write queue replay — Bibliogon has
  `storage/sync-engine.ts` for its own queue already), and the
  AI-Assisted-Merge conflict UI.
- **What must change:** the domain list (books/chapters/pages/articles vs
  adaptive-learner's lessons), selective scope (per-book selection is a
  Bibliogon decision the AL code does not have), and the topology: the
  2026-06-04 decision made the desktop backend authoritative — under the new
  strategic decision the sync peer can no longer be assumed to be a desktop
  install, so the pairing/merge modules must be peer-agnostic (PWA↔PWA via
  a sync channel, or PWA↔self-hosted backend for power users).
- **Library vs copy:** two consumers (adaptive-learner + bibliogon) is
  exactly the stated threshold — **extract the sync/pairing core into the
  `@astrapi69` scope** (e.g. `@astrapi69/local-sync`) rather than copying;
  both apps then consume the library with their own domain adapters.

## Cross-cutting findings (folded into port-issue acceptance criteria)

1. **`FEATURES.BOOK_TEMPLATES` is a dead registry entry** — declared in
   DESKTOP_ONLY, consumed nowhere. Meanwhile "Als Vorlage speichern"
   (`SaveAsTemplateModal.tsx:137` → `api.templates.create`) is live and
   un-gated offline. Fixed by port issue #3's scope.
2. **The audiobook export format is hidden, not disabled-with-reason**
   (`ExportForm.tsx:104` filters it out) — the only policy-#78 violation in
   the DESKTOP_ONLY set. Fixed by port issue #22.
3. **The KDP wizard is entirely un-gated** — reachable offline, five
   server-bound endpoints fail with transport errors or silent no-ops
   (pricing PATCH is fail-open). Fixed by port issues #10–#13.
4. **`settingsSeamGuard.test.ts` covers only `api.settings`** (~3% of the
   problem). Every port issue extends the guard to its namespace; the epic
   tracks widening it to the full forbidden set, including the
   dynamic-namespace pattern (`AITemplatePanel.tsx:67`) a naive regex misses.
5. **Hardcoded `ui.feature.requires_desktop_app` fallbacks** at 11+ call
   sites and a hand-built reason map in `buildBookEditorMenu.tsx:99-107`
   (where `git-backup` piggybacks on the `git-sync` verdict). Each port
   issue deletes its sites; the menu map dissolves with issue #28.
6. **`modules/module-kinderbuch/index.ts` doc-comment is stale** (claims the
   picture-book PDF goes through the backend; `export/picturebook/` exists).
7. **Chapter templates have no feature id at all** — un-gated backend calls
   from the editor menu. Fixed by port issue #4.

## Priority-ordered port queue

Order: authors' daily use → publishing pipeline → sync. Every entry is a
GitHub issue referencing epic #727.

**Tier 1 — daily authoring (do first)**
1. #728 Version history / snapshots (A, 2) — data safety, used every writing day.
2. #729 Comments panel via existing seam (A, 0.5) — cheapest real gap.
3. #730 Save-as-template + user templates (A, 1.5).
4. #731 Chapter templates (A, 1.5).
5. #732 Story-Bible auto-detect + continuity (A, 1).
6. #733 ms-tools sanitizer + style parity + CSV (A, 2).
7. #734 DOCX + EPUB import (A, 2).
8. #735 Scrivener import (A, 1.5).
9. #736 write-book-template ZIP import (A, 1.5).

**Tier 2 — publishing pipeline**
10. #737 KDP publishing state + ARC (A, 1).
11. #738 KDP metadata checker + categories (A, 1).
12. #739 KDP cover validation (B, 1).
13. #740 `.bgp` project export (A, 2).
14. #741 KDP package export (A, 2 — after #739/#740).
15. #742 Comic-book PDF (A, 2.5).
16. #743 Bulk export (A, 1.5).
17. #744 Writing-history CSV (B, 0.5).
18. #745 `.biblio.yaml` file IO (A, 1.5).
19. #746 Translation links (A, 1).
20. #747 Publications mutations (A, 1).
21. #748 Backup history + compare (A, 2).
22. #749 Audiobook via cloud TTS (C, 3).
23. #750 LanguageTool browser-direct (C, 1.5).
24. #751 DeepL verify / AI whole-doc translation (C, 2).
25. #752 Medium image mirroring (C, 1).
26. #753 Local WASM TTS (D, 3).
27. #754 Print-grade PDF via Typst (D, 3).

**Tier 3 — sync**
28. #755 Git sync via GitHub REST (E, 4).
29. #756 Multi-device sync, `@astrapi69/local-sync` extraction (F, 5+).

## Acceptance criteria (every port issue)

- Works in Dexie mode on GH Pages, zero `/api` calls; `settingsSeamGuard`
  extended to the issue's api namespace.
- Feature state moves disabled+Reason → active; the reason usage is removed
  at the ported sites; if a reason key loses its last consumer it is deleted
  from all 8 catalogs AND the seed-i18n mirrors (#699 drift check green,
  `i18n-removal.md` four-grep checklist).
- Minimum 4 tests: happy path, edge case, boundary, and a regression pin
  that the desktop (api-mode) path is unchanged.
- Feature screenshot in the PR; all 6 theme variants checked.
- TS-Engine mirror is library-grade: no app imports, own types, TSDoc,
  under the file-size gate.

## Questions and assumptions

- **Proxy-denied CORS targets** (ElevenLabs, DeepL, LanguageTool, Edge TTS,
  Medium CDN): recorded as unverifiable-here with the exact gateway
  response; each affected issue front-loads a real-origin preflight instead
  of guessing. Conservative assumption: none is assumed reachable.
- **`lan-mode` reading:** the LAN feature's user value is "use my book data
  from my phone". In a PWA-first world the equivalent deliverable is
  multi-device sync (queue #29), not a browser re-implementation of an HTTP
  server; the `lan-mode` registry id is retired by that issue. If Aster
  wants the literal LAN-serving behaviour kept, it remains available in the
  self-host path unchanged.
- **`pandoc-export` reading:** with client PDF/EPUB/DOCX shipped, the
  remaining desktop-only value is print-grade typography. Typst (WASM) is
  proposed as the browser equivalent rather than attempting LaTeX-in-browser.
- **Grammar/translation duplication:** AI-grammar/AI-translate (key-gated)
  already cover the everyday need offline; issues #23/#24 exist because the
  strategic decision demands parity for the LanguageTool/DeepL surfaces
  specifically. If preflights fail AND product review deems the AI path
  sufficient, those two can be re-classed to X with the recorded evidence.
- **Issue-size unit:** one "agent session" ≈ one focused implementation
  session with tests + docs. Multi-session issues note their split.
