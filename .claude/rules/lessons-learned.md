# Known pitfalls and patterns

These rules come from real development and solve problems that would otherwise come back over and over.

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
- The persistence endpoints live in the backend core (`backend/app/routers/audiobook.py`), NOT in the premium-licensed audiobook plugin. Otherwise a user with an expired license could no longer retrieve their already-generated files.
- Regeneration warns before overwriting: `POST /api/books/{id}/export/async/audiobook` responds with HTTP 409 + `{code: "audiobook_exists", existing: {engine, voice, created_at, ...}}` as soon as `audiobook_storage.has_audiobook(book_id)` is true. The frontend shows a confirm dialog with the existing metadata and calls the same endpoint again with `?confirm_overwrite=true`.
- Plugin setting `audiobook.settings.overwrite_existing: true` skips the 409 - user request: "there is also a config for the overwrite but the warning should stay", so the frontend confirm is kept as a second safety net.
- Backup: `GET /api/backup/export?include_audiobook=true` includes the persistent audiobook directories. Default is false because MP3 backups quickly grow to 100+MB per book.

## ElevenLabs API key does NOT belong in .env

- The ElevenLabs API key was previously read only from the `ELEVENLABS_API_KEY` env var. That is opaque for users: no UI, no test button, no error message when the key is missing.
- Solution: `audiobook.yaml` now has an `elevenlabs.api_key` block, fed through `POST /api/audiobook/config/elevenlabs` (verified before save against `GET https://api.elevenlabs.io/v1/user`). `tts_engine.set_elevenlabs_api_key()` gets the key on plugin activate and on every POST.
- The env var stays as a fallback - existing installations with `.env` do not break.
- The key is NEVER returned in clear text in GET responses. The frontend only shows `{configured: bool}` and offers a "key stored" indicator + delete button.
- These endpoints live in the backend core like the persistence endpoints, because the audiobook plugin is premium and users should still be able to configure their key even when the license is not active for other reasons.

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
- The `discoveredPlugins` API delivers `license_tier` and `has_license` per plugin. The values are derived from the plugin YAML (`license` field) and the LicenseStore/validator.
- Premium plugins without a license: "Enter license" button instead of a toggle. No enable/disable.

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
3. docs/chat-journal for earlier discussed decisions

On a conflict between a user instruction and documented planning:
STOP and explicitly ask the user which version applies.
Never build parallel systems that are already slated for deletion.
