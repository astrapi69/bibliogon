# Bibliogon

Open-source book authoring platform. Built on PluginForge (PyPI), a reusable plugin framework based on pluggy. Offline-capable, i18n-ready, local-first. All plugins are free during the current development phase (see docs/explorations/monetization.md for future strategy).

- **Repository:** https://github.com/astrapi69/bibliogon
- **Version:** 0.49.0 (The **editor v3 + offline depth + quality-infra** release, 38 commits since v0.48.0. The TipTap editor moves to **v3** (prosemirror-search adapter) with **node-based math** (KaTeX, inline ``$...$`` + block ``$$...$$``, input/paste rules, Formel toolbar button); **LaTeX (.tex)** joins the client-side export formats. More surfaces go fully offline: **Writing History** is aggregated client-side from the ``writingSessions`` Dexie table (summary/streaks/per-book/per-chapter), **book trash** soft-deletes + restores through the ``IStorageService`` seam, and the **Danger-Zone reset** (Dexie wipe+reseed) + **author profiles** work backendless. The **BookEditor sidebar** tools fold into a viewport-responsive **Werkzeuge** group (Radix Collapsible). **Authors-DB:** ``is_profile_author`` flag + Profile->DB sync + Profile badge. **Comics:** per-panel image upload. **Quality infra:** coverage baseline (backend 89.6% / frontend 72.3%) + ``coverage-backend``/``coverage-frontend`` targets, dependency security scanning (``npm audit`` + ``pip-audit``) in CI + ``make audit*``, **ESLint flat config + Prettier**. **Fixes:** autosave 409 self-conflict (authoritative version ref), chapter-click switches editor content, draft recovery on the v3 instance, icon-only-button aria-labels (axe button-name), consistent bulk-action-bar button classes. No schema migrations; existing data + ``.bgb``/``.bgp`` unaffected.)

Previous release — **v0.48.0** (The **Maximal Offline** release - the largest in the project's history, 111 commits since v0.47.0. The static GitHub Pages PWA now reaches **full desktop feature parity**: Story Bible, Storyboard, picture-book + comic editors, authors, chapter-labels, publications + article-platforms all read/write through the ``IStorageService`` seam (extended to every data entity) against a **seeded IndexedDB**, so they work entirely offline. **Client-side export engine** (6 formats - MD/HTML/Text/PDF/EPUB/DOCX, no Pandoc) with an **export-engine chooser** (Settings > Export: auto/client/backend). **AI offline** - ``AiGenerateButton`` + full ``.biblio.yaml`` template-fill run browser-direct against the user's own provider key. **Client-side Medium import** (DOMParser + fflate). A single ``guardedFetch()`` choke point keeps the backendless build at **zero ``/api``** (E2E hard gate); only four genuinely browser-impossible features stay backend-gated (Pandoc/LaTeX export, Git sync, audiobook TTS, LAN). **Seed pipeline:** ``make generate-seed-data`` emits 12 committed JSON files; ``DexieStorage.ensureSeeded()`` populates reference tables on first init. **Settings > About** (version / build hash / date); **SW auto-update** (focus/visibility/hourly); **GH Pages deploy infra** (split app/docs + ``404.html`` SPA redirect); **``@astrapi69/entity-kit`` PoC** (book TrashView); **responsive mobile** (collapsible sidebars, 44px touch targets); **repository-pattern migration** (11 routers/entities). **Fixes:** DexieStorage lazy-load race, settings-form clobber, view-mode/add-page/article-grid-to-list load races, convert-to-book wizard listbox race, seed privacy, offline-guard toast suppression. **Rules:** DEXIE-MODE-REGEL -> Maximal Offline; CSS-first -> Tailwind-first; no inline comments. No schema migrations; existing data + ``.bgb``/``.bgp`` unaffected. Vitest 2876 + backend pytest + tsc + ruff + mypy + pre-commit + verify-docs-discipline + verify-plugin-locks + launcher build all green.)

Previous release — **v0.47.1** (Patch over v0.47.0: fixes the offline-PWA first-render DexieStorage lazy-loading race that left the Settings book/content-type dropdowns (and registries) empty in Dexie mode - DexieStorage is now preloaded before the first render when an explicit dexie mode is set, and the `verifyBackendVersion()` `/api/health` probe is skipped on the backendless build (#32). Desktop/Docker unaffected. v0.47.0 was the full offline-PWA release. The static GitHub Pages build (``astrapi69.github.io/bibliogon/``) boots with **no backend**, loads default settings / 8 i18n catalogs / book+content type registries / plugin list from a **seeded IndexedDB**, supports full prose-book + article authoring offline, and fires **zero ``/api`` network requests**. **Seed pipeline:** ``make generate-seed-data`` (``scripts/generate-seed-data.py``) reads the backend YAML SSoT and emits committed JSON under ``frontend/src/storage/seed/`` whose shapes mirror the ``/api`` responses; ``DexieStorage`` populates its reference tables on first init via an idempotent ``ensureSeeded()``. **``IStorageService`` seam extended** to settings / i18n / bookTypes / contentTypes / writingSessions (on top of books/chapters/articles), with ``ApiStorage`` (online) + ``DexieStorage`` (offline) backends chosen via ``getStorage()``. **``/api`` tail closed:** a single ``guardedFetch()`` egress in ``client.ts`` (covering ``request()`` + raw upload/blob/export + the import wizard) rejects before any fetch on the backendless build, so the offline build never fires ``/api`` regardless of which ``api.*`` method is called; backend-only surfaces (export, Git, Medium import, LAN, audiobook, story bible, picture-book/comic editors, danger-zone backup, AI) are gated offline with a translated "requires the desktop app" hint via ``useOfflineFeatureGate()``; an offline E2E installs a global ``route.abort('**/api/**')`` hard regression gate. **GH Pages deploy split:** app on ``/bibliogon/``, docs on ``/bibliogondocs/``, with a ``404.html`` SPA redirect; both workflows auto-trigger on push to main. **Fixes:** menu single-line header now switches on a fixed ``--breakpoint-menu`` (1200px) viewport breakpoint instead of toggling on language/default-type change; ``behavior.skip_non_destructive_confirmations`` now persists (the settings update schema gained a ``behavior`` field). **Docs discipline:** new ``.claude/rules/code-hygiene.md`` rule — no inline comments, explanations live in docstrings/TSDoc. No schema migrations; existing data + ``.bgb``/``.bgp`` unaffected. Backend pytest 2572 + Vitest 2715 + tsc + verify-theme + verify-docs-discipline + verify-plugin-locks + launcher build all green.)

Previous release — **v0.46.0** (Dialog → Pages + Tailwind foundation + LAN Mode + offline/local-first sync; 64 commits since v0.45.0. **Dialog → Pages migration:** 8 large dialogs became deep-linkable full-page routes through a shared ``PageLayout`` (app-chrome header + centered content + working browser Back, mobile-friendly): CreateBookModal→``/books/new?type=``, article create→``/articles/new?type=``, ExportDialog→``/books/:bookId/export``, WritingHistoryModal→``/writing-history`` (global), ChapterVersionsModal→``/books/:bookId/chapters/:chapterId/snapshots``, GitBackup/GitSync→``/books/:bookId/git-backup``+``/git-sync`` (per-book), ShortcutCheatsheet→``/help/shortcuts``. Per page: body extracted to a callback ``…View``/``…Form`` (preserving the dialog's tests) or in-place chrome→PageLayout, the trigger navigates, the old dialog is deleted, lazy route + deep-link/back/mobile E2E. **Editor ``?chapter=`` URL-state** — the active chapter moved from component state into the URL (deep-linkable chapters; a snapshot restore returns to the editor with the right chapter selected). **Foundation:** Tailwind v4 + shadcn/ui (token-mapped ``@theme`` bridge, Preflight omitted; theme tokens stay the SSoT for colour) + a shadcn Dialog primitive backing ``AppDialog`` and the confirmation dialogs (Phase A + B). **Perf:** recharts is lazy-loaded with the writing-history page (~330 kB out of the eager dashboard bundle). **Stays a dialog by design** (see ``docs/architecture/dialog-to-pages-routes.md`` for the route map + full classification): confirmations, transient-state wizards (Import/ConvertToBook/AiSetup), auto-trigger onboarding (Donation), detail-modals-without-a-single-fetch-endpoint (CommentPreview), and 5 small context-bound dialogs. **LAN Mode** (opt-in ``BIBLIOGON_LAN_MODE``): single-port FastAPI-served frontend + API for same-network phone/tablet access — startup QR banner (``segno``, auto-detected IP), PIN gate (session cookie + lockout), Settings>About card (URL/PIN/QR), ``make dev-lan``/``build-frontend``. **Offline / local-first sync (Phase 2+3):** ``IStorageService`` seam with ``ApiStorage`` (online) / ``DexieStorage`` (IndexedDB, offline) chosen by a connectivity monitor; "Take offline" selective per-book download (``GET /api/books/{id}/full``); offline write queue replayed by a background sync engine on reconnect with conflict detection+resolution + status toasts; opt-in + dynamically imported so the desktop bundle is unaffected. **Configurable default book/content-type** (Settings>Verhalten) read by the dashboards + create-pages; the SplitButton primary label reflects the default via the registry ``default_title_key``. **9th content type** "article" (generic, no per-type metadata). **Blogpost dropdown fix** (+ stale PWA Service Worker disabled in dev/self-deregisters). No schema migrations; existing data + ``.bgb``/``.bgp`` unaffected. Backend pytest + Vitest + tsc + verify-theme + verify-docs-discipline + verify-plugin-locks + launcher build all green.)

Previous release — **v0.45.0** (The QA-hardening + native-i18n release; 23 commits since v0.44.0. An adversarial security + data-integrity QA pass closed all open v0.44.0 findings: (C1) upload-filename path traversal (CWE-22) fixed at all 3 upload sites via a shared ``safe_upload_filename`` helper; (H2) ``.bgb`` backup completeness overhaul — introspection-driven ``serialize_row``/``restore_row`` now covers all 23 content models, manifest v3.0 (back-compat with v1/v2), full create→export→wipe→import round-trip test; (M1) remaining raw ``extractall`` calls routed through ``safe_extractall``; (M2) server-side comic cross-page panel-capacity gate; (M3) @-mentions degrade to plain text on entity delete; (M4) ``Dialog.Description`` on all 16 Radix ``Dialog.Content`` surfaces; (M5) writing-goal daily count floored to ``max(0, delta)``; (L1) one-time Danger-Zone reset token (consume-on-verify nonce store); (L2) comic bubble anchor ``[0,100]`` validation; (L3) continuity-checker N+1 killed via ``joinedload``; (L4) ``StoryEntityPageLink`` page/chapter XOR DB CheckConstraint; (L5) title length cap + control-char validators on Book/Article; (L6) KDP routes ``raise ... from e``. **A11y:** aria-labels on every icon-only button (Dashboard/BookCard/AudiobookPlayer/BookEditor), 0 axe-core critical/serious on Dashboard load. **I18N:** full native-quality translation sweep of the 6 auto-translated catalogs (es/fr/el/pt/tr/ja) — every previously-passthru UI string (~920-1000/catalog, accumulated across v0.32-v0.44) localized natively, loanwords/format-names/brand-names kept verbatim, stale ``_meta`` markers removed; parity 51/51 across all 8 catalogs. No schema migrations; existing data + ``.bgb``/``.bgp`` unaffected. Backend pytest 2502 → 2534; Vitest 2620 → 2630; tsc + ruff + mypy + pre-commit + verify-theme + verify-docs + verify-plugin-locks + launcher build all green.)

Previous release — **v0.44.0** (The Scrivener-parity + visual-planning release; 43 commits since v0.43.0. (0) **Editor context menu** — right-click menu on every TipTap surface (chapter / page text / Story Bible description): clipboard, selection formatting (bold/italic/underline + heading + list submenus + blockquote), insert (@-mention + HR), Story-Bible search, take-snapshot, word-count; behaviour in a pure `editorContextMenuActions` module. **Scrivener ergonomics cluster:** (1) **Composition mode** — distraction-free writing (Ctrl+Shift+D / Esc): hides app chrome via a root class, paper backdrop, paragraph dimming, typewriter scrolling. (2) **Chapter status + labels** — per-chapter workflow status + a user-definable colour-coded label set per book (new ``chapter_labels`` table + ``Chapter.status`` / ``label_id``); chips on Storyboard + Outliner. (3) **Writing goals + streak** — per-book ``word_target`` + deadline with auto daily target, per-chapter ``target_words`` (DB), Dashboard daily-goal widget + streak. (4) **Chapter Outliner** — sortable inline-editable spreadsheet of chapters (``?view=outline``). **Scrivener drafting cluster:** (5) **Chapter snapshots** — named manual snapshots layered on ``chapter_versions`` (``name`` / ``is_manual``, retention-exempt) + line-diff vs current + restore. (6) **Writing history** — per-day bar chart (recharts), summary stats + streaks, per-book/per-chapter breakdown, CSV export; ``WritingSession`` now per book+chapter. (7) **DOCX/EPUB import** — help page for the existing CIO-04 Pandoc import. **Standout feature:** (8) **Story Bible relationship graph** (``?view=relationships``, ``@xyflow/react``) — typed entity nodes + colour-coded relationship edges, drag-to-create + click-to-delete relationships, node detail panel + open-in-editor/show-appearances + double-click nav, per-book layout persistence (``Book.graph_layout``), reset-layout, PNG export (``html-to-image``). **Quality:** (9) P0 **alembic upgrade-chain fix** — ``alembic upgrade head`` crashed on a clean DB at the chapter-labels batch FK-add recreate; fixed (plain ADD COLUMN) + a regression gate runs the real upgrade chain. New deps: recharts, @xyflow/react v12, html-to-image (all MIT, 0 high/critical). Migrations: chapter_labels + Chapter.status/label_id; writing goals + writing_sessions (then per-book/chapter); chapter_versions name/is_manual; Book.graph_layout. Backend pytest 2468 → 2502; Vitest 2568 → 2620; tsc + ruff + mypy + pre-commit + verify-theme + verify-docs + verify-plugin-locks + alembic-chain gate + launcher build all green.)

Previous release — **v0.43.0** (The Story Bible integration depth release; 10 commits since v0.42.0. (1) **Prose Storyboard (STORY-BIBLE-STORYBOARD-INTEGRATION-01 C3)** — the chapter-card Storyboard for prose books: a drag-reorderable grid of chapter cards, each with word count + the same 4 inline annotations (notes/story_beat/mood_color/act_group, now also columns on ``Chapter``) as a page card; the 4 annotation editors extracted to a shared ``StoryboardAnnotations`` module reused by both the page + prose surfaces (RCU); Storyboard button now on every book type. (2) **Entity relationships (C10)** — new ``StoryEntity.relationships`` JSON field (ally/rival/family/mentor/romantic/neutral) edited in a "Relationships" section of ``StoryEntityEditor``; **Arc View** gains a toggle that draws colour-coded bezier lines between two entities' lanes wherever they share a page; resolve endpoint ``GET .../entities/{id}/relationships``. (3) **@-mention (C13)** — ``@tiptap/extension-mention`` (pinned 2.27.2) autocomplete of the book's entities (grouped by type) in the chapter editor + picture-book page text; inserts a colour-coded inline mention badge; click opens the entity in the sidebar; entity-list endpoint gains ``?search=``. (4) **Auto-detect (C14)** — ``POST .../books/{id}/auto-detect`` scans chapter/page text for entity names (exact, case-insensitive, word-boundary; short names skipped; already-linked excluded) and proposes links; "Link automatically" creates them. (5) i18n across 8 catalogs. Migrations: ``chapters`` storyboard columns; ``story_entities.relationships``. Backend pytest 2442 → 2468; Vitest 2549 → 2568; tsc + ruff + verify-theme + verify-components + i18n parity green. Deferred: component-consistency tail (badges/Toggle/raw-Radix→AppDialog — advisory) + comprehensive help-docs/screenshots.)

Previous release — **v0.42.0** (The Story Bible release — Bibliogon's standout feature; 75 commits since v0.41.0. (1) **STORY-BIBLE-PLUGIN-01** — new core ``plugin-story-bible``: a per-book database of fiction entities with a ``StoryEntity`` model + ``entity_type`` discriminator (character/setting/plot_point/item/lore), per-type metadata + TipTap rich-text descriptions; entity-type defs are the SSoT in ``backend/config/story-bible-entities.yaml``. Ships a colored ``StoryBibleSidebar`` (per-type icons + inline create/delete), a ``StoryEntityEditor`` detail view, and ``/api/story-bible/...`` CRUD. (2) **STORY-BIBLE-STORYBOARD-INTEGRATION-01** — ``StoryEntityPageLink`` join table + drag-entity-onto-StoryboardCard linking; type-colored entity badges on cards; appearance tracker (page list + role + notes); entity filter on the Storyboard; **Arc View** SVG swim-lane timeline (per-entity lanes, mood-colored role-sized dots, continuity polylines, click-to-navigate); **Continuity Checker** (advisory dismissable warnings: entity disappears / gap / empty page); Story Bible → Markdown export; Storyboard extended to ``comic_book`` (was picture_book only). (3) **Content-type neutrality** — user-facing "Artikel/Article" → "Text"; per-type default titles across the 8-type content model. (4) **Component-consistency + a11y sweep (37+ commits)** — global ``.btn``/``.card``/``.badge``/``.slider`` systems, ``RadixSelect`` promoted canonical (all native selects migrated), global checkbox accent-color, new CSS-first coding-standards rule + advisory ``make verify-components`` lint, vitest-axe assertions across editor surfaces. (5) **Picture-book + comic depth** — 8 new layouts (split/two-image/border + free-positioning collage via the 4-surface ``useDragPosition`` RCU + ``CollageCanvas``); comic panel-count limit + overflow handler + same-page drag-reorder + cross-page move; bubble PDF-position + default-color fixes. (6) **Safety** — Zip Slip (CWE-22) guard via ``safe_extractall()`` on all 5 archive sites; app-wide React error boundaries. Migration: ``story_entities`` + ``story_entity_page_links`` tables. Backend pytest 2399 → 2442 (+43, 1 skipped); Vitest 2487 → 2549 (+62); i18n parity green; tsc + ruff + mypy + pre-commit + verify-theme (96 WCAG contrast) + verify-docs-discipline + verify-docs-completeness + verify-plugin-locks + launcher PyInstaller build smoke all green.)

Previous release — **v0.41.0** (UX/UI theme + accessibility hardening + per-content-type field visibility; 24 commits since v0.40.0. (1) **Theme/a11y hardening** — full audit of all 12 theme variants (6 palettes × light/dark), correcting the long-standing "5 palettes / 10 variants" miscount (Warm Literary, the default, was never counted). Fixed 18 undefined CSS tokens used bare (``var(--token)`` refs the old hex-fallback-only completeness hook missed), 31 hardcoded status colors → semantic ``var(--success/--danger/--accent/--warning)``, dark-mode contrast (``--text-muted`` across dark palettes, nord ``--danger``, the EditableTitle published-work warning button → ``--text-inverse``), the Article-Dashboard single-line header (Backup folded into the Import chevron; Playwright pin), comic bubble + tail keyboard operation (Enter/Space/Arrows + 6 Vitest pins), themed comic editor chrome (panels/grid/handles), storyboard mood-dot ring + collage handle. New ``make verify-theme`` gate (undefined-token detection + 96 WCAG contrast checks across 12 variants + hardcoded-hex lint) wired into ``make release-test``; new ``docs/development/theming.md`` dev guide. (2) **ARTICLE-TYPES-FIELD-VISIBILITY-01** — per-type ``core_fields`` list in the ``content-types.yaml`` SSoT gates which optional ArticleEditor fields (Tags/Excerpt/SEO/Canonical URL/Featured image) each of the 8 types shows; identity fields always shown; field-validator rejects unknown keys. (3) **Docs** — 35 help screenshots regenerated, content-types help page expanded (comparison table + field-visibility matrix + 8 per-type sections, DE+EN), 6/12 palette correction across README/README-de/CLAUDE.md/architecture rule, new ``verify_docs_completeness.py`` release gate. Plus a dependency sweep (within-range bumps; Starlette-v1 blocker resolved). Backend pytest 2394 → 2399; Vitest 2477 → 2487; theme tokens + 96 contrast checks + hardcoded-hex lint + tsc + ruff + mypy + pre-commit + verify-docs-discipline + verify-docs-completeness + verify-plugin-locks + launcher PyInstaller build smoke all green.)

Previous release — **v0.40.0** (Comic-book + picture-book authoring depth + articles content-model expansion; ~100 commits since v0.39.0 across five coordinated streams. (1) **CONTENT-TYPES-SSOT-01** — ``Article.content_type`` repurposed as an 8-type discriminator (blogpost default + tutorial/review/essay/newsletter/interview/listicle/short_story) with per-type ``article_metadata`` JSON, a ``content-types.yaml`` registry, ``GET /api/content-types``, and an AD ``SplitButton`` (RCU 2-surface with the Book Dashboard). (2) **PUBLICATION-STATUS-BOOK-PARITY-01** — ``Book.status`` column + shared ``PublicationStatus`` enum (draft/ready/published/archived) + status badge on BookCard/BookListView. (3) **Title Editing** — shared ``EditableTitle`` (pencil-toggle inline edit) on all four editors with a published-work warning gate. (4) **Comic-book depth** — single-SVG-path bubble+tail overhaul (6 types + pointer-drag), 7-template multi-panel grids + overflow handler, and **COMIC-PANEL-CROSS-PAGE-MOVE-01** (same-page dnd-kit panel reorder via a new bulk ``.../panels/reorder`` endpoint + a cross-page capacity-gated "Move to page" menu). (5) **Picture-book layout expansion (Phases 1-3)** — split/multi-image/collage layouts with drag-positioned regions (``useDragPosition``) + a collage PDF walker. Plus a Settings-Completeness batch (backup-history delete, white-label gating, per-field search-clear RCU, locale-aware dates, persisted PDF/wizard defaults, confirmation-skip mode) + a shared ``FullscreenButton``. Migrations: ``Article.content_type`` backfill "article"→"blogpost" + ``article_metadata`` column; ``Book.status`` backfill "draft". Backend pytest 2294 → 2394 (+100, 1 skipped); Vitest 2190 → 2477 (+287); i18n parity green; tsc + ruff + mypy + pre-commit + verify-docs-discipline + verify-plugin-locks + launcher PyInstaller build smoke all green.)

Previous release — **v0.39.0** (Picture-Book authoring depth release; 49 commits since v0.38.0 across two coordinated multi-session arcs (Storyboard View + Picture-Book Text-Stack) plus one closure-by-discovery (Settings-Allgemein already-shipped under SETT-PHASE-2 in v0.38.0) and the LAYOUT-SWITCH-TEXT-CONVERSION data-hygiene win. (1) **PICTURE-BOOK-STORYBOARD-VIEW-01** — 16 commits across 2 sessions; drag-reorder grid for picture-book pages with per-page annotations (inline notes, 6-value story-beat tag, 10-preset mood-color palette, free-text act-group label). New ``?view=storyboard`` mount + Storyboard button in the picture-book editor. 4 new nullable columns on Page (notes/story_beat/mood_color/act_group). (2) **PICTURE-BOOK-TEXT-STACK** — 18 commits across 2 sessions; Fix B per-layout namespace for ``Page.layout_config`` (supersedes Fix A purge-on-switch) + Tier 1+2 sections (8 Visual-Style + 6 Typography fields × 3 image layouts) + overlay-specific width/height sliders + shared ``computeTierTextStyles`` helper (TS + Python mirror). Closes PICTURE-BOOK-PAGE-TEXT-TIPTAP-INTEGRATION-01 + PICTURE-BOOK-OVERLAY-TEXT-TIER-PROPERTIES-01 + PICTURE-BOOK-TEXT-CONFIGURATION-01. (3) **PICTURE-BOOK-LAYOUT-SWITCH-TEXT-CONVERSION-01** — single-commit data-hygiene win; PATCH carries extracted plain text on TipTap → Tier-Property layout-switch. (4) Comprehensive doc-sweep — README + README-de feature expansion (8 new bullets + 3 new top-level sections + plugin-table gap fix), CONTRIBUTING.md PluginForge bump, CLAUDE.md data-model expansion, help-doc cross-link layer across 5 page pairs. (5) HELP-DOCS-V0.37.0-GAPS-01 closeout — 6 new help-doc topic pairs (DE + EN = 12 Markdown pages), 5 Playwright-generated screenshots, new manual-only screenshots project. (6) Backlog hygiene — 2 P3 closures (1 retroactive), 3 P5-tier-misplaced items moved to P5 section, 1 CI red-fix. Backend pytest 2269 → 2294 (+25, 1 skipped); Vitest 2080 → 2190 (+110); i18n parity 75/75; tsc + ruff + mypy + pre-commit + verify-docs-discipline + verify-plugin-locks + launcher PyInstaller build smoke all green; npm audit 0 high/critical (2 moderate pre-existing).)

- **Concept:** docs/CONCEPT.md
- **API reference:** FastAPI OpenAPI under `/docs` and `/openapi.json` (source of truth). docs/API.md is a high-level overview.
- **History:** docs/CHANGELOG.md (completed phases), docs/ROADMAP.md (open items)

## Development guidelines

Detailed rules live in `.claude/rules/`. Claude Code reads them on demand.

**Always relevant** (read on every feature/fix):
- `architecture.md` - layered architecture, plugin structure, UI strategy, data flow
- `coding-standards.md` - naming, function design, tests, dependencies

**On demand** (read for specific tasks):
- `code-hygiene.md` - linting, pre-commit, error handling architecture, API conventions
- `lessons-learned.md` - known pitfalls (TipTap, import, export, deployment)
- `quality-checks.md` - test strategy, mutmut/Stryker, pre-commit checklists
- `ai-workflow.md` - order for features/plugins, prohibitions, docs protocol
- `release-workflow.md` - release process (triggered by "release new version")

On a conflict between CLAUDE.md and the rules, the rules win.

## Tech stack

- **Backend:** Python 3.11+, FastAPI, SQLAlchemy 2.0, SQLite, Pydantic v2, Poetry
- **Frontend:** React 18, TypeScript (strict), TipTap (15+1 extensions), Vite, Radix UI, Tailwind v4 (token-mapped, Preflight-omitted) + shadcn/ui, @dnd-kit, Lucide, react-toastify
- **Plugins:** pluginforge ^0.10.0 (PyPI), entry points, YAML config
- **Export:** manuscripta ^0.9.0 (PyPI), Pandoc, write-book-template structure. All TTS engines delegate to the manuscripta adapter.
- **Testing:** pytest, Vitest, Playwright, mutmut, Stryker
- **Tooling:** Poetry, npm, Docker, Make, ruff, ESLint, Prettier, pre-commit

## Architecture (short)

4 layers: Frontend -> Backend -> PluginForge -> Plugins. Details in `.claude/rules/architecture.md`.

Lean core (UI, editor, CRUD, backup). Everything else via plugins. All plugins are currently free (`license_tier = "core"`). License infrastructure exists but is dormant (`LICENSING_ENABLED = False` in `backend/app/licensing.py`).

## Commands

```bash
make install              # Poetry + npm + plugins
make dev                  # backend (8000) + frontend (5173) in parallel
make dev-bg / dev-down    # background mode
make test                 # all tests (backend + plugins + frontend), no coverage
make test-coverage        # opt-in coverage run (heavy; CI runs this on every push)
make test-backend         # backend only
make test-plugins         # all plugin tests
make test-frontend        # Vitest
make verify-theme         # theme gates: token completeness/undefined-refs + WCAG contrast (12 variants) + no hardcoded hex
make verify-components    # advisory (non-blocking): CSS-module classes re-declaring a shared control surface (CSS-first rule)
make verify-docs-discipline    # mkdocs nav sync (_meta.yaml) + orphan-page detection (mandatory pre-tag)
make verify-docs-completeness  # version headers + help i18n parity + image/xref integrity (FAIL blocks, WARN advisory)
make prod                 # Docker Compose (port 7880)
make prod-down            # stop Docker
make generate-trial-key   # 30-day trial key (dormant, licensing disabled)
make generate-seed-data   # regen offline-PWA seed JSON (frontend/src/storage/seed/) from backend YAML; re-run + commit after changing i18n catalogs, app.yaml defaults, or book/content-type registries
make clean                # remove build artifacts
make help                 # all targets
```

Plugin-specific: `make test-plugin-{export,grammar,kdp,kinderbuch,ms-tools,audiobook,translation}`

E2E tests: `npx playwright test --project=smoke` (fast, per feature) or `--project=full` (complete regression).

## Session start (Claude Code)

1. `git log --oneline -10` - recent changes
2. Read `docs/ROADMAP.md` - current state
3. `make test` - green baseline

## Data model (short)

- **Book:** id, title, subtitle, author, language, series, series_index, description, publishing (ISBN/ASIN/publisher/edition), marketing (keywords, html_description, backpage), design (cover_image, custom_css), book_type (from BookTypeRegistry YAML SSoT), status (shared `PublicationStatus` Literal: draft/ready/published/archived — same enum as Article.status via `_PUBLISHING_LIFECYCLE`)
- **Chapter:** id, book_id, title, content (TipTap JSON), position, chapter_type. Used by prose books (`content_model="chapters"`).
- **Page:** id, book_id, position, layout (13 picture-book layouts in 5 LayoutPicker categories — incl. split/two-image/`collage` + the original image/overlay/speech_bubble/text_only — plus `comic_panel_grid` for comics), text_content (string), image_asset_id, layout_config (per-layout namespaced JSON via Fix B; collage stores per-region drag geometry here), plus 4 Storyboard columns (notes, story_beat, mood_color, act_group). Used by picture-books + comic-books (`content_model="pages"`).
- **ComicPanel / ComicBubble:** plugin-comics tables for comic_book pages (panel grid templates + multi-bubble per-panel speech bubbles).
- **StoryEntity:** id, book_id, entity_type (discriminator from StoryEntityRegistry YAML SSoT — character/setting/plot_point/item/lore), name, description (TipTap JSON), entity_metadata (per-type extra fields JSON), position. Per-book fiction-entity database (plugin-story-bible).
- **StoryEntityPageLink:** join table linking a StoryEntity to a Page or Chapter (exactly one of page_id/chapter_id; role + notes), powering Storyboard entity badges, the appearance tracker, Arc View, and the continuity checker.
- **Asset:** id, book_id, filename, asset_type (cover/figure/diagram/table), path
- **BookTemplate / BookTemplateChapter:** reusable book structures; 5 builtins seeded at startup. `/api/templates/`, `POST /api/books/from-template`.
- **ChapterTemplate:** reusable single-chapter structures with TipTap JSON content; 4 builtins (Interview, FAQ, Recipe, Photo Report). `/api/chapter-templates/`.
- **BookPublishingState:** server-side persistence for the KDP Publishing Wizard (pricing + ARC choices + last visited step).
- **Article:** id, title, subtitle, author, language, content_type (content-type discriminator from ContentTypeRegistry YAML SSoT — 8 types: blogpost/tutorial/review/essay/newsletter/interview/listicle/short_story), article_metadata (per-type extra fields JSON), content_json, status, SEO fields, topic, tags, series, plus AI + publication relations.

**ChapterType (31):** chapter, preface, foreword, acknowledgments, about_author, appendix, bibliography, glossary, epilogue, imprint, next_in_series, part, part_intro, interlude, toc, dedication, prologue, introduction, afterword, final_thoughts, index, epigraph, endnotes, also_by_author, excerpt, call_to_action, half_title, title_page, copyright, section, conclusion. Marketing types (also_by_author, excerpt, call_to_action) are in the audiobook-export skip list by default. Per-book override via Book.audiobook_skip_chapter_types.

## Plugins

| Plugin             | Tier    | Depends on | Description                                                     |
| ------------------ | ------- | ---------- | --------------------------------------------------------------- |
| plugin-export      | core    | -          | EPUB, PDF, write-book-template ZIP, async jobs with SSE         |
| plugin-help        | core    | -          | In-app help, shortcuts, FAQ                                     |
| plugin-getstarted  | core    | -          | Onboarding, example book                                        |
| plugin-ms-tools    | core    | -          | Style checks, sanitization, metrics, per-book thresholds        |
| plugin-audiobook   | core    | -          | TTS via manuscripta (Edge/Google/ElevenLabs/pyttsx3), per-book config. Documented reverse-coupling exception: plugin-export imports `bibliogon_audiobook.generator` to dispatch the `audiobook` format. The sync `export_execute` hookspec cannot carry the async + SSE-streaming shape; re-evaluate when a 2nd async-streaming export plugin proposes a separate hookspec. |
| plugin-translation | core    | -          | DeepL/LMStudio translation, custom settings panel               |
| plugin-grammar     | core    | -          | LanguageTool (self-hosted + premium auth support)               |
| plugin-kinderbuch  | core    | export     | One-image-per-page layout with 4 templates                      |
| plugin-kdp         | core    | export     | KDP metadata, cover validation, completeness check              |
| plugin-comics      | core    | export     | Multi-panel comic-book pages; imports `bibliogon_export.picture_book_pdf` + `picture_book_fonts` directly for PDF rendering (legitimate forward dep). Dispatches comic-book PDF generation via the `export_execute` hook (HOOKSPEC-EXPORT-EXECUTE-WIRE-01 γ, 2026-05-23). |
| plugin-git-sync    | core    | -          | Git-backed import + sync for write-book-template repositories   |
| plugin-medium-import | core  | -          | Medium HTML-export importer: Article + Publication + provenance |
| plugin-story-bible | core    | -          | Per-book fiction-entity database (StoryEntity: character/setting/plot_point/item/lore) + Storyboard integration (entity-page links, Arc View, continuity checker, Markdown export) |

Plugin versions are independent of the app version. A plugin is only bumped when the plugin itself changed, not on every app release.

## Directory structure (short)

```
bibliogon/
├── backend/app/           # FastAPI core (main, database, hookspecs, licensing, models, routers, services)
├── backend/config/        # app.yaml, plugins/, i18n/ (8 languages)
├── backend/tests/         # backend tests
├── plugins/               # plugin packages (bibliogon-plugin-{name})
│   └── installed/         # plugins installed dynamically via ZIP
├── frontend/src/
│   ├── api/client.ts      # typed API client
│   ├── components/        # Editor, Toolbar, ChapterSidebar, dialogs
│   ├── pages/             # Dashboard, BookEditor, Settings, Help, GetStarted
│   └── styles/global.css  # CSS variables, 6 palettes x light/dark (12 variants)
├── e2e/
│   ├── smoke/             # fast smoke tests (per feature)
│   └── full/              # full regression suite
├── docs/                  # CONCEPT.md, ROADMAP.md, CHANGELOG.md
└── Makefile, docker-compose.yml, docker-compose.prod.yml
```

## Core conventions

- TipTap JSON as the internal storage format (NOT HTML, NOT Markdown)
- i18n: 8 languages (DE, EN, ES, FR, EL, PT, TR, JA), all UI strings in config/i18n/{lang}.yaml
- Python: type hints, snake_case, Pydantic v2, SQLAlchemy 2.0 mapped columns
- TypeScript: strict mode, no `any`, Radix UI for primitives
- CSS: custom properties, dark mode via [data-theme="dark"]
- Plugins: standalone packages under plugins/, depends_on as a class attribute, all free (licensing dormant)
- Export: manuscripta (PyPI), plugin config in export.yaml is 1:1 the manuscripta format
- Commits: English, conventional (feat/fix/refactor/docs)
- E2E: data-testid selectors only, no brittle CSS or XPath. Claude Code writes specs, Aster runs them.
- Secrets NEVER in committed config files. Three-layer chain: project `backend/config/app.yaml` (defaults) < `~/.config/bibliogon/secrets.yaml` (user override, gitignored) < env-vars (`BIBLIOGON_AI_API_KEY`). Details in [docs/configuration.md](docs/configuration.md). When editing AI-assisted, do NOT set `ai.api_key` in `app.yaml` — leave it `""` and route the value via override or env-var.

## Tests

- `make test` must stay green after every change
- E2E tests under `e2e/`, not on the `make test` default path
- Current counts and coverage: see [docs/audits/current-coverage.md](docs/audits/current-coverage.md)

## Test isolation

Tests run in a temporary data directory, never against production
data. Two layers of protection in `backend/tests/conftest.py`:

1. `BIBLIOGON_TEST=1` + `TEST_DATABASE_URL=sqlite:///:memory:` are
   set BEFORE any `app.*` import. `BIBLIOGON_DATA_DIR` is set to a
   process-scoped tmp dir. All `app.paths.get_data_dir()` and
   `get_upload_dir()` calls resolve into this tmp path.
2. Production data directories carry a `.bibliogon-production`
   marker file (written by the FastAPI lifespan in non-test mode
   via `app.paths.mark_data_dir_as_production`). If any test ever
   sees this marker, the entire test run aborts with
   `pytest.exit(returncode=2)`.

Exit code 2 means a test path was pointed at real data. Investigate;
never delete the marker just to "make the test pass". Origin: the
April 2026 data-loss incident — the DB tripwire landed in `a4cf7cf`,
the filesystem tripwire in this commit.

Path conventions:
- `Path("uploads")` is forbidden (CWD-relative). Use
  `app.paths.get_upload_dir()` everywhere — it resolves fresh on
  every call so test env-var overrides take effect.
- `from app.routers.assets import UPLOAD_DIR` is forbidden (frozen
  at import time). Use `from app.paths import get_upload_dir`
  instead.

### In-memory caches (third isolation layer)

The two layers above cover filesystem and DB state. The third layer
— module-level mutable state in service modules — is NOT covered by
env-vars or marker files. Production keeps these caches; tests must
reset them explicitly.

Any service module using `functools.lru_cache`, `cached_property`,
or module-level mutable state (singletons, registries, dicts
assigned at import time) needs its own teardown hook in the
fixtures that exercise it. The bidirectional `yield`-based autouse
pattern is the simplest shape:

```python
@pytest.fixture(autouse=True)
def _clear_module_cache():
    module.cached_function.cache_clear()
    yield
    module.cached_function.cache_clear()
```

Setup-only clears (the `return None` variant) look correct in
isolation — single-file pytest runs pass — but cross-file ordering
poisons the cache for any later test file that hits the same
service. Today's `platform_schema` regression broke 5
`test_publications.py` tests via this exact path: the fake-schema
result from the last test in `test_platform_schema.py` stayed in
`load_platform_schemas`'s LRU cache; the publications endpoint
served the stale fake dict to the next test file.

Detection grep:
```
grep -E '@(lru_|.*_)cache|_cache *=|^[A-Z_]+ *= *' \
  backend/app/services/<module>.py
```

Any match in a module that tests fake out is a candidate for
state-survival-across-tests. See
`.claude/rules/lessons-learned.md` "Module-level caches survive
test boundaries" for the full pattern + anti-pattern. Audit
backlog item: `TEST-ISOLATION-MODULE-STATE-01` (P3).

## Pre-commit hooks

The repo uses pre-commit for formatting and linting. Contributors install once:

```bash
cd backend && poetry run pre-commit install
```

Hooks run automatically on `git commit`. To run manually on all files:

```bash
cd backend && poetry run pre-commit run --all-files
```

Config in `.pre-commit-config.yaml` at repo root. Current hooks: trailing-whitespace, end-of-file-fixer, check-yaml, check-json, check-added-large-files, check-merge-conflict, ruff (with `--fix`), ruff-format. Backend-only; frontend has its own Prettier/ESLint path.

## Related projects

- [pluginforge](https://github.com/astrapi69/pluginforge) - plugin framework (PyPI)
- [manuscripta](https://github.com/astrapi69/manuscripta) - book export pipeline (PyPI)
- [write-book-template](https://github.com/astrapi69/write-book-template) - target directory structure for export

# Reviews

OpenAI Codex will review your output once you are done
