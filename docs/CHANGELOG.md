# Changelog - Bibliogon

Completed phases and their content. Current state in CLAUDE.md, open items in ROADMAP.md.

## [0.25.0] - 2026-05-01

Articles reach feature parity with books across the full lifecycle: dashboard chrome, soft-delete + trash, AI-generated SEO metadata, backup format extended to manifest 2.0 with article + publication + asset segments, and CIO-handler restore through the Import Wizard. Three-layer secrets configuration (project YAML < user override < env-var) replaces the old "edit `app.yaml`" advice with a Gradle-style override file. The donations theme ships its first user-visible surface (S-01 Settings tab "Unterstützen" with four-channel grid). T-01 inline-styles refactor migrates 22 components / pages to per-file CSS Modules, eliminating ~700 inline-style call-sites. Plus a mobile-first hamburger for the Settings tabs (F-01) and a sturdier `make dev-bg` that no longer dies silently when the recipe shell exits (F-02).

### Action required

No migrations new in this release. If you carry a real Anthropic API key in `backend/config/app.yaml`, move it to `~/.config/bibliogon/secrets.yaml` (or set `BIBLIOGON_AI_API_KEY`) per [docs/configuration.md](configuration.md); the running app still reads the old location with a deprecation warning, but the Settings UI hides the API-key input so editing it requires the override path.

The donations block was already shipped in `app.yaml.example` in v0.24.0 cycle but was inert; v0.25.0 wires it into the UI. Existing installs gain the "Unterstützen" tab automatically once their `app.yaml` carries the block (copy from `app.yaml.example` if missing).

### Added

**Articles dashboard parity with books.** Articles list/grid view toggle, deterministic cover placeholder, action menu with hamburger + soft-delete + permanent-delete entries, header chrome (back button, navigation), trash bin with restore + permanent-delete, refresh on bfcache + visibility-change so import-restore flows do not need F5.

**Articles in backup format (manifest 2.0).** `export_backup_archive` writes an `articles/<id>/article.json` segment alongside `books/`, plus `publications/` and `article_assets/` when present. Manifest reports `article_count`, `publication_count`, `article_asset_count`. Forward-compat: legacy v1.0 backups still restore book-only as before; unknown future versions log a warning-only (no hard reject).

**CIO BgbImportHandler restores articles.** `detect()` counts both books and articles; the "no book.json inside the backup" warning fires only when the archive is empty in BOTH segments. `execute()` and `execute_multi()` walk `articles/` and call the article-restore helpers. Articles-only `.bgb` returns `book_id=""` so the wizard's `SuccessStep` redirects to `/articles` instead of expecting a book id. Idempotent re-import: an already-live article is silently skipped; a soft-deleted article gets hard-deleted and re-inserted as live (revival).

**AI-generated SEO for articles.** "Generate" button next to SEO title / description / tags fields runs the article body through the configured LLM provider with article-specific prompts. Streaming-style insertion into the form fields. Per-provider gating reuses the existing health/availability check.

**Three-layer secrets configuration.** New loader chain in `backend/app/main.py`: project `backend/config/app.yaml` < user override at `~/.config/bibliogon/secrets.yaml` (XDG_CONFIG_HOME / %APPDATA% on Windows) < `BIBLIOGON_*` env-vars. Settings UI hides the API-key input field when the resolved key is "managed externally" so users cannot accidentally write a secret into the project YAML. Defense-in-depth: `PATCH /api/settings/app` strips `ai.api_key` from request bodies (with a WARNING log) when an override is configured. AiSetupWizard branches on the `secretsManagedExternally` prop and shows an info note about how to rotate the key. Backwards-compatible: if `app.yaml` still carries a key, the loader emits a deprecation warning but the value still reaches the AI client.

**Donation visibility — S-01 Settings tab.** New "Unterstützen" tab in Settings renders the channel grid (Liberapay, GitHub Sponsors, Ko-fi, PayPal) with optional `recommended` badge per channel. `landing_page_url: null` (default) keeps the inline grid; setting it to a URL collapses every donation surface (S-01, S-02, S-03) to a single "Projekt unterstützen" button. DONATE.md and DONATE-de.md rebranded from a previous experimental name to Bibliogon-only, expanded with parenting/caregiving context.

**Settings mobile hamburger (F-01).** Below the 768px breakpoint, the Tabs.List collapses into a `Menu`-icon dropdown labelled with the active tab's name. Same `tabDefs` array is the source of truth for both desktop tabs and mobile dropdown; deep-link via `?tab=X` and the URL-replace behaviour are unchanged.

**`make dev-bg` robustness (F-02).** `setsid` puts each child in its own session so the recipe shell exiting does not SIGHUP the children. stdout + stderr redirect to `$(DEV_LOG_DIR)/{backend,frontend}.log`. `kill -0` startup probe fails loud with the log path on early death. New `make dev-bg-logs` target tails both files.

### Changed

**T-01 inline-styles refactor.** 22 components and pages migrated from `const styles = { ... }` JS objects + `style={styles.X}` JSX to per-file `*.module.css` files + `className={styles.X}`. Theme tokens (`var(--bg-card)`, `var(--accent)`, ...) preserved verbatim so the 3-theme × light/dark cascade works through the module boundary unchanged. Multi-className merges via template literal where global utility classes (`btn`, `btn-icon`) had to coexist with module classes. Conditional active/disabled states refactored from spread-objects to filter-Boolean className joins. Pilot (`TrashCard`) committed first; per-file migrations followed in `Phase B` commits.

**Articles trash card layout.** `flex-wrap: wrap` added to the action button row so the second German button label (`Endgültig löschen`) survives narrow grid columns. Articles trash grid track bumped from `minmax(220px, 1fr)` to `minmax(300px, 1fr)` to match the books-dashboard column sizing.

**Donation document rebranded.** DONATE.md and DONATE-de.md scrubbed of the old experimental project name; expanded with the parenting/caregiving context.

**Donation `landing_page_url` example default.** `app.yaml.example` ships with `landing_page_url: null` so a fresh `cp` lands on the inline four-channel grid (the in-app UI surface). The DONATE.md landing variant collapses S-01 to a single button - useful for S-02/S-03 dialogs but loses the in-app channel UI.

**Centralised app version.** `backend/app/__init__.py` now defines `__version__ = "0.25.0"`. `app.main` reads it for both the FastAPI metadata and the `/api/health` response, replacing the previous hardcoded strings (one of which was stale at `0.15.0` and reported the wrong version to the frontend).

### Fixed

**AI client read-path regression.** `ai/routes.py:_get_ai_config` previously called `yaml.safe_load(open("config/app.yaml"))` directly, bypassing the new three-layer loader and ignoring both the user override and `BIBLIOGON_AI_API_KEY`. Routed through `_load_app_config` via lazy import (avoids circular).

**Articles trash header chrome.** Was missing the back-button + ChevronLeft + symmetric navigation found on books-trash; sweep brought articles-trash to parity.

**Articles trash respects view mode.** TrashPanel rendered grid layout regardless of the active view-mode toggle. Now switches between grid + list to mirror the live-articles view.

**Books trash list layout.** ViewToggle was rendered outside the trash branch so list-mode in trash fell through to grid. Moved into the branch.

**Dashboard trash badge positioning.** Toggle button needed `position: relative` so the absolutely-positioned badge anchored correctly.

**Import Wizard for articles-only `.bgb`.** `validate_overrides` skipped the title+author gate when `is_articles_only`; previously the Continue button stayed disabled because the orchestrator demanded book-level metadata. `onImported` now fires with `bookId=""` for the articles-only path so the SuccessStep can redirect to `/articles`.

**WBT importer iterates branches.** Multi-language WBT ZIPs / folders adopt main + main-XX branches under git adoption (was main-only). Picks up the modern `backpage-*` sidecar filenames the WBT format started using earlier.

**Navigation metadata link.** "Autoren in Einstellungen verwalten" link now lands on the Settings → Author tab.

**i18n ASCII umlaut substitutes.** Spanish accents fixed in 4 plugin YAMLs (`Traducción`, `página`, `validación`, `publicación`, `Generación`, `capítulos`); German `ä` / `ö` / `ü` / `ß` substitutes scrubbed; builtin chapter-template translations added.

### Documentation

- New `docs/configuration.md` documents the three-layer secrets chain. README + CLAUDE.md cross-reference it.
- Multiple Phase 1 audit docs under `docs/explorations/`: articles-backup, articles-dashboard parity, trash parity, trash-card permanent-delete, secrets-refactor, donation visibility, T-01 inline-styles. Each maps the surface, lists hypotheses with code evidence, and proposes a Phase 2 scope.
- New per-feature smoke-test docs under `docs/testing/smoke-tests/`: articles-backup, donation-visibility, inline-styles-migration, phylax-rebrand, secrets-refactor, trash-card-permanent-delete, trash-parity. README index lists all of them.
- New session-1 test plan + onboarding + result template + coverage matrix.
- ROADMAP, journal entries, post-v0.24.0 optimization report, Medium-ready competitive analysis draft, OpenAI Codex review instructions.

### Internal

- `backend/app/__init__.py` switches from empty to a real `__version__` constant (single source of truth).
- Pre-commit auto-fixes (EOF + ruff-format) sweep across the inline-styles refactor wave so each commit re-passed the local hooks.
- `make fix-watchers` target persists Linux inotify limits for vite dev mode (`/etc/sysctl.d/99-bibliogon-watchers.conf`); avoids the per-session `sudo sysctl` workaround.
- `make dev-bg-logs` tails both backend + frontend logs from a `make dev-bg` run.

## [0.24.0] - 2026-04-28

Article authoring lands as a first-class feature alongside book authoring. Articles are standalone documents (not book chapters) intended for blog posts, newsletter pieces, and online publication. The release ships AR-01 (entity + CRUD + editor), AR-02 (publications + drift detection across 8 platforms), AR-02 Phase 2.1 (topics + SEO), and three editor-parity phases that bring articles to feature parity with the book editor: a shared `RichTextEditor` with content-kind-aware plugin gating, per-article ms-tools quality checks, translate-article via the existing translation provider abstraction, and Markdown / HTML / PDF / DOCX export. Plus PS-13 "Save as new chapter" in the chapter conflict dialog, UX-FU-02 featured image upload, follow-ups for PGS-02..04 (per-book PAT credential integration, mark_conflict + rename detection in the smart-merge diff, surface skipped branches in multi-language import), and a refreshed README + UX conventions guide + plugin author patterns.

### Action required

Four new Alembic migrations (`f9a0b1c2d3e4`, `a0b1c2d3e4f5`, `b1c2d3e4f5a6`, `c2d3e4f5a6b7`) for the new `articles`, `publications`, `article_assets` tables plus topic/SEO columns. If you reach v0.24.0 via `alembic upgrade head` rather than fresh install, run it again after pulling. All migrations are idempotent.

```bash
cd backend && poetry run alembic upgrade head
```

### Added

**Article authoring (AR-01 Phase 1).** New `Article` model with status lifecycle (`draft -> ready -> published -> archived`), title, content (TipTap JSON), language, tags, author. `/api/articles/` CRUD. New `ArticleEditor` page with article-specific sidebar (status, language, author, tags, SEO, featured image, topic). Dashboard gains a "New Article" entry alongside book creation; article list view at `/articles/`.

**Publications + drift detection (AR-02 Phase 2).** New `Publication` entity tracks where an article was published (platform, URL, timestamp, content snapshot). 8 platform schemas as YAML data (Medium, Substack, X, LinkedIn, dev.to, Mastodon, Bluesky, Generic) - the frontend renders the form schema-driven so new platforms are a YAML edit. Drift detection compares the snapshot against the live article body and surfaces `out_of_sync` publications. Article-level SEO fields (`canonical_url`, `featured_image_url`, `excerpt`, `tags`).

**Topics, SEO, sidebar layout (AR-02 Phase 2.1).** New Topics tab in Settings manages the topic list applied across articles. Topic dropdown in the editor with inline-add. SEO Title / SEO Description three-row textareas. Sidebar-left layout matching BookEditor convention. New `useTopics` hook with API fallback.

**Editor-Parity Phase 1.** Shared `RichTextEditor` with `contentKind: "book-chapter" | "article"` prop gates which TipTap extensions + AI prompt set it activates. New `editor-gates` module centralises the gating. Article-specific AI prompts pivot from "your novel chapter" to "your article" wording.

**Editor-Parity Phase 2.** ms-tools per-article (no code change required - existing endpoint accepts `article_id`). New `POST /api/articles/{id}/translate` endpoint runs `content_json` through the existing translation provider abstraction (DeepL, LMStudio) and creates a draft in the target language. Translate panel mirrors the book translate UI. Provider gating filters out unconfigured + unhealthy providers; provider errors surface as HTTP 502 with provider name + reason.

**Editor-Parity Phase 3.** Article export to Markdown / HTML / PDF / DOCX. New router `app/routers/article_export.py` reuses `bibliogon_export.tiptap_to_md.tiptap_to_markdown` for the JSON-to-Markdown conversion + shells out to Pandoc for PDF and DOCX. Sidebar Export panel with one button per format. 11 backend pytest tests cover converter reuse, Pandoc invocation (mocked), and content-disposition header.

**UX-FU-02: Article featured image upload.** Per-article asset uploads (mirrors `api.covers` for books). New `POST /api/articles/{id}/featured-image` endpoint + migration `c2d3e4f5a6b7`. New `ArticleImageUpload` widget combines URL input with drag-and-drop / click-to-upload.

**PS-13: Save as new chapter.** Third option in `ConflictResolutionDialog` alongside Keep Local / Discard. New `POST /api/books/{id}/chapters/{cid}/fork` clones the unsaved local edit into a fresh chapter inserted at `source.position + 1`; subsequent positions bump by 1. Source chapter untouched. Inherits `chapter_type`. 5 i18n keys × 8 languages. 6 backend pytest tests + 3 Vitest tests.

**plugin-git-sync follow-ups.**
- PGS-02-FU-01: per-book PAT credential integration via shared `app/services/git_credentials.py`. PAT never lands in `.git/config`. New `PUT/GET/DELETE /api/git-sync/{book_id}/credentials` endpoints + `CredentialsSection` in `GitSyncDialog`. +29 tests.
- PGS-03-FU-01: `mark_conflict` resolution action (rewrites `both_changed` chapters with git-style conflict markers) + rename detection (`_collapse_renames` pairs `*_removed` + `*_added` rows with matching bodies into `renamed_remote` / `renamed_local`). Counts payload gains `marked` + `renamed`. +9 backend tests + 3 Vitest tests.
- PGS-04-FU-01: surface skipped branches in multi-language import with a reusable result panel.

**Multi-book wizard finishing (CIO-08-FU-01).** ImportWizardModal switches from parallel `useState<WizardState>` to `useMachine(wizardMachine)`. New `SuccessMultiStep` terminal lists every imported book with per-book "Open" link.

### Changed

- **README rewritten + README-DE synced.** Both reflect articles, git-sync, and multi-book import as first-class features.
- **UX conventions guide** (`docs/ux-conventions.md`) collects the recurring UX patterns so future feature work has a written rule set.
- **Plugin author guide** gains the PGS-02..05 patterns (source adapter, two registries, plugin-to-plugin path dep, PluginForge-activation bridge).
- **Smoke test catalog consolidated** under `docs/manual-tests/`.
- **`mobile-web-app-capable` meta tag** in `frontend/index.html` for modern browsers (deprecated `apple-mobile-web-app-capable` kept for legacy iOS).

### Fixed

- **Translate panel crashed on empty provider list.** Now shows a config gate linking to Settings > Plugins > Translation.
- **Translate dropdown ignored provider config / health.** Now filters to providers that are configured and healthy.
- **Translate-article 500 on provider failure.** Now surfaces as 502 with provider name + reason; rebuild fallback + diagnostic logs.
- **Editor invisible after sidebar-left layout move.** Layout fix restores click-target + visibility.
- **Three smoke-test UX defects + four follow-up smoke-test UX defects** in ArticleEditor (status dropdown, topic input, featured image hint, tooltip copy).
- **CI: ruff format + mypy on article-export.** Three files needed ruff format pass; `bibliogon_export` import in article-export router needed an entry in `[[tool.mypy.overrides]]`.

### Maintenance

- **MAINT-01 closed early** in `ffb1618` (v0.22.x migration topic clean per `test_alembic_drift.py`).
- **DOC-03 closed** in `ef299bc` (PGS-02..05 plugin patterns added to plugin author guide).
- **DEP-02 (TipTap 2 -> 3) deferred.** Upstream `@sereneinserenade/tiptap-search-and-replace` v0.24.0 still not on npm; vite-plugin-pwa peer deps still cap at Vite 7. Hard fallback deadline 2026-05-05; `prosemirror-search` adapter (~50-80 LOC) ready as fallback. A scheduled GitHub Actions workflow polls weekly and opens an issue on unblock.
- **SEC-01** vite-plugin-pwa CVE chain: dev-only exposure (production bundle clean). Same upstream blocker as DEP-09.

## [0.23.0] - 2026-04-25

Major workflow milestone for self-publishing authors maintaining multi-language books in external git hosting. Plugin-git-sync ships its full PGS-02..05 rollout: bi-directional sync to a remote write-book-template repo, three-way smart-merge on re-import with a per-chapter conflict UI, branch-driven multi-language detection with auto-linked translation groups, and a unified-commit bridge to core git so authors who run both subsystems on the same book can commit everywhere in one click. PGS-01 (the import-only MVP that landed before v0.22.0) is the foundation the four new phases build on.

The release also surfaces the post-v0.22.0 backend/UI polish that shipped through v0.22.1: multi-book BGB import on an XState v5 state graph, sticky action-button footers across 13 dialog modals, the EnhancedTextarea wrapper (CSS lowlight + Markdown/HTML preview + fullscreen + copy-to-clipboard) on every metadata textarea, and a structured error-reporting path (WizardErrorBoundary + Copy details + Report on GitHub).

### Action required for v0.22.0 users (forwarded from v0.22.1)

If you reached v0.22.0 via `alembic upgrade head` rather than a fresh install, run it again after pulling v0.23.0. The migration `c6d7e8f9a0b1` (added in v0.22.1) backfills `books.tts_speed`; v0.23.0 layers two more on top. All migrations are idempotent.

```bash
cd backend && poetry run alembic upgrade head
```

### Known limitation

PAT-via-UI is **not yet wired** for either core git or plugin-git-sync push. Pushing to a remote requires ambient credentials at the OS level: the user's SSH agent / `~/.ssh/id_*` for SSH URLs, or the system git credential helper for HTTPS. PAT integration through Bibliogon's own credential store is the next git-sync follow-up.

### Added

**plugin-git-sync PGS-02 - Commit to Repo.**
- `app/services/git_sync_mapping.py` lifts the staged clone from the orchestrator's temp dir into a long-lived `uploads/git-sync/{book_id}/repo/` after a successful git import + writes a `git_sync_mappings` row (migration `d7e8f9a0b1c2`).
- `app/services/git_sync_commit.py` re-scaffolds the book via plugin-export's `scaffold_project`, replaces the working tree (preserves `.git/`), creates one commit, and pushes via the user's ambient git credentials when requested. Typed `PushFailedError` with a stable `.reason` slug ("auth"/"rejected"/"network"/"no_remote"/"unknown") - the router maps to 401/409/502 so the frontend can route to specific toasts.
- `GET /api/git-sync/{book_id}` returns the mapping snapshot + a cheap dirty-check; `POST /api/git-sync/{book_id}/commit` runs the commit + optional push (404 unmapped / 410 clone missing / 409 nothing-to-commit / 401 push-auth / 502 network).
- `GitSyncDialog` surfaces the mapping snapshot, dirty-warning, optional commit message + push toggle, and last-commit confirmation; ChapterSidebar conditionally renders the "Sync zum Repo" button when the book has a mapping.

**plugin-git-sync PGS-03 - Smart-Merge on re-import.**
- `app/services/git_sync_diff.py` runs the three-way comparison: reads base + remote WBT chapters at arbitrary git refs via `git ls-tree` + `git show` (no working-tree checkout), reads local DB chapters, and converts each through `bibliogon_export.tiptap_to_md.tiptap_to_markdown` so what diff sees matches what commit-to-repo would write. Identity is `(section, slug-of-title)`. The pure `_classify` covers every classification: `unchanged`, `remote_changed`, `local_changed`, `both_changed`, `remote_added`, `local_added`, `remote_removed`, `local_removed`, plus the same-edit-on-both-sides not-a-conflict case and a normalize step that tolerates blank-line runs and trailing newlines.
- `apply_resolutions` walks the user's per-chapter decisions and mutates the DB (overwrite via `md_to_html` + `sanitize_import_markdown` for `take_remote`; create/delete for the add/remove cases), then bumps `last_imported_commit_sha` so the next diff starts fresh.
- Endpoints `POST /api/git-sync/{book_id}/diff` (classifications + counts) and `POST /api/git-sync/{book_id}/resolve` (apply Keep Bibliogon / Take from repo per chapter).
- `GitSyncDiffDialog` lists the actionable rows, defaults `remote_changed` -> Take Repo and `both_changed` -> Keep Bibliogon, posts only resolvable rows. Reachable from the existing GitSyncDialog via "Auf Aenderungen vom Repo pruefen". `mark_conflict` (write both versions as a visible conflict block) is intentionally out of MVP.

**plugin-git-sync PGS-04 - Multi-language branch linking.**
- Migration `e8f9a0b1c2d3` adds `books.translation_group_id` (nullable indexed UUID).
- `app/services/translation_groups.py` owns the linking primitives: `derive_language(branch, metadata)` resolves `main-XX` -> `XX` and bare `main` -> `metadata.yaml.language` (locale tags like `main-de-AT` are explicitly rejected so the suffix stays unambiguous); `link_books` creates a fresh group or folds members into the lexicographically-smallest existing group (deterministic merge); `unlink_book` clears the row and auto-unlinks the lone survivor of a two-book group; `list_siblings` excludes self + soft-deleted, sorted by language.
- `app/services/translation_import.py` clones a repo once, enumerates every `main` + `main-XX` branch, runs the WBT importer per checkout, persists a per-book clone under `uploads/git-sync/{book_id}/repo` with its own `GitSyncMapping`, and links the resulting books with one shared group id. Per-branch failures log + skip rather than abort the whole import.
- Endpoints `GET /api/translations/{book_id}`, `POST /api/translations/link`, `POST /api/translations/{book_id}/unlink`, `POST /api/translations/import-multi-branch`.
- `TranslationLinks` mounts inside the metadata editor's General tab: linked state shows clickable language badges that navigate to each sibling + an Unlink button; unlinked state shows a Link button that opens a dialog listing every other book with checkboxes. Flat cross-link model - no master/translation hierarchy.

**plugin-git-sync PGS-05 - Core-git bridge with unified commit.**
- `app/services/git_sync_lock.py` provides a per-book `threading.Lock` with a 30 s default timeout that both core git and plugin-git-sync grab before mutating book state, so concurrent commit requests on the same book serialize cleanly.
- `app/services/git_sync_unified.py` decides which subsystems are active for a book and fans one call out to both - core git first (smaller blast radius), plugin-git-sync second; per-subsystem failures land in the response payload (`status: ok | skipped | nothing_to_commit | failed`) rather than as a single hard 500. `GET /api/git-sync/{book_id}` extended with `core_git_initialized: bool`; new endpoint `POST /api/git-sync/{book_id}/unified-commit` (503 only when the per-book lock can't be obtained within 30 s).
- `GitSyncDialog` shows a banner + a primary "Commit ueberall" button next to the existing single-subsystem button when `core_git_initialized && mapped`; per-subsystem outcomes render as a status-coded result list under the form. Toast tier follows the per-subsystem result.

**Multi-book BGB import (forwarded from v0.22.1).** `.bgb` archives carrying multiple books now render a per-book selection list with bulk select-all/deselect-all, per-row duplicate handling (Skip / Overwrite / Create-new), and chapter/cover badges. Backend extends `DetectedProject` with `is_multi_book` + `books: list[DetectedBookSummary]`; the orchestrator dispatches to `execute_multi` on multi-book detect. New `wizardMachine` (XState v5; states: upload / detecting / summary / preview-single / preview-multi / executing / success / error; guards: `isMultiBook`, `hasMultiBookSelection`, `canRetry`) acts as the testable data layer. Pattern documented in `docs/architecture/state-machines.md`.

**EnhancedTextarea (forwarded from v0.22.1).** Universal textarea wrapper with toolbar (copy, word/char counter, autosize, fullscreen) and tab-switchable preview for `css` (lowlight syntax), `markdown` (react-markdown + remark-gfm) and `html` (DOMPurify-sanitized) fields. All metadata textareas (description, backpage, custom CSS, html_description) migrated to the new wrapper.

**Structured wizard error reporting (forwarded from v0.22.1).** `WizardErrorBoundary` + rewritten `ErrorStep` capture render exceptions inside the import wizard and expose **Copy details** (clipboard-ready markdown bundle: cause, stack, status, endpoint, version, browser, route) plus **Report Issue** (pre-filled GitHub Issues URL). Replaces the previous black-hole UX where a failed import left the modal cratered with no actionable message.

**Three-option author picker (forwarded from v0.22.1).** Wizard now handles `.bgp`/`.bgb` with no author by offering: create-new, pick-existing, defer. Defer is gated behind a Settings toggle `Allow books without author` (default OFF). Migration `b5c6d7e8f9a0` makes `Book.author` nullable.

### Changed

- **Sticky modal action-button footers (forwarded from v0.22.1).** Action buttons in long-content modals (ImportWizard, ChapterTemplate, CreateBook, ErrorReport, Export, SaveAsTemplate) now stay visible via a global `.dialog-content-wide .dialog-footer` sticky rule. BackupCompare and GitBackup got bespoke inline sticky on their long-content surfaces. Companion CSS regression test pins the rule against drift.
- **Wizard reformatted around an XState v5 state graph (forwarded from v0.22.1).** `wizardMachine` is the new testable data layer for the import wizard; the modal still owns the XState integration but the state transitions, guards, and side effects are now declared in one machine. State pattern documented in `docs/architecture/state-machines.md`.
- **Author field is a real `<select>` dropdown (forwarded from v0.22.1).** The previous datalist-based input was browser-filtered by the current value, silently hiding the rest of the picker once any name was set. Replaced with a `<select>` + optgroup that renders all options unconditionally. New `POST /api/settings/author/pen-name` endpoint.

### Fixed

- **Critical: missing `books.tts_speed` migration (forwarded from v0.22.1).** `Book.tts_speed` was introduced as a `Mapped[float | None]` column but never paired with an Alembic revision. Fresh installs picked it up via `Base.metadata.create_all`; alembic-upgrade-path DBs did not, surfacing as a SQLAlchemy `OperationalError` and HTTP 500 on `/api/import/detect`. Migration `c6d7e8f9a0b1` backfills the column with an idempotent existence check.
- **i18n duplicate key cleanup (forwarded from v0.22.1).** `error_retry` and `error_cancelled_server_side` were duplicated in all 8 language files - PyYAML last-wins so the runtime was already using the better translation, but ruamel pre-commit forbade duplicates. Deduped, kept the better translation.

## [0.22.1] - 2026-04-25

Patch release on top of the v0.22.0 import orchestrator. Headline is a critical Alembic fix: a missing migration for `books.tts_speed` (added as a `Mapped` column without a corresponding revision) caused HTTP 500 on `/api/import/detect` for users who reached v0.22.0 via `alembic upgrade head` rather than fresh-install. The release also lands the post-import textarea polish, an error-reporting infrastructure for the wizard, the multi-book BGB import path with an XState v5 state graph, and a sticky-footer pattern across all scrolling dialog modals so action buttons never scroll out of reach.

### Fixed

- **Critical: missing `books.tts_speed` migration.** `Book.tts_speed` was introduced as a `Mapped[float | None]` column but never paired with an Alembic revision. Fresh installs picked it up via `Base.metadata.create_all`; alembic-upgrade-path DBs did not, surfacing as a SQLAlchemy `OperationalError` and HTTP 500 on import. Migration `c6d7e8f9a0b1` backfills the column with an idempotent existence check; users on v0.22.0 should run `alembic upgrade head`.
- **Wizard error dialog.** Render exceptions inside the import wizard previously cratered the modal with no user-actionable message. New `WizardErrorBoundary` + rewritten `ErrorStep` capture the failure, expose Copy details (clipboard-ready markdown bundle: cause, stack, status, endpoint, version, browser, route) and Report Issue (pre-filled GitHub Issues URL).
- **Author field is a real `<select>` dropdown.** The previous datalist-based input was filtered by current value, so a populated author silently hid the rest of the picker. Replaced with a `<select>` + optgroup that renders all options unconditionally. Pen-name endpoint added (`POST /api/settings/author/pen-name`).
- **Sticky modal action buttons.** Action buttons in long-content modals (Export, ChapterTemplate, CreateBook, ErrorReport, SaveAsTemplate) now stay visible via a global `.dialog-content-wide .dialog-footer` sticky rule. BackupCompare and GitBackup got bespoke inline sticky on their long-content surfaces. Companion to the wizard step-footer fix landed earlier in the cycle.

### Added

- **EnhancedTextarea wrapper.** Universal textarea component with toolbar (copy, word/char counter, autosize, fullscreen) and tab-switchable preview for `css` (lowlight syntax), `markdown` (react-markdown + remark-gfm) and `html` (DOMPurify-sanitized) fields. Migrated all metadata textareas (description, backpage, custom CSS, html_description) to the new wrapper.
- **Multi-book BGB import.** `.bgb` archives containing multiple books now render a per-book selection list (Step 3) with bulk select-all/deselect-all, per-row duplicate handling (Skip/Overwrite/Create-new), and chapter/cover badges. Backend extends `DetectedProject` with `is_multi_book` + `books: list[DetectedBookSummary]`; orchestrator dispatches to `execute_multi` on multi-book detect.
- **XState v5 wizard state graph.** New `wizardMachine` (states: upload/detecting/summary/preview-single/preview-multi/executing/success/error; guards: `isMultiBook`, `hasMultiBookSelection`, `canRetry`) acts as the testable data layer. State pattern documented in `docs/architecture/state-machines.md`.
- **Three-option author picker.** Wizard now handles `.bgp`/`.bgb` with no author by offering: create-new, pick-existing, defer. Defer is gated behind a Settings toggle `Allow books without author` (default OFF).
- **`books.author` nullable.** Migration `b5c6d7e8f9a0` makes `Book.author` nullable, paired with backend `_validate_author()` guard on POST/PATCH that respects the toggle.
- **UX convention guide.** `docs/ux-conventions.md` formalises the modal/form/dialog patterns we keep landing in PRs.

### Changed

- **Deterministic cover fallback.** `_first_cover_for_book` now orders by `Asset.filename` so backend test results match across SQLite versions and CI environments.
- **Dependencies.** Added `xstate@5` + `@xstate/react@6`; bumped lowlight + react-markdown + dompurify + hast-util-to-jsx-runtime for the EnhancedTextarea preview pipeline.

## [0.22.0] - 2026-04-24

Core import orchestrator is the headline feature. Eight CIO tasks land across backend + wizard + plugin handlers: a unified `/api/import/*` two-phase (detect + execute) flow replaces the legacy `/api/backup/smart-import`, with preview-before-commit semantics, duplicate detection, and per-field override selection against the full Book column set. Five source handlers ship in core (`.bgb`, markdown file, markdown folder, `.docx`, `.epub`, WBT zip). A new plugin-git-sync (PGS-01) adds git-URL import as the first plugin-to-plugin dependency pattern. Multi-cover projects, author-asset classification, and a Settings-sourced author picker round out the wizard. Breaking: the deprecated `/api/backup/smart-import` and `/api/backup/import-project` routes are now removed.

### Added

**Core import orchestrator (CIO-01..CIO-08)**
- **CIO-01 foundation.** Two-phase `ImportPlugin` protocol in `backend/app/import_plugins/` (`detect` returns `DetectedProject` with no side effects; `execute` commits with a temp-ref handle). Router endpoints `POST /api/import/detect`, `POST /api/import/execute`. `BookImportSource` table tracks content-hash signatures for duplicate detection across imports. Frontend `ImportWizardModal` with 4-step flow (upload → detect → preview → execute), drag-drop Step 1, rotating-status Step 2 with cancel, sectioned Step 3 preview + override UI, auto-redirect Step 4 success. 8-language i18n.
- **CIO-02 WBT handler.** Write-book-template zip logic now flows through `WbtImportHandler` implementing the protocol. `/api/backup/smart-import` marked deprecated (Deprecation + Link + Warning headers pointing at `/api/import/detect`).
- **CIO-03 folder drag-drop.** `core-markdown-folder` handler. `/api/import/detect` accepts multi-file multipart with a path-traversal guard; wizard uses `webkitdirectory` + drop-many.
- **CIO-04 office formats.** `DocxImportHandler` + `EpubImportHandler` shell out to Pandoc, split on H1 boundaries, copy `--extract-media` output into `uploads/{book}/figure/`. Wizard advertises `.docx` + `.epub`.
- **CIO-06 field-selection wizard (Option B).** `DetectedProject` + handlers gain 20 nullable fields (subtitle, series, genre, description, edition, publisher info, 3 ISBNs, 3 ASINs, keywords, 3 long-form marketing, cover_image, custom_css). Shared `app.import_plugins.overrides` allowlist + null-skip + mandatory-field 400. Step 2 is a deliberate Summary step; Step 3 rewritten as sectioned per-field selection (24 rows across Basics / Metadata / Publishing / Long-form / Styling / Keywords / Overview), each non-mandatory row with an include/exclude checkbox. 32 new i18n keys × 8 languages. Help page `docs/help/{de,en}/import/field-selection.md`.
- **CIO-07 `.git/` adoption in wizard.** Backend: `DetectedProject.git_repo` carries size/branch/head/remote/warnings; `git_import_inspector` scans for security findings (http.*.extraheader, credential.helper, custom hooks, token-shaped user.email, non-standard packed-refs); `git_import_adopter` sanitizes (strip extraheader, credential section, custom hooks, clear reflog + gc prune) then copies to `uploads/<book_id>/.git`. `ExecuteRequest.git_adoption: "start_fresh" | "adopt_with_remote" | "adopt_without_remote"`. Backfill endpoint `POST /api/books/{id}/git-import/adopt` for books imported before the feature. Frontend: dedicated Git history section with 3-way radio + repo metadata summary + security warnings. 16 new i18n keys × 8 languages.
- **CIO-08 multi-cover + author-assets + author picker.** Projects shipping multiple files under `assets/cover/` or `assets/covers/` now render as a thumbnail grid with a radio selector; chosen file flows through a new `primary_cover` meta-override onto `book.cover_image`, the rest import as `asset_type="cover"` for later swapping. `assets/author/`, `assets/authors/`, and `assets/about-author/` classify as `purpose="author-asset"` / `asset_type="author-asset"` so portraits/signatures/bio images no longer leak into chapter figures; wizard renders them in a dedicated section and `BookMetadataEditor`'s Design tab shows an `AuthorAssetsPanel` thumbnail grid with delete. Wizard author input gets a datalist populated from `/api/settings/app` (`author.name` + `author.pen_names`). 5 new i18n keys × 8 languages.

**plugin-git-sync (PGS-01)**
- First plugin-to-plugin dependency pattern in the project. Plugin at `plugins/bibliogon-plugin-git-sync/` declares `plugin-export` as a path dep for future PGS-02 export-to-repo reuse.
- New `RemoteSourceHandler` protocol in the core registry (`backend/app/import_plugins/registry.py`); plugin delegates detect/execute to the existing `WbtImportHandler` instead of re-implementing WBT parsing (source adapter, not a format parser).
- `POST /api/import/detect/git` accepts `{git_url}`, dispatches to the plugin's `GitImportHandler`, clones via GitPython into the orchestrator's staging directory, returns the normal `DetectResponse` so `POST /api/import/execute` resolves the temp_ref identically to file uploads.
- Wizard Step 1 git URL input with 8-language i18n.
- Public HTTPS only; auth + branch selection + smart-merge deferred to PGS-02/03.

**Metadata editor**
- Author + language fields on the General tab. Author uses the same `useAuthorChoices` hook as the wizard (datalist from Settings `author.name` + `author.pen_names`).
- `AuthorAssetsPanel` on the Design tab: thumbnail grid + delete for files imported with `asset_type="author-asset"`.

### Changed

**Breaking**
- **`/api/backup/smart-import` removed.** Deprecated in v0.21.0 with `Deprecation` + `Link` + `Warning` headers. Use `/api/import/detect` + `/api/import/execute` instead.
- **`/api/backup/import-project` removed.** Same replacement path as smart-import.
- **`/api/backup/import` scope narrowed.** Now `.bgb` only; project imports go through `/api/import/*`.

**Non-breaking**
- Dashboard legacy "Import" button + hidden file input + `api.backup.smartImport` + `api.backup.importProject` removed. Mobile menu + empty-state picker now open the import wizard directly.
- `ui.dashboard.import_new` i18n key dropped from all 8 languages (orphaned after the merge).

### Fixed

- **Partial-extraction cache hazard.** `WbtImportHandler._extracted_root` used to reuse a partial extraction directory silently when a prior extraction crashed mid-way, causing CSS/cover import to fail intermittently. Now writes a `.extraction-complete` sentinel and `rmtree`s on missing sentinel.
- **Stale `cover_image` hint overwriting upload path.** When metadata.yaml named a cover file that did not exist in the ZIP, the wizard emitted the dangling basename as an override that overwrote the valid `uploads/<id>/cover/<file>` path `_maybe_set_cover_from_assets` had just written. PreviewPanel now force-sets `cover_image` include=false so the field is never emitted. Multi-cover selection flows through the `primary_cover` meta-override instead. Backend regression pin: `test_stale_cover_image_override_does_not_clobber_upload_path`.
- **Custom CSS discovery widened.** `_read_custom_css` first scans `config/`, then `assets/css/` + `assets/styles/`, then `rglob("*.css")` under project_root (excluding `node_modules`, `__MACOSX`, `.git`). Empty files skipped with a "no stylesheet" warning.
- **Preview renders the actual cover image.** Staging file endpoint `GET /api/import/staged/{temp_ref}/file?path=<rel>` with path-traversal guard; `CoverThumbnail` uses it instead of a filename placeholder.
- **WBT image-path rewrite handles smart quotes.** Chapters containing `“asset/...”` (Word smart-quoted) now rewrite to the asset API correctly.
- **Test DB isolated from production `bibliogon.db`.** `conftest.py` now drops + re-creates in-memory for every test session instead of running against the dev DB.
- **Validate metadata cover reference against imported assets.** When the YAML names a file that does not exist on disk, `_maybe_set_cover_from_assets` falls through to the first real cover asset instead of leaving a dead URL.
- **ChapterSidebar follows theme toggle.** Settings > Allgemein > Theme now propagates into the sidebar in light/dark mode.
- **Theme palette labels localized.** Settings palette dropdown reads from `ui.settings.palette_*` keys per language.
- **Plugin descriptions in active UI language.** Settings > Plugins shows `ui.plugin_descriptions.{name}.description` per lang instead of the English default.
- **MkDocs EN nav.** `nav_translations` emitted so the EN site surfaces English labels instead of falling back to the DE labels from `_meta.yaml`.

### Documentation

- **Core import orchestrator exploration.** `docs/explorations/core-import-orchestrator.md` (protocol, duplicate detection as a phase-1 requirement, 5-handler roadmap).
- **plugin-git-sync exploration.** `docs/explorations/plugin-git-sync.md` (5-phase plan PGS-01..PGS-05).
- **Plugin architecture patterns.** `docs/help/{de,en}/developers/plugins.md` captures the source-adapter vs format-parser split, two-registry pattern (ImportPlugin + RemoteSourceHandler), plugin-to-plugin path dependency, PluginForge-activation bridge. Includes a step-by-step write-first-plugin tutorial derived from PGS-01.
- **Article authoring exploration AR-01.** Validation log scaffold for the article/cross-post architecture decision; `docs/journal/article-workflow-observations.md` to fill from real workflows.
- **Import wizard field-selection help.** `docs/help/{de,en}/import/field-selection.md` walks through the Step 3 per-row include/exclude UX.
- **`.git/` adoption help.** `docs/help/en/import/git-adoption.md` covers the 3-way radio and security guarantees.
- **Protocol-location exploration resolved.** `ImportPlugin` protocol stays in Bibliogon (not PluginForge) until at least one non-WBT plugin implements it.

### i18n

- **192 new `ui.import_wizard.*` keys across 8 languages** (upload/detect/preview/execute/error strings, duplicate banner, 32 field-selection rows, covers + author-assets blocks, 16 git-adoption strings).
- **114 git-feature strings machine-translated** for ES, FR, EL, PT, TR, JA (git backup + SSH + conflict resolution first surfaced in v0.21.0 with DE/EN only).
- **Parity test** (`test_i18n_parity`) pins that every key present in `de.yaml` exists in the other 7 languages.
- **Settings plugin description prefix drift closed** across all 8 languages.

### Tests

- **Backend +300 tests.** Net increase: ~730 → 1000+. Core import orchestrator (90+), CIO-07 inspector (23) + adopter (12) + execute-adopt (13) + backfill (7), CIO-06 field-selection (32+), CIO-08 multi-cover (5) + author-assets (6) + CSS/cover propagation (5), WBT handler (20+), duplicate flows + overrides + source-ids (18), git-URL plugin (23), markdown folder (14).
- **Frontend Vitest +38.** 475 → 513. Wizard step components, PreviewPanel sections (covers, author-assets, git adoption, author datalist), `useAuthorChoices`, `AuthorAssetsPanel`, metadata editor author+language fields, ExecutingStep 5-arg call.
- **Playwright smoke:** new fixtures + `.bgb` import happy path + git URL import happy path.

## [0.21.0] - 2026-04-22

Git-based backup is the headline feature: per-book git repos, remote push/pull with encrypted PATs, SSH key generation, 3-way merge with per-file conflict resolution, and Markdown side-files for readable diffs. Closes all four SI-01..04 ROADMAP items. Plus two new AI editor modes, a Settings refactor, CSS zoom fixes, and a full security sweep across the stack.

### Added

**Git-based backup (SI-01..04, full 5-phase plan shipped)**
- **Phase 1 — local git per book.** `POST /api/books/{id}/git/init` creates `.git` under `uploads/{book_id}/` and records a first commit; `/git/commit` writes current book state (TipTap JSON per chapter plus `config/metadata.yaml`) and commits with a user-supplied message; `/git/log` returns history; `/git/status` reports clean/dirty + HEAD. Frontend `GitBackupDialog` in a new sidebar entry. Layout matches [write-book-template](https://github.com/astrapi69/write-book-template) conventions (manuscript/{front-matter,chapters,back-matter}, config/metadata.yaml, `.gitignore` for audiobook + output + temp).
- **Phase 2 — remote push/pull (HTTPS+PAT).** `/git/remote` (POST/GET/DELETE), `/git/push`, `/git/pull`, `/git/sync-status`. PAT encrypted at rest via `credential_store` (Fernet), never returned in API responses, injected via one-shot URL reset around each push/fetch so the token never lands in `.git/config` (regression test `test_pat_never_appears_on_disk_in_git_config`). Sync badge in the dialog + sidebar dot for SI-04 remote-ahead/diverged states.
- **SI-01 Accept Remote / Accept Local.** Dedicated in-dialog resolution panel on push rejection: Merge, Force push (with native confirm dialog), or Cancel. Backend `push(force=True)` support with regression test `test_force_push_overrides_diverged_remote`.
- **Phase 3 — SI-03 SSH key generation.** `POST /api/ssh/generate` produces an Ed25519 keypair in OpenSSH format via the existing `cryptography` dep (no paramiko, no subprocess). Private key 0600 under `config/ssh/id_ed25519`. `GET /api/ssh`, `GET /api/ssh/public-key`, `DELETE /api/ssh`. `SshKeySection` in Settings > Allgemein with generate / copy / delete + overwrite-confirm flow. `git_backup` auto-wires `GIT_SSH_COMMAND` with `IdentitiesOnly=yes` + `StrictHostKeyChecking=accept-new` when the remote URL is SSH and a key exists.
- **Phase 4 — SI-02 conflict analysis + per-file resolution.** `GET /git/conflict/analyze` classifies diverged state as simple (disjoint file changes) or complex (overlap) and lists per-side files. `POST /git/merge` attempts a 3-way merge (auto-commits on simple, leaves in-progress on complex); `POST /git/conflict/resolve` accepts `{path: "mine"|"theirs"}` and completes the merge; `POST /git/conflict/abort` rolls back. Two-mode in-dialog UI: merge/force choice → per-file radio picker with Apply/Abort.
- **Phase 5 — Markdown side-files.** Every commit writes a `.md` next to each chapter `.json` via the export plugin's `tiptap_to_markdown` (lazy-imported, failure-tolerant). JSON stays canonical; Markdown is advisory for readable `git log` / `git diff`.
- **Help docs.** `docs/help/{de,en}/git-backup/{basics,remote,ssh}.md` register under a new top-level "Git-Sicherung" nav entry.

**AI editor modes**
- **`fix_issue` AI mode for quality findings.** From the Quality tab, clicking a metric (Füll %, Passiv %, Adv %, Lange Sätze) jumps to the first matching finding; StyleCheck decorations paint every finding so context is visible.
- **Quality-tab navigate-to-first-issue.** Per-chapter metrics clickable — jump the editor to the chapter + finding in one click.

### Changed

- **Settings: KI-Assistent is its own tab.** AI provider config (enable, provider, base URL, model, temperature, max tokens, API key, test-connection) moved from the Allgemein tab into a dedicated tab between Allgemein and Autor. `AiAssistantSettings` saves via partial PATCH `/api/settings/app`; Allgemein stays focused on app/ui/plugins/editor. New i18n key `ui.settings.tab_ai` in all 8 languages.
- **Reactive word/character count in editor status bar** via `useEditorState` (idiomatic TipTap React pattern) instead of inline `editor.storage` reads. Partial fix for issue #12; the Playwright smoke test for keyboard-type reactivity remains skipped (deeper TipTap `useEditor` subscription timing issue).
- **Unified Radix tab-list CSS class.** `.radix-tab-list` (undefined class, relied on inline styles) removed; everything now uses `.radix-tabs-list` with `overflow-x: auto; white-space: nowrap;` baked into the shared rule. Removes the invisible-undefined-class footgun.

### Fixed

- **Main page overflowed viewport at 150% CSS zoom** (issue #11). html/body/#root now get explicit height + overflow constraints; document itself no longer scrolls under zoom. Re-enabled `e2e/smoke/chapter-sidebar-viewport.spec.ts:337`.
- **Chapter sidebar dropdown escaped viewport at 125/150% CSS zoom** (issue #10). `collisionPadding` widened asymmetrically on the bottom (`{top: 16, bottom: 280, left: 16, right: 16}`) so Radix Popper reserves enough layout-space buffer that the zoom-scaled dropdown fits the viewport. Re-enabled both loop variants of `chapter-sidebar-viewport.spec.ts:290`.
- **Scroll regression on non-editor pages** (from the #11 fix). The initial change applied `overflow: hidden` to `#root` too, which broke scroll on Settings, Dashboard, GetStarted, Help. Split the rule: html+body keep `overflow: hidden` (preserves the zoom assertion), `#root` gets `overflow-y: auto` for pages without their own scroll container.

### Security

- **Backend CVE sweep.** 13 CVEs across 3 packages cleared via transitive upgrades:
  - `aiohttp` 3.13.3 → 3.13.5 (fixes 10 CVEs: CVE-2026-22815, CVE-2026-34513..34520, CVE-2026-34525)
  - `pygments` 2.19.2 → 2.20.0 (fixes CVE-2026-4539)
  - `starlette` 0.46.2 → 1.0.0 (fixes CVE-2025-54121, CVE-2025-62727; major bump transparent to Bibliogon code)

  `pip-audit` post-upgrade: 0 vulnerabilities.
- **`pip-audit` added as backend dev dependency.** Enables CVE auditing parity with frontend `npm audit`. Usage: `cd backend && poetry run pip-audit`.
- **Frontend SEC-01 tracked.** 4 high-severity vulns in the `vite-plugin-pwa → workbox-build → @rollup/plugin-terser → serialize-javascript` dev-dep chain. All dev-only (0 in production bundle). `workbox-build` pins `@rollup/plugin-terser: ^0.4.3` and has not released since 2025-11; patched serialize-javascript 7.0.5 exists but is unreachable from the chain's current cap. Deferred with monthly re-audit cadence. Documented in ROADMAP SEC-01.

### Chore

- **Node.js 22 → 24 LTS.** New `.nvmrc`, `engines.node >=24.0.0` in `frontend/package.json` and `e2e/package.json`, `frontend/Dockerfile` to `node:24-slim`, CI workflows (`ci.yml`, `coverage.yml`) to `node-version: "24"`. Node 24 Active LTS until April 2028.
- **GitPython 3.1.46 added** to the backend (BSD licensed) for the Git-based backup feature. `git` binary now installed alongside `pandoc` in the backend Dockerfile.

### Documentation

- **Git-based backup exploration + help pages.** `docs/explorations/git-based-backup.md` (8 architectural decisions, Bibliogon-adapted repo layout, 5-phase plan). Per-phase help pages at `docs/help/{de,en}/git-backup/{basics,remote,ssh}.md` registered under a new "Git-Sicherung" nav entry with icon `git-branch`.
- **TipTap 3 migration pre-audit** at `docs/explorations/tiptap-3-migration.md`. Blocker: `@sereneinserenade/tiptap-search-and-replace` v0.2.0 merged on upstream main (TipTap 3 dual support, MIT) but not yet npm-published. Upstream issue filed: sereneinserenade/tiptap-search-and-replace#19. Fallback path documented: `prosemirror-search` adapter (~50-80 LOC).
- **Article authoring exploration** at `docs/explorations/article-authoring.md` (deferred pending 4-week validation log of actual publishing workflow).
- **Numeric-claims verification rule** in `.claude/rules/ai-workflow.md`: every numeric claim in docs/commits/reports requires running the authoritative command in the same session. Exists because the v0.19.1 article and v0.20.0 journal both reported stale plugin test counts.
- **Lesson on viewport vs app-container CSS rules** in `.claude/rules/lessons-learned.md` (captured from the `ef7ce5c` → `c25483e` fix + regression + split-rule sequence).

### Tests

- **+56 backend tests:** Phase 1 git-backup (19), Phase 2 remote (13), Phase 3 SSH (20), Phase 4 conflicts (11), Phase 5 Markdown side-files (4), force-push regression (1). Backend 638 → 707.
- **+22 Vitest tests** for the quality-tab navigate + fix_issue AI mode (`QualityTab.test.tsx`, `fix-issue-prompts.test.ts`). Vitest 405 → 427.
- **Playwright smoke unchanged**: 169 passed / 1 skipped. Git-backup UI smoke coverage deferred to v0.21.1.

## [0.20.0] - 2026-04-20

AI Review Extension is the headline feature. The existing chapter review grows from a single sync path into a three-mode async flow with persistent Markdown reports, cost estimates, and full 8-language prompt parity. Three real backend bugs in backup / batch export / smart-import are fixed along the way. Playwright smoke suite drops from 31 failures to zero.

### Added

**AI Review Extension**
- Three primary focus modes in the Editor's AI panel: **Style**, **Consistency** (new; within-chapter contradictions, distinct from the legacy `coherence` focus), **Beta Reader** (new; open-ended simulated first-read feedback). Mutually exclusive radio buttons; the four legacy focus values stay on the API for power users but no longer appear in the UI.
- Async review flow: `POST /api/ai/review/async`, `GET /api/ai/jobs/{id}`, `GET /api/ai/jobs/{id}/stream` (SSE), `DELETE /api/ai/jobs/{id}`. Rotating book-language status messages during the 5-60s job while the editor stays usable.
- Persistent Markdown reports under `uploads/{book_id}/reviews/{review_id}-{chapter-slug}-{YYYY-MM-DD}.md`. `GET /api/ai/review/{id}/report.md?book_id=...` returns a `FileResponse`. Download button on the result panel.
- Cascade delete on chapter removal wipes matching review files.
- Chapter-type-aware prompts for all 31 `ChapterType` values; `ReviewRequest` gains `chapter_type`; the legacy sync `POST /api/ai/review` threads it through the same builder.
- Non-prose warning above the Start button for 12 chapter types (`title_page`, `copyright`, `toc`, `imprint`, `index`, `half_title`, `also_by_author`, `next_in_series`, `call_to_action`, `endnotes`, `bibliography`, `glossary`), rendered in the book's language.
- Token + USD cost preview on the Start button (`POST /api/ai/review/estimate`, chars/4 heuristic + small per-model pricing dict).
- `GET /api/ai/review/meta` exposes UI focus values, primary focus list, non-prose types, supported languages, chapter types so the frontend avoids hardcoding.
- Full 8-language prompt parity via a shared `LANG_MAP`; marketing prompt builder re-uses the same map.
- New `backend/app/ai/prompts.py`, `pricing.py`, `review_store.py`. Thin `routes.py`.
- i18n: six new UI keys per language x 8 languages.

**Tests**
- 31 new backend tests (AI review extended + cascade + store utilities).
- 9 regression tests pinning the three backend fixes.
- 8 frontend Vitest tests for 8-lang strings + non-prose-set parity.
- 4 Playwright smoke tests for the AI review UI.
- 16 smoke test-infra fixes (selector narrowing, seed corrections, timing tolerances, testid coverage, assumption refreshes).

### Fixed

- **`backup_import` now restores soft-deleted books** instead of silently skipping. Dedup check predated the trash feature. Fix: hard-delete the stale row + its chapters + assets, then fall through to the fresh-insert path.
- **Batch export no longer raises `FileNotFoundError`**. `plugin-export.export_batch_route` collected per-format paths across a loop, but manuscripta's `run_export` moves `project/output/` to `project/backup/` on every call. Fix: copy each format's output into a stable `tmp_dir/batch/` staging dir before the next `run_pandoc`.
- **`smart-import` handles Pandoc-wrapped `metadata.yaml`**. `safe_load` rejected the multi-document stream (`---` / `---` markers); fix uses `safe_load_all` + first non-empty document.
- **Launcher release workflows** inherit the v0.19.1 permissions fix; tag push attaches Windows / macOS / Linux binaries as release assets.

### Changed

- `POST /api/ai/review` (sync) accepts `chapter_type`; backward-compatible default `"chapter"`.
- `_build_review_system_prompt` is a thin alias for `prompts.build_review_system_prompt` (existing test imports keep working).
- Classic palette first-line indent override uses `h* + p:not(:first-child)` to beat the base rule's specificity.
- CreateBookModal Radix Select trigger gains `data-testid="create-book-author-select"`.

### Documentation

- AI help pages (`docs/help/{de,en}/ai.md`) rewrite the Chapter Review section with focus-mode guidance, non-prose warning, cost estimate, async progress, persistence + download.
- `docs/API.md` documents the 8 new `/api/ai/` endpoints.
- `.claude/rules/lessons-learned.md` adds 7 pitfalls from the release window.
- `docs/audits/current-coverage.md` gets a v0.20.0 addendum with the +181 test delta.
- Medium blog post for v0.19.1 archived under `docs/blog/`.

### Known pending post-release

4 Playwright smoke skips tracked in GitHub issue #9: three chapter-sidebar dropdown / layout tests at 125% + 150% CSS zoom, one editor word-count test (TipTap useEditor transaction re-render). Deferred major dependency bumps: elevenlabs 0.2 -> 2.43, starlette 0.46 -> 1.0, rich 14 -> 15. Pillow 12 still blocked upstream by manuscripta.

## [0.19.1] - 2026-04-20

Maintenance release. Two user-visible fixes (i18n labels, backup resource leak), launcher release-workflow unblocked, and a substantial code-hygiene sweep (ruff + mypy + pre-commit wired into CI). No schema changes, no API breakage.

### Fixed
- **Front Matter / Back Matter labels translated.** The two section headers in the BookEditor chapter sidebar were hardcoded English strings. Now pulled from `ui.editor.front_matter` / `back_matter` in all 8 i18n YAMLs.
- **Backup: zip file handle leak in `smart_import`.** The zip handle was not closed on all code paths, keeping the file locked on Windows and leaking file descriptors on long-running backends. Explicit `close()` in a `finally` block.
- **Launcher release workflows granted `contents: write`.** `softprops/action-gh-release@v2` was failing with "Resource not accessible by integration" on tag pushes because the default `GITHUB_TOKEN` is read-only. All three launcher workflows (Linux, macOS, Windows) now declare `permissions: contents: write` at top level. Tagged releases publish the prebuilt launcher binaries + SHA256 checksums as release assets.

### Changed
- **Dependency bump: react-router-dom to ^7.14** (DEP-03). Backward-compatible minor within the v7 line.

### Internal
- **ruff configured and applied** across the backend; conservative rule set plus whole-tree auto-fix sweep.
- **mypy errors closed.** 14 pre-existing `[no-any-return]` and `[import-untyped]` errors fixed without loosening the type-checker config.
- **pre-commit installed and enforced.** Whole-tree formatter sweep landed as a single commit; every subsequent commit must pass the hook stack.
- **CI jobs for pre-commit + ruff + mypy** in `.github/workflows/ci.yml`.
- **release-workflow Step 5** uses `poetry run` for `ruff check` / `mypy` (docs fix).

### Tests
- **Licensing: full unit coverage** for `app.licensing` (payload, signatures, expiry edges, wildcard plugin `*`).
- **Backup: direct unit tests** for archive, asset, markdown utility modules.
- **Backup: persistence + HTTP route coverage** for `backup_history`.
- **Async event-loop hygiene** in backend tests — `asyncio.run()` replaces manual loop construction.
- **Frontend sanitizer test** no longer sets an iframe `src` (silences happy-dom fetch warning).

### Docs
- Exploration docs for AI review extension architecture and the children's-book plugin (architecture finalized, implementation deferred).
- Audit docs — backup_history + backup utils coverage gaps closed; polish audit 2026-04-18 captured; placeholder hashes replaced with real hashes.
- Roadmap — conflict-dialog "Save as new chapter" TODO promoted to PS-13.
- Session journals backfilled for April 1–12; gitignore aligned with ai-workflow.md so journals are actually committed.
- DEP-09 still blocked on vite-plugin-pwa compat.

### Known pending post-release

Playwright smoke suite: 135 passed / 31 failed. Three-sample triage (content-safety, dashboard-filters, editor-formatting Ctrl+Z) classified all three as test-infrastructure drift or latent test-code bugs that predate v0.19.1 — no user-visible regressions identified. Full triage of the remaining 28 failures tracked in GitHub issue #9, mandatory before v0.20.0. `make test` (backend 598 + Vitest 397 + tsc + ruff + mypy + pre-commit) remains the authoritative release gate and is all green.

## [0.19.0] - 2026-04-18

Content safety is the headline of this release. A silent data-loss path in autosave (status flipped to "saved" and the IndexedDB draft was deleted before the server round-trip completed) is closed, and the whole save pipeline is hardened against tab crashes, offline outages, concurrent edits from a second tab, and accidental overwrites. Plus the donation-integration S-series (Liberapay, GitHub Sponsors, Ko-fi, PayPal) and an MkDocs restructure that finally gives macOS and Linux launcher users proper documentation.

### Added

**Content safety**
- **Autosave awaits server acknowledgment.** The Editor's save-status indicator no longer flips to "saved" and the IndexedDB draft is no longer deleted before `onSave` resolves. On failure the status stays in `error` and the draft is retained as the safety net.
- **Save-failure toast with retry.** On network / server error the user sees a dismissible toast with a Retry button that re-triggers the save immediately. The IndexedDB draft is preserved until the retry succeeds.
- **`beforeunload` / `pagehide` / `visibilitychange` flush.** New `useFlushOnUnload` hook registers all three events. On tab close / mobile background / iOS pagehide the pending debounce is cancelled, the current content is written to IndexedDB via Dexie's transaction queue (which survives the tab dying), and a best-effort `fetch(..., {keepalive: true})` PATCH is attempted.
- **Offline detection with reconnect flush.** New `OfflineBanner` (mounted globally in `App.tsx`) watches `navigator.onLine`. While offline, save failures suppress the retry toast (the banner is authoritative). On reconnect, `syncAllDrafts` iterates every IndexedDB draft, fetches the current server version, PATCHes the content with the correct version, and toasts a summary ("Kapitel synchronisiert: N" or `sync_partial` if any failed).
- **Optimistic locking on PATCH /chapters.** New `Chapter.version` column (Alembic migration `e1f2a3b4c5d6`), required `version` field on `ChapterUpdate`, 409 with structured detail `{error, message, current_version, server_content, server_title, server_updated_at}` on mismatch. The backend bumps `version += 1` on every successful write.
- **Conflict resolution dialog.** New `ConflictResolutionDialog.tsx` shows a side-by-side preview of local vs server content on 409. Two primary actions: "Meine Änderungen behalten" (force-save with the new server version) and "Meine Änderungen verwerfen" (pull the server version into the editor).
- **`chapter_versions` table with restore flow.** New table (Alembic migration `f2a3b4c5d6e7`) stores an immutable snapshot of the pre-update content on every successful PATCH. Retention policy: last 20 per chapter, trimmed after each insert. Three new endpoints: `GET /api/books/{bid}/chapters/{cid}/versions`, `GET /api/books/{bid}/chapters/{cid}/versions/{vid}`, `POST .../restore`. Frontend: "Versionsverlauf" entry in the chapter context menu opens `ChapterVersionsModal` with a scrollable list and per-entry Restore button. Restore snapshots the current state before overwriting so nothing is lost.
- **AbortController per-chapter save dedup.** `api.chapters.update` aborts any prior in-flight save for the same chapter before starting a new one. Aborts surface as a new `SaveAbortedError` class that the Editor treats as a no-op. Latest save always wins; no more races between rapid keystrokes.
- **SQLite PRAGMA on every connection.** SQLAlchemy event listener enables `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`. WAL unblocks concurrent readers during background jobs; `foreign_keys=ON` is a correctness fix (ON DELETE CASCADE was silently ignored without it); NORMAL sync removes per-commit fsync. **Side effect: `make test` runtime dropped from ~2:03 to ~15s** on the reference machine.
- **12 new backend tests** (`test_chapter_versioning.py`, `test_database_pragma.py`) covering the optimistic-lock happy path, the 409 detail shape, the `version`-required 422, `updated_at` bumps, snapshot creation on PATCH, retention at exactly 20 per chapter, the restore endpoint's overwrite + snapshot contract, PRAGMA WAL / synchronous=1 / foreign_keys=1.
- **15 new frontend Vitest tests** (`useOnlineStatus`, `useFlushOnUnload`, `ConflictResolutionDialog`) pinning the online/offline transitions, the three-event flush contract, and the conflict-dialog callback invariants.
- **Two Playwright E2E specs** (`e2e/smoke/content-safety.spec.ts`): tab-crash recovery via IndexedDB seeding and `offline → online` flush via `context.setOffline()`.

**Donation integration (S-series)**
- **S-01 Support Settings tab.** New `SupportSection.tsx` rendered as a conditional 4th Radix tab in `Settings.tsx`. Shows one card per channel with name, optional "Recommended" star (Liberapay), localised description, and an external-link button (`target="_blank"`, `rel="noopener noreferrer"`). `donations.enabled: false` in `app.yaml` hides the entire tab; `landing_page_url` collapses the UI to one primary button.
- **S-02 One-time onboarding dialog.** New `DonationOnboardingDialog.tsx` mirroring the AiSetupWizard pattern. Trigger: Dashboard's book-creation handler, gated on `books.length === 0` BEFORE the create and the `bibliogon-donation-onboarding-seen` localStorage flag being unset. Every dismiss path sets the flag; two-step UX falls back to a channel list when `landing_page_url` is null.
- **S-03 90-day reminder banner.** New `DonationReminderBanner.tsx` + pure `shouldShowReminder` helper. Shown at the top of the Dashboard when all of: donations enabled, onboarding seen, `bibliogon-first-use-date` at least 90 days old, `bibliogon-donation-reminder-next-allowed` missing or in the past. Dismiss paths: "Support the project" sets a 180-day cooldown, "Not now" / close-X set 90 days. Never during an editor/export session (Dashboard is a separate route).
- **Donation config** in `backend/config/app.yaml.example` with `enabled` kill switch, `landing_page_url` override, and the four active channels (Liberapay, GitHub Sponsors, Ko-fi, PayPal). Not editable via the Settings UI; project-level YAML only.
- **Help page** `docs/help/{de,en}/support.md` registered in `_meta.yaml` with `heart` icon. Channel descriptions, FAQ covering tax-deductibility, anonymity per platform, recurring vs one-time, how to cancel, why no direct bank transfer. Top-level nav entry (15 entries total).
- **i18n for all 8 languages** (`ui.donations.*`: tab, section_title, intro, recommended_badge, support_button, understood_button, not_now_button, onboarding_title / body / hint, reminder_body, reminder_close, 4 channel descriptions).

**Documentation**
- **MkDocs installation restructure.** New top-level "Installation" nav section with five children: Overview landing page, Windows Launcher (existing, harmonised), macOS Launcher (new), Linux Launcher (new), and Uninstall (pulled into the section). URLs preserved via flat slug structure: `/launcher-windows/` still works, plus new `/launcher-macos/`, `/launcher-linux/`, `/installation/`. Top-level nav count stays at 14 (Installation replaces the standalone "Windows Launcher" entry).
- **macOS launcher page** covers arm64-only builds, the right-click → Open Gatekeeper bypass, the `xattr -d com.apple.quarantine` fallback, `shasum -a 256` verification, the `~/Library/Application Support/bibliogon/` config dir.
- **Linux launcher page** covers glibc 2.35+ requirement, Docker group setup, `chmod +x`, `sha256sum`, the optional `python3-tk` runtime, `~/.config/bibliogon/` config dir.
- **mkdocs.yml nav regenerated** from `_meta.yaml`. The committed nav was stale against the meta file and missing templates, ai, themes, and developers/plugins entries that had been added since v0.17.0.

### Changed
- **PATCH /chapters is a breaking API change** for any client that does not send `version`. The schema rejects missing `version` with 422 (Pydantic). Backend test helpers and the frontend `api.chapters.update` signature were both updated; any third-party caller must add `version` or pre-fetch the chapter first. The `OfflineBanner` reconnect flush already does a GET before each PATCH to read the server-side version.
- **`api.chapters.update` is now async with abort semantics.** New `SaveAbortedError` exported from `frontend/src/api/client.ts`. Callers should treat it as a no-op (the Editor already does).

### Fixed
- **Chapter Rename rejected stale version** silently before - it followed the same last-write-wins path as chapter content. With optimistic locking in place, the rename handler catches `SaveAbortedError` from the dedup layer and suppresses the "Rename failed" toast on abort (rapid-rename races).

### Known pending post-release

A UI smoke-test session is scheduled to cover three areas on the running app:
- DEP-01 / DEP-04 partial / DEP-07 zero-touch upgrades carried over from v0.18.0 (GitHub issue #5)
- S-01 / S-02 / S-03 donation UI surfaces (GitHub issue #5 mentions this too but the primary tracker is this CHANGELOG)
- Content safety: Playwright recovery and offline specs plus a manual checklist for the 5 UX paths that E2E cannot cover cleanly (GitHub issue #8)

Automated coverage is in place (530+ backend + 400+ Vitest tests, all green) but multi-tab 409 conflict, beforeunload-on-tab-close, mobile Safari pagehide, and the version-history restore modal need human eyes before v0.19.0 gets a clean bill of health.

## [0.18.0] - 2026-04-18

Templates are the headline feature: reusable book and chapter structures, with 5 book builtins and 4 chapter builtins seeded at startup, covering front-matter, back-matter, and specialised content types. Three major frontend dependency upgrades landed cleanly (React 18 -> 19, Vite 6 -> 7, TypeScript 5 -> 6, lucide-react 0 -> 1) with every automated check green; a dedicated UI smoke-test session is scheduled post-release. Plugin YAML saves no longer silently strip comments.

### Added
- **Book templates (TM-01, TM-02, TM-03, TM-05).** `BookTemplate` + `BookTemplateChapter` tables (Alembic migration `b7c8d9e0f1a2`), `/api/templates/` CRUD with `is_builtin` enforcement (403 on PUT/DELETE to builtins, 409 on duplicate name), 5 new `ChapterType` values (`half_title`, `title_page`, `copyright`, `section`, `conclusion`), and 5 builtins seeded idempotently at startup: Children's Picture Book, Sci-Fi Novel, Non-Fiction / How-To, Philosophy, Memoir. Frontend: `CreateBookModal` gains a Radix Tabs "Blank / From template" toggle; `POST /api/books/from-template` creates the book + all chapters in a single commit. Save-as-template action in the `ChapterSidebar` footer with empty-placeholder vs preserve-content modes. User templates have a trash-icon delete; builtins show a "Built-in" lock badge.
- **Chapter templates (TM-04).** `ChapterTemplate` table (migration `c8d9e0f1a2b3`), `/api/chapter-templates/` CRUD, 4 builtins seeded as TipTap JSON: Interview, FAQ, Recipe, Photo Report. "From template..." entry in the new-chapter dropdown opens `ChapterTemplatePickerModal`; "Save as template" entry in each chapter's ContextMenu opens `SaveAsChapterTemplateModal` (same empty/preserve content choice). Mirrors the book-template UX and 403/409 behavior.
- **Templates i18n.** All template UI strings localised to the 8 supported languages (DE, EN, ES, FR, EL, PT, TR, JA).
- **Coverage workflow on CI.** `.github/workflows/coverage.yml` runs on every push to main and every PR. Uploads HTML + XML coverage artifacts (14-day retention) for backend, all plugins, and frontend. `make test-coverage` is an explicit opt-in local target; `make test` stays fast and coverage-free.
- **PS-09: CI plugin matrix expansion.** `ci.yml` and `coverage.yml` matrices extended to include audiobook + translation alongside the original five. Initial coverage: audiobook 63%, translation 43%.
- **Help + Getstarted plugins now in CI matrix.** 36 previously-orphaned plugin tests (help 30, getstarted 6) are now run by `make test` and the CI plugin matrix. `pytest-cov` added to both plugins; `httpx` added to help for `starlette.TestClient`.
- **Templates help content (PS-08).** New `docs/help/{de,en}/templates.md` pages registered in `_meta.yaml`, plus 6 new FAQ entries in `backend/config/plugins/help.yaml` (DE + EN). Two stale "21 chapter types" FAQ answers refreshed to 31 with the new types listed.
- **YAML round-trip tests (PS-11).** 5 unit tests in `backend/tests/test_yaml_io.py` pinning byte-identical round-trip, `# INTERNAL` comment preservation, quote-style preservation, error handling, and parent-directory creation. Plus 1 HTTP-level integration test in `test_settings_api.py` (`test_update_preserves_comments_and_formatting`) that pins the same behavior through `PATCH /api/settings/plugins/{name}`.
- **Coverage audit refresh.** `docs/audits/current-coverage.md` regenerated for v0.18.0. Deltas since 2026-04-13 baseline: +44 backend tests, +65 plugin tests (+36 once help/getstarted joined the matrix), +28 Vitest, +105 E2E. 4 of 5 previously-open E2E gaps closed this cycle.

### Changed
- **React 18 -> 19 (DEP-01).** `react`, `react-dom`, `@types/react`, `@types/react-dom` bumped to `^19.2.0`. No code changes required: the codebase was already on `createRoot` and has no `forwardRef`/`defaultProps`/`PropTypes`/`findDOMNode`/legacy lifecycle usage. All peer deps (TipTap 2.27.2, react-router-dom 6, react-toastify 11, react-markdown 10, lucide-react, @dnd-kit, Radix) accept React ^19.
- **Vite 6 -> 7 + TypeScript 5 -> 6 + @vitejs/plugin-react 4 -> 5 (DEP-04 partial).** Vite 7 brings a Node floor of 20.19+/22.12+ (CI's Node 22 is fine; local dev must now use Node 22+). TypeScript 6 no longer auto-includes every `@types/*` in node_modules, so `@types/node` is now explicit in `package.json` and `tsconfig.json` gets `"types": ["node", "vite/client"]`. Vite 8 is deferred to DEP-09: `vite-plugin-pwa@1.2.0` (the current latest) still lists peer deps through Vite 7 only.
- **lucide-react 0.468 -> 1.8.0 (DEP-07).** Zero-touch upgrade: the only breaking change in 1.0 was removal of 13 brand icons (GitHub, Slack, Chromium, etc.) and Bibliogon uses only semantic UI icons. Bonus: UMD format dropped (smaller bundle), `aria-hidden` auto-added on icons for a11y.
- **Plugin YAML writes preserve comments and formatting.** The settings API (`PATCH /api/settings/plugins/{name}`), plugin install, audiobook config, and license routes all swapped from PyYAML's `yaml.dump` (which silently strips comments, blank lines, quote styles) to a shared ruamel.yaml round-trip helper in `backend/app/yaml_io.py`. A save from the UI now leaves `# INTERNAL` markers and formatting intact.
- **Dashboard theme toggle placement.** The `ThemeToggle` icon moved from an isolated spot next to "Neues Buch" into the rightmost position of the header icon cluster (after Trash). Mobile hamburger gets a matching Sun/Moon entry.
- **CLAUDE.md.** Chapter-type count bumped 26 -> 31; BookTemplate and ChapterTemplate entries added to the Data model section; Commands block now documents `make test-coverage`.

### Fixed
- **Spanish accents restored across plugin YAMLs (PS-11).** `translation.yaml`, `kinderbuch.yaml`, `kdp.yaml`, and `audiobook.yaml` had missing diacritics in their Spanish `display_name`/`description` strings (`Traduccion`, `pagina`, `validacion`, `publicacion`, `Generacion`, `capitulos`). Corrected to the proper forms.
- **Pre-existing TS error in `SaveAsTemplateModal.test.tsx`.** The mocked `ApiError` constructor only accepted 2 args while the real class requires 4-6, causing `tsc --noEmit` to fail silently. Mock signature widened to match the real class.
- **PS-10 unused-parameter warning in `_check_license`.** The `plugin_config` parameter in `backend/app/main.py` was never read but had to stay in the signature for pluginforge's `pre_activate` hook contract. Renamed to `_plugin_config`.

### Known pending post-release

A dedicated UI smoke-test session is scheduled after v0.18.0 ships to verify DEP-01 (React 19), DEP-04 partial (Vite 7 + TS 6), and DEP-07 (lucide 1.x) on the running application. These are verified by the automated test suite (tsc clean, 351 Vitest tests green, `vite build` + PWA regen clean) but browser-level visual regression testing has not been performed. Report any rendering or interaction issues via the bug-session workflow.

## [0.17.0] - 2026-04-17

Distribution is now one-click on Windows, macOS, and Linux. The Bibliogon launcher handles install, uninstall, Docker lifecycle, and update notifications without any terminal step. Dependency currency restored with the manuscripta 0.9.0 upgrade.

### Added
- **One-click launcher install (D-01, D-02, D-03).** The Windows `.exe`, macOS `.app` bundle (arm64), and Linux PyInstaller binary now handle the full distribution flow: folder picker, ZIP download from GitHub Releases, extraction, `.env` generation, `docker compose up --build -d`, health check, and browser open. No Git Bash or terminal required. Manifest at `install.json` tracks installation state; corrupt or missing file is treated as "not installed, show install UI". Tests: 142 launcher tests.
- **One-click launcher uninstall.** Confirmation dialog, `docker compose down`, dynamic volume + image removal via `docker volume ls --filter name=bibliogon` / `docker images --filter reference=*bibliogon*`, directory removal, manifest deletion. All Docker operations are best-effort (no Docker running = skip that step, never abort). `uninstall.sh` script ships as the CLI-based alternative.
- **Pending cleanup retry.** If uninstall is interrupted mid-flight (process killed, Docker locked files, power loss), the launcher writes `cleanup.json` at the start and marks each step `true` as it completes. On next launch, the launcher silently retries each step still marked `false`. A one-time warning fires only if `rmtree` still fails (the user may need to delete the directory manually).
- **Activity log with rotation.** All launcher events (install, uninstall, Docker ops, errors) write to `install.log` in the platformdirs config dir via `RotatingFileHandler` (1 MB max, 1 backup). Legacy `launcher.log` under `APPDATA/Bibliogon/` is kept for backward compatibility.
- **Auto-update check (D-04).** Background daemon thread polls `https://api.github.com/repos/astrapi69/bibliogon/releases/latest` on every launcher start, compares against the installed version in `install.json`, and shows a three-button dialog (Open release page / Dismiss / Don't check for updates) when a strictly newer release is available. All failures are silent (network, timeout, rate limit, malformed response). Stdlib-only (urllib + threading). 21 tests.
- **Settings dialog with opt-out.** Settings button in the main launcher UI opens a dialog with an `auto_update_check` checkbox (default on). Persists to `settings.json` in the platformdirs config dir. The notification's "Don't check for updates" button also flips this setting. 17 tests covering defaults, corruption fallback, persistence, guard behavior.
- **macOS CI workflow (D-02).** `launcher-macos.yml` runs on `macos-14`, generates `bibliogon.icns` via new `scripts/make_icns.py` + `iconutil`, builds the `.app` bundle from the cross-platform spec file, and produces `bibliogon-launcher-macos.zip` with SHA256. arm64-only for initial release; unsigned binary requires Gatekeeper bypass on first launch.
- **Linux CI workflow (D-03).** `launcher-linux.yml` runs on `ubuntu-22.04`, installs `python3-tk` before PyInstaller, builds a 13 MB ELF binary from the same spec file. No source changes were needed; the spec file was already cross-platform aware.
- **Distribution smoke test template.** `docs/manual-tests/distribution-smoke-test.md` now covers all 6 flows: install.sh, Windows launcher, launcher install/uninstall + cleanup retry + activity log, Linux binary, macOS .app, and `uninstall.sh`. GitHub issues #2, #3, #4 track the three pending platform smoke tests.

### Fixed
- **install.sh VERSION pin** (`cfcac6f`). The default was hardcoded to `v0.7.0`, an ancient release where the Docker build architecture was fundamentally different (`build: ./backend` context vs. current `context: .`). Fresh installs via `curl | bash` were cloning the wrong code and hitting plugin-path failures. Now pinned to `v0.16.0` / `v0.17.0`, bumped during each release cycle (added to `release-workflow.md` Step 4).
- **install.sh shallow clone update path** (`cfcac6f`). The "already installed, update" branch tried to surgically repair a shallow clone and failed on Windows Git Bash with "pathspec 'main' did not match". Replaced with delete-and-re-clone (preserving `.env` via a tempfile backup). Eliminates an entire class of git state edge cases.
- **Launcher lockfile NoneType crash on Windows** (`21e218e`). `tasklist` returned `stdout=None` on a Windows locale edge case, which made `str(pid) in result.stdout` raise `TypeError` and blocked every launcher start. Guard added on line 79 plus a fail-open wrapper around the whole check in `__main__.py`. New lessons-learned entry: diagnostic and convenience features should always fail open.

### Changed
- **manuscripta 0.8 -> 0.9.0**, which forced the `pillow` and `pandas` bumps:
  - **DEP-08 resolved:** Pillow 11 -> 12.2.0 (manuscripta 0.9.0 requires `pillow >=12.0`). Both bumped together since 0.9.0 won't resolve with Pillow 11.
  - **DEP-06 resolved:** pandas 2.3 -> 3.0.2 (transitive dep of manuscripta 0.9.0 requiring `pandas >=3.0`). tenacity 8.5 -> 9.1.4 came along as another transitive.
- **Docker config directory layout under `%APPDATA%\bibliogon\`** (Windows) / `~/.config/bibliogon/` (Linux) / `~/Library/Application Support/bibliogon/` (macOS): the launcher now writes `install.json`, `install.log` (+ `.log.1` rotation), `cleanup.json` (only during interrupted uninstall), and `settings.json`.

### Deferred (still tracked)
- D-03a AppImage for Linux (deferred; re-evaluate on missing-tkinter user reports)
- D-05 Full Windows installer (deferred until user feedback shows install friction)
- DEP-01 React 19, DEP-02 TipTap 3, DEP-03 react-router-dom 7, DEP-04 Vite 8 + TypeScript 6, DEP-05 elevenlabs SDK 2.x, DEP-07 lucide-react 1.x (all major bumps deferred to dedicated sessions)

## [0.16.0] - 2026-04-16

Audiobook export is now robust against cancellation and live-updates during generation. Dependency currency restored across the stack.

### Added
- **Audiobook incremental persistence:** each chapter MP3 is written to persistent storage immediately after generation, not at the end of the job. Cancelling a 30-chapter export at chapter 27 preserves all 27 completed chapters on disk and in the metadata view. Previously, cancellation lost every generated file.
- **Per-chapter audio status in book metadata:** the audiobook tab now shows every book chapter with its audio state - green check with duration and play/download for generated chapters, clock icon with "Nicht generiert" for pending chapters, warning banner for partial exports.
- **Four-mode regeneration dialog:** when re-exporting an audiobook, the user sees chapter classification counts (current/outdated/missing) and four radio choices: generate only missing, regenerate only outdated, generate missing and outdated (recommended default), or regenerate all. Content-hash sidecars detect edited chapters automatically.
- **Chapter classification endpoint:** GET /api/books/{id}/audiobook/classify compares current TipTap content hashes against persisted .meta.json sidecars to bucket chapters as current, outdated, or missing.
- **Real-time metadata updates via WebSocket:** new generic WebSocket hub (topic-based ConnectionManager at /api/ws/{topic}) broadcasts audiobook events (chapter_persisted, job_complete, job_failed). The metadata view subscribes via the new useWebSocket hook with auto-reconnect (exponential backoff, 10 retries).
- **Themed audiobook player:** custom-built player replaces bare HTML5 audio elements in the metadata view. Sticky bottom bar with play/pause, skip 15s, previous/next chapter, progress scrub (Radix Slider), time display, playback speed (0.75x-2.0x), volume, auto-advance toggle, and keyboard shortcuts (Space, arrows, 0-9, Escape). All themed via CSS variables across all 6 theme variants.
- **useDialog().choose() API:** multi-choice dialog variant in AppDialog for cases beyond binary confirm/cancel.
- **D-01 Windows Simple Launcher:** Python code, unit tests, PyInstaller spec, Windows CI workflow, placeholder icon, install guide (DE+EN). Smoke test pending Windows time slot - ships in v0.17.0.

### Fixed
- **Docker build for fresh installations:** Dockerfile now copies all plugins via glob instead of listing 4 by name. The 5 plugins added after the Dockerfile was written (audiobook, grammar, kdp, kinderbuch, translation) were missing from the build context, causing `poetry install` to fail on fresh `install.sh` runs.
- **Audiobook overwrite dialog:** replaced browser-native `window.confirm()` with the app's Radix-based AppDialog. Multi-line engine/voice/timestamp info now renders properly with `white-space: pre-line`.
- **Launcher first-run UX:** distinguished "never installed" from "installation moved" states. New users see a welcome dialog pointing to the install guide instead of a confusing folder picker.

### Changed
- **Dependency sweep:** Node.js 20 -> 22 LTS, Python Docker base 3.11 -> 3.12, FastAPI 0.115 -> 0.135, uvicorn 0.32 -> 0.44, Pydantic 2.0 -> 2.13, SQLAlchemy 2.0.0 -> 2.0.49, httpx 0.27 -> 0.28, pytest 8 -> 9, plus routine npm bumps (dompurify, vitest, happy-dom, jsdom). GitHub Actions upload-pages-artifact v3 -> v4.
- **Release workflow:** new Step 4b "Dependency currency check" runs `poetry show --outdated` and `npm outdated` before every release.
- **Deferred major bumps tracked:** DEP-01 through DEP-08 in ROADMAP.md for React 19, TipTap 3, react-router-dom 7, Vite 8, elevenlabs SDK, pandas 3, lucide-react 1.x, and Pillow 12 (blocked by manuscripta upstream).

## [0.15.0] - 2026-04-15

### Added
- **Onboarding wizard for AI provider setup (PS-02):** First-run flow that walks the user through provider selection, base URL, model, and connection test. Skippable; the existing Settings flow still works for power users.
- **Keyboard shortcuts customization with cheatsheet overlay (PS-03):** Editor and global shortcuts surfaced through a `?` cheatsheet, customisable per user via `~/.claude/keybindings.json`-style overrides on the bibliogon side.
- **Plugin developer documentation (PS-07):** EN and DE guides covering the plugin API, hook spec contract, packaging, ZIP install flow, and a worked example plugin walk-through.
- **Help docs:** AI integration user guide (EN + DE), shortcut/index/FAQ refresh for current feature set.

### Changed
- **manuscripta v0.7.0 -> v0.8.0 (PS-06):** Migrated `run_pandoc` to the new `run_export(source_dir=...)` entry point. Drops the `os.chdir(project_dir)` workaround and the `OUTPUT_FILE` module-global mutation in favour of explicit `output_file` / `no_type_suffix` kwargs. Strict-images mode is on by default; missing image files now surface as a structured 422 with the unresolved file list so the export toast names the missing files (DE + EN i18n; other locales fall back to EN until next sweep). Manuscripta's typed exception hierarchy (`ManuscriptaError`, `ManuscriptaImageError`, `ManuscriptaPandocError`, `ManuscriptaLayoutError`) is propagated through bibliogon's `MissingImagesError` / `PandocError.cause` so attribute access (`.unresolved`, `.returncode`, `.stderr`) survives all the way to the GitHub issue button.
- **Lazy chapter content loading and sidebar memoization (PS-04):** Large books (500+ pages, 100+ chapters) no longer pay the full chapter-content cost on initial load; the sidebar memoizes derived state so chapter switches no longer re-render the whole tree.
- **WCAG 2.1 AA improvements (PS-05):** Keyboard navigation, focus management, ARIA attributes, and contrast across the core editor and dashboard workflows.

### Fixed
- **PDF/DOCX silent image drop (CF-01, critical):** Imported books that referenced figures via `<img>` tags exported to PDFs and DOCX with zero embedded images, while EPUB output for the same book contained them. Bug present in every shipped version v0.1.0 through v0.14.0. Books authored natively in Bibliogon (TipTap-JSON storage) were unaffected. Root cause: `html_to_markdown` preserved `<figure>/<img>` as raw HTML, which Pandoc's LaTeX (PDF) and DOCX writers silently drop. Fix emits native Pandoc image syntax (`![caption](src "alt")`) so figures survive every output format. **If you have imported books and exported them to PDF or DOCX in earlier versions, re-export to verify your output contains all expected images.**
- **app.yaml first-run failure (PS-01):** Fresh installs failed at startup because `app.yaml` was not in the repo (gitignored). The backend now auto-creates `app.yaml` from `app.yaml.example` on first startup.

### Migration notes
- The manuscripta v0.7.0 -> v0.8.0 upgrade is non-breaking for end users; pin updates land in `plugins/bibliogon-plugin-export/pyproject.toml` and `plugins/bibliogon-plugin-audiobook/pyproject.toml`. After pulling, run `make install` so the path-installed plugins re-resolve their lock files (the backend's `poetry.lock` caches the plugin's old transitive pins until refreshed).

## [0.14.0] - 2026-04-13

### Added
- **Multi-provider AI integration (AI-01 to AI-05):** Unified LLM client supporting Anthropic (Claude), OpenAI (GPT), Google (Gemini), Mistral, and LM Studio (local). Anthropic adapter for the native /v1/messages endpoint. Provider selection dropdown with auto-filled base URLs and model suggestions. Connection test with 7 error categories (auth, rate limit, timeout, model not found, invalid request, server error, offline). AI enable/disable toggle (default: off).
- **AI-assisted chapter review (AI-06):** "Review" tab in the editor AI panel. Sends the full chapter for analysis of style, coherence, and pacing. Structured feedback with summary, strengths, actionable suggestions with quotes, and overall assessment. Language-aware (reviews in the chapter's language).
- **AI-generated marketing text (AI-07):** Sparkles button on each marketing field in book metadata. Generates Amazon KDP blurb (HTML), back cover text, author bio, and keywords. Field-specific prompts with format rules. Book context (title, author, genre, chapter titles) passed for relevance.
- **Context-aware AI prompts (AI-08):** All AI features now receive book metadata (title, author, language, genre, description). Editor suggestions match genre tone. Chapter reviews tailored to genre reader expectations.
- **AI usage tracking (AI-09):** Cumulative token counter per book. Usage displayed in the marketing tab with estimated cost range. All AI endpoints track tokens via best-effort background writes.
- **Manuscript tools:** adjective density detection (M-13), inline style check marks in TipTap (M-14), quality tab in book metadata with chapter metrics and outlier markers (M-15).
- **Editor:** IndexedDB draft recovery for unsaved changes, tooltips on quality tab outlier indicators.
- **Settings:** AI configuration section with provider selection, editor debounce and AI context settings, delete_permanently option.
- **Offline:** all UI fonts bundled locally, no CDN dependency (O-01).
- **Metadata:** HTML preview for Amazon book description, backpage description, and author bio.
- **Phase 2 roadmap:** Phase 1 archived (100% completion), new roadmap with 5 themes (AI, distribution, templates, Git backup, polish).

### Changed
- **Licensing model:** all plugins free, license gates removed, /api/licenses returns 410, Licenses tab removed from Settings, premium badges removed.
- **Config management:** app.yaml and backup_history.json removed from version control (gitignored), app.yaml.example provided as template.
- **AI config:** app.yaml reads fresh from disk on every request (was cached at startup). Plugin-status cache invalidated on settings save.
- **i18n:** retroactive translation completion for ES, FR, EL, PT, TR, JA (I-03). AI provider and error messages in all 8 languages.

### Fixed
- **PWA install prompt:** added PNG icons (Chrome requires raster format, not SVG). Enabled service worker in dev mode via vite-plugin-pwa devOptions.
- **AI stale config:** toggling AI on/off in Settings now takes effect immediately without server restart.
- **AI error reporting:** specific error messages for auth failure, rate limit, timeout, model not found, invalid request, and server errors (was generic "connection failed").
- **Anthropic model IDs:** corrected preset model names (claude-sonnet-4-20250514, claude-opus-4-20250514).
- **Export:** include backpage description and author bio in project export.

### Tests
- 100+ new tests across AI (providers, Anthropic adapter, config refresh, review, marketing, usage tracking), E2E (editor formatting, import flows, plugin install, chapter DnD, file export), plugins (kinderbuch, KDP routes, pandoc runner, backup utilities).

## [0.13.0] - 2026-04-12

### Added
- **Dashboard filters and sorting:** genre and language filter dropdowns, sort toggle (date/title/author), reset button and URL persistence for filter state. Filters are derived from the user's existing books, not a static list.
- **Keyword editor improvements:** inline edit (click a chip to rename), soft warning at 40 keywords, hard limit at 50, undo-toast on delete. Keywords are now stored as a native `list[str]` in the API (removes the JSON-string workaround in the frontend).
- **Three new themes:** Classic (serif-first, literary typography with proper paragraph indentation), Studio (clean sans-serif workspace), Notebook (warm, relaxed tones). Each with light and dark variants (6 new theme variants, 12 total). Central palette registry with a `useTheme` guard prevents invalid theme states.
- **Coverage audit infrastructure:** `docs/audits/current-coverage.md` as the single source of truth for test statistics, with a history archive in `docs/audits/history/`. Coverage targets per module type codified in `quality-checks.md`. Single-source-of-truth rule prevents duplicated statistics across documentation files.
- **274 new tests across 4 phases:**
  - Phase 1 (critical data integrity): 64 backend tests covering serializer, trash endpoints, html_to_markdown, license tiers, plugin install, settings integration
  - Phase 3 (frontend focus): 138 Vitest tests for hooks (useTheme, useEditorPluginStatus, HelpContext), form components (CreateBookModal, ChapterTypeSelect), display components (ThemeToggle, BookCard, OrderedListEditor), ExportDialog, BookMetadataEditor
  - Phase 4 (editor E2E): 31 Playwright tests covering text entry/persistence, toolbar formatting (bold/italic/underline/strikethrough/code/headings), keyboard shortcuts, block elements, undo/redo, text alignment, chapter switching, and toolbar button state sync
  - 7 new Playwright smoke suites: editor formatting, book metadata round-trip, trash flow, theme system, keywords editor, chapter sidebar viewport, dashboard filters
- **Help documentation:** themes guide, keyword editor documentation in metadata help

### Changed
- **Documentation language:** all docs (`CLAUDE.md`, `CONCEPT.md`, `CHANGELOG.md`, `API.md`, `ROADMAP.md`) and all `.claude/rules/` files translated from German to English
- **E2E test structure:** test directory moved from `frontend/e2e/` to `e2e/` (project root). AppDialog confirm button uses `data-testid` instead of text matching
- **Google Fonts:** extended with Inter, Lora and Source Serif Pro for the new theme palettes

### Fixed
- **Classic theme indent bug:** paragraph indentation reset after headings, producing inconsistent typography in long chapters
- **Chapter sidebar overflow:** chapter list and add-chapter dropdown clipped or hidden when the sidebar had many entries

### Removed
- Frontend JSON-string workaround for book keywords (replaced by native `list[str]` API)

## [0.12.0] - 2026-04-11

### Added
- **Backup compare (V-02):** `POST /api/backup/compare` compares two uploaded `.bgb` files in-memory with no server state. Returns a per-book diff with a metadata table and a two-column chapter comparison (red/green) on HTML-projected-to-plain-text content. Frontend dialog on the dashboard next to the version-history toggle. Stop-gap until the planned Git-based backup.
- **Per-book audiobook overwrite flag:** `Book.audiobook_overwrite_existing` (new Alembic migration) replaces the plugin-global `overwrite_existing` flag. Visible as a checkbox in Metadata > Audiobook. When enabled: the content-hash cache is disabled for that run and the "audiobook_exists" 409 warning is skipped.
- **Per-book audiobook skip chapter types:** `Book.audiobook_skip_chapter_types` (JSON text) replaces the plugin-global `skip_types`. UI in Metadata > Audiobook as a checkbox list of all 26 types, grouped into "present in the book" and "other types". The dry-run cost estimate respects the per-book list (two hardcoded skip sets in the backend removed, bug fix).
- **Per-book ms-tools thresholds (M-16):** `Book.ms_tools_max_sentence_length`, `ms_tools_repetition_window`, `ms_tools_max_filler_ratio` as columns. `/ms-tools/check` accepts a `book_id` and resolves thresholds in the order request > book > plugin config > default.
- **Auto-sanitization on Markdown import (M-12):** new hook `content_pre_import` in the hookspec, ms-tools implements it via `sanitize()` on the book language. Gated by `auto_sanitize_on_import: true` in `ms-tools.yaml`. Applies to all 4 import paths.
- **5 new ChapterTypes:** `part`, `final_thoughts`, `also_by_author`, `excerpt`, `call_to_action`. 26 types in total. Marketing types (also_by_author, excerpt, call_to_action) are in the audiobook-export skip list by default. The scaffolder recognizes body-level types explicitly (`_BODY_TYPES`) instead of via the default case.
- **Grammar plugin premium auth:** `languagetool_username` and `languagetool_api_key` in a new minimal `grammar.yaml`. LanguageToolClient attaches both as POST form fields when set. Enables self-hosting and LanguageTool Premium.
- **Plugin settings audit:** the generic plugin settings panel renders scalars in a typed way (boolean -> checkbox, number -> number input, string -> text input, object -> JSON textarea with an advanced hint). 4 fields previously rendered as "string true/false" are now shown as a checkbox. New TranslationSettingsPanel with a provider select and a masked DeepL API key.
- **Event recorder and error report dialog:** ring buffer for user actions with a sanitizer, opt-in history, improved GitHub issue dialog with preview and URL-length truncation.
- **M-17/M-18:** filler-word lists are loaded from YAML files (per language, extensible by user edits). Per-language allowlist to exclude terms from the checks.

### Changed
- **Architecture rule: plugin settings visibility.** Every `config/plugins/*.yaml` field must either be UI-editable or marked with `# INTERNAL`. Dead settings are forbidden. Per-book values belong on the Book model, not in the plugin YAML. Codified in `.claude/rules/architecture.md`.
- **Architecture rule: plugin package versions.** Plugin versions are independent of the app version. No forced bump on app releases.
- **Plugin settings cleanup:** `audiobook.yaml` loses `overwrite_existing`, `skip_types`, `language` (all now per-book or dead). `ms-tools.yaml` loses `languages` (hardcoded in the code). `kdp.yaml` loses the entire `settings.cover` and `settings.manuscript` block (Amazon-mandated, now documented as a module constant `KDP_COVER_REQUIREMENTS`). `export.yaml` `formats`, `export_defaults`, `ui_formats` marked `# INTERNAL`.
- **Scaffolder bug fix:** `part_intro` and `interlude` are now explicitly classified as body types instead of falling through the default branch.
- **Documentation cleanup:** `CLAUDE.md` brought up to v0.12 state (manuscripta ^0.7.0, complete ChapterType list, corrected test counts, KDP no longer "planned"). `docs/API.md` rewritten into a <100-line high-level overview that points at `/docs` and `/openapi.json` as the source of truth. `docs/CONCEPT.md` version/status header removed. `docs/help/de+en/export/audiobook.md` extended with per-book overwrite/skip/chapter-number sections, outdated "skip list in plugin config" reference removed. Empty `docs/de/` and `docs/en/` placeholder directories deleted.

### Fixed
- **i18n bug (critical, v0.11.x):** when the TranslationSettingsPanel was added, the new `ui.translation:` keys were inserted in the wrong place in `de.yaml` and `en.yaml`. This closed the `ui.settings:` block early and reparented ~50 settings keys (free, premium, active, off, on, expand_settings, plugin_*, white_label_*, trash_*, license_required, enter_license) under `ui.translation:`. The frontend `t()` helper could not find them and fell back to the English defaults, so the UI looked "correct" in the English locale while German users saw English strings. Commit `fix(i18n): move translation section out of settings and quote on/off`.
- **YAML 1.1 bool trap:** `on:` and `off:` as YAML keys were parsed into Python `True`/`False` keys in pt/tr/ja.yaml and became unreachable from the frontend lookup. Now quoted as `"on":` / `"off":`.
- **Dry-run cost estimate:** two hardcoded skip sets in the `audiobook.py` dry-run endpoint ignored the YAML and every per-book configuration. Now via a `_resolve_book_skip_types(book)` helper that reads the per-book column and falls back to `DEFAULT_AUDIOBOOK_SKIP_TYPES`.
- **Error report issue body:** URL-length truncation prevents GitHub from cutting off the body.
- **Audiobook downloads:** audio player + confirm before delete, individual chapter MP3 list expanded by default, per-chapter delete button in the Downloads tab.
- **Dev mode:** backend starts before frontend, ECONNREFUSED noise on startup suppressed.
- **Language names:** language-name strings are translated into the current UI language (not into the native language form).

### Security
- Audit of all `config/plugins/*.yaml` against UI visibility, no active settings without control anymore.

### Removed
- Plugin-global `audiobook.settings.overwrite_existing` (replaced by `Book.audiobook_overwrite_existing`, migration seeds once from YAML)
- Plugin-global `audiobook.settings.skip_types` (replaced by `Book.audiobook_skip_chapter_types`, migration seeds once from YAML)
- Plugin-global `audiobook.settings.language` (was a UI-only voice filter, never read by the export pipeline)
- `ms-tools.settings.languages` (never read, languages come from module constants)
- All `kdp.settings.cover.*` and `kdp.settings.manuscript.*` fields (never read, Amazon-mandated values now as a module constant)
- Grammar plugin `default_language`, `enabled_rules`, `disabled_rules`, `disabled_categories` (not maintained, the LanguageTool defaults are enough)
- Empty `docs/de/` and `docs/en/` placeholder directories

## [0.11.0] - 2026-04-10

### Added
- Google Cloud TTS engine with service-account authentication, quality detection (standard/wavenet/neural2/studio/journey) and voice seeding (audiobook)
- Encrypted credential storage via Fernet/AES for Google SA JSON and ElevenLabs API key (credential_store)
- Content-hash cache: unchanged chapters are not regenerated on re-export, saving TTS cost (audiobook)
- Cost estimation and savings tracking in the progress dialog after export completion (audiobook)
- Dry-run mode: preview sample + cost preview before the real export (audiobook)
- Quality filter toggle in the voice dropdown for Google Cloud TTS voices (audiobook)
- Persistent audiobook storage under uploads/{book_id}/audiobook/ with download endpoints (audiobook)
- TTS preview cache and preview persistence with chapter context in the metadata tab (audiobook)
- Inline audio player for the TTS preview in the editor with play/pause/volume/close (editor)
- ElevenLabs API key UI in Settings with verify/test/remove (audiobook)
- Help system: single-source-of-truth documentation with an in-app HelpPanel (react-markdown, search, navigation, breadcrumbs, context-sensitive HelpLinks) and a MkDocs Material site on GitHub Pages (help)
- 26 Markdown documentation pages (12 DE + 12 EN + 2 ms-tools) in docs/help/ (help)
- MkDocs setup with Material theme, i18n, git-revision-dates and GitHub Actions auto-deploy (docs)
- Manuscript tools: word repetition detection, redundant phrases (15 DE + 15 EN), adverb detection, invisible character removal, HTML/Word artifact removal, sanitization preview (diff), CSV/JSON metrics export (ms-tools)
- Plugin status endpoint GET /api/editor/plugin-status with health checks and a 30s cache (editor)
- Disabled buttons with tooltips for unavailable plugins (Grammar, AI, Audiobook) in the editor (editor)
- Audiobook progress: "01 | Foreword" prefix format instead of "Chapter 1:", SSE listener in the context instead of the modal, localStorage persistence, F5 recovery, background badge with popover (audiobook)
- Regeneration warning before overwriting existing audiobooks with a confirm dialog (audiobook)
- Backup with an optional include_audiobook parameter (backup)
- Toolbar i18n: 32 button labels extracted in 8 languages (editor)
- Audiobook tab in Metadata with sub-tabs "Downloads" and "Previews" (metadata)

### Fixed
- Voice dropdown no longer leaks Edge TTS voices into other engines (audiobook)
- LanguageTool: texts are split into 900-character chunks to avoid 413 Payload Too Large (grammar)
- Grammar plugin: config is passed through to routes correctly (grammar)
- Plugin loading: AttributeError on _settings before activate() fixed for KDP, Kinderbuch and Grammar (plugins)
- Grammar plugin added to the enabled list in app.yaml (config)
- Error toast: overflow fixed, "Report issue" button visible and clickable, closeOnClick disabled (ui)
- Browser confirm() replaced with AppDialog for audiobook delete (ui)
- LLM port changed from 11434 (Ollama) to 1234 (LMStudio) as the default (ai)
- Error message for an unreachable AI server is now in German with an actionable recommendation (ai)
- MkDocs i18n: docs_structure: folder, index.md per locale, nav generator with a homepage (docs)
- Various docs fixes in the MkDocs config (5 iterations until CI was green) (docs)

### Changed
- manuscripta ^0.7.0: all TTS engines delegate to the manuscripta adapter instead of their own implementation (audiobook)
- Direct dependencies on edge-tts, gtts, pyttsx3, elevenlabs removed (audiobook)
- GoogleTTSAdapter renamed from gtts_adapter to google_translate_adapter (manuscripta 0.7.0 compat) (audiobook)
- AudioVoice DB model: new quality column + Alembic migration (models)
- voice_store.get_voices: two-stage language matching (exact on region, prefix on bare code) (voice_store)
- formatVoiceLabel() now shows language + quality in the dropdown (ui)
- Hardcoded EDGE_TTS_VOICES fallback list removed, edge-tts-voices.ts deleted (frontend)
- German i18n strings and docs now use real umlauts (ä ö ü ß) instead of ASCII substitutes (i18n)
- Default sentence-length threshold for ms-tools changed from 30 to 25 words (ms-tools)
- Passive voice ratio as a percentage instead of a count in the style-check output (ms-tools)

### Security
- Google service account JSON is stored Fernet-encrypted, never in clear text (credential_store)
- ElevenLabs API key is also encrypted when BIBLIOGON_CREDENTIALS_SECRET is set (credential_store)
- Secure delete: credentials are overwritten with null bytes before deletion (credential_store)
- Path traversal protection on all new file-download endpoints (audiobook, help)

## Phase 9: translation, audiobook, infrastructure (v0.10.0)

- plugin-translation (premium): DeepL + LMStudio client, chapter-by-chapter book translation into a new book
- plugin-audiobook (premium): Edge TTS, TTS engine abstraction, MP3 per chapter, ffmpeg merge, preview function
- Freemium licensing: license_tier (core/premium), trial keys (wildcard), Settings UI with premium badges
- Infrastructure: Alembic migrations, GitHub Actions CI, mypy, mutmut, structured logging, async export jobs
- Editor: focus mode, office paste, spellcheck panel, chapter rename (right-click/double-click), audio preview
- i18n: 8 languages (DE, EN, ES, FR, EL, PT, TR, JA), live language switch
- 303 tests (78 backend, 125 plugin, 50 vitest, 52 e2e)

## Phase 8: manuscript quality, editor, export (v0.9.0)

- plugin-manuscript-tools (MIT): style checks (filler words DE+EN, passive voice, sentence length), sanitization (typographic quotes 5 languages, whitespace, dashes, ellipsis), readability metrics (Flesch Reading Ease, Flesch-Kincaid Grade, Wiener Sachtextformel, reading time)
- TipTap extensions: footnotes, find/replace, image resize via drag, image DnD upload
- Export: batch export (EPUB+PDF+DOCX), chapter-type-specific CSS, custom CSS, epubcheck validation
- Import: plain Markdown ZIP without project structure, tiptap_to_md extended (Table, TaskList, Figure)
- UI: dashboard sorting, cover thumbnails, word count target per chapter, keyword tag editor
- Infrastructure: multi-stage Docker build, frontend chunk splitting, roundtrip tests

## Phase 7: extended book metadata (v0.7.0)

- Extended metadata per book: ISBN (ebook/paperback/hardcover), ASIN, publisher, edition, date
- Book description as HTML (for Amazon), back-cover description, author bio
- Keywords per book (7 SEO-optimized keywords for KDP)
- Cover image assignment per book
- Custom CSS styles per book (EPUB styles)
- "Copy config from another book" wizard/dialog
- Extended chapter types: epilogue, imprint, next-in-series, part intros, interludes
- Book metadata editor in the BookEditor (5 sections: General, Publisher, ISBN, Marketing, Design)
- Playwright E2E tests extended to 52 tests

## Phase 6: editor extensions (v0.6.0)

- WYSIWYG/Markdown switching with Markdown-to-HTML conversion on switch
- Drag-and-drop chapter sorting
- Autosave indicator, word count
- plugin-grammar (LanguageTool)
- i18n: ES, FR, EL added (5 languages total)
- Dark mode with 3 themes (Warm Literary, Cool Modern, Nord)
- Settings page with app, plugin and license configuration
- Settings API to read/write YAML configs through the UI
- PluginForge extracted as a PyPI package (pluginforge ^0.5.0)
- Licensing moved to the backend (app/licensing.py)
- pre_activate callback for the license check
- plugin-help and plugin-getstarted as standard plugins
- Export plugin switched over to manuscripta
- Export dialog with format/book-type/TOC-depth/section-order selection
- Trash (soft delete) with restore and permanent delete
- Custom file formats: .bgb (backup), .bgp (project)
- Custom dialog system (AppDialog) instead of native browser dialogs
- Toast notifications (react-toastify)
- Playwright E2E tests (39 tests)
- Comprehensive help (23 FAQ, 12 shortcuts, bilingual DE/EN)
- write-book-template import compatible with real projects

## Phase 5: premium plugins and licensing (v0.5.0)

- Offline licensing (HMAC-SHA256, LicenseStore)
- plugin-kinderbuch, plugin-kdp

## Phase 4: import, backup, chapter types (v0.4.0)

- ChapterType enum, asset upload, full-data backup/restore
- write-book-template ZIP import

## Phase 3: export as a plugin (v0.3.0)

- bibliogon-plugin-export (TipTap JSON -> Markdown, scaffolder, Pandoc)
- Old export code removed, editor switched to TipTap JSON

## Phase 2: PluginForge (v0.2.0)

- PluginManager on pluggy, YAML config, lifecycle, FastAPI integration
- Entry point discovery, hook specs

## Phase 1: MVP (v0.1.0)

- Book/Chapter CRUD, TipTap editor, Pandoc export, Docker
