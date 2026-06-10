# Bibliogon

Open-source self-publishing toolkit for authors. Books, articles, picture books, comics, and multi-platform content workflows. Write with a built-in **Story Bible** to keep your characters, places and plot points consistent, then export to EPUB / PDF / audiobook. Offline-first, plugin-based, local-first.

Built on [PluginForge](https://github.com/astrapi69/pluginforge), a reusable plugin framework based on [pluggy](https://pluggy.readthedocs.io/).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**[Web app](https://astrapi69.github.io/bibliogon/)** | **[Documentation](https://astrapi69.github.io/bibliogondocs/)** | **[Issues](https://github.com/astrapi69/bibliogon/issues)** | Current version: **v0.49.0**

## Story Bible

Bibliogon's standout feature: a **per-book database of your fiction's recurring elements** — characters, settings, plot points, items and lore — that lives right beside your manuscript so you never lose track of who's who or what happened where. Provided by the **plugin-story-bible** plugin.

- **Five entity types**, each with its own icon, accent color and per-type metadata: **Characters** (aliases, role, traits, arc notes, relationships), **Settings** (type, geography, significance), **Plot Points** (timeline position, story beat, involved characters), **Items** (significance, current holder), and **Lore** (magic / technology / culture / history / religion / language). The type registry is the single source of truth in `backend/config/story-bible-entities.yaml`.
- **Rich-text descriptions** per entity (TipTap) plus an inline create / edit / delete sidebar that slides in next to the chapter list.
- **Relationships** — connect any two entities as ally, rival, family, mentor, romantic or neutral, with an optional note. Edited in a dedicated "Relationships" section of the entity detail view; each type is color-coded.
- **@-mentions** — type `@` in the chapter editor or a picture-book page to autocomplete the book's entities (grouped by type, name-search as you type). Inserts a color-coded inline mention badge; clicking it opens that entity in the sidebar.
- **Auto-detect** — scan your chapter / page text for entity names (exact, case-insensitive, word-boundary; short names skipped, already-linked entities excluded) and one-click "Link automatically" to create the appearance links.
- **Appearance tracker** — link an entity to a page or chapter (drag it onto a Storyboard card, or auto-detect), each link carrying an optional role + notes. The entity detail view lists every place it appears.
- **Arc View** — an SVG swim-lane timeline: each entity gets a lane, every appearance a mood-colored, role-sized dot, connected by continuity polylines; click a dot to jump to that page. A toggle draws color-coded bezier lines between two entities' lanes wherever they share a page.
- **Continuity Checker** — advisory warnings when an entity disappears, has a long absence gap, or a page has no entities at all.
- **Markdown export** — export the whole Story Bible (grouped by type, with appearances) as a Markdown document.

## Features

- WYSIWYG and Markdown editor (TipTap with 15 official + 1 community extension, 24 toolbar buttons)
- **Story Bible** — per-book character / setting / plot / item / lore database with relationships, @-mentions, auto-detect, Arc View timeline and continuity checking (see above)
- Full-book structure with chapter types for every section (Preface, Foreword, Prologue, Dedication, Part, Epilogue, Afterword, Index, Also by the Author, Excerpt, Call to Action, ...)
- Genre catalog for Novel, Non-Fiction, Technical, Biography, Poetry, Children, Fantasy, Thriller, Romance, Cookbook, Travel, and more
- Drag-and-drop chapter ordering with collapsible sections
- EPUB, PDF, Word, HTML, Markdown export via [manuscripta](https://github.com/astrapi69/manuscripta)
- Audiobook generation with 5 TTS engines (Edge TTS, Google Cloud TTS, Google Translate, pyttsx3, ElevenLabs)
- Content-hash cache: unchanged chapters are not re-generated (saves money on paid engines)
- Cost estimation and savings tracking for paid TTS engines
- Dry-run mode: listen to a sample before committing to a full export
- Persistent audiobook storage with per-chapter and merged downloads
- Full-data backup and restore (.bgb) with images and optional audiobook files
- Book metadata: ISBN, ASIN, Publisher, Keywords, Cover, Custom CSS, repository URL
- In-app help panel with Markdown rendering, search, and context-sensitive links
- Multi-provider AI assistant (Anthropic, OpenAI, Gemini, Mistral, LM Studio) with chapter review, marketing text generation, and context-aware suggestions
- Plugin system with ZIP installation for third-party plugins
- Encrypted credential storage (Fernet) for API keys and service accounts
- 6 color palettes (Warm Literary, Cool Modern, Nord, Classic, Studio, Notebook) x Light/Dark = 12 theme variants
- i18n: German, English, Spanish, French, Greek, Portuguese, Turkish, Japanese
- Responsive layout with hamburger menu on mobile
- Settings sidebar with 5 grouped sections (Darstellung, Inhalt, System, Info, Gefahrenzone) replacing the older horizontal-tabs layout
- Editor display settings popover for per-user width / font / size / line-height customisation
- Dashboard pagination with configurable page size, applied across books, articles, and trash views
- Bulk-restore parity for articles and books from the trash view
- Alt+Z word-wrap toggle in the editor for proofing long lines side-by-side
- Author datalist (Pattern A) across editors with the Authors-Database as the autocomplete source
- Danger Zone full-system reset under Settings for a clean slate
- Accessibility WCAG 2.1 AA audit pass: ARIA labels, focus order, keyboard navigation
- Settings > Backups tab with version-history list, per-entry delete, clear-all action, and a Compare-Backups dialog for diffing two `.bgb` snapshots
- Per-search clear button (X) on every search/filter input across Articles, Books, Authors-Database, and Help so a single field can be cleared without resetting other filters
- Collapsible-section open-state persistence in the picture-book and comic-book editor sidebar (Tier 1 Visual Style and Tier 2 Typography sections remember their state per surface across navigation and reload)
- White-label feature flag (`features.white_label` in `app.yaml`) gates the Settings > Erweitert tab; off by default so power-user surfaces stay accessible via YAML edits without cluttering the sidebar
- In-place title editing on every editor (book, article, picture-book, comic-book) via a shared pencil-toggle component; published or archived works gate the edit behind a warning banner so a title change is consciously carried over to the publishing platform
- Publication-status lifecycle (Draft / Ready / Published / Archived) shared by books and articles, with a status badge on every dashboard card and list row
- Locale-aware date formatting that follows the active UI language across every surface

## Picture Book Authoring

Bibliogon supports a dedicated picture-book authoring flow with per-page image + text layouts, a Storyboard grid view, and a direct WeasyPrint PDF pipeline.

- **13 page layouts in 5 categories** (chosen from a categorised LayoutPicker): single-image-with-text (image top / bottom / left / right, full-image overlay, image-border with centered text), image-only, multi-image (two-images-with-centered-text, split-horizontal, split-vertical, and a free-form **collage** of N drag-positioned image + text regions), text-only, and the speech-bubble special layout. Each layout has its own per-layout `layout_config` namespace so switching layouts preserves prior settings.
- **Collage layout** (Phase 3): freely drag-and-resize image and text regions on the page with z-index ordering (`useDragPosition` hook + `CollageCanvas`); the WeasyPrint walker mirrors the editor geometry so the PDF matches the canvas.
- **Tier 1 + Tier 2 properties** per layout (Visual-Style and Typography sections in the editor properties pane): text alignment, vertical centering, padding, font family, font size, line-height, text color, font weight, container width/height. A shared `computeTierTextStyles` helper (TS + Python mirror) keeps the editor preview and the PDF walker in sync.
- **Storyboard View** (drag-reorder grid): annotate each page with notes, a story-beat tag (Exposition / Inciting / Rising / Climax / Falling / Resolution), a mood color (10-preset palette), and an act-group label for visual chapter boundaries. Story Bible entities can be dragged onto cards to track appearances, surfaced as color-coded entity badges, and an entity filter narrows the grid to pages where selected entities appear. The Storyboard is now available for **every book type** — prose books get a chapter-card variant (word count + the same four annotations on each `Chapter`) via the shared `StoryboardAnnotations` module.
- **PDF export** via WeasyPrint with KDP-aligned format dropdown (square 8.5x8.5, landscape 8.5x11) + bleed and crop marks controls.
- **Layout-switch hygiene:** the per-layout `layout_config` namespace (Fix B) means switching away from and back to a layout preserves its configuration; active text-conversion between TipTap-based and Tier-Property-based layouts keeps the DB shape matching the active layout.

## Comic Book Authoring

A dedicated comic-book editor (`book_type='comic_book'`) ships multi-panel page layouts with multi-bubble per-panel speech-bubble support.

- **Comic panel grid** with 7 grid templates (single-panel splash, 1x2, 2x1, 2x2, 2x3, 3x2, 3x3) selectable per page; Add-Panel disables at the template's cell capacity, and a switch to a smaller template triggers an overflow handler (move excess panels to new pages, delete them, or cancel).
- **Panel arranging:** drag a panel by its handle to reorder it within the page (dnd-kit), or use the "Move to page" menu to send it to another page — the menu shows each target's capacity (`Seite N - count/max`) and disables full pages.
- **Multi-bubble per panel:** position bubbles via anchor presets (top-left through bottom-right, plus center) with opacity and size controls, or drag a bubble (and its tail tip) directly on the canvas.
- **6 bubble types** (speech, thought, narration, shout, whisper, sound-effect), each rendered as a single continuous SVG path (outline + tail in one shape, no CSS-shape-plus-polygon-tail seam) with type-specific tail behaviour — thought circle-chain, shout spike-absorption, narration forced no-tail. The same path generator runs in the editor preview and the WeasyPrint PDF walker.
- **PDF export** via the shared WeasyPrint pipeline; comics dispatch through the `export_execute` hookspec to keep core decoupled from plugin code.

## KDP Publishing Wizard

A 5-step XState-driven wizard for Amazon KDP publishing prep with server-side persistence and conflict detection.

- **5 steps:** Metadata → Cover → Pricing → ARC reviewers → Launch checklist.
- **Server-side state** (BookPublishingState row) auto-saves wizard progress; on reopen the wizard rehydrates pricing + ARC choices.
- **Conflict banner** when the book has been edited outside the wizard (book.updated_at > state.updated_at) so the user re-validates metadata.
- **Cover validation** with KDP dimension + DPI + bleed checks, surfaced inline at the Cover step.

## Article Authoring (Phase 2 - beta)

Beyond books, Bibliogon supports article authoring with multi-platform publication tracking.

- Dedicated article editor with TipTap (separate from the book editor, single-document, no chapter sidebar)
- **8 content types** (Blog post, Tutorial, Review, Essay, Newsletter, Interview, Listicle, Short story) from a `content-types.yaml` registry, chosen via a split-button on the Article Dashboard (default click creates a Blog post; the chevron exposes the other 7). Each type has its own extra metadata fields (e.g. tutorial difficulty / prerequisites / duration, review work + rating, newsletter issue + send date, interview partner + role) stored in a per-article `article_metadata` JSON column and edited inline in the metadata sidebar
- Article-level metadata: topic (settings-managed), SEO title / description, tags, excerpt, canonical URL, featured image
- Per-platform publication tracking (Medium, Substack, X, LinkedIn, dev.to, Mastodon, Bluesky, custom)
- Drift detection: the editor flags out-of-sync publications when article content changes after publish; a "Verify live" action re-snapshots the baseline
- Promo posts modeled as publications with the `is_promo` flag (short companion piece linking back to a main publication)
- Manual publishing workflow - no platform API integration yet (Phase 3 scope)

## Git Sync for Books

Books can be synchronized with external git repositories for collaboration, backup, and version control.

- **Import:** clone a public git repo containing a book in Bibliogon's WBT layout
- **Commit + Push:** save book changes back to the repo via SSH agent, system credential helper, or per-book PAT
- **Smart-Merge:** three-way diff with per-chapter conflict resolution UI for chapters edited both locally and remotely
- **Multi-Language:** repos with `main-XX` branches (e.g. `main-de`, `main-fr`) import as linked translations via `Book.translation_group_id`
- **Core-Git Bridge:** unified commit fans out to both core git history and the plugin-git-sync subsystem under a per-book lock

All three credential paths are user-configurable from the Git Backup dialog: SSH agent, system credential helper, and per-book PAT input (encrypted, never returned in clear).

## Multi-Book Backup Import

`.bgb` backup files containing multiple books can be imported with per-book selection (default-all-on) and per-book duplicate detection. The import wizard uses an XState v5 state machine to manage the multi-step flow with single-book and multi-book branches and a shared error boundary that reports details + opens a GitHub Issue on failure.

## Install and Run

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (Docker Desktop or Docker Engine with Compose)

### One-liner

**Linux / macOS:**

```bash
curl -fsSL https://raw.githubusercontent.com/astrapi69/bibliogon/main/install.sh | bash
```

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/astrapi69/bibliogon/main/install.ps1 | iex
```

Both download Bibliogon to `~/bibliogon` (Linux/macOS) / `%USERPROFILE%\bibliogon` (Windows), build the Docker images, and start the app at **http://localhost:7880**.

### Double-click install (no terminal)

After cloning or downloading the repo, double-click the wrapper for your OS:

| Platform | File | Notes |
|---|---|---|
| macOS | `install.command` | Finder treats `.command` as runnable; on first run, Gatekeeper may prompt — right-click > Open to bypass |
| Windows | `install.cmd` | Wraps `install.ps1` with `-ExecutionPolicy Bypass` so corporate Windows with Group-Policy-locked ExecutionPolicy still runs the installer |
| Linux | `bash install.sh` | No special wrapper needed |

### Manual install

```bash
git clone https://github.com/astrapi69/bibliogon.git
cd bibliogon
./start.sh
```

### Stop / Start / Uninstall

```bash
cd ~/bibliogon && ./stop.sh                      # Stop
cd ~/bibliogon && ./start.sh                      # Start again
cd ~/bibliogon && ./stop.sh && cd ~ && rm -rf ~/bibliogon  # Uninstall
```

## Development

```bash
make install    # Install all dependencies (Poetry, npm, plugins)
make dev        # Start backend (8000) + frontend (5173) in parallel
make test       # Run all tests (backend + plugins + frontend)
```

See [CLAUDE.md](CLAUDE.md) for full development documentation.

## Documentation

The documentation is available in two forms:

- **In-App:** Click the help icon in the navigation bar to open the slide-over help panel with search, navigation tree, and Markdown rendering.
- **Online:** [astrapi69.github.io/bibliogondocs](https://astrapi69.github.io/bibliogondocs/) - MkDocs Material site with full-text search, light/dark mode, and i18n. (The Bibliogon web app itself is hosted separately at [astrapi69.github.io/bibliogon](https://astrapi69.github.io/bibliogon/).)

Both read from the same Markdown files in `docs/help/`. To build the docs locally:

```bash
make docs-install   # Install MkDocs dependencies (separate venv)
make docs-serve     # Serve at http://localhost:8000 with hot-reload
```

## Architecture

```
Browser --> nginx (static files + /api proxy) --> FastAPI (uvicorn)
                                                    |
                                              PluginForge
                                                    |
                              +----------+----------+----------+
                              |          |          |          |
                           Export     Help    Audiobook      ...
```

- **Frontend:** React 18, TypeScript, TipTap, Vite, Radix UI, @dnd-kit, react-markdown
- **Backend:** FastAPI, SQLAlchemy, SQLite, Pydantic v2
- **Plugins:** PluginForge (PyPI), pluggy-based, YAML-configured
- **Export:** manuscripta ^0.9.0 (PyPI), Pandoc, [write-book-template](https://github.com/astrapi69/write-book-template)
- **TTS:** manuscripta adapter layer with 5 engines (Edge TTS, Google Cloud, gTTS, pyttsx3, ElevenLabs)

## Plugins

| Plugin | License | Description |
|--------|---------|-------------|
| export | MIT | EPUB, PDF, Word, HTML, Markdown, Project ZIP |
| help | MIT | In-app help panel with docs, search, shortcuts |
| getstarted | MIT | Onboarding guide, sample book |
| ms-tools | MIT | Style checks, sanitization, text metrics |
| audiobook | MIT | TTS audiobook generation (5 engines) |
| translation | MIT | DeepL / LMStudio translation |
| grammar | MIT | LanguageTool grammar checking |
| kinderbuch | MIT | Children's book page layout |
| kdp | MIT | Amazon KDP metadata, cover validation |
| comics | MIT | Multi-panel comic-book pages with multi-bubble per-panel speech bubbles |
| story-bible | MIT | Per-book fiction-entity database (character / setting / plot point / item / lore) with relationships, @-mentions, Arc View, continuity checker, Markdown export |
| git-sync | MIT | Book-as-git-repo: import, commit, smart-merge, multi-language linking |
| medium-import | MIT | Medium HTML-export importer for articles with provenance tracking |

All 13 first-party plugins ship free under MIT. Third-party plugins can be installed as ZIP files via Settings > Plugins.

## Configuration

Three-layer config: project `app.yaml` (defaults) ← user override file
(`~/.config/bibliogon/secrets.yaml`, gitignored) ← env-vars (CI/Docker).
Override-wins, env-vars always highest priority. Detailed guide:
[docs/configuration.md](docs/configuration.md).

Move secrets like `ai.api_key` out of project `app.yaml` into the
override file or `BIBLIOGON_AI_API_KEY` env-var. The Settings UI
hides the API-key input automatically when an override is active.

Environment variables (set in `.env` or shell):

| Variable | Default | Description |
|----------|---------|-------------|
| `BIBLIOGON_PORT` | 7880 | Port for the web app |
| `BIBLIOGON_DEBUG` | false | Debug mode (enables test endpoints, API docs) |
| `BIBLIOGON_AI_API_KEY` | (unset) | Overrides `ai.api_key` from any yaml layer |
| `BIBLIOGON_SECRET_KEY` | (generated) | Secret for license validation |
| `BIBLIOGON_CREDENTIALS_SECRET` | (generated) | Secret for encrypting API keys and service account files |
| `BIBLIOGON_CORS_ORIGINS` | localhost:7880 | Allowed CORS origins |
| `BIBLIOGON_DATA_DIR` | platformdirs default | Root directory for runtime data (DB, uploads). Linux/macOS: `~/.local/share/bibliogon/`. Windows: `%LOCALAPPDATA%\bibliogon\`. Docker: `/app/data` |
| `BIBLIOGON_DB_PATH` | (no longer honoured) | **Removed in v0.30.0** (DEP-DBPATH-01 step 3). The variable has no effect on path resolution; if still set in the environment, a single warning is logged at startup naming the ignored value. Set `BIBLIOGON_DATA_DIR` instead — the database resolves to `<BIBLIOGON_DATA_DIR>/bibliogon.db`. Deprecation timeline: warning v0.27.0, precedence flip v0.28.0, removal v0.30.0. |

## Related Projects

- [pluginforge](https://github.com/astrapi69/pluginforge) - Plugin framework (PyPI)
- [manuscripta](https://github.com/astrapi69/manuscripta) - Book export pipeline with TTS adapter layer (PyPI)
- [write-book-template](https://github.com/astrapi69/write-book-template) - Target directory structure for export

## License

Bibliogon is released under the [MIT License](LICENSE).
All plugins are free and open source.

## Reporting Security Issues

See [SECURITY.md](SECURITY.md) for the responsible disclosure process.

## Code of Conduct

This project follows the [Contributor Covenant 2.1](CODE_OF_CONDUCT.md).
Reports go to asterios.raptis@web.de.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, workflow, and expectations.

## Issue Templates

Use the appropriate template when opening a new issue:
- [Bug Report](.github/ISSUE_TEMPLATE/bug_report.yml)
- [Feature Request](.github/ISSUE_TEMPLATE/feature_request.yml)
- [Question](.github/ISSUE_TEMPLATE/question.yml)
