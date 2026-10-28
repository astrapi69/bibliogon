# Lessons learned: Import and export

Importers, walkers, Pandoc/manuscripta, export formats, chapter content shapes.

Index of every entry: `.claude/rules/lessons-learned.md`. Moved here from that file unchanged (#1141).

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

## Pandoc raw-HTML pass-through is format-specific

- Pandoc's HTML and EPUB writers preserve raw HTML blocks verbatim. The LaTeX (PDF) and DOCX writers SILENTLY DROP raw HTML - including `<figure>`, `<img>`, `<figcaption>`. The verbose log records `Not rendering RawBlock (Format "html") "<figure>"` per dropped element.
- Practical consequence: any Markdown emitted by bibliogon that contains raw HTML images will produce an EPUB with images and a PDF without them. Same input, different output, no error message. We hit this in v0.13.x: imported books exported to PDF with zero embedded images while EPUB worked, and there was no way to tell something was wrong.
- Fix: when converting to Markdown for export, always emit native Pandoc syntax for content that must survive PDF/DOCX. For figures, that is `![caption](src "alt")` - Pandoc's `implicit_figures` extension (default in `gfm`/`markdown`) promotes a single-image paragraph back into a real `\begin{figure}` / `<figure>` block in every output format. The raw-HTML form is acceptable ONLY for HTML/EPUB-only content.
- See [html_to_markdown.py:_close_figure](../../../plugins/bibliogon-plugin-export/bibliogon_export/html_to_markdown.py) for the converter that emits native syntax for simple figures and falls back to raw HTML (with a warning log) for complex shapes (multiple imgs, mixed content). The warning fires the moment real-world content hits the fallback so we discover it before users do.
- Note: manuscripta v0.8.0's `strict_images=True` does NOT catch this class of bug. Strict mode parses Pandoc stderr for unresolved-resource warnings, which only fire when the *reader* fails to resolve a path the *writer* is trying to embed. Raw HTML is dropped at the writer stage before resolution is attempted, so strict mode never sees it.

## manuscripta v0.8.0 migration: source_dir + run_export + strict_images

- v0.7.x had no first-class library entry point; callers imported `manuscripta.export.book.compile_book` and relied on `os.chdir(project_dir)` plus mutating `manuscripta.export.book.OUTPUT_FILE` (a module global) before the call. Both are gone in v0.8.0.
- v0.8.0 ships `run_export(source_dir, *, output_file=..., no_type_suffix=..., strict_images=True, ...)`. Pass `source_dir` explicitly; the library never calls `os.chdir` itself, so callers must not rely on cwd. `output_file`/`no_type_suffix` are proper kwargs; do NOT mutate `OUTPUT_FILE` even though it still exists for the CLI's internal use.
- New typed exception hierarchy under `from manuscripta import ...`: `ManuscriptaError` (base), `ManuscriptaImageError(.unresolved: list[str])`, `ManuscriptaPandocError(.returncode, .stderr, .cmd)`, `ManuscriptaLayoutError(.source_dir, .missing, .reason)`. Per ADR-0004 in upstream, `__str__()` of these is diagnostic; pin error handling on attributes, NOT on parsing the rendered text. Bibliogon wraps them in `MissingImagesError`/`PandocError` with the original as `.cause`.
- `strict_images=True` is the new default and the right choice for plugin-export: scaffolder writes assets into `project_dir/assets/` from the DB, so any unresolved image is a real bug worth surfacing as a 422 with the `.unresolved` list to the frontend toast.
- Backend `poetry.lock` caches the resolved dependencies of path-installed plugins. After bumping `manuscripta` in `plugins/bibliogon-plugin-export/pyproject.toml`, run `poetry lock` AND `poetry install` in the backend dir too - otherwise `bibliogon-plugin-export` shows the old pin and you ImportError on `from manuscripta import ManuscriptaError`.
- TTS adapter API (`manuscripta.audiobook.tts.create_adapter`, `VoiceInfo`, all engine names) is unchanged in v0.8.0; no audiobook plugin code touches v0.8.0's typed `TTSError` hierarchy yet (existing broad `except Exception` blocks still work). Narrowing those is a separate hygiene pass, NOT part of the v0.8.0 upgrade.

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

## HTML-to-Markdown conversion

- NO regex-based converter for nested HTML structures.
- Use an HTMLParser-based converter that tracks nesting depth.
- Specifically for <ul>/<li>: correct 2-space indentation per level.

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

## A plugin test suite that reads Chapter.content needs an HTML-imported-chapter fixture

`Chapter.content` is documented as TipTap JSON, but the write-book-template
importer deliberately stores HTML there - the editor parses it via
`setContent` and only writes JSON back on the first save. Measured on the
production dev library: 833 chapters, **zero** carrying TipTap JSON - 778
HTML, 55 empty. Every imported book is HTML-shaped content until a human
opens and saves each chapter, which for most books never happens.

Bug #787 shipped because plugin-learnset's tests used TipTap-JSON fixtures
exclusively. A bare `json.loads(chapter.content)` crashed with "Expecting
value: line 1 column 1 (char 0)" for every imported book, and the suite
stayed green throughout because it never exercised the shape 100% of real
data actually has.

A follow-up audit (workflow, #806) swept every plugin that reads chapter
content and found the SAME class of gap in four more places, none of which
crash - they silently corrupt output, which is worse because nobody notices
until a user compares two exports of the same book and finds one of them
short a chapter:

- **plugin-kdp**: the print-PDF renderer (`manuscript_pdf._chapters_to_html`)
  branches on `isinstance(content, dict)` and emits an empty section
  otherwise. The EPUB (routed through the export plugin's proper converter)
  and the print PDF of the SAME imported book disagree - one has the chapter
  text, the other doesn't.
- **plugin-audiobook** (and **plugin-ms-tools**, which imports the same
  function): `extract_plain_text` does `json.loads(content)` and on
  `JSONDecodeError` returns the **raw string unchanged**. TTS reads HTML tags
  aloud; the style checker's word/sentence counts include markup.
- **plugin-translation**: `extract_plain_text_from_tiptap` /
  `rebuild_tiptap_with_translation` both assume JSON, so an HTML chapter's
  translation is lost or malformed on rebuild.
- **plugin-story-bible**: `autodetect._tiptap_to_text` returns empty text for
  HTML content, so entity auto-detection silently produces zero proposals for
  every imported book - a false negative that looks like "no entities found",
  not a bug report.

### Rule

Any plugin test suite exercising a function that reads `Chapter.content` (or
a chapter dict's `"content"` key, however it arrived - an ORM row, a router
payload, a service argument) MUST include, at minimum:

1. An **HTML-content fixture** - the shape every imported, never-opened
   chapter actually has.
2. A **plain-text fixture** - legacy rows and hand-written test data.
3. An **empty-or-whitespace fixture** - `""` and `"   "` are NOT equivalent
   inputs to a naive `if not content` guard combined with `json.loads`; see
   the #787 PR, where the whitespace case was the one that survived an
   incomplete fix.

TipTap-JSON fixtures remain correct and necessary - they are what the editor
actually writes after a first save - but they must never be the ONLY shape a
suite exercises. The canonical converter for all four shapes already exists:
`bibliogon_export.scaffolder.content_to_markdown` (promoted from a private
helper in the #787 fix). A plugin reading chapter content should prefer
calling it over reimplementing a JSON-only parse, per Library-First; when a
plugin genuinely needs its own extraction (plain-text-only, no Markdown), it
still owes itself the same four-shape test coverage.

### Detection recipe

```bash
grep -rln "\.content\b" plugins/*/bibliogon_*/*.py \
  | xargs grep -l "json.loads\|json\.load(" \
  | grep -v /tests/
```

For each hit, check whether its plugin's test suite (`tests/test_*.py`)
constructs a Chapter/chapter-dict fixture whose `content` is an HTML string,
not just a `json.dumps({...})` doc. A suite with zero HTML fixtures across
every content-reading test is the #787 shape recurring.

### Pairs with

- "End-to-end behavior tests are not 'kwarg passes through' tests" - same
  family: the test asserts the shape of the INPUT space is covered, not just
  that the code runs once with a convenient input.
- "Coverage Illusion: passing tests != working feature" - a green suite that
  never constructs the real-world input shape proves nothing about the
  real-world behavior.
- Library-First (`.claude/rules/library-first.md`) - the fix for four of the
  five gaps was "call the existing converter", not "write a fourth parser".
