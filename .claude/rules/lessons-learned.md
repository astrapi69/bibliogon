# Known pitfalls and patterns

These rules come from real development and solve problems that would otherwise come back over and over.

## Bulk-operation limits should be per-operation cost-profile

The bulk-delete feature shipped with a 200-row cap copied from the existing `bulk-export` precedent. First real use surfaced the symptom: with 209 imported articles, "Alle auswählen" tripped the cap and both Export AND Löschen disabled. Export's cap is justified (pandoc per row + asset round-trips → minutes); delete's was not (one DB UPDATE / DELETE per row → sub-second).

Rule: every new bulk-operation must justify its limit against its own cost profile, not copy the neighbour's. Concretely:

- **Compute-heavy operations** (pandoc, TTS synth, image processing, AI calls): cap stays. Picked from "what completes in 60-180 s server-side per batch."
- **DB-bound operations** (soft-delete, hard-delete, status toggle, tag attach): **uncapped** by default. SQL bulk operations scale to thousands of rows trivially; an artificial cap creates the worst-of-both UX where "select all" tells the user they cannot do what they obviously want to.
- **Network-bound external operations** (publish-to-platform, sync-to-git): cap reflects the slowest external call's timeout, not the local processing.

Anti-pattern observed and rejected: "uniform cap across all bulk operations so the UX is consistent". The cost profile is what dominates the UX; pretending all operations have the same profile **is** the inconsistency.

Concrete change from this incident: `MAX_BULK_DELETE` removed from `backend/app/routers/bulk_delete.py`. Pydantic field keeps `min_length=1` (empty body stays a 422) but drops `max_length`. The frontend Löschen button gates on `count < 2` only — no `overLimit` check. Bulk-export's `BULK_LIMIT_HARD = 200` stays unchanged because pandoc's cost-profile is real.

## Bulk-action UX: action-bar + selection-hook decoupling stays useful

The bulk-delete feature shipped fast because the existing `ArticleBulkActionBar` / `BookBulkActionBar` + `useArticleSelection` / `useBookSelection` hooks were already decoupled from any specific operation. The hook holds `Set<string>` of selected IDs plus filter-aware `selectAll(ids)` that takes an explicit list. The bar is pure-presentational, taking the count + handlers. The page wires whatever operation it wants.

Adding bulk-delete meant adding two optional props (`onBulkDelete`, `onBulkDeletePermanent`) to each bar and the corresponding handlers in the page. No restructuring; no risk to the existing bulk-export flow; no changes to the selection hook.

Rule for future bulk operations (bulk-edit-status, bulk-tag, bulk-export-variant, etc.):

- Add optional handler props on the bar. Don't push operation-specific UI into the hook.
- Selection state stays orthogonal to the operations that consume it.
- Filter-aware `selectAll` callers (`filters.filteredArticles.map(a => a.id)`) are the canonical "operate on the visible-after-filter set" pattern. Don't second-guess; future bulk operations will want exactly this.

What NOT to do:
- Don't add per-operation state to the selection hook (e.g. `useArticleSelection` should never know whether the current operation is "delete" vs "export").
- Don't fork the bar into per-operation components (`ArticleBulkDeleteBar` is wrong; one bar that takes operation handlers is right).
- Don't centralize bulk-operation logic into a higher-order component. The page-level handlers (each with its own toast / refresh / error semantics) are the right place. Centralizing it would force every operation to fit one shape.

## Medium HTML exports strip every SEO meta tag

Verified across the 209-post production corpus: no `<meta name="description">`, no `og:title`, no `og:description`, no `og:image`, no `<html lang>`. Only `<title>` (which equals the article H1) and `<section data-field="subtitle">` survive.

Implications for importers / scrapers consuming Medium's HTML export:

- Don't bother parsing for `<meta>` or `<og:*>` tags. They're gone.
- The only authored SEO-adjacent signal is the subtitle/kicker section. Use it as `seo_description` default; leave `seo_description` NULL for posts without one. Don't fall back to body-text slicing — table-of-contents fragments and intro labels poison that.
- Tags are also stripped. Don't heuristic-derive them. If your app has an AI-generate-tags path, that's the canonical refinement; importer should ship with empty tags.
- Language detection has to be statistical (langdetect or similar) — Medium's export carries no `lang` attribute on `<html>`, `<body>`, or `<article>`.

This rule generalizes: any "export your data" feature from a SaaS platform tends to strip metadata that the platform considers internal (SEO, analytics tags, A/B-test flags, platform-specific IDs). When auditing an importer for "what signals does the source preserve?" check explicitly for the metadata you assume is there — production sample sweep beats reading the upstream docs.

## Walker iterating repeated containers: prefer `find_all` over `find`

The medium-import walker shipped with `section.find("div", class_="section-inner")` which returned only the FIRST match. Medium's standard header-image layout puts THREE `section-inner` divs per `<section class="section--body">` (title, image lane, main body). The bug silently dropped the entire main body of every Medium post that used the standard layout, for ~33% of the production import. The pre-walker tests didn't catch it because the existing fixtures had small inner[2] sections relative to the rest of the body, masking the loss in their pass-rate ratio.

Rule for any future walker / scraper / HTML-shaped consumer:

- Whenever a container can repeat under the same parent (CSS class match, attribute selector, etc.), use `find_all` and iterate. Use `find` only when you have a structural guarantee that there is ONE — i.e. element with a unique id, root element, etc.
- Tests for repeated-container walks must include at least one fixture where a non-first occurrence carries the bulk of the content. The "all fixtures pass overall ratio check" smoke is not enough; the multi-occurrence-with-content-distributed-late shape is its own structural class.
- When patching a `find` to `find_all`, immediately check the broader corpus (ideally a real production sample) for cases where the old code silently lost data. Don't trust the existing test pass-rate to confirm the patch was unnecessary.

This generalizes beyond CSS-class lookups. The same shape — "we got the first match and assumed there was one" — appears in: regex `re.search` vs `re.findall`, SQLAlchemy `query.first()` vs `query.all()`, dict-from-list-of-pairs comprehensions that silently dedup keys.

## User impression of scope is anchored on what they noticed, not what's broken

User reported "einige" (a few) Medium articles imported with truncated content. Spotted ONE specific article. Systematic survey before patching revealed 117/209 (56%) had content loss; 9 imported with literally zero text. The user's "einige" was based on how many articles they happened to notice during normal use, not a count of the broken set.

Same session: user reported "some German articles correctly detected as German". DB inspection showed 207 English + 2 German rows, both German rows with `updated_at > created_at` — the user had manually corrected those two. The walker did no language detection at all. The user's "correctly detected" was a false memory of their own manual edits.

Rule:

- When a user reports a bug with quantitative scope ("a few", "most", "sometimes"), treat the count as a starting hint, not authority. Run a systematic survey (DB query, corpus sample, log scrape) BEFORE scoping the fix. The actual scope can easily be 10x what the user noticed.
- When a user reports MECHANISM ("X is detected as Y"), trust the SYMPTOM but verify the mechanism in code. Users are reliable observers of "it doesn't work as I expected"; their inferences about WHY are often shaped by hopeful priors ("surely there's some detection somewhere"). Read the code path before acting on the inference.
- The pre-inspection report must include the survey results when the user's report was quantitative. "User said few; survey shows N=X" is a separate bullet, not a parenthetical. The discrepancy itself is information.

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

## AI-prompts embedded in data files beat per-call system-prompts for portability

UNIVERSAL-AI-TEMPLATE-01 Session 1 (2026-05-12) shipped a
self-explanatory `.biblio.yaml` template format where every
fillable field carries three keys (`description`, `example`,
`current_value`) and a top-of-file comment block carries the
rules-for-AI text (fill `current_value` only, respond in the
article's language, real UTF-8 characters, leave null when
uncertain). The rules live inside the file rather than being
passed as a system prompt at API call time.

Consequence: the same artefact works across THREE workflows
without any code branching:

1. Built-in AI: Bibliogon's existing AI-provider abstraction
   reads the YAML at runtime, builds its own system+user
   prompts (`backend/app/ai/article_template_prompts.py` /
   `book_template_prompts.py`), and calls the configured
   provider. The rules-in-file are redundant here but harmless.
2. Custom local endpoint (LM Studio / Ollama): same Bibliogon
   code path; `app.ai.llm_client.LLMClient` is endpoint-
   agnostic.
3. External AI via YAML round-trip: the user pastes the YAML
   into Claude.ai or ChatGPT with zero Bibliogon context. The
   rules-in-file are load-bearing here — they are the ONLY
   instruction the AI sees. The AI reads them, fills
   `current_value` per the rules, returns valid YAML, the user
   uploads it back, the import pipeline applies it.

Why this matters more broadly: a feature that depends on
runtime-injected system prompts can only run inside the
application's call path. A feature whose semantics travel
WITH the data artifact can run anywhere — paid cloud APIs,
free-tier playgrounds, local laptops, chat sessions, even
hand-edits by a human author. The same `.biblio.yaml` exported
from Bibliogon can be filled in any of those contexts and
re-imported.

Generalizes to: file formats that consumers might want to
process outside the originating app. If the file carries its
own "what this is + how to fill it" preamble, downstream
tools (AI assistants, scripts, manual editors) work without
out-of-band documentation. Pure data with no embedded
instructions forces every consumer to know the schema, which
is a coordination cost the schema-owner pays forever in
documentation churn.

Concrete artifact constants in `app.ai.template_schema`:
`ARTICLE_HEADER` and `BOOK_HEADER`. Each is a multi-line
comment block written once, regenerated on every export. PyYAML
silently drops comments on import — that's fine because the
header is documentation regenerated downstream, not a contract
the import path enforces.

## React `useEffect` deps + i18n test mocks: the `t` function isn't stable

Symptom: a component's fetch-on-open effect kept failing in tests
because the `setError` call in the rejection branch never landed.
Looked like a race condition but wasn't. The effect's dep array
included the i18n `t` helper:

```typescript
useEffect(() => {
    let cancelled = false
    api.something.fetch(...)
        .then(...)
        .catch((err) => {
            if (cancelled) return
            setError(...)
        })
    return () => { cancelled = true }
}, [open, kind, ids, t])  // <-- t here
```

In production the i18n provider memoises `t` so the dep is stable.
In the test setup, the i18n mock returns a fresh `t` function on
every render:

```typescript
vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({t: (_k, fallback) => fallback, ...}),
}))
```

Result: every parent re-render produces a new `t`, so the effect
cancels its prior run and refetches. The rejection from the
previous run lands while the new run's `cancelled` closure is
still false, BUT the previous run set `cancelled=true` in its own
closure. The catch sees `if (cancelled) return` and bails out
before `setError` fires. The error never surfaces to the user.

Fix: omit `t` from the dep array when the request shape doesn't
actually depend on it (the fallback string in the toast was the
only consumer). Add an `eslint-disable-next-line` with a comment
explaining why:

```typescript
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [open, kind, ids])
```

Generalises to any hook function the i18n mock returns fresh per
render — `useDialog`, `useNavigate` (when its callback closure
captures state), etc. When a test fails because a state update
"never happens" but the production code looks correct, check the
effect dep array against the hooks consumed inside it.

The right fix is NOT to memoise the mock's `t` per-render (that
defeats the point of mocks). The right fix is to scope the
effect's deps to what genuinely affects the request.

## Three-workflows-share-one-format pattern (UI side)

UNIVERSAL-AI-TEMPLATE-02 Session 2 (2026-05-12) shipped the
frontend for the three-workflow feature whose backend Session 1
landed. The validating insight from Session 1's lessons-learned
("AI-prompts embedded in data files beat per-call system-prompts
for portability") plays out cleanly on the UI side too:

The same `AITemplatePanel` component drives all three workflows
without branching on the workflow:

- Workflow A (built-in AI): `Fill with AI` button -> internal
  `aiFill` API call.
- Workflow B (custom endpoint): same `Fill with AI` button, no
  code change; the existing AI client routes through whatever
  base_url is configured in Settings.
- Workflow C (external roundtrip): `Export template` +
  `Import filled template` buttons hand the user a `.biblio.yaml`
  and accept it back. Zero new UI surface for workflow C
  compared to A/B.

The component code knows nothing about WHICH workflow the user
is on. It just exposes three first-class buttons and the API
client picks the right backend endpoint. Workflow B is achieved
purely through configuration (Settings AI tab's "Custom"
preset); workflow C is achieved purely through the file format.

Generalises: when a feature has multiple "modes" that share an
underlying data contract, ship ONE UI component and let the
backend / config / file-format layer pick the mode. Branching
the UI by workflow ("if workflow A then show button X else
button Y") produces:

- N × the surface area to test
- N × the i18n strings
- N × the chance for the UI and the backend to drift

The `AITemplatePanel`'s three buttons + the unchanged
`api.{type}.aiFill` call cover all three workflows. No
`workflow: 'A' | 'B' | 'C'` prop anywhere in the component tree.

## SSE-in-context-not-in-modal (re-validated)

The AudiobookJobContext lessons-learned ("the SSE listener
belongs in the context, not in the modal") came up cleanly again
when designing `BulkAiFillJobContext`. The pattern works the
same way:

- Context provider holds the `EventSource` ref in `useRef`.
- `start(jobId, kind)` opens the stream + persists
  `{jobId, kind}` to localStorage.
- `useEffect` on mount checks localStorage and reconnects if a
  job is mid-flight (F5 recovery).
- Stream-end clears persistence.
- Dock + expanded modal are pure consumers that render based on
  context state; minimizing the modal doesn't disturb the SSE
  listener.

The cost is one global Context per long-running job type
(audiobook, bulk-AI-fill, future: bulk export with progress).
The benefit is that the user can navigate freely while the job
runs, the badge persists across route changes, and reloading
the browser doesn't drop the connection. Both surfaces (dock
badge + expanded modal) are trivially testable because they're
just consumers of the context.

When adding the next long-running job type to Bibliogon, the
pattern to follow is: context provider holds the SSE state +
persistence, components consume it, never the other way around.

## Real-world data audit BEFORE implementation prevents spec-vs-reality drift

MEDIUM-COMMENTS-IMPORT-01 shipped with a three-criteria
detection heuristic in the original spec: body_length < 500
chars **AND** empty subtitle **AND** no structural elements.
Pre-inspection ran that heuristic against the actual 209-file
Medium export in the user's home directory before any code
landed. Two findings forced a spec revision:

1. **6 / 209 matched the original three-criteria heuristic.**
   That seemed reasonable on paper.
2. **The user's own reference comment case** ("Thanks for
   pointing that out — you're right, the link was missing.")
   was a **false negative**. The audit dug deeper: Medium
   auto-fills the `data-field="subtitle"` section with the
   second paragraph of the reply body when the author wrote
   no explicit subtitle. So the "empty subtitle" criterion
   never holds for those auto-filled cases, even though they
   are unambiguously comments.

Dropping the empty-subtitle criterion lifted detection from
**6 / 209 to 8 / 209** with zero new false positives across
the corpus. The two cases the original spec would have missed
both carry Medium's auto-filled subtitle.

The lesson generalizes:

- **Specs that predict a data shape are predictions, not
  contracts.** A heuristic that looks principled on paper can
  silently miss the cases that matter once you point it at
  real data.
- **Run the audit against actual data BEFORE writing code,
  not after.** "After" means the code is committed, possibly
  shipped, and the regression is harder to undo than to
  prevent. The medium-import walker session (2026-04-23) had
  the inverse cost: a `find` vs `find_all` bug silently
  truncated ~33% of imports for an entire release cycle, and
  the fix needed a one-off data-fix script + a regression-pin
  test. The MEDIUM-COMMENTS-IMPORT-01 audit caught the same
  class of bug BEFORE landing — no data-fix script needed,
  no production rows mis-classified.
- **The audit input doesn't have to be production data.** In
  the MEDIUM-COMMENTS-IMPORT-01 session, the production DB
  was empty (the user had cleared it), so the audit ran
  directly against the raw Medium HTML export in the user's
  Downloads directory. Working from the source bytes instead
  of the parsed-and-imported rows is often cleaner: the audit
  isolates the heuristic from walker / importer drift.
- **Surfacing the audit in the pre-inspection report** is
  what makes the decision visible. Without the report saying
  "6 / 209 under the spec, 8 / 209 with empty-subtitle
  dropped, the user's own reference case is in the missing
  2," the spec would have been confirmed unchanged. The
  report makes the discrepancy a decision point instead of an
  implementation surprise.

Concrete rule: when a feature ships with a heuristic, a
detection rule, a threshold, or any other prediction about
data shape, run the prediction against real data in
pre-inspection. Report counts + sample cases. Treat the spec
as the starting hypothesis, not the final design.

## Operational gaps masquerade as wired infrastructure

The 2026-05-12 test-infrastructure audit surfaced a concrete
example: the mutmut workflow at
``.github/workflows/mutation-import.yml`` had been WIRED in
the repo for 10 days (since 2026-05-02, commit ``28fe59c``)
but had NEVER produced a successful run. The nightly cron
was gated by the ``ENABLE_NIGHTLY_MUTATION`` repo variable
(not enabled); no maintainer had manually
``workflow_dispatch``-ed the workflow either. The audit
trigger was the first invocation.

The job completed in 1m12s (vs. 20-40min expected) because
``mutmut run`` errored during its initial
``run_stats_collection`` phase with
``BadTestExecutionCommandsException``. The exact pytest
invocation mutmut used (``--rootdir=. --tb=native -x -q
tests/``) succeeded cleanly when run by hand — so the
failure was inside mutmut's own pytest plugin, not pytest.
But until the workflow was actually triggered, this bug was
invisible: the YAML existed, the audit-doc
(``docs/audits/mutmut-2026-05-02-import.md``) carried the
note "TBD — pending first CI run", and the AGAR-feeling of
having mutation-testing-infra was at full strength.

The lesson generalizes:

- **"Wired" ≠ "working".** A workflow / hook / cron /
  scheduled job that was committed without being executed
  end-to-end is a hypothesis, not a feature. Audits should
  validate that wired infrastructure actually runs to
  completion, not just that the YAML / config exists.
- **The right time to flip such switches is at wire time,
  not at audit time.** A maintainer who wires mutmut /
  Hypothesis / any new pipeline should
  ``workflow_dispatch`` the workflow at least once before
  declaring the work done, and surface the artifact + result
  in the same PR / commit. The 2026-05-02 mutmut wiring
  shipped without this validation; the bug then lay dormant
  for 10 days.
- **Audits that find these gaps are doing their job.** The
  audit didn't fail to "implement mutmut"; it accurately
  reported that the wired mutmut workflow is operationally
  blocked, which is a more useful data point than another
  abstract "we should adopt mutmut" recommendation.

Concrete rule: when wiring a new CI workflow, schedule it,
or otherwise add infrastructure that runs on a delayed
trigger (nightly cron, on-tag, on-paths-only, gated by repo
variable), trigger it manually at least once in the same
session, download the artifact, and confirm the result is
what you intended. Document the first run's outcome in the
PR description or the related audit doc. A workflow that
ships without a known-good first run is technical debt
masquerading as feature delivery.

## Schema "preserved" / "always set" claims must survive real-data audit before becoming spec

MEDIUM-COMMENTS-IMPORT-01 shipped with prose in three
places (model docstring, English help doc, German help doc,
archive entry) describing the ``ArticleComment.responds_to_url``
field as "preserved for orphans + for future re-linking"
or "preserves the comment's own canonical URL." Both shapes
imply the field carries data. Reality, verified after the
fact: the v1 Medium importer sets the field to ``None``
universally (line ``responds_to_url=None`` in
``plugins/bibliogon-plugin-medium-import/bibliogon_medium_import/importer.py``),
and the pre-inspection audit on the user's 209-file export
already showed Medium's HTML carries no parent-reference
data to extract.

The drift was caught after the feature shipped, not before:

- Sometime AFTER MEDIUM-COMMENTS-IMPORT-01 closed, a smoke
  check surfaced 8 imported comments all with
  ``responds_to_url`` ``None``. The user asked to correct
  the spec.
- The factual error in the help docs was a separate
  mis-statement: the English wording conflated
  ``responds_to_url`` with the comment's own
  ``canonical_url``, which is a different field entirely.
  The pre-inspection had distinguished them but the help
  doc author (Claude Code, same session) merged the two
  concepts in the user-facing prose.

Two distinct anti-patterns surfaced:

1. **"Future-compatible" prose presented as current
   behaviour.** "Preserved for orphans" is true for the
   schema (the column is nullable, the storage path
   exists), but FALSE for the user's actual data (every
   row has ``None``). When the gap is 100%, calling the
   field "preserved" is misleading: the user reads the doc
   and expects data they will never find. Either say
   "reserved for future importers; v1 imports always
   ``NULL``", or say nothing and let the type signature
   carry the meaning.

2. **Help-doc prose drifting from importer-comment prose.**
   The importer comment in ``_persist_comment`` correctly
   said "responds_to_url is left NULL too in v1 (no
   inference); future importers that DO carry a parent
   reference can populate it." The help docs in the same
   commit chain disagreed. Single-pass authoring across
   three places drifted in two of them.

Concrete rules:

- When a schema field's actual production value is
  always-NULL / always-empty / always-zero for the only
  v1 use case, the docstring must say so explicitly.
  Pretending the field is populated leaks the schema's
  forward-compatibility ambition into the user's
  expectations.
- Help-doc prose that names a field MUST be cross-checked
  against the importer / writer code that populates it.
  A 30-second grep for the field name in the importer
  catches the drift; this audit caught it weeks later.
- When a pre-inspection audit produces a "Medium doesn't
  carry X" finding, every doc surface that mentions X in
  the resulting code should explicitly reference the
  audit finding. The audit is the spec.

## Export semantics audit: "comprehensive export" usually means "your data only"

Surfaced 2026-05-12 after a user verification on Medium's
HTML export. The 8 imported comments in the production
corpus are all replies the user wrote on OTHER people's
articles (visible under ``posts/`` like any other post).
Comments OTHER people wrote on the user's articles ("Wow,
I am very impressed", a real-world example) are NOT in the
export. Medium's own README.html says it plainly:
"posts: Posts you've written" — every folder description
follows the same "your data" framing.

This is the canonical pattern across consumer platforms:

- Medium: your posts, your claps, your replies-to-others,
  your bookmarks. NOT replies-to-you.
- Twitter / X: your tweets, your DMs you sent, your
  likes. NOT replies-to-your-tweets unless you screenshot
  them.
- Reddit: your posts, your comments. NOT the comments
  others left on YOUR submissions, unless they're in the
  same thread you replied in.
- Discord: your messages out. NOT messages others sent
  IN your servers.

The user's mental model — "give me everything connected
to my account, including how others interacted with me" —
is a reasonable expectation but rarely how data export
features work. Platforms ship "your data" exports for
GDPR / data-portability reasons; "everyone else's data on
your content" is someone else's data, not yours, so it
stays.

Concrete rules for any importer surface in Bibliogon:

- **Help-doc expectations management.** When a platform's
  export is "your data only", the help doc's "What is NOT
  imported" section must explicitly say so. The
  "comments-other-people-wrote" gap is exactly the kind
  of thing users discover by smoke-test and report as a
  Bibliogon bug; a one-paragraph disclaimer in the help
  doc pre-empts that.
- **The schema can still support the missing data type
  for forward compatibility.** Bibliogon's
  ``ArticleComment.imported_from String(50)`` column can
  carry ``"manual"`` for a future user-entry workflow.
  The column doesn't have to wait for a platform that
  exports incoming-comments; manual entry IS the
  workaround, and the schema is already prepared.
- **The "no Bibliogon bug" distinction matters.** When a
  user reports "X is missing", the diagnosis should
  separate "Bibliogon failed to import X" from "the
  source export never contained X." The second is a
  platform limitation, not a Bibliogon limitation; the
  fix is documentation + maybe a follow-up manual-entry
  workflow, NOT an importer change.

Concrete filed follow-up: ``MEDIUM-COMMENT-MANUAL-ENTRY-01``
(P5) captures the manual-entry path for the incoming-
comment archive use case.

## Run vitest from `frontend/`, not the repo root

Vitest's config lives in ``frontend/vite.config.ts``.
Running ``npx vitest run`` from the repo root finds no
config, defaults to the `node` environment, and produces
``ReferenceError: document is not defined`` across every
test that touches the DOM. In a real 2026-05-12 incident,
**101 of 120 test files failed** with this error before
I noticed the cwd was wrong — completely misleading red
flag suggesting something I'd just edited broke the entire
test environment.

Tells in the failure output:

- Per-file ``setup: 0ms`` (happy-dom didn't initialise).
- ``environment: 0ms`` in the summary line.
- The error itself: ``ReferenceError: document is not
  defined`` (or ``window`` / ``HTMLElement`` / similar).
- Files that passed earlier in the same session
  suddenly all fail.

Three reliable invocations:

- ``make test-frontend`` from anywhere (the Makefile
  cd's into ``frontend/`` before running vitest).
- ``cd frontend && npx vitest run`` — direct, fast,
  same result as the Makefile target.
- ``cd frontend && npx vitest run src/path/to/file.test.tsx``
  for a targeted re-run.

Failure modes:

- ``npx vitest run`` from repo root → no config found
  → wrong environment → 100% red flag on DOM-touching
  tests.
- ``poetry run vitest`` (mixed up with backend tooling)
  → vitest not in the Python venv → command-not-found.

Concrete rule: when a recent edit "breaks every vitest
file at once," check the cwd before suspecting the code.
A green run minutes ago in the same session and a red
run now with ``setup: 0ms`` is the cwd diagnostic, not a
regression.

## `poetry update` vs `poetry lock` semantics

Surfaced during the 2026-05-12 dep-update audit Phase 3.
The ``make lock-all-plugins`` target runs ``poetry lock``
per plugin. ``poetry lock`` validates that existing
resolutions still satisfy current pyproject constraints —
it does NOT refresh transitives to their latest within the
allowed range. ``poetry update`` does that.

So:

- **``poetry lock``** = "re-resolve from pyproject specs."
  Only meaningful after a pyproject pin changed. No-op when
  nothing in pyproject changed (the existing lock is still
  a valid resolution).
- **``poetry update <pkg>``** = "move this package (and its
  transitives) to the latest within range." Touches the
  lock; pyproject is unchanged unless the new version
  exceeds the caret.
- **``poetry update`` (bare)** = "move EVERY package within
  every range." Maximally aggressive; pulls every patch +
  every minor + every transitive-of-transitive. Risky:
  one low-risk direct bump can pull a high-risk transitive
  via the upstream's relaxed bounds (see next rule below).

The ``make lock-all-plugins`` target serves the "pyproject
changed" case (e.g. after a shared-dep pin bump propagated
to every plugin via ``sync-versions``). It is NOT a "pull
patch transitives" tool. Use ``poetry update <allowlist>``
per plugin for that purpose.

Concrete rule: when "the lockfile didn't change after
``make lock-all-plugins``", check whether any pyproject
changed. If none, the no-op is correct. If patch
transitives are still wanted, switch to a per-plugin
``poetry update`` with an explicit allowlist.

## Transitive deps can surface high-risk packages from low-risk direct bumps

Surfaced during the 2026-05-12 dep-update audit Phase 3,
on a single test plugin run before going wider.

Bare ``poetry update`` on ``bibliogon-plugin-help`` (one of
11 plugins, used as a pre-flight test) pulled:

- ✅ ``pydantic 2.12.5 -> 2.13.4`` (low-risk patch)
- ✅ ``idna``, ``packaging``, ``coverage``, ``pygments``
  (audit-low-risk batch)
- ⚠️ ``fastapi 0.135.3 -> 0.136.1`` (the plugin pins
  ``^0.136.0``, so 0.136.1 is in-range; backend is at
  0.136.0)
- 🚨 ``starlette 0.46.2 -> 1.0.0`` — explicitly
  audit-deferred as high-risk

Cause: FastAPI 0.136.1 relaxed its upper bound on
starlette. A transitive walk through this relaxed bound
pulled starlette 1.0, the package the audit had
specifically deferred. The plugin's lock was reverted
immediately (``git checkout`` + ``poetry install``
downgraded back to 0.46.2).

The general shape: **low-risk direct bumps can pull
high-risk packages transitively when the upstream
relaxes a bound.** Even an audit that correctly
categorised packages by direct risk can miss this if
the audit didn't model transitive cascades.

Concrete rule for any bulk-bump pass:

1. **Pre-flight a single instance before bulk-applying.**
   One test plugin / one test environment, never blind
   bulk. The 2026-05-12 audit caught the starlette
   surfacing on plugin #1 of 11; revert was cheap.
2. **Prefer ``poetry update <allowlist>`` over bare
   ``poetry update``.** The allowlist constrains which
   packages can move; transitives only move if their
   own version constraint demands it. Example for the
   plugin-Pydantic alignment use case:
   ``poetry update pydantic pydantic-core`` (NOT
   ``poetry update``).
3. **If the audit deferred a package as high-risk, add
   a regression check.** Grep for the package name in
   the resulting lock-diff before committing; if it
   appears in the diff despite not being in your
   allowlist, surface and revert.
4. **The "two installation paths" rule still applies.**
   A backend-only lock-resolution test is not enough;
   a transitive surfacing in a plugin lock would only
   appear when you actually run that plugin's
   ``poetry install``. Per-plugin CI catches this; a
   one-time pre-flight runs faster.

## Audit findings need production-vs-dev environment classification before urgency-tier

Surfaced during the v0.31.0 pre-release verification (2026-05-13).

The D2 verification audit reported "GET /api/backup/export
returns HTTP 500 with `PermissionError: 'config/backup_history.json'`
in Docker" and classified it as a data-loss-class release-
blocker. The technical finding was correct: the path was a
CWD-relative literal that violated the explicit
"Filesystem isolation: production data lives outside the
project tree" rule. But the urgency classification was
overstated by one environment-class. The actual breakdown:

- **Dev Docker** (the `docker-compose.yml` bind-mount path
  `./backend:/app`): the bind mount inherits the host's UID,
  so the container's `bibliogon` user cannot write to the
  project tree. The endpoint crashes; the bug is real for
  every contributor who runs `docker compose up` from the dev
  compose.
- **Production Docker** (`docker-compose.prod.yml`, no bind
  mount on `/app`): the Dockerfile does
  `RUN groupadd -r bibliogon && useradd -r -g bibliogon
  bibliogon && mkdir -p /app/data && chown -R bibliogon:bibliogon
  /app` then `USER bibliogon`. The container's user OWNS the
  entire `/app/` tree including `config/`. The CWD-relative
  write happens to land in a writable directory. The bug
  **never fired in production**.

The fix still ships (defense-in-depth + the filesystem-
isolation rule still applies + alignment to a consistent
behaviour across both environments), but the urgency tier is
"correct architectural cleanup" not "data-loss class
release-blocker". Verification command for any future audit
that suspects a Docker write-path failure:

```bash
docker exec <prod-container> sh -c \
    "ls -la /app/<the-path-under-suspicion> && \
     touch /app/<dir>/probe-write && rm /app/<dir>/probe-write && \
     echo WRITABLE || echo READONLY"
```

This separates "broken in dev only" from "broken in prod
also" before scope-setting any fix.

**Rule for future audit reports**: when a finding is "X
crashes with PermissionError in Docker", the audit MUST
distinguish which Docker setup (dev with bind mount vs prod
with named volume) before assigning urgency. The same code
path can be fatal in one and harmless in the other. Audit
reports that omit the environment distinction will lead to
either over- or under-urgent triage.

**Concrete artefact from the v0.31.0 cycle**: the Phase 2
path-isolation fix (commit `a341b57`) is correct, ships,
and is properly motivated by the architecture rule. But the
"prod blocker" framing was wrong — it was a dev-environment
blocker AND an architecture-consistency improvement, NOT a
production data-loss bug. The broader fix for the 10+
remaining `_base_dir / "config" / "app.yaml"` writes in
`backend/app/routers/settings.py` was deferred as
`PROD-WRITES-ARCHITECTURE-01` (P3) on the same reasoning:
production is fine, dev quirk eventually deserves the
broader cleanup but not at v0.31.0 release-blocker urgency.

## User-facing time estimates must scale with input size or be omitted

Surfaced 2026-05-14 from a manual smoke test of v0.31.0.

The Medium-import upload UI shipped with the message
"Verarbeitung auf dem Server … das kann bis zu einer Minute
dauern." (and direct translations in all 7 other catalogs).
The "up to one minute" claim is false for large archives — a
500MB Medium export takes substantially longer than 60s on
the same hardware that handles a 50MB archive in under 10s.
User sees no progress feedback past the minute mark and
assumes Bibliogon has crashed.

Wrong:

- "X seconds" / "X minutes" / "up to N minutes" claims in
  user-facing strings for any operation whose cost scales
  with input size: uploads, imports, exports, bulk
  operations, AI batch calls.

Right:

- Omit the time bound, OR
- Frame the dependency: "Larger archives may take longer."
  / "Bei großen Archiven kann das länger dauern." / etc.
- For operations with truly bounded cost (sub-second SQL
  bulk DELETE, single-record fetch), no time language is
  needed.

A user-facing string with a hard time bound is a promise to
the user. Promising "≤ 1 minute" creates a "false-crash"
impression for any input that breaks the promise. The cost
of the bound is the trust the user loses; the value is near
zero because they would have waited regardless.

This pairs with the existing rule **Bulk-operation limits
should be per-operation cost-profile**. Same principle —
cost depends on input — applied to text rather than caps.

Audit checkpoint: at release time, grep i18n catalogs for
hard time bounds:

```bash
grep -rniE "minute|sekund|second|dakika|分" \
  backend/config/i18n/*.yaml | grep -iE "dauer|takes|tardar|prendre|demor|sürebilir|かかります"
```

False-positives: config-field labels (e.g. "Timeout
(Sekunden)") and ordinal markers (e.g. "First chapter").
True positives: any wait-time claim a user reads while
waiting.

**Concrete artefact**: the v0.31.0 medium-import processing
message in ``ui.medium_import.progress.processing`` was
fixed in the same commit that filed this rule. All 8
catalogs updated in a single sweep, including 6 that had
local-idiom translations of the same false claim (not
passthru-English).

## Radix DropdownMenu + happy-dom is brittle for Vitest

Surfaced 2026-05-14 across the v0.32.0 F2c (ArticleEditor
kebab) and F3 (Toolbar Copy chevron) sessions. Radix
DropdownMenu (`@radix-ui/react-dropdown-menu`) renders its
menu content through a portal and uses pointer events plus
focus-scope state for the open transition. happy-dom's
portal + focus-scope simulation is incomplete, so a Vitest
that mounts a component using DropdownMenu can:

- Render the trigger button correctly (works).
- Open the menu on `fireEvent.click(trigger)` —
  intermittent. Sometimes the menu content never lands in
  the DOM; sometimes it lands but `findByTestId` for an
  item inside `<DropdownMenu.Portal>` returns nothing.
- Throw `setState during render` from
  `@radix-ui/react-focus-scope` when both
  `fireEvent.pointerDown` + `fireEvent.click` fire in
  rapid succession (the workaround pattern most
  documentation suggests).

The F2c session burned ~30 min trying every combination of
`fireEvent.click`, `fireEvent.pointerDown` +
`fireEvent.pointerUp`, `userEvent.click`, and adding
`act()` wrappers. None of them produced a stable test.

Concrete rule for new Vitest files that exercise a Radix
DropdownMenu:

1. **Test the trigger button's existence** via
   `findByTestId` on the trigger. This works reliably and
   pins regressions where the trigger disappears entirely
   (e.g. the kebab gets accidentally hidden behind a
   conditional).
2. **Do NOT attempt to assert on the menu content** via
   `findByTestId` inside `<DropdownMenu.Portal>`. The portal
   timing in happy-dom makes this flaky. Defer the assertion
   to an E2E spec in a real browser.
3. **Test the action handler in isolation** when the
   handler is non-trivial — pass the handler in by prop or
   extract it from the component so the unit test can invoke
   it directly. The F3 Toolbar tests do this: the primary
   Copy button (not behind a portal) gets full Vitest
   coverage including clipboard write and toast assertions;
   the chevron dropdown's two items are covered only by the
   matching Playwright spec.

If a future test needs reliable DropdownMenu-open in unit
tests, consider:

- A test-only `defaultOpen` prop on the wrapping component.
- A controlled-open variant in production code that the test
  can force open.
- Switching to a non-portal alternative for the menu.

None of these is worth the complexity for the current use
cases; the E2E split is the cleaner answer.

## Split-button (default + chevron disclosure) for primary + alternative outputs

Surfaced 2026-05-14 designing the v0.32.0 F3 Copy button.
When a feature has two outputs where one is the obvious
90%-case default and the other is a discrete alternative
("Copy as Markdown" vs "Copy as plain text"), use a
split-button: a primary action button glued to a chevron
disclosure that exposes the alternative.

Anti-patterns this avoids:

- **Two equal-weight buttons** ("[Copy MD] [Copy plain]"):
  forces the user to make a format decision in technical
  jargon every time, even when they know they want the
  default. Doubles the toolbar footprint.
- **A modal "Copy options" dialog**: extra round-trip for
  the 90%-case; users have to read + click to confirm what
  they already wanted.
- **Right-click context menu only**: invisible to anyone
  who doesn't know to right-click. Discoverability dies.

Implementation pattern (verified in F3):

- Primary button + chevron use the same Radix
  DropdownMenu trigger that's already in the codebase.
- The dropdown menu has the primary action first (so a
  user who opens the menu by mistake doesn't have to
  re-orient) plus the alternative below it.
- The primary button's default click bypasses the menu
  entirely — one click, no flicker.
- Tooltip on the chevron says "More options" / "Copy
  options" so users know it expands the action set.

Cross-platform precedent: GitHub's "Squash and merge" /
"Create a merge commit" / "Rebase and merge" split button,
Notion's "Copy" → "Copy link" / "Copy as Markdown" picker,
Linear's view-switcher. The pattern is well-understood.

When NOT to use a split-button:

- Three or more alternatives at roughly equal weight: use
  a full menu, not a split. Cognitive load of "pick one of
  three" is higher than "default plus one alternative".
- The alternatives have no clear primary: use a regular
  dropdown.
- The action is destructive: a split-button can fire the
  primary by accident. Use a confirm dialog instead.

## Real-corpus audit catches arithmetic drift before it ships

Surfaced 2026-05-14 in the v0.32.0 F2a session. My
pre-inspection report told the user the v2 heuristic
produced "197 Articles / 12 Comments" on the 209-file
corpus. The verification step — running the COMMITTED
walker against the corpus — produced 198 / 11.

The discrepancy: the audit script reported "11 comments"
in its summary; I computed `209 - 11 = 197` in the report
text. Off-by-one arithmetic; the audit script's data was
correct. The same drift bled into the audit doc and the
docstring (both said "197/12" until the verification
caught it).

Concrete rule:

- **Always run a verification pass against the COMMITTED
  code** before propagating numbers into docs, docstrings,
  and CHANGELOG entries. A `verify_committed.py` that
  asserts on the expected counts is the right shape — if
  the assertion fails, the wrong numbers cannot land.
- **Match every quantitative claim against an
  authoritative source** (the audit script, the test
  output, a `git ls-files | wc -l` count). Recomputing
  from a different number that "should be" related is the
  failure mode this rule prevents.
- **Treat docstrings + docs as ONE artifact**. If the
  docstring says "197/12" and the audit doc says "197/12",
  they're not two confirmations of the same truth — they're
  two copies of the same draft. The verification step is
  the only independent witness.

Pairs with the existing "Numeric claims verification" rule
in `.claude/rules/ai-workflow.md`: that rule covers the
broader case (any number in any document); this one is the
specific tactic that catches arithmetic drift in a
multi-doc rollout of the same finding.

## External GitHub Action major-version drift

Standard GitHub Actions (`actions/checkout`, `actions/setup-*`,
`actions/upload-artifact`, `actions/cache`, the pages trio, plus
common third-parties like `softprops/action-gh-release`) release new
majors periodically — usually triggered by Node runtime
deprecations or other GitHub-platform shifts. An audit finding "all
standard actions are at their current majors" is correct AT THE
TIME but stales within weeks-to-months after a deprecation
announcement.

Concrete trigger from the 2026-05-14 sweep: GitHub deprecated the
Node 20 runtime on 2025-09-19 (forced default 2026-06-02, removed
2026-09-16). Within 6 months, EVERY standard action listed above
released a new major moving to Node 24. The previous CI-hygiene
audit's `actions/checkout@v4` etc. was accurate at audit time but
the warnings re-appeared in CI within weeks.

The original test-infrastructure audit categorized "all standard
actions at current majors" as **no action needed** — accurate at the
moment, no longer accurate weeks later. Re-classify as a periodic
check, not a one-time verification.

### Periodic CI-hygiene check (every ~quarter, or after any GitHub
runtime/platform deprecation announcement)

1. List every pinned action:
   ```
   grep -rE 'uses: [a-zA-Z][a-zA-Z0-9-]+/[a-zA-Z][a-zA-Z0-9-]+@v[0-9]+' \
     .github/workflows/ | sort -u
   ```
2. For each, check the latest released major against the pin via
   `gh release list --repo <owner>/<repo> --limit 5`.
3. **For each candidate version, read the action.yml runtime
   declaration directly** (not the release-note prose). This is
   the authoritative source for "does this action actually run
   on Node N?":
   ```
   gh api "repos/<owner>/<repo>/contents/action.yml?ref=<tag>" \
     --jq '.content' | base64 -d | grep '^[[:space:]]*using:'
   ```
   Returns e.g. `using: 'node24'` (or `node20`, or `composite`).
   This is the field GitHub Actions reads to pick the runtime.
4. Cross-reference the release notes via
   `gh api repos/<owner>/<repo>/releases/tags/v<N>.0.0 --jq .body`
   for breaking-change context, but treat the notes as
   advisory — see "Release-notes-vs-action.yml trap" below.
5. Pin to the **lowest** new major that satisfies the deprecation
   target AND declares the target Node version in its
   action.yml. The latest major often bundles additional
   unrelated breaking changes — taking the minimum-Node-N major
   lets you adopt those changes deliberately later, not by
   accident.
6. One commit per action class for traceable bisect; push as a
   batch.

### Release-notes-vs-action.yml trap

Release notes describe **intent and feature changes**. action.yml
declares the **actual runtime**. The two can diverge across a
major version when an action adds preliminary Node 24 support
without flipping the default. Always trust action.yml for audit
purposes.

Concrete examples from the 2026-05-14 sweep that caught this:

- **`actions/upload-artifact@v5.0.0`** — release notes said
  *"preliminary support for Node.js 24"* and the bump from v4
  was marked **BREAKING CHANGE**. Both signals pointed at "v5 is
  the Node-24 baseline". But `action.yml` at v5 declared
  `runs.using: 'node20'`. v6 was the actual transition (declared
  `node24`).
- **`actions/configure-pages@v5.0.0`** — release notes talked
  about Next.js breaking changes without mentioning the Node
  runtime at all, leading to inference (from sibling pages
  actions on Node 24) that v5 was Node-24. But `action.yml`
  declared `node20`. v6 added Node 24.

The trap is amplified by the `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`
env-var: if it's already in place, runtime tests look green
because the env-var coerces Node 24 regardless of the action.yml
declaration. The action.yml read is the only honest signal.

### Composite-action transitivity

Some actions declare `runs.using: composite` (e.g.
`actions/upload-pages-artifact@v5`). Composite actions don't run
on any Node runtime directly — they wrap calls to other actions.
For those, the audit must read the composite's internal `uses:`
references and check THOSE actions' runtimes:

```
gh api "repos/<owner>/<repo>/contents/action.yml?ref=<tag>" \
  --jq '.content' | base64 -d | grep 'uses:'
```

Example: `actions/upload-pages-artifact@v5` internally calls
`actions/upload-artifact@v7`, which declares `node24`. So
upload-pages-artifact@v5 is effectively on Node 24 via its
internal dependency — no bump needed at our level even though
its own action.yml says `composite`.

### Difference between "external action" warnings

Two distinct sources of "external" warnings in CI:

- **In-repo action pins**: workflow files reference outdated
  majors. Fixable in `.github/workflows/`. This rule covers them.
- **GitHub-managed services**: e.g. the Dependabot scheduled
  service that's configured under *Settings → Code security →
  Dependabot*, not in workflow files. Annotations from those jobs
  are GitHub's responsibility, NOT the repo maintainer's. Don't
  conflate the two — always grep the codebase to confirm a warning
  has a local source before assuming a fix is locally
  implementable.

### Defensive env-var as a safety net

`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"` in each workflow's
`env:` block coerces any JavaScript-runtime action declaring Node
20 to run on Node 24. After all our standard-action pins are at
Node-24-native majors, this env-var becomes a **safety net** for
future additions (especially third-party actions that may lag) —
not an active correction. Keep it in the workflow heads; it costs
nothing and prevents reintroduction of the warning when a future
contributor adds an old-major action by habit.

## Module-level caches survive test boundaries (test isolation,
   in-memory edition)

Bibliogon's filesystem and DB test isolation is well-documented
in `CLAUDE.md` ("Test isolation" section) — the `BIBLIOGON_TEST=1`
+ `BIBLIOGON_DATA_DIR` chain plus the production marker tripwire
cover those layers. But **in-memory caches in service modules
have no equivalent guard**, and they survive ALL test boundaries
inside a single pytest process.

The 2026-05-14 platform_schema regression is the canonical
example. `app/services/platform_schema.py` decorates
`load_platform_schemas` with `@lru_cache(maxsize=1)` (intentional
— production wants the YAML read once at startup). The new
`tests/test_platform_schema.py` introduced fixtures that
monkeypatch `_SCHEMA_PATH` to a tmp file with a fake schema and
calls `load_platform_schemas.cache_clear()` once in an autouse
fixture. Symptoms:

- The autouse fixture cleared the cache **before** each test
  but not **after** — `return None` instead of `yield`.
- The fake-schema dict from the last test in the file got
  cached; monkeypatch reverted `_SCHEMA_PATH` at teardown but
  the LRU cache stayed populated.
- The NEXT test file that called `load_platform_schemas()` via
  the real `/api/article-platforms` endpoint hit the LRU cache,
  saw the stale fake dict, and 5 publications tests failed with
  `ResponseValidationError: 'twitter' missing display_name` (the
  shape `test_validate_max_chars_enforced` had written).

Caught only in CI (the local pytest invocation in the same
session ran `test_platform_schema.py` in isolation, missing the
cross-file poisoning). Fix: change the autouse fixture from
`return None` to `yield`, and clear the cache on both sides.

### Rule

Any service module that uses module-level mutable state visible
to multiple tests needs a teardown hook in the fixtures that
touch it. Concretely:

- `@functools.lru_cache` decorators → tests that monkeypatch the
  underlying read must `cache_clear()` in BOTH the setup AND the
  teardown of every fixture/test that touches them. The
  `yield`-based autouse fixture pattern is the simplest shape:
  ```python
  @pytest.fixture(autouse=True)
  def _clear_module_cache():
      module.cached_function.cache_clear()
      yield
      module.cached_function.cache_clear()
  ```
- Module-level globals (singletons, registries, dicts assigned
  at import time) → same shape, reset state in both directions.
- Class-level state on a service singleton → same.

### Anti-pattern

Setup-only cache clears (`return None` instead of `yield`) look
correct in isolation — the test file's own tests pass green —
but pytest runs all collected tests in one process. The cache
written by the LAST test in your file is what subsequent test
files see. The bug is invisible inside the file's own boundary,
which is exactly why CI catches it and local single-file runs
don't.

### Detection heuristic

When adding a new test file that fakes out a service module's
inputs, grep that service module for:
```
grep -E '@(lru_|.*_)cache|_cache *=|^[A-Z_]+ *= *' \
  backend/app/services/<module>.py
```

Any match is a candidate for state-survival-across-tests. Either
add the bidirectional `cache_clear()` fixture pattern, or
document why the state is OK to leak (rare, but
``platform_schema``'s `lru_cache(maxsize=1)` IS production
behaviour we wanted, so tests need to isolate, not remove).

### Pairs with

The existing `CLAUDE.md` "Test isolation" section covers
filesystem + DB. This rule covers the third layer: in-process
in-memory state. All three layers need explicit handling.

## Destructive row-actions must reconcile collection state

When a row-action (delete, archive, move-to-trash) modifies an
item that may be a member of a multi-select collection state, the
post-action handler MUST reconcile the collection so its consumers
(bulk-action bar, counters, batch-operation forms) never reference
an orphan id that no longer corresponds to a visible row.

Pattern surfaced 2026-05-14: ArticlesList + Dashboard each had a
selection hook (``useArticleSelection`` / ``useBookSelection``)
holding a ``Set<string>`` of selected row ids. A row-delete handler
removed the row from the page-level list state but left the id in
the selection Set. The BulkActionBar reads ``count > 0`` from the
selection hook → bar stays visible → buttons claim to operate on
"1 selected" → but the underlying row is gone. Soft-delete /
permanent-delete handlers (both live-list AND trash-view) all
exhibit the same bug class.

### Rule

Every single-item destructive handler that fires from a list view
backed by a selection hook MUST call the hook's ``remove(id)`` (or
equivalent idempotent delete) after the API call succeeds, BEFORE
the success notification. The order matters: reconcile state first,
notify second, so the user never reads "moved to trash" while the
bar still shows them as the operand.

```typescript
async function handleDelete(item: Item) {
  try {
    await api.items.delete(item.id);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    selection.remove(item.id);  // <-- reconcile BEFORE notify
    notify.success(...);
  } catch (err) { ... }
}
```

### Anti-pattern

```typescript
// WRONG — selection still contains item.id after this returns
async function handleDelete(item: Item) {
  await api.items.delete(item.id);
  setItems((prev) => prev.filter((i) => i.id !== item.id));
  // Forgot selection.remove(item.id) here → bar stays at "1 selected"
}
```

### Hook contract

Selection hooks should expose a dedicated ``remove(id)`` method
that is idempotent (no-op when the id is absent), not just
``toggle(id)`` with a guard at the callsite. Reasons:

- ``toggle`` flips state — calling it on an unselected id ADDS the
  id, which is the opposite of what destructive handlers want.
- A dedicated ``remove`` makes the intent obvious at the callsite
  and lets the hook's React state machinery short-circuit
  (return the same Set reference on no-op) to skip a re-render.
- The signature reads better in tests: ``selection.remove(id)``
  asserts the operation; ``isSelected(id) && toggle(id)`` is
  noise that obscures the contract.

### Detection heuristic

When auditing a list page for this bug class, grep for every
mutator on the list state and check whether selection.remove (or
equivalent) appears nearby:

```
grep -E 'setBooks\(|setArticles\(|setItems\(' \
  frontend/src/pages/<page>.tsx \
  | grep -B0 -A2 '\.filter'
```

For each match: confirm a paired ``selection.remove(`` or
``selection.clear()`` call in the same handler. Missing pair is
the bug.

### Other affected operations

Same shape applies to:

- **Bulk operations on the SAME page** that internally use single-
  item APIs in a loop (each successful delete in the loop must
  remove that id from selection so a partial failure leaves a
  clean post-state).
- **Cross-tab updates** received via WebSocket / SSE / polling:
  when the server pushes "item X was deleted", the receiver must
  reconcile its local selection state, not just the list.
- **Filter changes that hide rows**: this is a separate decision
  (clear-on-filter-change vs preserve-and-warn) that both Article
  and Dashboard already handle via ``clearSelection`` /
  ``clearBookSelection`` callbacks bound to filter state changes.
  Pin tests for both patterns when adding a new list page.

### Bibliogon's bar-visibility convention at count===0

Both bulk-action bars (``ArticleBulkActionBar``,
``BookBulkActionBar``) are rendered conditionally on
``selection.count > 0`` from the surrounding page. When the count
drops to zero, the bar UNMOUNTS — no disabled-state, no
placeholder. This matches the widespread convention in Gmail,
Linear, Notion, etc.

This is a UI-rendering decision orthogonal to the selection-
cleanup rule above: the cleanup happens regardless; the
unmounting is a consequence of the count going to 0. Future
bulk-action surfaces in Bibliogon should follow the same shape:

```typescript
{selection.count > 0 ? (
  <XYZBulkActionBar count={selection.count} ... />
) : null}
```

If a future surface wants a different convention (e.g. always
visible with disabled buttons), that's a deliberate exception and
should ship with a doc comment explaining why; otherwise pin to
the convention so the user experience stays consistent across the
app's dashboards.

### Audit recipe for finding all bulk-selection surfaces

```
grep -rln 'useSelection\|useArticleSelection\|useBookSelection' \
  frontend/src/ | grep -v '\.test\.'
```

As of 2026-05-14 there are exactly two such surfaces:
``pages/ArticleList.tsx`` and ``pages/Dashboard.tsx``. Any new
match should immediately be audited against the rule above —
specifically: does every single-item destructive handler in that
page call ``selection.remove(id)`` after the API call succeeds
and before the success toast?

CommentsAdminSection has only a single-row delete and no
bulk-selection checkboxes (the "orphans only" checkbox there is a
FILTER, not a selection — easy to misread on first audit).
ArticleEditor has neither.

## Every bug-fix commit ships its regression-pin test

Established 2026-05-14 after the BulkActionBar selection-cleanup
fix (commit 02553fb) shipped with hook-level Vitest coverage but
NO E2E test for the user-facing flow that surfaced the bug.

### Rule

For every bug fixed, the following test coverage is MANDATORY,
not optional:

1. **Regression-pin unit test** at the layer the bug lived in
   (Vitest for frontend, pytest for backend). Asserts the bug's
   specific behaviour is correct. Named to reference the bug. A
   one-line comment in the test references the discovery context.

2. **Integration test if the fix crosses layers.** Frontend
   handler + API client + backend endpoint all exercised; state
   changes verified end-to-end.

3. **E2E Playwright test if the bug was user-facing smoke-
   discovered.** Replicates the exact user flow that surfaced
   the bug. Future-regression-prevention is the load-bearing
   value here.

4. **Cross-surface tests if the bug-class might exist
   elsewhere.** For an Articles bug, verify Books doesn't have
   the same. For a service-worker / routing bug, verify all
   parallel API surfaces have correct routes.

### Stop-condition

If a fix is shipped without the corresponding tests, that is a
**stop condition**: add the tests before closing the commit (or
in an immediately-following commit if the original is already
pushed). Tests don't ride in a follow-up "later" backlog item —
they ride with the fix.

### Retroactive application

When a previous bug-fix is found without regression-pin tests,
file a backlog item to add them. Don't let the gap survive into
the next release.

### Example application (2026-05-14 cycle)

| Bug | Tests shipped |
|---|---|
| BulkActionBar stale state (commit 02553fb) | Vitest hook tests (14 cases) ✓ ; E2E backfilled in a follow-up commit |
| Articles-Trash Restore (reported as SW bug) | Vitest hook tests for trash flow exist ; backend pytest tests pin /restore ; E2E positive regression-pin added (e2e/smoke/articles-trash.spec.ts) |
| Medium-import button state (phase-1 v0.32.0) | 2 Vitest tests pin success + failure paths ✓ |

### Why this rule earns the citation cost

The 02553fb regression — orphan selection ids after row-delete —
shipped to main with a Vitest-only safety net. The fix is correct
but the failure mode it prevents is a user-visible UI bug that
only manifests in a browser, not in a unit test. Without an E2E,
a future refactor (e.g. moving the selection hook into a context
provider, or changing the deletion order) could silently break
the wiring while the unit tests still pass — exactly the bug
class the original fix was meant to prevent. E2E coverage closes
that gap.

## Multi-tool collaboration tracking: re-sync before accepting new orders

When an external agent (e.g. a separate planning session, the
user's "Claude planning" workspace) loses sight of git state, the
executor agent (Claude Code working in the repo) MUST explicitly
re-sync before accepting new orders. Status corrections mid-
session prevent compound stale-state from creating phantom work.

### Concrete trigger (2026-05-14)

A consolidated v0.32.0 UX-Polish session plan arrived after the
v0.32.0 release tag had already shipped (commit `a432a77`)
including Phases B–F as "pending". All five phases had actually
shipped before the tag:

- Phase B (BulkActionBar selection cleanup): `02553fb` +
  `926decb`
- Phase C (Heuristic v2): `95c72c8`
- Phase D (Reciprocal reclassify endpoints): `3288ba5`
- Phase E (UI reclassify actions): `bb4a820`
- Phase F (Copy split-button): `3cedf78`

The plan was self-consistent but acted on a stale view of repo
state. Without a sync gate, the executor would have re-implemented
shipped features.

### Rule

Before starting any non-trivial session (especially one whose
plan was written by a different agent / a different session):

1. **`git log --oneline -<N>`** where N covers the time gap
   since the plan was written. Look for commit messages that
   match the planned work items.
2. **`grep -rln '<feature name>'`** for each pending item. A
   recent match in production code (not just tests/docs)
   suggests the work shipped.
3. **Reconcile**: if items appear shipped, report back to the
   planner with the commit hash + verification artifact (test
   pass count, audit-doc reference, etc.) BEFORE starting any
   re-implementation work.

### How to surface a status correction

Don't quietly skip items the planner thought were pending —
explicit "STOP — status correction" with a table of:
- What the plan called pending
- Commit hash where it actually shipped
- Verification artifact (test count, audit-doc reference)

This way the planner can re-prioritize the remaining work
deliberately rather than discover at end-of-session that 4 hours
of work was already done.

### Pairs with

The existing "Numeric claims verification" and "Audit findings
need production-vs-dev environment classification before urgency-
tier" rules. All three share the same root cause: acting on a
mental model that doesn't match the current state. The fix in
all cases is "verify against the authoritative source before
acting".

## Workbox "No route found" is benign info, not a bug indicator

Established 2026-05-14 after Bug A's user-reported Articles-Trash
Restore-Button "broken" symptom resolved as **not a code bug** —
the restore worked end-to-end; the workbox console message was
misread as causal.

### The trap

Bibliogon's SW config has a single `urlPattern: /^\/api\//`
runtime-cache rule registered for `'GET'` only. **Every non-GET
API call** (every POST, PATCH, DELETE) triggers a Workbox
`No route found for: <url>` console message. **This is
informational — it means "no runtime-cache rule applied,
falling through to default fetch"**, which is exactly the
intended pass-through behavior.

Bibliogon ALSO has `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` in
workflows and SW dev-tools that show precaching-attempt logs for
every API URL. None of those messages indicate an error.

### What an actual SW block looks like

If Workbox were genuinely blocking a request, you'd see:
- The request NEVER appearing in the Network tab (filtered to
  XHR/Fetch).
- A console error like `Failed to fetch` from the application
  code that initiated the request.
- The application code's `.catch()` branch firing.

You would NOT see a successful 2xx response in the Network tab
AND a "No route found" workbox info line — those two together
prove the request DID reach the network and DID succeed.

### Diagnostic recognition pattern

When a user reports "feature X is broken" + cites a workbox
console message as evidence:

1. **Verify the network actually fired**: open Network tab, look
   for the expected request, check its status code.
2. **Verify the backend processed it**: hit the relevant API
   endpoint via curl to check current state.
3. **Cross-check with the parallel feature**: if Books works
   and Articles doesn't, see whether the SW route is actually
   asymmetric in `vite.config.ts` (in Bibliogon's case it's not
   — single rule covers all `/api/*`).
4. **Read the workbox doc text literally**: "No route found"
   ≠ "blocked"; it's "no special handling, default fetch
   proceeds".

### Bug A reframe (the actual 2026-05-14 finding)

Once the workbox red-herring was cleared, the real signal was
the `[Violation] 'click' handler took 419ms` log entry. The
restore worked correctly; it just felt sluggish because
`handleRestore` chains two network roundtrips (`POST .../restore`
+ `GET /articles`) inside a single click handler with `setTrash`
+ `setArticles` synchronous state updates in between. 419ms is
within "perceived as slow" range for UI feedback.

The user-reported "broken" was actually "feels broken due to
perception lag + subtle feedback". Real fix path is optimistic
update + clearer post-restore feedback (filed as
`RESTORE-UX-FEEDBACK-01` in the backlog).

### Rule

When triaging a "feature broken" report that includes a workbox
console message:

- Don't accept the workbox log as bug-causal evidence without
  the corroborating Network-tab + backend-state check.
- Re-frame the symptom: ask "what did the user actually
  observe?" vs "what diagnostic message did the user notice?".
  The two often don't match — users tend to grep the console
  for red-looking text and report that as "the bug".

### Pairs with

The existing "Audit findings need production-vs-dev environment
classification before urgency-tier" rule. Same root cause:
acting on surface-level evidence without verifying against the
authoritative source (in that case, the dev vs prod Docker
config; here, the actual network state).

## Articles-vs-Books parallel-surface asymmetry

**Pattern class observed 7 times across 3 release cycles.** Each
occurrence: a feature (or fix) lands on one of the parallel
surfaces (Articles list/editor vs Books list/editor) and the
mirror surface lags behind, gets a different shape, or gets
no update at all.

### Concrete occurrences (2026-05 audit cycle)

1. **Bulk-delete cap removal** (v0.31.0). Both Articles + Books
   needed the 200-row cap removed simultaneously. Articles
   adoption lagged briefly until a paired update.
2. **Comments-Count badge** (v0.31.0). Card view shipped first;
   List view parity in a follow-up — same Articles surface but
   different view-modes.
3. **BookEditor zero testids** (UX-Full-Audit G1-F1, 2026-05-15):
   ``ArticleEditor.tsx`` has 38 testids over 1494 LOC;
   ``BookEditor.tsx`` has 0 over 700 LOC.
4. **ArticleFilterBar inline duplication** (UX-Full-Audit G2-F1):
   Articles uses a 200-LOC inline ``ArticleFilterBar`` (in
   ArticleList.tsx) with 6 filter slots; Books uses the shared
   ``DashboardFilterBar`` component with 1 filter slot.
5. **View-mode testid namespace split** (UX-Full-Audit G2-F2):
   ``book-card-{id}`` (grid) vs ``book-list-row-{id}`` (list).
   E2E specs silently skip when wrong view-mode persisted.
6. **BookDashboard list-view missing selection checkboxes**
   (v0.33.0 manual smoke, fixed in commit ``711aef0``).
   ``BookListView`` was rebuilt later than ``ArticleRow`` and
   shipped without ArticleRow's selection-checkbox feature.
   ``BulkActionBar`` appeared on Articles list-view but never on
   Books list-view; bulk-delete on BD list-view was impossible
   for two release cycles before user-smoke surfaced the gap.
7. **Comments-Admin bulk-delete** (Bug 4a, filed 2026-05-16,
   pending implementation). The Comments-Admin section in
   Settings has single-row delete but no bulk-selection +
   bulk-delete affordance, while the parallel AD / BD
   list-views both ship the
   ``BulkActionBar`` + ``useSelection``-hook pattern. Confirms
   Comments-Admin as a third parallel surface to AD / BD for
   bulk-action capabilities; the fix re-introduces parity
   instead of treating Comments-Admin as a separate concern.

> **Footnote on Bug 3 (Trash-View-Mode-Settings):** an earlier
> mid-session report tagged Bug 3 as occurrence #7 of this
> pattern class. Reclassified out of this tally: Bug 3 was
> symmetric across AD and BD (both surfaces had the same
> missing per-tab default), not asymmetric between them. It
> belongs to a Settings-Granularity-Pattern (Class B,
> currently single-instance, not yet formalized as its own
> lessons-learned class per the "single instance is incident,
> not pattern" discipline). Tally above reflects the
> corrected classification.

### Rule

**Every parallel-surface feature (Articles ↔ Books) gets an
explicit parity verification step in its development workflow.**
Before merging a PR that touches one of the parallel surfaces:

1. **List the parallel features the change affects** (e.g.
   "this is a delete-confirm dialog change → applies to both
   Articles and Books").
2. **Verify the mirror surface received the equivalent
   treatment** (or explicitly document why it's intentionally
   asymmetric).
3. **Add cross-surface E2E coverage** if the bug class is
   user-visible (yesterday's BulkActionBar fix in ``02553fb``
   shipped Vitest hook tests for both surfaces — the right
   shape).

### Periodic hygiene

**Articles-vs-Books-Parity audit** as quarterly hygiene OR after
any feature wave that touches list/editor surfaces. Audit recipe:

```bash
# Find inline implementations on one side that have a shared
# counterpart on the other.
grep -rln 'useArticleSelection\|useArticleFilters' frontend/src/
grep -rln 'useBookSelection\|useBookFilters' frontend/src/

# Find testid-namespace inconsistencies via column counts.
for f in $(grep -rln 'data-testid' frontend/src/pages/*.tsx); do
  echo "$f: $(grep -c 'data-testid' $f)"
done
```

The 2026-05-15 audit's Articles-vs-Books parity matrix
(``docs/audits/ux-full-audit-2026-05-14.md``) is the template:
13 features compared, 3 confirmed asymmetries documented + 2
historical resolutions noted.

## Inline-component duplication is the upstream cause of parallel-surface asymmetry

**Pattern class observed 2 times so far (2026-05-15 audit).**
Inline component definitions inside large monolithic page files
amplify the Articles-vs-Books asymmetry pattern above. They have
a cause-effect relationship:

```
[Monolithic component file]
        ↓ blocks
[Component extraction discipline]
        ↓ absence creates
[Duplication across parallel surfaces]
        ↓ amplifies
[Articles-vs-Books asymmetry when updates touch one surface only]
```

### Concrete occurrences

1. **Settings.tsx 2338 LOC** with inline ``function
   PluginSettings(...)`` + inline ``function AuthorSettings(...)``
   (UX-Full-Audit G3-F1 + G3-F2 + G3-F8). The inline structure
   makes per-tab testid additions land as cross-2000-line PRs;
   neither inline component has testids.
2. **ArticleList.tsx 1541 LOC** with inline ``function
   ArticleFilterBar(...)`` ~200 LOC (UX-Full-Audit G2-F1). The
   inline structure made it easy to grow Articles-specific filters
   (6 slots) without considering Books parity (1 slot in the
   shared ``DashboardFilterBar``).

### Rule

**Extract inline component functions to their own files when they
exceed 50 LOC OR span a logical sub-feature** (a panel, a tab
content, a filter bar, etc.). The extraction enables:

1. **Per-component testid additions** as small, scoped PRs.
2. **Cross-surface reuse** (the extracted Articles-side component
   becomes a candidate for the Books side to import or model).
3. **Independent test files** (Vitest unit tests per component vs
   monolithic page tests).

### The compounding insight

**Fixing the monolithic-component-extraction-gap addresses the
root cause of multiple Articles-vs-Books asymmetries
simultaneously.** Extraction work has compounding parity value,
not just code-cleanup value. Backlog items
``PLUGIN-SETTINGS-TESTID-COVERAGE-01`` (Settings extraction +
testids + E2E) and ``ARTICLEFILTERBAR-EXTRACT-01`` (ArticleList
extraction) are the targeted fixes for the two observed
instances.

## Intentional asymmetry between Articles and Books must be documented

The "Articles-vs-Books parallel-surface asymmetry" rule above is
about ACCIDENTAL drift: one surface gets a feature, the mirror
surface doesn't, nobody noticed. The corollary is that some
asymmetries are DELIBERATE — Articles and Books have genuinely
different conceptual shapes, and forcing parity would degrade
the product. When the asymmetry is intentional, document it
explicitly so a future audit doesn't flag it as a regression
and the next contributor doesn't "fix" it by accident.

### The trigger pattern

When you ship a feature on one surface and an audit asks "why
not the other side too?", there are three possible answers:

1. **Accidental drift** — the other side just didn't get it
   yet. Fix per the parallel-surface-asymmetry rule above.
2. **Intentional asymmetry, undocumented** — the other side
   genuinely shouldn't have it for conceptual reasons. The next
   audit will surface the same question, get the same verbal
   "oh right, that's intentional" answer, and the loop repeats.
3. **Intentional asymmetry, documented** — the why lives in the
   commit message + a lessons-learned entry, so the next audit
   sees the documentation and closes the question immediately.

The middle case is the one this rule prevents. The cost of
documentation is small; the cost of re-running the same audit
every quarter is large.

### Rule

When a feature ships on Articles XOR Books and the asymmetry
is intentional:

1. **Commit message must call it out.** A sentence like
   "Books-only by design — Articles use Topic (single enum)
   + Tags (free-text), Books use Categories (free-text JSON
   list) + BISAC; the two domains have different metadata
   shapes" is enough.
2. **Add a one-line note to this section.** Lists the feature,
   which surface has it, and the one-sentence "why" — so future
   audits can grep this section before raising the asymmetry.

### Documented intentional asymmetries

- **Categories + BISAC (Bug 9)**: Books-only. Articles use
  ``Article.topic`` (single, settings-managed enum, drives
  the per-platform publishing workflow) and ``Article.tags``
  (free-text). Books use the new ``Book.categories`` (free-text
  JSON list, KDP-aligned) and ``Book.bisac_codes`` (BISAC
  9-char codes, validated for format only — see
  ``BISAC-DATABASE-LOOKUP-01`` for the deferred bundled-catalog
  path). The two domains have fundamentally different
  metadata shapes: an article ships to N platforms each with
  its own tagging norms; a book targets retail catalogues
  (KDP / Apple Books / Kobo) with industry-standard subject
  hierarchies. Forcing the same field set on both would help
  neither.

- **Authors-Database (Bug 8)**: Books-only at the
  wizard-integration layer in v0.33.0+. The new Authors-DB +
  Settings tab IS global (no Article / Book scoping), but the
  Phase 2 wizard-datalist integration only lands on the
  Article-to-Book conversion wizard. ArticleEditor + BookEditor
  free-text author inputs stay plain text per D8 — the wizard
  is the high-leverage surface (multi-article selection
  surfaces multiple authors at once); single-record editors
  ship the datalist later. Future session promotes the pattern
  to both editors.

### Anti-pattern

Removing or weakening a feature on one surface just to "match"
the other surface, when the surfaces have genuinely different
needs. Symmetry-for-symmetry's-sake is wrong; symmetry-in-
service-of-the-user is right. The asymmetry tally above tracks
the bugs of the second kind (accidental missing parity); this
section catalogues the cases where asymmetry IS the right
answer.

## Periodic theme-token completeness audit as pre-release hygiene

**Recurring-issue-class observed 2 times across 2 release cycles.**

Bibliogon's theming system uses CSS custom properties
(``var(--token, #hex-fallback)``) for color, spacing, and shadow
tokens. Each token must be defined in all 10 theme variants
(5 palettes × light/dark). When a token is undefined in one
palette, the hex fallback leaks through, producing visually
wrong rendering that's invisible to all UI tests because the
fallback IS a valid color.

### Concrete occurrences

1. **v0.31.0 Pre-Release Audit D3** identified 9 components
   silently falling through to hex when ``--surface-2``,
   ``--danger-bg``, ``--success``, ``--warning`` were undefined
   in some palettes. Fix: added the missing tokens.
2. **2026-05-15 UX-Full-Audit (G4-F4)** inventory:
   ``grep -rhE 'var\(--[a-z-]+, *#' frontend/src/`` returned
   **111 callsites** of the same fall-through-vulnerable pattern.
   Token-vs-palette cross-check not yet performed.

### Rule

**Theme-token completeness audit MUST be part of every
release-cycle pre-release sweep** — alongside ``poetry show
--outdated`` and the test-count verification.

### Audit recipe

```bash
# 1. Inventory every var(--token, #fallback) callsite.
grep -rhE 'var\(--[a-z-]+, *#' frontend/src/ \
  --include='*.tsx' --include='*.ts' --include='*.css'

# 2. Extract the unique --token names referenced.
grep -rhoE 'var\(--[a-z-]+' frontend/src/ \
  --include='*.tsx' --include='*.ts' --include='*.css' \
  | sort -u

# 3. For each --token, check it's defined in all 10 palette
#    × mode combinations in frontend/src/styles/global.css.
#    Missing definitions = the fall-through bug.

# 4. Optionally: add an ESLint rule that flags
#    var(--token, #fallback) usage and require either
#    var(--token) (no fallback — forces existence) OR a
#    documented exception comment.
```

### Pairs with

The existing "Boy Scout rule" + the audit's filed
``THEME-TOKEN-COMPLETENESS-AUDIT-01`` backlog item. Together they
formalize the cadence: ad-hoc fix when an issue fires (the v0.31.0
patch) is reactive; pre-release sweep with the grep recipe above
is proactive.

## User-perceived bug ≠ code bug: the perception-lag class

Surfaced 2026-05-14 when "Articles-Trash Restore button broken"
turned out to be a **419ms click handler with subtle post-restore
feedback**, not a functional failure.

### The pattern

A user reports "feature X doesn't work" or "X is broken" + cites
a console message or symptom as evidence. The diagnostic chain
that follows often surfaces multiple non-bugs before reaching the
real cause:

1. **Surface symptom** the user actually noticed (visual lag,
   missing feedback, console warning).
2. **Diagnostic gut-read** (often workbox messages, network 404s,
   etc.) that look causal but aren't.
3. **Actual cause** which is usually a UX-quality issue, not a
   functional break.

Bug A's progression (2026-05-14):

- User report: "Articles-Trash Restore broken; workbox blocks"
- My audit: SW config is symmetric for books/articles; workbox
  "No route found" is benign info, not blocking
- Manual smoke: restore POST fires, backend processes, frontend
  reloads — backend confirms article is restored
- **Actual cause**: 419ms click-handler + post-restore feedback
  too subtle (stay-in-trash-view + transient toast + filtered-out
  row vanishing). User-perceived "broken" = user-perceived "lag
  + no clear success signal".

### Rule

**Before patching a code bug, verify the bug is in the code
layer the user thinks it is.** Specifically:

1. **Check the Network tab + backend state FIRST.** If the
   action's backend artifact exists (article restored, book
   created, etc.), the user's symptom is at a different layer.
2. **Console messages are diagnostic clues, not bug citations.**
   Workbox passthrough logs, React StrictMode warnings, and
   browser violation reports often accompany correct behavior.
   Verify the cited message is causal, not coincidental.
3. **Re-frame "doesn't work" as "what did the user actually
   observe?"** vs "what diagnostic message did the user notice?".
   The two often diverge; the second can mask the first.

### The audit-tier output

Perception-lag bugs ARE real UX bugs — they degrade users' trust
even when the code is correct. But they belong in a different
backlog tier than functional regressions: **IMPROVEMENT (UX
performance)**, not BLOCKER. The filed
``RESTORE-UX-FEEDBACK-01`` (P3, optimistic update + post-restore
feedback) is the proper response. Promoting it to BLOCKER would
have made the audit miss the real lesson — which is that
perception is a UX dimension worth fixing, even when nothing is
broken.

### Pairs with

The "Audit findings need production-vs-dev environment
classification before urgency-tier" rule. Same family: separating
"this looks scary" from "this is actually broken" requires
verifying against authoritative sources before urgency-triage.

## Testid namespace pinning prevents silent E2E skips

Surfaced 2026-05-15 as the positive discipline derived from the
G2-F2 silent-skip incident (recorded inside
"Articles-vs-Books parallel-surface asymmetry"). The G2-F2 entry
documents what went wrong: ``book-card-{id}`` in the grid view
vs ``book-list-row-{id}`` in the list view; an E2E spec written
for one view-mode resolves all its testids cleanly when the
fixture happens to persist the same view-mode, and silently
finds nothing — passing on a no-op — when a different view-mode
persists. The bug was invisible for two release cycles.

This rule is the positive discipline that prevents the
recurrence: namespace your testids deliberately and exercise
every one positively in the E2E spec.

### Rule

For any non-trivial UI component that an E2E spec will drive
(wizards, multi-step forms, dialogs with multiple slots, bulk-
action bars, settings tabs):

1. **Choose a single namespace string at component creation
   time.** A 2-3 dot-prefix or hyphen-prefix that uniquely
   identifies the component family is enough:
   ``convert-to-book-wizard-{step}-{slot}``,
   ``article-bulk-{action}``,
   ``settings-tab-{tab-id}-{slot}``. Document the schema in
   the component's header docstring or a short JSDoc block
   above the first testid use site.

2. **Every interactive surface gets a testid in that
   namespace.** No exceptions for "the button is obvious".
   Buttons, inputs, selects, toggles, dropzones, drag
   handles, list rows — each addressable element has an
   id under the component's namespace.

3. **List every testid in the component's header comment
   or in a sibling ``*.testids.md`` file.** The list is the
   contract: it tells the E2E author what's pinned and tells
   future maintainers what they must keep stable when they
   refactor.

4. **The E2E spec exercises every testid in the namespace at
   least once positively.** "Positively" means
   ``await expect(page.getByTestId(...)).toBeVisible()`` —
   not a negative assertion like ``not.toBeNull()`` and not
   a fragile partial-match. The spec walks the happy path
   from first user surface to last, asserting each pinned
   testid resolves to exactly one visible element.

5. **When the namespace evolves, the spec's positive
   coverage walk is the safety net.** Renaming a testid or
   forgetting to apply the namespace to a new surface
   triggers a spec failure on the very next CI run — not
   a silent skip on the next view-mode flip.

### Concrete artefacts

- **First feature shipped under this discipline**: Phase 2 of
  the article-to-book conversion (commit ``9261acd`` for the
  component, commit ``7440564`` for the E2E spec). Component
  header docstring carries the namespace schema; E2E happy
  path positively asserts every step's slot resolves; 11
  Vitest specs cross-check the same testid names from a
  component-rendering angle.

- **Negative incident the discipline prevents**: G2-F2
  view-mode testid namespace split, documented in
  "Articles-vs-Books parallel-surface asymmetry"
  occurrence list.

### Anti-patterns

- **No namespace at all** — ad-hoc testids like ``submit-btn``,
  ``confirm``, ``ok``. Two sibling components collide; specs
  resolve to the wrong element. Cure: prefix.
- **Namespace drifts across view-modes / branches** — same
  visual concept, different testid in card vs list view, in
  draft vs published state, in mobile vs desktop layout. Cure:
  one testid per conceptual element regardless of which branch
  renders it. The E2E spec's positive walk would have caught
  the drift on the very next run.
- **Specs that only assert negatively** —
  ``await page.getByTestId(...).not.toBeNull()`` passes when
  the element doesn't exist at all. Cure: use ``toBeVisible``
  (or ``toHaveCount(1)`` when uniqueness matters).
- **Partial-prefix selectors that overmatch** —
  ``[data-testid^="book-card-"]`` matches both the root
  ``book-card-{id}`` AND every nested ``book-card-menu-{id}``.
  Documented earlier in "Prefix testid selectors match every
  nested testid that shares the prefix". The positive-coverage
  discipline complements that fix.

### Pairs with

- "Articles-vs-Books parallel-surface asymmetry" — the G2-F2
  occurrence list captures the negative side; this rule is
  the positive prevention.
- "Prefix testid selectors match every nested testid that
  shares the prefix" — same testid-discipline family,
  different failure mode.
- The two rules together cover the "namespace your testids +
  exercise them positively + don't overmatch with prefix
  selectors" trifecta.

## Menu-Dialog Lifecycle: do not `preventDefault` inside `onSelect`

Radix `DropdownMenu.Item` (and the sibling `ContextMenu.Item`)
auto-closes the surrounding menu on item-select by default —
that's the desired UX. Calling `e.preventDefault()` inside the
`onSelect` handler suppresses the close. If the handler then
opens a dialog (AppDialog confirm, TypeToConfirmDialog, any
Radix Dialog the parent controls imperatively), the dialog
floats above a still-visible menu — overlapping UI, confused
focus management, and a violation of the "one modal surface at
a time" UX contract.

### Rule

A `DropdownMenu.Item`'s `onSelect` MUST NOT call
`e.preventDefault()` when the handler triggers a dialog. The
default close-on-select is what you want. Let Radix close the
menu; THEN the dialog mounts against a clean stage.

### Why this trap is easy to fall into

Two common mental models lead developers to add the
`preventDefault`:

1. **"I want the menu to stay open while the dialog confirms."**
   A reasonable instinct, but it's the wrong UX contract. Once
   the user picks "Endgültig löschen", the menu's job is done —
   the next decision happens in the dialog. Leaving the menu
   visible behind the dialog adds visual noise and competes for
   focus.
2. **"I'm worried about double-fires or focus-bouncing."**
   Radix handles that internally. The auto-close transition
   precedes the imperative dialog open in your handler, so the
   focus moves from menu trigger → dialog confirm button cleanly.

### Positive precedent (the bulk-action bars)

The Article / Book / Comment bulk-action bars (see
`frontend/src/components/articles/ArticleBulkActionBar.tsx`,
`BookBulkActionBar.tsx`,
`comments/CommentBulkActionBar.tsx`) all use the correct
pattern:

```tsx
<DropdownMenu.Item onSelect={() => onBulkDeletePermanent()}>
    Endgültig löschen
</DropdownMenu.Item>
```

No event arg, no `preventDefault`. The dialog opens after the
menu has finished closing. This pattern has been in production
since 2026-04 and works correctly — it's the precedent every
other surface should match.

### Anti-pattern

```tsx
// WRONG — menu lingers around the dialog
<DropdownMenu.Item onSelect={(e) => {
    e.preventDefault();
    onDeletePermanent();
}}>
    Endgültig löschen
</DropdownMenu.Item>
```

Bug 6 (2026-05-16) shipped this anti-pattern across 6 surfaces:
`ArticleCard`, `BookCard`, `BookListView` (the trash + permanent
items), `pages/ArticleEditor` (reclassify), `Toolbar` (Copy
split-button items), `pages/Dashboard` (theme toggle). The fix
in commit `02fc66b` simplified each callsite to
`onSelect={() => handler()}`.

### Detection recipe (automatable)

```bash
grep -rnE 'onSelect.*e\.preventDefault|onSelect=\{?\(e\)' \
  frontend/src/components/ frontend/src/pages/ \
  --include='*.tsx' --include='*.ts'
```

Any match outside of a clearly-justified case (e.g. a Copy
menu where the user *intentionally* wants the menu to stay
open for a follow-up copy-action AND the handler does NOT
trigger a dialog) is a Bug-6 regression candidate. Future
audits can wire this grep into a pre-commit hook or a CI
check; the fix is mechanical (remove `preventDefault`, drop
the `(e) =>` wrapper) and the regression-pin lives in
`e2e/smoke/menu-dialog-close.spec.ts`.

### Exceptions

The rule covers `onSelect` handlers that **trigger dialogs**.
The same `preventDefault` call would be the *right* answer in
narrowly-scoped cases where you legitimately need Radix to NOT
auto-close — for example:

- An "advanced options" sub-flow where the menu stays open
  while a popover-style inline panel expands beneath the
  item. (Not currently used in Bibliogon.)
- A multi-step picker where each click reveals another tier
  of the same menu. (Use Radix `DropdownMenu.Sub` instead —
  the composed sub-menu has the right semantics natively.)

If you're about to add `preventDefault` for any other reason,
the answer is almost always that you want a different Radix
primitive (Sub, Popover) — not a workaround.

### Pairs with

- "Radix DropdownMenu + happy-dom is brittle for Vitest" —
  the reason this rule's regression pin lives in E2E
  (`e2e/smoke/menu-dialog-close.spec.ts`), not Vitest.
- "Split-button (default + chevron disclosure) for primary +
  alternative outputs" — the Toolbar Copy split-button is one
  of the Bug-6 surfaces; the fix preserves the split-button
  pattern while removing the lingering-menu UX smell.

## New-hook + new-mock-key contract drift in EXISTING test files

When a feature introduces a new hook (or new API client method,
or new behavior that depends on a mocked API), the new hook's
data contract is fresh — but the EXISTING test files that mock
that API are not automatically aware of it. If the existing mocks
return a response shape that doesn't include the new key/field
the new hook reads, the hook silently falls back to its hardcoded
default and consumer tests in those existing files assert against
the wrong state.

### Concrete incident

Bug 3 (2026-05-16, commit `5767289`) shipped a new
`useTrashViewMode` hook that reads
`ui.dashboard.articles_trash_view` from the mocked
`api.settings.getApp()` response. The companion test commit
(`8cf6ed0`) added an "AD-Trash view-mode default" test inside
the EXISTING `ArticleList.test.tsx`, but the existing
`vi.mock("../api/client", ...)` block was returning only
`{articles_view: "list"}`. The new hook looked for
`articles_trash_view`, found nothing, kept its hardcoded
`"grid"` initial state, and the test's "list visible by default"
assertion failed. The red was invisible at commit time of
`8cf6ed0` (we don't know whether the test author ran the full
suite then) and stayed red on `main` for 24+ hours until the
follow-up session's `make test` surfaced it. Fix (Bug 7,
2026-05-16, commit `5728e71`) extended the mock to include
`articles_trash_view: "list"`.

### Rule

When introducing a new hook or new API consumer that reads from
a key of an already-mocked API response, do BOTH of these in
the same commit:

1. **Grep every test file that mocks the same API** and verify
   the mock's return value includes the new key. Recipe:

   ```bash
   grep -rn 'vi\.mock.*api/client\|getApp:\s*vi\.fn' \
     frontend/src --include='*.test.ts*' \
     --include='*.test.tsx'
   ```

   Or, scoped to the specific API method:

   ```bash
   grep -rn '<METHOD_NAME>:\s*vi\.fn\|<METHOD_NAME>(' \
     frontend/src --include='*.test.*'
   ```

2. **Run the FULL `make test` before commit-time green-claim**,
   not just the targeted file you just wrote. A new hook
   transitively touches every file whose consumers render it;
   targeted-only verification misses cross-file failures.

### Why this trap is easy

The new test the author writes for the new hook is green —
they mock what the new hook reads. But the *existing* test
file (the one that's been working for months) keeps its old
mock. The author often doesn't think to revisit it because
"that test doesn't touch the new feature." It does, transitively,
via the shared component (here, the `ArticleList` page renders
both `useViewMode` and the new `useTrashViewMode` simultaneously).

### Pairs with

- The CLAUDE.md "make test must stay green after every change"
  rule is the parent discipline; this rule is the concrete
  failure mode that violates it most quietly.
- "End-to-end behavior tests are not 'kwarg passes through'
  tests" — both rules pin "test the OBSERVABLE OUTPUT through
  the full component tree", not just the new code's inputs.
