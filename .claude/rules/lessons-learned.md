# Known pitfalls and patterns

These rules come from real development and solve problems that would otherwise come back over and over.

## Commit ordering for breaking-change dependency upgrades

- Pin the version bump BEFORE migrating call sites when the new code uses imports that only exist in the new release. Backward-compatible exports in the new version (e.g. v0.8.0 keeping `compile_book` and `OUTPUT_FILE` for one cycle) keep the intermediate state green. Doing it the other way - migrate first, bump pin last - leaves the migration commit red against the still-installed old version and breaks the "each commit green individually" rule.
- Path-installed plugins do not auto-refresh when their `pyproject.toml` changes. After bumping a transitive dependency in a plugin (e.g. `manuscripta` in `plugins/bibliogon-plugin-export/pyproject.toml`), run `poetry lock` AND `poetry install` in the BACKEND directory too - the backend's `poetry.lock` caches the resolved deps of the plugin's old pin until you regenerate.

## Atomic commits are bounded by "green individually", not "one thing"

- The "atomic commit" rule is "each commit is the smallest reversible unit that leaves the tree green", not "each commit does one conceptual thing". When splitting a change creates a broken intermediate state - e.g. the source change deletes a function the existing tests still import - the split is wrong. Combine the pieces into one commit.
- Concrete example: a refactor that renames an exported helper. The source edit and the test edit MUST land together; otherwise either the source commit fails because tests still import the old name, or the test commit fails because the new name does not exist yet. Splitting along conceptual lines ("source change" / "test update") here produces a commit series that cannot bisect cleanly.
- Conceptual split is a goal; green-individually is a hard constraint. When they conflict, the constraint wins.

## CI vs local environment drift

Two patterns cause "passes locally, fails in CI" in Poetry-managed projects:

1. `poetry install` does not remove dependencies that vanished from pyproject.toml. Stale `.dist-info` directories in long-tenured local venvs keep importing modules that the lockfile no longer references. CI starts fresh and immediately fails. Mitigation: run `poetry install --sync` periodically, especially before assuming "local green = CI green".

2. Path-dependency declarations in pyproject.toml must include every plugin or sub-package whose code is exercised by tests. Plugin discovery via `importlib.metadata.entry_points()` only sees what's actually installed, not what exists on disk. When creating a new plugin, the path-dep declaration in backend/pyproject.toml is mandatory, not optional.

Detection: if local tests pass but CI fails on routes returning 404, suspect missing path-deps before suspecting code bugs.

## Doc files: existence is not discoverability

- When you add a new help page under `docs/help/{lang}/`, verify it appears in `docs/help/_meta.yaml`. The MkDocs nav generator (`scripts/generate_mkdocs_nav.py`) reads that file as the single source of truth; pages not listed there are unreachable from the side nav even though direct URLs and in-text links still work. We hit this with `ai.md` and `developers/plugins.md` - both had been merged for several releases but never showed up in the in-app help panel or the public docs site nav.
- Rule: file existence is not user discoverability. After creating a new help page, the same commit (or a paired one) must add the entry to `_meta.yaml` with a sensible icon and the appropriate placement among siblings.

## Doc values: read from code, not from memory

- Any specific number, threshold, default value, dropdown range, or feature flag mentioned in the docs MUST come from the code or config that defines it (`backend/config/app.yaml`, `backend/config/i18n/*.yaml`, the schema, the source of the relevant function), not from memory or approximation.
- If a value isn't easily findable in code, that is a signal to flag the question, not to guess. Wrong defaults in user docs erode trust faster than missing docs do.
- Example: trash auto-delete default came from `backend/config/app.yaml.example` (`trash_auto_delete_days: 90`); the configurable range came from the `trash_days_*` keys in `backend/config/i18n/*.yaml`. Both are single sources of truth that the docs cite without duplicating.

## Pandoc raw-HTML pass-through is format-specific

- Pandoc's HTML and EPUB writers preserve raw HTML blocks verbatim. The LaTeX (PDF) and DOCX writers SILENTLY DROP raw HTML - including `<figure>`, `<img>`, `<figcaption>`. The verbose log records `Not rendering RawBlock (Format "html") "<figure>"` per dropped element.
- Practical consequence: any Markdown emitted by bibliogon that contains raw HTML images will produce an EPUB with images and a PDF without them. Same input, different output, no error message. We hit this in v0.13.x: imported books exported to PDF with zero embedded images while EPUB worked, and there was no way to tell something was wrong.
- Fix: when converting to Markdown for export, always emit native Pandoc syntax for content that must survive PDF/DOCX. For figures, that is `![caption](src "alt")` - Pandoc's `implicit_figures` extension (default in `gfm`/`markdown`) promotes a single-image paragraph back into a real `\begin{figure}` / `<figure>` block in every output format. The raw-HTML form is acceptable ONLY for HTML/EPUB-only content.
- See [html_to_markdown.py:_close_figure](../../plugins/bibliogon-plugin-export/bibliogon_export/html_to_markdown.py) for the converter that emits native syntax for simple figures and falls back to raw HTML (with a warning log) for complex shapes (multiple imgs, mixed content). The warning fires the moment real-world content hits the fallback so we discover it before users do.
- Note: manuscripta v0.8.0's `strict_images=True` does NOT catch this class of bug. Strict mode parses Pandoc stderr for unresolved-resource warnings, which only fire when the *reader* fails to resolve a path the *writer* is trying to embed. Raw HTML is dropped at the writer stage before resolution is attempted, so strict mode never sees it.

## manuscripta v0.8.0 migration: source_dir + run_export + strict_images

- v0.7.x had no first-class library entry point; callers imported `manuscripta.export.book.compile_book` and relied on `os.chdir(project_dir)` plus mutating `manuscripta.export.book.OUTPUT_FILE` (a module global) before the call. Both are gone in v0.8.0.
- v0.8.0 ships `run_export(source_dir, *, output_file=..., no_type_suffix=..., strict_images=True, ...)`. Pass `source_dir` explicitly; the library never calls `os.chdir` itself, so callers must not rely on cwd. `output_file`/`no_type_suffix` are proper kwargs; do NOT mutate `OUTPUT_FILE` even though it still exists for the CLI's internal use.
- New typed exception hierarchy under `from manuscripta import ...`: `ManuscriptaError` (base), `ManuscriptaImageError(.unresolved: list[str])`, `ManuscriptaPandocError(.returncode, .stderr, .cmd)`, `ManuscriptaLayoutError(.source_dir, .missing, .reason)`. Per ADR-0004 in upstream, `__str__()` of these is diagnostic; pin error handling on attributes, NOT on parsing the rendered text. Bibliogon wraps them in `MissingImagesError`/`PandocError` with the original as `.cause`.
- `strict_images=True` is the new default and the right choice for plugin-export: scaffolder writes assets into `project_dir/assets/` from the DB, so any unresolved image is a real bug worth surfacing as a 422 with the `.unresolved` list to the frontend toast.
- Backend `poetry.lock` caches the resolved dependencies of path-installed plugins. After bumping `manuscripta` in `plugins/bibliogon-plugin-export/pyproject.toml`, run `poetry lock` AND `poetry install` in the backend dir too - otherwise `bibliogon-plugin-export` shows the old pin and you ImportError on `from manuscripta import ManuscriptaError`.
- TTS adapter API (`manuscripta.audiobook.tts.create_adapter`, `VoiceInfo`, all engine names) is unchanged in v0.8.0; no audiobook plugin code touches v0.8.0's typed `TTSError` hierarchy yet (existing broad `except Exception` blocks still work). Narrowing those is a separate hygiene pass, NOT part of the v0.8.0 upgrade.

## Alembic migration + fresh test DB

- For every new Alembic migration that touches `books` (or another core table) via `ALTER TABLE`: the file `backend/bibliogon.db` MUST be deleted before the next `make test`. Otherwise you get `sqlite3.OperationalError: duplicate column name: ...`.
- Reason: `backend/tests/conftest.py` calls `Base.metadata.create_all(engine)` before every test and creates the tables with the NEW schema. At the same time the on-disk DB still has `alembic_version` pinned to the old revision. `TestClient(app)` triggers the lifespan `init_db()`, which runs `upgrade head` when tables + `alembic_version` both exist - which tries to add the new column via ALTER TABLE a second time and crashes.
- Permanent fix: `rm backend/bibliogon.db` after `git pull` with a new migration, then `make test`. `init_db()` now sees no tables, runs `create_all` + `stamp head`, and subsequent test runs pass because `alembic_version` is already at the new head.
- The clean solution would be a real in-memory test DB setup (e.g. via a `BIBLIOGON_TEST=1` env var) that skips `init_db()` in test mode - does not exist yet.

## TipTap editor

### Storage format
- TipTap stores as JSON. NOT HTML, NOT Markdown.
- TipTap CANNOT render Markdown. Markdown must be converted to HTML before storage.
- On import: convert Markdown files to HTML with the Python `markdown` library, then store as TipTap JSON.
- When switching WYSIWYG -> Markdown: convert JSON to Markdown (nodeToMarkdown).
- When switching Markdown -> WYSIWYG: convert Markdown to HTML, then to JSON.

### Extensions
- StarterKit does NOT include an image extension. @tiptap/extension-image is required separately.
- Figure/Figcaption: use @pentestpad/tiptap-extension-figure, NO custom code.
- Character count: use @tiptap/extension-character-count, NO custom code.
- Currently 15 official + 1 community extension installed (see CLAUDE.md).
- Before writing custom code, ALWAYS check whether an official TipTap extension exists.

### Peer dependencies
- Community extensions (@pentestpad/tiptap-extension-figure, tiptap-footnotes) can silently upgrade to @tiptap/core v3. Always pin with --save-exact.
- @pentestpad/tiptap-extension-figure: pin to 1.0.12 (last v2-compatible); 1.1.0 requires @tiptap/core ^3.19.
- tiptap-footnotes: pin to 2.0.4 (last v2-compatible); 3.0.x requires @tiptap/core ^3.0.
- `npm ci` in CI fails on peer-dep conflicts. Do NOT use --legacy-peer-deps as a fix.

### CSS
- TipTap renders inside .ProseMirror. CSS selectors have to account for that.
- Specificity: `.ProseMirror p.classname` instead of `.tiptap-editor classname`.
- All styles MUST work through CSS variables (3 themes x light/dark = 6 variants).

## Import (write-book-template)

### Markdown-to-HTML
- ALWAYS convert Markdown to HTML on import. TipTap cannot handle Markdown.
- Use the Python `markdown` library (already installed).
- Indentation: write-book-template uses 2-space indent for lists, Python's markdown needs 4-space. Double the indentation before conversion.

### Chapter-type mapping
- acknowledgments belongs in BACK-MATTER, not front-matter.
- TOC (toc.md) is imported as its own chapter type (chapter_type: toc).
- next-in-series.md maps to chapter_type: next_in_series.
- part-intro and interlude are detected correctly.

### Order
- Read the section order from export-settings.yaml and use it for chapter positioning.
- TOC must come first in front-matter.
- Fall back to alphabetical sort if no export-settings.yaml exists.

### Assets/images
- Import assets from the assets/ folder and save them as DB assets.
- Rewrite image paths from `assets/figures/...` to `/api/books/{id}/assets/file/{filename}`.
- Asset serving endpoint: GET /api/books/{id}/assets/file/{filename}

### Metadata
- Parse metadata.yaml for: title, subtitle, author, language, series, series_index.
- Extract ISBN/ASIN from metadata.yaml (isbn_ebook, isbn_paperback, isbn_hardcover, asin_ebook).
- Import description.html, backpage-description, backpage-author-bio, custom CSS.
- `series` can be a dict (name + index), not only a string. Handle both forms.
- Normalize `language` (e.g. "german" -> "de").

## Export

### Headings
- Content may already contain an H1. Before adding an H1, check whether one already exists.
- `_prepend_title` has to check whether the content starts with `#` or `<h1`.

### TOC
- If a manual TOC chapter exists: pass use_manual_toc=true through to manuscripta.
- NO double TOC (generated + manual). A checkbox in the export dialog lets the user choose.
- Nested lists in the TOC: keep the tree structure with 2-space indentation per level.

### Images in EPUB
- Assets have to be copied from the DB into the project structure during scaffolding.
- Rewrite API paths (/api/books/.../assets/file/...) back to relative paths (assets/figures/...).

### Pandoc/manuscripta
- manuscripta's OUTPUT_FILE is a module-level global. It has to be set directly, not via CLI.
- Read `section_order` from the scaffolded project and filter out missing files.
- metadata.yaml needs --- YAML delimiters for Pandoc.
- Convert --- in Markdown (horizontal rules) to ***, otherwise they collide with YAML parsing.

### Filenames
- Book-type suffix in the filename: title-ebook.epub, title-paperback.pdf.
- Setting `type_suffix_in_filename` (default: true).

## Docs are specification, not a wish list

- If a feature is in the help, it must exist in the code. Feature audits after every large docs addition are mandatory.
- Features that are not yet implemented but are described in the docs must be marked with `> Planned for a future version`. Do not promise what isn't there.
- Build an audit table with the current state, run a gap analysis in A/B/C categories, then implement. No blind coding.

## Help system: single source of truth

- Help content lives in `docs/help/`, not in plugin code. Both the in-app Help plugin and MkDocs read the same Markdown files.
- `docs/help/_meta.yaml` is the single source of truth for navigation. `scripts/generate_mkdocs_nav.py` converts it into the MkDocs format.
- Markdown rendering on the frontend via `react-markdown` with `remark-gfm` + `rehype-slug` + `rehype-autolink-headings`. Never `dangerouslySetInnerHTML` for user content.
- MkDocs dependencies live in `docs/pyproject.toml` (its own venv), not in the backend venv. `make docs-install` / `docs-build` / `docs-serve` from the root.
- Context-sensitive help via `<HelpLink slug="export/epub"/>` - opens the HelpPanel directly on the relevant page.

## Config migration (bool -> enum)

- When a boolean setting is extended to an enum with more options (e.g. audiobook `merge: true|false` -> `merge: separate|merged|both`): ALWAYS introduce a `normalize_*` function that silently translates old bool values (True -> "merged", False -> "separate") and maps unknown/None values to the default.
- Reason: user configs in YAML, backups (.bgb) and DB columns still contain old bool values. A hard schema validation would break existing installations. The default in the Pydantic schema is not checked for migration by the type system.
- In practice: the normalization MUST happen on both the backend (generator/service layer) AND the frontend (state init from settings), so both sides share the same migration rules. Otherwise old configs show the wrong default in the UI.
- Tests: one explicit migration test per bool value, plus pass-through for all enum values, plus default for None/unknown.

## Voice dropdown: NO engine-agnostic fallback

- Previously `BookMetadataEditor` and `Settings` fell back to a hardcoded `EDGE_TTS_VOICES` list when `/api/voices?engine=X&language=Y` returned an empty array. Effect: user picks Google TTS / pyttsx3 / ElevenLabs, the backend cache has no voices for those engines (only Edge is seeded via `sync_edge_tts_voices`) -> frontend dumps 16 Edge-DE voices into the dropdown even though the engine cannot play them. Bug report was "dropdown shows ALL voices instead of only the matching ones".
- Solution: a shared helper `api.audiobook.listVoices(engine, language)` tries `/api/voices` (cache) first, then `/api/audiobook/voices` (live plugin endpoint), then returns `[]`. NO more hardcoded list. Both UI sites render a clear empty state "No voices available for {engine} in {language}" on `voices.length === 0` instead of faking something.
- `frontend/src/data/edge-tts-voices.ts` was deleted entirely. If a user really wants to see Edge-DE voices, Edge is the only engine the backend cache seeds and the dropdown fills through the normal path.
- Backend `voice_store.get_voices` now matches in two steps: if the `language` contains a hyphen (`"de-DE"`), it is an exact case-insensitive match. A bare code (`"de"`) is a prefix match (`de-DE`, `de-AT`, `de-CH`). Previously it always stripped the region suffix, so `"de-DE"` and `"de"` returned the same result - irrelevant for Bibliogon's current data model (Book.language is a bare code), but the strict variant protects plugin tests and future callers.
- Tests: `backend/tests/test_voice_store.py` (8 tests) covers every path (engine isolation, bare vs region, case insensitivity, unknown engine, unknown language, engine-leak regression). `frontend/src/api/client.test.ts` pins that the helper returns NO hardcoded Edge fallback on `[]` from both endpoints - this is the regression insurance against the original symptom.

## Audiobook progress dialog: the SSE listener belongs in the context, not in the component

- Previously the `EventSource` lived in the `AudioExportProgress` modal. As soon as the user minimized or a re-render happened, the listener was rebuilt and events were lost - or worse, the job was gone after `clear()` because the modal was the only place holding live state.
- Solution: the entire SSE lifecycle (open/onmessage/close) now lives in `AudiobookJobProvider`. Phase, event log, current/total/currentTitle, downloadUrl/chapterFiles - everything is in the context. Modal and badge are pure consumers and do not talk to each other.
- Reload recovery: jobId+bookId+bookTitle are mirrored into `localStorage` (`bibliogon.audiobook_job`). On provider mount a `useEffect` checks whether a persisted job exists and reactivates the SSE connection. The badge reappears after F5, the modal stays minimized (no pop-up in the user's face).
- The persisted entry is cleared on the `stream_end` event. Otherwise a reload would bring back a job that already finished.
- Important convention: chapter numbers are pure display logic. `formatChapterPrefix(index, total)` builds "01 | Foreword" / "003 | Foreword" - the TTS engine still only gets the bare chapter title, no number, no pipe. The SSE event carries `{type, index, title, duration_seconds}` as separate fields; the frontend does the formatting. A test in `tests/test_generator.py` pins that `chapter_done` ships a `duration_seconds` field, a Vitest test in `AudioExportProgress.test.ts` pins that the frontend NEVER renders "Chapter X:".
- BookEditor now reads `?view=metadata` from `useSearchParams`, so the badge can call `navigate("/book/{id}?view=metadata")` after completion and the tab is already open. `setShowMetadata` was wrapped into `_setShowMetadata` that keeps the query param and state in sync.

## Generated audiobook files must be persisted

- Before v0.10.x exported audiobook MP3s only existed in the job worker's temp dir. As soon as the user closed the progress dialog the only copy was gone - with ElevenLabs (paid) this is real data and money loss.
- Solution: after a successful `_run_audiobook_job`, all generated files are copied to `uploads/{book_id}/audiobook/` (chapters/ + audiobook.mp3 + metadata.json). The endpoints `GET/DELETE /api/books/{id}/audiobook` plus `/merged`, `/chapters/{name}` and `/zip` expose them again for download.
- Important: persistence runs inside `try/except` and must NEVER fail a successful job. Prefer logging; the file is still downloadable from the temp dir.
- The persistence endpoints live in the backend core (`backend/app/routers/audiobook.py`), NOT in the audiobook plugin. This keeps downloads accessible regardless of plugin state.
- Regeneration warns before overwriting: `POST /api/books/{id}/export/async/audiobook` responds with HTTP 409 + `{code: "audiobook_exists", existing: {engine, voice, created_at, ...}}` as soon as `audiobook_storage.has_audiobook(book_id)` is true. The frontend shows a confirm dialog with the existing metadata and calls the same endpoint again with `?confirm_overwrite=true`.
- Plugin setting `audiobook.settings.overwrite_existing: true` skips the 409 - user request: "there is also a config for the overwrite but the warning should stay", so the frontend confirm is kept as a second safety net.
- Backup: `GET /api/backup/export?include_audiobook=true` includes the persistent audiobook directories. Default is false because MP3 backups quickly grow to 100+MB per book.

## ElevenLabs API key does NOT belong in .env

- The ElevenLabs API key was previously read only from the `ELEVENLABS_API_KEY` env var. That is opaque for users: no UI, no test button, no error message when the key is missing.
- Solution: `audiobook.yaml` now has an `elevenlabs.api_key` block, fed through `POST /api/audiobook/config/elevenlabs` (verified before save against `GET https://api.elevenlabs.io/v1/user`). `tts_engine.set_elevenlabs_api_key()` gets the key on plugin activate and on every POST.
- The env var stays as a fallback - existing installations with `.env` do not break.
- The key is NEVER returned in clear text in GET responses. The frontend only shows `{configured: bool}` and offers a "key stored" indicator + delete button.
- These endpoints live in the backend core like the persistence endpoints, so key management stays accessible regardless of plugin state.

## Audiobook export is async with SSE progress

- The endpoint `POST /api/books/{id}/export/audiobook` must NEVER return an MP3 synchronously. Audiobook generation takes minutes; any synchronous path blocks the request thread and gives the user nothing visible.
- Required shape: the client sends `POST /api/books/{id}/export/async/audiobook`, gets back `{job_id}`, and subscribes to `GET /api/export/jobs/{job_id}/stream` (Server-Sent Events).
- The old sync route `GET /api/books/{id}/export/audiobook` now intentionally responds with HTTP 410 + a pointer to the async path. The regression test `test_sync_audiobook_route_returns_410` fires if anyone turns the endpoint back on.
- Progress events emitted by the generator: `start`, `chapter_start`, `chapter_done`, `chapter_skipped`, `chapter_error`, `merge_start`, `merge_done`, `merge_error`, `done`. The route wrapper adds `ready` (with `download_url`) and `JobStore.update()` appends the synthetic `stream_end` so SSE subscribers exit cleanly.
- Frontend uses the browser-native `EventSource` (no package required). The modal is `modal=true` and cannot be dismissed via Escape/click-outside until the job is in a terminal status - otherwise the user orphans jobs with a stray click.
- Generator callbacks must never kill the export: `progress_callback` calls are wrapped in `try/except` and only log. A broken subscriber must NOT destroy an hour of TTS work.
- Tests must run through `with TestClient(app) as c:`, otherwise FastAPI's lifespan does not fire and the plugin manager never mounts the audiobook/export routes (404 instead of 410). Always mock the TTS engine via `patch("bibliogon_audiobook.generator.get_engine", ...)`.

## Async in the FastAPI lifespan

- Inside the `async def lifespan(app)` handler the uvicorn event loop is already running. `asyncio.new_event_loop()` + `loop.run_until_complete(...)` is forbidden there and crashes with "Cannot run the event loop while another loop is running".
- When a helper like `sync_edge_tts_voices` needs to run a coroutine during startup: make the function `async` and `await` it in the lifespan, do NOT build your own loop.
- Symptoms when done wrong: `RuntimeWarning: coroutine '...' was never awaited` plus the loop conflict ERROR in the startup log.
- Other callers of the same function (CLI targets in the Makefile, sync FastAPI endpoints) have to follow along: `asyncio.run(...)` in the CLI, `async def` + `await` in endpoints.

## Config migration (bool -> enum)

- When a boolean setting is extended to an enum with more options (e.g. audiobook `merge: true|false` -> `merge: separate|merged|both`): ALWAYS introduce a `normalize_*` function that silently translates old bool values (True -> "merged", False -> "separate") and maps unknown/None values to the default.
- Reason: user configs in YAML, backups (.bgb) and DB columns still contain old bool values. A hard schema validation would break existing installations. The default in the Pydantic schema is not checked for migration by the type system.
- In practice: the normalization MUST happen on both the backend (generator/service layer) AND the frontend (state init from settings), so both sides share the same migration rules. Otherwise old configs show the wrong default in the UI.
- Tests: one explicit migration test per bool value, plus pass-through for all enum values, plus default for None/unknown.

## HTML-to-Markdown conversion

- NO regex-based converter for nested HTML structures.
- Use an HTMLParser-based converter that tracks nesting depth.
- Specifically for <ul>/<li>: correct 2-space indentation per level.

## Deployment

- Default port: 7880 (not 8080, too often taken).
- /api/test/reset ONLY in debug mode (BIBLIOGON_DEBUG=true).
- CORS configurable via BIBLIOGON_CORS_ORIGINS (not hardcoded).
- SQLite path configurable with Docker volume persistence.
- BIBLIOGON_SECRET_KEY is auto-generated by start.sh when not set.
- Non-root user in the Dockerfile.

## Licensing

### license_tier attribute
- PluginForge's BasePlugin is an external PyPI package - do NOT modify. Instead set `license_tier` as a class attribute directly on the plugin classes.
- `_check_license` in main.py reads `getattr(plugin, "license_tier", "core")` - the default is "core" (backward-compatible).

### Trial keys
- Trial keys use `plugin="*"` as a wildcard in the payload. `LicensePayload.matches_plugin()` must treat `"*"` explicitly as match-all.
- Trial keys are stored under the key `"*"` in `licenses.json`, not under the plugin name.
- Expiry: always use `date.today()` (UTC), not `datetime.now()`. `date.fromisoformat()` expects the "YYYY-MM-DD" format.
- `_check_license` must check both the per-plugin key and the wildcard key (fallback chain).

### Settings UI
- The `discoveredPlugins` API delivers `license_tier` and `has_license` per plugin. Currently all plugins are free (`license_tier = "core"`). The Licenses tab has been removed from Settings.

## General patterns

- Before writing a custom implementation: check whether a library/extension already solves it.
- On CSS problems: check specificity first (.ProseMirror context).
- On import problems: check whether the source format (Markdown) is converted to HTML correctly.
- On export problems: check whether HTML is converted back to Markdown correctly.
- Test roundtrips: import -> editor -> export -> epubcheck.

## Code structure

### Avoid God Methods
- Route handlers longer than 50 lines must be decomposed.
- Typical symptom: if/elif cascades for different formats/types in one handler.
- Solution: ExportContext dataclass + one function per format group + testable helper functions.
- Every extracted function must be testable without reconstructing the whole request context.
- See coding-standards.md "Function design" for the correct pattern.

### Testability as a design criterion
- If a function is hard to test (lots of mocking needed), that is a signal of bad design.
- Service functions must have no FastAPI dependencies (no Request, no Response, no Depends).
- Helper functions (validate_format, build_filename, detect_manual_toc) must be callable with simple parameters.
- Data classes (dataclass, TypedDict) instead of loose dicts for context between functions.

### Error-handling mistakes we made
- HTTPException thrown directly from services. Makes services untestable without a FastAPI context. Solution: our own exception hierarchy (BibliogonError).
- Bare `except Exception: pass` in plugin code. Errors vanish silently. Solution: catch specific exceptions, at least log them.
- External tool errors (Pandoc subprocess.CalledProcessError) passed up unwrapped. The user sees a cryptic error message. Solution: ExternalServiceError with a clear service name.
- Frontend: API calls without catch. User clicks "Export" and nothing happens. Solution: always try/catch with toast feedback and finally for the loading state.

### Error reporting rules
- Error details must make a GitHub Issue directly actionable, without follow-up questions.
- Chain: BibliogonError (detail + str(e)) -> API response (detail + traceback in debug mode) -> frontend ApiError -> toast with "Report issue" button -> GitHub Issue (title, stacktrace, browser, app version).
- EVERY except block MUST call logger.error() with exc_info=True.
- EVERY except block MUST include str(e) in the BibliogonError subclass (NOT HTTPException).
- EVERY frontend catch block MUST call toast.error() with the ApiError object, NOT just with a string.
- Generic error messages like "Export failed" or "Import failed" without details are FORBIDDEN. They make GitHub Issues worthless.
- File upload functions (fetch instead of request()) must throw ApiError on failure, not Error.
- The global exception handler in main.py logs every unhandled error with its stacktrace.
- In debug mode the backend response includes the stacktrace (for the "Report issue" button).

## Plugin settings: visible or INTERNAL, never hidden

Plugin settings are either UI-visible (user-relevant) or marked `# INTERNAL` (YAML-only). Hidden active settings that influence user behavior are a bug, because the user has no way to change the behavior without a YAML editor and repo access.

Dead settings (in the YAML but not read by the code) are just as bad: they are a lie to the user. When refactoring a plugin, always check whether old YAML fields are still consumed before leaving them in place.

Generic plugin settings panel on the frontend: renders booleans as a checkbox, numbers as a number input, strings as a text input, arrays as an OrderedListEditor, objects as a JSON textarea with an "Advanced" hint. Rendering a boolean as a text input (`value="true"`) is a UX bug because the user cannot tell it is a switch.

Configuration values that vary between books MUST live on the Book model, NOT in the plugin YAML. Plugin YAML is plugin-global and applies to all books at once - anyone who needs per-book granularity adds a column (see the pattern on `Book.audiobook_overwrite_existing`).

## Review architectural decisions before implementing

From the V-02 incident: there was a near-implementation of a
backup-compare feature (V-02) that would have been built in
parallel with the already-planned Git-based backup feature. Only
by cross-checking against todo-prompts.md did the conflict
become visible.

Rule: before implementing a larger architectural decision, check:
1. ROADMAP entries in the area
2. todo-prompts.md for already-planned changes
3. docs/journal/ for earlier discussed decisions

On a conflict between a user instruction and documented planning:
STOP and explicitly ask the user which version applies.
Never build parallel systems that are already slated for deletion.

## Content-hash sidecar files as a "was this already processed?" pattern

- The audiobook generator writes a `.meta.json` sidecar next to each chapter MP3 containing `{content_hash, engine, voice, speed}`. The hash is SHA-256 of the plain text extracted from TipTap JSON. On re-export, `should_regenerate()` reads the sidecar and compares all four fields. A mismatch on any field triggers regeneration; a full match lets the generator reuse the existing file with zero TTS cost.
- This pattern generalizes: any long-running deterministic process where re-running on unchanged input is wasteful can use sidecar fingerprint files. The sidecar stays next to the output artifact, travels with it through copy/persist operations, and is authoritative for "is this output still current?" decisions.
- Key design decision: the sidecar includes ALL parameters that affect the output (content + engine + voice + speed), not just the content hash. Changing from Edge-TTS to ElevenLabs with the same text invalidates the MP3 even though the text is identical. Always fingerprint the full parameter set.
- Pre-audit for the three-mode regeneration dialog assumed a new DB schema was needed for content-hash tracking. The sidecar files already provided it. Lesson: before designing new infrastructure, check whether existing persistence artifacts already carry the information you need.
