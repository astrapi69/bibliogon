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

## Single-source-of-truth for cross-cutting concerns: closed-set vs open-set discovery

The version-pin SSoT pattern above generalises: any cross-cutting concern (i18n keys across catalogs, plugin manifests cross-referencing the backend hookspec API, asset paths referenced from multiple components, etc.) reduces human-error during synchronisation IF AND ONLY IF the propagation mechanism is paired with a discovery mechanism for NEW references introduced by future features.

The 2026-05-19 release-automation audit (`docs/audits/release-automation-audit-2026-05-19.md`) made the pattern explicit. Bibliogon's release-cycle automation is the canonical example.

### Two distinct failure modes

**1. Closed-set drift — files we KNOW need updating, but didn't.** The original version-pin SSoT pattern above addresses this: `sync_versions.py`'s `collect_targets()` enumerates the known propagation targets; `verify_version_pins.sh` checks them. Adding a new propagated file means adding it to BOTH lists.

**2. Open-set drift — files we DID NOT KNOW needed updating.** A future feature adds a file with a hardcoded version literal in a new shape (e.g. a generated artifact, a config snippet, an embedded constant) and there's no enforcement that it gets added to `collect_targets()`. The closed-set verifier passes; the new file silently drifts on every release.

### Concrete Bibliogon example: `frontend/package-lock.json` top-level version

For multiple release cycles before the 2026-05-19 audit, `frontend/package-lock.json` carried a stale top-level `"version": "..."` field. `sync_versions.py` edited `package.json` but not the lock. Only `npm install` re-synced the lock. The drift was invisible to:

- `make sync-versions-check` — doesn't enumerate the lock
- `verify_version_pins.sh` regression detectors — didn't grep package-lock
- The author at release time — package.json LOOKED right; the lock was hidden in 11,000 lines

The audit caught it at v0.34.1; the closed-set fix added the lock to `collect_targets()`; the open-set fix added `scripts/discover_version_literals.sh` which would have surfaced the drift on the very next `make release-discover` invocation.

### Two enforcement mechanisms (use both)

For any cross-cutting concern with a SSoT pattern, ship BOTH:

**Closed-set enforcement (mandatory):**
- A propagation script (`sync_*`) that writes the known derived locations
- A verifier (`verify_*`) that diffs the derived state against canonical and exits non-zero on drift
- A `collect_targets()` (or equivalent) function listing the known derived files
- Regression detectors in the verifier that fail if a hardcoded literal reappears in the "DO NOT EDIT" tier

**Open-set discovery (advisory):**
- A discovery script that greps for the cross-cutting pattern across the repo, excludes the known-target set + legitimate one-off literals, and reports any survivors
- Hooked into the verifier as a non-fatal WARN at the end of the chain (advisory, not a gate — false positives are real and shouldn't block tags)
- Hooked into a release-prep Makefile target (`make release-discover` in Bibliogon) for on-demand inspection
- Survivor handling: either add the file to `collect_targets()` (it's a new sync target) or add to `KNOWN_FILES` in the discovery script (it's a legitimate one-off)

### When this pattern applies

This is not just for version pins. The pattern generalises to:

- **i18n keys**: `backend/config/i18n/*.yaml` × 8 catalogs. A `verify_i18n_keys.py` script could check key-parity + discovery-grep for hardcoded user-facing strings outside the catalog system.
- **Plugin manifest cross-references**: hookspecs in `backend/app/hookspecs.py` vs plugin `get_frontend_manifest()` returns. Drift here would be `i18n` slot names that don't exist on the backend.
- **Asset path references**: `book.cover_image` references that need URL rewriting on import/export — known callsites can be enumerated; new callsites need open-set discovery.
- **Feature-flag tests**: every `Book.audiobook_overwrite_existing`-style flag needs at least one test that flips it and asserts an observable behavioral difference (per the existing "End-to-end behavior tests are not 'kwarg passes through' tests" lessons-learned rule). The discovery mechanism: grep for `audiobook_overwrite_existing` callsites; verify each consumer has a paired test.

### When NOT to apply this pattern

If the cross-cutting concern is fundamentally LLM/human-narrative (CHANGELOG entries, release notes, prose summaries, journal entries), automation provides no value. The author is composing per-instance content — Tier 4 in the version-pin tier model. The SSoT pattern is for the MECHANICAL propagation of a single canonical value, not for the narrative around it.

### Maintenance discipline

When adding a new propagated file:
1. Add to the propagator's `collect_targets()`
2. Add to the closed-set verifier's regression detectors if applicable
3. Add to the open-set discovery script's `KNOWN_FILES` (so it doesn't show up as a discovery warning)
4. Add a test asserting the new propagation handler works
5. Update the docs that explain the SSoT tooling (e.g. `docs/development/release-automation.md`)

When `make release-discover` (or the verifier's open-set WARN) surfaces an unknown file: triage as either new-sync-target (recipe above) or legitimate-one-off (add to `KNOWN_FILES`). Don't ignore the warning — that defeats the open-set discipline's purpose.

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

**Pattern class observed 8 times across 3 release cycles.** Each
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
8. **Comments trash-lifecycle** (Bug 10, fixed 2026-05-16,
   commits ``f09f0c2..acdee4a``). Articles + Books shipped the
   full trash lifecycle (soft-delete + list-trashed + restore +
   permanent-delete-from-trash + empty-trash) from day one;
   Comments shipped only the soft-delete half in v0.32.0 with
   the rest filed as ``v2`` in the
   ``MEDIUM-COMMENTS-IMPORT-01`` commit 7 docstring. The
   deferred half was never picked up. Production smoke
   surfaced **61 soft-deleted comments stuck in invisible
   purgatory** — the user pressed "Move to Trash", got
   "moved to trash" feedback, and then found no trash to
   look in. Closed by Bug 10: new
   ``/api/comments/trash/list``, ``/api/comments/trash/{id}/restore``,
   ``/api/comments/trash/empty``, ``/api/comments/trash/{id}``,
   ``/api/comments/trash/bulk-restore`` endpoints + a
   ``viewMode`` toggle on CommentsAdminSection + the trash-view
   bulk-action bar. See the "Half-wired feature lifecycle" rule
   below for the generalized pattern (now extended with the
   frontend-shape variant from PB-PHASE4 Session 4).

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

## Half-wired feature lifecycle: a state-write without its inverse-mutation OR its state-consumer is purgatory, not a feature

A "half-wired" feature ships one half of a lifecycle and leaves
the other half (the inverse mutation, the data consumer, or the
renderer) deferred. The user perceives the working half — they
click the button, the API succeeds, the toast confirms — but the
expected downstream effect is invisible, missing, or stuck. The
word for the half-shipped state is **purgatory**: data still
exists, the user already paid the cognitive cost of the action,
but the next step the action implies isn't there.

This pattern has **two distinct shapes**:

- **Backend shape — state-mutation without inverse-mutation
  surface.** Soft-delete shipped without restore. Archive without
  un-archive. Schedule without "see scheduled".
- **Frontend shape — state-write without state-consumer
  (renderer or reader).** Picker writes a field, renderer ignores
  the field. Form persists a value, no UI surface reads it.

Both shapes destroy trust the same way: the user thinks they
acted on the system, and the system appears to ignore them.

### Concrete instances

**1. Bug 10 — Comments soft-delete shipped, restore-UI deferred
   (backend shape).** The MEDIUM-COMMENTS-IMPORT-01 v1 admin
surface (2026-05) shipped soft-delete on ``DELETE /api/comments/
{id}`` and bulk-soft-delete on ``POST /api/comments/bulk-delete``
(``permanent=false``). The original commit's docstring called it
out: *"Hard-delete and re-linkage endpoints are out of scope for
v1; v2 ships them when MEDIUM-COMMENTS-UI-01 builds the admin
view."* The "v2" work was filed in prose, NOT in a load-bearing
backlog item. Production smoke at v0.33.0 surfaced **61 user-
trashed comments stuck in invisible purgatory** — the user had
to ask "where did my comments go?" before the gap was visible.
Closed by Bug 10.

**2. PB-PHASE4 Layout-Picker shipped, layout-renderer deferred
   (frontend shape — closed by Session 4).** Session 3 Commit 4
   shipped LayoutPicker writing the layout field through
``api.pages.update``. PageCanvas (Commit 5) was authored against
a fixed vertical-stack JSX with no per-layout branching; it read
``page.image_asset_id`` and ``page.text_content`` but ignored
``page.layout`` entirely. Visual smoke during the Session 3
go/no-go gate surfaced this as the #1 blocker:

> "Layout-Picker is visual-only, has NO render effect in editor.
> User selects different layouts (image-top-text-bottom,
> image-left-text-right, etc.). Editor displays SAME layout
> regardless of selection. Backend stores layout field, frontend
> renderer ignores it."

Closed by Session 4 Commits 1-3: PageCanvas now consumes
``page.layout`` via a per-layout CSS-Module class + region
wrappers, with per-layout structural + visual differentiation.

**3. PB-PHASE4 ``layout_config`` (originally
   ``speech_bubble_config``) field exists, NO UI writes or
   reads it (frontend shape — fully closed by Session 4 D2a
   default + Session 4c preset write-path).** The
``Page.layout_config`` JSON field (renamed from
``speech_bubble_config`` in Session 4c) has been schema-present
since Session 2 (backend) and frontend-type-present since
Session 3 Commit 1 (``api.pages``). No UI consumed it for
rendering and no UI wrote it. Session 4 audit surfaced this
during PageCanvas inspection — a third instance of the pattern
caught BEFORE it became a user-visible bug, exactly the value of
audit-first discipline.

**This is the FIRST canonical complete-cycle example of the
pattern.** Both halves closed via two coordinated session steps:

- **Read-path** closed by Session 4 D2a: PageCanvas reads
  ``layout_config.anchor_position`` (with fallback to
  bottom-center default) and renders the bubble at that
  position. Without a write surface, this still rendered the
  default for every existing row — the lifecycle was visibly
  "wired" but the user couldn't change it.
- **Write-path** closed by Session 4c: LayoutConfigSpeechBubble
  component ships the 5-preset anchor radio + opacity slider +
  size slider in PageEditor's properties pane. The dispatcher
  routes to it whenever ``page.layout === "speech_bubble"``;
  ``handleUpdateLayoutConfig`` in PageEditor merges partial
  updates and persists via ``api.pages.update`` with optimistic
  state refresh. Same write surface design extends to the 3
  image-based layouts (image_top_text_bottom +
  image_left_text_right + image_full_text_overlay) which got
  their own per-layout configs in the same session.

**Drag-to-position** (the broader interpretation of
"reposition capability") remains as the narrower P5 backlog
item
``PICTURE-BOOK-SPEECH-BUBBLE-DRAG-POSITION-01``. That follow-
up extends the persisted shape (`{x_pct, y_pct}` dict variant
in addition to the preset string) without breaking the
preset path. **Extended bubble properties** (color, border,
typography, etc.) are tracked separately as
``PICTURE-BOOK-SPEECH-BUBBLE-EXTENDED-PROPERTIES-01`` (P3)
— not part of the half-wired closure; they're a new feature
adding more dimensions to the already-closed lifecycle.

The closure pattern is instructive: an outer "complete the
lifecycle" backlog item can naturally generate narrower
follow-ups when the original scope was broader than the MVP
needs. Filing both the original close + the narrower P5
follow-up makes the closure auditable while preserving the
deferred work as a tracked future task.

**4. PB-PHASE4 ``kinderbuch.css`` shipped, NO code consumed it
   (frontend shape — closed by PB-PHASE4 Session 6 Commit 1
   at 4f3d47d).** The kinderbuch plugin shipped a
``plugins/bibliogon-plugin-kinderbuch/bibliogon_kinderbuch/
templates/kinderbuch.css`` file with CSS rules for 4 of the
5 picture-book layouts. Zero code referenced it (grep
confirmed zero ``.py`` / ``.yaml`` consumers); the file used
HYPHENATED layout names (``image-top-text-bottom``) while the
backend schema used UNDERSCORES (``image_top_text_bottom``)
which would have prevented any future generator from finding
the rules; the file was missing the ``speech_bubble`` layout
(added later in Session 4); and the font choice was Comic
Sans MS, which would not have embedded properly for PDF
output anyway.

Surfaced by the Session 6 Pre-Inspection audit
(``docs/audits/session-6-pdf-export-audit-2026-05-17.md``);
closed by Session 6 Commit 1 (``4f3d47d``) which deleted the
file and fresh-wrote the WeasyPrint-targeted CSS inline in
``picture_book_pdf.py``. The pattern is the same shape as
instance #3 (data-without-consumer) but with an extra layer:
the file existed AS A consumer-shaped artifact (a CSS
template) but no code path ever rendered HTML that referenced
it. Worse than no-consumer: an opaque-consumer that LOOKED
like the right answer to a future contributor.

This instance crystallises the broader pattern: **a UI /
templating asset shipped without a code path that loads
+ applies it is purgatory of the worst kind**, because the
file's existence creates a false signal that the feature
is wired (especially against a 6-month-later contributor who
finds the file via grep). Detection mechanism:

```bash
# Find templating assets with no grep matches in their plugin
# Python / YAML / TypeScript:
find plugins/ -name "*.css" -o -name "*.html" -o -name "*.tex" \
  | while read f; do
      basename=$(basename "$f")
      hits=$(grep -rln "$basename" "$(dirname "$(dirname "$f")")" \
        --include="*.py" --include="*.yaml" --include="*.ts" \
        --include="*.tsx" 2>/dev/null | wc -l)
      [ "$hits" -eq 0 ] && echo "DEAD: $f"
    done
```

Future audits at session-start should grep the touched
plugins for this pattern. The kinderbuch.css case shipped
in v0.13.0 (kinderbuch plugin first release) and lay dormant
through 12+ release cycles before the Session 6 audit caught
it.

### Rule

When a feature ships ANY half of a lifecycle, the deferred half
MUST be filed as a **load-bearing backlog item** with an explicit
blocker relationship to the shipping half:

1. Open a P-tier backlog entry (NOT just a docstring TODO) with
   ID + scope + trigger.
2. Cross-reference in the docstring of the shipping half — so
   anyone reading the code sees the backlog reference, not just
   the prose "v2 will do it".
3. Set the trigger to be **observable from real use** (user
   reports the gap, monitor alert, follow-up audit), not a silent
   "we'll get to it".

Concretely for the two shapes:

- **Backend shape**: every state mutation that introduces a
  "trash"-like intermediate state MUST ship its inverse-mutation
  surface in the same release, OR file an explicit backlog item
  with a trigger.
- **Frontend shape**: every form, picker, or input that WRITES a
  field via API MUST have a renderer/reader that CONSUMES that
  field, OR file an explicit backlog item with a trigger. A
  field that no UI reads after a write is purgatory — the user
  clicked the picker and the choice "disappeared".

### Detection greps

**Backend shape (deferral-in-prose hunt):**

```bash
grep -rnE 'out of scope|v2 ships|deferred to v2|filed for v2|TODO.*v2' \
  backend/app/ frontend/src/ plugins/ \
  --include='*.py' --include='*.tsx' --include='*.ts'
```

Each hit is a candidate. Cross-check whether the deferred half
is in the backlog with a real ID; if not, file one now.

**Frontend shape (picker-without-renderer hunt):**

For every form/picker/input that writes a field via api,
verify the field is READ somewhere (a renderer, a derived
display, an export pipeline):

```bash
# Step 1: find every field written by the frontend api client.
grep -rnE 'api\.[a-z]+\.update\(|api\.[a-z]+\.create\(' frontend/src/ \
  --include='*.tsx' --include='*.ts' | grep -v test

# Step 2: for each field name in the request payload, grep for
# CONSUMERS of that field (read sites, NOT write sites) in the
# component tree:
grep -rn '\.<field>\b' frontend/src/components/ frontend/src/pages/ \
  --include='*.tsx' --include='*.ts'
```

A field that surfaces in step 1 (write site) but has no consumer
in step 2 (read site) outside its own form/picker is a candidate
for half-wired-frontend purgatory. File a backlog item if no
renderer is planned.

### Audit-first value

Instances #2 and #3 above were both surfaced by audit/smoke
processes BEFORE escalating to user-data-loss-class incidents.
The Session 3 user-validation gate surfaced #2 in the very flow
the gate was designed to surface; the Session 4 Pre-Inspection
audit surfaced #3 as a near-miss before another release cycle
could ship it as a third user-visible bug.

**The pattern: half-wired features hide behind successful API
responses + green tests.** The tests assert WRITE returns 200;
the renderer / consumer / inverse-mutation is the only place
the user sees the result. A test that exercises the user's
expected downstream effect (not just the API write) is what
catches the gap.

### Anti-pattern

The ``v1 ships half, v2 ships the other half`` docstring is fine
**IF** v2 has an open backlog item with an ID that anyone
scanning the backlog can find. The failure mode is the docstring-
only deferral that never makes it into ``docs/backlog.md``,
``docs/ROADMAP.md``, or any other tracked list. Out of sight,
out of mind, in production for a release cycle, user reports
"this doesn't work" / "where did my data go" / "the picker has
no effect".

### Pairs with

- "Articles-vs-Books parallel-surface asymmetry" — Bug 10 fires
  under BOTH patterns. The asymmetry rule fires on "Articles +
  Books have it, Comments doesn't"; this rule fires on "Comments
  shipped half the contract". Same fix, two audit lenses.
- "End-to-end behavior tests are not 'kwarg passes through' tests"
  — the test that catches half-wired-frontend is the one
  asserting on the OBSERVABLE OUTPUT of the entire chain (picker
  → write → render), not just the API write.

## Test-isolation discipline: never run integration smoke-tests outside pytest

The Bibliogon harness ships three protective layers against
test runs hitting production data:

1. ``BIBLIOGON_TEST=1`` env-var, set by
   ``backend/tests/conftest.py`` BEFORE any ``app.*`` import.
2. ``TEST_DATABASE_URL=sqlite:///:memory:`` env-var, set in
   the same place.
3. ``.bibliogon-production`` marker file in real data dirs,
   plus a session-scoped autouse tripwire that aborts the
   pytest run with ``returncode=2`` if it ever sees the
   marker.

**All three only fire under pytest.** A free-standing
``poetry run python -c "from app.main import app; ..."``
script bypasses every one of them — conftest never executes
for direct-Python invocations, so the FastAPI app points at
the real production DB at ``~/.local/share/bibliogon/bibliogon.db``.

### Concrete incident

2026-05-16, during Bug 10 Commit 1. A smoke-test of the new
``DELETE /api/comments/trash/empty`` endpoint was run via a
direct ``poetry run python -c "..."`` script (NOT pytest)
against ``TestClient(app)``. The script ran successfully ―
and emptied the user's real production ``article_comments``
table, hard-deleting all 61 soft-deleted comments in one
``empty_trash`` call. The 14:25 ``.bgb`` backup did not
carry comments (Bibliogon backup format only persists
Article + Publication + ArticleAsset), so .bgb-based
recovery was impossible.

The dev-mode context prevented worst-case impact: the data
was reproducible from the original Medium archive. **But
the discipline violation was real and the harness was
working correctly — the test script ran outside its scope,
not the harness failing.** Frame the incident as a process
breach, not a harness defect, so the project doesn't acquire
a "harness is unreliable" mental model.

### Rule

For any integration smoke-test against FastAPI ``TestClient``
or any code path that imports ``app.main`` /
``app.database`` / ``app.routers.*``:

- **Default**: write the smoke-test as a one-off pytest file
  under ``backend/tests/``. Conftest fixtures (session-scoped
  env-var setup + the marker tripwire) fire automatically.
  This is the right shape for anything more than a single
  trivial assertion.

- **Acceptable shortcut for trivial probes**: prefix the
  command with the env-vars manually:

  ```bash
  BIBLIOGON_TEST=1 TEST_DATABASE_URL=sqlite:///:memory: \
    poetry run python -c "..."
  ```

  Use only when the probe is genuinely a one-line check (e.g.
  "does this import succeed?"). Anything that makes API calls
  or mutates DB state must go through pytest.

- **NEVER**: bare ``poetry run python -c "from app.main
  import app; ..."``. The FastAPI app's lifespan fires
  ``init_db()``, which connects to the production DB via
  ``app.database.DATABASE_URL`` (resolved at import time
  from ``BIBLIOGON_DATABASE_URL`` / ``DATABASE_URL`` env
  vars — neither of which the bare command sets).

### Detection grep

For self-audit before running any one-off probe:

```bash
# Grep your own command history for bare python -c imports.
history | grep -E 'python -c.*app\.main|python -c.*import app'
```

If a hit lacks the ``BIBLIOGON_TEST=1`` prefix, do not run
it. Rewrite as a pytest file.

### Pairs with

- The existing CLAUDE.md "Test isolation" section documents
  the three-layer harness. This rule is the discipline that
  keeps the harness load-bearing — without it, the harness
  exists but isn't exercised on the paths that need it most.
- "Operational gaps masquerade as wired infrastructure" — same
  family. The harness is wired, but only triggered on the
  pytest path; a script outside that path is operationally
  unprotected even though the protection exists.

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

- **Categories + BISAC (Bug 9, shipped 2026-05-16, commits
  ``032a1c7..148be6b``)**: Books-only. Articles use
  ``Article.topic`` (single, settings-managed enum, drives
  the per-platform publishing workflow) and ``Article.tags``
  (free-text). Books use ``Book.categories`` (free-text JSON
  list, KDP-aligned) and ``Book.bisac_codes`` (BISAC 9-char
  codes ``^[A-Z]{3}[0-9]{6}$``, validated for format only —
  see ``BISAC-DATABASE-LOOKUP-01`` for the deferred bundled-
  catalog path). The two domains have fundamentally different
  metadata shapes: an article ships to N platforms each with
  its own tagging norms; a book targets retail catalogues
  (KDP / Apple Books / Kobo) with industry-standard subject
  hierarchies. Forcing the same field set on both would help
  neither. **Canonical concrete example for this rule**: a
  future audit that grep's the accidental-asymmetry tally and
  asks "why aren't categories on Articles too?" should find
  this entry as the answer and close the question without a
  re-investigation. The KDP plugin's metadata checker
  (``plugin-kdp/bibliogon_kdp/metadata_checker.py``) is the
  only place that validates BISAC codes at write-time —
  the backend schema validator (``app.schemas.BISAC_CODE_RE``)
  is the canonical regex and the plugin duplicates it
  intentionally for loose coupling.

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

## Exploration docs need a Pre-audit section before any architecture proposal

Surfaced 2026-05-18 from the Comic-Foundation exploration
reframe. The first-draft `docs/explorations/comic-foundation.md`
(stub commit `de83dcc`) proposed extending the Picture-Book
`speech_bubble` PageLayout with a multi-bubble array. The user
critique caught a foundational conflict: `Book.book_type`
already reserves `"comic_book"` at the schema layer for a
future separate `plugin-comics` (see
[backend/app/models/__init__.py:72-75](../../backend/app/models/__init__.py)
+ [docs/explorations/children-book-plugin.md:13-23](../../docs/explorations/children-book-plugin.md)).
The reframe moved Comic-Foundation work to plugin-comics scope.

The architectural conflict was visible in the codebase in two
places (the model comment + the parent exploration doc). The
stub doc was 95 lines and skipped both. The canonical
exploration-doc structure (per `children-book-plugin.md`)
opens with a **Pre-audit: current state of the moving parts**
section precisely to surface these constraints. The stub
had no Pre-audit section.

### Rule

Any exploration doc that proposes a NEW architecture / NEW
schema / NEW plugin / NEW feature surface MUST include a
**Pre-audit section** before any proposal. Concrete
requirements:

1. **Audit the existing schema** (`backend/app/models/__init__.py`,
   relevant plugins' models, Alembic migrations) for
   reservations, discriminators, or fields that constrain the
   proposed shape. Quote the constraints with file:line
   citations.
2. **Audit parent exploration docs** (cross-referenced in
   the new doc's domain) for prior decisions that the new
   work inherits OR conflicts with.
3. **Audit related backlog items** for the architectural
   commitments they imply.
4. **Audit the lessons-learned rules** for prior incidents
   in the same area.
5. State the audit findings BEFORE the architecture proposal.
   If a conflict is found, the proposal section explicitly
   reconciles with the constraint OR documents why the
   constraint is being overridden.

The Pre-audit section is to architecture proposals what the
Pre-Inspection step is to feature implementations: a forcing
function to check the existing state before committing to a
new direction.

### Detection heuristic

When reviewing an exploration doc:

- Does it have a "Pre-audit" or equivalent section?
- Does it cite specific file:line references for prior
  architectural commitments?
- Does the architecture proposal reconcile with those
  commitments?
- Are related rules / memory entries / lessons cross-
  referenced?

If any answer is "no", the doc is at risk of repeating the
2026-05-18 Comic-Foundation reframe pattern: ship a thin
stub, propose a direction, get critiqued, reframe.

### Concrete cost saved by the Pre-audit step

The Comic-Foundation reframe required:

- One critique pass (~30 min) to catch the conflict
- One doc rewrite (95 lines → 736 lines) to install proper
  framing
- One backlog migration (2 items archived, 1 item re-scoped,
  1 new item filed)

All of which would have been avoided if the stub had opened
with: "Pre-audit finds `book_type = 'comic_book'` reservation;
multi-bubble work must live in plugin-comics, not extend
picture-book." That sentence is a 30-second grep at the
moment of writing — vs a half-day of rework after the fact.

### Multi-tool collaboration amplifier

The 2026-05-18 incident also illustrates the multi-tool
collaboration drift pattern (per the existing
"Multi-tool collaboration tracking" rule). The stub was
drafted from a Strategic-Advisor session ("Claude in chat",
parallel to the execution session). The execution session
had visibility into the codebase but accepted the chat-
session's framing without running the Pre-audit. Both
sessions missed the `comic_book` reservation; only the
critique pass caught it.

Implication: when a parallel-agent / chat-session hands off
a spec for an exploration doc, the execution session MUST
NOT skip the Pre-audit on the assumption that the chat-
session already did it. Each session validates its own
audit independently.

### Pairs with

- "Multi-tool collaboration tracking: re-sync before
  accepting new orders" — same family. Multi-tool drift
  amplifies this risk: a parallel-planning agent may not
  have visibility into the schema reservations the
  execution agent has.
- "Real-world data audit BEFORE implementation prevents
  spec-vs-reality drift" — runtime-data analog of this
  schema-state analog.
- "Schema 'preserved' / 'always set' claims must survive
  real-data audit before becoming spec" — schema-claim
  analog.
- `ai-workflow.md` Pre-Inspection step — implementation
  analog. Pre-audit is the doc-writing analog.

### Anti-pattern

Treating an exploration doc as a brainstorm-dump that
someone else will audit later. The audit IS the doc's job.
A 95-line "brainstorm dump" stub that pushes the audit cost
downstream generates more total work than a 400-line proper
doc with the audit upfront — by the cost ratio observed in
this incident (30 seconds vs. half a day).

## User-overlay merge semantics + migration discipline for config-version changes

When a config-overlay system uses "lists replace, dicts deep-
merge" semantics (the broadly-correct default for letting users
fully override specific values without losing other defaults),
**list-shaped fields that grow over a release lifecycle silently
filter out their new additions for upgrading users**. The fix is
NOT to change the merge semantics globally — that breaks the
contract for users who deliberately curated a shorter list. The
fix is a STARTUP-TIME MIGRATION that augments the user-overlay's
copy of the list with project-tree additions, respecting any
explicit opt-out signal.

### Concrete incident (2026-05-18, USER-OVERLAY-PLUGIN-ENABLE-MIGRATION-01)

Bibliogon's `backend/config/app.yaml` ships with a
`plugins.enabled` list that grew from 11 → 12 entries when
plugin-comics landed in v0.35.1. Existing users had a stale
user-overlay at `~/.local/share/bibliogon/config/app.yaml` (or
`/app/data/config/app.yaml` in the Docker prod named volume)
written under the v0.35.0 schema with 11 entries. The
`deep_merge` (lists replace) silently took the user-overlay's
11-entry list, filtered comics out, and the running backend's
plugin manager never activated it. Symptom: `/api/comics/info`
returned HTTP 404 against the live backend even though pytest
with TestClient passed (because pytest's `conftest.py` sets
`BIBLIOGON_DATA_DIR` to a fresh tmpdir, so no user-overlay
file existed during tests → migration was trivially no-op,
merge fell through to the full project list → comics activated).

### Pattern

For any list-shaped configuration value that:

1. ships with a project-tree default,
2. can be overridden by a user-overlay,
3. **grows** over the application's release lifecycle (new
   plugins, new endpoints, new feature-flags, new keyboard
   shortcuts, etc.),
4. has an explicit OPT-OUT mechanism (e.g. a sibling `disabled`
   list, or a `null` / `false` value for individual entries):

ship a **detect-and-append migration helper** that runs at
application startup. The helper:

- reads the project-tree's list AND the user-overlay's list,
- computes the set difference (project minus user, minus
  explicit-opt-out),
- if non-empty, atomically appends the new entries to the
  user-overlay's list and writes it back,
- logs the migration (per-name) at INFO level,
- refreshes any module-level snapshots that depend on the
  merged config,
- is **idempotent**: a second run with no diff is a no-op
  + no disk write.

### Test palette for this pattern (3 tiers)

Each tier catches a different class of regression. Ship ALL
THREE per the same commit that lands the migration code:

1. **Unit tests** for the migration helper as a pure function.
   Seed project + user inputs, assert the returned tuple +
   the disk state. Cover the canonical paths (append, in-sync
   no-op, opt-out respected, malformed-input graceful-no-op,
   idempotent second run, fresh-install no-op).
2. **Integration test** via TestClient + lifespan. Seed a
   stale user-overlay file in the conftest's data dir, refresh
   the application's startup snapshot, boot the app, assert
   the migration ran by checking BOTH the disk state AND the
   plugin/config-manager's internal state (NOT the HTTP layer
   — see below for the FastAPI route-mount-stickiness
   caveat).
3. **Live-dev E2E smoke** via Playwright (or curl-against-
   running-server). Seeds a stale user-overlay on the real
   filesystem, restarts the dev server, asserts the
   feature-that-was-silently-invisible is now reachable.
   Sister to PLUGIN-COMICS-E2E-SMOKE-01.

### FastAPI route-mount stickiness — DON'T assert via HTTP

FastAPI's `app.include_router(...)` is **one-directional**.
There's no `app.exclude_router(...)`. Once a plugin's router
is mounted in one TestClient lifespan, it stays mounted for
the entire pytest session — even after `manager.deactivate_all()`
runs at shutdown. Consequence: a test that asserts "comics
plugin opt-out works because /api/comics/info returns 404"
will FAIL falsely if a prior test in the same session
activated comics + mounted its router.

For the lifespan integration tests, assert on:
- `manager.get_active_plugins()` set (the manager-level
  contract — does pluginforge's `filter_plugins` include this
  plugin?)
- `manager._app_config["plugins"]["enabled"]` + `disabled`
  contents (does the merged config reflect the user-overlay?)
- the disk state of the user-overlay file (did the migration
  persist correctly?)

Reserve HTTP-layer assertions for tests that POSITIVELY
exercise the route (after activation), NOT for tests that
verify opt-out (where the route's persistence from prior
mounts will confound the test).

### Sync the manager AFTER the migration writes

The same lifespan ordering bug bit twice during this work:

1. The plugin manager is initialized at module-import time
   with a cached `_app_config` snapshot.
2. The first `_sync_manager_with_overlay()` runs at module-
   import time. At that moment, the user-overlay file may not
   exist yet (fresh install).
3. The migration runs INSIDE the lifespan, AFTER module-
   import. It writes to the user-overlay file.
4. **Without a second `_sync_manager_with_overlay()` call
   AFTER the migration**, the manager's `_app_config` still
   has the pre-migration view. `discover_plugins()` reads
   `_app_config` and filters per the stale list.

The fix is a SECOND sync immediately after the migration
helper runs, unconditional (covers both the migration-wrote
and migration-no-op cases; the second case is cheap because
the overlay didn't change).

### Why "change the merge semantics globally" is wrong

The instinct is to make `plugins.enabled` a UNION (project ∪
user). Don't. Today's contract — "user-overlay enabled list
replaces the project-tree's" — lets a user deliberately curate
a SHORTER list and have ONLY those plugins active. Changing
the merge silently expands their list every release. The
migration is the right shape because it's a one-time-per-
new-plugin event that respects the user's explicit opt-out
signal.

### Why "one-shot CLI" is wrong

A `bibliogon plugins sync-enabled` command works, but the
user discovers the bug FIRST (the 404, the missing feature),
THEN reads the release note that mentions the CLI. The
startup-time migration closes the loop without user
intervention. Reserve the CLI shape for migrations that
require user input or are too risky to auto-apply.

### When this rule fires

Any future config-version change that adds a new entry to a
list-shaped field with the "lists replace" merge contract.
Concrete candidates already in Bibliogon's config:

- `plugins.enabled` — closed by this incident's fix.
- `plugins.disabled` — same shape; the migration as written
  doesn't touch disabled. A user pre-emptively opting out of
  a not-yet-shipped plugin would be unusual but conceivable;
  the disabled-list-additions case has no observed need yet.
- `ui.themes` — currently project-tree only; if user-overlay
  customization ever lands, the same pattern applies.
- `donations.channels` — project-tree only today; same.

When adding a new list-shaped config field that may grow
across releases, walk this rule and decide whether a
migration helper is needed at design time, NOT at first-bug
time.

### Cross-references

- `backend/app/config_overlay.py::migrate_user_overlay_enabled_list`
  — the canonical implementation.
- `backend/tests/test_config_overlay.py` — 9 unit cases.
- `backend/tests/test_user_overlay_migration_lifespan.py` —
  4 integration cases.
- `e2e/smoke/user-overlay-migration.spec.ts` — live-dev smoke.
- `docs/roadmap-archive/2026-05.md` —
  "Archived 2026-05-18 (USER-OVERLAY-PLUGIN-ENABLE-MIGRATION-01)"
  for the close-out artifact.


## Pre-Inspection MUST audit all callers of a touched endpoint, not just the primary surface

Surfaced 2026-05-19 during the PDF-BLEED-MARKS-01 Pre-Inspection
when a half-wired surface from the just-shipped PDF-KDP-FORMATS-01
was discovered: BookMetadataEditor's Design-tab Export-PDF button
called the same export endpoint but passed empty query params,
silently ignoring the format dropdown that PDF-KDP-FORMATS-01 had
added to PageEditor. PDF-KDP-FORMATS-01's own Pre-Inspection had
scoped the feature-area (PageEditor + the dropdown) but had NOT
grep'd for ALL call sites of `api.documentExport.download(bookId,
"pdf", ...)`. The second caller existed in BookMetadataEditor's
Design tab since Session 6 Commit 5 (2026-05-17); the dropdown's
new query-param contract bypassed it because PDF-KDP-FORMATS-01
shipped the dropdown ONLY at PageEditor.

This is a class of half-wired bug that the existing "Half-wired
feature lifecycle" rule doesn't fully cover. That rule fires
when a state-WRITE has no consumer, OR a state-MUTATION has no
inverse. This new class fires when a NEW query param on an
EXISTING endpoint is wired at SOME callers but not ALL — the API
keeps working at the un-updated caller (empty params silently
fall back to defaults), but the user-visible feature is invisible
from that surface.

### Rule

Pre-Inspection for any feature that adds a new query param to an
existing API endpoint (or extends an endpoint's contract) MUST
explicitly grep for ALL call sites of that endpoint and report
them in the audit findings. Each caller is classified as:

- **Will-receive-feature:** caller updated in the same session to
  thread the new param.
- **Half-wired risk:** caller NOT updated; new feature silently
  invisible from that surface. Surface as STOP-condition trigger
  for explicit triage.

### Detection grep at Pre-Inspection time

For any new query-param feature on the export endpoint:
```
grep -rn "api\.documentExport\.download\|api\.<endpoint>\.<method>" \
  frontend/src/ --include='*.tsx' --include='*.ts' | grep -v '\.test\.'
```

For any new query-param on a non-API surface (e.g. shell-pipeline,
queue worker, scheduled job), grep for the function-name or the
endpoint URL string equivalently.

### Mitigation strategies

- **(Preferred when 2+ surfaces exist) Extract a shared
  component / helper FIRST**, then ship the new feature at the
  shared site. The Recurring-Component-Unification Rule from
  coding-standards.md applies here — 2 callers of the same
  endpoint shape often share enough UI to extract. PDF-BLEED-
  MARKS-01 C2 demonstrated this: `PictureBookPdfExportControls`
  encapsulated the format dropdown + bleed checkbox + Export-PDF
  button, mounted at BOTH PageEditor + BookMetadataEditor in the
  same session.
- **(When extraction isn't justified) Ship the new query param at
  every caller in the same session**, even if the secondary
  caller's UI is minimal. Half-wired callers shipping after the
  primary creates the silent-fall-through bug class.
- **(When extraction must be deferred) File an explicit follow-up
  backlog item with a load-bearing trigger.** Per the
  "Half-wired feature lifecycle" rule: the deferred work needs
  a tracked ID + concrete trigger, NOT a docstring TODO.

### Generalises to

- New query params on ANY existing endpoint.
- New kwargs on ANY existing service function.
- New required headers / metadata on ANY existing API call shape.
- New CLI flags on ANY existing command (multiple call sites in
  the codebase wrap subprocess invocations).

The discipline: Pre-Inspection's grep step is non-optional when
the work touches an existing contract. Anything less ships a
half-wired secondary surface as a side-effect.

### Concrete artefact

- PDF-KDP-FORMATS-01 (commits `60ff913` + `c96a1fc` + `b6eaf2c`):
  shipped the format dropdown in PageEditor only. Half-wired
  surface latent at `BookMetadataEditor.tsx:144-165` +
  `:484-528`.
- PDF-BLEED-MARKS-01 (this session) Pre-Inspection discovered the
  surface + the C2 extraction closed it as a Recurring-Component-
  Unification side-effect. Same shared component now serves
  PageEditor + BookMetadataEditor; format AND bleed selections
  cascade between the two surfaces via localStorage.

### Pairs with

- "Half-wired feature lifecycle" — covers the state-write-without-
  consumer family. This rule covers the new-query-param-with-
  partial-caller-coverage family.
- "Articles-vs-Books parallel-surface asymmetry" — covers same-
  named feature at 2 surfaces drifting. This rule covers a SHARED
  feature at 2 surfaces but the new contract only being honoured
  by one.
- Recurring-Component-Unification Rule in coding-standards.md —
  often the right tool for the mitigation.


## Pre-Coding-Reality-Check: re-audit at the keystroke, not just the audit

Audit-First Pre-Inspection is a strong discipline; it catches
class of bug A (committed plan misses an existing-state
constraint). But Pre-Inspection is necessarily LIMITED — the
auditor has finite time and greps the obvious surfaces. Even a
high-quality audit can ship a commit plan that, when reached
during implementation, turns out to deviate from optimal
reality in a small but meaningful way.

The Pre-Coding-Reality-Check rule fires AT the keystroke: BEFORE
writing the first line of code for a committed-plan step,
re-grep the immediate touch-surface one more time. The marginal
cost is seconds; the value is catching the cases the audit
missed.

### Three observed instances (2026-05-20 V060 adoption arc)

| Instance | What the plan committed to | What the keystroke-time grep found |
|---|---|---|
| **PDF-KDP-FORMATS-01 → PDF-BLEED-MARKS-01** | Ship format dropdown at PageEditor only | BookMetadataEditor Design tab is a second caller of the same export endpoint with empty query params (half-wired surface) — closed via shared-component extraction |
| **V060 C4: hot-reload on install/uninstall** | Wire `rediscover()` into `install_plugin` + `uninstall_plugin` | ZIP plugins bypass entry-point discovery entirely (go through `register_plugin()` directly). `rediscover()` would be a no-op there. Wiring is architecturally inapplicable. |
| **V060 C5: extend errors vs new states endpoint** | Choose between `/api/plugins/errors` extension or new `/api/plugins/states` | `/api/settings/plugins/discovered` ALREADY exists and is conceptually the per-plugin-state endpoint; both audit-committed options would create parallel duplication. Third path (γ) extending the existing endpoint is strictly better. |

Three instances in one session is sufficient recurrence to
formalize the pattern.

### Rule

For any commit whose plan was committed during a prior audit
(Pre-Inspection, design review, multi-session work, brief from a
parallel agent), the FIRST action at implementation time is to
re-grep the immediate touch-surface for:

- **Existing endpoints / functions / components** whose name or
  scope overlaps with what the plan proposes to create. (C5
  pattern: a parallel surface already exists.)
- **Architectural assumptions in the plan** that depend on how
  upstream/downstream code paths flow. (C4 pattern: the wiring
  the plan assumed is inapplicable.)
- **Half-wired siblings** — other callers of the same contract
  the plan is changing. (PDF-KDP-FORMATS-01 pattern: a second
  caller exists and would be skipped without the audit step.)

If the grep surfaces ANY of the three, STOP and surface to the
user with the finding + a proposed scope revision. Do NOT
silently descope or rescope; the user's commit-plan approval
was based on the prior audit's information state.

### Implementation: 30-60 seconds, not 30 minutes

This is NOT a re-run of the full Pre-Inspection. It's a quick
ground-truth check at the keystroke:

```bash
# Pattern for "is there a parallel surface I'm missing"
grep -rln "<endpoint-name>\|<function-name>" backend/app/ frontend/src/

# Pattern for "does the architectural assumption hold"
grep -rln "<assumed-mechanism>" backend/app/ | head -5

# Pattern for "what other callers exist"
grep -rln "<api-call-name>" frontend/src/ --include="*.tsx" | grep -v test
```

Total time: under a minute per commit. If the greps return
zero unexpected hits, proceed with the plan as committed.

### Pairs with

- "Pre-Inspection MUST audit all callers of a touched endpoint"
  — that rule fires at AUDIT time (early). This rule fires at
  CODE time (keystroke-time). Together they form a two-stage
  filter: audit catches the obvious, keystroke catches the
  audit's blind spots.
- "Half-wired feature lifecycle" — instances #1 and #3 of the
  three above both involve half-wired surfaces. The Pre-Coding
  step is the cheap mechanism for spotting them BEFORE the
  half-wired ships.
- "Multi-tool collaboration tracking: re-sync before accepting
  new orders" — same family of "audit-first; trust but verify"
  discipline. Multi-tool work is especially prone to plan-vs-
  reality drift because each agent has partial visibility.

### Anti-pattern

Treating the audit's commit plan as immutable. The audit is the
starting point, not the contract. A keystroke-time grep finding
that surfaces an architectural conflict is NOT scope creep — it's
the audit's blind spot being caught one stage later. Silently
descoping or rescoping to avoid the surface message produces
either a half-wired ship (instance #1) or a parallel-duplicate
ship (instance #3) or an inapplicable wiring ship (instance #2).
All three are real regressions; the surface message is the
cheap prevention.


## Architecture-doc consultation is part of Pre-Inspection, not
## post-implementation discovery

Filed 2026-05-22 from the KDP-PUBLISHING-WIZARD-01 Phase 1
session. Two Pre-Inspections back-to-back missed
``docs/architecture/state-machines.md`` even though the doc
was explicitly relevant. Recorded as single-instance
observation per the "single instance is incident, not
pattern" discipline; promote to pattern if a second
instance surfaces.

### What happened

The Pre-Inspection (Track 2 — frontend wizard-component audit)
compared the codebase's three existing wizards:

- ``ConvertToBookWizard`` — hand-rolled ``useState`` + step-
  index, ~1430 LOC
- ``AiSetupWizard`` — same shape, simpler, ~342 LOC
- ``ImportWizardModal`` — XState v5 machine + actor pattern,
  340 LOC machine + 403 LOC modal

The audit recommended ``ConvertToBookWizard``'s shape because
the new KDP wizard "has linear steps (no branching)". That
inference was wrong on the merits — branching isn't the only
criterion — but it was load-bearing in the implementation
plan, which then locked in ``useState`` for C0-C5.

After C2 shipped, the user surfaced
``docs/architecture/state-machines.md``. The doc lists 5
explicit trigger criteria for choosing XState v5; the KDP
wizard satisfies all 5:

1. 3+ states with multiple incoming transitions
2. Async side effects gated by state (3 API calls, one per
   step)
3. Guards or invariants across transitions
4. Reset/retry semantics
5. Future flows likely to branch (Phase 2 adds pricing + ARC)

The audit's frontend-component-tree grep did not reach the
architecture-doc directory.

### Mitigation that resolved THIS incident

User adjudicated path (γ): finish Phase 1 hand-rolled,
file ``KDP-WIZARD-XSTATE-MIGRATION-01`` as a P3 backlog
item paired with Phase 2. Both honored: session instruction
ships, architecture doc gets the migration at the natural
seam where branching pressure forces it.

The cost of the wrong-pattern Phase 1 ship: zero behavioral
defect, ~3-4 hours of future migration work (covered by the
filing).

### Recipe for future Pre-Inspections

Pre-Inspection's component-audit track MUST grep
``docs/architecture/`` for any doc whose topic matches the
component class being audited. Two-line grep:

```bash
grep -rln "<component-class-keyword>" docs/architecture/ docs/rules/ 2>/dev/null
ls docs/architecture/
```

The second command (literal ``ls``) is the cheap insurance —
six directories' worth of files in ``docs/architecture/``
can be skimmed in 30 seconds. If a doc's filename obviously
matches the component class (e.g. ``state-machines.md`` when
designing a wizard), it must be read before scoring component
candidates.

### Adjacent risk: parallel-agent specifications

The Phase 1 session prompt was authored by Strategic-Advisor
2026-05-23 (a parallel agent). It explicitly said "follow
ConvertToBookWizard as canonical reference". That directive
held weight in the executing session and was an additional
factor against the architecture-doc consultation: the
executor agent was treating the parallel-agent's spec as
authoritative.

Per the existing "Multi-tool collaboration tracking: re-sync
before accepting new orders" lessons-learned rule, the
executor must verify the spec against the codebase state
INCLUDING architecture docs. Specs written without
architecture-doc awareness produce the wrong-pattern
recommendation regardless of how authoritative they appear.

### Pairs with

- "Pre-Coding-Reality-Check: re-audit at the keystroke" (this
  file) — same family. The keystroke-time grep catches the
  audit-blind-spot one stage later; the recipe above prevents
  the blind spot at audit time.
- "Multi-tool collaboration tracking: re-sync before accepting
  new orders" (this file) — same family. The architecture doc
  is one of the things the executor must verify against, not
  just commits + open issues.


## Single-Router-Per-Plugin convention

Filed 2026-05-20 from the halted Comics-Session-2 Pre-Inspection.
Bibliogon plugins MUST return ONE FastAPI router from
``BasePlugin.get_routes()``, NOT a list of separate sibling
routers. Nesting via ``router.include_router(sub_router)`` is the
right shape for plugins that need multiple route namespaces.

### Concrete instance

Comics-Session-2's original C2 design specified three sibling
routers returned from ``ComicsPlugin.get_routes()``:

- ``info_router`` (prefix ``/comics``) — Session-1's
  ``GET /info``
- ``panels_router`` (prefix ``/books``) — Session-2 panel CRUD
- ``bubbles_router`` (prefix ``/books``) — Session-2 bubble CRUD

The full backend pytest sweep failed with
``RecursionError: maximum recursion depth exceeded`` during
``TestClient.wait_startup``. Refactoring to a SINGLE
``info_router`` that internally calls
``include_router(panels_router)`` + ``include_router(bubbles_router)``
restored most of the sweep (recovered 14 of 27 failures and 154
of 167 errors). The remaining failures were the
``PLUGINFORGE-RECURSION-LIMIT-REGRESSION-01`` underlying issue,
which is a separate filing — but the three-router shape made
the regression visible 14x sooner.

### Why this is the right convention

1. **Per-lifespan FastAPI route registration is one-directional**
   (per the existing "FastAPI route-mount stickiness" rule in
   this file). Each plugin's get_routes() result is mounted via
   ``app.include_router(...)`` PER ROUTER returned. Plugin
   deactivation logs the deactivation but the FastAPI app
   retains the routes. ``N routers × M test lifespans`` is the
   per-router multiplier; reducing N to 1 cuts the accumulated
   route-registry state by Nx.

2. **Kinderbuch precedent** — the canonical picture-book plugin
   ships ONE router (``pages.py``'s router; the plugin's
   ``get_routes()`` returns ``[router]``). 11 other shipped
   plugins follow the same shape. Comics was the outlier in
   specifying three.

3. **Sub-routers nest cleanly** via FastAPI's
   ``include_router``. Each sub-router carries its own prefix +
   tags + dependencies; the top-level router stays composable
   without flattening.

### Mitigation rule for Pre-Inspection

When specifying new plugin route structure, Pre-Inspection MUST
include an explicit Pattern-Audit step:

```bash
# Grep existing plugin patterns BEFORE specifying the new one.
for plug in plugins/bibliogon-plugin-*/; do
  name=$(basename "$plug" | sed 's/bibliogon-plugin-//')
  echo "--- $name ---"
  grep -nE 'get_routes|return\s*\[' \
    "$plug"/bibliogon_*/plugin.py 2>/dev/null | head -5
done
```

If the existing convention is "1 router per plugin", new
plugins MUST follow it. Deviating requires explicit user
adjudication BEFORE the Pre-Inspection commits to a design.

### Generalises to

- New plugin authors' first-instinct "I have 3 logical
  namespaces so I'll return 3 routers" — wrong; nest them.
- Architectural-decision documents specifying plugin structure
  without grepping existing plugins for conventions — wrong;
  Pattern-Audit step is mandatory.
- Any time a Pre-Inspection notes "matches the kinderbuch
  pattern" or "follows existing convention" without an explicit
  grep step — surface the grep result, don't trust prose
  references.

### Concrete artifact

- Refactor commit: ``2ffaed8`` (Comics-Session-2 C2 — restored
  single-router shape during the same commit that introduced
  the issue, after the failed sweep surfaced it).
- Backlog filing: ``PLUGINFORGE-RECURSION-LIMIT-REGRESSION-01``
  (P1) — the underlying state-accumulation bug that the
  three-router shape exposed.

### Pairs with

- "FastAPI route-mount stickiness — DON'T assert via HTTP"
  (this file) — explains the per-lifespan accumulation that
  makes the N-router shape problematic.
- "Pre-Coding-Reality-Check: re-audit at the keystroke, not
  just the audit" (this file) — Pattern-Audit step would have
  caught this BEFORE the C2 commit, not during it.
- ``coding-standards.md`` Recurring-Component-Unification Rule
  — same family of "look at what already exists before adding
  parallel shapes" discipline.


## CRUD shipping: List endpoint is non-optional

Filed 2026-05-20 from Comics-Session-2 C6
Pre-Coding-Reality-Check surfacing.

Comics-Session-2 C2 (commit ``2ffaed8``) shipped bubble-CRUD as
**Create + Update + Delete** with NO **List** endpoint. The gap
was invisible during C2's own test sweep — the 8 dispatch tests
that exercise the routes all targeted Create / Update / Delete
paths; List was never called because no test needed it. Three
commits later (C6, this session), the frontend full editor's
``ComicPanelGrid`` needed a way to populate
``panelBubblesMap`` and the gap surfaced as the **first
integration-issue stop-condition** in the C6 Pre-Coding-Reality-
Check.

### Rule

When shipping a "CRUD" set of endpoints, **List is mandatory**,
even when the immediate consumer is a frontend that doesn't yet
exist. The acronym is not a buffet — "CUD" is purgatory waiting
to surface (per the existing "Half-wired feature lifecycle"
rule).

Concrete: any commit subject of the form
``feat(X): N CRUD endpoints + tests`` MUST register all four
verbs (Create, Read-list, Update, Delete) on its primary
resource. Read-by-id can be deferred when ergonomic — usually
inferable from a per-resource patch round-trip — but Read-list
is the load-bearing one a consumer needs to populate any UI
that displays the resource set.

### Detection during Pre-Inspection

When the next session's editor / page / dashboard / consumer-of-
the-resource starts, the **Pre-Coding-Reality-Check MUST grep
the existing routes for a list endpoint** before assuming the
read path is wired. Recipe:

```bash
# For a resource shipped at /api/.../{resource}:
grep -rn '@router\.\(get\|post\|patch\|delete\)' \
  plugins/<plugin>/ backend/app/routers/ \
  --include='*.py' | grep <resource>
```

If only ``@router.post``, ``@router.patch``, and
``@router.delete`` show up — surface as Half-Wired-Lifecycle
closure before the consumer ships. The C6 Pre-Coding-Reality-
Check caught this same-session and added the missing List
endpoint atomically.

### Concrete artefact

- Gap: C2 (commit ``2ffaed8``) shipped 3 of 4 verbs for
  ``comic_bubbles``
- Surface: C6 Pre-Coding-Reality-Check (this session)
- Fix: ``GET /api/books/{book_id}/comic-panels/{panel_id}/bubbles``
  added in C6 commit ``a33baf3`` with 4 paired pytest cases
  (``TestComicBubbleList``) covering empty-state, position-
  ordered, 400-on-non-comic-book, and 404-on-unknown-panel.

### Pairs with

- "Half-wired feature lifecycle" (this file) — same family.
  The CRUD-missing-List shape is a special case of state-write-
  without-state-consumer where the consumer is a future UI that
  hasn't shipped yet.
- "Pre-Coding-Reality-Check: re-audit at the keystroke" (this
  file) — the discipline that catches this specific class.
- "Pre-Inspection MUST audit all callers of a touched endpoint"
  (this file) — producer-side analogue to caller-coverage.


## Foundation-Override extension: Half-Wired-Visible-in-Production triggers P1

Filed 2026-05-20 from the backlog re-prioritization audit
(`docs/audits/backlog-reprioritization-2026-05-20.md`, commit
`281a6f6`).

The original Foundation-Override (in `ai-workflow.md` "ROADMAP
priority tiers" + the 4-Axes audit methodology) auto-promotes
items to P1 when **A2 = 5** (blocks 3+ items OR is upstream-
blocker). The audit's apply phase surfaced a gap: items that
score below 17 in raw 4-Axes totals but produce a **user-
visible half-wired state in production** deserve the same P1
override.

### Concrete case that triggered the extension

`PLUGIN-COMICS-SESSION-3-PAGES-CRUD-01` scored 16 (A1=4 + A2=4
+ A3=4 + A4=4). The strict Foundation-Override didn't fire
(A2=4 < 5). But the item closes the **degraded "no comic pages
yet" state** that `ComicBookEditor` surfaces in production
today: users can create a comic_book, the editor mounts, but
they cannot add pages because plugin-kinderbuch's pages router
gates on `book_type='picture_book'`. The half-wired state is
visible to every user who tries to author a comic.

Score-only methodology would have kept this at P2; the user-
visible half-wired criterion bumps it to P1 because the cost
of leaving it is paid by every user, not just the developer.

### Extended override rule

**P1 override fires when ANY of:**

1. **A2 = 5** (original criterion: blocks 3+ items OR upstream-
   blocker), OR
2. **Half-Wired-Visible-in-Production**: the item closes a
   half-wired feature that is currently shipping in production,
   user-visible, and degraded.

Half-Wired-Visible-in-Production criterion checks:

- The half-wired feature is **already in production** (i.e. the
  write-surface OR the partial-state shipped to users; it's not
  a pre-ship gap)
- The user-side **observes the broken-ness** (not just
  developers; not just CI; not just future-state assumptions)
- The item closes the read-surface, inverse-mutation, or
  blocker that would make the feature whole

### Distinction from "Half-Wired-Feature-Lifecycle" rule

The existing "Half-wired feature lifecycle" lessons-learned
entry (this file) covers PREVENTION: don't ship state-write
without state-consumer; don't ship Create+Update+Delete without
Read.

This new override covers CLEANUP-PRIORITY: when a half-wired
feature DID ship (often during a feature-rush or a deliberate
in-stages decision), the closure item gets P1 priority instead
of falling into normal-tier work.

The two rules are complementary:

- Prevention rule fires AT DEVELOPMENT TIME (Pre-Inspection
  catches the gap).
- Override rule fires AT BACKLOG-PRIORITIZATION TIME (closure
  item gets P1).

### Counterexamples (when override does NOT fire)

- A half-wired feature that's **not yet shipped** (dev branch
  only) is NOT under this override. Use the prevention rule
  instead.
- A half-wired feature that's shipped but **not user-visible**
  (e.g. an internal admin tool only Aster uses) does NOT trigger
  P1 — production-visible means user-visible.
- A half-wired feature whose closure scope is **multi-session
  XL work** (e.g. KDP-Wizard's wizard surfaces) gets the
  normal-tier treatment because P1 implies "do soon" and the
  multi-session shape can't honor that semantic.

### Pairs with

- `ai-workflow.md` "ROADMAP priority tiers" (the original
  Foundation-Override definition lives there)
- "Half-wired feature lifecycle: a state-write without its
  inverse-mutation OR its state-consumer is purgatory, not a
  feature" (this file) — prevention sibling


## Periodic backlog re-prioritization discipline (4-Axes audit pattern)

Filed 2026-05-20 from the audit's apply-phase retrospective.

Backlog priorities are assigned at filing time. Over weeks-to-
months of organic growth they drift from current strategic-
state — items filed early under "next direction" lose
relevance; speculative items mature into actionable; effort-
estimates calibrate against shipped work. Single-author projects
accumulate this drift faster than multi-author ones because
nobody else re-reads the backlog from scratch.

The 2026-05-20 audit revealed:

- 24 of 67 active items had a tier mismatch under current
  4-Axes scoring (~36%)
- 4 items were archive candidates (work shipped or
  semantic-duplicate)
- 4 items had body-vs-section priority inconsistencies
- 1 item had non-standard ID format
- 2 audit-body candidates were stale references to already-
  archived items

### Trigger criteria for the next audit

Schedule a re-prioritization session when **any of**:

1. **Substantial growth** since last audit: >= 20 new items
   filed
2. **Major phase close**: Phase 4 wraps; v1.0 cut; multi-session
   feature ships (e.g. Comics-Session-N + Mobile-Sync-N)
3. **Strategic-direction shift** explicitly declared by user
   (e.g. "we pivoting from picture-book to fiction")
4. **Quarterly cadence**: ~3 months since last audit even
   without strong trigger

### Audit deliverable shape

The audit's output is a SINGLE READ-ONLY document at
`docs/audits/backlog-reprioritization-YYYY-MM-DD.md`. Structure:

- Summary statistics (item count, distribution, changes
  proposed)
- Top-10 action list (highest-priority items)
- Cluster identification (items that ship together for less
  cost)
- Full re-prioritization table (per-item 4-Axes scoring)
- Archive candidates
- Open Questions for user-decision
- Methodology limitations

The deliverable is **NOT** an apply commit. The apply phase is
separate, follows user-adjudication of Open Questions, and is
its own multi-commit session.

### Audit-vs-Apply separation

Three reasons to keep audit + apply as separate sessions:

1. **User-adjudication latency**: Open Questions may take days
   to resolve. The audit doc captures the audit-state at a fixed
   commit; the apply phase consumes the adjudication.
2. **Audit doc as historical record**: even after apply lands,
   the audit doc documents WHY the changes were made. Future
   contributors (or LLMs) revisit it.
3. **Atomic commits**: audit = 1 commit (the doc); apply =
   N commits (per-cluster). Separating them keeps each commit
   focused.

### 4-Axes scoring shape (canonical)

Each item scored 1-5 across:

- **A1 User-Visible-Impact**: does shipping it produce user-
  visible value?
- **A2 Foundation-Impact**: does it unblock other items?
- **A3 Strategic-Alignment**: does it match current-quarter
  direction?
- **A4 Effort-Discounted-Value**: effort inverse-weighted by
  value

Sum is 4-20. Tier-map: 17-20 P1, 13-16 P2, 9-12 P3, 5-8 P4, 4
P5. Plus the Foundation-Override (now extended; see prior
section).

### Anti-pattern: priority-as-filed without re-audit

Priorities assigned at filing time + never re-audited produces
predictable drift:

- P3 grows to dominate the backlog (default-priority bias)
- P5 accumulates trigger-gated speculative items that never
  fire
- New users / fresh contributors / future-sessions can't tell
  what's important
- The "next session" decision happens by recency-bias rather
  than score

The periodic audit forces a fresh look. The cost is small
(1-2 hours per audit) and amortizes across many sessions
that follow.

### Pairs with

- `ai-workflow.md` "ROADMAP priority tiers" (the canonical
  tier semantics)
- `ai-workflow.md` "Continuous-archival rule" (the daily-
  hygiene sibling; re-prioritization is the periodic sibling)
- "Foundation-Override extension" (this file) — the override
  that the audit-methodology consumes


## Stale-bundle is the most common false-positive on post-ship user reports

Filed 2026-05-20 from the PAGES-CRUD-01 → Add-Panel cycle. After
a frontend-touching ship, if the user immediately reports the
just-shipped feature "doesn't work", **stale-bundle (η class) is
more likely than regression (β) or real-bug (ε)**. Cheap pre-check,
mandatory before any deeper investigation.

### The exact sequence that fired this rule

The PAGES-CRUD-01 close shipped a Create-First-Page button.
The very next user-action — Add Panel — was reported "geht nicht".
Live Playwright Chromium + ``getComputedStyle`` + full-page
screenshot all agreed: panel renders at 822×822 with the
auto-select highlight active. User's manual-test reported a
10px collapse. The reported book ID didn't exist in the dev DB.
The most-likely cause was a browser session running pre-ship JS
that wouldn't have shown the new visual feedback paths.

### Verification recipe (run BEFORE opening an investigation)

1. **Confirm HEAD.** ``git log --oneline -3`` matches the ship.
2. **Hard-reload + disable cache.** Browser DevTools → Network →
   "Disable cache" checkbox → ``Ctrl+Shift+R``. Confirm fresh
   bundle in Network tab.
3. **Reproduce on a fresh entity** (new comic_book, new page,
   etc.) — not the user's possibly-corrupted pre-ship row.
4. **Only then** open the investigation taxonomy (α-η).

### Diagnostic-Layer-Disagreement is data, not contradiction

When Playwright + getComputedStyle + screenshot agree, AND
manual-test disagrees, the disagreement points to *stale bundle*
or *data-corruption* or *environment-specific*, NOT "Playwright
is wrong". Treat agreement-across-three-DOM-layers as the
authoritative signal; the manual report is the input that
triggered investigation, not the verdict.

### Audit-First holds under user-pressure

When a user re-classifies a finding ("you're wrong, it IS a real
bug"), the right response is **demand evidence first** (computed
height, screenshot, HEAD SHA), THEN re-open the investigation.
Skipping straight to deeper investigation on a re-classification
risks shipping fixes for bugs that don't exist. The audit
discipline holds regardless of who's pushing back.

### Pairs with

- "User-perceived bug ≠ code bug: the perception-lag class"
  (this file) — the parent pattern; stale-bundle is a frequent
  perception-driver.
- "Pre-Coding-Reality-Check: re-audit at the keystroke" (this
  file) — same verify-before-act discipline, applied to the
  responding-to-a-bug-report surface.


## Playwright-visible ≠ User-visible: assert bounding-box dimensions for CSS-collapse class bugs

Filed 2026-05-20 from Phase 1 of PLUGIN-COMICS-PHASE-1-MULTI-
PANEL-LAYOUTS-01.

Playwright's ``toBeVisible()`` returns true when:

- the element exists in the DOM
- ``computed-style.display !== "none"``
- ``computed-style.visibility !== "hidden"``
- ``opacity > 0``
- the element has non-zero size **on at least one axis**

**A CSS-collapsed element with height: 0 to ~10px will still pass
``toBeVisible()`` if it has any width.** The element is technically
visible in the layout — it just renders as an invisible strip that
the user cannot interact with or perceive as a UI affordance.

This is the trap that made the Multi-Panel-Bug uncatchable by
existing E2E coverage:

- ``comic-panel-bubble-crud.spec.ts`` asserted
  ``await expect(panel).toBeVisible()`` on the second panel.
- Pre-Phase-1, the 2nd panel collapsed to ~0-10px height
  (implicit CSS-grid auto-row collapse).
- The element existed; had `display: block`; had non-zero
  width — so ``toBeVisible()`` returned **true**. The spec
  passed; the bug shipped; the user reported it.

### Rule

When the E2E spec is about **"this element renders correctly /
visibly to the user"**, do NOT rely on ``toBeVisible()`` alone.
Add a bounding-box dimension assertion:

```typescript
const bbox = await element.boundingBox();
expect(bbox).not.toBeNull();
expect(bbox!.height).toBeGreaterThan(50);   // or width, or both
```

Pick the dimension threshold to differentiate "rendered
correctly" from "CSS-collapsed strip" without being brittle to
viewport variations:

- For full-height panels in an ~800x800 canvas: **>50px** is
  safe (correct height is ~400px for grid_2x2; bug shipped at
  ~0-10px).
- For headers / toolbars: **>20px** typical.
- For modal dialogs: **>200px** typical.

### When to apply

- Any layout-bug class where CSS-collapse / margin-collapse /
  flex-collapse / grid-collapse is the failure mode.
- Any spec asserting "panel / card / tile renders visibly" —
  the visual-correctness contract requires dimensional check,
  not just `toBeVisible()`.
- After a real-user report of "X is too small / collapsed / not
  showing" — file the regression-pin with the dimension
  assertion, NOT just `toBeVisible()`.

### When NOT to apply

- For "this element exists somewhere in the DOM" intent:
  `toBeVisible()` or even `expect(...).toHaveCount(1)` is right.
- For "click target reachable" intent: `toBeEnabled()` is
  more precise.
- For tooltip / popover / async-load: `toBeVisible()` paired
  with `findByTestId` (the auto-waiting variant) is correct;
  the dimension check is overkill.

### Concrete artefact

The Phase 1 C5 spec (`e2e/smoke/comic-book-multi-panel-layout.spec.ts`)
ships 4 cases, 2 of which use the bounding-box-dimension
pattern:

```typescript
const bbox = await panels.nth(i).boundingBox();
expect(bbox).not.toBeNull();
expect(bbox!.height).toBeGreaterThan(50);
```

This regression-pin catches the Multi-Panel-Bug. A future
contributor restoring the pre-Phase-1 single_panel-default
behavior breaks the bounding-box assertion on the 2nd panel.

### Pairs with

- "Stale-bundle is the most common false-positive on post-ship
  user reports" (this file) — same family. Both are about
  diagnostic discipline when production reports contradict
  passing tests.
- "Testid namespace pinning prevents silent E2E skips" (this
  file) — namespace pinning prevents the test from running
  against wrong elements; dimension assertions prevent the test
  from accepting a wrong-rendering of the right element.


## Plain `git status` before every commit, especially in
   Multi-Tool-Coordination sessions

Filed 2026-05-21 from a concrete incident during Phase 2
PANEL-CONFIG-01 C7. `git status` filtered by path (e.g.
`git status docs/`) hides files that are STAGED but live
outside the filter scope. In multi-tool-coordination
workflows where a parallel session can leave pre-staged
files in the index without committing them, the next
`git add <other-path>` + `git commit` will absorb those
pre-staged files silently — they end up in your commit
under your subject line, even though you never touched
them.

### Concrete incident

Phase 2 C7 (`954248e`) was intended to ship 2 docs/*
files. A paused parallel session (PluginForge v0.9.0
follow-up) had left 7 files staged in the index. The
filtered `git status docs/` showed only the 2 docs
files as not-yet-staged; the 7 already-staged files
outside docs/ were invisible. `git commit` shipped all
9 under the `docs(backlog): close ...` subject line.
Full audit-trail at
`docs/journal/c7-absorption-note-2026-05-21.md`.

### Rule

Run **plain `git status`** (no path filter, no
`--porcelain`-but-grep) immediately before every
`git commit`. Read the FULL index state — both
"Changes to be committed" (staged) AND "Changes not
staged for commit" (unstaged). If either section
contains files you did not intend to ship in this
commit, STOP and reconcile before committing.

In single-tool workflows the discipline catches the
occasional stale staging from your own prior session.
In multi-tool-coordination workflows (parallel CC
sessions, user-side commits interleaving with
assistant commits) the discipline is load-bearing:
silent absorption of a parallel session's in-flight
files is the failure mode.

### Detection-vs-prevention

This rule is prevention, not just detection. A
post-commit audit can catch absorption (`git show
--stat HEAD` after each commit) but cannot un-ship it
non-destructively once pushed; force-push amendments
are destructive per CLAUDE.md safety rules. The pre-
commit `git status` check is the only point in the
workflow where absorption is cheap to prevent.

### Explicit-paths discipline (addendum 2026-05-23)

Filed alongside GETSTARTED-MULTIBOOK-TYPES-UPDATE-01 C5
per user-directive: explicit-paths-staging is canonical
pattern for Multi-Tool-Coordination sessions, NOT an
ad-hoc-bypass for individual incidents.

**Rule:** during ANY session where parallel-session work
is in flight (staged renames, modified files, untracked
files NOT authored by the current session), every
`git add` invocation MUST name files individually by
absolute or relative path. The following commands are
FORBIDDEN in this context:

- `git add -A`
- `git add .`
- `git add --all`
- `git add <directory>/` where the directory contains
  parallel-session work

The shape is:

```bash
# CORRECT — explicit paths, file-by-file
git add backend/config/i18n/de.yaml backend/config/i18n/en.yaml
git add frontend/src/pages/GetStarted.tsx

# WRONG — absorbs parallel session's work
git add .
git add backend/  # may absorb parallel session's backend changes
```

**When to apply:**

The discipline fires whenever the pre-commit `git status`
shows EITHER staged files OR modified-unstaged files OR
untracked files that the current session did NOT author.
Concretely: any file in the index/working-tree that
wasn't touched by the current session is parallel-session
work and must be left alone.

**Concrete artefacts:**

- MULTI-PAGE-NAVIGATION-01 C5 (commit `90888df`,
  2026-05-23) — staged 3 files explicitly; left 3
  parallel-session HOOKSPEC files unstaged.
- GETSTARTED-MULTIBOOK-TYPES-UPDATE-01 C1-C5 (commits
  `75f2ef6..(C5)`, 2026-05-23) — every commit's
  `git add` named files individually; 14 staged-renames
  + 3 modified docs + 1 untracked from a parallel session
  remained untouched throughout all 5 commits.

**Pairs with:**

- "Multi-tool collaboration tracking: re-sync before
  accepting new orders" — session-start sibling.
- The parent rule above (Plain `git status`) — the
  status-check is the trigger; explicit-paths is the
  action-shape that prevents the absorption.

**When this rule does NOT fire:**

Single-tool sessions where the entire working tree is
the current session's work. `git add -A` is fine there
(modulo the existing CLAUDE.md "stage specific files
to avoid sensitive files" rule which is about
security-class artefacts, not Multi-Tool-Coordination).

### Pairs with

- "Multi-tool collaboration tracking: re-sync before
  accepting new orders" (this file) — same family.
  That rule covers session-start re-sync; this rule
  covers commit-time re-sync. Both prevent silent
  drift between parallel agents.
- "Hotfix cluster tag policy" (this file) — same
  spirit. The cost of preventing a bad commit is
  always lower than the cost of recovering from it
  non-destructively.


## Audit-Methodology: design-intent-axis as 5th-Axis or Override-Filter

Filed 2026-05-23 from two RCU-audit incidents within 48 hours.
The 4-Axes scoring (Site-count, Drift-Risk, Extraction-Ease,
Downstream-Value) carries an implicit implementation-identity-
bias: scores HIGH on byte-identical clones, but misses cases
where the cloning is INTENTIONAL per documented design-intent.

### Two evidence-cases

1. **useSelection<T>() (score 16) — DEFERRED-PERMANENT.**
   Three byte-identical hooks; `diff` returned only doc-
   comment differences. But those doc-comments contained
   the anti-extraction-rationale at [useBookSelection.ts:7-10](../../frontend/src/components/useBookSelection.ts#L7-L10):
   *"Kept as a separate hook (rather than a generic
   `useSelection`) so that future per-entity divergence ...
   lands in one place without a cross-entity refactor."*
2. **AUTHOR-DATALIST-EXTEND-EDITORS-01 — DEFERRED UX-
   ADJUDICATION.** The pair-shipping intent proposed
   REPLACING existing Pattern B (closed-list profile-select)
   with Pattern A (datalist + free-text) at editor surfaces
   — a UX trade-off (safety vs flexibility), not a
   mechanical migration.

Both were caught by Pre-Coding-Reality-Check, NOT by the
audit. An audit-methodology that scored design-intent
explicitly would have caught them upstream.

### Mitigation: override-filter (preferred over 5th-axis)

Future audits apply BEFORE 4-Axes scoring: grep doc-comments
for design-intent markers ("Kept as separate", "deliberate.*
separate", "not extract", "intentional", "no synthetic
merge"). Matches are filed as candidates but excluded from
the ranked extraction sequence until explicit user-
adjudication.

Override-filter chosen over a 5th-axis because the grep
takes seconds while carrying a 5th axis through every
candidate's scoring adds methodology overhead for marginal
benefit. Recipe lives in the audit's 2026-05-23 footnote.

### Pairs with

- "Pre-Coding-Reality-Check: re-audit at the keystroke" (this
  file) — keystroke-time safety net for any audit that
  already missed the design-intent marker.
- "Recurring-Component Unification Rule"
  (`coding-standards.md`) — the 2-surfaces threshold the
  4-Axes scoring derives from; design-intent is the override
  to that threshold.
- `docs/audits/recurring-component-audit-2026-05-21.md`
  footnotes 1 + 5 — the two concrete incidents driving this
  filing.

