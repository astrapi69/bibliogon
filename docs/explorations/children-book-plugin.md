# Children's Book Plugin Exploration

Status: Architecture decided. Implementation deferred.
Last updated: 2026-04-20
Revived when: user demand justifies the investment (see "Triggers for reconsidering").
Source prompt: [prompt-children-book-plugin-exploration.md](prompt-children-book-plugin-exploration.md)

---

## Context

Bibliogon's current chapter-based model fits prose well, but a KDP
picture book is a different beast: each spread is a designed page
with one image and (optionally) short text in a specific position.
The author thinks in pages, not in flowing prose, and the export
must match KDP's print and Kindle Fixed-Layout requirements.

The user (Aster, German KDP self-publisher) has prior experience
shipping picture books with a JS/TS toolchain and explicitly
chose Variant B in pre-session: page-based editor with multiple
layouts, JS/TS rendering, NOT Pandoc.

The two layouts driving the MVP, taken from the user's own
shipped books:

1. **Layout A (full-bleed + speech bubble):** image fills the
   page, a speech-bubble graphic with text overlays it.
2. **Layout B (image top, text bottom):** classic picture-book
   split, image on top, text below.

---

## Pre-audit: current state of the moving parts

The original prompt was written against v0.16.0 with the kinderbuch
plugin described as a "stub". Reality at v0.19.0 differs - this
section freezes what actually exists so later sessions don't
re-derive it.

### plugin-kinderbuch (v1.0.0)

Already shipped, NOT a stub. Concrete state:

- [bibliogon_kinderbuch/plugin.py](../../plugins/bibliogon-plugin-kinderbuch/bibliogon_kinderbuch/plugin.py): `KinderbuchPlugin(BasePlugin)`, depends_on `["export"]`, license_tier `"core"`. `get_frontend_manifest()` returns `editor_extensions: ["kinderbuch-page-layout"]` plus templates and settings.
- [bibliogon_kinderbuch/page_layout.py](../../plugins/bibliogon-plugin-kinderbuch/bibliogon_kinderbuch/page_layout.py): `PageLayout` class with `to_html()` and `to_markdown()`. Pure in-memory rendering, no persistence.
- [bibliogon_kinderbuch/routes.py](../../plugins/bibliogon-plugin-kinderbuch/bibliogon_kinderbuch/routes.py): `GET /api/kinderbuch/templates`, `POST /api/kinderbuch/preview`. Hardcoded template list (4 entries).
- [bibliogon_kinderbuch/templates/kinderbuch.css](../../plugins/bibliogon-plugin-kinderbuch/bibliogon_kinderbuch/templates/kinderbuch.css): page-break-after, layout-specific flex/positioning, "Comic Sans" body font.
- 4 layouts wired: `image-top-text-bottom`, `image-left-text-right`, `image-full-text-overlay`, `text-only`.

What is **missing** for the MVP described in the prompt:

- **Speech-bubble layout** (Layout A) - no equivalent in current code; the existing `image-full-text-overlay` overlays a flat rounded box, not a bubble with tail.
- **Page entity in the DB** - layouts only operate on in-memory dicts.
- **Editor UI** - the manifest declares an editor extension that does not exist in the frontend yet.
- **Print-quality rendering pipeline** - HTML preview only; no PDF, no EPUB3 fixed-layout.
- **KDP trim/bleed CSS** - existing CSS uses `100vh` and viewport-relative units, which do not give the print sizes KDP needs.

### Asset / image management

[backend/app/routers/assets.py](../../backend/app/routers/assets.py) covers everything we need:

- `POST /api/books/{book_id}/assets` (multipart upload, asset_type in `cover|figure|diagram|table`) -> file in `uploads/{book_id}/{asset_type}/`, row in `assets` table.
- `GET /api/books/{book_id}/assets/{asset_id}/file` and `/file/{filename}` for serving.
- `DELETE` for removal, with on-disk cleanup.

No new asset infrastructure needed. Children's book pages reference existing assets by id. Acceptable to introduce a new `asset_type` value (e.g. `"page_image"`) only if the existing `figure` doesn't fit; default to `figure` for v1.

### Export pipeline entry points

[plugins/bibliogon-plugin-export/bibliogon_export/pandoc_runner.py:49](../../plugins/bibliogon-plugin-export/bibliogon_export/pandoc_runner.py#L49) - `run_pandoc(project_dir, fmt, config, ...)` is the single throat through which ALL exports currently go. It calls `manuscripta.export.book.run_export(...)` after scaffolding.

There is no per-book branching today: every book exports through the same Pandoc/manuscripta path. Adding a children's-book pipeline requires either:

1. A `book_type` field on `Book` (currently absent - see next section) plus a branch at the routes layer that picks the renderer.
2. A plugin hook spec like `should_handle_export(book) -> bool` that lets `plugin-kinderbuch` claim the export when the book qualifies.

Recommendation: option 1 is simpler and matches the existing pattern (see `tts_engine` on Book, audiobook plugin reading from book row). Option 2 is more flexible but adds a hook surface that no other plugin needs today.

### Book model

[backend/app/models/__init__.py:53](../../backend/app/models/__init__.py#L53) - `Book` has 30+ columns including all KDP/audiobook/ms-tools per-book overrides. **No `book_type` field exists.** Adding one is a new Alembic migration.

### Headless browser availability

`backend/pyproject.toml` and `frontend/package.json` were greped: no Puppeteer, no Playwright, no Chromium, no WeasyPrint, no pdfkit. The backend has Pandoc as an external binary (via manuscripta) but no JS-capable PDF renderer.

This is the single biggest dependency decision in the exploration. See "Rendering pipeline" below.

---

## Architecture proposal

### Data model

A new `Page` entity, separate from `Chapter`:

```python
class Page(Base):
    __tablename__ = "pages"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    book_id: Mapped[str] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-indexed
    layout_type: Mapped[str] = mapped_column(String(50), nullable=False)
    image_asset_id: Mapped[str | None] = mapped_column(
        ForeignKey("assets.id", ondelete="SET NULL"), nullable=True
    )
    text_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    text_position: Mapped[str | None] = mapped_column(String(50), nullable=True)  # for layout A
    created_at: Mapped[datetime] = ...
    updated_at: Mapped[datetime] = ...
```

`text_content` is plain text, not TipTap JSON. Picture-book text is short (one to three sentences per page); the cost of a TipTap roundtrip (JSON serialization, schema migrations, conversion at export) is not justified by the value. Bold/italic can be added later via Markdown-style markers if a user asks.

`text_position` for layout A is one of `top-left | top-right | bottom-left | bottom-right | center`. Frontend snaps the speech-bubble graphic to one of those anchor points; storing as enum string keeps it serializable and avoids floating-point pixel coordinates that drift across viewport sizes.

A picture-book is **all pages, no chapters**. Decision: a picture-book book has zero `Chapter` rows and N `Page` rows. The book-type discriminator lives on `Book.book_type`:

```python
book_type: Mapped[str] = mapped_column(String(30), default="prose")  # "prose" | "children_book"
```

Default `"prose"` is backward-compatible: every existing book stays prose without migration data fixes. A picture-book is created via "New Book -> Children's Book" which sets `book_type = "children_book"`. Conversion between types is **not supported** in v1 (no chapter <-> page migration).

### Layout system

Layouts are identified by string keys, validated against an enum maintained in `plugin-kinderbuch`:

```python
class LayoutType(str, Enum):
    SPEECH_BUBBLE = "speech_bubble"          # Layout A: full-bleed + bubble
    IMAGE_TOP_TEXT_BOTTOM = "image_top_text_bottom"  # Layout B
    # Existing layouts kept for back-compat with v1.0.0 preview API:
    IMAGE_LEFT_TEXT_RIGHT = "image_left_text_right"
    IMAGE_FULL_TEXT_OVERLAY = "image_full_text_overlay"
    TEXT_ONLY = "text_only"
```

The existing 4 layouts stay reachable through `GET /api/kinderbuch/templates` (no backward-compat break for any existing preview consumer), but the **MVP editor only exposes Layout A and Layout B**. The other three are demoted to "advanced" picks behind a "More layouts" toggle.

Adding a layout is a 4-step pattern:

1. Add the enum value.
2. Add a row to the templates list (label + description per language).
3. Add a CSS rule keyed on `[data-layout="<value>"]`.
4. Add a renderer fragment in the page template.

No code path outside the plugin should import the enum; the frontend reads `/api/kinderbuch/templates`. This keeps the layout catalog plugin-local.

### Rendering pipeline

This is the dependency decision the exploration must close.

**Constraints:**

- KDP picture-book PDF: 8.75 x 8.75in (8.5 x 8.5 + 0.125in bleed all sides), 300 DPI minimum, embedded fonts, RGB acceptable.
- KDP Kindle Fixed-Layout EPUB3: per-page XHTML with explicit viewport, `rendition:layout-pre-paginated`.
- The existing tech stack does not include a JS-capable PDF renderer.

**Options for the PDF renderer:**

| Option | Pros | Cons |
|---|---|---|
| **Playwright Python (headless Chromium)** | Real browser, full CSS support including modern features (CSS Grid, custom fonts, `@page`), explicitly supports PDF. Same Python toolchain. | ~300MB Chromium download per OS. New install step. |
| **WeasyPrint** | Pure Python, no browser. Already understands `@page`, bleed, marks. Small dep. | No JS execution (irrelevant for our static templates). Limited modern CSS (no Grid in older versions). Speech-bubble SVG positioning has been a documented pain point. |
| **Puppeteer (Node subprocess)** | The user already has experience with Puppeteer for picture books. | Adds Node.js as a backend runtime dependency, which Bibliogon currently does not require on the server side. Cross-process call overhead. |
| **Pandoc + LaTeX** (current path for prose) | Already installed. | LaTeX absolute positioning for speech bubbles is a known nightmare. Defeats the whole point of leaving Pandoc for picture books. |

**Recommendation: Playwright Python.** Rationale:

- Backend stays pure Python; no Node.js runtime required.
- Real Chromium means the same HTML/CSS the editor previews IS what the PDF renders. No "preview vs export" divergence class of bugs.
- Speech-bubble positioning is trivial in CSS; LaTeX/WeasyPrint workarounds are not.
- Playwright supports `page.pdf()` with explicit `width`/`height`/`margin`, which maps cleanly to KDP trim+bleed.
- Install footprint is one-time `playwright install chromium` (~280MB). For a desktop-style authoring tool that already bundles Pandoc, this is acceptable.

Risk: install size and the additional system dep make headless setup harder for self-hosters. Mitigation: detect Chromium presence in the kinderbuch plugin's `activate()`, surface a clear "install Chromium for PDF export" message in the plugin settings UI when missing, fall back to "preview only" mode rather than crashing.

**Pipeline shape:**

```
Page rows (DB)
  -> render_pages_to_html(pages, book_meta) -> single HTML doc with one .kb-page per Page
  -> Playwright launch(chromium).new_page().set_content(html).pdf(...)
  -> uploads/{book_id}/exports/{title}-children.pdf
```

CSS pseudo:

```css
@page {
  size: 8.75in 8.75in;
  margin: 0;
  marks: crop;
}
.kb-page {
  width: 8.75in;
  height: 8.75in;
  page-break-after: always;
  position: relative;
}
.kb-page[data-layout="speech_bubble"] .kb-image {
  position: absolute; inset: 0;
  background-size: cover;
}
.kb-page[data-layout="speech_bubble"] .kb-bubble {
  position: absolute;
  width: 40%;
  /* anchored via text-position attribute */
}
```

**EPUB3 Fixed-Layout** is a separate generator using the same `render_pages_to_html` per page (each page becomes its own XHTML file) plus an OPF + container.xml with `rendition:layout-pre-paginated` and `rendition:spread-none`. Cover image stays a separate XHTML page. Bibliogon emits the entire EPUB as a ZIP without going through Pandoc.

Reference: KDP's [Kindle Comic Creator format spec](https://kdp.amazon.com/) is the closest published spec; we target the picture-book subset.

### Plugin architecture

`plugin-kinderbuch` keeps `depends_on = ["export"]` (it imports the scaffold/zip helpers from plugin-export for the EPUB packaging step).

New responsibilities the plugin claims:

1. **Routes** (extend `routes.py`):
   - `GET /api/books/{book_id}/pages` - list pages
   - `POST /api/books/{book_id}/pages` - create page
   - `PATCH /api/books/{book_id}/pages/{page_id}` - update layout/text/image/position
   - `DELETE /api/books/{book_id}/pages/{page_id}`
   - `POST /api/books/{book_id}/pages/reorder` - bulk position update
   - `POST /api/books/{book_id}/export/children-pdf` - async PDF render
   - `POST /api/books/{book_id}/export/children-epub` - async EPUB render
2. **Hookspecs**: none new in `app/hookspecs.py`. The plugin uses `book_type` discrimination at the route layer.
3. **Frontend manifest**: declare `page_editor` slot; frontend mounts the page-based editor when `book.book_type == "children_book"`.
4. **Asset reuse**: page images use the existing `assets` table with `asset_type = "figure"`. No schema change.

The default chapter-based BookEditor stays untouched. Frontend route `/book/:id` switches the inner editor based on `book.book_type`.

### Export-trigger integration

`book.book_type == "children_book"` short-circuits the existing export dialog: instead of "EPUB / PDF / DOCX / Markdown" via Pandoc, the dialog shows "PDF (KDP Print) / EPUB3 (Kindle Fixed-Layout)" backed by the kinderbuch plugin renderers. This keeps the user's mental model ("Export" is one button) intact.

The existing `manuscripta` path is bypassed entirely for children's books. No mixed pipelines, no per-chapter format-switching - it's a clean either/or per book_type.

---

## KDP requirements summary (frozen)

| Spec | Value | Source |
|---|---|---|
| Trim size (MVP) | 8.5 x 8.5 in (Paperback) | KDP Paperback Trim Sizes |
| Bleed | 0.125 in all sides | KDP Print Manuscript Templates |
| PDF page size with bleed | 8.75 x 8.75 in | trim + 2x bleed |
| Image DPI | 300 min, 600 max | KDP Image Specifications |
| Image pixels for 8.5in | ~2550 x 2550 px @ 300dpi | derived |
| Image color space | RGB (KDP converts to CMYK) | KDP Cover Calculator FAQ |
| Image format | PNG or TIFF preferred | KDP Image Guidelines |
| Page count | 24 minimum, must be even | KDP Picture Book Requirements |
| Embedded fonts in PDF | Required | KDP Print Submission |
| AI-generated illustrations | Must be disclosed in metadata | KDP Content Guidelines (2023+) |
| EPUB type for Kindle picture book | EPUB3 Fixed-Layout, `rendition:layout-pre-paginated` | EPUB3 Fixed-Layout spec, Amazon Kindle Publishing Guidelines |

These numbers live in [plugin-kinderbuch's config YAML](../../backend/config/plugins/kinderbuch.yaml) once implemented (single source of truth) and are referenced from the docs and the export validator. The exploration freezes them here so later sessions don't re-derive.

The AI-disclosure flag already exists on Book (`Book.ai_assisted` at [models/__init__.py:87](../../backend/app/models/__init__.py#L87)) - the kinderbuch export reads it and surfaces the KDP disclosure language in the export-readiness check rather than introducing a new flag.

---

## Resolved decisions

### Headless browser: Playwright Python

Playwright Python is the PDF renderer. Rationale:
- Backend stays pure Python, no Node.js runtime on the server side.
- Real Chromium means editor preview and export PDF share the same
  rendering engine. Eliminates "preview vs export divergence" bug class.
- Speech-bubble positioning via absolute CSS is trivial in Chromium.
  LaTeX and WeasyPrint both have documented pain points for this
  exact use case.
- `page.pdf(width, height, margin, printBackground)` maps cleanly
  to KDP trim + bleed.

Accepted costs:
- ~280MB one-time Chromium install via `playwright install chromium`.
- Ongoing maintenance: Chromium version bumps track Playwright
  releases. CI must install Chromium for export smoke tests.
- Docker image size increase when Chromium is bundled for
  self-hosters.

Mitigations:
- Plugin `activate()` detects Chromium presence, surfaces "install
  Chromium for PDF export" message in plugin settings when missing.
- Plugin falls back to preview-only mode when Chromium is absent
  rather than crashing.
- Docker image variant with Chromium pre-installed ships as
  `bibliogon:full`; the default image stays lean.

WeasyPrint was rejected: no JS execution is fine, but speech-bubble
SVG positioning in modern CSS (Grid, flex, absolute inset) has
been a documented source of rendering inconsistencies. Not
MVP-viable for Layout A.

Pandoc + LaTeX was rejected: LaTeX absolute-positioning workflows
for floating bubbles over full-bleed images defeat the purpose of
leaving the Pandoc pipeline for picture books in the first place.

### Convert-between-types: never supported

A picture-book and a prose book are different authorial artifacts,
not different representations of the same content. Converting
Chapter-based prose to Page-based pages requires editorial
decisions (which paragraph goes on which page, how illustration
slots map to text chunks) that no automation can make correctly.

Accepted consequence: a book's `book_type` is immutable after
creation. The frontend offers no conversion UI. Users who want to
migrate content manually can export the source book to Markdown,
create a new children's book, and populate pages by hand.

This is a `book_type = LOCKED_AFTER_CREATION` property, documented
in the Page-creation flow.

### Speech-bubble graphic: bundled SVG asset set

The plugin ships a set of 5 SVG speech-bubble variants, one per
anchor point:
- `bubble-top-left.svg` (tail pointing to bottom-right)
- `bubble-top-right.svg` (tail pointing to bottom-left)
- `bubble-bottom-left.svg` (tail pointing to top-right)
- `bubble-bottom-right.svg` (tail pointing to top-left)
- `bubble-center.svg` (no tail, neutral shape)

All SVGs use `currentColor` for fill and a configurable stroke
via CSS custom property `--kb-bubble-stroke`. Theme colors apply
automatically without asset duplication.

User-uploaded bubble graphics are out of scope for MVP. A custom
bubble library is a post-MVP enhancement if user feedback asks
for it.

Assets live in `plugins/bibliogon-plugin-kinderbuch/bibliogon_kinderbuch/assets/bubbles/`.

### Cover: Page 1 is the cover, no separate Cover entity

The first `Page` row (position = 1) of a children's book is the
cover page. No separate Cover entity, no separate cover upload
flow in the page editor.

Rationale:
- Simpler data model: one entity type covers both content pages
  and the cover.
- KDP print export splits cover and interior at the pipeline end
  (cover file = rendered page 1 as single-page PDF; interior =
  pages 2..N as multi-page PDF with correct page count).
- Kindle Fixed-Layout EPUB treats the cover as the first XHTML
  document in the spine with `properties="cover-image"` on the
  manifest entry.

The page editor shows page 1 visually distinct (badge "Cover")
to signal its role. Validation: a children's book must have at
least 1 page (the cover) to be exportable.

### Page model: single page only in v1

Picture books are often conceptualized as two-page spreads
(left text page + right image page). The v1 data model stores
single pages only; spread rendering is a future layout variant,
not a model change.

Rationale:
- Single-page model is the simpler baseline and covers 100% of
  the MVP layouts (A and B).
- Spreads can later be introduced as a new `LayoutType.SPREAD`
  value that references two assets and two text blocks within
  a single Page row. Data model unchanged.
- KDP's Kindle Fixed-Layout EPUB supports `rendition:spread-landscape`
  but the default `rendition:spread-none` is correct for the
  MVP layouts.

Consequence: the editor canvas shows one page at a time. A
"spread preview" toggle showing two pages side-by-side is a
polish item for Session 7 if time allows, otherwise post-MVP.

### Page-count validation: warn, do not block

KDP requires a minimum of 24 pages (must be even) for picture-
book print submission. The export pipeline implements this as a
prominent warning in the Export-Readiness UI, not as a hard block.

Rationale:
- Authors may want to export a PDF with fewer pages for external
  processing (client review, draft distribution, cover-only test
  print). Blocking the export for a KDP-specific rule punishes
  legitimate workflows.
- The warning states the KDP rule explicitly, shows the current
  page count vs the required 24, and offers a one-click link to
  KDP's picture-book specification.
- The author can proceed past the warning with a confirmation
  dialog that requires explicit acknowledgment ("I understand
  this PDF does not meet KDP picture-book requirements").

This matches the existing pattern in other KDP checks in Bibliogon
(see plugin-kdp validation behavior). Authors keep authority,
the tool provides visibility.

Even-page-count rule: enforced automatically during export by
appending a blank page if the final count is odd. The author
sees a notice "Added blank page to meet KDP even-count rule."

---

## Open questions (deferred to implementing session)

These do not block Session 2; the implementing session decides them.

1. **Page numbering display:** off by default for picture books (industry norm). Add an opt-in book setting later if a user asks.
2. **Image upload during page editing:** does the editor reuse the existing `/api/books/{book_id}/assets` upload as-is, or does the page editor get an inline drag-and-drop that uploads + assigns in one step? Recommendation: inline drag-and-drop calling the existing endpoint under the hood. No new backend API.
3. **AI illustration generation in-editor:** explicitly out of scope for the picture-book MVP. Bibliogon already has AI infra elsewhere; integrating it is a separate exploration.

---

## Multi-session roadmap

The pre-session prompt proposed a 7-session breakdown. Adjusted to reflect actual current state (plugin already has 4 layouts + preview; nothing else exists):

### Session 1 (this document)
Exploration document. No code.

### Session 2: Data model + book_type discriminator
- Alembic migration: `Book.book_type` (default `"prose"`), new `pages` table.
- Pydantic schemas for Page CRUD.
- Plugin routes for `/api/books/{id}/pages` (CRUD + reorder).
- Backend tests covering page CRUD and book_type validation.
- **Out of scope:** rendering, frontend.

### Session 3: Page-based editor (frontend)
- Detect `book.book_type === "children_book"` in [BookEditor](../../frontend/src/pages/BookEditor.tsx); mount `<PageEditor>` instead of the chapter editor.
- Three-pane layout: page thumbnails (left) | canvas (center) | properties (right).
- Layout picker exposes Layout A and Layout B by default; "More layouts" toggle reveals the existing 4.
- Drag-to-reorder pages via @dnd-kit (already installed).
- Inline image upload on the canvas (calls `/api/books/{id}/assets`).
- i18n in all 8 languages.
- Smoke test: create children's book, add 2 pages, reorder, change layout.

### Session 4: Speech-bubble layout (Layout A) + PDF export
- Bundled SVG bubble asset, anchor-point CSS.
- `render_pages_to_html` returns the print-ready document (single HTML with N pages).
- `playwright install chromium` integration; activate-time check + clear "install required" message in plugin settings if missing.
- Async PDF export via the existing job/SSE infrastructure (see audiobook pattern).
- Smoke test: export 4-page book to PDF, verify file size > 0 and page count.

### Session 5: Image-top-text-bottom layout (Layout B) + render polish
- Layout B implementation in CSS + HTML template.
- Bleed/safe-zone overlay toggle in the editor canvas (visual aid; not in export).
- Page-count validation (min 24 even, KDP rule) at export time with clear error message.
- AI-disclosure badge in the editor when `book.ai_assisted` is true; warning if exporting without it set.

### Session 6: Fixed-Layout EPUB3 export
- EPUB3 generator: per-page XHTML, OPF with `rendition:layout-pre-paginated`, container.xml.
- ZIP bundling without Pandoc.
- epubcheck validation hook (already used by [pandoc_runner._run_epubcheck](../../plugins/bibliogon-plugin-export/bibliogon_export/pandoc_runner.py)).
- Smoke test: export same 4-page book to EPUB, run epubcheck, assert pass.

### Session 7: Polish + onboarding
- "New Children's Book" entry in book-creation modal with a 4-page starter (cover + 3 sample pages).
- In-app help page (`docs/help/{lang}/children-books.md`) per the help-system pattern in [lessons-learned.md](../../.claude/rules/lessons-learned.md).
- Builtin BookTemplate for children's books (already partially present per ROADMAP TM-02).
- Coverage audit follow-up.

Each session ends green (`make test`) and produces a single conventional-commit chain. No session implements ahead. Validation per session: smoke test + manual export of one real-shape document.

---

## Triggers for reconsidering

### User-demand triggers (highest priority)

- Three or more explicit user requests for picture-book support.
- Commercial commitment (commission, licensing pre-order).
- Aster's own new picture-book project starts and current
  toolchain is the bottleneck.
- Bibliogon passes 100 active users; picture-book becomes a
  plausible premium-tier expansion.

### Technical triggers

- KDP changes the picture-book trim size requirements significantly.
- Playwright-Python becomes unmaintained or licensing changes.
- A user actually asks for "convert prose to children's book" (currently nobody has).
- Bibliogon adopts another headless-browser dependency for a different feature; the picture-book pipeline can ride that decision.
- Demand for additional layouts grows beyond 6-8 total; that's the point at which the layout catalog should move from string-enum to plugin-pluggable subspecs.

---

## Deferral

Implementation of Sessions 2 through 7 is deferred. The plugin
plugin-kinderbuch stays at its current v1.0.0 (4 layouts, HTML
preview only) until user demand justifies the investment.

### Reasoning

- Bibliogon's core prose + audiobook + KDP + translation workflows
  are complete and stable at v0.19.0. The core user journey works.
- Current user base is small and no feedback has explicitly
  requested picture-book support. Building a 7-session feature
  without demand signal is speculative.
- Picture-book authoring is a distinct product surface (different
  editor, different export pipeline, different KDP segment) with
  limited synergies to the prose editor. Effectively a second
  product inside the product.
- Opportunity cost: 7 sessions on kinderbuch is 7 sessions not
  spent on polish, outreach, AI assistance (A-01..A-03), or
  KDP workflow improvements that all existing users benefit from.
- The exploration document itself is the value delivered from
  this line of work for now. When demand arrives, the architecture
  decisions are frozen and Session 2 can start immediately.

### Revival criteria

Revive when any of these are true:

- Three or more users request picture-book support in feedback
  channels (GitHub issues, direct messages, Discord if created).
- Aster personally starts authoring a new picture book and the
  current JS/TS toolchain friction becomes a blocker for that
  project.
- A pre-committed commercial interest (licensing, commission) makes
  the plugin worth building on a deadline.
- Bibliogon reaches 100+ active users, at which point the picture-
  book segment becomes a plausible premium-tier expansion with
  real economic justification.

Absence of these signals means the deferral stands.

### Go/No-Go checkpoint after Session 3

If implementation is revived, the go/no-go checkpoint is explicit
and mandatory: after Session 3 (page-based editor frontend), before
committing to Sessions 4-7 (export pipelines), Aster must author
a functional 4-page test book in the editor. If that authoring
experience feels awkward, incomplete, or does not meaningfully
improve on the existing JS/TS toolchain, implementation stops and
the remaining sessions are re-evaluated.

This checkpoint exists to protect against sunk-cost momentum.
Session 4-7 is 60% of total effort and all of the KDP-specific
complexity. A weak Session 3 outcome is a strong signal to stop.

---

## Cross-references

- [docs/explorations/desktop-packaging.md](desktop-packaging.md) - desktop distribution affects whether bundling Chromium is acceptable.
- [.claude/rules/architecture.md](../../.claude/rules/architecture.md) - plugin architecture, asset infra, manifest-driven UI.
- [.claude/rules/lessons-learned.md](../../.claude/rules/lessons-learned.md) - Pandoc raw-HTML pass-through (informs the "no Pandoc for picture books" decision), async-with-SSE pattern (reused for export jobs), plugin path-dep declaration trap.
- [plugins/bibliogon-plugin-export/bibliogon_export/pandoc_runner.py](../../plugins/bibliogon-plugin-export/bibliogon_export/pandoc_runner.py) - the path picture-book exports deliberately bypass.
- [backend/app/routers/assets.py](../../backend/app/routers/assets.py) - asset infra reused unchanged.
