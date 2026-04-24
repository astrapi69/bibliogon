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

