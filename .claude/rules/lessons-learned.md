# Known pitfalls and patterns

These rules come from real development and solve problems that would otherwise come back over and over.

## End-to-end behavior tests are not "kwarg passes through" tests

The MEDIUM-IMPORT-FRONTEND-UI-01 session (2026-05-09) shipped a Settings UI that wrote 4 user-toggleable settings to `backend/config/plugins/medium-import.yaml`. The plugin's `activate()` read them into `self._settings`. The test suite included a smoke test confirming `_settings == {"download_images": False}` was set correctly. **It all looked working.**

What was actually broken: `routes.py` called `import_zip(contents)` with no kwargs. None of the settings ever flowed from the plugin into the importer. Every import ran the hardcoded defaults — for the 209 articles already imported AND for the next year's worth of new imports if nobody had noticed.

The smoke tests passed because they only verified "the dict landed in `self._settings`". They never asserted the settings produced an observable behavioral difference at import time. The wiring gap was invisible to the tests because the tests were testing the wrong layer.

The fix in the `SETTINGS-WIRING-01` session establishes a hard rule: every settings flag MUST have at least one test that flips the flag to a non-default value and asserts an OBSERVABLE behavioral difference. Concretely:

- `default_status="draft"` → assert `Article.status == "draft"` after import
- `skip_existing_canonical_urls=False` → re-import the same archive and assert a DUPLICATE row appears in the DB
- `download_images=False` → assert the downloader function is NEVER called (capture all invocations) AND body URLs stay CDN-hosted in the persisted doc
- `image_download_timeout_seconds=7` → capture the kwargs passed to `download_images` and assert `timeout_seconds == 7.0`

The pattern that the smoke-test class followed:

```python
# WRONG: this passes whether or not the setting reaches import_zip
def test_setting_propagates():
    plugin = make_plugin({"settings": {"default_status": "draft"}})
    plugin.activate()
    assert plugin._settings["default_status"] == "draft"
```

The pattern the behavior tests follow:

```python
# RIGHT: this fails if the setting doesn't reach the importer
def test_setting_default_status_propagates_to_article(client, db):
    body = _post_zip_with_settings(
        client, _build_zip([fixture]), {"default_status": "draft"}
    )
    article = db.query(Article).filter(Article.id == body["imported"][0]["id"]).one()
    assert article.status == "draft"
```

The behavior test reaches through every layer the production request reaches through (HTTP endpoint → plugin config injection → settings translator → import_zip kwargs → service code → DB) and asserts at the OUTPUT. Smoke tests of intermediate layers are fine to add for diagnostic granularity, but they are NOT a substitute for at-least-one end-to-end behavior test per setting.

This rule generalizes beyond settings:

- Feature flag (`audiobook_overwrite_existing`, etc.) → at least one test flips the flag and asserts observable change in the produced artifact.
- New endpoint kwarg → at least one test passes a non-default value and asserts the behavior the kwarg controls.
- Plugin config → at least one test sets the value and asserts the consumer of that value behaves differently.

The 2026-05-09 retroactive fix added 6 such tests to `test_medium_import_endpoint.py`. The smoke-test pattern is not banned (it's still useful for diagnosing where in the chain a regression broke), but it cannot be the only coverage of a flag's behavior.

## TipTap image node in Bibliogon is `imageFigure`, not `image`

Bibliogon's editor ([frontend/src/components/Editor.tsx](../../frontend/src/components/Editor.tsx)) does NOT load `@tiptap/extension-image`. It loads `@pentestpad/tiptap-extension-figure`, which registers its node under `name: "imageFigure"`. `@tiptap/extension-image` IS in `package.json` but is never imported.

Consequence: any TipTap doc that contains a plain `{type: "image", ...}` node fails the editor's strict ProseMirror schema. The unknown node breaks doc construction and the editor renders empty — for the WHOLE doc, not just the image.

Anyone writing an HTML→TipTap converter, a TipTap-emitting importer, or generating TipTap JSON from any other source (AI, scraper, migration) MUST emit `imageFigure`, not `image`. Same attrs (`{src, alt, title}`) — the imageFigure node spec is `content: "inline*"` so omitting `content` is fine; the schema accepts both `{type, attrs}` and `{type, attrs, content: []}`.

Symptom of the wrong type: title + metadata appear in the editor chrome, the editor body is empty, no console error in the browser (ProseMirror logs the schema rejection at debug level only). The article-list dashboard shows everything fine because it reads `Article.title` directly, not `content_json`. The bug is invisible until someone actually opens the editor.

Why this is easy to miss:
- TipTap's official docs and tutorials universally use `image` in code samples, so any importer modeled on those docs gets the type wrong by default.
- The toolbar's image-upload button works regardless: `Figure.addCommands.setImage(...)` dispatches an `imageFigure`-typed node internally, masking that the schema doesn't accept the literal name `image`.
- The editor's own markdown serializer at [Editor.tsx:1396](../../frontend/src/components/Editor.tsx#L1396) handles `type === "image"` as if it expected to see one, which is misleading; the serializer is reading nodes already in the doc, where they would only appear if some other extension produced them.

If a switch to `@tiptap/extension-image` ever happens (e.g. dropping the Figure extension), be aware that both extensions register a `setImage` command. Adding both side-by-side will silently shadow one toolbar behavior.

Walker shipped with this bug originally (commit `b986397`); fix landed in `cfd8b57` along with a regression-pin test in `tests/test_walker.py::test_image_node_type_is_imageFigure_not_image` that fails loudly with the actionable error message if the type ever regresses to `image`. A one-time data-fix script at `scripts/fix_medium_import_image_nodes.py` patched the 209 already-imported articles (152 had image nodes; 451 nodes total renamed).

## Bulk operations earn page-route UX even when single-item siblings use modals

Existing import surfaces in Bibliogon are modals (`ImportWizardModal` opened from Dashboard + ArticleList — single book, single article, single project, single git repo). The new `/articles/import/medium` page deliberately diverges to a top-level route. The deciding factors:

1. **Bulk operations have multi-minute processing time.** A single-item import is sub-second to a few seconds; a 200-post Medium archive with image downloads runs 30-60 seconds (often longer). A modal that locks the screen for that long is hostile.
2. **Structured results need review surface, not just acknowledgement.** Single-item imports produce one outcome ("imported" or "failed"); bulk imports produce a 3-section table (imported / skipped / errored) the user genuinely reads, sometimes for several minutes.
3. **Stable URL matters for help-doc deep links.** "Open Bibliogon → Articles → click Importieren button → select Medium" is multi-step verbal instruction; a direct URL is one click. For features with longer learning curves (the Medium import has 4 settings worth explaining) the help-doc anchor is real value.
4. **Pattern-adherence is not an end in itself.** Diverging knowingly for a use-case-specific reason is fine; diverging by accident is not. The decision was surfaced explicitly to the user — including the audit-finding that the original "matches existing pattern" reasoning was based on a misconception (no `/import` route existed) — and confirmed before any code shipped.

When choosing route vs modal for a new import / batch surface:
- Sub-second processing + single-result outcome → modal, match the import-wizard pattern.
- Multi-second-to-minute processing + structured table outcome + worthwhile help-doc surface → page route, document the divergence in the commit + an archive entry.

## React 18 dev-mode double-effect-mount strands `mockImplementationOnce`

React 18 in development mode (Strict Mode and/or its testing-library equivalent) deliberately mounts components twice and runs effects twice to surface non-idempotent setup. Combined with happy-dom + Vitest, the result is that a `useEffect` calling an API mock fires twice on the first render.

If the test sets `mockImplementationOnce(returnValue)` per test, the FIRST useEffect call consumes the implementation and the SECOND call falls through to the default `vi.fn()` (which returns `undefined`) — the component then sees the default empty state and the test fails on a stale assertion.

Fixes:
- **Use `mockImplementation(...)` (no `Once`).** The implementation persists across both effect mounts. Per-test `afterEach { mock.mockClear() }` (NOT `mockReset`) keeps the implementation alive across test boundaries while still resetting call history.
- **Set a default implementation in the `vi.mock` factory itself**, e.g. `getPlugin: vi.fn(async () => ({ settings: {} }))`. Tests that don't care about the response can rely on the default; tests that do override per-test via `mockImplementation`. `mockClear` (not `mockReset`) preserves the factory default between tests.

The `mockClear` vs `mockReset` distinction matters specifically because of the factory-default pattern: `mockReset` strips the factory's implementation and the next test starts with a vanilla `vi.fn()` returning undefined, which crashes the next render's `useEffect` chain with `Cannot read properties of undefined (reading 'then')`.

## XHR mocks need a function constructor, not an arrow

`vi.stubGlobal("XMLHttpRequest", vi.fn(() => fakeXhr))` fails at runtime with `TypeError: () => fakeXhr is not a constructor`. Arrow functions cannot be invoked with `new`.

The simple fix: stub with a regular function expression, which JS allows as a constructor: `vi.stubGlobal("XMLHttpRequest", function () { return fakeXhr; })`. The `return` of an explicit object from a constructor-called function replaces the implicit `this` instance, which is exactly what we want here — the test's pre-built `fakeXhr` object becomes the result of `new XMLHttpRequest()`.

Generalizes to any global that callers invoke with `new` (`WebSocket`, `Worker`, etc.). Stubbing such globals with arrow functions silently breaks; stubbing with a regular function or a class works.

## Alembic `fileConfig` silences every existing logger

`migrations/env.py` is generated from Alembic's template, which calls `fileConfig(config.config_file_name)` unconditionally. Two side effects burn time on the day your INFO logs stop appearing:

1. **`disable_existing_loggers=True` is the default.** Every `logging.Logger` created BEFORE `init_db()` (in our app: at least `app.main`'s module-level logger) is disabled. Subsequent `logger.info(...)` calls drop to the floor.
2. **The root logger level is reset** to whatever `[logger_root] level = ...` says in `alembic.ini` (`WARNING` in this repo). So even fresh loggers created after the call inherit the lower level.

**Symptom**: you see `Starting Bibliogon` (logged before `init_db()`), then alembic's own setup messages, then your subsequent INFO lines silently disappear. Plugin loading still WORKS — routes mount, the app responds — but the audit trail is dark. Burned several debugging hours on the v0.30.0+ medium-import session by treating "no plugin loading log = plugin not loading" as a true causal link.

**Fix**: in `migrations/env.py`, gate the `fileConfig` call so it only fires when the FastAPI app has not already configured logging:

```python
import logging
from logging.config import fileConfig
...
if config.config_file_name is not None and not logging.getLogger().handlers:
    fileConfig(config.config_file_name, disable_existing_loggers=False)
```

The standalone `alembic` CLI invokes env.py before any handler is attached (`logging.getLogger().handlers` is empty), so the guard preserves the documented CLI behaviour. Embedded use through `init_db()` runs under the FastAPI/uvicorn handler stack and skips the call.

**Generalises to**: any library that ships an env.py-style hook calling `fileConfig`/`dictConfig` at import time. Wrap the call in a "have handlers already?" check whenever the same module is imported in two contexts (CLI vs. embedded).

## Plugin settings YAML lives in `backend/config/plugins/`, not in the plugin's own directory

PluginForge reads each plugin's settings from the backend-wide `config_dir`, configured in `app.yaml` as `plugins.config_dir: config/plugins`. So the canonical path for a plugin's settings file is:

```
backend/config/plugins/{plugin_slug}.yaml
```

NOT `plugins/bibliogon-plugin-{slug}/config/{slug}.yaml`. The latter is fine for shipping the file inside the plugin's distributable ZIP, but at runtime PluginForge looks ONLY in the backend's config_dir.

**Symptom**: the plugin loads and activates, but `self._settings = self.config.get("settings", {})` returns an empty dict. User-visible settings silently fall back to in-code defaults; the YAML you wrote is never read. The startup log shows it as a single DEBUG line:

```
DEBUG  pluginforge.config: Config file not found, using empty defaults:
       backend/config/plugins/{slug}.yaml
```

That line has appeared in the wild for one shipped-without-defaults plugin (`medium-import` v1) and would have for any future plugin that follows the same wrong-place template.

**Mitigation**: when scaffolding a new plugin, drop the settings YAML directly into `backend/config/plugins/`. Mirror it inside the plugin's own `config/` only if the plugin's ZIP target needs it.

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

## Dependency currency in active development

In active development projects, dependency versions should be kept current from day one. Shipping with end-of-life or deprecation-imminent versions creates technical debt immediately.

Rules:
- Only stable releases, no beta/RC/alpha versions ever in production code
- "Latest stable" means most recent version that has proven stable (minimum 2 weeks since release)
- For LTS products (Node.js), prefer Active LTS over Current
- Review dependencies at each release cycle: run `poetry show --outdated` and `npm outdated` before cutting any release
- Major version bumps get their own commit with migration notes
- Routine minor/patch bumps can be batched by category

Red flags for outdated dependencies:
- Deprecation warnings in build output
- End-of-life announcements in package READMEs
- Security advisories against installed versions
- Upstream pins blocking other upgrades (e.g. manuscripta ^0.8.0 blocking Pillow 12)

Upstream blockers: when an external dependency (e.g. manuscripta) pins a transitive dep (e.g. pillow <12), the bump is deferred until the upstream releases a compatible version. Document the blocker in the commit that updates what it can, so the next sweep picks it up.

## Release-cycle dependency review

Before cutting any release, run dependency currency check:
- `poetry show --outdated` in backend and each plugin
- `poetry show --outdated` in launcher
- `npm outdated` in frontend

Apply routine bumps (patch + minor + low-risk minor) as part of release prep. Defer major bumps to dedicated sessions with their own testing cycle.

Never ship with:
- End-of-life versions
- Deprecation-imminent versions (forced migration within 6 months)
- Versions with known unpatched P0 bugs

Stability filter:
- Latest stable only, never beta/RC/alpha
- Minimum 2 weeks since release for new major versions
- For LTS products (Node.js), prefer Active LTS over Current

## install.sh VERSION drift

- `install.sh` pinned `VERSION="v0.7.0"` as the default, but Dockerfile and docker-compose.prod.yml evolved significantly after that tag. The v0.7.0 compose used `build: ./backend` (backend-only context), while current uses `context: .` (repo root). Plugins live at `<repo>/plugins/` which is entirely outside the v0.7.0 build context, so `poetry install` inside the container could never find them.
- The fix for the original Docker bug (commit 59cf3d6) was verified by building from the local working tree, not by running install.sh end-to-end. The local build used the current compose/Dockerfile; install.sh used the ancient tagged version. The verification test was wrong because it didn't test the actual user flow.
- Rule: when fixing an install/deployment script, always test THE SCRIPT, not just the artifacts it references. `docker build -f Dockerfile .` is not the same test as `./install.sh` because the script may select a different version of the files.
- install.sh now pins to the latest release tag (updated as part of the release workflow, Step 4). Users can override with `BIBLIOGON_VERSION=vX.Y.Z` for older versions.
- Corollary: install scripts are a special class of code where the test must simulate the actual distribution path. CI that tests scripts should run them the way users run them, not the way developers run them. `docker build -f Dockerfile .` from a working tree is not the same test as `curl ... | bash` which downloads, checks out a tag, and then builds.
- 2026-05-04 SSoT refactor: install.sh became a generated artifact built from `install.sh.template` + `backend/pyproject.toml` via `scripts/generate_install_sh.sh`. The committed install.sh stays in git because users curl-pipe it directly from the raw GitHub URL; it cannot be a build-time artifact hidden behind .gitignore. Treat it like generated docs: edit the template, regenerate at release time, commit both. `verify_version_pins.sh` runs `--check` to catch drift between template and committed output.

## Single source of truth for version pins

Every duplicated version constant is a stale-pin bug waiting to happen. The 2026-05-04 audit chain found seven such pins across launcher, frontend, install.sh, and one plugin - three were already stale (8 versions, 13 versions, and 3 versions behind the canonical pyproject.toml / package.json). Each had drifted because the release workflow listed them as bullets to manually update, with no enforcement.

Architecture goal (Java/Maven precedent): ONE version per subsystem in a canonical packaging file; everything else derives.

**Canonical sources (hand-edited at release):**
- `backend/pyproject.toml` for the Python subsystem
- `frontend/package.json` for the JS subsystem
- Each `plugins/<name>/pyproject.toml` for its own plugin (plugins have independent versions)

**Derivation patterns by language and runtime:**

| Subsystem | Pattern | Why |
|-----------|---------|-----|
| Python (publishable distribution) | `importlib.metadata.version("<dist-name>")` with `PackageNotFoundError` fallback | Standard. Reads packaging metadata; cannot drift. |
| Python (`package-mode = false`, e.g. backend app) | `tomllib.load(open("pyproject.toml", "rb"))["tool"]["poetry"]["version"]` | importlib.metadata is unavailable when Poetry doesn't register a distribution. tomllib is stdlib in 3.11+. |
| Bash installer (chicken-and-egg before clone) | Generate the script at release time from a template; substitute placeholder from canonical pyproject. Commit the generated artifact. | Runtime parse impossible because pyproject doesn't exist when curl-pipe runs. GitHub-API-at-runtime is non-deterministic and brittle. |
| Frozen binary (PyInstaller) | Build-time injection: spec script writes a generated `_build_info.py`, gitignored, that the binary embeds. Dev fallback reads pyproject directly. | importlib.metadata is unreliable inside PyInstaller's frozen tree. |
| Frontend (Vite) | `define` block reads package.json at build, exposes `__APP_VERSION__` literal. TypeScript declares `declare const __APP_VERSION__: string;` in `vite-env.d.ts`. | Build-time literal substitution. Zero runtime cost, zero bundle overhead. |

**Always include a fallback sentinel** (e.g. `"0.0.0+unknown"` with a `logger.warning`) when the derivation can fail at runtime (file missing, distribution not registered). Silent fall-through to a hardcoded number masks environmental problems.

**Always include regression detectors** in `verify_version_pins.sh`: grep patterns that fail the check if a hardcoded literal reappears in the "DO NOT EDIT" tier. Workflow checklists alone are not enforcement; a script that exits non-zero on regression is.

**Never** add a hardcoded version constant "for convenience" (e.g. for use in a GitHub-Issue body template, a footer string, or an OpenAPI metadata field). Always reference the derived single source.

## Hotfix cluster tag policy

When a release tag fails CI for a mechanical reason (chmod bit
missing, formatter nit, type-check escape, build-time spec error)
and a fix lands quickly via point-release bumps, the failed tag
stays in the repository as historical record - it does not get
deleted. Reasons:

- The v0.26.0 release-gate run, even though it failed, is part
  of the release audit trail (run ID `25328065614`).
- Deleting a published tag is a force-push class operation per
  CLAUDE.md security rules; allowed only when nobody pulled the
  tag and no GitHub Release was published. The latter is
  satisfied for failed-gate tags but the former requires
  asserting nobody fetched in the meantime.
- Each tag's commit reflects the state at the moment of the
  bump. Future bisects can use them.
- The shipped tag's `changelog/releases/v0.X.Y.md` file
  documents the hotfix history (see v0.26.3.md "Hotfix
  history" section as the template).

Current cluster preserved as-is: `v0.26.0` (release-gate failed
on chmod), `v0.26.1` (launcher builds failed on PyInstaller
spec `__file__`, CI failed on mypy), `v0.26.2` (CI failed on
ruff-format), `v0.26.3` (all green; the shippable tag).

Do delete a tag only when it was pushed in the last few minutes
and the user explicitly confirms no one could have pulled. The
default is keep + document.

## Subsystem lock-step + tooling, not checklists

Per-subsystem SSoT (one canonical pyproject per Python subsystem, one canonical package.json for the JS subsystem) was the first half of the fix. The second half is **lock-step propagation by tooling, not by human attention**. A 7-row checklist that says "edit every file" fails every time someone forgets a row; the 2026-05-04 audit chain found three pins that had drifted by 8, 13, and 3 versions respectively across multiple releases.

Architecture, post-2026-05-04 lock-step:

- **One canonical version per language subsystem** (backend/pyproject.toml, frontend/package.json). Hand-edited at release time.
- **`make sync-versions`** (`scripts/sync_versions.py`) propagates the canonical to every other version-bearing field: launcher pyproject + spec plist + `__init__.py` literal, all plugin pyprojects, frontend package.json (when needed), `install.sh` regen via the existing template helper. The tool is the only thing that touches those files.
- **`make sync-versions-check`** + `verify_version_pins.sh` enforce lock-step in a tight loop. The verify script also runs the subsystem-lock-step check inline.
- **CI gate** (`.github/workflows/release-gate.yml` on tag-push, plus the same checks inlined as the first step of every launcher build job's `release: created` path). Artifact attachment is blocked on drift. Tag pushes cannot be retroactively undone, but the gate failure surfaces the drift loudly and prevents downstream artifact publication.

Rules for working in this codebase:

- **Do not hand-edit any version field except `backend/pyproject.toml`.** Even the assistant doing the work follows this rule. If the assistant bypasses the tool and edits a downstream pyproject directly, the tool's value is zero from day one. Run `make sync-versions` and let the diff speak.
- **Each release commit's diff for non-canonical version fields must be reproducible by re-running `make sync-versions` from a clean checkout.** That's the bisect contract: any historical commit can be re-derived from `backend/pyproject.toml` + the tool.
- **A new subsystem with its own version field**: add it to `scripts/sync_versions.py`'s `collect_targets()` AND the regression detector in `verify_version_pins.sh` AND the CI gate. Three artifacts per new pin; never one or two.
- **The `--check` mode of every sync/verify script must be idempotent**: running it twice in a row produces the same answer, never writes, never depends on environment state beyond the repo. CI relies on that property.
## Diagnostic features must fail open

- Diagnostic and convenience features should fail open. A feature that prevents bad behavior (double-launch, stale cache, etc.) must not block the application's primary function when it fails. Crashing the app because a convenience check crashed is always worse than silently skipping the convenience check.
- Concrete example: the launcher's lockfile check (`another_instance_alive`) crashed with `TypeError: argument of type 'NoneType' is not iterable` because `tasklist` returned `stdout=None` on a Windows locale edge case. This prevented every user from starting the launcher at all. The fix: wrap in try/except that fails open (log warning, proceed).
- This applies beyond lockfiles. Any startup check, guard, or health probe that gates the main application flow should be wrapped so that a failure in the check degrades gracefully rather than killing the app.

- Shallow clone update trap: `git clone --depth 1 --branch v0.7.0` creates a repo where `origin/main` does not exist as a remote ref. A later `git fetch origin` does not fix this because the fetch refspec was configured for the tag, not for branch tracking. `git checkout -B main origin/main` then fails with "pathspec 'main' did not match". The fix is to not try to update shallow clones in place at all. Delete and re-clone (backing up .env first) is the only reliable cross-platform approach. Surgical git state repair across shallow clone versions, platforms, and git implementations is a losing battle.

## TypeScript 6 no longer auto-includes all `@types/*`

- TS 5 silently included every `@types/*` package from `node_modules` when the `types` compilerOption was absent. TS 6 stopped doing this: if `@types/node` is installed transitively but not named in `types`, `import fs from "node:fs"` fails with `TS2591: Cannot find name 'node:fs'`.
- Concrete: `frontend/src/components/ChapterSidebar.test.tsx` imports `node:fs`/`node:path` to load fixture data. Worked under TS 5 (`@types/node` came in transitively via `happy-dom`/`vite`/`vitest`). Broke on TS 6 bump.
- Fix: add an explicit `@types/node` devDependency AND list it in `tsconfig.json` under `"types": ["node", "vite/client"]`. Both halves are needed - installing the package alone does not bring it in on TS 6.
- Applies going forward: any `@types/*` you want in scope under TS 6 must be named in `types` explicitly.

## `@types/node` major bumps cascade into tsconfig `lib`

- `@types/node@22` shipped polyfilled lib augmentations (e.g. typing `Array.prototype.at()` even under `lib: ES2020`). `@types/node@24` dropped them, deferring entirely to whatever lib the project declares. Symptom on a ^22 → ^24 bump: `TS2550: Property 'at' does not exist on type 'any[][]'. Do you need to change your target library? Try changing the 'lib' compiler option to 'es2022' or later.` even though no source code changed.
- This is NOT a breakage in `@types/node`; it is correct behavior. The earlier convenience was the anomaly.
- Fix at the consuming repo: bump `tsconfig.json` `target` and `lib` to `ES2022` together with the `@types/node` major bump. `Array.prototype.at()` is ES2022 standard library. Vite 8 / esbuild emit ES2022 fine; runtime is Node 24 / modern browsers. Zero source-side changes required.
- General rule: when bumping `@types/node` across majors, run `tsc --noEmit` in the same change window. If it newly fails on stdlib globals, bump `lib` to match the runtime ES level - do NOT carry per-call workarounds (`as any[]`, casts) and do NOT pin `@types/node` back to the old major.
- Concrete bump landed 2026-05-07 in commit on `main` after the v0.28.0 cycle: `^22.19.17` → `^24.12.2`, `target` + `lib` ES2020 → ES2022, 8 `.at(-1)` sites in `PreviewPanel.test.tsx` cleared without modification.

## Vite 7 requires Node 20.19+ / 22.12+

- Vite 7 uses Node's `crypto.hash` top-level API which landed in Node 20.12+ / 21.7+ (backported to 22 LTS). On Node 18, `vite build` fails with `[postcss] crypto.hash is not a function` coming from `vite-plugin-pwa`'s postcss handling. The error is misleading: it is not a PWA/postcss bug, it is a Node version issue.
- Vitest 4 does NOT exercise the same code path, so `npm run test` can still pass on Node 18 even though `npm run build` fails. Do not rely on tests alone to validate a Vite major bump; always build too.
- CI runs Node 24 (`.github/workflows/{ci,coverage}.yml`), which is fine. Local envs on Node 18 must upgrade to Node 24+.

## Vite 8 migration (DEP-09 + SEC-01)

- `vite-plugin-pwa@1.3.0` (published 2026-05-06) added Vite 8 to its peer-dep range (`^3.1.0 || ^4 || ^5 || ^6 || ^7 || ^8`) and unblocked the bump. The CVE chain `workbox-build` -> `@rollup/plugin-terser` -> `serialize-javascript` (3 high-severity advisories: GHSA-5c6j-r48x-rmvq RCE + GHSA-qj8w-gfj5-8c6v DoS) clears as a side effect; `npm audit --audit-level=high` returns zero high findings after the bump. The unrelated moderate `uuid` advisory (GHSA-w5hq-g745-h8pq) stays open and is its own track.
- **Vite 8 (Rolldown) requires `manualChunks` as a function, not an object.** Vite 7 used Rollup, which accepted both forms. Vite 8 ships Rolldown by default, which only accepts the function form. Symptom: `Invalid output options ... For the "manualChunks". Invalid type: Expected Function but received Object` followed by `TypeError: manualChunks is not a function at rolldown/dist/shared/...`. Fix: convert the package-list-per-chunk object to a function that matches the module id and returns the chunk name. Use a trailing slash (`id.includes('/node_modules/${pkg}/')`) to prevent prefix collisions (`react` vs `react-dom` vs `react-router-dom`). The `id` is always an absolute path; bare-package matching is unreliable.
- DEP-04 landed Vite 6 -> 7 deliberately because vite-plugin-pwa 1.2.0 did not yet ship Vite 8 compat; DEP-09 + SEC-01 paired in one session because both items resolve on the same upstream release.
- Vitest 4 covers the matrix `vite: ^6 || ^7 || ^8`; bumping Vite alone keeps Vitest configuration untouched. The `@vitest/coverage-v8` peer-dep is exact-pinned to its own Vitest version, so when bumping Vitest itself bump both in lockstep or `npm install` will downgrade the parent.
- The check that caught this in production was the build step, not the test step (per `lessons-learned.md` rule "Do not rely on tests alone to validate a Vite major bump; always build too"). Vitest 707/707 passed with the broken `manualChunks` config. `npm run build` was the first signal.

## AI Review extension (v0.20.0)

### Backup import must check soft-delete state before dedup

- `backup_import._restore_book_from_dir` previously treated any pre-existing `Book.id` in the DB as "already imported" and returned False. That check predates the soft-delete / trash feature: a backup made before trashing silently could not be restored once the books had been moved to trash - the importer saw them in the DB (with `deleted_at` set) and refused to rebuild.
- Fix: when the pre-existing row is soft-deleted, HARD-delete it along with its chapters + assets, then fall through to the fresh-insert path. Do NOT try to revive via per-attribute setattr: the backup JSON does not carry every NOT NULL column (`ai_tokens_used`, `created_at`, `updated_at`), so SQLAlchemy emits an UPDATE that sets those to NULL and the integrity constraint trips. Hard-delete + fresh-insert sidesteps the whole partial-update dance and matches the backup's snapshot semantics.
- Generalizes: any "idempotent by id" import path added before a soft-delete feature becomes silently buggy. Always branch on `deleted_at IS NULL` when deduping.

### manuscripta `run_export` moves `output/` to `backup/` on every call

- `manuscripta.export.book.run_export` copies the existing `project_dir/output/` to `project_dir/backup/` at the start of every invocation and creates a fresh `output/`. A list of per-format output paths collected across a batch-export loop contains stale paths by the time the loop finishes.
- Symptom in v0.19.x: `FileNotFoundError` at `zipfile.ZipFile.write(f, f.name)` inside `/api/books/{id}/export/batch`, referencing a file that existed moments earlier.
- Fix: after each `run_pandoc` call, IMMEDIATELY copy the produced file into a stable staging directory (`tmp_dir/batch/`) and zip from there. Do NOT keep references to files under `project_dir/output/` across subsequent `run_export` calls.

### Pandoc-wrapped metadata.yaml is a multi-doc YAML stream

- The project exporter wraps `metadata.yaml` in Pandoc-style `---` / `---` document markers. PyYAML's `safe_load` expects exactly one document and raises `yaml.composer.ComposerError` on any trailing `---` (even if the second document is empty).
- Fix: use `yaml.safe_load_all(f)` and return the first non-empty document. Handles both the bare and the Pandoc-wrapped shapes in one code path.
- Regression: `smart_import` crashing with 500 on a ZIP that `/api/backup/export` had just produced.

### CSS specificity trap: `h2 + p` loses to `p:not(:first-child)`

- Specificity for `[data-app-theme="classic"] .ProseMirror h2 + p`: (0, 1, 1, 2) - 1 attr, 1 class, 2 elements.
- For `[data-app-theme="classic"] .ProseMirror p:not(:first-child)`: (0, 1, 2, 1) - 1 attr, 1 class + 1 pseudo-class = 2 "classes", 1 element. The pseudo-class pushes the base rule ahead of the adjacent-sibling override.
- When both rules match (a paragraph that directly follows a heading AND is not the first child), the higher-specificity `:not(:first-child)` wins and the heading override never applies.
- Fix: append `:not(:first-child)` to each `h* + p` override. Combined (0, 1, 2, 2) beats the base (0, 1, 2, 1).
- Generalizes: any CSS override against a `:not(:first-child)` base rule needs at least the same pseudo-class weight.

### TipTap `useEditor` does NOT flush `editor.storage` reads to React

- Inline reads like `{editor?.storage.characterCount?.words()}` in JSX do not update reliably on every content transaction. TipTap's built-in re-render fires on selection changes, not every content edit.
- Two viable patterns:
  1. **`useEditorState` selector** (TipTap-idiomatic). Wraps `useSyncExternalStore`, subscribes to the editor's transactionNumber, re-runs the selector per transaction.
  2. **`useState` + `editor.on('update')` listener** (plain React). Manually `setWordCount(...)` on every update event.
- Choose pattern 2 when running under React `StrictMode` + Playwright + Vite dev server. `useSyncExternalStore` under that combination produced stale renders even though storage updates fired (issue #12). The plain-listener path bypasses `useSyncExternalStore` entirely. `frontend/src/components/Editor.tsx` uses pattern 2.
- Cleanup: always pair `editor.on('update', cb)` with `editor.off('update', cb)` in the same `useEffect` cleanup to avoid leaks across hot-reload cycles.

### Prefix testid selectors match every nested testid that shares the prefix

- A selector like `[data-testid^='book-card-']` cleanly matches each card root AND every nested child testid that shares the prefix (`book-card-menu-{id}`, `book-card-menu-delete-{id}`). `toHaveCount(N)` returns `2N` or more per visible card.
- Fix: `[data-testid^='book-card-']:not([data-testid*='-menu-'])`, or give the root a distinct testid like `book-card-root-{id}`.
- Same shape as the `[class^=""]` overmatch antipattern. Always test a prefix selector against the full rendered surface before shipping.

### IndexedDB recovery draft `contentHash` is a MATCH check, not a MISMATCH

- `frontend/src/db/drafts.ts#checkForRecovery` returns a draft iff `draft.contentHash === hashContent(serverContent)` AND `draft.content !== serverContent`. The contract is "this draft was written against THIS server state, local content is newer". Seeding a test draft with `contentHash: '_mismatch_'` will NOT trigger the recovery banner.
- A misleading test comment saying "must differ from server hash" burned multiple sessions before the `checkForRecovery` source was re-read.
- When writing tests that seed IndexedDB, compute the hash of the real server content inside the seed script rather than using a sentinel value.

## German content uses real umlauts

Production German content uses proper UTF-8 umlauts (ä, ö, ü, ß),
NOT ASCII transliterations (ae, oe, ue, ss).

### Where this applies (real umlauts required)

- i18n catalogs (`backend/config/i18n/de.yaml`).
- User documentation (`docs/help/de/**/*.md`).
- Plugin German content (under any `*/content/de/`).
- README German sections (currently none; English-only).
- CHANGELOG German entries (rare; quoted UI strings only).
- Journal entries written in German prose.
- Any other user-facing German text.

### Where ASCII stays

- Source code (`*.py`, `*.ts`, `*.tsx`, `*.js`, `*.jsx`).
- Code comments, docstrings (English convention).
- Variable / function / class / identifier names.
- File names, directory names.
- Git branch names, commit messages.
- This chat with the user (per the user's style preference,
  ASCII-only in chat communication).

The chat-style rule and the production-content rule are
deliberately different. Production text is authored for end
readers; the chat is a working channel.

### Tooling

`scripts/find_umlaut_candidates.py`, `scripts/replace_umlauts.py`,
`scripts/build_in_scope_list.py`, and
`scripts/discover_unknown_umlauts.py` implement a whitelist-based,
reviewable workflow:

1. Run `python3 scripts/build_in_scope_list.py` to regenerate
   `/tmp/in-scope-files.txt` from the policy below.
2. Run `python3 scripts/discover_unknown_umlauts.py` to find any
   ASCII transliterations NOT yet in `KNOWN_WORDS`. Add real
   German words to the whitelist (one entry per declined form);
   add false positives to the script's `NOT_TRANSLITERATIONS`
   set so future runs stay quiet.
3. Run `python3 scripts/find_umlaut_candidates.py` against the
   expanded whitelist; review `/tmp/umlaut-candidates.json`.
4. Run the replacer with `--dry-run` first; review diffs.
5. Apply per-file with `y / N / q` prompts; after 5 clean
   replacements the prompt offers `a` (yes-to-all) — only opt in
   when every prior diff was clean.
6. Re-run the finder to confirm 0 remaining candidates.
7. UTF-8 readback every changed file before committing.

Scope policy (encoded in `build_in_scope_list.py`):

In scope:
- `backend/config/i18n/de.yaml`
- `docs/help/_meta.yaml` (display labels are German prose)
- `docs/help/de/**/*.md`, `docs/journal/**/*.md`,
  `docs/explorations/**/*.md`
- `docs/CHANGELOG.md`, `docs/CONCEPT.md`, `docs/ROADMAP.md`,
  `docs/backlog.md`
- `plugins/*/content/de/**/*.md`,
  `plugins/*/bibliogon_*/content/de/**/*.md`
- `README.md`

Explicitly NOT in scope (do not add):
- `.claude/rules/*.md` — rules are English; only the policy
  examples reference umlauts as illustration.
- Source code (`*.py`, `*.ts`, `*.tsx`) — identifiers stay ASCII.
- Auto-translated non-DE i18n YAMLs (es/fr/pt/tr/ja/el/en) —
  separate diacritic-coverage track (I18N-DIACRITICS-01).

The finder masks Markdown code regions (fenced + inline +
indented). For YAML / config files (suffix `.yaml` / `.yml`), the
indented-code rule is skipped because YAML indentation is data,
not code. Word-boundary regex (`\b...\b`) prevents partial
matches inside compound identifiers.

### Why this matters

ASCII transliteration looks unprofessional to German readers and
can break Pandoc / EPUB export rendering when the surrounding
text uses proper umlauts (the mixed-encoding pattern is the
worst case — same file, two styles, output renders as garbage).

### Known regression pattern

Mixed-encoding files (BOTH real umlauts AND ASCII transliterations
in the same paragraph) are not tooling regressions but author-
style drift: typing in an environment without a German IME, then
copy-pasting UTF-8 text from elsewhere. There is no
heading / code-fence / section boundary to predict it.
Mitigation: the scripts above run cleanly per-session against
any new German prose; the `roadmap-archive-reminder` pre-commit
hook can be extended later to add an umlaut check the same way.

## Global CSS rules: distinguish viewport containers from app container

Setting `overflow: hidden` on `html, body, #root` as a single rule blocks document scroll but also blocks every full-page component that relied on scroll (Settings, Dashboard, GetStarted, Help).

Correct pattern when preventing document-level scroll for editor zoom behavior:

```css
html, body { height: 100%; overflow: hidden; }  /* viewport lock */
#root { height: 100%; overflow-y: auto; }       /* app scroll */
```

html and body control the browser viewport. `#root` is the React application root and must remain scrollable for pages that don't implement their own scroll container.

When a layout fix requires setting `overflow: hidden` on one of the three, think explicitly about whether full-page components inside the app need internal scroll, and expose it via `#root`.

### Incident record

- `ef7ce5c`: added `html, body, #root { overflow: hidden; }` as fix for Issue #11 (chapter sidebar at 150% zoom). Broke scroll on Settings, Dashboard, GetStarted, Help pages.
- `c25483e`: split the rule. Kept html/body locked (preserves zoom fix), restored `#root overflow-y: auto`.

## Filesystem isolation: production data lives outside the project tree

Production Bibliogon data NEVER lives in the project tree. All paths resolve via `app.paths` helpers (`get_data_dir`, `get_config_dir`, `get_cache_dir`, `get_upload_dir`, `get_db_path`) which use platformdirs (XDG-conformant) by default and respect a `BIBLIOGON_DATA_DIR` (etc.) env-var override. Resolution is **always** via fresh function calls, never via frozen module-level imports.

Default locations (Phase 2 swap, 2026-05-04):

- Linux/macOS: `~/.local/share/bibliogon/`
- Windows: `%LOCALAPPDATA%\bibliogon\`
- Tests: a `tmp_path_factory`-managed dir, set by `backend/tests/conftest.py` before any `app.*` import
- Docker: `/app/data/` via `BIBLIOGON_DATA_DIR=/app/data` in compose, mounted as the named `bibliogon-data` volume

Three layers of protection prevent test runs from touching production data:

1. **Production marker file**. Production directories contain a `.bibliogon-production` marker (written by the FastAPI lifespan via `app.paths.mark_data_dir_as_production`). If tests ever see one, the entire run aborts with `pytest.exit(returncode=2)`.
2. **Test conftest sets `BIBLIOGON_DATA_DIR`** to a tmp dir before any `app.*` import. The autouse session fixture also asserts the resolved path looks like a tmp location.
3. **All path access via helpers**, never via CWD-relative `Path("foo")` and never via frozen module-level imports.

**Forbidden patterns:**

- `UPLOAD_DIR = Path("uploads")` at module top level
- `from app.routers.assets import UPLOAD_DIR` (frozen import)
- `Path("data") / "X"` anywhere in production code

**Required pattern:**

- `upload_dir = get_upload_dir()` inside the function that uses it.

If `make test` aborts with exit code 2, check what path was mounted via `BIBLIOGON_DATA_DIR`. NEVER delete the marker just to make the test pass; investigate why a test pointed at production. Origin: April 2026 data-loss incident — DB tripwire landed in `a4cf7cf`, filesystem tripwire + paths.py in the same period.

### Phase 2 migration

Users with v0.25.0-and-earlier data in the project tree (`backend/bibliogon.db`, `backend/uploads/`) get auto-migrated on first start after the platformdirs swap. Helper: `app.data_dir_migration.migrate_data_dir_if_needed`, run from the FastAPI lifespan BEFORE `init_db()`. Properties:

- Idempotent (`.migration-complete` marker short-circuits)
- Fail-loud on conflict (RuntimeError if both legacy and target hold the same item; silent merge would corrupt data)
- Breadcrumb at old paths (`.migrated-YYYY-MM-DD` file beside each moved item)
- Skipped in test mode (`BIBLIOGON_TEST=1`)

Rule: when adding a new persistent path under `get_data_dir()`, also add it to `_legacy_paths()` in `data_dir_migration.py` if a v0.25.0-and-earlier code path could have written to a different location. Otherwise users lose data on the next upgrade.

## Two installation paths diverge: `make test` vs per-plugin CI

Bibliogon's plugins are installed two different ways depending on context:

- **`make test` path:** the backend's combined `poetry.lock` resolves every plugin as a path-dep (`bibliogon-plugin-{name} = {path = "../plugins/...", develop = true}`). One `poetry install` from `backend/` brings every plugin's external deps in via the backend's lock.
- **CI plugin-matrix path:** `.github/workflows/ci.yml` and `.github/workflows/coverage.yml` run `poetry install --no-interaction --no-ansi` **inside each plugin directory** against THAT plugin's own `poetry.lock`. The backend lock is irrelevant here.

When a shared external dep (e.g. fastapi) bumps in every pyproject (backend + 10 plugins), the backend lock and the per-plugin locks drift independently. If only the backend lock gets regenerated:

- `make test` is green (the backend lock satisfies all path-deps; the per-plugin locks are not consulted).
- CI is red (the per-plugin `poetry install --no-interaction` aborts with `pyproject.toml changed significantly since poetry.lock was last generated`).

This shape bit during the v0.30.0 release: the pre-v0.30.0 dep sweep bumped fastapi `^0.135.0 → ^0.136.0` in 11 pyproject.toml files, but `poetry lock` was only run in `backend/`. Local `make test` passed; CI was red on main from `be4b6f3` until hotfix `3232fad` re-locked all 10 plugin lockfiles.

**Generalization:** any time there are two installation paths for the same code, BOTH must be tested at gate time. The backend's combined lock and the per-plugin locks are different gates; verifying one does not verify the other. The pre-v0.30.0 retro called this out at the meta level ("verify the gate before trusting it"); this is the concrete recurrence.

**Mitigation pattern (now enforced):**

- `make lock-all-plugins` (Makefile target shipped in PLUGIN-LOCKFILE-DRIFT-01 commit `1b43aec`): iterates `plugins/bibliogon-plugin-*/` and runs `poetry lock` in each. Use after any shared-dep pin bump.
- `make verify-plugin-locks` (Makefile target shipped in the same commit): runs `poetry install --dry-run --no-interaction --no-ansi` per plugin and greps for "changed significantly". Exits 1 with a remediation hint on drift; manual diagnostic, NOT in the pre-tag chain (the pre-commit hook below + the CI per-plugin matrix already cover the right times).
- Pre-commit hook `plugin-lock-paired-with-pyproject` (shipped in commit `8f6fcea`): scoped via `files: ^plugins/bibliogon-plugin-[^/]+/pyproject\.toml$`, fails when a staged plugin pyproject lacks a paired staged `poetry.lock`. Catches the operational mistake at commit time. Verified by 6 hook self-check tests in `backend/tests/test_plugin_lock_drift_hook.py` (commit `e31c4fd`), all green at 0.22 s.
- Discovery channel without these gates: CI red on main, AFTER a release tag has already been cut. The retro's commitment to "discrete pre-release dep sweep commits" pays off (rollback granularity stays intact), but the better gate is to catch the drift before push, not from the GitHub Actions red badge.
