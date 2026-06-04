# Changelog - Bibliogon

Completed phases and their content. Current state in CLAUDE.md, open items in ROADMAP.md.

## [Unreleased]

## [0.46.0] - 2026-06-04

The Dialog → Pages + Tailwind/shadcn-foundation release. Eight of the
app's large, deep-linkable dialogs became real full-page routes rendered
through a shared `PageLayout` (app-chrome header + centered content +
working browser Back), and the editor's active chapter moved into the URL
so chapter selections are deep-linkable. The migration sits on a new
Tailwind v4 + shadcn/ui foundation (token-mapped, so the existing theme
system stays the single source of truth for color). No schema migrations
- existing data, backups (`.bgb`) and projects (`.bgp`) are unaffected.

### Added
- **Dialog → Pages migration.** Eight dialogs are now deep-linkable
  routes, each with a working Back button and a mobile-friendly layout
  (no overlay, no size-jump):
  - `/books/new?type=<book_type>` (was CreateBookModal)
  - `/articles/new?type=<content_type>` (was the one-click split-button create)
  - `/books/:bookId/export` (was ExportDialog)
  - `/writing-history` (was WritingHistoryModal; global across all books)
  - `/books/:bookId/chapters/:chapterId/snapshots` (was ChapterVersionsModal)
  - `/books/:bookId/git-backup` + `/books/:bookId/git-sync` (were the Git dialogs)
  - `/help/shortcuts` (was the Ctrl+/ shortcut cheatsheet overlay)
- **Deep-linkable chapter selection.** The book editor's active chapter
  is now carried in the URL (`?chapter=<id>`), so a chapter can be linked
  directly and a snapshot restore returns to the editor with the right
  chapter selected.
- **Shared `PageLayout` with the app-chrome header** - the migrated pages
  carry the same brand + theme-toggle header as the rest of the app, so a
  deep-linked page still reads as "inside Bibliogon".
- **Tailwind v4 + shadcn/ui foundation** - a token-mapped `@theme` bridge
  (Preflight omitted) so Tailwind color utilities resolve to the existing
  `var(--*)` theme tokens, plus a shadcn Dialog primitive now backing
  `AppDialog` and the confirmation dialogs.

### Changed
- **`recharts` is lazy-loaded** with the writing-history page, moving
  ~330 kB out of the eager dashboard bundle.
- Five smaller dialogs were migrated onto the shadcn Dialog primitive
  (Phase B) - these stay dialogs (small, context-bound, transient state).

### Docs
- `docs/architecture/dialog-to-pages-routes.md` - the route map and the
  per-dialog classification (which surfaces became pages, and which stay
  dialogs by design: confirmations, transient-state wizards,
  auto-triggered onboarding nudges, and detail modals without a
  single-fetch endpoint).

## [0.45.0] - 2026-06-02

The QA-hardening + native-i18n release. An adversarial security +
data-integrity pass closed one CRITICAL, one HIGH, five MEDIUM and
eight LOW findings from the v0.44.0 QA report; an accessibility sweep
gave every icon-only control an accessible name; and the six
auto-translated locale catalogs received a full native-quality
translation pass. No user-facing feature changes and no schema
migrations - existing data, backups (`.bgb`) and projects (`.bgp`)
are unaffected. 23 commits since v0.44.0.

### Security
- **Upload filename path traversal (CWE-22) fixed** at all three upload
  sites (book assets, article assets, KDP cover validation). A new
  shared `app.paths.safe_upload_filename()` strips every directory
  component and rejects empty / `.` / `..`, so a crafted multipart
  `filename` can no longer write outside the upload root. The persisted
  `Asset.filename` / `ArticleAsset.filename` now store the sanitized
  basename. Regression-pinned.
- **Archive extraction hardened** - the last two raw `extractall` calls
  were routed through the existing `safe_extractall()` Zip-Slip guard,
  so every archive-extraction site in the codebase is now covered.
- **Danger Zone reset token is genuinely one-time** - the HMAC reset
  token is now consumed on verify via a nonce store, so a replayed
  token is rejected.

### Fixed
- **Backup `.bgb` completeness overhaul (data-loss-on-restore)** - the
  backup serializer is now introspection-driven (`serialize_row` /
  `restore_row`) and covers **all 23 content models** instead of a
  hand-maintained subset, closing a gap where restoring a backup could
  silently drop rows (comments, story-bible links, comic panels, etc.).
  New manifest **v3.0**, backward-compatible with v1.0 / v2.0 archives.
  Pinned by a full round-trip test (build a maximal object graph ->
  export -> wipe -> import -> field-level equality).
- **Comic cross-page panel move** now enforces the destination page's
  panel-capacity gate server-side (not just in the UI).
- **@-mention nodes degrade to plain text** when their linked Story Bible
  entity is deleted, instead of leaving a dangling reference.
- **Writing-goals daily progress can no longer go negative** - the
  per-day word-count delta is floored to `max(0, delta)`.
- **Comic bubble anchor** `x_pct` / `y_pct` are validated to `[0, 100]`
  server-side.
- **Continuity checker N+1 query** resolved via eager `joinedload`.
- **Story-Bible entity-page link** now enforces the page/chapter XOR
  invariant with a DB `CheckConstraint` (was application-level only).
- **Book / Article titles** capped at 500 characters with a control-char
  rejecting validator.
- **KDP routes** re-raise with `from e` (ruff B904), preserving the cause
  chain in error reports.

### Accessibility
- Every icon-only button across the Dashboard, BookCard, AudiobookPlayer
  and BookEditor now carries an `aria-label`; raw Radix `Dialog.Content`
  surfaces (16 sites) gained the required `Dialog.Description` /
  `aria-describedby`. The Dashboard now reports **zero axe-core
  critical/serious violations** on load.

### Changed
- **Native-quality i18n translation sweep** across the six
  auto-translated catalogs (es / fr / el / pt / tr / ja): every UI
  string still byte-identical to English (~920-1000 keys per catalog,
  accumulated across the v0.32-v0.44 feature work) was translated to
  native quality - Latin-American-neutral Spanish, Metropolitan French
  (with French typography), monotonic Modern Greek, European Portuguese
  (pt-PT), vowel-harmony-correct Turkish, and polite concise Japanese.
  Loanwords, format names, brand names and literal API field-names were
  kept verbatim; `{placeholder}` sets preserved per key. The stale
  `_meta` passthru-review markers were removed from all six catalogs.
  i18n parity is green (51/51) across all 8 catalogs.

## [0.44.0] - 2026-06-01

The Scrivener-parity + visual-planning release. Two coordinated
Scrivener-gap clusters (ergonomics + drafting) plus Bibliogon's
standout new visual feature — an interactive Story Bible relationship
graph. 43 commits since v0.43.0.

### Added
- **Editor context menu** — a right-click menu on every TipTap editor
  surface (chapter, picture-book page text, Story Bible description):
  cut / copy / paste / select-all; on a selection bold / italic /
  underline, heading (H1-H3) and list (bullet / numbered) submenus, and
  blockquote; insert @-mention + horizontal rule; search the selection
  in the Story Bible; take a chapter snapshot; a word-count readout.
  Keyboard-shortcut hints per item.
- **Composition mode** — distraction-free writing (Feather toolbar
  toggle / Ctrl+Shift+D / Esc). Hides app chrome via a root class,
  adds a paper backdrop, paragraph dimming, and typewriter scrolling.
- **Chapter status + labels** — a per-chapter workflow status plus a
  user-definable, colour-coded label set per book (create / rename /
  recolour / delete). Status + label chips on the Storyboard cards and
  the Outliner; new `chapter_labels` table + `Chapter.status` /
  `Chapter.label_id`.
- **Writing goals + streak** — a per-book word target + optional
  deadline with an auto-computed daily target, a per-chapter
  `target_words` (promoted from per-device storage to the DB), and a
  Dashboard daily-goal widget with a consecutive-day streak.
- **Chapter Outliner** — a sortable, inline-editable spreadsheet view
  of the chapters (`?view=outline`): title, status, label, word count,
  target, beat, and notes, with drag-reorder.
- **Chapter snapshots** — Scrivener-style named manual snapshots layered
  onto chapter version history. Take a named snapshot before a revision
  pass; manual snapshots are exempt from the auto-version retention; a
  line-diff view compares any snapshot against the current content;
  restore overwrites the current text (snapshotting it first as a
  safety net) and a manual snapshot can be deleted.
- **Writing history** — a Writing-History view opened from the daily-goal
  widget: summary stats (total / active days / average per active day /
  current + longest streak), a per-day words bar chart (recharts), a
  per-book breakdown that drills into per-chapter totals, and a CSV
  export. `WritingSession` is now tracked per book + chapter.
- **Story Bible relationship graph** — an interactive node-graph of the
  book's Story Bible (`?view=relationships`, @xyflow/react). One node
  per entity (shape + colour + icon by type), one edge per relationship
  (coloured / labelled by type). Drag from one node to another to
  create a relationship (type + note); click an edge to delete it; a
  node detail panel offers open-in-editor + show-appearances, and a
  double-click opens the entity. Node positions persist per book
  (`Book.graph_layout`), a Reset-layout button re-runs the auto-layout,
  and the graph exports to PNG (html-to-image).
- **Word/EPUB import help** — a documentation page for the existing
  Pandoc-based DOCX/EPUB import in the import wizard.

### Changed
- README / README-de lead with the Story Bible; full Story Bible help
  section (relationship graph, mentions, Arc View) + a Storyboard help
  rewrite; CLAUDE.md / CONTRIBUTING quality-gate notes.
- New `docs/audits/scrivener-competitive-analysis-2026-06.md` plus 10
  filed Scrivener-gap backlog items (P2-P4).

### Fixed
- **Alembic upgrade chain** — `alembic upgrade head` crashed on a clean
  database at the chapter-status-labels migration (a SQLite batch
  table-recreate forced by an inline FK column hit "Constraint must
  have a name"). Fixed so the column is added without a recreate; the
  whole suite stayed green because tests build the schema via
  `create_all`, but every incremental in-app upgrade would have
  crashed at startup. A new regression gate runs the real
  `alembic upgrade head` against a throwaway database.

### Dependencies
- Added `recharts` (MIT, charts — Writing History), `@xyflow/react` v12
  (MIT, node graph — Relationship Graph), and `html-to-image` (MIT, PNG
  export). All three report 0 high/critical advisories.

## [0.43.0] - 2026-06-01

The Story Bible integration depth release. Builds on v0.42.0's Story
Bible by carrying it across the rest of the authoring surface: the
Storyboard now works for prose books, entities can relate to one
another, and the prose/picture editors gain @-mention autocomplete +
an auto-detect pass that finds entity names in existing text. 10
commits since v0.42.0.

### Added
- **Prose Storyboard** — the chapter-card Storyboard view for prose
  (chapter-based) books, a counterpart to the picture/comic page
  Storyboard. A drag-reorderable grid of chapter cards, each with a
  word count and the same four inline-editable annotations (notes /
  story beat / mood colour / act group) as a page card. The Storyboard
  button is now available for every book type. The four annotation
  editors are extracted into a shared module and reused by both
  surfaces (no visual drift). New `notes` / `story_beat` / `mood_color`
  / `act_group` columns on Chapter.
- **Entity relationships** — Story Bible entities can declare typed
  relationships to one another (ally / rival / family / mentor /
  romantic / neutral) with an optional description, edited in a new
  "Relationships" section of the entity detail view. In **Arc View**,
  a "Show relationships" toggle draws colour-coded curves between two
  entities' lanes wherever they share a page. New `relationships` JSON
  field on StoryEntity + a resolve endpoint.
- **@-mention autocomplete** — typing `@` in the chapter editor or a
  picture-book page opens an autocomplete of the book's Story Bible
  entities (grouped by type); selecting one inserts a colour-coded
  inline mention badge. Clicking a badge opens that entity in the
  Story Bible sidebar. Built on `@tiptap/extension-mention` (pinned to
  2.27.2). The entity-list endpoint gains a `?search=` filter.
- **Auto-detect mentions** — a "detect mentions" action scans a book's
  chapter + page text for entity names and proposes links for any that
  aren't linked yet (conservative: exact, case-insensitive, word-
  boundary matches; short names skipped; already-linked pairs
  excluded). "Link automatically" creates them in one click.

### Changed
- i18n: new Storyboard, relationship, @-mention and auto-detect strings
  across all 8 catalogs (parity green).

Migrations: `chapters` storyboard columns; `story_entities.relationships`.
Backend pytest 2442 → 2468; Vitest 2549 → 2568; tsc + ruff +
verify-theme + verify-components + i18n parity all green. Deferred to
follow-ups: the component-consistency tail (badges / Toggle / raw-Radix
→ AppDialog migration — advisory, `make verify-components` green) and
the comprehensive help-doc + marketing-screenshot pass.

## [0.42.0] - 2026-05-30

The Story Bible release. A new **plugin-story-bible** gives every book
a per-book database of fiction-writing entities (character / setting /
plot point / item / lore), and a deep **Story Bible ↔ Storyboard
integration** turns it into Bibliogon's standout feature: while
planning a story visually, the author sees which entities appear on
which pages, links them by drag-and-drop, reviews character arcs on a
visual timeline, gets advisory continuity warnings, and exports the
whole bible to share with a co-author or illustrator. Plus a
content-type-neutrality pass (the article editor now spans 8 content
types, so user-facing "Artikel/Article" became "Text"), a
component-consistency + accessibility sweep, and two
safety/stability fixes (Zip Slip guard, app-wide error boundaries).
74 commits since v0.41.0. Backend pytest 2399 → 2442 (+43, 1 skipped);
Vitest 2487 → 2549 (+62); tsc + ruff + mypy + verify-theme (96 WCAG
contrast checks) + verify-docs-discipline + verify-plugin-locks +
pre-commit + launcher PyInstaller build smoke all green.

### Added

- **Story Bible plugin** (`STORY-BIBLE-PLUGIN-01`). New core plugin
  `plugin-story-bible`: a per-book database of fiction entities with
  an `entity_type` discriminator (character / setting / plot_point /
  item / lore), per-type metadata fields, and rich-text descriptions.
  Entity-type definitions are the SSoT in
  `backend/config/story-bible-entities.yaml`. Ships a colored
  `StoryBibleSidebar` (per-type icons + colors, inline create/delete),
  a `StoryEntityEditor` detail/edit view, and `/api/story-bible/...`
  CRUD. Availability-probed and gated behind plugin activation.
- **Story Bible ↔ Storyboard integration**
  (`STORY-BIBLE-STORYBOARD-INTEGRATION-01`):
  - **Entity ↔ page/chapter links** (`StoryEntityPageLink` model +
    migration) — "Character X appears on page Y"; picture/comic books
    link via page, prose books via chapter, with both query
    directions (an entity's appearances + a page's entities).
  - **Entity badges** on Storyboard cards (name + type icon, color
    coded, +N overflow, click opens the sidebar on that entity).
  - **Drag-to-link**: drag an entity from the sidebar onto a card to
    create the link (HTML5 drag-and-drop).
  - **Appearance tracker** in the entity detail view (every page/
    chapter the entity appears on, with remove).
  - **Entity filter** on the Storyboard (show only pages where ALL
    selected entities appear).
  - **Arc View** — an SVG swim-lane timeline of character arcs across
    the book's pages (dots colored by page mood, sized by role,
    continuity polylines, click-to-navigate).
  - **Continuity checker** — advisory warning badges (an entity
    disappears / is absent for a long gap / a page has no entities).
  - **Markdown export** of the Story Bible (entities by type +
    descriptions + appearances) for sharing.
- **Storyboard for comic books** — the Storyboard view (previously
  picture-book-only) now also opens from the comic-book editor.
- **Per-content-type default titles** — creating a content type from
  the Article-Dashboard split-button now produces a matching default
  title (Neuer Blogpost / Neues Tutorial / Neue Rezension / …) via a
  new `default_title_key` per type in the `content-types.yaml` SSoT.

### Changed

- **Content-type neutrality** — the `Article` entity now spans 8
  content types, so user-facing "Artikel/Article" used as a
  document-noun became the neutral "Text" across the editor surface
  (translate / delete / load / tooltips), and the content-type
  dropdown label became "Textart" / "Content type". Section/list
  naming, content-type value labels, and comment references kept.
- **Component-consistency + accessibility sweep** — buttons, selects,
  inputs, checkboxes, sliders, badges and cards unified onto global
  CSS classes + tokens (the CSS-first discipline); editor/toolbar/
  sidebar controls migrated off bespoke styling; WCAG hardening with
  `vitest-axe` assertions across editor surfaces and associated
  form-control labels.
- **Story Bible toggle** moved into the ChapterSidebar actions cluster
  (it was a free-floating right-edge tab).
- Within-range dependency refresh (ipython 9.13 → 9.14).

### Fixed

- KDP check-metadata accepts `keywords` as a list, fixing a Publishing
  Wizard 422.
- Story Bible toggle no longer overlaps the editor toolbar.

### Security

- **Zip Slip (CWE-22)** — all archive-extraction paths (`.bgb` backup
  import, backup compare, write-book-template + bgb project import) now
  validate every member path against the target directory before
  extracting. A crafted archive with `../` or absolute member paths can
  no longer write files outside the extraction sandbox.
- **App-wide React error boundaries** — a render-time crash in one
  surface (BookEditor / ArticleEditor / Settings / Dashboard /
  Storyboard) now shows a localized fallback with a Reload button
  instead of blanking the entire app.

## [0.41.0] - 2026-05-30

A UX/UI theme + accessibility hardening release, plus per-content-type
field visibility and a documentation refresh. 24 commits since
v0.40.0. The headline is a full audit of all **12 theme variants**
(6 palettes × light/dark) that corrected a long-standing "5 palettes /
10 variants" miscount (Warm Literary, the default, was never counted),
found and fixed a class of undefined-CSS-token bugs the existing
completeness hook was structurally blind to, and shipped a new
`make verify-theme` release gate. Backend pytest 2394 → 2399; Vitest
2477 → 2487; theme tokens + 96 WCAG contrast checks + hardcoded-hex
lint + verify-docs-discipline + verify-docs-completeness all green.

### Added

- **Per-content-type field visibility** (``ARTICLE-TYPES-FIELD-VISIBILITY-01``).
  The ArticleEditor sidebar now shows only the fields relevant to the
  article's content type instead of every field for every type. A new
  per-type ``core_fields`` list in the SSoT
  ``backend/config/content-types.yaml`` drives which optional fields
  (Tags / Excerpt / SEO / Canonical URL / Featured image) each type
  renders; identity fields (title, content, status, subtitle, author,
  language, topic) are always shown. ``null``/omitted = show all
  (backward-compatible); ``[]`` = none. A field-validator rejects
  unknown field keys. E.g. a newsletter shows none of the optional
  core fields (it has its own issue-number / send-date), a short
  story shows only Tags, canonical URL is blog-post-only.
- **`make verify-theme` release gate** (in `make release-test`). Three
  scripts: `audit_theme_tokens.py` (extended to flag bare
  `var(--token)` references to tokens defined in no palette — the
  blind spot below), `check_theme_contrast.py` (96 WCAG-2.1 contrast
  checks across all 12 variants, alpha-compositing translucent
  backgrounds), and `check_hardcoded_colors.py` (no stray hardcoded
  hex outside `var()` fallbacks / data allowlists).
- **Comic bubble + tail keyboard operation**. The bubble and tail-tip
  drag handles (`role="button"`) now respond to Enter/Space (select)
  and Arrow keys (reposition — the keyboard equivalent of dragging),
  with 6 Vitest regression pins. Closes the audit's highest-priority
  accessibility gap.
- **`verify_docs_completeness.py` release gate** — version-header /
  help-i18n-parity / image + cross-reference integrity check, wired
  into the release flow (it caught a broken help-image path during
  this release).
- **Developer theming guide** (`docs/development/theming.md`): the
  6-palette / 12-variant matrix + cascade, the semantic token
  vocabulary, how to add a palette, the three theme gates, and the
  intentional non-themed colors (comic convention, image-relative
  overlays, mood-preset data).

### Changed

- **Comic editor chrome is theme-aware** (panels, multi-panel grid,
  bubble tail-handle ring, picture-book speech-bubble layout). Comic
  bubble *defaults* deliberately stay comic-convention (white fill /
  black stroke, mirrored in the PDF walker) — only the editor chrome
  around them follows the app theme.
- **Storyboard mood-dot ring** strengthened (12% → 25% of `--text`)
  so preset mood colors stay distinguishable from the card in every
  variant; **collage text-region drag handle** made a visible grab
  affordance (kept image-relative by design).
- Documentation refreshed: README + README-de + CLAUDE.md corrected to
  6 palettes / 12 variants; the Articles content-types help page
  gained a comparison table, a field-visibility matrix, and a per-type
  detail section for all 8 types (DE + EN); 35 help screenshots
  regenerated to the current UI; settings screenshots wired into their
  help pages.
- Dependency sweep: within-range backend / frontend / launcher /
  e2e bumps; the Starlette v1 upstream blocker resolved.

### Fixed

- **6 undefined CSS tokens** used bare across the app (`--bg`,
  `--accent-bg`, `--accent-text`, `--error`, `--bg-surface`,
  `--accent-muted`, plus more found by the new gate — 18 in total)
  resolved to defined semantic tokens. These rendered nothing
  (falling to initial/inherited values) and were invisible to the
  old hex-fallback-only completeness hook. Most visible effects:
  Storyboard cards and the bulk-action-bar active state were not
  rendering their intended surfaces.
- **31 hardcoded status colors** (`#16a34a` green, `#ef4444`/`#dc2626`
  red, etc.) replaced with `var(--success / --danger / --accent /
  --warning)` so they flip correctly in dark mode.
- **Dark-mode contrast**: `--text-muted` brightened in every dark
  palette to clear WCAG AA on cards + soft surfaces; nord dark
  `--danger` lightened from 2.46:1 to a legible ~3.2:1; the
  EditableTitle published-work warning button switched from
  always-white text to `--text-inverse` (white-on-light-accent failed
  in all 6 dark variants).
- **Article-Dashboard header** no longer wraps to two lines at 900px+
  — the standalone Backup button was folded into the Import chevron
  (the C5 content-type split-button had pushed the header past the
  wrap threshold). Playwright regression pin added.

## [0.40.0] - 2026-05-29

A large authoring-depth release across the comic-book and
picture-book surfaces plus an articles content-model expansion.
~100 commits since v0.39.0 (210 files, +29390 / -5602). Five
coordinated streams: (1) **Content-Types SSoT** — the reserved
``Article.content_type`` column is repurposed as an 8-type
discriminator with per-type metadata. (2) **Publication-status
parity** — Book gains the Article status lifecycle behind a shared
enum. (3) **In-place title editing** across all four editors.
(4) **Comic-book depth** — a single-SVG-path bubble+tail overhaul
with 6 bubble types and pointer-drag, multi-panel grid layouts
with an overflow handler, and same-page reorder + cross-page move
for panels. (5) **Picture-book layout expansion** — Phases 1-3
adding split / multi-image / collage layouts with drag-positioned
regions and matching PDF walkers. Plus a Settings-Completeness
batch and a shared FullscreenButton. Backend pytest 2294 → 2394
(+100, 1 skipped); Vitest 2190 → 2477 (+287); i18n parity green;
tsc + ruff + mypy + verify-docs-discipline all green.

### Added

- **Comic panel arranging** (``COMIC-PANEL-CROSS-PAGE-MOVE-01``,
  2026-05-29). Two ways to organise a comic page's panels.
  **Same-page reorder**: each panel carries a drag handle
  (dnd-kit ``SortableContext`` over ``ComicPanelGrid``); dropping
  it onto another grid cell reorders the panels via a new bulk
  ``POST /api/books/{id}/comic-pages/{page_id}/panels/reorder``
  endpoint that mirrors the picture-book PagesReorder two-phase
  position update. The drag handle (not the panel body) carries
  the listeners, so in-panel bubble drag + panel-select click are
  unaffected. **Cross-page move**: a "Move to page" action menu on
  the selected panel lists the book's other pages with their
  capacity (``Seite N - count/max Panels``); full pages are
  disabled with a ``(voll)`` hint. Selecting a target reuses the
  already-shipped ``ComicPanelUpdate.page_id`` PATCH (append
  position) and re-normalises the source page's positions via the
  reorder endpoint, then toasts ``Panel auf Seite N verschoben``.
  Cross-page move is a menu rather than drag-to-thumbnail by
  design: a shared canvas+sidebar drag context would have forced a
  refactor of the PageThumbnails the picture-book editor also uses.
  i18n in all 8 catalogs.
- **In-place title editing** (Title Editing C1-C4, 2026-05-29).
  Click-the-pencil inline title editing on all four editor
  surfaces (Article, prose Book via the chapter sidebar,
  picture-book PageEditor, comic-book ComicBookEditor) via a new
  shared ``EditableTitle`` component. Published or archived works
  gate the edit behind a yellow warning banner (a title change
  must be carried over to the publishing platform manually) with
  an acknowledgment button; drafts edit directly. Detection is
  status-based on both surfaces (``status`` published / archived).
  i18n in all 8 catalogs (``ui.editor.edit_title_tooltip`` /
  ``published_warning_body`` / ``acknowledge_warning_button``).
- **Publication-status parity** (``PUBLICATION-STATUS-BOOK-PARITY-01``,
  2026-05-29). Article had ``status`` (draft / ready / published /
  archived) since AR-01 Phase 1; Book gains the same column at
  Alembic migration ``v1f2345678abc`` (backfilled "draft" for
  existing rows). Shared ``PublicationStatus`` Pydantic Literal
  + ``_PUBLISHING_LIFECYCLE`` tuple in
  ``backend/app/schemas/__init__.py`` so a future status change
  propagates to both surfaces in one edit. ``ArticleStatus``
  becomes a back-compat alias. BookCard + BookListView gain a
  status badge mirroring the AD card/row footer pattern.

- **Content-Types SSoT (8 types)** (``ARTICLE-TYPES-SSOT-01``,
  renamed mid-arc to ``CONTENT-TYPES-SSOT-01`` per user
  direction, 2026-05-29). The reserved ``Article.content_type`` column is
  repurposed as the article-type discriminator per the original
  model intent ("exists so a future Blogpost / Tweet
  differentiation can land without a schema change"). New
  ``backend/config/content-types.yaml`` registry ships **8
  types**: Blog post (default), Tutorial, Review, Essay,
  Newsletter, Interview, Listicle, Short story. Per-type
  extra-fields (tutorial difficulty + prerequisites + duration,
  review work + author + rating, newsletter issue + send date,
  interview partner + role) live in a new ``article_metadata``
  JSON column.
- **GET /api/content-types** endpoint serving the registry +
  drift-detector test (Pydantic Literal kept in sync with the
  YAML).
- **AD split-button** (``new-article-chevron`` + dropdown
  items): default click creates a blog post; chevron exposes
  the other 7 types. Mirrors the Book Dashboard
  ``new-book-group`` split-button shape via the new shared
  **SplitButton** primitive (RCU 2-surface extraction).
- **ArticleEditor type selector + per-type fields** in the
  metadata sidebar. Switching the type reveals the right
  extra-field inputs (text / number / enum / date) for that
  type; values persist into ``article_metadata``.
- **Article-type badge** in AD card + list row footers.
- **8 i18n catalog updates** (de / en / es / fr / el / pt / tr /
  ja): labels + descriptions for all 8 types + 10 per-type
  extra-field labels + AD split-button tooltips.
- **Playwright smoke** (``e2e/smoke/content-types.spec.ts``)
  covering create-via-primary, chevron-dropdown contents,
  create-via-menu-item, editor type-switch + extra-fields
  persist, AD badge rendering.
- **Help doc pair** (DE + EN) at
  ``docs/help/{de,en}/articles/content-types.md``.
- **Comic-book bubble overhaul** — all 6 bubble types (speech,
  thought, narration, shout, whisper, sound-effect) render as a
  single continuous SVG path (outline + tail in one shape), with
  the same path generator running in the editor preview and the
  WeasyPrint PDF walker (no CSS-shape-plus-polygon-tail seam).
  Per-type tail behaviour (thought circle-chain, shout
  spike-absorption, narration forced no-tail). Pointer-drag to
  reposition a bubble and drag its tail tip on the canvas.
  Speech/thought shape swap fix + a11y (button-name + contrast)
  pass. Help-doc pair ``books/comic-bubbles`` (DE + EN) +
  visual-regression baselines.
- **Comic multi-panel grid layouts** — 7 grid templates
  (single_panel through grid_3x3) selectable per page via
  ``ComicGridTemplatePicker``; the editor disables Add-Panel at
  the template's cell capacity. An overflow handler offers
  Move-to-new-pages / Delete / Cancel when a layout switch would
  exceed capacity (``COMIC-PANEL-OVERFLOW-HANDLER-01``).
- **Picture-book layout expansion (Phases 1-3)** — new
  ``PageLayout`` variants beyond the original one-image-per-page:
  split_horizontal, split_vertical, two_images_text_center,
  image_border_text_center (Phases 1-2) and a free-form
  **collage** layout (Phase 3) with drag-positioned image +
  text regions (``useDragPosition`` hook), z-index ordering, and
  a matching collage PDF walker. LayoutPicker groups layouts into
  categories; i18n for all new layouts in 8 catalogs.
- **FullscreenButton** shared component adopted across the page
  editors (picture-book + comic-book + storyboard), replacing the
  per-surface inline fullscreen toggles.
- **Settings-Completeness batch** — backup-history per-entry
  delete + clear-all (new DELETE endpoints + Settings UI);
  ``white_label`` feature flag gating the Erweitert tab;
  per-field ``X`` clear button extracted (RCU) across 4 search
  surfaces; KDP wizard default marketplace + Picture-Book PDF
  defaults migrated from localStorage to ``app.yaml``;
  confirmation-skip mode for non-destructive dialogs; Autoren tab
  profile-vs-database clarification; persisted Tier1/Tier2
  collapsible open-state per surface. New Settings > Backups
  help page (DE + EN).

### Changed

- ``backend/app/services/reclassify.py``: comment→article
  reclassify defaults to ``"blogpost"`` (was hardcoded
  ``"article"``).
- ``backend/app/routers/books.py:_resolve_articles_or_422``:
  dropped the ``content_type != "article"`` filter and the
  ``non_article`` 422 facet. Every row in the articles table is
  by definition an article — sub-classification is the new
  semantic.
- ``backend/app/services/backup/serializer.py``:
  ``restore_article_from_data`` auto-rewrites legacy
  ``content_type == "article"`` → ``"blogpost"`` on restore
  (same backfill semantics as the migration). New
  ``article_metadata`` round-trips through .bgb backups.
- **medium-import** plugin: imports default to ``"blogpost"``.
- **Dashboard** ``newBookGroup`` block migrated to the shared
  ``<SplitButton>`` primitive. All ``new-book-*`` testids
  preserved for E2E spec stability.
- **Dashboard.module.css**: ``.newBookGroup`` /
  ``.newBookChevron`` classes removed (superseded by
  ``SplitButton.module.css``).

### Fixed

- Comic bubble position mismatch between the editor and the PDF
  export (SVG explicit width/height; CSS ``inset`` shorthand
  WeasyPrint couldn't parse replaced).
- Comic bubble text now reads as solid black by default instead
  of inheriting a faded colour.
- Picture-book secondary-image upload affordance now visible.
- Date formatting follows the UI language across 8 surfaces
  (locale-aware dates).
- Fullscreen exit tooltip mentions both Esc and F11.

### Database

- Alembic migration ``u0e1f2345678``: backfill
  ``Article.content_type == "article"`` → ``"blogpost"``; new
  nullable ``article_metadata`` Text column.
- Alembic migration ``v1f2345678abc``: new ``Book.status`` column
  (publication lifecycle), backfilled ``"draft"`` for existing
  rows.
- Picture-book collage + multi-image layouts persist their region
  geometry through the existing ``Page.layout_config`` namespaced
  JSON (no new columns).

## [0.39.0] - 2026-05-27

A Picture-Book authoring depth release. 49 commits since v0.38.0
across two coordinated multi-session arcs (Storyboard View +
Picture-Book Text-Stack) plus one closure-by-discovery (Settings-
Allgemein already-shipped) and the LAYOUT-SWITCH-TEXT-CONVERSION
data-hygiene win, all wrapped with a comprehensive doc-sweep
covering README, CONTRIBUTING, CLAUDE.md, and the help-doc
cross-link layer.

### Added

- **Storyboard View for picture books**
  (``PICTURE-BOOK-STORYBOARD-VIEW-01``, 16 commits across 2
  sessions, ``f48f71b..fc7ab98``). New ``?view=storyboard``
  mount that renders a drag-reorder grid of picture-book pages
  with per-page annotations: inline notes textarea, 6-value
  story-beat tag selector (Exposition / Inciting / Rising /
  Climax / Falling / Resolution), 10-preset mood-color palette,
  free-text act-group label for visual chapter boundaries.
  Click-to-navigate jumps to the regular page editor. Drag-
  reorder uses the existing ``/api/books/{id}/pages/reorder``
  endpoint with stale-client detection.
- **Page schema extended** with 4 nullable Storyboard columns:
  ``notes``, ``story_beat``, ``mood_color``, ``act_group``.
  Alembic migration auto-applies on first start; existing rows
  get ``NULL``.
- **Tier 1 (Visual Style) + Tier 2 (Typography) sections** added
  to picture-book layouts ``image_top_text_bottom``,
  ``image_left_text_right``, and ``image_full_text_overlay``
  (``PICTURE-BOOK-PAGE-TEXT-TIPTAP-INTEGRATION-01`` /
  ``PICTURE-BOOK-OVERLAY-TEXT-TIER-PROPERTIES-01`` /
  ``PICTURE-BOOK-TEXT-CONFIGURATION-01``, 18 commits across 2
  sessions, ``d8da5fe..08a6504``). 14 fields per layout (8
  Visual-Style + 6 Typography) matching the existing
  ``speech_bubble`` precedent. Overlay-specific width + height
  sliders narrow the text band horizontally and limit vertical
  height.
- **Shared style helper:** ``computeTierTextStyles`` (TypeScript)
  + ``_compute_tier_text_style`` (Python mirror) — RCU 3-surface
  extraction so the editor preview and the WeasyPrint PDF walker
  render the same Tier configuration.
- **Help-doc surface**: 6 new help-doc topic pairs (DE + EN =
  12 Markdown pages) under ``HELP-DOCS-V0.37.0-GAPS-01``:
  ``settings/sidebar``, ``editor/display-settings``,
  ``editor/word-wrap``, ``books/repository-url``,
  ``dashboard/pagination``, ``dashboard/trash-and-restore``.
  5 Playwright-generated screenshots in the default theme
  (warm-literary light, 1280×800). New manual-only
  ``screenshots`` Playwright project for regenerating help
  screenshots.

### Changed

- **Fix B per-layout namespace for ``Page.layout_config``**
  (commit ``d8da5fe``). ``layout_config`` now nests
  configurations under each layout's name (e.g.
  ``{speech_bubble: {...}, image_top_text_bottom: {...}}``).
  Switching layouts no longer purges the dict; each layout's
  configuration is preserved across switch + switch-back.
  Legacy flat configs auto-migrate to the namespaced shape on
  the next write. Supersedes Fix A (v0.33.1) purge-on-switch.
- **Active text-conversion on layout-switch**
  (``PICTURE-BOOK-LAYOUT-SWITCH-TEXT-CONVERSION-01``, commit
  ``5d87560``). When switching FROM a TipTap layout to a
  Tier-Property layout, the PATCH carries the extracted
  plain-text version of ``text_content`` alongside the layout
  flip. The DB shape is cleaned at switch time; subsequent
  reads don't pay the parse cost; rows no longer carry a
  stringified TipTap doc in a Tier-Property layout. Symmetric
  direction (Tier-Property → TipTap) leaves ``text_content``
  untouched; ``parseTextContentToJson`` wraps plain text on
  read.
- **README + README-de**: 8 new feature bullets each + 3 new
  top-level sections (Picture Book Authoring, Comic Book
  Authoring, KDP Publishing Wizard) + plugin-table gap fix
  (``comics`` + ``medium-import`` rows added).
- **CLAUDE.md**: data model section expanded — ``Page`` (5
  picture-book layouts + ``comic_panel_grid`` + 4 Storyboard
  columns), ``ComicPanel / ComicBubble``, ``BookPublishingState``
  were missing.
- **CONTRIBUTING.md**: PluginForge version bump ``^0.5.0`` →
  ``^0.10.0`` in the plugin-development reference.
- **Help-doc cross-link layer**: "Verwandte Themen" / "Related"
  sections added to 5 page pairs (DE + EN = 10 files) —
  storyboard ↔ text-configuration ↔ display-settings ↔
  sidebar ↔ pagination ↔ trash-and-restore. ``text-
  configuration.md`` updated to reflect the LAYOUT-SWITCH-
  TEXT-CONVERSION ship.

### Fixed

- **CI pre-commit hook bundle** (commit ``fe0e84a``):
  ``notify.error in catch blocks must pass the caught error``
  failing on ``Storyboard.tsx:186`` (single-arg call) +
  trailing-whitespace strip in a Pre-Inspection audit doc.
  Fix added ``ui.storyboard.save_failed`` key across all 8
  i18n catalogs + flipped the call shape to
  ``notify.error(t("ui.storyboard.save_failed", "Save failed"), err)``.

### Backlog hygiene

- **``SETTINGS-ALLGEMEIN-TAB-REORGANIZATION-01`` closed
  retroactively**: surfaced as a stale filing during the
  post-v0.38.0 backlog re-sync. The Option B scope (split
  Allgemein into multiple top-level tabs) had already shipped
  under ``SETT-PHASE-2-ALLGEMEIN-TAB-SPLIT-01`` in v0.38.0.
- **3 P5-bodied items moved from the P3 section to P5**:
  ``PICTURE-BOOK-STORYBOARD-OPERATIONS-01``,
  ``STORYBOARD-MOOD-FREE-PICKER-01``,
  ``STORYBOARD-DRAG-CROSS-GROUP-ACT-UPDATE-01``. Mis-location
  was a filing-time oversight; bodies + triggers unchanged.

## [0.38.0] - 2026-05-26

A Settings-UX overhaul release. 30 commits since v0.37.0 (one
day after the v0.37.0 ship). The audit filed at v0.37.0
release-time (8 follow-up items in
``056fdfd``) drove four coordinated work streams that, together,
restructure the Settings page from a 13-tab horizontal scroller
into a left-sidebar grouped nav with consistent toggles + per-
section descriptions + dedicated tabs.

### Changed

- **Settings Phase 1 — 7 quick wins**
  (``SETT-PHASE-1-QUICK-WINS-01``, commits ``b33963b..fd855ff`` +
  ``b62c698``). Tightens the existing Settings page without
  structural changes: dashboard-view controls grouped into a
  shared sub-card (SETT-QW-1); SSH-Key block migrated into its
  own card with a header (SETT-QW-2); Editor tab extracted from
  Allgemein (SETT-QW-3); sectionTitle CSS-Module class
  standardized across all panels (SETT-QW-4); HelpText component
  extracted (SETT-QW-5); White-Label section turned into a
  collapsible (SETT-QW-6); ``SectionHeader`` composition
  component + per-section descriptions across every tab
  (SETT-QW-7).

- **Settings Phase 2 — Allgemein tab split**
  (``SETT-PHASE-2-ALLGEMEIN-TAB-SPLIT-01``, commits
  ``b194ddf..2b28d17`` + ``d27de1d``). The catch-all "Allgemein"
  tab decomposed into three focused tabs:
  ``Erscheinungsbild`` (5 dashboard-view controls + 5 theme/
  language/per-page controls), ``Verhalten`` (autosave +
  default-status + trash-auto-delete), and ``Erweitert``
  (debug-only + white-label collapsible). Obsolete
  ``AppSettings.tsx`` removed.

- **Settings Phase 3 — Toggle composition component**
  (``SETT-PHASE-3-TOGGLE-COMPONENT-01``, commits
  ``cabd51c..1404cc0`` + ``482c685``). New ``Toggle`` component
  ships the canonical checkbox + label + HelpText pattern. 5
  canonical-shape sites migrated (VerhaltenSettings 3 + AI 1 +
  AudiobookSettingsPanel readChapterNumber 1). The remaining
  6 checkbox sites in Settings sub-components are intentional
  design-intent exemptions documented in the
  ``Toggle.tsx`` docstring per the design-intent-axis lessons-
  learned rule — NOT deferred work:
  - 2 inline label-after-checkbox sites (AudiobookSettingsPanel
    ``highQualityOnly``, TranslationSettingsPanel ``freeApi``)
    where Toggle adds no value
  - 3 list-row sites (ErweitertSettings
    ``white-label-core-*`` loop) with a different structural
    shape (strong + side-by-side description + bottom border)
  - 1 generic plugin-setting renderer
    (``ScalarSettingField``) out of scope for the Settings-
    specific component

- **Settings — Autor + Autoren-Datenbank consolidated**
  (``SETT-AUTHORS-TAB-CONSOLIDATION-01``, commits ``e45d8ae`` +
  ``1205f74``). The two formerly-separate tabs (Autor for the
  user's own profile + Autoren-Datenbank for the known-authors
  registry) merged into a single ``Autoren`` tab. Both
  ``AuthorSettings`` and ``AuthorsDatabase`` sub-components
  unchanged; only the tab wrapper changed. Legacy ``?tab=author``
  and ``?tab=authors_database`` URLs redirect to ``?tab=autoren``
  via ``LEGACY_TAB_REDIRECTS``.

- **Settings — horizontal tab bar replaced with left sidebar**
  (``SETT-L-1-SIDEBAR-REDESIGN-01``, 5-commit chain
  ``85ae7fe..bd54ec2``). The 13-tab horizontal bar produced a
  horizontal scrollbar at the 900px max-width once
  SETT-AUTHORS consolidation closed (user-pull trigger fired
  the same day). Two-column grid layout (220px sidebar + 900px
  content inside a 1180px outer container); 5 sidebar groups
  (Darstellung, Inhalt, System, Info, Gefahrenzone); 4 visible
  group headers (Gefahrenzone is a single-item group, no header
  by design); Danger Zone item carries a ``--danger`` red accent
  + a ``--border`` divider above. Mobile (<=768px) collapses to
  the existing DropdownMenu pattern with ``DropdownMenu.Separator``
  between groups. All 13 ``settings-tab-{value}`` testids
  preserved — 3 existing E2E specs (about-dialog,
  trash-view-mode-defaults, article-topic-seo) keep working
  without modification. ``?tab=`` URL routing + the legacy-tab
  redirect map preserved. New
  ``e2e/smoke/settings-sidebar.spec.ts`` ships 7 cases pinning
  the sidebar landmark + group headers + click→content swap +
  deep-link + legacy redirect + Danger Zone visual cue.

- **Article Dashboard top-nav aligned with Book Dashboard**
  (commit ``18dd836``). Different button counts between the two
  views caused a visible horizontal layout shift when switching
  dashboards. The standalone ``Aus Medium importieren`` button
  collapsed into a chevron disclosure on the ``Importieren``
  button (split-button pattern matching the
  ``newBookGroup`` on Dashboard.tsx); a second headerSeparator
  added before Backup to mirror the Books-side structure.
  Article width was ~1014px, Book ~908px (~106px jump);
  after: both ~908px. The ``article-medium-import-btn`` testid
  moved to the DropdownMenu.Item.

### Added

- ``SectionHeader`` composition component + per-section
  descriptions on every Settings tab (SETT-QW-7) — gives users a
  one-paragraph "what this tab does" cue without opening the
  help docs.
- ``Toggle`` composition component (SETT-PHASE-3) — first 5
  consumer sites migrated; remaining 10 tracked as a P3 sweep.
- 5 new i18n keys × 8 catalogs = 40 cells:
  ``ui.settings.sidebar_nav`` +
  ``ui.settings.group_darstellung/inhalt/system/info``.
  DE canonical, EN direct-translation authored, 6 langs
  machine-translated and recorded in
  ``backend/config/i18n/AUTO_TRANSLATED.md``.
- 1 i18n key × 8 catalogs:
  ``ui.articles.import_more_tooltip`` for the Article Dashboard
  import-chevron tooltip.
- ``DropdownMenu.Separator`` between groups inside the
  Settings mobile-menu popover — the desktop group structure
  now surfaces on mobile too without extra config.

### Fixed

- **Top-nav layout jump between Book and Article Dashboard**
  (commit ``18dd836``). See the corresponding "Changed" entry
  above — same fix solves both the structural drift and the
  user-visible UX bug.

### Infrastructure

- ROADMAP refresh post-v0.37.0 (``6bda82b``).
- 8 v0.37.0 post-release follow-ups filed in backlog
  (``056fdfd``) including
  ``HELP-DOCS-V0.37.0-GAPS-01`` (Editor display settings +
  Book.repository_url + dashboard pagination + word-wrap help
  pages still pending).
- Test counts unchanged at baseline (backend pytest 2269;
  ``make test`` reaches 2269 backend + 2080 Vitest + all plugin
  suites green). i18n parity 51/51.

## [0.37.0] - 2026-05-25

53 commits since v0.36.0 across two coordinated batches: an
accessibility + safety + parity foundation push (a11y WCAG 2.1
AA audit, Danger Zone reset, bulk-restore parity, Medium-import
polish), followed by a v0.36.0 housekeeping + feature stream
(Dashboard pagination, Book.repository_url field, editor display
settings, ROADMAP refresh, archive restructure). Plus 1 stale-
backlog closure (COMMENTS-ADMIN-PAGINATION-01 was already
shipped at filing time) and 2 trigger-audit annotations
(BOOK-TYPE-CARD + KDP-WIZARD-RESUME).

### Added

- **Danger Zone full-system reset** (DANGER-ZONE-RESET-EVERYTHING-01,
  commits ``3c1381a`` + ``8b6a11b`` + ``bc363df`` + ``2cea204`` +
  ``6339a32``). New ``Settings → Gefahrenzone / Danger Zone`` tab
  with a three-step HMAC-token-gated wipe that resets the entire
  app to first-install-like state. Two-phase endpoint pair under
  ``/api/system/`` (``POST /reset/prepare`` issues a per-process
  random-secret-signed token valid 5 minutes; ``POST /reset``
  validates the token + the literal string ``"RESET"`` before
  executing). Backend ``reset_service.run_reset`` cancels
  in-flight SSE jobs, truncates all 21 tables via
  ``reversed(Base.metadata.sorted_tables)``, re-seeds 5 book +
  4 chapter built-in templates, wipes ``<data_dir>/uploads/``,
  ``tmp/``, ``backup_history.json``, ``config/app.yaml``,
  ``config/plugins/*.yaml``, ``plugins/installed/*`` and
  ``<config_dir>/secrets.yaml``. Preserves the production-marker
  tripwire, platformdirs migration breadcrumb, launcher install
  metadata, and project-tree ``licenses.json``. Frontend
  ``DangerZoneSettings`` component drives a Radix Dialog with
  background prepare-call + RESET-input gating + backup-first
  link + post-reset ``localStorage.clear`` +
  ``sessionStorage.clear`` + Dexie ``BibliogonDB`` drop + redirect
  to Dashboard. i18n parity across 8 catalogs (DE + EN native, 6
  passthrough-EN). Coverage: 25 new pytest cases (8 token unit +
  7 service integration + 7 endpoint integration + 3 JobStore
  extension), 9 Vitest cases for the component state machine, 2
  Playwright smoke cases for the full UX. The existing
  ``/api/test/reset`` debug-only endpoint stays untouched - both
  surfaces coexist with different security contracts.

- **Dashboard pagination with user-selectable page size**
  (DASHBOARD-PAGINATION-LOAD-MORE-01, 8-commit ship
  ``822050c..277dd1d``). Book + Article dashboards now paginate
  via a "Mehr laden" button + a 10/25/50/100 page-size dropdown.
  Backend ``limit`` query param on ``GET /api/books`` +
  ``GET /api/articles`` (``ge=1, le=1000``); default ``None``
  preserves the historical no-cap behaviour for non-dashboard
  callers (BookEditor navigation, backup). PATCH
  ``/api/settings/app`` enum-validates
  ``ui.dashboard.{books,articles}_page_size`` against
  ``{10, 25, 50, 100}``. New ``usePagedList(scope)`` hook +
  ``<PageSizeSelector>`` component with read-merge-write
  persistence mirroring useViewMode. Selection semantics
  preserved: select-all still operates on the full filtered set,
  not just the visible page. 10 backend pytest cases + 15
  Vitest cases + 4 Playwright smoke + 2 i18n keys × 8 catalogs.

- **Bulk-restore parity for articles + books**
  (BULK-RESTORE-PARITY-01, commits ``35591a7`` + ``7a762d0``).
  Single-round-trip restore endpoints
  ``POST /api/articles/trash/bulk-restore`` +
  ``POST /api/books/trash/bulk-restore`` accept a list of trash
  IDs and return a ``{restored: [...], failed: [...]}`` shape.
  Replaces the previous "loop the single-restore endpoint per
  ID" pattern that the Undo toast triggered after bulk-trash.
  Frontend ``Undo`` action now hits the bulk endpoint once.
  i18n parity across 8 catalogs.

- **Book.repository_url metadata field**
  (BOOK-REPOSITORY-URL-FIELD-01, 5-commit ship ``8a8a11b..55829b8``).
  Optional ``Book.repository_url`` ``String(2000)`` nullable
  column + Alembic migration ``s8c9d0e1f234``. Surfaces in
  BookMetadataEditor's General tab via a new
  ``RepositoryUrlField`` sub-component with git-sync read-
  precedence: when the book is plugin-git-sync-managed
  (``GitSyncMapping`` exists), the field renders read-only with
  the canonical mapping URL + a "managed by git-sync" hint;
  when no mapping exists, free input editing
  ``Book.repository_url``. Two storage shapes for two
  lifecycles: GitSyncMapping for round-trip; Book.repository_url
  for manually-tracked external repos. 9 backend pytest + 5
  Vitest + 2 Playwright smoke + 4 i18n keys × 8 catalogs.

- **Editor display settings** (EDITOR-DISPLAY-SETTINGS-01,
  6-commit ship ``6197c35..2fb82f4``). Per-device localStorage-
  backed preferences for text width (narrow/medium/wide/full),
  font family (serif/sans/mono), font size (small/medium/large),
  and line height (compact/normal/relaxed). Toolbar popover
  trigger from the shared Editor.tsx surface — single mount
  covers BOTH chapter-based BookEditor AND ArticleEditor. CSS
  variables on ``document.documentElement`` cascade into
  ``.tiptap-editor``; ``var()`` fallbacks match pre-feature
  literals so opt-out users see no change. Width presets
  picked per reading-research recommendations (narrow=680px ≈
  45-55 chars, medium=780px, wide=900px, full=none). 11 hook
  Vitest + 11 component Vitest + 2 Playwright smoke + 20 i18n
  keys × 8 catalogs. Per-device persistence chosen over per-
  account YAML because monitor sizes vary; pairs naturally
  with the existing Alt+Z word-wrap toggle.

- **Comic-book plugin operational smoke**
  (PLUGIN-COMICS-E2E-SMOKE-01, commit ``acc7b78``). Live-dev
  plugin-info-panel-renders + no-plugin-error assertion as
  the 4th test in ``e2e/smoke/comic-book-editor.spec.ts`` +
  stale ``version === "1.0.0"`` assertion in
  ``user-overlay-migration.spec.ts`` bumped to ``/^1\./``.
  Operational-gap regression-pin (a broken plugin-load path
  silently passes in pytest because the lifespan + plugin
  discovery run fresh per test, but 404s against a long-running
  uvicorn).

- **Medium-import progress polish** (commits ``e193f5f``,
  ``760b944``, ``d3edbd3``). Progress panel sits ABOVE the
  preview table during import (was below); action buttons (Run,
  Cancel, Run-in-background) at the TOP of the preview panel
  (was bottom); retro-fix script
  ``scripts/retro_fix_medium_codeblock_newlines.py`` repairs
  collapsed code-block newlines on already-imported legacy
  rows (one-off; documented in archive).

### Changed

- **Accessibility audit — WCAG 2.1 AA**
  (ACCESSIBILITY-AUDIT-WCAG-AA-01, 7-commit ship
  ``457e01c..2349797`` + close ``e760cf4``). Audit identified
  zero-coverage gaps; remediation in 7 coherent commits:
  - **C1**: ``<SkipToContentLink>`` component + ``main`` /
    ``aside`` / ``header`` / ``footer`` landmark sweep + heading
    hierarchy normalization across 8 routed pages. New i18n key
    ``ui.a11y.skip_to_content`` × 8 catalogs.
  - **C2**: universal ``*:focus-visible`` keyboard-focus safety-
    net CSS rule covering every interactive element + KDP
    Publishing Wizard step-change focus management
    (focus-first-interactive on each step transition).
  - **C3**: ARIA sweep — ``WizardShell`` ``aria-current="step"``
    on the active step indicator, ``aria-pressed`` on 20+
    Toolbar formatting toggles (bold / italic / underline /
    headings / alignment / etc.).
  - **C4**: TipTap editor surface accessible name
    (``aria-label`` + ``role="textbox"`` + ``aria-multiline``)
    on both ``Editor.tsx`` (chapter + article) and
    ``RichTextEditor.tsx`` (picture-book). New i18n key
    ``ui.a11y.editor_label`` × 8 catalogs.
  - **C5**: WCAG AA color-contrast — 30 axe-core findings
    resolved by darkening ``--text-muted`` + ``--accent`` across
    all 10 theme variants (5 themes × light/dark). User-
    adjudicated path α (fix-all-themes) over path β (per-theme
    opt-in).
  - **C6**: ``@axe-core/react`` ``^4.11.3`` integration as
    devDependency-only via ``import.meta.env.DEV`` dynamic
    import. Prod bundle verified clean — zero axe-core bytes
    in the production build.
  - **C7**: universal ``prefers-reduced-motion`` CSS rule
    coercing all ~42 transition/animation sites to ``0.01ms``
    duration when the OS-level preference is set.
  Pre-Inspection findings fully closed: skip-link / motion-
  query / BookEditor ``<main>`` / no-h1 / 30 contrast
  violations / 0 axe-core integration — all resolved.

### Infrastructure

- **docs/archive/ restructure** (commit ``8670c44``):
  ``docs/roadmap-archive/`` → ``docs/archive/roadmap/`` so all
  archived content lives under a single ``docs/archive/`` root
  (matches the existing ``docs/archive/journal/`` +
  ``docs/archive/audits/`` + ``docs/archive/testing/`` siblings).
  15 live-file cross-references updated;
  ``scripts/archive_completed_task.py`` ARCHIVE_DIR constant
  updated. Archived-journal cross-refs preserved as historical
  record per the existing convention.

- **ROADMAP refresh post-v0.36.0** (commit ``68afd44``).
  Previous per-phase / per-session journal structure replaced
  with a thematic overview that defers detailed scope to
  ``docs/backlog.md``. P3 grouped by theme: Picture-Book &
  Comics Optimization, KDP Wizard Refinements, Book Metadata
  Extensions, Editor Display Preferences, Infrastructure /
  Quality, UX Polish, Strategic / Long-Term, Import / Export
  Refinements, Article Authoring, Launcher / Distribution,
  Plugin Ecosystem, i18n, Tooling / Test Infrastructure.
  Previous ROADMAP archived at
  ``docs/archive/roadmap/ROADMAP-v0.36.0.md``.

- **Stale documentation hygiene sweep** (commits ``e82e30e`` +
  ``e35e2db`` + ``939ff35`` + ``52f0e94`` + ``b3041a7``).
  CLAUDE.md tech-stack version refs (pluginforge ^0.5.0 →
  ^0.10.0, manuscripta ^0.7.0 → ^0.9.0); README + README-de
  current-version (v0.29.0 → v0.36.0) + theme list (6 →
  actual 5: Classic, Cool Modern, Nord, Notebook, Studio);
  CONTRIBUTING plugin count (10 → 12); CONCEPT.md pluginforge
  version references; configuration.md docker compose example
  tag; smoke-tests README dead link; 3 stale journal handover
  notes archived; coverage-history + ux-full-audit screenshots
  archived; ruff-format release-prep nit. Backlog audits:
  COMMENTS-ADMIN-PAGINATION-01 closed as already-shipped
  (audit-finding was stale at filing time — fix shipped 3 days
  before the audit). BOOK-TYPE-CARD-COMPONENT-EXTRACT-01 +
  KDP-WIZARD-RESUME-AT-STEP-01 annotated with NOT-MET trigger
  audits.

### Result

- Backend pytest: 2214 → 2269 (+55 across the cycle)
- Frontend Vitest: 1986 → 2037 (+51 across 160 files)
- i18n parity: 75/75 across all 8 catalogs
- npm audit: 0 high/critical (2 moderate ``ws`` advisories,
  documented + within release-workflow.md tolerance)
- External Bibliogon-owned deps: ``manuscripta ^0.9.0`` +
  ``pluginforge ^0.10.0`` at PyPI latest
- tsc + ruff + mypy + pre-commit + verify-docs-discipline +
  verify-plugin-locks + launcher PyInstaller build smoke all
  green

### Known gaps (filed as v0.37.x follow-ups)

- ``HELP-DOCS-V0.37.0-GAPS-01`` — pagination + word-wrap +
  editor display settings + repository URL field shipped
  without dedicated help pages.

## [0.36.0] - 2026-05-23

Largest release since v0.30.0 by commit count (230 commits since
v0.35.1; +59765 / -2909 lines across 331 files). Three strategic
streams matured together: plugin-comics from scaffold to working
multi-panel + multi-bubble editor; the KDP Publishing Wizard
(Phase 1 + Phase 2 shipped as a single 5-step XState v5 wizard with
server-side persistence + conflict-resolution banner); and the
PluginForge v0.7.0 → v0.10.0 adoption arc (3-source metadata
pattern, DiscoveryResult severity filtering, version-gating,
`/api/admin/rediscover`). Plus 17 other coherent surfaces.

### Added

- **plugin-comics v1.1.0** (Session 2 close — commits C1
  ``c080974`` through C7 (this release-cycle)). Multi-panel +
  multi-bubble editor for ``book_type='comic_book'`` books with
  the full panel-grid + bubble-config pipeline shipping in this
  cycle:
  - Backend schema + CRUD (Sessions 2 C1 + C2): new
    ``comic_panels`` + ``comic_bubbles`` tables, Pydantic
    schemas with 6-type ``BubbleType`` Literal + 10-direction
    ``BubbleTailDirection`` Literal, 8 CRUD endpoints (Session
    2 C6 added the missing ``GET .../comic-panels/{id}/bubbles``
    list endpoint as the Half-Wired-Lifecycle closure that the
    C6 Pre-Coding-Reality-Check surfaced)
  - Backend PDF walker (Session 2 C3): WeasyPrint-driven
    comic-book PDF export with 3 page-grid templates
    (single_panel, grid_2x2, grid_3x3), 6 bubble-type CSS
    variants (speech / thought / narration / shout / whisper /
    sound_effect), and an SVG triangle tail primitive (8
    octants + ``none`` + ``auto``). Dispatch from
    plugin-export's ``export()`` route reuses the 5 KDP picture-
    book trim sizes per Q4 a
  - Frontend BubbleTail SVG primitive (Session 2 C4): editor-
    side mirror of the walker's tail geometry, math
    verbatim — the in-editor preview matches the rendered PDF
  - Frontend comic editor components (Session 2 C5):
    ``ComicBubble``, ``ComicPanel``, ``ComicPanelGrid``,
    ``LayoutConfigComicBubble`` — RCU canonical 2-site
    extraction of ``Tier1Section`` + ``Tier2Section`` from the
    picture-book ``LayoutConfigSpeechBubble`` with same-session
    migration of both surfaces (picture-book regression-pin
    72/72 passing under the migration)
  - Frontend full ``ComicBookEditor`` (Session 2 C6): replaces
    the Session-1 placeholder with a working multi-panel editor
    mounting the C5 components + the renamed
    ``PdfExportControls`` (was ``PictureBookPdfExportControls``,
    3rd caller surface). Graceful degraded "no pages yet" state
    when comic pages are absent (page-CRUD for comic_book
    deferred to ``PLUGIN-COMICS-SESSION-3-PAGES-CRUD-01``)
  - i18n × 8 catalogs (Session 2 C7): ~52 new strings per
    catalog under ``ui.page_editor.config.comic_bubble.*`` and
    ``ui.comic_book_editor.*``. EN canonical + DE proper
    umlauts; ES/FR/EL/PT/TR/JA carry passthru-English for the
    new namespaces per the established new-namespace pattern
  - Playwright × 3 smoke specs (Session 2 C7):
    ``comic-book-editor.spec.ts`` (router + editor mount +
    degraded state + PdfExportControls under namespace),
    ``comic-panel-bubble-crud.spec.ts`` (action-button surface +
    PDF format dropdown 5-options pin),
    ``comic-book-editor-a11y.spec.ts`` (heading + reachable
    affordances + keyboard focus)
  - New backlog filings: ``PLUGIN-COMICS-SESSION-3-PAGES-CRUD-01``
    (P2, page-CRUD opening), ``PLUGIN-COMICS-SESSION-3-EXTENDED-
    FEATURES-01`` (P3, drag/snap/nudge/undo/RTL/z-order/gutter/
    auto-tail-direction/full E2E matrix)
  - New Lessons-Learned: "CRUD shipping: List endpoint is
    non-optional" — same-session instance from C6 surfacing the
    C2 missing-Read gap; reinforces Half-Wired-Lifecycle
    Prevention rule

- **KDP Publishing Wizard (Phase 1 + Phase 2)**. 5-step guided
  publishing flow for KDP. Largest greenfield frontend feature
  this cycle:
  - **Phase 1 (3 steps)**: MetadataChecklist + CoverValidation
    + ExportPackage. Calls existing KDP validation endpoints.
  - **Phase 2 (2 additional steps)**: PricingStep (royalty
    calculator with KDP's 35% / 70% split logic) + ArcStep
    (Advanced Reader Copy reviewer tracking).
  - **XState v5 wizard state machine** (``kdpWizardMachine.ts``):
    replaces the hand-rolled ``useState`` + step-index pattern.
    Branching transitions, guards, async side effects gated by
    state, reset/retry semantics. 20 actor-level tests.
  - **Server-side persistence**: ``BookPublishingState`` schema
    (single row per book, JSON columns for per-step state) + 5
    CRUD endpoints. Wizard auto-saves on each step transition;
    rehydrates on reopen.
  - **ArcReviewer schema** + CRUD: reviewer roster with status
    (invited / accepted / submitted), one-to-many on book.
  - **Conflict-resolution banner**: when ``book.updated_at >
    publishing_state.updated_at`` (the user edited the book
    between wizard sessions), the wizard surfaces a banner
    offering re-validate-from-scratch vs continue-with-stale-
    validation.

- **Book-Types Single Source of Truth**
  (``BOOK-TYPES-SSOT-YAML-01``). Single canonical declaration
  of the 3 book types and their capabilities:
  - ``backend/config/book-types.yaml`` — 3 entries (prose,
    picture_book, comic_book) with per-type capabilities.
  - ``BookTypeRegistry`` backend with ``@lru_cache`` + parity
    gate test ``test_literal_matches_registry``.
  - ``GET /api/book-types`` endpoint + frontend
    ``useBookTypes()`` hook + ``BookTypesProvider`` mounted at
    App root.
  - 10 migrated surfaces (capability lookups replace hardcoded
    book-type lists): pages.py PAGEABLE_BOOK_TYPES, Dashboard,
    GetStarted, CreateBookModal, BookEditor, BookMetadataEditor,
    kdp-wizard, plugin-getstarted, plugin-kdp/package.py.

- **WizardShell composition primitive**
  (``WIZARD-SHELL-COMPONENT-EXTRACT-01``). RCU 3-site extraction
  + same-session migration of both wizard surfaces
  (KdpPublishingWizard + ConvertToBookWizard). Step-index logic
  centralized; ImportWizardModal kept as intentional asymmetry
  (modal vs page-route shape).

- **PluginForge v0.7.0 → v0.10.0 adoption** (3 successive bumps
  across the cycle):
  - 3-source plugin-metadata pattern codified in
    ``architecture.md``.
  - ``target_application`` + ``app_id`` declaration via
    PluginForge ≥ 0.7.0 conventions.
  - ``min_app_version`` moved from YAML to class attribute;
    version-gating enabled via ``app_version=__version__``
    constructor kwarg.
  - DiscoveryResult with severity filtering replaces private-
    state poking in callers.
  - ``/api/admin/rediscover`` endpoint + ``manager.refresh_config()``.
  - Plugin-status i18n mapping (``FilterReason`` →
    ``ui.settings.plugin_status.*`` across 8 catalogs).
  - ``/api/settings/plugins/discovered`` extended with per-plugin
    status + failure-reason.

- **Picture-book PDF improvements**:
  - 5-format dropdown (``PDF-KDP-FORMATS-01``) — all 5 KDP
    picture-book trim sizes (was 8.5×8.5 only). Dropdown next to
    Export-PDF button; localStorage-persistent.
  - Bleed marks + crop marks toggle (``PDF-BLEED-MARKS-01``) for
    print-shop submission. ``PictureBookPdfExportControls``
    extracted as 3-surface shared composite (closes half-wired
    surface from PDF-KDP-FORMATS-01).

- **Speech-bubble extended properties** (4c-B-2 +
  ``PADDING-FONT-STYLE-01``). ``bubbles[0]`` wrapper-shape
  read-path; Tier 1 visual style (border / background / opacity);
  Tier 2 typography (font / size / weight / italic / padding).
  Per-property i18n × 8 catalogs.

- **Multi-book-type Get Started flow**
  (``GETSTARTED-MULTIBOOK-TYPES-UPDATE-01``). 3-book-type
  picker; per-type sample-book templates; frontend branches
  into pages-editor for picture/comic types.

- **Author input — Pattern A (Datalist) across 4 surfaces**
  (``AUTHOR-DATALIST-EXTEND-EDITORS-01`` +
  ``AUTHOR-SELECT-INPUT-EXTRACT-01``). ``AuthorSelectInput``
  extraction; migrated CreateBookModal + ConvertToBookWizard +
  BookMetadataEditor + ArticleEditor (last suppresses the
  add-to-DB checkbox — auto-save would create partial-name
  rows). Orphan ``AuthorProfileSelect`` deleted in the I18N
  cleanup.

- **Browser-native fullscreen across 3 editors**
  (``EDITOR-FULLSCREEN-NATIVE-01``). ``useFullscreenToggle``
  hook + Toolbar + PageEditor + ComicBookEditor fullscreen
  buttons. ESC exits.

- **Word-wrap toggle** (``EDITOR-KEYBOARD-SHORTCUT-ALT-Z-01``).
  Alt+Z across every editor surface (chapter editor, picture-
  book RichText, comic-book editor, markdown textarea). Single
  CSS rule + ``useWordWrap`` hook with ``localStorage``
  persistence.

- **About dialog — 9th Settings tab**. New ``Settings > About``
  tab with Version + Credits + System-Info + Plugin-List +
  Donation-Channels sections. Backend ``/api/system/info``
  endpoint + extended ``/api/settings/plugins/discovered``.

- **Backups consolidation** (``BOOKDASHBOARD-CLEANUP-01``).
  Version-History + Compare-Backups moved from Dashboard to
  ``Settings > Backups`` (new 8th tab). i18n keys migrated
  ``ui.dashboard.*`` → ``ui.backups.*`` across 8 catalogs.

- **Page-delete UI** (``PAGES-DELETE-EDITOR-UI-01``).
  ``PageThumbnails`` Trash2 button + ``onDelete`` prop. Wired in
  PageEditor + ComicBookEditor (RCU 2-site).

- **plugin-comics multi-page navigation**
  (``PLUGIN-COMICS-MULTI-PAGE-NAVIGATION-01``). PageThumbnails
  sidebar adopted by ComicBookEditor (RCU 2-site).

- **Medium-import improvements**:
  - Excerpt auto-fill (``MEDIUM-IMPORT-EXCERPT-AUTOFILL-01``):
    ``Article.excerpt`` populated from subtitle or 300-char
    sentence-boundary slice from body.
  - ``<br>`` preservation in code blocks (Java / YAML / bash
    no longer collapse to one line).
  - ``null`` language tag fix on imported code blocks.

- **BulkActionBar 3-site RCU extraction**
  (``RECURRING-COMPONENT-AUDIT-01`` candidate #2). Article +
  Book + Comment dashboards now share ``BulkActionBar`` wrapper.

- **Story-tab metadata** (``EXPOSE-BUCHIDEE-METADATA-01``).
  New ``Book.book_idea`` field + Book Metadata Story tab.
  Author-design metadata fields exposed.

- **KDP categories wired to CategoryInput**
  (``KDP-CATEGORIES-WIRE-TO-CATEGORYINPUT-01``). Autocomplete
  now powers from the 26-entry ``KDP_CATEGORIES`` SSoT (was
  empty suggestions list, half-wired surface).

- **Comic-book metadata access path**
  (``COMIC-BOOK-EDITOR-METADATA-BUTTON-01``). Same affordance as
  the prose + picture-book editors.

- **User-overlay plugin-enable migration**
  (``USER-OVERLAY-PLUGIN-ENABLE-MIGRATION-01``). Lifespan helper
  detects new plugins missing from existing user-overlay
  ``plugins.enabled`` lists and appends them respecting the
  user's explicit opt-out signal. Closes the silent-fall-through
  bug where plugin-comics would fail to activate for upgrade
  users.

### Changed

- ``PictureBookPdfExportControls`` → ``PdfExportControls``.
  3-surface rename (PageEditor + BookMetadataEditor + new
  ComicBookEditor). The component picked up its third caller in
  Session 2 C6 and the picture-book-specific name became a
  misnomer; testidPrefix prop mechanism preserves all existing
  test assertions verbatim across the rename.

- ``export_execute`` hookspec wired for comic-book PDF dispatch
  (``HOOKSPEC-EXPORT-EXECUTE-WIRE-01``). plugin-comics registers
  ``@hookimpl export_execute`` gated on ``book_type ==
  "comic_book" + fmt == "pdf"``. Eliminates the prior cross-
  plugin reverse-import in plugin-export's routes.py. plugin-
  audiobook retained as documented exception (async + SSE
  streaming doesn't fit sync ``Path | None`` hookspec).

- ``chapter_pre_save`` hookspec removed
  (``HOOKSPEC-DISPATCH-WIRING-01``). Dead-intent hook with no
  implementations.

- Pages-CRUD router relocated from plugin-kinderbuch to backend
  core. comic_book + picture_book share the same CRUD path.

- Single-router-per-plugin convention completed
  (``PLUGIN-EXPORT-SINGLE-ROUTER-REFACTOR-01``). plugin-export's
  3 top-level routers consolidated to one parent_router with
  ``include_router`` nesting (closes the pluginforge 0.8.0
  DeprecationWarning).

- Makefile completion (``PLUGIN-COMICS-MAKEFILE-INTEGRATION-01``).
  All 12 plugins now in ``test-plugins`` + ``test-coverage-
  plugins`` aggregates (was 10 / 9).

### Fixed

- **i18n cleanup** (``I18N-ARTICLES-NAMESPACE-CLEANUP-01``).
  7 article-editor keys had been silently rendering hardcoded
  German for non-DE users because they lived under
  ``ui.template_picker.*`` while consumers called them via
  ``ui.articles.*``. Fixed across all 8 catalogs. Orphan
  ``AuthorProfileSelect`` component + test deleted (12 LOC of
  dead component + 270 LOC of dead test).

- **Convert-to-book wizard layout stability**
  (``CONVERT-TO-BOOK-WIZARD-LAYOUT-STABILITY-01``). Action-button
  moved to WizardNav footer + ``stepContent`` min/max-height.
  Dialog dimensions stay visually stable across all 6 steps (was:
  button position jumped between steps).

- **KDP changelog filesystem-isolation**
  (``KDP-CHANGELOG-PATH-ISOLATION``). KDP-plugin's per-book
  changelog file write path now respects ``get_data_dir()`` /
  ``BIBLIOGON_DATA_DIR``; previously could land in CWD-relative
  paths under some dev-environment configurations.

### Lessons-learned filed this cycle

- **Single-Router-Per-Plugin convention** (architectural pattern
  surfaced through halted Comics-Session-2 + restored via
  refactor).
- **Pre-Coding-Reality-Check: re-audit at the keystroke** (three
  concrete instances in V060 adoption arc).
- **Audit-Methodology design-intent-axis** (5th-Axis or override-
  filter — RCU audit hit two design-intent-deferral cases in
  48 hours).
- **CRUD shipping: List endpoint is non-optional** (Half-Wired-
  Lifecycle prevention).
- **Foundation-Override extension** (Half-Wired-Visible-in-
  Production criterion for P1 promotion).
- **Stale-bundle is the most common false-positive on post-ship
  user reports** (diagnostic discipline).
- **Plain ``git status`` before every commit, especially in
  Multi-Tool-Coordination sessions** (explicit-paths-only staging
  convention).
- **Periodic backlog re-prioritization discipline** (4-Axes audit
  pattern).
- **Architecture-doc consultation is part of Pre-Inspection**
  (single-instance observation from KDP Phase 1).
- **Operational gaps masquerade as wired infrastructure**
  (mutmut workflow first run).

### Verification

- Backend pytest: **2214 passed + 1 skipped**
  (``--ignore=mutants``).
- Frontend Vitest: **1986 passed** (155 test files).
- i18n parity: **75 / 75 passed** across all 8 catalogs.
- ``tsc --noEmit``: clean.
- ``ruff check`` + ``mypy app/``: clean.
- ``pre-commit run --all-files``: clean.
- ``make verify-docs-discipline``: clean.
- ``make verify-plugin-locks``: clean.
- Launcher PyInstaller build smoke: green.
- ``npm audit --audit-level=high``: zero high / critical
  findings.

### Deferred to a later release

- ``PICTURE-BOOK-EPUB3-FIXED-LAYOUT-EXPORT-01``: EPUB3 Fixed-
  Layout export + epubcheck for picture-books.
- ``PICTURE-BOOK-KDP-PAGE-COUNT-VALIDATION-01``: validate page
  count against KDP's 24–300 limit at metadata-save time.
- ``PICTURE-BOOK-AI-DISCLOSURE-BADGE-01``: KDP-required
  AI-disclosure metadata for picture-books with AI-generated
  pages.
- ``KDP-WIZARD-RESUME-AT-STEP-01``: true "resume at last visited
  step" with server-stored validation results (current behavior
  restarts at metadata each session).

## [0.35.1] - 2026-05-18

Fast-follow patch for the v0.35.0 donation-visibility gap. The
S-03 reminder banner shipped in v0.19.0 had been functionally
invisible to new users because the 90-day grace gate meant no
banner fired until day 91. Bibliogon's donation-based
sustainability model needs visibility from week one, not month
four.

Three changes:

### Changed

- **DonationReminderBanner grace period: 90 → 7 days.** New
  users see the reminder after a one-week settling-in window
  instead of after three months. Industry-research synthesis
  (Wikipedia / Mozilla / Mastodon / Signal / Blender) confirms
  Bibliogon's existing 90-day dismissed + 180-day donated
  cooldowns sit in the median band; unchanged. The single
  ``DAYS_90`` constant that double-served as grace gate +
  dismissed-cooldown split into 3 explicit constants
  (``GRACE_PERIOD_DAYS = 7``, ``COOLDOWN_DISMISSED_DAYS = 90``,
  ``COOLDOWN_DONATED_DAYS = 180``).
- **S-03 reminder mounts at App-level** (was Dashboard-only).
  Banner now appears at the top of every page (Dashboard, Book
  Editor, Article Editor, Settings, Help, etc.) and persists
  across navigation until the user actively dismisses via
  Support / Not now / X / Escape. Dashboard keeps the S-02
  Onboarding Dialog mount + DonationsConfig fetch.

### Added

- **Escape keyboard dismiss** + **aria-live=polite** on the
  banner root. Screen readers announce the reminder without
  stealing focus; Escape behaves like Not-now (90-day cooldown).
- Backlog filing: ``REMINDER-PANEL-GENERIC-EXTRACTION-01`` (P3)
  for the eventual generic ReminderPanel extraction per the
  Recurring-Component Unification Rule. Triggers when a second
  reminder-shaped affordance (update / survey / backup) needs
  the same layout.

### Verification

Backend pytest 1926 + 1 skipped (`--ignore=mutants`); plugin
pytest 185; Vitest 1555/1555; new Playwright smoke spec
``donation-reminder-app-level.spec.ts`` ships (5 pins: grace
gate + App-level persistence + Escape dismiss + a11y attrs);
tsc clean; full ``make release-test`` gate green.

### Notes

i18n strings unchanged (the existing German body text says
"drei Monaten" which is slightly misleading at the new 7-day
grace; deferred to a future i18n-touch commit per the
explicit user-direction "i18n untouched"). Cooldowns unchanged
at 90/180 per industry-research synthesis. S-01 Settings
section + S-02 Dashboard onboarding dialog unchanged.

## [0.35.0] - 2026-05-18

The second Picture-Book release. TipTap rich-text editing for 3
of the 5 picture-book layouts; printable picture-book PDF export
with KDP-grade font embedding; 5 OFL fonts curated for children's
typography; speech-bubble width + height + 9-position anchor +
opacity; document-wide font application; visible region separator
across all 10 theme variants. Plus the medium-import async path
(SSE-driven progress + F5-recovery + Run-in-background dock). Plus
the release-automation audit shipped its four scopes (aggregate
Makefile targets, package-lock.json sync, open-set version-literal
discovery, CI release-gate extension). v0.35.0 is the first release
cut entirely through the new automation pipeline.

### Added

- **Picture-Book TipTap rich-text editing** (4c-B-1): the 3
  layouts where text shape is unbounded
  (`image_top_text_bottom`, `image_left_text_right`, `text_only`)
  now mount a TipTap-backed `RichTextEditor` instead of a
  textarea. D1 MVP extension set: StarterKit + TextAlign +
  Underline + TextStyle + Color + FontFamily. The 2 Tier-Property
  layouts (`speech_bubble`, `image_full_text_overlay`) keep
  textareas — their text shape is bubble/overlay-driven, not
  document-driven.
- **RichTextToolbar in PageEditor properties pane** (D6-C
  hybrid): 11 D1 MVP buttons (Bold / Italic / Underline / H1-3 /
  Bullet list / Ordered list / Align L/C/R) + Font dropdown.
  Hidden for Tier-Property layouts.
- **5-font OFL catalog for picture-book typography**: Atkinson
  Hyperlegible (default) + Andika + Comic Neue + Lexend +
  OpenDyslexic. All font files bundled under
  `plugins/bibliogon-plugin-export/fonts/` with full OFL
  attribution. Total bundle ~1.1 MB.
- **Picture-Book PDF export pipeline** (Session 6): WeasyPrint-
  backed 8.5×8.5 KDP-ready PDF with embedded `@font-face` rules
  for all 5 OFL fonts, TipTap-walker rendering preserving
  bold/italic/underline/font-family marks + alignment + headings
  1-3 + lists, full PDF metadata embedding (Title / Author /
  Description / Generator / Lang). Export-PDF button in both
  PageEditor header and Book Metadata Design tab.
- **Speech-bubble full 9-position anchor grid**: all 9 cells of
  the 3×3 grid clickable (was 5 — the 4 edge-midpoints are new).
  Each cell has its own i18n label + aria-label.
- **Speech-bubble `bubble_width` + `bubble_height` sliders**:
  independent width (20-80%) + height (15-60%) replace the single
  `size` knob. Backward-compat: legacy `size` reads as fallback
  for `bubble_width`.
- **PageEditor ThemeToggle**: dark/light mode switch in the
  picture-book editor header. Closed the 9th confirmed instance
  of the Articles-vs-Books parallel-surface asymmetry rule —
  every other top-level surface already had the toggle.
- **Medium-import async path** (ASYNC-IMPORT-PROGRESS-01): SSE-
  driven progress UI replaces the synchronous Phase-1
  spinner. Run-in-background dock + go-to-comments link +
  F5-recovery via context-backed state. UI surfaces v0.31.0's
  comment-routing fields (parent-article matching + orphan
  detection).
- **Authors-Database in CreateBookModal**: the modal now uses the
  Authors-DB datalist + add-to-DB checkbox, matching the wizard
  pattern. Closes the pre-vs-post-AuthorsDB CreateBookModal
  asymmetry.
- **Release-automation pipeline**: 6 aggregate Makefile targets
  (`release-state` / `release-outdated` / `release-test` /
  `release-build` / `release-tag VERSION=` / `release-publish
  VERSION=`); `sync-versions` now syncs `package-lock.json`
  top-level version; `release-discover` scans for hardcoded
  version literals outside `collect_targets()`; CI release-gate
  extended with `verify-plugin-locks` + `verify-docs-discipline`
  + launcher build smoke. Reference doc:
  `docs/development/release-automation.md`.

### Changed

- **PDF font-embedding strategy**: `@font-face` rules switched
  from `src: local(...)` (fragile in containers) to `src:
  url(file://...)` pointing at the bundled font files.
  KDP-grade embedded fonts requirement met.
- **Region separator** on `image_top_text_bottom` +
  `image_left_text_right` layouts: 1px opacity-mix border
  replaced by 2px `var(--border-strong)`. Purpose-built theme
  token visible across all 10 theme variants (was nearly
  invisible at low opacities on light themes).
- **Picture-Book font picker** auto-applies the selected font to
  the ENTIRE page (auto-select-all in the dropdown's onChange
  handler). Picture-book convention is one page, one consistent
  font; per-mark override filed as
  `PICTURE-BOOK-FONT-PER-MARK-OVERRIDE-01` (P3) for future.
- **Speech-bubble inline-style** + backend `_speech_bubble_style`
  now emit `width:` AND `height:` properties (was `width:` only).

### Fixed

- **Picture-Book PDF on the 3 new anchor positions**: the
  backend `_speech_bubble_style` positions dict was silently
  missing `top-center`, `middle-left`, `middle-right` (added in
  Finding A's frontend). PDF would have fallen back to
  bottom-center for those 3 anchors. Now mirrored end-to-end.
- **Tier-Property layout JSON leakage**: the textarea on
  speech_bubble + image_full_text_overlay layouts showed raw
  TipTap JSON when switched from a TipTap-rich layout. New
  defensive `extractPlainText` (frontend) + `_extract_plain_text`
  (backend) unwrap the JSON for plain-text display + PDF render.

### Lessons-learned

3 new rules + 1 memory entry filed:

- **Recurring-Component Unification Rule** (coding-standards.md):
  UI patterns shared across 2+ surfaces extract NOW, not after
  3-duplicate threshold; UI duplication compounds visually +
  drives i18n + test churn. Stricter than the generic 3-DRY rule.
- **Single-source-of-truth for cross-cutting concerns**
  (lessons-learned.md): closed-set vs open-set discovery; the
  package-lock.json drift incident as the canonical example.
- **Half-wired-feature-lifecycle pattern**: extended with the
  4th instance (the dead `kinderbuch.css` template).
- **Smoke-findings = direct-action default** (memory): smoke
  findings get fixed in the current session unless the user
  explicitly defers; prior-session roadmap entries do not
  override.

### Verification

Backend pytest 1926 + 1 skipped (`--ignore=mutants`); plugin
pytest 185; Vitest 1555/1555; Playwright smoke spec for
font-selection ships; tsc clean; ruff + mypy clean; pre-commit
clean; `make verify-docs-discipline` clean; `make
verify-plugin-locks` clean; launcher PyInstaller build smoke
passes.

### Deferred to v0.36.0

- **4c-B-1-DOCS**: user-facing help-docs for the entire Picture-
  Book feature stream (docs/help/{en,de}/ pages for picture-
  books, fonts, PDF export, Authors-Database, Categories+BISAC,
  async medium-import). 0 pages currently exist for these
  features; release-workflow.md Step 4c documentation-sweep
  proposal also defers to v0.36.0.
- **4c-B-2 Tier-Property scope**: extended bubble + overlay
  properties (Visual Style + Typography subsections via the
  CollapsibleSection extraction). `PICTURE-BOOK-SPEECH-BUBBLE-
  EXTENDED-PROPERTIES-01` + `PICTURE-BOOK-OVERLAY-TEXT-TIER-
  PROPERTIES-01` remain open.
- **AUTHOR-SELECT-INPUT-EXTRACT + RECURRING-COMPONENT-AUDIT**:
  the Recurring-Component Unification Rule's canonical first
  application + frontend-wide audit for follow-up extractions.
- All dependency major-bump tracks (elevenlabs 2.x, mypy 2.x,
  weasyprint 68, TipTap 3, @types/node 25, @vitejs/plugin-react
  6, tiptap-footnotes 3, click 8.3, starlette 1, cryptography 48).

## [0.34.1] - 2026-05-18

Routine dependency refresh. Pure lock-file refresh; no
`pyproject.toml` / `package.json` edits; no API changes; no
user-visible behavior changes. Closes the dep-refresh track
deliberately deferred from the v0.34.0 release cycle.

### Changed

- Backend deps (via `poetry update <allowlist>` per the
  "never blind bulk apply" discipline; 6 of 9 candidate
  packages moved within existing pin constraints): pip
  26.0.1 → 26.1.1, numpy 2.4.4 → 2.4.5, pandas 3.0.2 →
  3.0.3, requests 2.34.0 → 2.34.2, decorator 5.2.1 →
  5.3.0, librt 0.9.0 → 0.11.0 (mypy transitive).
- Launcher deps: packaging 26.1 → 26.2,
  pyinstaller-hooks-contrib 2026.4 → 2026.5.
- Frontend: dompurify 3.4.3 → 3.4.4 (package.json
  unchanged; `^3.4.0` caret already permitted the patch).

### Deferred

- Backend majors (own tracks): elevenlabs 0.2 → 2.47,
  mypy 1.20 → 2.1, weasyprint 66 → 68 (just landed 66 in
  v0.34.0).
- Backend pin-loosenings: uvicorn 0.46 → 0.47 and
  python-multipart 0.0.27 → 0.0.29 are blocked by the
  caret constraints in `backend/pyproject.toml`. Loosening
  a pin is a separate decision class from a lock-file
  refresh.
- Frontend: TipTap 2 → 3 across ~25 packages (DEP-02),
  @types/node 24 → 25, @vitejs/plugin-react 5 → 6,
  tiptap-footnotes 2 → 3.

### Verification

Backend pytest 1891/1891 + 1 skipped; Vitest 1405/1405;
launcher PyInstaller build successful; `make
verify-plugin-locks` confirmed zero plugin drift (no
plugin pyproject shares any of the bumped packages
directly).

## [0.34.0] - 2026-05-17

The "Picture-Book Phase 4 foundation + Categories/BISAC +
Authors-Database completion + Medium-import v2 preview"
release. Supersedes the pre-drafted v0.33.1
(Comments-Trash recovery + Authors-Database Phase 1) which
was never tagged — its content is fully absorbed below.
~100 commits since v0.33.0.

### Added

- **Picture-Book Phase 4 foundation (PB-PHASE4 Sessions 2–6
  Commit 1).** ``book_type`` discriminator on ``Book``
  (Literal ``"prose"`` | ``"picture_book"``, immutable
  after create) + new ``pages`` table +
  ``/api/books/{id}/pages`` CRUD (list/create/update/delete/
  reorder). Dashboard split-button with "Create Picture-Book"
  affordance. BookEditor ``book_type``-routes picture-books
  into a new three-pane ``PageEditor`` (thumbnails sidebar
  with @dnd-kit drag-reorder + canvas + properties pane).
  Five distinct ``PageLayout`` variants — ``speech_bubble``,
  ``image_top_text_bottom`` (70/30 vertical),
  ``image_left_text_right`` (60/40 horizontal),
  ``image_full_text_overlay``, ``text_only`` — each
  rendering through dedicated CSS-Module classes. Per-page
  ``layout_config`` (JSON column; renamed from the initial
  ``speech_bubble_config`` to generalise) drives
  speech-bubble anchor + opacity + size and image-row
  positioning + fit + split-ratio + text backdrop opacity.
  On-image hover overlay for the image-replace button.
  WeasyPrint ``^66.0`` added to the export plugin + initial
  ``picture_book_pdf`` generator skeleton (route dispatch +
  UI ships in v0.35.0).

- **Books-only Categories + BISAC subject metadata (Bug 9).**
  New ``Book.categories`` (JSON list, KDP-aligned) +
  ``Book.bisac_codes`` (BISAC 9-char codes, regex
  ``^[A-Z]{3}[0-9]{6}$``). Marketing-tab wires both with
  shared ``CategoryInput`` + ``BisacCodeInput`` components.
  KDP plugin metadata-checker extension validates BISAC
  format and warns on missing categories. Documented
  intentional asymmetry vs. Articles (which use ``topic`` +
  ``tags``).

- **Authors-Database (Bug 8 Phase 1 + Phase 2).** New
  standalone ``authors`` table + ``/api/authors`` CRUD + a
  new Settings "Autoren-Datenbank" / "Authors Database" tab
  sibling to the existing personal-identity "Autor" tab.
  Decoupled from existing free-text ``Book.author`` /
  ``Article.author`` columns (no FK, no backfill — opt-in
  suggestion layer). Slug auto-generation handles German +
  Nordic diacritics + general Latin NFKD-fold + emoji
  fallback. Wizard datalist integration on Article-to-Book
  conversion Step-1 author field with multi-article pre-fill
  + add-to-DB checkbox on submit. Coverage: 52 backend
  pytest cases (Phase 1) + Vitest + Playwright smoke.

- **Medium-import v2 preview-table (Phases 1–4).** Upload
  → preview a checkbox table of every detected post →
  uncheck the ones to skip → import the selection. Backend
  preview + selection endpoints, frontend preview-table
  component + v2 state machine, per-post badges (Article /
  Comment / Duplicate / Warnings), 8-language i18n,
  Playwright smoke.

- **Comments trash-lifecycle (Bug 10 fix).** Comments
  shipped soft-delete in v0.32.0 but the counterparts
  (list-trashed, restore, permanent-delete-from-trash,
  empty-trash, bulk-restore) were filed as "v2" in the
  original commit docstring and never picked up.
  Production smoke surfaced 61 user-trashed comments stuck
  in invisible purgatory. Closed with 5 new backend
  endpoints under ``/api/comments/trash/*`` + ``POST
  /api/comments/trash/bulk-restore``; a new view-mode toggle
  on Settings → Comments with badge + per-row Restore +
  Permanent-Delete actions + Empty-Trash CTA + a dedicated
  trash-view bulk-action bar; 22 new backend pytest + 22
  new Vitest + 4 Playwright smoke specs.

### Fixed

- **Categories + BISAC Marketing-tab leak hotfix.** Removed
  ``forceMount`` on the Marketing ``Tabs.Content`` —
  ``forceMount`` actively prevents Radix from applying the
  ``hidden`` attribute on non-active tabs, so the new
  Categories + BISAC panel was rendering on every tab.
  Vitests switched from ``fireEvent.click`` to
  ``fireEvent.mouseDown`` (Radix ``Tabs.Trigger`` uses
  ``onMouseDown`` internally). New tab-content-isolation
  Playwright spec pins the regression.

- **Picture-Book Bug B**: ``image_full_text_overlay`` image
  defaults to ``object-fit: cover`` so the absolutely-
  positioned text band aligns to the visible image edges
  (was letterboxing past container bounds when source
  aspect ratio diverged from 4:3).

- **Picture-Book Bug A + Bug C**: purge ``layout_config``
  on layout switch (Fix A). The flat JSON dict was
  accumulating heterogeneous keys from every layout the
  page had ever worn; switching ``speech_bubble →
  image_full_text_overlay`` left the bubble's ``image_fit:
  "cover"`` co-resident with new keys and cropped the photo
  unexpectedly. Fix B (namespace per layout for
  switch-survival) deferred to 4c-B.

- **Bug 1**: Settings/Help/GetStarted back-button uses
  browser history (not hardcoded ``/``).
- **Bug 3**: independent view-mode defaults for AD-Trash +
  BD-Trash (previously inherited a single default).
- **Bug 4a–c**: Comments-Admin bulk-delete +
  ``CommentPreviewModal`` with click-row-to-open + Reclassify
  refactored to live only in the preview modal + 8-language
  i18n + Playwright smoke.
- **Bug 6**: menu items must not ``preventDefault`` on
  dialog-trigger — let the menu close before the dialog
  mounts; fixed across 6 callsites + Playwright regression
  pin.
- **Bug 7**: mock-contract repair for ``ArticleList`` trash
  view-mode test (new-hook + new-mock-key contract drift).
- **Bug 11**: BookDashboard list-view selection checkboxes
  (parity with Articles list-view; previously the
  bulk-action bar was unreachable in BD list mode).

- **Trash data is retrievable again.** Users who pressed
  "Move to Trash" on comments in v0.32.0 / v0.33.0 will see
  their previously-trashed rows under Settings → Comments →
  Papierkorb / Trash after upgrading.

### Changed

- ``Page.speech_bubble_config`` → ``Page.layout_config``
  (Alembic column rename via ``batch_alter_table``).
- ``image_top_text_bottom`` re-proportioned from initial
  50/50 → 60/40 → final 70/30 (user-feedback iteration on
  picture-book typography).
- Articles-vs-Books parallel-surface asymmetry tally
  promoted to 8 confirmed instances (Bug 10 = #8;
  Bug 4a = #7). Two new entries in the "Documented
  intentional asymmetries" register: Categories+BISAC and
  the Wizard Author-Dropdown — both Books-only by design.

### Lessons learned (3 new rules)

- **"Half-wired feature lifecycle"** extended to cover the
  frontend shape — state-write without state-consumer
  (renderer/reader) is purgatory just like backend
  soft-delete without restore.
- **"Half-wired trash lifecycle"**: soft-delete shipped
  without the restore-surface is data purgatory, not a
  feature. Deferred-half work MUST be filed as a
  load-bearing backlog item with a real ID, not as
  docstring prose. Detection grep:
  ``grep -rnE 'out of scope|v2 ships|deferred to v2'``.
- **"Test-isolation discipline"**: never run integration
  smoke-tests outside pytest. The harness's three-layer
  isolation (``BIBLIOGON_TEST=1``, ``:memory:`` DB URL,
  ``.bibliogon-production`` marker tripwire) only fires
  under pytest. A bare ``poetry run python -c "from
  app.main import app"`` bypasses every guard.

## [0.33.0] - 2026-05-16

The "Article-to-Book + UX-polish" release. Major user-facing
feature (article-to-book conversion wizard) lands alongside a
sustained pass on the v0.32.0 UX-Full-Audit backlog (14 items
closed). Plus a Node-24 GitHub-Actions migration sweep across
every workflow, a mutation-testing scope expansion, several
test-isolation hardenings, and 5 new lessons-learned sections.
~78 commits since v0.32.0.

### Added

- **Article-to-Book conversion feature.** Select multiple articles
  on the Articles dashboard via the bulk-action bar and compile
  them into a brand-new book via a guided 6-step wizard. Original
  articles stay untouched on the dashboard (decoupled lifecycle);
  the book holds an independent TipTap-JSON copy of each
  article's body as a chapter. Steps: (0) Selection with
  drag-reorder + sort dropdown (date asc/desc, title asc/desc,
  manual) + tag-helper buttons that narrow the working set to a
  specific tag; (1) Metadata (title + author required; single-
  article conversions pre-fill subtitle from `Article.subtitle`
  and cover image from `Article.featured_image_url`); (2)
  Front-matter (title page / dedication / introduction,
  skippable); (3) Back-matter (acknowledgments / about-author,
  skippable); (4) Chapter settings (use article title as chapter
  title, on by default); (5) Review + Create. Backend endpoint
  `POST /api/books/from-articles` performs the whole creation
  in one transaction; rollback semantics inherited from the
  existing `/from-template` precedent. Validation gates collect
  ALL offending article ids in one 422 response (trashed,
  non-`"article"` content_type, not-found) so the user fixes the
  whole selection in one pass instead of iterating through
  per-row rejections. Tag aggregation: keywords across all
  selected articles dedupe (case-insensitive) into
  `Book.keywords`; shared `series` value across every selected
  article pre-fills `Book.series`. 37 backend integration tests
  + 12 Vitest specs + 3 Playwright smoke specs + smoke +
  bilingual manual test docs under
  `docs/testing/smoke-tests/article-to-book-conversion*.md`.
  52-key i18n namespace `convert_to_book` lands in all 8
  catalogs (DE + EN native; ES / FR / EL / PT / TR / JA
  passthru per the existing `_meta.pending_namespaces`
  convention). Bilingual help doc at
  `docs/help/{en,de}/articles/convert-to-book.md` covers
  walkthrough + decoupled-lifecycle explanation + known
  limitations + 5-question FAQ. Three deferred follow-ups
  filed: `CONVERT-TO-BOOK-ASSET-CLONE-01` (P3, asset-clone
  walker for embedded images),
  `CONVERT-TO-BOOK-REVERSE-LINK-01` (P5, restore
  `Chapter.source_article_id` column for provenance tracking),
  `CONVERT-TO-BOOK-CHAPTER-TYPE-DETECTION-01` (P5, smart
  chapter_type assignment by title pattern).

- **Success-toast with action CTA** (`notify.successAction`).
  New shared helper + `SuccessActionContent` component in
  `frontend/src/utils/notify.ts` for "X succeeded; here's the
  forward action" toasts. First consumer is the article-to-book
  wizard's "Buch öffnen" / "View book" CTA after a successful
  conversion (10-second autoClose so the user has time to read +
  click). Distinct from the existing `notify.bulkAction` Undo
  helper — semantically forward, not undo. Parameterised testid
  prevents collisions across future successAction call-sites.

- **BookEditor empty-state surface** (`BOOKEDITOR-EMPTY-STATE-01`).
  Books with zero chapters now render an EmptyState with a
  "Create first chapter" CTA matching the ArticleEditor pattern
  (Articles-vs-Books parity per the UX-Full-Audit).

- **View-agnostic `data-{book,article}-id` attributes**
  (`VIEW-MODE-TESTID-PARITY-01`). Both card-view and list-view
  tiles now carry a stable `data-{book,article}-id="<id>"`
  attribute alongside their view-specific testids. E2E specs can
  target either view-mode with one selector, closing the G2-F2
  silent-skip class for both surfaces.

### Changed

- **UX-Full-Audit 2026-05-14/15 closure batch (14 items).** Net
  effect: every actionable P3 finding from the audit's Groups 1-5
  is shipped. Remaining items are trigger-gated P3/P5 backlog
  entries (`COMMENTS-ADMIN-PAGINATION-01`, `I18N-NATIVE-REVIEW-V031-01`,
  etc.) waiting on user signal. Concrete closures this release:
  - `LOADING-INDICATOR-EXTRACT-01` — shared `<LoadingIndicator>`
    component + global `.spin` class fix.
  - `EMPTYSTATE-EXTRACT-01` — shared `<EmptyState>` + 6
    call-sites migrated.
  - `BOOKEDITOR-EMPTY-STATE-01` — BookEditor empty-state UX.
  - `ARTICLEFILTERBAR-EXTRACT-01` — `ArticleFilterBar` moved
    from inline-in-ArticleList.tsx to its own component file.
  - `SETTINGS-INLINE-TABS-EXTRACT-01` — `AppSettings` +
    `AiAssistantSettings` + `TopicsSettings` extracted from the
    Settings monolith.
  - `PLUGIN-SETTINGS-TESTID-COVERAGE-01` — `PluginSettings` +
    `AuthorSettings` extracted with testid coverage.
  - `BOOKEDITOR-TESTIDS-01` — full testid coverage for the
    BookEditor (was 0 testids over 700 LOC pre-audit).
  - `VIEW-MODE-TESTID-PARITY-01` — view-agnostic
    `data-{book,article}-id` attributes (also under Added).
  - `MEDIUM-IMPORT-TESTIDS-01` — result-table count-span testids.
  - `SETTINGS-TABS-TESTID-COMPLETE-01` — 3 of 7 settings tabs
    gained testids; type tightened from `testId?: string` to
    `testId: string`.
  - `SETTINGS-TOPBAR-TESTIDS-01` — back-arrow + Home button
    testids + aria-labels.
  - `THEME-TOKEN-COMPLETENESS-AUDIT-01` — 5 theme-token gaps
    closed across the 111 callsites, audit script added.
  - `NOTIFY-ERROR-APIERROR-COVERAGE-01` — 62 % of `notify.error`
    catch blocks fixed to pass the caught error as the 2nd arg
    so the rich Issue-Melden affordance fires; pre-commit hook
    added (and caught one regression at the end of this cycle).
  - `TEST-ISOLATION-MODULE-STATE-01` — audit script + allowlist
    for in-process module-level mutable state that survives
    test boundaries (lessons-learned promotion of the
    platform_schema LRU cache incident).

- **Mutation-testing scope expansion**
  (commits `c1eea87` / `fd94117` / `0c8d24d`). `import_plugins`
  overrides.py bool-coercion survivors killed; office + wbt
  triage closed; services scope expanded with the
  platform_schema regression fix landing as a paired test-
  isolation hardening (`48d3ffe`).

### Fixed

- **BulkActionBar stale state when a row-delete targets a
  selected item** (`02553fb` + `926decb`, "Bug B" from the
  v0.32.0 cycle). Single-item destructive handlers now call
  `selection.remove(id)` after the API call succeeds and before
  the success notification so the bar's count never references
  an orphan id. 14 Vitest hook tests pin behaviour for both
  `useArticleSelection` and `useBookSelection`; E2E backfill
  added in commit `926decb`.

- **Restore-button "broken" perception lag**
  (`RESTORE-UX-FEEDBACK-01`, was "Bug A" misdiagnosis). The
  Articles-trash restore handler chained two network round-trips
  (`POST .../restore` + `GET /articles`) with synchronous state
  updates between, registering as "feels broken" (419 ms
  click handler). Fix: optimistic update + use the response
  entity directly (`7d68126`). Workbox log-misread was
  recorded as not-a-code-bug (`70406d2`) and promoted to a
  lessons-learned rule.

- **`platform_schema` LRU cache survives test boundaries**
  (`48d3ffe`). Setup-only `cache_clear()` in a fixture left a
  fake schema cached for downstream test files; the publications
  endpoint then served the stale dict to 5 unrelated tests.
  Fix: bidirectional clear (before + after each test). Lessons-
  learned section promoted.

- **`notify.error` 2nd-arg pass-through gaps**
  (`NOTIFY-ERROR-APIERROR-COVERAGE-01`). 62 % of catch sites
  called `notify.error(message)` without forwarding the caught
  error, suppressing the Issue-Melden affordance. Fixed across
  the codebase; pre-commit hook installed to prevent
  regression.

- **Theme-token completeness across 9 palette × mode variants**
  (`THEME-TOKEN-COMPLETENESS-AUDIT-01`). 5 token-vs-palette
  gaps closed; audit script added so future drift surfaces in
  the pre-release sweep.

- **`Settings.tsx` trailing blank line + `ConvertToBookWizard.tsx`
  missing 2nd-arg in `notify.error`** (`0ca8b32`). Caught by the
  pre-commit CI gate during the v0.33.0 release run; both
  trivial; surfaced + closed as a single fix-now commit.

### Internal

- **GitHub Actions Node-24 migration** across every workflow.
  10 action-major bumps applied per the
  `External GitHub Action major-version drift` lessons-learned
  rule (action.yml `runs.using:` declarations as the
  authoritative source, NOT release-note prose):
  `actions/checkout` v4 → v5,
  `actions/setup-python` v5 → v6,
  `actions/setup-node` v4 → v5,
  `actions/upload-artifact` v4 → v5 → v6,
  `actions/cache` v4 → v5,
  `softprops/action-gh-release` v2 → v3,
  GitHub Pages action trio v4 → v5,
  `actions/configure-pages` v5 → v6.
  `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` env-var kept as a
  safety net for any future third-party action lag.
  `GH-ACTIONS-OPTIONAL-BUMPS-01` filed for the two deferred
  bumps (`actions/checkout` v6, `actions/setup-node` v6).

- **5 new lessons-learned sections**:
  1. Multi-tool collaboration tracking (re-sync before
     accepting new orders) — promoted after a planning-vs-repo
     state drift incident.
  2. Workbox "No route found" is benign info, not a bug
     indicator — promoted from the Bug A misdiagnosis.
  3. User-perceived bug ≠ code bug: the perception-lag class
     — promoted with the same trigger.
  4. In-memory caches survive test boundaries — promoted from
     the `platform_schema` LRU regression.
  5. External GitHub Action major-version drift — `action.yml`
     is the authoritative runtime source; release-note prose
     can lie; composite actions need transitivity checks.
  Plus: testid namespace pinning prevents silent E2E skips
  (positive discipline derived from the G2-F2 incident).

- **UX-Full-Audit 2026-05-14/15** documented in 5 group files
  under `docs/audits/` (Core Editors, Dashboards, Settings,
  Cross-Cutting, Synthesis). 23 findings catalogued, 26
  screenshots captured by Aster, 3 supplementary Playwright
  specs landed. Synthesis at
  `docs/audits/ux-full-audit-2026-05-14.md`.

- **12 backlog items filed** with full Trigger / Scope /
  Effort / Defer-reason quadrants:
  `CONVERT-TO-BOOK-ASSET-CLONE-01` (P3),
  `CONVERT-TO-BOOK-REVERSE-LINK-01` (P5),
  `CONVERT-TO-BOOK-CHAPTER-TYPE-DETECTION-01` (P5),
  `COMMENTS-ADMIN-PAGINATION-01` (P3),
  `RESTORE-UX-FEEDBACK-01` (P3, now closed in this release),
  `TEST-ISOLATION-MODULE-STATE-01` (P3, now closed),
  `GH-ACTIONS-OPTIONAL-BUMPS-01` (P5),
  `GH-ACTIONS-PERIODIC-AUDIT-01` (P5),
  `NOTIFY-ERROR-APIERROR-COVERAGE-01` (P3, now closed),
  `THEME-TOKEN-COMPLETENESS-AUDIT-01` (P3, now closed),
  plus 2 from the UX-Full-Audit's trigger-gated tail.

- **v0.32.0 cycle archived** in
  `docs/archive/roadmap/2026-05.md`: Phase B-F mapping
  (planning labels ↔ repo F1/F2a/F2b/F2c/F3) + UX-Full-Audit
  close-out summary + Bug A close-out retrospective. One
  indexed entry per archival day, newest first, per the
  Continuous Archival Rule.

- **`CLAUDE.md` + `architecture.md` theme-count correction**
  (`2608865`) — bumped from "3 themes" prose to the audit-
  recipe-verified actual count (5 palettes × light/dark =
  10 variants; Notebook + Studio were added post the original
  doc and never propagated until the audit caught it).

- **Dependency patches** (this release):
  - Backend: ruff 0.15.12 → 0.15.13, virtualenv 21.3.2 →
    21.3.3, python-discovery 1.2.2 → 1.3.1 (transitive).
  - Frontend: vite 8.0.12 → 8.0.13, dompurify 3.4.2 → 3.4.3,
    lucide-react 1.14.0 → 1.16.0, react-router-dom 7.15.0 →
    7.15.1, @types/node 24.12.2 → 24.12.4. Lockfile-only
    moves (no manifest churn).
  - Deferred per existing backlog: elevenlabs 2.x
    (`ELEVENLABS-SDK-V2-MIGRATION-01`), mypy 2.x
    (`MYPY-V2-MIGRATION-01`), click 8.3 (`CLICK-V8-3-AWAIT-GTTS-01`),
    python-multipart 0.0.28 (paired-plugin-bump), TipTap 3.x
    (`DEP-02`), @types/node 25 + @vitejs/plugin-react 6
    (cascading lessons-learned: tsconfig `lib` alignment
    + Vite/Vitest review).

## [0.32.0] - 2026-05-14

The "UX-polish + safety net" release: three findings from a manual
smoke test of v0.31.0 land as user-facing improvements, plus a
batch of security / dependency / infra hardening that accumulated
between v0.31.0 and today. 21 commits since v0.31.0.

### Added

- **Reciprocal Article ⇄ ArticleComment reclassify endpoints**
  (`F2b`). When the comment-detection heuristic misclassifies (in
  either direction), the user reclassifies via two new endpoints
  that perform a transactional MOVE — the source row is deleted
  in the same commit as the destination row is inserted, so an
  interrupted call leaves both rows OR neither, never a
  half-state. `POST /api/articles/{id}/reclassify-as-comment`
  body `{responds_to_url?, responds_to_article_id?}` returns
  `{success, comment_id, deleted_article_id}`.
  `POST /api/comments/{id}/reclassify-as-article` returns
  `{success, article_id, deleted_comment_id}`. The Comment→Article
  path auto-derives the new article title from the first 200
  chars of body text (word-boundary trim + "..." when truncated;
  "Reclassified comment" fallback for empty body). When the
  comment had a non-`"manual"` `imported_from` AND a
  `canonical_url`, a paired `ArticleImportSource` row is created
  so the "where did this come from?" provenance survives the
  move. Service module
  `backend/app/services/reclassify.py` holds the pure
  field-translation functions; routers stay thin. 14 integration
  tests pin happy path both directions, target linking, external
  URL pointer, 404 on missing source, 400 on missing target
  article (with original untouched), provenance preservation,
  title truncation + empty-body stub, import-source re-creation
  skip for native comments, atomicity, and an
  Article→Comment→Article round-trip that proves `body_json`
  survives the two moves intact.

- **UI actions for reclassify** (`F2c`). Two surfaces:
  - ArticleEditor header kebab menu `(...)` → "Move to
    comments" — confirm dialog spells out the lossy fields
    (title, subtitle, tags, SEO meta, publications, assets),
    on confirm navigates back to `/articles` and surfaces a
    deep-link toast with an "Open Comments admin" action button
    that navigates to `/settings?tab=comments`.
  - Settings → Comments admin per-row "Move to articles"
    button (Lucide `FileText` icon, paired with the existing
    trash icon) — same shape: confirm dialog with body
    preview → on confirm, row drops from the list and a
    deep-link toast offers "View article" that navigates to
    `/articles/{new_id}`.
  Both surfaces use the simple confirm dialog (not
  `TypeToConfirmDialog`) because the move is reversible via
  the reciprocal direction — the heavier pattern would be
  wasted friction. Kebab placement rather than a primary
  toolbar button keeps destructive data-move actions one
  click away from accidental triggering.

- **Toolbar "Copy" split-button** (`F3`). Primary click copies
  the article / chapter body as Markdown (the default, since
  Markdown preserves headings + lists + links + images for
  paste-targets that render it). Chevron disclosure exposes
  "Copy as plain text" for paste-targets that mangle Markdown
  (email, notes, chat). Both modes prepend a document title (+
  optional subtitle) so the paste-target keeps the article
  context, not just the body: Markdown emits
  `# Title\n\n*Subtitle*\n\n{body}`; plain text emits
  `Title\nSubtitle\n\n{body}`. ArticleEditor wires
  `article.title` + `article.subtitle`; BookEditor's existing
  `chapterTitle` flows through automatically via a
  `documentTitle ?? chapterTitle` fallback in Editor's
  Toolbar-props mapping. Plain-text rendering choices: headings
  drop their `#` marker, bold / italic / strike / code marks
  silently stripped, links rendered as `text (url)` so the
  reference survives the paste (with a guard to avoid
  duplicating bare-URL links where text already equals href),
  lists keep their `-` / `1.` prefixes, blockquotes keep their
  `>` prefixes, images become `[Image: alt — caption]` so the
  prose still reads even though the binary content can't paste,
  code blocks become plain text without the fence. The
  TipTap-to-Markdown converter was extracted from Editor.tsx
  into a new shared `utils/tiptap-markdown.ts` module so the
  same code powers both the existing WYSIWYG ↔ Markdown toggle
  and the new Copy action; Editor.tsx's reverse
  `markdownToHtml` stays put (only used internally). 27 tests
  cover both converters end-to-end; 7 tests cover the Toolbar
  Copy button surface.

- **Body size limit middleware**
  (`BodySizeLimitMiddleware`, closes
  `BACKEND-UPLOAD-SIZE-LIMIT-01`). Caps POST / PUT / PATCH
  bodies at 500 MB before any route handler sees the request,
  so the worst-case unauthenticated upload can't exhaust
  memory. Closes the open security gap noted in v0.31.0's
  Medium-import upload-zone helper text (the 200 MB frontend
  guard had no backend twin).

- **Two-tier comment-detection heuristic** (`F2a`). Catches
  longer comment-shaped replies that pass v0.31.0's strict
  500-char gate but still carry a conversational marker. Tier 1
  is unchanged: body_text < 500 chars AND no structural TipTap
  nodes. Tier 2 fires when (a) no article-shape disqualifiers
  (no headings, no code blocks, no images, body_len < 2000)
  AND (b) at least one conversational signal: the first
  paragraph starts with second-person address
  (Your/You/Du/Dein/Deine/Ihre), OR a question mark in the
  first 200 chars of the first paragraph, OR a question mark
  in the last 300 chars of the last paragraph. Lists are
  allowed in tier 2 (comment replies do sometimes contain
  numbered points). Data-validated against the 209-file
  production Medium export:
  v0.31.0 misclassified 8 of 8 detectable comments; v0.32.0
  catches 11/11 — 3 new true-positive detections, 0 false
  positives, 0 lost detections. Audit at
  `docs/archive/audits/medium-comment-heuristic-2026-05-14.md`. An
  earlier v1 multi-signal heuristic that scored 3+ generic
  signals (without requiring a conversational marker) flagged
  a German image-poem as a comment; v2's conversational-marker
  gate excludes that false positive while still catching the
  user-reported edge case ("This is a powerful and unsettling
  reframing..." — a 941-char reply with a closing question
  that tier 1 missed). 10 new tier-2 walker tests.

### Fixed

- **Medium-import Start button stayed enabled after a successful
  import** (`F1`). The page returned to phase `"idle"` but kept
  the selected file in state, so the Start button remained
  enabled with the same ZIP loaded — a second click triggered a
  re-import (backend deduped safely, but the UX read as "did it
  really import?"). The file is now auto-cleared on success;
  the result panel's "Weiteres ZIP importieren" button covers
  the back-to-idle path. Failure paths are unchanged: a failed
  import keeps the file selected so the user can retry without
  re-picking.

- **Medium-import progress UI's "up to one minute" claim was
  false for large archives.** A 500 MB Medium export takes
  substantially longer than 60 s on the same hardware that
  handles a 50 MB archive in under 10 s — the hard time bound
  created a "false-crash" impression for any input that broke
  the promise. All 8 i18n catalogs now frame the wait as
  "larger archives may take longer" without a specific time
  bound. Promoted to a lessons-learned rule
  (`User-facing time estimates must scale with input size or be
  omitted`).

- **BookEditor load effect's promise chain ran twice under
  React StrictMode remount**, occasionally landing a stale book
  on top of a freshly-loaded one. The fix adds a `cancelled`
  flag captured by the effect's cleanup so the in-flight
  promise no-ops when StrictMode tears down its first-pass
  instance.

- **`backup_history.json` lost entries when the JobStore wrote
  from a second worker** (closes
  `BACKUP-HISTORY-SINGLETON-01`). The in-memory list cached the
  state of the first writer; subsequent reads from a second
  process saw the cached list, not the on-disk file. `list()`
  and `add()` now reload from disk on every call. Multi-worker
  uvicorn / gunicorn deployments converge cleanly.

### Changed

- **Frontend Editor `documentTitle` + `documentSubtitle` props.**
  New optional props consumed by the Toolbar Copy action.
  BookEditor's existing `chapterTitle` flows through
  unchanged via a `documentTitle ?? chapterTitle` fallback,
  so the BookEditor wiring is unaltered. ArticleEditor
  passes both `article.title` and `article.subtitle`.

- **User-overlay write path for `settings.py` and
  `plugin-install`.** The remaining two CWD-relative writes
  flagged in v0.31.0's `PROD-WRITES-ARCHITECTURE-01` (P3) now
  resolve via `app.paths.get_data_dir()` and a new
  user-overlay file for hand-edited config. Production Docker
  was never affected; the dev-Docker bind-mount path now
  works without `chmod` workarounds.

### Security

- **Dependency bumps.** Pillow 11.3.0 → 12.2.0 in launcher
  (CVE batch); cryptography 46.0.7 → 48.0.0
  (`CRYPTOGRAPHY-V48-MIGRATION-01` closed). Both upstream
  releases ship the audited CVE patches.

### Internal

- **Mutation testing unblocked.** First successful mutmut run
  on the `app/import_plugins/` audit scope produces a 77.8%
  mutation score (2156 / 2770 mutants killed; clears the
  >= 60% acceptance bar in `quality-checks.md`). Three of the
  four root causes from the v0.31.0 audit ship in
  `2ac3002` + the conftest seeding / sibling symlinks /
  recursion-limit bump / scope narrow in `1569f58`. The
  CI mutation workflow at
  `.github/workflows/mutation-import.yml` had been wired
  for 10 days without ever running successfully; the first
  manual `workflow_dispatch` ran 1m12s and exposed the
  `BadTestExecutionCommandsException` that the fix
  resolves. Promoted to a lessons-learned rule
  (`Operational gaps masquerade as wired infrastructure`).

- **E2E smoke flake unblocks.** Two pre-release smokes
  cleaned up (`aed9544`) ahead of v0.31.0 cut; carried
  forward to v0.32.0's stable baseline.

- **Two new E2E smoke specs.** `e2e/smoke/reclassify.spec.ts`
  pins the Article → Comment and Comment → Article round-trip
  through the kebab and the admin row. `e2e/smoke/copy-toolbar.spec.ts`
  pins the Copy split-button surface and the chevron menu's
  two items. Both written by Claude Code for Aster to run per
  the standing E2E protocol.

## [0.31.0] - 2026-05-13

The "deep features" release: universal AI templates (per-field-class
selection, three workflow modes including external-AI YAML
round-trip), bulk-delete (article + book, no-cap with destructive
type-to-confirm gate + soft-delete Undo toast), Medium HTML archive
importer (10th plugin), Medium comments detection routing, and a
sweep of theme tokens + i18n review-status hardening. 157 commits
since v0.30.0 (2026-05-07). Pre-release audit (verification +
coverage + UX/UI) covered every new surface; the audit reports live
at ``docs/audits/pre-release-{verification,coverage,ux}-2026-05-12.md``.

### Added

- **Universal AI templates** for Articles + Books
  (`UNIVERSAL-AI-TEMPLATE-01` Session 1 + `UNIVERSAL-AI-TEMPLATE-02`
  Session 2). A self-explanatory YAML template format ships with
  three first-class workflows: (A) the built-in AI provider,
  (B) a custom local endpoint (LM Studio / Ollama configured via a
  new "Custom" preset in Settings → AI), and (C) external AI via
  YAML round-trip (export the template, paste into Claude.ai /
  ChatGPT / any LLM playground, upload the filled YAML back).
  Backend: 8 endpoints across `/articles` + `/books`
  (`/ai-template/{export,import,empty}` + `/ai-fill` with
  per-field-class selection) + `/bulk-ai-template/{export,import}`
  + `/bulk-ai-fill/{estimate,start}` with SSE progress. New DB
  columns on Article + Book (`featured_image_prompt`,
  `inline_image_prompts`, `cover_image_prompt`,
  `chapter_summaries`) with a single Alembic revision. Header
  rules embedded inside the YAML itself (the AI reads
  fill-rules + style-rules from the file, not a system prompt)
  so workflow C produces valid output without out-of-band
  instructions. Frontend: `AITemplatePanel` tab in the editor +
  Dashboard "New from template" entry point, `FieldClassDialog`
  for per-field-class selection (cover prompt / SEO / tags /
  excerpt / etc.), `TemplateImportDropZone` for re-import,
  `BulkAiFillJobContext` with a persistent SSE dock (badge +
  expanded modal), bulk AI-fill confirm dialog with per-item
  cost breakdown, live cost projection during a running batch
  (`~$total projected` badge + per-item average pill, hidden
  until first priced response, replaced by the authoritative
  final total on terminal phase). Configurable per-batch caps
  (`ai.bulk.max_ai_fill` / `ai.bulk.max_ai_template`, default 50
  each) in `backend/config/app.yaml`. i18n × 8 catalogs
  (ai_template / bulk_ai_fill namespaces). 178 backend tests
  across the 8-file ai-template package + 78 Vitest tests + 5
  Playwright smoke specs.

- **Bulk-delete for Articles and Books** (`BULK-DELETE-01`). New
  POST `/api/articles/bulk-delete` + POST `/api/books/bulk-delete`
  endpoints accept a list of IDs and a `permanent` flag (`false`
  = move to trash, `true` = hard-delete). Dashboard surfaces:
  per-tile checkboxes + bulk-action-bar select-all (filter-aware)
  + `BookBulkActionBar` / `ArticleBulkActionBar` delete-dropdown
  with two options ("In Papierkorb verschieben" / "Endgültig
  löschen"). Permanent-delete path opens
  `TypeToConfirmDialog` (reusable dialog primitive) with a
  numeric type-to-confirm gate — the user must type the exact
  count to enable the confirm button; the dialog also shows the
  active-filter description so the deleted scope is visible.
  Soft-delete path raises a `notify.bulkAction` toast with an
  Undo button that restores every soft-deleted row. The 200-row
  cap that was copied from `bulk-export` was removed for delete
  (per the new "Bulk-operation limits should be per-operation
  cost-profile" rule in lessons-learned: SQL bulk DELETE is sub-
  second per 1000 rows; the cap was UX-hostile). The
  bulk-delete dropdown trigger stays disabled at count < 2 so
  the single-item delete flow stays on the per-card menu. i18n
  × 8 catalogs (`ui.bulk_delete.*`). A1 Playwright smoke spec
  (`e2e/smoke/bulk-delete.spec.ts`) pins the three guards
  (count=1 fallthrough, soft-delete Undo restore,
  type-to-confirm gate with empty / wrong / correct input).

- **Medium HTML archive importer** (10th plugin,
  `bibliogon-plugin-medium-import`). Imports a Medium HTML
  export ZIP (Settings → "Download your information") and
  produces one Article + one Publication entry + one
  `ArticleImportSource` provenance row per `posts/*.html`. New
  `ArticleImportSource` table mirrors `BookImportSource`. Image
  references (`cdn-images-1.medium.com`) download to local
  `ArticleAsset` storage by default per the data-sovereignty
  design decision (off-by-toggle for users who want CDN URLs).
  Re-imports of the same archive deduplicate against
  `Article.canonical_url`. Bilingual help page at
  `docs/help/{en,de}/import/medium.md`. POST
  `/api/medium-import/import` + dedicated
  `/articles/import/medium` page route (chosen over modal
  because the typical Medium archive runs minutes; per-route
  surface + structured-results table + help-doc deep-link
  all benefit). Frontend: `MediumImportUploadZone`,
  `MediumImportProgress` two-phase indicator,
  `MediumImportResult` collapsible-section panel,
  `MediumImportSettings` save-button form. Auto language
  detection (langdetect-based, no Medium meta hint exists).
  First body image becomes the article's `featured_image_url`
  (off-by-toggle). SEO `seo_description` defaults to the
  Medium subtitle when present. Walker iterates ALL
  `section--body > section-inner` divs (the v0.30.x bug was
  picking only the first, silently truncating 33% of imports).
  TipTap node type is `imageFigure` (matches Bibliogon's
  editor schema; a plain `image` node fails ProseMirror
  validation and breaks the whole doc). 89 backend tests
  (round-trip + walker + bulk endpoint + dedup).

- **Medium comments: detection + routing** (`MEDIUM-COMMENTS-IMPORT-01`).
  Medium's HTML export treats user-written responses (short
  reply-shaped notes to other articles) as standalone HTML
  files indistinguishable from articles at the file level.
  The walker now runs a heuristic (body < 500 chars AND no
  structural elements — heading / codeBlock / bulletList /
  orderedList / imageFigure) and routes detected comments to
  a new `article_comments` table instead of polluting the
  article dashboard. Three modes (`import_comments_mode`):
  `as_comments` (default), `as_articles` (legacy v0.30.0
  behaviour), `skip`. Two orphan-handling modes
  (`orphan_comment_handling`): `store` (default; Medium
  comments are always orphans because the export carries no
  parent-article reference at all), `skip`. Two new API
  endpoints in core: `GET /api/articles/{id}/comments` and
  `GET /api/comments` (admin, with `imported_from` +
  `orphans_only` filters + soft-delete via DELETE).
  `responds_to_article_id` FK uses `ON DELETE SET NULL` so
  deleting an article preserves its comments as orphans for
  later re-linkage. Pre-inspection audit on the user's
  209-file Medium export refined the spec's heuristic (the
  original empty-subtitle criterion was dropped after
  finding 2 false negatives caused by Medium auto-filling
  the subtitle from the reply body); detection lifted from
  6/209 to 8/209 with zero new false positives. +30 backend
  tests + 15 plugin tests. Bilingual help-doc update under
  `docs/help/{en,de}/import/medium.md`.

- **Medium comments: editor + dashboard + admin surfaces**
  (`MEDIUM-COMMENTS-UI-01`). Three frontend surfaces make the
  comments data layer visible: (1) read-only
  `ArticleCommentsPanel` in the editor sidebar (plain-text
  body with `white-space: pre-wrap`; loading invisible, empty
  state explicit, error banner on failure), (2) Lucide
  MessageSquare count badge on `ArticleCard` AND in the
  article list view when `Article.comments_count > 0` (new
  computed field on `ArticleOut`; shared `CommentsCountBadge`
  component), (3) Settings "comments" tab between Plugins and
  Support with source filter (Any / Medium / WordPress /
  Hashnode), orphans-only checkbox, paginated table (Author
  / Body / Source / Status / Imported), "Load more" up to the
  500 backend cap, and per-row simple-confirm delete
  (optimistic row removal + success toast). i18n × 8 catalogs.

- **TypeToConfirmDialog**: reusable destructive-confirm primitive
  with a numeric type-to-confirm gate. Built around the rule
  "force the user to LOOK at the count, which combined with the
  filter-description text gives a real sanity check". Numeric
  strategy chosen over a localized confirm-word so translation
  maintenance is zero and the dialog works on every keyboard
  layout (no Greek / Japanese typing friction). Test IDs
  (`type-to-confirm-dialog/input/confirm/cancel/error`) pinned
  in 18 Vitest tests + the A1 bulk-delete Playwright spec.

- **Theme tokens**: 4 new CSS variables defined across all 6
  palette / dark-mode combinations in
  `frontend/src/styles/global.css`. `--surface-2` (soft alternate
  surface one step deeper than `--bg-card`), `--danger-bg` (pale
  tint of `--danger` for warning regions), `--success` /
  `--warning` (status glyph colors for done / skipped
  indicators). The D3 pre-release UX audit caught 9 new
  components referencing these tokens with hex fallbacks; every
  consumer was silently falling through to its light-mode hex
  fallback under Cool Modern / Nord / Classic / Studio /
  Notebook themes. Defining the tokens completes the
  "All styles MUST work through CSS variables" architecture
  rule for the v0.31.0 surface.

- **A1 Bulk-delete E2E smoke spec**
  (`e2e/smoke/bulk-delete.spec.ts`, 203 lines). Closes the
  critical gap identified by the v0.31.0 pre-release coverage
  audit. Three tests pinning the data-destructive guards:
  count=1 dropdown disabled + dropdown content stays hidden;
  soft-delete + Undo restore (verifying trash list before /
  after Undo); permanent delete type-to-confirm gate
  (disabled-when-empty → disabled+error on wrong count →
  enabled on correct count → all rows gone with empty trash
  list confirming permanent path skips trash). Books used over
  Articles because the surface is structurally identical
  (same dialog + same toast) but Books carry the larger UX
  shell (Dashboard + tile checkboxes + dual AI + delete
  dropdown bars).

### Changed

- **i18n review-status markers in 6 catalogs** (es, fr, el, pt,
  tr, ja). Three v0.31.0 namespaces (`ai_template`,
  `bulk_ai_fill`, `comments`) ship passthru-English in those
  catalogs; translations were deferred to ship v0.31.0 on
  schedule rather than holding the release on six native-speaker
  contacts. Each affected catalog now carries a top-level
  `_meta:` block (`review_status`, `translator`,
  `translation_date`, `reference_lang`, explicit
  `pending_namespaces` list) following the launcher precedent
  (`LAUNCHER-I18N-NATIVE-REVIEW-01`). Parity test updated to
  ignore the top-level `_meta` block AND enforce the marker's
  documented shape; `en.yaml` / `de.yaml` must NOT carry it.
  Companion docs file at `backend/config/i18n/REVIEW_STATUS.md`
  explains the marker + the PR-based correction workflow.
  Follow-up `I18N-NATIVE-REVIEW-V031-01` (P3) tracks the
  native-speaker pass.

- **CI hardening pass** (test-infrastructure audit
  2026-05-12). Poetry virtualenv cache on the backend test
  job, lint-and-type-check job, and the 9-job plugin matrix
  (~30-60s expected steady-state savings per push once
  caches warm). ``fail-fast: false`` on ``ci.yml``'s plugin
  matrix for parity with ``coverage.yml``. Per-job
  ``timeout-minutes`` caps (15m / 10m) guard against hung
  jobs. Backend test job switched from ``pytest -v`` to
  ``-q``. All 8 workflows opt into Node 24 runtime via
  ``FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"`` ahead of
  GitHub's June 2nd 2026 forced-default + September 16th
  2026 Node-20 removal. ``.claude/scheduled_tasks.lock``
  removed from tracking (per-session runtime artifact that
  was turning CI red on every push). Audit report at
  ``docs/test-infrastructure-audit.md``.

- **Bulk-delete cap removed**: `MAX_BULK_DELETE = 200` deleted
  from `backend/app/routers/bulk_delete.py`. The Pydantic
  schema still rejects empty payloads (`min_length=1`) but
  drops `max_length`. SQL bulk DELETE is sub-second on
  thousands of rows; the cap was UX-hostile when "Select all"
  with 209 imported Medium articles tripped both Export AND
  Delete. Reasoning documented in lessons-learned
  ("Bulk-operation limits should be per-operation cost-
  profile").

### Fixed

- **Path isolation: `backup_history.json` + `plugins/installed/`**
  now resolve via `app.paths.get_data_dir()` per the explicit
  "Filesystem isolation: production data lives outside the
  project tree" rule. Both previously used CWD-relative or
  `BASE_DIR`-relative paths (`"config/backup_history.json"` and
  `BASE_DIR / "plugins" / "installed"`), which crashed in
  dev-docker (`PermissionError`) because the bind-mounted
  project tree inherits the host's UID instead of the
  container's `bibliogon` user. Production Docker (named volume
  + `chown -R bibliogon`) was never affected, so this is
  defense-in-depth aligned with the architecture rule rather
  than a production data-loss bug. Migration auto-moves the
  legacy locations on first boot for users who developed
  outside Docker before v0.31.0. The broader pattern (10+
  similar writes in `settings.py`) is filed as
  `PROD-WRITES-ARCHITECTURE-01` (P3).

- **`__version__` literal drift in medium-import plugin**: the
  scaffold shipped with `__version__ = "1.0.0"` hardcoded in
  `bibliogon_medium_import/__init__.py`, which failed
  `make sync-versions-check` against the canonical 0.30.0 +
  would have rejected the v0.31.0 tag push at the
  release-gate. Replaced with the
  `importlib.metadata.version(...)` pattern already used by
  `plugin-git-sync` so the value cannot drift from the
  packaging metadata.

- **mkdocs.yml nav out of sync with `_meta.yaml`**: the new AI
  Templates help-section was declared in
  `docs/help/_meta.yaml` and the EN + DE Markdown files
  existed under `docs/help/{en,de}/ai/ai-templates.md` but
  `mkdocs.yml` was not regenerated. `make sync-mkdocs-nav`
  closes the loop; the existing pre-tag chain
  (`make verify-docs-discipline`) catches the regression
  going forward.

- **Plugin-load diagnostic logging silenced by Alembic.** Every
  `logger.info(...)` from `app.main` after `init_db()` was being
  dropped by Python's `logging.config.fileConfig` invocation in
  `migrations/env.py`. Default behaviour is `disable_existing_
  loggers=True` AND root-logger level reset to whatever
  `alembic.ini`'s `[logger_root]` says (WARNING in this repo).
  Result: users observed "no plugin loading messages, only
  alembic" because the alembic config was the only logging
  source still alive. Fix: `migrations/env.py` skips
  `fileConfig` when the root logger already has handlers
  attached - i.e. when the FastAPI app has already configured
  logging via uvicorn / basicConfig. The standalone `alembic`
  CLI path (no handlers attached at env.py time) is
  untouched.

  As part of the fix, three diagnostic helpers landed in
  `app.main`: `_discovered_entry_points`,
  `_enabled_plugins_from_config`, and
  `_log_plugin_diagnostics_pre`/`_post`. Startup now emits
  `Plugin discovery: <N> entry points found ...`,
  `Plugins enabled in config (<N>): ...`, and
  `Plugins loaded (<active>/<enabled>): ...` plus WARNING-level
  lines for `pluginforge.PluginManager.get_load_errors()` and
  for the diff between enabled-in-config and actually-active
  plugins (with a rebuild hint pointing at the most common
  failure mode). 7 regression tests pin the log shape.

- **Medium-import plugin config file at the wrong path.**
  Plugin settings (`download_images`,
  `image_download_timeout_seconds`,
  `skip_existing_canonical_urls`, `default_status`) were
  silently replaced by an empty dict at startup because the
  YAML lived under `plugins/bibliogon-plugin-medium-import/
  config/` instead of `backend/config/plugins/`. Fix: place the
  YAML in the canonical backend location PluginForge actually
  reads.

- **`BulkAiFillDock` hardcoded status hex colors** swapped for
  `var(--success, …)` / `var(--warning, …)` theme tokens. Three
  literal hex values (`#16a34a`, `#a16207` x2) violated the
  "No Tailwind. Custom properties in
  frontend/src/styles/global.css" architecture rule.

- **MediumImportPage Home icon button**: added `aria-label`
  (using the same i18n key as the existing `title` attribute,
  so all 8 catalogs already cover it) and `data-testid` for
  E2E hooks. Icon-only buttons require either of the two per
  the coding-standards rule + the ai-workflow E2E selector
  rule; the button had `title` only.

### Added

- **Medium comments: editor + dashboard + admin surfaces**
  (`MEDIUM-COMMENTS-UI-01`). Three frontend surfaces make the
  comments data layer from MEDIUM-COMMENTS-IMPORT-01 visible
  to users: (1) a read-only `ArticleCommentsPanel` in the
  editor sidebar (plain-text body with `white-space: pre-wrap`;
  loading is invisible, empty state explicit, error banner on
  failure), (2) a Lucide-MessageSquare count badge on
  `ArticleCard` when `Article.comments_count > 0` (new
  computed field on `ArticleOut`), (3) a Settings "comments"
  tab between Plugins and Support with source filter
  (Any / Medium / WordPress / Hashnode), orphans-only
  checkbox, paginated table (Author / Body / Source / Status /
  Imported), "Load more" up to the 500 backend cap, and a
  per-row simple-confirm delete (optimistic row removal +
  success toast, row preserved + error toast on failure).
  i18n × 8 catalogs (native de + en, English literals carried
  to el / es / fr / ja / pt / tr). No new backend endpoints;
  the only backend change is the `comments_count` computed
  field on `ArticleOut` (same precedent as
  `original_published_at`). +3 backend + ~37 frontend tests.

- **Medium comments: detection + storage** (`MEDIUM-COMMENTS-IMPORT-01`).
  Medium's HTML export treats user-written responses (short
  reply-shaped notes to other articles) as standalone HTML
  files indistinguishable from articles at the file level.
  The walker now runs a heuristic (body < 500 chars AND no
  structural elements — heading / codeBlock / bulletList /
  orderedList / imageFigure) and routes detected comments to
  a new `article_comments` table instead of polluting the
  article dashboard. Three modes (`import_comments_mode`):
  `as_comments` (default), `as_articles` (legacy v0.30.0
  behaviour), `skip`. Two orphan-handling modes
  (`orphan_comment_handling`): `store` (default; Medium
  comments are always orphans because the export carries no
  parent-article reference at all), `skip`. Two new API
  endpoints in core: `GET /api/articles/{id}/comments` and
  `GET /api/comments` (admin, with `imported_from` +
  `orphans_only` filters + soft-delete via DELETE).
  `responds_to_article_id` FK uses `ON DELETE SET NULL` so
  deleting an article preserves its comments as orphans for
  later re-linkage. Pre-inspection audit on the user's
  209-file Medium export refined the spec's heuristic (the
  original empty-subtitle criterion was dropped after
  finding 2 false negatives caused by Medium auto-filling
  the subtitle from the reply body); detection lifted from
  6/209 to 8/209 with zero new false positives. +30 backend
  tests + 15 plugin tests. Bilingual help-doc update under
  `docs/help/{en,de}/import/medium.md`. Editor-side surface
  deferred to follow-up `MEDIUM-COMMENTS-UI-01` (P2).

- **Configurable per-batch caps for bulk AI operations**
  (`AI-FILL-CAP-CONFIG-01`, promoted from P5). New
  `ai.bulk.max_ai_fill` (default 50) and
  `ai.bulk.max_ai_template` (default 50) keys in
  `backend/config/app.yaml` raise the previously-hardcoded
  caps on `/articles|books/bulk-ai-fill/{estimate,start}` and
  `/articles|books/bulk-ai-template/{export,import}`. Power
  users no longer need a fork. Edits take effect on the next
  request (no restart). Non-int / zero / negative / None
  values fall back to the documented defaults via a coerce
  helper so a YAML typo can't silently shrink the cap. Hard
  enforcement moved from a Pydantic field-level constraint
  to a handler-side check that surfaces the active cap in the
  error detail (`cap is N`, or `ZIP contains M templates;
  cap is N`). +18 backend tests pin the helper math (12 in
  the new `test_bulk_ai_caps.py`) and the runtime-config
  end-to-end behaviour (+2 in `test_ai_template_bulk_fill.py`,
  +3 in `test_ai_template_bulk.py`).

- **Bulk AI-fill: live cost projection in the dock**
  (`BULK-AI-FILL-LIVE-COST-01`, promoted from P5). While a
  bulk AI-fill job is running, the minimized dock badge shows
  a small "~${total} projected" caption derived from the
  running average of the priced per-item responses. The
  expanded modal totals strip gains two new pills, "Per item:
  ~${avg}" and "Projected: ~${total}". Both surfaces are
  hidden until the first priced `item_done` event lands and
  on transition to a terminal phase (where the authoritative
  final `Cost:` row replaces the projection). Items whose
  model is not in the pricing table (`cost_usd: null`) are
  excluded from the priced average so they don't poison the
  projection. i18n × 8 in parity, native German +
  English wording; +7 frontend tests pin the projection math
  and visibility gates.

- **Medium archive import** (`bibliogon-plugin-medium-import`,
  10th plugin). Imports a Medium HTML export ZIP and produces
  one Article + one Publication entry + one
  ArticleImportSource provenance row per `posts/*.html`. New
  `ArticleImportSource` table mirrors `BookImportSource`. Image
  references (`cdn-images-1.medium.com`) are downloaded to local
  `ArticleAsset` storage by default per the data-sovereignty
  design decision. Re-imports of the same archive are
  deduplicated against `Article.canonical_url`. Bilingual help
  page at `docs/help/{en,de}/import/medium.md`. POST
  `/api/medium-import/import`. v2 follow-ups
  (`MEDIUM-IMPORT-V2-01` dry-run preview UI,
  `MEDIUM-IMPORT-V2-02` AI tag inference) are recorded in
  `docs/backlog.md` under P2.

### Fixed

- **Plugin-load diagnostic logging silenced by Alembic.** Every
  `logger.info(...)` from `app.main` after `init_db()` was being
  dropped by Python's `logging.config.fileConfig` invocation in
  `migrations/env.py`. Default behaviour is `disable_existing_
  loggers=True` AND root-logger level reset to whatever
  `alembic.ini`'s `[logger_root]` says (WARNING in this repo).
  Result: users observed "no plugin loading messages, only
  alembic" because the alembic config was the only logging
  source still alive. Fix: `migrations/env.py` skips
  `fileConfig` when the root logger already has handlers
  attached - i.e. when the FastAPI app has already configured
  logging via uvicorn / basicConfig. The standalone `alembic`
  CLI path (no handlers attached at env.py time) is
  untouched.

  As part of the fix, three diagnostic helpers landed in
  `app.main`: `_discovered_entry_points`,
  `_enabled_plugins_from_config`, and
  `_log_plugin_diagnostics_pre`/`_post`. Startup now emits
  `Plugin discovery: <N> entry points found ...`,
  `Plugins enabled in config (<N>): ...`, and
  `Plugins loaded (<active>/<enabled>): ...` plus WARNING-level
  lines for `pluginforge.PluginManager.get_load_errors()` and
  for the diff between enabled-in-config and actually-active
  plugins (with a rebuild hint pointing at the most common
  failure mode). 7 regression tests pin the log shape.

- **Medium-import plugin config file at the wrong path.**
  Plugin settings (`download_images`,
  `image_download_timeout_seconds`,
  `skip_existing_canonical_urls`, `default_status`) were
  silently replaced by an empty dict at startup because the
  YAML lived under `plugins/bibliogon-plugin-medium-import/
  config/` instead of `backend/config/plugins/`. Fix: place the
  YAML in the canonical backend location PluginForge actually
  reads.

## [0.30.0] - 2026-05-07

Launcher localized in 8 languages (en/de/el/es/fr/pt/tr/ja) with
full parity-test enforcement, the `BIBLIOGON_DB_PATH` deprecation
cycle closes (warning v0.27.0 → precedence flip v0.28.0 → full
removal in this release), 5 new bilingual core help pages expand
the public docs site to cover architecture / contributing /
deployment / API reference / cross-platform installers / books
bulk-export, and the plugin dev guide refreshes for Vite 8 +
Node 24.

### Action required

**If you have `BIBLIOGON_DB_PATH` set in your environment
(uncommon):** the variable is no longer honoured as a path
override (DEP-DBPATH-01 step 3, the final step of the cycle that
began in v0.27.0). The database location is now determined by
`BIBLIOGON_DATA_DIR` or the platformdirs default. If
`BIBLIOGON_DB_PATH` is still set when Bibliogon starts, a single
warning is logged at startup naming the ignored value, but the
variable has no effect. Action: remove `BIBLIOGON_DB_PATH` from
your environment; if you intended the database to live at a
non-default path, set `BIBLIOGON_DATA_DIR=<parent>` instead — the
database resolves to `<BIBLIOGON_DATA_DIR>/bibliogon.db`. Default
Docker setups (which set only `BIBLIOGON_DATA_DIR=/app/data`) and
standard launcher installs are unaffected. The startup warning
will be removed in a later release once existing deployments have
migrated.

**Launcher localized in 8 languages.** The launcher's i18n
catalog grew from 2 languages (en/de) to 8
(en/de/el/es/fr/pt/tr/ja). The OS-locale resolver in
`_current_lang()` was expanded from a hardcoded de-or-en branch
to a prefix-matching loop over all 8 supported languages: locale
codes `de_DE` / `de_AT` / `de_CH` all resolve to `de`, `pt_BR`
and `pt_PT` both resolve to `pt`, `ja_JP` resolves to `ja`, with
`en` as the default fallback. The Settings dialog language
dropdown gains six new native-name labels (Ελληνικά, Español,
Français, 日本語, Português, Türkçe). Three of the six new
catalogs (Greek, French, Spanish) are user-validated; the other
three (Portuguese, Turkish, Japanese) ship with an explicit
`_meta.review_status: "pending native speaker"` block and are
best-effort translations awaiting native-speaker review. The
marker mechanism is documented in
`launcher/bibliogon_launcher/locales/REVIEW_STATUS.md` and
machine-enforced by 31 new launcher i18n parity tests (key
parity, non-empty values, placeholder parity, marker contracts
both directions). User self-validation of the el/es/fr catalogs
surfaced four register / idiom corrections: Greek `containers`
(Latin) → `κοντέινερ` and `φυλλομετρητής` (formal) → `πρόγραμμα
περιήγησης`; French `Compris, continuer` → `J'ai compris`;
Spanish `Internet` → `internet` (RAE 2014+).

**`BIBLIOGON_DB_PATH` deprecation cycle closes.** Step 3 of
DEP-DBPATH-01 lands in this release: the resolver no longer
reads `BIBLIOGON_DB_PATH` for path resolution. The priority
chain collapses to `BIBLIOGON_TEST` → `DATABASE_URL` →
`BIBLIOGON_DATA_DIR` → platformdirs default. If
`BIBLIOGON_DB_PATH` is still in env, a single warning at startup
names the ignored value so the user can see it has no effect.
The 4 user-facing docs that listed the variable
(`README.md`, `README-de.md`, the bilingual deployment guide)
keep the row for one release marked **Removed in v0.30.0** with
the full timeline.

**MkDocs public site expanded.** Five new bilingual core pages
address gaps that had accumulated through v0.27.0–v0.29.0.
`developers/architecture.md` distills
`.claude/rules/architecture.md` into a public-reader view (four-
layer model, plugin structure, error-handling chain, persistence
+ tripwire model, lock-step versioning, offline guarantees).
`developers/contributing.md` is the public version of the
internal contributor rules. `developers/deployment.md` covers
operator-side production: two-container Docker topology, env-var
reference grounded in `docker-compose.prod.yml`, named-volume
persistence + tar-based backup recipe, reverse-proxy + CORS
notes, update flow with the lock-step-versioning + Alembic
migration patterns. `developers/api-reference.md` is a thin
pointer page to the runtime FastAPI `/api/docs` +
`/api/openapi.json` + `/api/health` endpoints with the threat
model spelled out. `books/bulk-export.md` mirrors the existing
`articles/bulk-export.md` shape but documents the books-specific
behavior (3 formats vs 4, ZIP-only by design, 200-book hard
limit). `install/cross-platform-installers.md` documents the
four-way installer matrix (`install.sh` / `install.ps1` /
`install.command` / `install.cmd`) shipped in v0.28.0 including
the unsigned-binary Gatekeeper / SmartScreen behavior. The
existing plugin dev guide (`developers/plugins.md`) was
refreshed for the v0.29.0 frontend stack (Vite 7 → Vite 8 with
the Rolldown bundler, Node 24, `@types/node` ^24 + tsconfig
ES2022).

**Documentation drift sweep.** Outdated version references
across the docs corrected: README en + de updated to current
version, README-de.md ASCII transliterations converted to real
umlauts via `scripts/replace_umlauts.py` (~50 sites; 26 new
entries added to `KNOWN_WORDS`, 13 to `NOT_TRANSLITERATIONS`),
`docs/testing/tester-onboarding.md` Node 20.19+ requirement
bumped to Node 24 + the v0.25.0+ platformdirs DB-path migration
documented, test baselines refreshed to v0.29.0 numbers,
`mkdocs.yml` orphan-page nav entries wired (the
`articles/bulk-export.md` and `install/docker-desktop.md` pages
had been silently unreachable from the public docs site since
v0.27.0 / v0.28.0).

### Internal

- DEP-DBPATH-01 step 3 implementation: `_resolve_database_url`
  priority chain collapses from 5 levels to 4. Two
  `BIBLIOGON_DB_PATH` branches removed; a single warning fires
  when DB_PATH is in env regardless of DATA_DIR state. Path
  resolution always goes through `app.paths.get_db_path()`.
  `test_database_url_resolution.py` rewritten: 6 tests covering
  the new behavior, all green.
- Launcher resolver expansion: `_OS_LOCALE_PREFIXES` tuple
  covers all 8 supported languages with prefix matching.
  Settings dialog `language_label_keys` map expanded from 2 to
  8 entries with native-name self-labels.
- Per-language i18n commits: 6 commits, one per language,
  independently revertable. Each catalog is 95 user-facing keys
  plus an optional `_meta` block for pending-review languages.
- Launcher i18n parity test (`test_i18n_parity.py`): 31 new
  tests. Three contracts (key parity, non-empty values,
  placeholder parity), two marker-contract tests, two sanity
  guards. Combined with the 18 existing
  `test_i18n_and_welcome` tests, total launcher i18n coverage
  is 49 tests.
- Pre-v0.30.0 dependency sweep: 3 separate commits per the
  "discrete commit, not release blocker" pattern. Backend +
  10 plugins (fastapi 0.135 → 0.136 lock-step across 11
  pyprojects, uvicorn 0.44 → 0.46, python-multipart 0.0.26 →
  0.0.27, ruamel-yaml 0.18 → 0.19, plus `poetry update`
  in-range patches). Frontend (in-range only via `npm
  update`: dompurify, jsdom, lucide-react, react, react-dom,
  react-router-dom, vite, xstate). Launcher (pyinstaller
  6.19 → 6.20, in-range). Deferred per the "major bumps get
  their own dedicated session" rule: cryptography 46 → 48,
  elevenlabs 0.2 → 2.x (DEP-05 blocked on paid API), mypy
  1.20 → 2.0, pillow 11 → 12 in launcher, `@types/node` ^24
  → ^25, `@vitejs/plugin-react` 5 → 6, all `@tiptap/*` 2.27
  → 3.22 (DEP-02 blocked).
- Pre-v0.30.0 retrospective:
  `docs/archive/journal/retrospective-pre-v0.30.0.md` covers the
  v0.27.0 → HEAD period (4 calendar days, 3 tagged releases,
  48 commits) in 6 sections. Five concrete commitments for
  v0.30.0+ each with what / why / how-enforced /
  failure-mode-if-abandoned.
- Tests: backend 1278 → 1299 (+21); frontend 688 → 712
  (+24); launcher 147 → 196 (+49: i18n parity tests
  dominate); smoke Playwright 188 → 191 (+3 from bulk-export
  specs). Total: 117 new tests across the period.
- Backlog deltas: 7 P3/P4/P5 items shipped including
  DEP-DBPATH-01 cycle complete, AR-BULK-BOOKS-PARITY-01,
  AR-BULK-PLAYWRIGHT-SMOKE-01, D-06 cross-platform installer,
  LAUNCHER-I18N-EXTRACT-01, "Launcher localization beyond
  EN/DE"; DEP-09 + SEC-01 archived earlier in the period.
  New: `LAUNCHER-I18N-NATIVE-REVIEW-01` (P5) tracking
  native-speaker review of pt/tr/ja.

### Known limitations

`install.command`, `install.ps1`, and `install.cmd` still ship
without fresh-machine validation. The unsigned-binary warnings
(Gatekeeper on macOS, SmartScreen on Windows) are documented
inline.

The TipTap 2 → 3 migration (DEP-02) remains BLOCKED on upstream
`@sereneinserenade/tiptap-search-and-replace@0.2.0`. Next
re-audit 2026-06-02. Path B (the `prosemirror-search` adapter,
~50-80 LOC) is the alternative unblock and has not been
authorized.

The pt / tr / ja launcher i18n catalogs ship with
`_meta.review_status: "pending native speaker"` markers.
Native-speaker outreach is out-of-band; corrections land via PR
(see `launcher/bibliogon_launcher/locales/REVIEW_STATUS.md`).

## [0.29.0] - 2026-05-07

Frontend toolchain modernized to Vite 8 and `@types/node` 24, the
four high-severity dev-only audit findings cleared via
`vite-plugin-pwa@1.3.0` plus a `uuid` pin, and a focused
audit-driven sweep closed every P1 coding-standards violation
surfaced at HEAD `5671cde`. No user-facing behavior change; no
breaking changes; no env-var deprecations this cycle.

**Frontend toolchain modernized.** Vite 7 → Vite 8 (DEP-09) and
`vite-plugin-pwa` 0.21 → 1.3 (SEC-01) landed in the same step,
both unblocked upstream by `vite-plugin-pwa@1.3.0`
(published 2026-05-06) listing Vite 8 in its peer-dep range.
`vite.config.ts` was updated for Vite 8 / Rolldown:
`manualChunks` migrated from the object form to the function
form (Rolldown only accepts functions), with absolute-path
`id.includes('/node_modules/${pkg}/')` matchers using a trailing
slash to prevent prefix collisions (`react` vs `react-dom` vs
`react-router-dom`). The matching-pattern lesson is captured in
`lessons-learned.md` so the next major Vite bump does not
re-learn it from a build failure. No source code changes were
required; runtime is Node 24 / modern browsers as before.

**Security hardening.** `uuid` pinned to `^11.1.1` to clear
`GHSA-w5hq-g745-h8pq`. Combined with the SEC-01 dev-only chain
that the Vite 8 upgrade closed
(`workbox-build` → `@rollup/plugin-terser` → `serialize-javascript`:
GHSA-5c6j-r48x-rmvq RCE + GHSA-qj8w-gfj5-8c6v DoS),
`npm audit --audit-level=high` now reports zero high-or-above
vulnerabilities across the frontend dependency tree.

**Coding-standards cleanup (5 P1 audit findings closed).** A
systematic audit run at HEAD `5671cde` flagged five P1 violations
of the documented frontend coding standards in `code-hygiene.md`
and `architecture.md`. All five are resolved in this release: the
native browser `confirm()` dialog was replaced by the `AppDialog`
`useDialog` primitive at three sites — `SshKeySection`
overwrite-confirm and delete-confirm, plus `GitBackupDialog`
accept-local force-push confirm — using the `"danger"` variant
for the destructive operations; the bare
`fetch("/api/ai/test-connection")` was replaced by
`api.ai.testConnection()` at two sites — `AiSetupWizard` (with
one new `onError`-path test asserting the consolidated client
surface) and `Settings` (rewritten to consume the typed
`AiTestConnectionResult` shape and translate via the existing
`t("ai.error_<key>")` lookup, retiring the inline 22-line
shape-decoder block). The new client method consolidates the
GET endpoint into a single typed namespace per the architecture
rule "API calls ONLY through `frontend/src/api/client.ts`". The
pre-existing `versionCheck.ts` deliberate fail-open carve-out is
documented in code and intentionally out of scope (P2).

**Toolchain alignment.** `@types/node` bumped from `^22` to `^24`
to match the project's `engines.node >=24.0.0` declaration and
the CI runtime. The bump cascaded into a `tsconfig.json` `target`
and `lib` raise from `ES2020` to `ES2022` because
`@types/node@24` correctly stops polyfilling
`Array.prototype.at()` and other ES2022 stdlib globals (the
older types shipped them under `ES2020` as a convenience that is
no longer load-bearing). `Array.prototype.at(-1)` typing in
`PreviewPanel.test.tsx` resolves cleanly under the new target
with zero call-site changes; `error.cause` typing on standard
`Error` instances also flows correctly. The cascade pattern is
captured in `lessons-learned.md` so future `@types/node` major
bumps treat the lib alignment as paired work, not a separate
followup.

### Internal

- README `Current version` line corrected from `v0.26.6` to
  `v0.28.0` (missed at both the v0.27.0 and v0.28.0 release
  commits).
- Two TipTap command callbacks in `StyleCheckExtension.ts` carry
  inline `// any: TipTap command callback shape, no exported
  CommandProps type for the v2 API.` justifications next to the
  existing `eslint-disable` line per the coding-standards rule
  "no `any` without inline justification".
- `GetStarted.module.css` `.indicatorDone` dropped a hardcoded
  `#fff` for `var(--text-inverse)`, the semantic CSS variable
  defined across all six theme variants in `global.css`.
- `docs/backlog.md` last-updated note tightened to reflect the
  current main state (DEP-09 + SEC-01 archived in commit
  `93a5ed3`, no longer "awaiting next-release archive"). The
  Maintenance / hygiene section gained a pointer to
  `.claude/prompts/audit.md` per the `ai-workflow.md` "Test
  coverage audits — When to run" rhythm so the quarterly
  systematic-audit prompt is discoverable from active docs, not
  just the prompts directory.
- New `api.ai.testConnection(): Promise<AiTestConnectionResult>`
  namespace method in `frontend/src/api/client.ts`. The
  `AiTestConnectionResult` type carries the three fields the
  existing `GET /api/ai/test-connection` route returns
  (`success`, `error_key`, `error_detail`); the backend route in
  `backend/app/ai/routes.py` is unchanged. Call sites:
  `AiSetupWizard` step-3 connection test, `Settings` AI tab
  connection test.
- Three new title keys (`ui.ssh.confirm_overwrite_title`,
  `ui.ssh.confirm_delete_title`,
  `ui.git.confirm_accept_local_title`) added to all 8 i18n
  YAMLs (de/en/es/fr/el/pt/tr/ja). DE uses real umlauts per the
  lessons-learned rule. The cross-language pattern follows
  `LAUNCHER-I18N-EXTRACT-01`: every key lands in every language
  in the same commit, no mixed-locale states.
- Tests: backend 1298 unchanged (this release is frontend-side
  and i18n-side; no new backend test functions); frontend
  707 -> 712 (+5: four `api.ai.testConnection` cases — happy
  path, structured failure, disabled-AI shape pass-through,
  non-2xx `ApiError` throw — plus one `AiSetupWizard`
  `onError`-path assertion); launcher unchanged at 165; smoke
  Playwright unchanged at 191.
- Backlog deltas: 5 P1 audit findings shipped (the three
  `confirm()` sites + two bare-fetch sites collectively close
  the audit P1 cleanup plan). DEP-09 + SEC-01 archived as
  shipped. `@types/node` ^24 + tsconfig ES2022 closed the P2
  follow-up that the audit explicitly deferred from the
  mechanical-cleanup commit.

### Known limitations

The TipTap 2 → 3 migration (DEP-02) remains BLOCKED on upstream
`@sereneinserenade/tiptap-search-and-replace@0.2.0` (issue
[#19](https://github.com/sereneinserenade/tiptap-search-and-replace/issues/19)).
The pre-audit at `docs/explorations/tiptap-3-migration.md` is
current. Two unblock paths exist: Path A is the default — wait
for the upstream npm publish (next re-audit 2026-06-02 via
`make check-blockers`). Path B is a `prosemirror-search` adapter
fallback (~50-80 LOC) that bypasses the unmaintained extension;
available on demand, requires explicit user go-ahead, has not
been authorized.

## [0.28.0] - 2026-05-06

Bulk export now lives on the Books dashboard at parity with
Articles, three new cross-platform installer entry points
(`install.command`, `install.ps1`, `install.cmd`), the launcher's
last hardcoded English dialogs are extracted into the bilingual
i18n catalog, plus the `BIBLIOGON_DB_PATH` deprecation cycle
moves into step 2 (precedence flip).

### Action required

**If you have set BOTH `BIBLIOGON_DATA_DIR` and `BIBLIOGON_DB_PATH`
(uncommon):** the precedence flipped in this release.
`BIBLIOGON_DATA_DIR` now wins; the database resolves to
`<BIBLIOGON_DATA_DIR>/bibliogon.db` and `BIBLIOGON_DB_PATH` is
ignored with a clear runtime "ignored" warning that names the
value you passed. Previously `BIBLIOGON_DB_PATH` took priority and
could silently put the database at a path you no longer expected.
Action: remove `BIBLIOGON_DB_PATH` from your environment and
confirm the resulting DB path matches your expectation. If you
only set `BIBLIOGON_DB_PATH` (legacy), it keeps working with the
existing deprecation warning that shipped in v0.27.0 — migrate at
your own pace; a future release removes the override entirely
(DEP-DBPATH-01 step 3, queued for the release after this one).
Default Docker setups set neither variable and are unaffected.

**Bulk export on the Books dashboard.** The Books dashboard now
reaches feature parity with Articles for bulk export. Each book
tile carries a checkbox; a Select-all affordance sits above the
grid; a sticky `BookBulkActionBar` appears as soon as the
selection is non-empty, with a format dropdown (EPUB, PDF, DOCX),
an Export button, and a Clear-selection button. The new
`POST /api/books/bulk-export` endpoint accepts
`{book_ids: list[str], format}`, reuses the per-book scaffolding
pipeline (manuscripta + write-book-template + Pandoc) for each
book, and returns a single date-stamped ZIP
(`books-YYYY-MM-DD.zip`) of per-book exports. Filename collisions
get numeric suffixes (`slug-2.epub`). A 200-book hard limit
(Pydantic `max_length`) returns 422; an unknown ID returns 404
with the offending ID in the message; Pandoc failure surfaces the
offending book's title in the 502 detail. Combined-multi-book
mode is intentionally absent: per-book export goes through
manuscripta scaffolding which produces one project per book, and
merging N books into one EPUB / PDF would require deciding whose
metadata wins and which book contributes the cover, neither of
which is a natural workflow. If demand surfaces, that becomes its
own backlog entry.

**Cross-platform installer scripts.** Three new entry points
alongside `install.sh`. `install.command` is a 10-line macOS
Finder-doppelklickbar wrapper that `cd`s to its own directory and
invokes `install.sh`. `install.ps1` is a PowerShell mirror of
`install.sh` (121 lines, generated from `install.ps1.template`
via `make sync-versions`) covering the full Docker-check +
git-or-tarball + secret-gen + .env + compose-up flow with
PowerShell-specific `$LASTEXITCODE` handling, `Invoke-WebRequest`
fallback, and tar-extract logic. `install.cmd` is a 7-line
Windows batch wrapper that invokes `install.ps1` with
`-NoProfile -ExecutionPolicy Bypass` so corporate Windows
installations with Group-Policy-locked user-side ExecutionPolicy
still work. All three ship **unsigned** per launch decision:
macOS users see a Gatekeeper warning on first run (right-click >
Open is the documented bypass), Windows users see a SmartScreen
warning. Both READMEs (English + German) document the wrappers,
the ExecutionPolicy bypass rationale, and the unsigned-binary
warnings inline. `install.ps1` joins the lock-step chain
alongside `install.sh`: `make sync-versions` regenerates both
from their `.template` files at release time and
`verify_version_pins.sh` rejects any hardcoded version literal in
the static wrappers (`install.command`, `install.cmd`).

**Launcher i18n extraction complete.** The v0.27.0 launcher
first-run overhaul shipped i18n keys for the welcome dialog, the
Docker-missing flow, and the Settings language picker but left
~50 other hardcoded English dialog titles and message bodies in
`launcher/bibliogon_launcher/__main__.py`. This release extracts
every one of them: the Docker-daemon retry loop and
exhausted-attempts branch, env-prep failure, status-window
starting / almost-ready and the install-flow status sequence
(downloading / preparing config / building images / waiting
health), update-available, pending-uninstall cleanup,
launcher-stale, install-failed and install-complete (slow + ok
variants), the uninstall confirmation and per-phase status
(stopping / removing volumes / removing images), uninstall-failed
and uninstall-complete, installation-moved (with folder-picker +
invalid-folder branches), compose-failed, health-timeout, and
already-running. Five common-action strings (`OK`, `Cancel`,
`Retry`, `Close`, `Open browser`) are de-duplicated into a
`common.*` namespace so every dialog button label flows through
`i18n.t("common.ok")` instead of being typed seven times. The DE
catalog uses real umlauts throughout per the lessons-learned
rule; the existing test_i18n_and_welcome's umlaut spot-check
picks up eight new assertions (läuft, Schließen, öffnen,
verfügbar, Bücher, fortfahren, möglicherweise, Wiederholen) so
the ASCII-transliteration regression is caught across the full
extracted surface.

**Playwright smoke coverage for bulk article export.** Three new
specs in `e2e/smoke/article-bulk-export.spec.ts` pin the
bulk-export UX contract end-to-end: per-tile checkbox +
bulk-action-bar + ZIP markdown download, series filter +
Select-all selecting only the currently filtered set, and
filter-change clearing selection so a previously-selected-but-
now-hidden article does not stay invisibly selected. Caught one
real bug while writing the specs: `/api/test/reset` cleared
Asset / Chapter / Book but not Article, so state leaked between
specs and Select-all picked up stale articles from the previous
test. Fixed in the same commit by adding
`db.query(Article).delete()` to the reset path (only runs in
`BIBLIOGON_DEBUG` mode). The full smoke suite is now 191 passing.

### Internal

- `BIBLIOGON_DB_PATH` deprecation cycle, step 2 (precedence
  flip). Step 1 (the deprecation warning) shipped in v0.27.0;
  step 3 (full removal of the `BIBLIOGON_DB_PATH` override) is
  queued for the release after this one. Backend tests for the
  prior "both set, no warn" case were renamed and inverted to
  assert the new precedence and the new "ignored" warning. The
  DB_PATH-alone path keeps the v0.27.0 deprecation warning so
  deployments that still set only the legacy variable migrate at
  their own pace.
- DEP-09 (Vite 7 -> 8) and SEC-01 (vite-plugin-pwa CVE chain)
  unblocked upstream by `vite-plugin-pwa@1.3.0`, which lists
  Vite 8 in its peer-dep range and clears the four high-severity
  dev-only audit findings (`workbox-build` ->
  `@rollup/plugin-terser` -> `serialize-javascript`). Both moved
  from the BLOCKED tier to active P3 in ROADMAP and the backlog
  cross-reference. The combined Vite 8 upgrade is scheduled for
  a separate session, not folded into this release.
- `scripts/sync_versions.py` refactored: the single-template
  `regenerate_install_sh` helper became a list-driven
  `_regenerate_one` + `_INSTALL_ARTIFACTS` tuple so `install.sh`
  and `install.ps1` share the substitution logic. The legacy
  bash generator (`scripts/generate_install_sh.sh`) stays as a
  human-facing CLI for ad-hoc `install.sh` regeneration;
  `sync_versions.py` is now the canonical multi-artifact helper
  that release tooling consults. `verify_version_pins.sh`
  delegates the `install.sh` sync check to `sync_versions.py
  --check` (multi-artifact aware) and gained a regression
  detector that rejects any hardcoded version literal in
  `install.command` / `install.cmd`.
- 8 new `ui.dashboard.bulk.*` i18n keys in EN + DE (real
  umlauts) backfilled to the six auto-translated locales (es,
  fr, el, pt, tr, ja) with English fallback values per the
  existing AUTO_TRANSLATED.md convention. ~50 new launcher i18n
  keys plus the new `common.*` namespace shipped in EN + DE.
- Tests: backend 1285 -> 1298 (+13, split across DEP-DBPATH-01
  step 2 + AR-BULK-BOOKS-PARITY-01 + the `/api/test/reset`
  Article-cleanup regression test); frontend 702 -> 707 (+5);
  launcher unchanged at 165 (the i18n extraction added
  assertions to existing tests, not new test functions); smoke
  Playwright 188 -> 191 (+3 from the bulk-export specs).
- Backlog deltas: 5 P3/P4 items shipped (DEP-DBPATH-01 step 2,
  D-06, AR-BULK-PLAYWRIGHT-SMOKE-01, LAUNCHER-I18N-EXTRACT-01,
  AR-BULK-BOOKS-PARITY-01); DEP-09 + SEC-01 moved BLOCKED -> P3.

### Known limitations

`install.command`, `install.ps1`, and `install.cmd` ship without
fresh-machine validation. Apple silicon macOS and Windows 11
fresh-account runs are queued; report any wrapper-related issue
with the OS version and the exact error message and it will be
folded into the next point release. The unsigned-binary warnings
(Gatekeeper on macOS, SmartScreen on Windows) are documented in
both READMEs but cannot be removed without paid signing
certificates (deferred per launch decision; tracked separately
as `D-02 follow-ups` in P5).

The Books bulk-export endpoint is synchronous; selections that
exceed Pandoc's per-book runtime accumulated across N books may
time out on large catalogs. Books bulk export is ZIP-only by
design; combined-multi-book is not implemented.

## [0.27.0] - 2026-05-06

Bulk article export shipped, the launcher first-run experience
overhauled with a welcome dialog and bilingual UI, plus a handful
of release-hardening and lock-step polish items that landed across
the same window.

### Action required

**If you have set `BIBLIOGON_DB_PATH` manually (uncommon — default
Docker setups do not):** the env var still works but is now
deprecated. When set without `BIBLIOGON_DATA_DIR`, the backend
emits a runtime warning at startup. Migrate by removing
`BIBLIOGON_DB_PATH` and setting `BIBLIOGON_DATA_DIR` instead; the
database location is derived as `<BIBLIOGON_DATA_DIR>/bibliogon.db`.
A future release flips precedence so `BIBLIOGON_DATA_DIR`
derivation wins, and a later release removes the override
entirely. Users who never set `BIBLIOGON_DB_PATH` see no change
and need do nothing.

**Bulk article export.** The Articles dashboard now supports
selecting multiple articles and exporting them in one operation.
Each tile and row carries a checkbox; "Select all" picks every
currently visible article after filters. A sticky bulk-action bar
appears as soon as the selection is non-empty, with a format
dropdown (Markdown, HTML, PDF, DOCX), an output-mode toggle (ZIP
archive of individual files vs one combined document), an Export
button, and a Clear-selection button. Filter composition uses AND
across the four facets — status, topic, **series** (new), and
**tag** (new) — so the typical workflow ("filter by series,
Select all, Export combined PDF") is exactly that. Combined
Markdown drops each article's H1 in favour of `## Title` so
Pandoc's auto-generated TOC has one entry per article; combined
HTML carries id-anchored sections; combined PDF gives each article
its own chapter via xelatex's `--top-level-division=chapter`.
Article order in the response matches the dashboard's display
order. Filename collisions in ZIP get numeric suffixes
(`slug-2.md`, `slug-3.md`). Hard limit is 200 articles per export
with a soft warning at 50. The combined Pandoc invocation gets
180 seconds (vs 60 for per-article) and fails loud with the
offending article's title surfaced when an embedded image is
unreachable. Per-article export, including the per-row Export
action, is unchanged.

**Article schema gains `series`.** `Article.series` is a flat
free-string field (mirrors `Book.series`), nullable, exact-string
match in the new dashboard filter. Hierarchy (parent/child series)
stays out of scope; if the umbrella-with-sub-series workflow
grows past flat-string match, a focused follow-up adds a Series
model + relationship table. The Alembic migration
(`c0a1b2c3d4e5_add_articles_series`) is idempotent and adds the
column nullable, so existing rows pick up `NULL` automatically.

**Launcher first-run experience overhauled.** Every new user now
sees a welcome dialog before any check fires, explaining what
Bibliogon needs (Docker Desktop, ~800 MB), what the first run
costs (~2 GB / 5–10 minutes), plus a brief Docker security trust
statement linking to the new Bibliogon Docker installation guide
(en + de) under `docs/help/{en,de}/install/docker-desktop.md`. The
dialog is non-skippable on first ever launch and persists a
`welcomed` flag so subsequent starts skip it. The launcher's
internal user-facing strings now live in a JSON i18n catalog
(`bibliogon_launcher/locales/{en,de}.json`); locale resolution
follows OS locale by default with an explicit override available
under Settings > Language. The Docker-missing dialog moved from
a single-OK error to a three-button choice (open the Docker
download page, open the Bibliogon Docker installation guide, or
quit), with locale-aware URL selection. A small set of remaining
hardcoded English dialogs (manifest pick, uninstall flow,
compose-failure, health-timeout, etc.) is tracked as
`LAUNCHER-I18N-EXTRACT-01` for a follow-up extraction pass.

**Frontend / backend version cross-check.** The frontend ships
`__APP_VERSION__` as a Vite build-time literal from
`package.json`; the backend reports its own version via
`/api/health`. In dev with hot-reload of only one half, the two
diverge silently and bug reports get filed against the wrong
version. `verifyBackendVersion` in
`frontend/src/utils/versionCheck.ts` fires once at app start,
fetches `/api/health`, and `console.warn`s with both versions
when they differ. Fails open on every error path (network
failure, missing version field, JSON parse error) so offline boot
or a backend that hasn't started yet never breaks the app.

**Installer discovery: D-05 closed as won't-fix.** A focused
discovery session evaluated nine Windows installer candidates and
four macOS one-click options
(`docs/explorations/installer-discovery-report.md`, 708 lines, 25
cited sources). The Docker Subscription Service Agreement Section
2.1's non-sublicensable license grant forbids third-party silent
install of Docker Desktop, so the original D-05 framing ("install
Docker Desktop for the user") is closed as won't-fix; the
launcher's existing detect-and-instruct flow is the EULA-compliant
ceiling. Two follow-up backlog items captured the next steps for
the cross-platform-scripts side: D-06 (`install.command` for
macOS, `install.ps1` + `install.cmd` for Windows; ship unsigned
per user decision; 5–7 hours) and D-07 (winget manifest +
Homebrew tap submissions; ~2 hours plus reviewer latency).

### Internal

**Pre-push hook enforces pre-commit on tag pushes.** A new
`scripts/git-hooks/pre-push` runs
`poetry run pre-commit run --all-files` against the backend
whenever the push refspec contains `refs/tags/*`. Branch pushes
are a silent no-op so the hook stays out of the way during
normal development. Per-checkout, not committed under `.git/`;
each contributor runs `make install-hooks` once. Bypass with
`git push --no-verify` when explicitly intentional. The pre-tag
explicit `pre-commit run --all-files` step in
`release-workflow.md` Step 5 stays mandatory — the hook fails
the *push*, not the tag creation, so skipping the explicit step
makes a half-tagged repo. Closes the gap that produced the
v0.26.0..v0.26.6 hotfix chain.

**Static GitHub release-notes template.** `.github/RELEASE_TEMPLATE.md`
is a copy-paste reference for `release-workflow.md` Step 8 — no
automation reads it. Future releases copy the prerequisites
block (Docker required, install-guide URLs, hash-verify
commands) into `changelog/releases/vX.Y.Z.md` before invoking
`gh release create`, so every release page reuses the same
prerequisites surface instead of being rewritten from memory.

**Article filter quartet at the dashboard list endpoint.**
`GET /api/articles` accepts `?status=`, `?topic=`, `?series=`,
and `?tag=` query parameters, AND-composed. The `tag` filter does
a JSON-string LIKE match (matching `"python"` does not match an
article tagged `"pythonista"` — the JSON quote-wrapping pins the
tag literal). The frontend dashboard handles all filtering
client-side via `useArticleFilters`, but the backend filters keep
the API surface complete for headless callers and future server-
side pagination.

**Bilingual UI strings shipped to all locales.** The 12 new
`ui.articles.bulk.*` and `ui.articles.filter_{series,tag}_*`
keys exist in EN and DE (real umlauts) and got backfilled into
the six auto-translated locales (es, fr, el, pt, tr, ja) with
English fallback values per the existing
`AUTO_TRANSLATED.md` banner convention. The i18n parity test
stays green; refining the auto-translated values is captured as
`I18N-DIACRITICS-01`.

**Tests.** Backend grew from 1278 to 1285 (+7 unit tests on
the bulk export endpoint and list filter; ZIP / combined for all
four formats, validation, ID-order preservation, filename
collision). Frontend grew from 688 to 702 (+14 across the
selection hook, the bulk action bar, and the filter-compose
hook). Launcher tests added 18 cases (i18n catalog resolution,
welcome-flag persistence, Docker-missing dispatch, welcome
ordering before Docker check). Total in this release: 39 new
tests covering the user-visible bulk-export contract end to end.

**Backlog churn.** Closed: D-05 (won't-fix, archived to
`docs/archive/roadmap/2026-05.md`). Added: AR-BULK-SERIES-
HIERARCHY-01 (P3, parent/child series), AR-BULK-BOOKS-PARITY-01
(P4, books-dashboard parity), AR-BULK-CROSSPAGE-SELECT-01 (P4,
gated on pagination), AR-BULK-ASYNC-PROGRESS-01 (P5, gated on
hang report), LAUNCHER-I18N-EXTRACT-01 (P4, full launcher string
extraction), D-06 (P3, cross-platform installer scripts), D-07
(P4, package-manager discoverability).

### Known limitations

The bulk export response is synchronous; selections that exceed
the 180-second combined-Pandoc timeout fail. The backlog item
`AR-BULK-ASYNC-PROGRESS-01` (P5) tracks moving the workflow to
the async-job + SSE-progress pattern used by audiobook export
when the first user reports a perceived hang.

The Articles dashboard does not paginate today; "Select all"
selects only the visible filtered set. Cross-page Select-all is
captured as `AR-BULK-CROSSPAGE-SELECT-01` (P4) and lands when
pagination does.

The combined PDF assumes Pandoc + xelatex is available. Servers
without xelatex installed return 502 with the Pandoc stderr
surfaced; Markdown export needs neither and remains the safe
fallback.

## [0.26.6] - 2026-05-04

Hotfix for v0.26.5. v0.26.5's `.gitattributes` fix was correct
defensive hygiene but not the actual cause of the Windows
release-event failure. The actual cause: `sync_versions.py`
invoked `bash` via `subprocess.run(["bash", str(script),
"--check"])`. On Windows, PATH ordering meant subprocess could
resolve `bash` to the WSL2 launcher (`C:\Windows\System32\
bash.exe`) instead of Git Bash (`C:\Program Files\Git\bin\bash.
exe`). WSL2 mishandles native Windows paths passed as args,
producing spurious drift even when content matches.

Fix: reimplement the install.sh `--check` logic in pure Python
inside `sync_versions.py`. Reads `install.sh.template`,
substitutes `@@BIBLIOGON_VERSION@@` from the canonical
pyproject, compares to `install.sh` content, returns drift bool.
No bash subprocess, no PATH-dependent resolution, no
cross-platform path translation. The bash script
`generate_install_sh.sh` stays as the canonical human-facing
tool; the Python implementation is the cross-platform
equivalent for tooling that does not want to spawn subprocesses.

`.gitattributes` from v0.26.5 stays — still useful for any
future bash-driven check and for general line-ending hygiene.

v0.26.6 is the version Windows users should install.

## [0.26.5] - 2026-05-04

Hotfix for v0.26.4. v0.26.4 attached Linux and macOS launcher
binaries but Windows still failed at the install.sh sync check.
Root cause: `core.autocrlf=true` on Windows GitHub Actions
runners converts text files to CRLF on checkout. The bash-driven
`generate_install_sh.sh --check` regenerates with LF and compares
to the working-tree file via `diff -q`. CRLF vs LF mismatch
trips the check.

Fix: new `.gitattributes` at repo root pins `*.sh`, `*.template`,
and `install.sh` to `text eol=lf` so git keeps them LF on every
platform regardless of `autocrlf` setting. No content changes;
Windows runners now check out LF as Linux/macOS already do.

v0.26.5 is the version Windows users should install. Linux and
macOS users on v0.26.4 can stay or upgrade — same binaries.

## [0.26.4] - 2026-05-04

Hotfix for v0.26.3. The GitHub Release for v0.26.3 attached only
the macOS launcher binary; Linux and Windows release-event runs
both failed with two distinct CI bugs:

**Linux / Windows: verify step ran before `actions/setup-python`.**
The launcher workflows had the inline release-event verify step
positioned before the Set-up-Python step, so `python3
scripts/sync_versions.py` resolved to the runner's system Python
(3.10 on ubuntu-22.04). `sync_versions.py` imports `tomllib`,
stdlib in Python 3.11+. Linux failed with
`ModuleNotFoundError: No module named 'tomllib'`. Fix: move the
verify step in all three launcher workflows to AFTER setup-python
(macOS already happened to work because macos-14 ships 3.12 by
default but had the same step-ordering bug).

**Windows: subprocess.run on .sh script raised WinError 193.**
`sync_versions.py:regenerate_install_sh` invoked
`generate_install_sh.sh` via `subprocess.run([str(script),
"--check"])`. Windows cannot natively exec `.sh` files via
`subprocess.run`; on Linux/macOS the shebang `#!/usr/bin/env bash`
handles it. Fix: invoke through bash explicitly
(`subprocess.run(["bash", str(script), "--check"])`). GitHub
Actions Windows runners ship Git Bash, which is in PATH. Linux
and macOS continue to work because bash is also in PATH there.

The v0.26.3 GitHub Release stays in place but ships only the
macOS asset. v0.26.4 is the version users should install if they
need Linux or Windows binaries.

## [0.26.3] - 2026-05-04

Hotfix for v0.26.2. The CI pre-commit step (ruff format) caught
a single-line vs multi-line `raise` formatting nit in
`backend/app/__init__.py:_read_version` that the local pre-tag
sweep missed because pre-commit was not run as part of the
release-workflow Step 5 verification chain. Applied the
formatter locally; one file reformatted, no semantic change.

Other v0.26.2 CI workflows passed: launcher builds for Linux,
macOS, and Windows are green and produced binaries; the release
gate validated. v0.26.3 is the version users should install.

A follow-up addition to the release-workflow rule would add
`poetry run pre-commit run --all-files` to the pre-tag checklist
so this class of CI failure is caught before tagging.

## [0.26.2] - 2026-05-04

Hotfix for v0.26.1. Two bugs surfaced when the launcher workflows
and the CI mypy check ran against v0.26.1:

**Launcher build NameError.** The PyInstaller spec file added in
v0.26.0 used `Path(__file__).resolve()` to locate
`backend/pyproject.toml` for build-time version injection.
PyInstaller exec()s spec files via `exec(code, spec_namespace)`
which does NOT define `__file__` in the namespace. Linux, macOS,
and Windows launcher builds all crashed with
`NameError: name '__file__' is not defined`. PyInstaller injects
`SPECPATH` (directory containing the spec) into the namespace
instead; the spec now uses that as the anchor.

**mypy `[no-any-return]`.** `tomllib.load` returns
`dict[str, Any]`, so the chained access `data["tool"]["poetry"]
["version"]` is `Any`. The function declared `-> str`. mypy in
strict mode rejected the implicit Any-to-str fall-through. Fix:
explicit `isinstance(version, str)` check that raises `TypeError`
on a corrupted pyproject (caught by the existing except chain
that falls back to the `0.0.0+unknown` sentinel).

Both fixes are mechanical. No production behavior change beyond
the launcher actually building and the mypy gate passing.

## [0.26.1] - 2026-05-04

Hotfix for v0.26.0. The CI release-gate workflow added in v0.26.0
invokes `scripts/sync_versions.py` and `scripts/verify_version_pins.sh`,
which in turn invoke `scripts/generate_install_sh.sh` as a
subprocess. Those scripts had been chmod-ed locally during
development but git tracked them at mode 100644, so a fresh CI
checkout could not execute them directly. The gate run for
v0.26.0 failed with `PermissionError: [Errno 13] Permission denied`
on the generate_install_sh subprocess invocation, and the verify
script reported a misleading `MISMATCH: install.sh out of sync`
because bash returns 126 for non-executable files and the if-then
ladder treated that as drift.

**Fix.** `git update-index --chmod=+x` applied to all 11
shebang-bearing scripts under `scripts/`. The index now records
mode 100755 so any clean checkout (CI runner, new contributor)
can execute them directly. No script content changed; this is a
metadata-only correction.

The v0.26.0 tag remains in place as historical record; no
artifacts were attached to it because the gate failed before the
launcher build workflows could run. v0.26.1 is the version users
should install.

## [0.26.0] - 2026-05-04

This release is a foundation cleanup. The user-facing surface
changes very little; what changes is where Bibliogon stores its
data, how versions stay in sync across components, and how old
launchers behave on first run. Two pre-existing bugs are fixed
along the way.

**Action required for Docker users.** Cover image uploads were
previously stored at `/app/uploads` inside the container, which
is part of the COPY'd source tree and was lost on every container
rebuild. From this release forward, uploads live in the
`bibliogon-data` named volume and persist across rebuilds. If you
have been using Docker, you have lost your previous uploads on
every rebuild without warning. There is nothing you need to do
to receive the fix; it is automatic when you pull this release.

**Action required for desktop users with project-tree data.**
Bibliogon now stores books, uploads, and the SQLite database in
your user data directory: `~/.local/share/bibliogon/` on Linux
and macOS, `%LOCALAPPDATA%\bibliogon\` on Windows. On first start
after this update, Bibliogon detects existing project-tree data
(`backend/bibliogon.db`, `backend/uploads/`) and moves it to the
new location. Old paths are renamed with a `.migrated-YYYY-MM-DD`
suffix so you can verify before deleting them manually. Migration
is automatic and idempotent. If both old and new paths contain
data, Bibliogon refuses to start and asks you to resolve the
conflict.

**Action required for users running an old launcher.** Launcher
binaries shipped before this release target Bibliogon v0.17.0
and would install that stale version on a fresh machine. The
launcher now compares its embedded target version against the
latest GitHub release before showing the install dialog. If a
newer launcher is available, you are offered three options: open
the launcher download page, continue with the older version
anyway, or cancel. Users with current launchers see no change.

**Filesystem isolation and XDG paths.** All Bibliogon path access
now goes through `app.paths` resolvers (`get_data_dir`,
`get_upload_dir`, `get_db_path`, `get_config_dir`, `get_cache_dir`)
which use platformdirs (XDG-conformant) under the hood. The April
2026 data-loss bug class, where test runs could touch production
data because of CWD-relative paths and frozen module-level
imports, is now structurally impossible. Production data
directories carry a `.bibliogon-production` marker; if a test run
ever sees one, the entire run aborts with exit code 2.
`platformdirs` is a direct backend dependency; the
`BIBLIOGON_DATA_DIR` environment variable continues to win when
set explicitly (used in Docker and admin scenarios).

**Lock-step versioning across all subsystems.** Backend, frontend,
launcher, and all 10 core plugins ship with a single synchronized
version string. Only `backend/pyproject.toml` is edited at release
time; `make sync-versions` propagates to every other location
including `install.sh` (now generated from a template) and the
launcher's macOS bundle metadata. A new CI release-gate workflow
runs on every tag push and refuses to publish artifacts when any
version field is out of sync, when the verify script reports
regressions, or when the tag does not match the canonical source.
The release workflow's Step 4 collapsed from a multi-file
checklist to a single hand-edit followed by one make target.

**Pre-install stale-target safeguard in the launcher.** When the
launcher starts, before any install or welcome dialog, it
compares its embedded `BIBLIOGON_TARGET_VERSION` against the
latest GitHub release. The check always runs on first launch
regardless of the user's auto-update preference (the toggle now
governs only the post-install notification). Network failures
fail open: if GitHub is unreachable, the launcher proceeds with
the embedded target. The "Continue with older version" option
preserves agency for users who deliberately want an older
release.

**Backend version is derived, not duplicated.** The backend's
`__version__` is read from `pyproject.toml` via `tomllib` at
import time. The deprecated `COMPATIBLE_VERSION` alias in the
launcher has been removed; use `BIBLIOGON_TARGET_VERSION`
directly. Frontend bug-report templates derive their version
string from `package.json` via Vite's `define` instead of
hardcoding it in two separate constants that had drifted to
0.12.0 and 0.22.0 respectively. The `bibliogon-plugin-git-sync`
plugin reads its version via `importlib.metadata`. The launcher's
target version is injected at PyInstaller build time from the
canonical source.

**Documentation rewrites.** The Getting Started page no longer
leads with developer-only commands (`make install`, `make prod`).
End users see Docker prerequisites, the curl install one-liner,
manual install via `git clone`, lifecycle commands (`./start.sh`,
`./stop.sh`, uninstall), and a clearly separated "For developers"
subsection. The launcher pages no longer claim "the launcher is
not an installer" — that was always false; the launcher's welcome
dialog has always been able to download and install Bibliogon on
first run. Both English and German translations were corrected.

**Deprecated.** `BIBLIOGON_DB_PATH` continues to work but is
deprecated. New deployments should set `BIBLIOGON_DATA_DIR`; the
database location is derived as `<BIBLIOGON_DATA_DIR>/bibliogon.db`.
A future release will emit a warning when `BIBLIOGON_DB_PATH` is
set, and a later release will remove the override.

**Internal.** `release-workflow.md` Step 4 collapsed to a single
hand-edit plus `make sync-versions`. `verify_version_pins.sh`
extends the lock-step check to subsystem propagation and includes
regression detectors for reintroduced hardcoded literals.
`lessons-learned.md` documents the SSoT principle for version
pins and the filesystem isolation rule. The `.dockerignore` was
expanded to exclude development artifacts (uploads, transient
DB files, pytest caches, mypy caches, production marker) from
the Docker build context. Test counts: backend 1273 + 5 new
migration tests, launcher 142 + 5 stale-target safeguard tests,
frontend 682 unchanged.

**Known limitations.** `manuscripta` and `pluginforge` versions
are still updated manually in `backend/pyproject.toml`; both are
Bibliogon-owned libraries and not yet under sync-versions
automation. A reminder has been added to the release workflow.
The launcher cannot replace itself in place; the pre-install
stale-target safeguard tells the user to download a newer
launcher manually. A real binary self-replace mechanism (Windows
non-trivial because a running binary cannot replace itself
directly) is a future consideration.

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
- `GitSyncDiffDialog` lists the actionable rows, defaults `remote_changed` -> Take Repo and `both_changed` -> Keep Bibliogon, posts only resolvable rows. Reachable from the existing GitSyncDialog via "Auf Änderungen vom Repo prüfen". `mark_conflict` (write both versions as a visible conflict block) is intentionally out of MVP.

**plugin-git-sync PGS-04 - Multi-language branch linking.**
- Migration `e8f9a0b1c2d3` adds `books.translation_group_id` (nullable indexed UUID).
- `app/services/translation_groups.py` owns the linking primitives: `derive_language(branch, metadata)` resolves `main-XX` -> `XX` and bare `main` -> `metadata.yaml.language` (locale tags like `main-de-AT` are explicitly rejected so the suffix stays unambiguous); `link_books` creates a fresh group or folds members into the lexicographically-smallest existing group (deterministic merge); `unlink_book` clears the row and auto-unlinks the lone survivor of a two-book group; `list_siblings` excludes self + soft-deleted, sorted by language.
- `app/services/translation_import.py` clones a repo once, enumerates every `main` + `main-XX` branch, runs the WBT importer per checkout, persists a per-book clone under `uploads/git-sync/{book_id}/repo` with its own `GitSyncMapping`, and links the resulting books with one shared group id. Per-branch failures log + skip rather than abort the whole import.
- Endpoints `GET /api/translations/{book_id}`, `POST /api/translations/link`, `POST /api/translations/{book_id}/unlink`, `POST /api/translations/import-multi-branch`.
- `TranslationLinks` mounts inside the metadata editor's General tab: linked state shows clickable language badges that navigate to each sibling + an Unlink button; unlinked state shows a Link button that opens a dialog listing every other book with checkboxes. Flat cross-link model - no master/translation hierarchy.

**plugin-git-sync PGS-05 - Core-git bridge with unified commit.**
- `app/services/git_sync_lock.py` provides a per-book `threading.Lock` with a 30 s default timeout that both core git and plugin-git-sync grab before mutating book state, so concurrent commit requests on the same book serialize cleanly.
- `app/services/git_sync_unified.py` decides which subsystems are active for a book and fans one call out to both - core git first (smaller blast radius), plugin-git-sync second; per-subsystem failures land in the response payload (`status: ok | skipped | nothing_to_commit | failed`) rather than as a single hard 500. `GET /api/git-sync/{book_id}` extended with `core_git_initialized: bool`; new endpoint `POST /api/git-sync/{book_id}/unified-commit` (503 only when the per-book lock can't be obtained within 30 s).
- `GitSyncDialog` shows a banner + a primary "Commit überall" button next to the existing single-subsystem button when `core_git_initialized && mapped`; per-subsystem outcomes render as a status-coded result list under the form. Toast tier follows the per-subsystem result.

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
- **Coverage audit infrastructure:** `docs/audits/current-coverage.md` as the single source of truth for test statistics, with a history archive in `docs/archive/audits/` (was `docs/audits/history/` until the 2026-05-23 docs cleanup pass). Coverage targets per module type codified in `quality-checks.md`. Single-source-of-truth rule prevents duplicated statistics across documentation files.
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
