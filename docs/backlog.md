# Bibliogon Backlog

Last updated: 2026-05-19 (Medium-import async-progress family closed: MEDIUM-IMPORT-V2-01 + ASYNC-IMPORT-PROGRESS-01 + MEDIUM-IMPORT-RESPONSE-INTERFACE-SYNC-01 archived to docs/roadmap-archive/2026-05.md. All shipped to origin/main across 11 commits (e5ef73d..3c53054) + 1 smoke doc + 1 handoff. Test delta: +14 backend + +11 plugin + +47 frontend Vitest + 4 Playwright + ~80 i18n keys. Two lessons-learned candidates surfaced (shared-working-tree commit bundling; page-local state vs context-backed state across navigation) — deferred to next docs-only touch.)
Current version: v0.34.1
Open tasks: 47 active (P2..P5) + 2 BLOCKED-on-upstream pointers
Archive: [docs/roadmap-archive/backlog-recently-closed-2026-05-02.md](roadmap-archive/backlog-recently-closed-2026-05-02.md)

Living backlog. Daily-planning view of ROADMAP work. ROADMAP stays
the canonical theme tracker; this file is forward-looking only.

This file lists ONLY open tasks. Closed tasks live in the archive
files; do not re-add closed entries here. If a closed task needs
to come back, create a new ID.

Tasks are sorted by priority tier (P0 most urgent, P5 most
speculative). BLOCKED-on-upstream pointers + non-task waiting
items live in their own section between P5 and the archive link.
Within each tier, smaller-scope and unblocking items come first,
with alphabetical-by-ID as final tiebreaker.

The 5 entries in "ROADMAP cross-reference" below are pointers to
ROADMAP entries; their canonical description lives there. The
backlog is a working list of pointers, not a duplicate definition
store.

---

## ROADMAP cross-reference (curated planning view)

- **AR-01 validation log** — see ROADMAP > P3.
- **DEP-02** (TipTap 3) — see ROADMAP > Blocked / Upstream Wait.
- **DEP-05** (elevenlabs 2.x) — see ROADMAP > Blocked / Upstream Wait.

---

## P0 - Deadline / Blocker / Security

(none)

---

## P1 - Architecture / Hygiene Debt

(none)

---

## P2 - High-Value User Features

- **MEDIUM-IMPORT-V2-02**: AI tag inference for imported articles.
  Medium's HTML export strips tags. v1 imports articles with an
  empty tag list and the user adds them manually. v2 should call
  the existing `backend/app/ai/` core module per imported article
  with title + first paragraph + body excerpt and propose 3-5
  tags, surfaced for review in the dry-run table from v01. Effort:
  S-M depending on tag-quality bar. Trigger: first user report
  asking for it OR v01 ships and the manual-tagging step is a
  visible bottleneck in feedback.

---

## P3 - Infrastructure / Quality

- **PICTURE-BOOK-LAYOUT-SWITCH-TEXT-CONVERSION-01** (P3):
  active conversion of ``page.text_content`` when the user
  switches a page's layout between a TipTap layout (JSON-
  serialized doc shape) and a Tier-Property layout (plain
  string shape). Currently (post-Session 4c-B-1 Fix C) a
  defensive read in PageCanvas + ``picture_book_pdf._render_page``
  unwraps any JSON-shaped text_content into plain text on
  display, so the user never sees raw JSON. But the DB shape
  remains "dirty" (a Tier-Property page may carry a JSON
  string in text_content from a prior TipTap session) until
  the next user edit overwrites it.

  Active-conversion proposal: on layout-switch in
  ``PageEditor.handleChangeLayout``, when transitioning FROM
  a TipTap layout TO a Tier-Property layout, also send
  ``text_content: <extracted-plain-text>`` in the same PATCH
  that flips the layout (alongside the existing
  ``layout_config: null`` purge from v0.34.0 Fix A).
  Symmetric direction (Tier-Property → TipTap) doesn't need
  active conversion because ``parseTextContentToJson`` already
  wraps plain text into a minimal TipTap doc on read.

  Scope: 1 small commit + Vitest pin (extends the existing
  layout-switch test in PageEditor.test.tsx). The defensive
  read stays in place as a belt-and-braces safety net for any
  pre-conversion dirty rows that exist in the wild.

  Trigger: a backend consumer that depends on
  ``text_content`` shape matching the layout type (e.g. a
  future export pipeline that requires "pure plain text for
  Tier-Property layouts"), OR an explicit data-hygiene sweep
  on existing books. Filed during the 4c-B-1 Fix C close-out
  (2026-05-19).

- **PICTURE-BOOK-PDF-TIPTAP-RENDER-01** (P3): proper TipTap-
  JSON-to-HTML walker in ``picture_book_pdf.py`` that preserves
  bold/italic/underline marks + heading levels + lists in the
  printed PDF. v0.35.0 ships defensive plain-text extraction
  (PB-PHASE4 Session 4c-B-1 Fix C): the picture-book PDF
  renders the extracted text but drops formatting. For the
  picture-book MVP this is acceptable — picture-book typography
  is primarily a Tier-Property concern (the Bubble + Overlay
  Tier-Properties handle the styling 4c-B-2 ships), not an
  inline-mark concern. Future refinement: walk the TipTap doc
  + emit ``<strong>``/``<em>``/``<u>``/``<h1>``-``<h6>``/
  ``<ul>``/``<ol>`` with text-align styles per node.

  Scope: 2-3 commits. New ``_render_tiptap_doc(doc) -> str``
  helper in picture_book_pdf.py; per-mark + per-node
  conversion table; pytest covering every D1 MVP shape
  (Bold/Italic/Underline + H1-H3 + lists + align L/C/R);
  visual smoke that a multi-mark page round-trips through
  WeasyPrint to a PDF where the formatting renders.

  Trigger: user feedback that picture-book PDFs need to
  preserve TipTap formatting OR a contributor decides to
  unify the in-editor + printed shapes.

  Pairs with: ``PICTURE-BOOK-LAYOUT-SWITCH-TEXT-CONVERSION-01``
  (sibling fix-track for the same Session 4c-B-1 Fix C
  follow-up).

- **PICTURE-BOOK-PDF-KDP-FORMATS-01** (P3): extend picture-book
  PDF export beyond the v0.35.0 MVP 8.5×8.5 square. Audit
  finding 2026-05-17 D3 documented the canonical KDP picture-
  book formats:
  - 8×10 (portrait)
  - 8.5×11 (portrait, larger)
  - 11×8.5 (landscape)
  - 10×8 (landscape, smaller)
  Each format = a new ``@page { size: ... }`` rule in the
  WeasyPrint generator + a UI selector. Scope:
  - Backend: `picture_book_pdf.py` accepts a ``format`` arg;
    routes.py threads it through the dispatch as a query param.
  - Frontend: PageEditor + BookMetadataEditor buttons gain a
    format selector dropdown (default 8.5×8.5 to preserve the
    MVP UX); a future Settings field for the per-book default.
  - i18n + Vitest + Playwright per surface.
  Trigger: user requests 8×10 / 8.5×11 / landscape OR Aster's
  second picture-book book has different dimensions OR a KDP
  upload reveals a missing-format gap. Approx 5-7 commits.
  Filed per audit D3 reservation at S6 close.

- **PICTURE-BOOK-PDF-BLEED-MARKS-01** (P3): add KDP-quality
  bleed marks (0.125" bleed + crop marks) to picture-book PDFs
  for print-shop submission. v0.35.0 MVP ships trim-only PDFs
  (acceptable per KDP's print-on-demand requirements per the
  audit D4 finding); print-shop quality requires the explicit
  bleed marks. Scope:
  - CSS: ``@page { marks: crop bleed; bleed: 3mm; }`` in the
    generator + a per-book toggle.
  - UI: a checkbox in the BookMetadataEditor Design tab to
    opt in.
  - PDF metadata: a marker that downstream tools can detect.
  Trigger: user reports KDP rejects the file for missing
  bleed OR Aster requests print-shop quality. Approx 3-4
  commits. Filed per audit D4 reservation at S6 close.

- **PICTURE-BOOK-PDF-FRONT-MATTER-01** (P3): author-controlled
  front-matter pages (dedication / copyright / imprint) in
  the generated picture-book PDF. v0.35.0 MVP omits front-
  matter entirely (KDP auto-inserts a copyright line during
  print processing per the audit D5 finding); explicit
  authored front-matter is the next refinement. Scope:
  - Schema: new ``Book.picture_book_front_matter`` JSON column
    (or per-Book columns ``dedication``, ``copyright_notice``,
    ``imprint``) — design TBD at session-start.
  - Backend: generator inserts the front-matter pages BEFORE
    the cover page (or between cover + Page 1 — TBD).
  - UI: a dedicated section in the BookMetadataEditor's
    Design tab for the picture-book front-matter editor.
  - i18n + Vitest + Playwright.
  Trigger: user requests author-controlled front-matter OR
  Aster's second book needs an imprint page. Approx 5-7
  commits. Filed per audit D5 reservation at S6 close.

- **PICTURE-BOOK-PAGE-TEXT-TIPTAP-INTEGRATION-01** (P3): wire
  TipTap rich-text editing into picture-book page text regions
  (image_top_text_bottom + image_left_text_right + text_only).
  v0.34.0 + v0.35.0 ship picture-book text as plain string
  ``Page.text_content``; rich-text formatting (bold, italic,
  lists, headings) is deferred to the hybrid 4c-B work the
  user scoped 2026-05-18.

  Scope per the 4c-B Pre-Inspection (2026-05-17 discussion +
  queued 2026-05-18):
  - **Track A audit (Pre-Inspection step):** grep Bibliogon's
    existing TipTap-pattern across ArticleEditor + BookEditor
    chapter mode. Document Extensions configured, content
    storage shape, read-only render, Toolbar placement.
    Findings feed D1-D6.
  - **D1 — TipTap Extensions Configuration:** MVP set for
    picture-book pages (recommend: Bold + Italic + BulletList
    + OrderedList + Heading H1-H3 + TextAlign).
  - **D2 — Storage Schema:** ``Page.text_content`` as TipTap
    JSON for rich-text layouts vs. plain string for Tier-
    Property layouts (speech_bubble + image_full_text_overlay).
    Migration approach for existing rows.
  - **D3 — Toolbar Placement:** sticky vs floating-bubble-menu
    vs on-focus. Match Bibliogon's existing Editor pattern
    found in Track A.
  - **D4 — Migration Strategy:** existing plain-string
    ``Page.text_content`` rows wrapped in TipTap JSON for the
    rich-text layouts; backward-compatible read; idempotent
    SQL UPDATE on backend.
  - **D5 — read-only render:** PageCanvas needs to render the
    TipTap JSON for the rich-text layouts; existing components
    in ArticleEditor / chapter-editor provide the pattern.
  - **D6 — Editor placement:** in-PageCanvas vs adjacent panel.

  Pairs with: ``PICTURE-BOOK-OVERLAY-TEXT-TIER-PROPERTIES-01``
  (same session per the user's 2026-05-18 confirmation).
  Per the Recurring-Component Unification Rule, ANY shared
  CollapsibleSection helper for the Tier-Property layouts
  gets extracted in the same session.

  Trigger: scheduled 4c-B session (post-S6 PDF Export close;
  before v0.36.0). Approx 6-9 commits if pure-TipTap. If
  bundled with the Tier-Property sibling: 10-13 commits;
  split per the stop-condition rule into 4c-B-1 + 4c-B-2.

- **PICTURE-BOOK-OVERLAY-TEXT-TIER-PROPERTIES-01** (P3): apply
  the Tier-Property pattern (from
  ``PICTURE-BOOK-SPEECH-BUBBLE-EXTENDED-PROPERTIES-01``) to the
  ``image_full_text_overlay`` text band — sibling to the bubble
  configurability work but for the overlay text region. ~10-12
  properties:
  - font-size + font-family + font-weight
  - text-color + text-align
  - background-color + opacity
  - width + height (the user's earlier scope-add for v0.34.0
    that deferred to this session)
  - line-height + padding

  Pairs with: ``PICTURE-BOOK-PAGE-TEXT-TIPTAP-INTEGRATION-01``
  (same session; the hybrid approach: TipTap for image_top /
  image_left / text_only; Tier-Property for speech_bubble +
  image_full_text_overlay per the user's 2026-05-18
  confirmation). Recurring-Component Unification Rule applies:
  shared ``CollapsibleSection`` helper extracted from the
  bubble work used here too. Possible further extraction:
  a ``<TierPropertiesEditor>`` parameterised by layout, if the
  Bubble + Overlay-Text shape converges enough.

  Trigger: scheduled 4c-B session (same as the TipTap-
  integration sibling). Approx 4-6 commits if standalone;
  bundled with TipTap-integration: 10-13 (split per stop-
  condition).

- **RECURRING-COMPONENT-AUDIT-01** (P3): frontend-wide audit
  for duplicate UI patterns (component shapes, hook
  compositions, styling clusters) that violate the new
  Recurring-Component Unification Rule (filed 2026-05-19 in
  ``.claude/rules/coding-standards.md``). The rule fires at
  2-surfaces threshold (stricter than the generic
  3-duplicates DRY rule); the codebase has accumulated
  multiple known candidates before the rule was formalised,
  so a one-time sweep is warranted.

  Known candidates at filing time:
  - **AUTHOR-SELECT-INPUT-EXTRACT-01** (the rule's canonical
    first-application; closes together with
    ``AUTHOR-DATALIST-EXTEND-EDITORS-01``)
  - **LIST-VIEW-ROW-SHARED-EXTRACTION-01** (ArticleRow +
    BookListView row shape duplication)
  - **ARTICLEFILTERBAR-EXTRACT-01** (UX-Full-Audit G2-F1;
    Articles uses an inline 200-LOC FilterBar where Books
    uses the shared DashboardFilterBar)
  - **PLUGIN-SETTINGS-TESTID-COVERAGE-01** (Settings.tsx
    2338 LOC monolith with inline PluginSettings +
    AuthorSettings — extraction would enable per-tab E2E
    testid coverage too)

  Audit scope:
  1. **Component-shape sweep:** grep for distinctive JSX +
     prop combinations across ``frontend/src/components/``
     and ``frontend/src/pages/``. Recipes in coding-
     standards.md "Pre-Inspection for new UI components".
     Output: candidate list with file:line citations.
  2. **Hook-composition sweep:** identify hooks reused for
     similar purposes across 2+ surfaces (``useSelection``
     variants, ``useViewMode`` variants, etc.). Some
     already extracted (e.g. ``useTrashViewMode`` after
     Bug 3); the audit confirms no remaining duplicates.
  3. **Styling-cluster sweep:** grep for repeated
     className combinations across components. CSS module
     duplication is harder to detect mechanically; manual
     review of e.g. bulk-action-bar / filter-bar / toast-
     variant styling.
  4. **i18n key duplication:** secondary check — duplicate
     UI patterns often grow duplicate i18n keys (e.g.
     ``ui.create_book.author`` + ``ui.convert_to_book
     .metadata_author``). Worth surfacing during the
     extraction sessions for each candidate.

  Deliverable: audit doc at
  ``docs/audits/recurring-component-audit-YYYY-MM-DD.md``
  with categorised candidate list (HIGH / MEDIUM / LOW
  refactor value) + recommended ordering of extraction
  sessions. Each HIGH-value candidate gets its own backlog
  item (or extends an existing one) with the standard
  extraction-plus-migration session shape from coding-
  standards.md.

  Defer reason: the audit itself is read-only and would
  take 1-2 hours; the deliverable feeds N follow-up
  extraction sessions that each ship as their own focused
  work. Splitting audit-from-implementation matches the
  established "audit-first" Bibliogon discipline.

  Trigger: any time before v0.36.0 (extraction sessions
  can run in parallel with v0.35.0 PDF Export + S6
  closing). OR: a third recurring-component candidate
  surfaces in everyday work, prompting "audit all of them
  rather than chase individually".

  Pairs with: every existing component-extraction backlog
  item (``AUTHOR-SELECT-INPUT-EXTRACT-01``,
  ``LIST-VIEW-ROW-SHARED-EXTRACTION-01``,
  ``ARTICLEFILTERBAR-EXTRACT-01``,
  ``PLUGIN-SETTINGS-TESTID-COVERAGE-01``).

- **PICTURE-BOOK-KDP-SPECIFIC-FIELDS-01** (P3): add three KDP-
  specific metadata fields for picture-books (and likely future
  comic-books): `age_range` (e.g. "3-6", "4-8"), `page_count`
  (derived display from `len(pages)`, no schema change needed),
  and `print_format` (e.g. "square_8.5x8.5", "landscape_8.5x11").
  Surfaced during PB-PHASE4 Session 5 D5 sub-decision; deferred
  because (a) age_range + print_format require backend schema +
  Alembic migration outside the "expose existing fields" core
  ask of Session 5, (b) including them would push commit count
  beyond the stop-condition, (c) the user feedback was about
  Book-Metadata access for KDP publishing, not new KDP fields —
  closing the access gap was the primary win.
  Trigger: user-feedback that current Book-Metadata fields are
  insufficient for KDP picture-book publishing OR first KDP
  picture-book upload attempt reveals the field gap. NOT
  schedule-tied — concrete user-signal so the work lands when
  the gap is real.
  Scope:
    - `Book.age_range` column (nullable string, e.g. "3-6") +
      Pydantic schema + Alembic migration; UI surface on the
      General tab when `book_type === "picture_book"`.
    - `page_count` display-only (computed from `len(pages)`) on
      the General tab; no schema change.
    - `Book.print_format` column (enum-style string, e.g.
      "square_8.5x8.5") + Pydantic + Alembic + UI on the
      Publisher tab.
    - i18n for new labels across 8 catalogs (~6-9 keys).
    - Vitest for the field-rendering + persistence; E2E for the
      full edit-save-reload flow.
  Effort: 5-7 commits.
  Strategic note: when implementing, consider whether shared
  `book_type`-conditional fields make sense (e.g. age_range
  might apply to picture-books AND comic-books for children's
  segments) vs. separate `sub_type`-specific surfaces. Future
  comic-book editor likely has similar specific KDP needs
  (panel-count, page-count, format). One consistent shape
  reduces future drift.

- **PICTURE-BOOK-SPEECH-BUBBLE-DRAG-POSITION-01** (P5,
  narrower follow-up to the closed POSITIONING-01): drag-to-
  position UI for the speech-bubble. Session 4c shipped the
  preset path (5 anchor presets — TL/TR/BL/BR/CENTER — plus
  opacity + size sliders); 4c-B-1 Fix A extended to the full
  9-position anchor grid. This item adds free-form positioning
  if the 9 presets aren't enough for an author's use case.

  Multi-Bubble context (added 2026-05-19 from Finding E):
  drag-to-position becomes substantially more valuable once
  ``PICTURE-BOOK-MULTI-BUBBLE-PER-PAGE-01`` ships — multiple
  bubbles on a single scene want fine-grained per-bubble
  positioning (presets feel coarse when 3+ bubbles overlap).
  Schedule this item as part of the Comic-Foundation Session
  alongside MULTI-BUBBLE-01 + TAIL-01 rather than as an
  isolated drag-only commit; the three together form one
  coherent bubble-system upgrade.

  Trigger: user requests bubble positioning beyond the 9
  presets OR drag-to-position UX feedback from a real
  picture-book authoring session OR Comic-Foundation
  Session starts. NOT schedule-tied as a standalone item.
  Scope: pointer-drag handle on the bubble itself; persist
  `{anchor_position: {x_pct, y_pct}}` shape (extending the
  current string-preset shape, NOT replacing — preset names
  stay as a quick-pick fallback); PageCanvas reads the dict
  form when present and applies `left: x_pct%; top: y_pct%;
  transform: translate(-50%, -50%)`. Vitest + E2E.
  Effort: 2-4 commits standalone; folded into the Comic-
  Foundation Session as one of the three bubble-system
  commits, the marginal cost drops to ~1-2 commits.
  Closure note: superseded the broader
  PICTURE-BOOK-SPEECH-BUBBLE-POSITIONING-01 (closed by
  Session 4c). That older item was filed at Session 4 close
  as the entire "write-path closure"; Session 4c shipped the
  preset write-path; this narrower item carries the
  drag-positioning future-work forward.

- **PICTURE-BOOK-SPEECH-BUBBLE-EXTENDED-PROPERTIES-01** (P3):
  ship Tier 1 + Tier 2 extended properties for the speech-
  bubble layout (11 properties total beyond the 3 Session 4c
  shipped: anchor_position + opacity + size).

  Tier 1 — Visual Style section:
  - `background_color` (color picker, default white)
  - `border_color` (color picker, default black)
  - `border_width` (slider 0-8px, default 2px)
  - `border_style` (dropdown: solid/dashed/dotted/none,
    default solid)
  - `border_radius` (slider 0-50%, default 50% round)
  - `shadow` (toggle on/off + intensity slider, default on
    medium)

  Tier 2 — Typography section:
  - `font_family` (dropdown of children-book-friendly fonts,
    reuse Bibliogon font selection if available, default
    app-default)
  - `font_size` (slider 10-32pt, default 14pt)
  - `font_weight` (dropdown: normal/bold)
  - `text_color` (color picker, default black)
  - `text_align` (dropdown: left/center/right, default
    center)

  Plus 4c-B Pre-Inspection adjustment (filed 2026-05-17):
  replace the single `size` property with `bubble_width` +
  `bubble_height` for finer control. Migration approach
  (CC-chosen): NO data migration — keep reading `size` as
  legacy fallback when `bubble_width` is absent. On next
  write, the dispatcher always writes `bubble_width` +
  `bubble_height`; the legacy `size` key naturally fades
  out without backfill. Defaults: `bubble_width=40` (matches
  Session 4 D2a), `bubble_height=30` (content-driven
  alternative; could also let `bubble_height` be
  auto-derived from text content — surface during
  Pre-Inspection).

  UI pattern: properties pane with collapsible-sections.
  Three sections — Visual Style / Typography / Shape
  (future Tier 3). Pattern-application note: the
  collapsible-section component IS reusable for the
  sibling `PICTURE-BOOK-TEXT-CONFIGURATION-01` item which
  covers parallel Tier 1+2 properties for image-based
  layouts (image_left_text_right + image_top_text_bottom
  + image_full_text_overlay text typography). 4c-B
  Pre-Inspection should frame the session as
  "Tier-Property Pattern Application across Bubble +
  Text" — extract `<CollapsibleSection>` (and possibly a
  parameterized `<TierPropertiesEditor>`) once; reuse
  across both layouts' configs to drop total commit
  count below naive Bubble + Text = 2 × spec sum.

  Schema extension: `layout_config` dict gains nested keys
  for bubble properties. Backward-compatible: existing
  speech_bubble pages without extended props render with
  defaults. Migration: NULL config falls back to defaults
  per property.

  Trigger: scheduled 4c-B session OR user-feedback that the
  3-property MVP is insufficient.
  Effort: 6-8 commits (Pre-Inspection + collapsible-section
  helper + Visual Style section + Typography section +
  PageCanvas integration + i18n + Vitest + E2E + width/height
  migration).

- **PICTURE-BOOK-SPEECH-BUBBLE-EXTENDED-SHAPE-01** (P3,
  Tier 3 deferred from EXTENDED-PROPERTIES-01): shape
  variants + tail configuration + padding + font-style.
  Tier 3 from the user's 2026-05-17 extended-properties
  specification.

  Scope:
  - Shape variants: oval / rectangle / cloud / explosion
    (comic-strip-style). Likely uses SVG masks or CSS
    clip-paths rather than border-radius. The rectangle
    variant is the easiest first; cloud + explosion are
    the visual stretch goals.
  - Tail configuration: direction (8 octants), length, tip
    offset. **Note (2026-05-19):** the tail-configuration
    sub-scope was promoted to its own item,
    ``PICTURE-BOOK-SPEECH-BUBBLE-TAIL-01`` (Finding E /
    Comic-Foundation grouping). Keep here as a Tier-3
    aspirational mention; the dedicated home is TAIL-01.
  - Padding (slider, per-side or uniform).
  - font_style: italic/oblique toggle.

  Trigger: Comic-Plugin work starts (panel + speech-bubble
  shapes overlap with comic-book bubble shapes) OR user
  requests bubble-shape variants beyond the oval default.
  Effort: 6-10 commits depending on SVG-vs-CSS choice for
  shape variants. Probably warrants its own Pre-Inspection
  + design discussion before implementation.

- **PICTURE-BOOK-MULTI-BUBBLE-PER-PAGE-01** (P3, filed
  2026-05-19 from Finding E manual smoke): support multiple
  speech-bubbles per page instead of the single-bubble
  shape that Sessions 4c + 4c-B-1 + 4c-B-2 ship.

  Schema change: ``layout_config.speech_bubbles[]`` array
  replaces the current flat single-bubble dict. Each
  array entry carries the per-bubble Tier-Properties
  (background_color, border_*, font_*, anchor_position,
  size, opacity, plus the new tail config from TAIL-01).
  Backward compatibility: when reading a row with the
  legacy single-bubble dict shape, the canvas + editor
  treat it as a one-entry array; on next write the
  dispatcher always serializes the array form. No data
  migration; legacy shape naturally fades out as users
  edit pages.

  Scope:
  - Schema migration shim in PageCanvas + properties pane
    (read-side: array OR legacy dict)
  - Add-bubble UI affordance (button in properties pane)
  - Delete-bubble UI (per-bubble remove button)
  - Active-bubble selector in properties pane (one bubble
    config is shown / editable at a time; click another
    bubble on the canvas to switch active)
  - PDF export walker handles the array
  - i18n + Vitest + E2E

  Strategic note: this is the architectural anchor of the
  post-v0.35.0 **Comic-Foundation Session**. Establishes
  the multi-bubble + tail + drag pattern that a future
  Comic-Plugin reuses verbatim — one bubble-system,
  multiple usage contexts (single-page picture-book scene
  vs. multi-panel comic page). Matches the Single-Source-
  of-Truth discipline: extract the bubble component once,
  not twice.

  Pairs with:
  - ``PICTURE-BOOK-SPEECH-BUBBLE-TAIL-01`` (sibling Comic-
    Foundation item; tail-configurability per bubble)
  - ``PICTURE-BOOK-SPEECH-BUBBLE-DRAG-POSITION-01`` (P5;
    drag-to-position per bubble; gains real value once
    multiple bubbles coexist)
  - ``PICTURE-BOOK-SPEECH-BUBBLE-EXTENDED-PROPERTIES-01``
    (the 4c-B-2 Tier-Properties become per-bubble; each
    array entry carries its own Tier-1 + Tier-2 dict)

  Schema-decision (defer to Pre-Inspection of Comic-
  Foundation Session): does the multi-bubble shape stay
  under the existing ``speech_bubble`` PageLayout, OR
  does a new ``comic_bubble`` PageLayout (or a future
  ``comic_panel`` layout in a Comic-Plugin) carry the
  multi-bubble shape with a different surface entirely?
  The user's framing: "quasi Comic for one page within
  Picture-Book Layout" — points at the
  "extend speech_bubble" path for the picture-book MVP
  and a separate comic_panel layout later for true
  multi-panel comic work. Resolve at Comic-Foundation
  Pre-Inspection time.

  Trigger: Comic-Foundation Session (post-v0.35.0,
  scheduled after the 4-stream v0.35.0 bundle closes)
  OR earlier user request for multi-bubble on a single
  picture-book page. Effort: 5-8 commits if extending
  speech_bubble; 8-12 if introducing a new layout.

- **PICTURE-BOOK-SPEECH-BUBBLE-TAIL-01** (P3, filed
  2026-05-19 from Finding E manual smoke): speech-bubble
  with a configurable tail-triangle pointing to the
  speaking character. Sibling Comic-Foundation item.

  Scope:
  - tail-direction: 8 octants (N / NE / E / SE / S / SW /
    W / NW) plus "none" / "auto" (auto picks the nearest
    edge to the bubble's anchor_position)
  - tail-position relative to the bubble's edge: slider
    0-100% along the chosen edge (e.g. SE direction with
    position 30% = tail near the top of the right-bottom
    edge)
  - tail-length slider (8-32px default range)
  - Render: SVG ``<path>`` (preferred) or CSS clip-path
    on a pseudo-element. SVG path approach gives clean
    rendering at any zoom; clip-path approach is simpler
    to author but doesn't anti-alias as well.

  Pairs with:
  - ``PICTURE-BOOK-MULTI-BUBBLE-PER-PAGE-01`` (each
    bubble in the array carries its own tail config)
  - ``PICTURE-BOOK-SPEECH-BUBBLE-EXTENDED-SHAPE-01``
    (broader Tier-3 shape work; tail was originally a
    sub-scope there, promoted out to this dedicated item
    on 2026-05-19)

  Strategic note: ships alongside MULTI-BUBBLE-01 in the
  Comic-Foundation Session. The two together establish
  the "bubble-system" reusable for the future Comic-
  Plugin. Tail-direction is the visual cue that
  distinguishes "bubble for character A" from "bubble
  for character B" on the same scene — without it,
  multi-bubble is just multi-text-box.

  Trigger: Comic-Foundation Session OR user requests
  tail-bubble visual on a single-bubble page. Effort:
  3-5 commits (SVG render + properties-pane controls +
  i18n + Vitest + E2E).

- **PICTURE-BOOK-SPEECH-BUBBLE-POSITIONING-01**: ✅
  CLOSED by PB-PHASE4 Session 4c (preset write-path)
  + remaining drag-position scope moved to
  PICTURE-BOOK-SPEECH-BUBBLE-DRAG-POSITION-01 (P5).

- **PICTURE-BOOK-TEXT-CONFIGURATION-01** (P3): ship Tier 1 +
  Tier 2 text-configuration properties across image-based
  layouts (parallel to the bubble extended-properties work
  in `PICTURE-BOOK-SPEECH-BUBBLE-EXTENDED-PROPERTIES-01`).
  User-reported during Session 4c-A manual smoke: text
  typography is insufficient for picture-book context across
  image_left_text_right + image_top_text_bottom +
  image_full_text_overlay. User wants the same
  configurability pattern that the speech-bubble's Tier
  properties get.

  Proposed Tier 1 — Visual Style section (per layout):
  - `text_background_color` (color picker)
  - `text_padding` (slider)
  - `text_opacity` (slider 0.3-1.0)

  Proposed Tier 2 — Typography section (per layout):
  - `font_family` (dropdown of children-book-friendly fonts;
    reuse the same font catalog the speech-bubble item plans)
  - `font_size` (slider 10-32pt)
  - `font_weight` (dropdown: normal/bold)
  - `text_color` (color picker)
  - `text_align` (dropdown: left/center/right)
  - `line_height` (slider 1.2-2.0)

  Bug D scope-add covered by this item: `image_full_text_overlay`
  needs `text_container_width` + `text_container_height` sliders
  (text-region dimensions as % of canvas). Same Tier-Property
  pattern as the speech-bubble `bubble_width` + `bubble_height`
  filed under `PICTURE-BOOK-SPEECH-BUBBLE-EXTENDED-PROPERTIES-01`.
  Bug B was closed by the CSS default change (image_fit cover)
  — Bug D's `width + height` configurability is the next
  refinement, NOT a regression of Bug B.

  UI pattern: collapsible-sections matching the speech-bubble
  item's pattern. The `<CollapsibleSection>` helper noted there
  is the natural reusable; this item is a primary motivator
  for extracting it. Three sections per text-region:
  Visual Style / Typography / Sizing (only on
  image_full_text_overlay).

  Schema extension: `layout_config` dict gains nested keys
  for text properties (`text_*` prefix to disambiguate from
  speech-bubble's bubble-level keys). Same JSON-as-Text
  column; same migration approach (NO data migration; defaults
  apply when keys absent).

  Trigger: scheduled 4c-B session covers BOTH this item AND
  `PICTURE-BOOK-SPEECH-BUBBLE-EXTENDED-PROPERTIES-01` in one
  Tier-Property-Pattern Application session OR user-feedback
  that the typography defaults are still poor after 4c-A
  push.
  Effort: 6-9 commits (Pre-Inspection +
  CollapsibleSection extraction + Visual Style section +
  Typography section + Sizing section for
  image_full_text_overlay + PageCanvas integration + i18n
  + Vitest + E2E + dispatcher updates in LayoutConfigImageRow).

  Strategic note: 4c-B Pre-Inspection should frame the
  session as "Tier-Property Pattern Application across
  Bubble + Text" — Bubble and Text share the
  Visual-Style + Typography spec almost 1:1. The reusable
  `<CollapsibleSection>` + a shared typography/visual-style
  control-kit drops total commit count below the naive
  Bubble + Text = 2 × spec sum. Surface during 4c-B
  Pre-Inspection whether to extract a single
  `<TierPropertiesEditor>` parameterized by layout.

  4c-B sub-item — `layout_config` namespace per layout
  (Fix B for Session 4c-A Bug A + Bug C): the current
  `Page.layout_config` is a single flat dict that
  accumulates keys from every layout the page has worn.
  v0.33.1 ships the conservative **Fix A** (purge
  `layout_config` to `null` on layout switch in
  `PageEditor.handleChangeLayout`), which trades
  per-layout-config-preservation for correctness. The
  follow-up Fix B namespaces the dict by layout:
  ```json
  {
    "speech_bubble": {"anchor_position": "...", "opacity": ...},
    "image_top_text_bottom": {"text_align": "...", ...},
    "image_full_text_overlay": {"text_position": "...", ...}
  }
  ```
  Per-layout configs survive a switch + return-to-previous;
  the renderer reads `layout_config[page.layout]` instead
  of `layout_config` directly. Migration: convert existing
  flat dicts into the active layout's namespace on first
  read (best-effort heuristic on existing key prefixes,
  e.g. `anchor_*` → `speech_bubble`, `text_*` →
  text-region layouts, `image_*` → image-region layouts).
  Schedule: bundle with 4c-B so the new typography keys
  land in the namespaced shape from day one rather than
  requiring a second migration. Tests must include a
  switch → switch-back assertion that prior config
  re-applies after returning to a layout.

  Pairs with: `PICTURE-BOOK-SPEECH-BUBBLE-EXTENDED-PROPERTIES-01`
  (sibling), `PICTURE-BOOK-SPEECH-BUBBLE-EXTENDED-SHAPE-01`
  (Tier 3 for bubble; no text equivalent yet).

- **NAVIGATION-ORIGIN-TRACKING-01** (P3): extract a `useBackNavigate`
  hook that encapsulates the `location.key === 'default'` fallback
  pattern, and migrate the current hardcoded `navigate(-1)` /
  `navigate('/')` sites to use it.
  Trigger: a fourth 'global' page (i.e. one reachable from both
  AD and BD) appears with a back-button, OR a contributor adds a
  new top-level page that needs origin-tracking.
  Scope: extract the helper into `frontend/src/hooks/`; refactor
  Settings, Help, GetStarted to call it; add Vitest for the
  helper. Drop-in replacement; no user-visible behavior change.
  Effort: 3-5 commits.
  Deferred reason: the current 3-page direct-`navigate(-1)` form
  is acceptable. Utility extraction adds value at scale (4+ sites),
  not at 3. Filed during the v0.33.0 Bug 1 hotfix where the
  pattern emerged across Settings + Help + GetStarted.

- **LIST-VIEW-ROW-SHARED-EXTRACTION-01** (P3): extract a shared
  `<ListViewRow>` base component that `ArticleRow` and
  `BookListRow` can both consume.
  Trigger: a third instance of duplicate list-view-row code
  appears (e.g. a new Comments-Admin list view, or a Publications
  list view), OR a styling drift between Articles and Books list
  views surfaces in production.
  Scope: extract shared base component with selection + actions
  + content slots; migrate ArticleRow and BookListRow to consume
  it; preserve all existing testids; keep the per-row click
  guards (stopPropagation on checkbox/menu).
  Effort: 5-8 commits (substantial refactor).
  Deferred reason: not blocking the user-visible v0.33.0 Bug 2
  fix; would inflate that hotfix session. The current per-page
  list-row duplication is the price of the speed-of-fix tradeoff.

- **CONVERT-TO-BOOK-ASSET-CLONE-01** (P3): asset-clone walker
  for the article-to-book conversion feature.
  Trigger: first user report that book images break after they
  deleted a source article post-conversion.
  Scope: walk the source articles' `content_json`, find every
  `imageFigure` node, copy the referenced `ArticleAsset` files
  into a new `Asset` row scoped to the new book, rewrite the
  TipTap JSON `src` attribute from
  `/articles/{article_id}/assets/...` to
  `/books/{book_id}/assets/file/...`. Hook into the existing
  `POST /api/books/from-articles` endpoint so the clone happens
  in the same transaction as the chapter inserts (rollback
  semantics preserved). Plus an asset-cleanup branch in the
  book-delete handler that removes the cloned files (book
  assets are book-scoped so cascade-delete already handles the
  DB rows; the on-disk files need explicit cleanup).
  Effort: 2-3 commits (walker + endpoint integration + delete
  handler + tests).
  Defer reason: hypothetical until user-impact verified. The
  decoupled-lifecycle design assumes users do NOT delete source
  articles they've already converted; the help-doc workaround
  ("re-upload affected images via the Book editor") is
  acceptable while we have zero broken-image reports. Filed by
  Phase 1 Q9 deferral, 2026-05-15.

- **COMMENTS-ADMIN-PAGINATION-01** (P3, IMPROVEMENT): filed
  by UX-Full-Audit 2026-05-15 (G2-F3). Comments admin tab
  renders all comments in a single DOM table without
  pagination or virtualization. At current scale (49) it's
  fine; at 500+ comments the initial render and DOM weight
  will degrade. Add pagination OR virtualization OR a hard
  cap with "Show all" affordance. Effort: S-M. Trigger:
  first user >200 comments OR Settings sluggishness
  complaint.

- **I18N-NATIVE-REVIEW-V031-01**: native-speaker review for the
  three v0.31.0 namespaces (``ai_template``, ``bulk_ai_fill``,
  ``comments``) that ship passthru-English in es / fr / el / pt /
  tr / ja. Each affected catalog carries a top-level ``_meta:``
  block with ``review_status``, ``translator``,
  ``translation_date``, ``reference_lang``, and the explicit
  ``pending_namespaces`` list.
  ``backend/config/i18n/REVIEW_STATUS.md`` documents the
  per-language status and the PR-based correction submission
  flow (parallel to the v0.30.0 launcher precedent in
  ``launcher/bibliogon_launcher/locales/REVIEW_STATUS.md``).
  Trigger: native-speaker contact for any of the six pending
  languages, OR pair with LAUNCHER-I18N-NATIVE-REVIEW-01's
  reviewer outreach.
  Filed by D3 pre-release UX audit 2026-05-12.

- **BACKUP-PROJECT-IMPORT-MUTMUT-01** (P5): add direct unit
  tests for the per-asset / per-chapter helpers in
  ``app/services/backup/project_import.py`` (34 no-tests
  mutmut entries 2026-05-14). The helpers are transitively
  covered by ``test_import_handler_wbt.py`` but mutmut's
  per-function visibility is exact-match. Effort: S.
  Filed by ``MUTMUT-EXPAND-SCOPE-01`` 2026-05-14 audit.

- **BACKUP-SERIALIZER-MUTMUT-01** (P5): tighten the existing
  backup-roundtrip tests in ``test_backup_articles.py``,
  ``test_backup_import_revive.py``, ``test_backup_utils.py``
  to assert exact field presence on the serialized output
  (~162 surviving + 10 no-tests mutmut entries on
  ``backup.serializer`` 2026-05-14, mostly XX-wrap and
  case-flip on output-key strings). Tightening should kill
  the bulk in one pass. Effort: M. Filed by
  ``MUTMUT-EXPAND-SCOPE-01`` 2026-05-14 audit.

- **GIT-BACKUP-MUTMUT-01** (P5): triage the
  ``app/services/git_backup.py`` survivor pool (330
  survived + 57 no-tests; largest single-file pool in the
  services audit). Mix of cosmetic (git-config key
  strings, e.g. ``"user.name"`` / ``"user.email"``) and
  real (error-classification helpers with no direct
  coverage). Triage in its own session like the office +
  wbt audit. Effort: M. Filed by ``MUTMUT-EXPAND-SCOPE-01``
  2026-05-14 audit.

- **BIBLIOGON-DATA-FIX-FRAMEWORK-01**: refactor the six
  one-shot retro-fix scripts under `scripts/` into a generic
  framework. Existing scripts:
  `fix_medium_import_image_nodes.py`,
  `fix_medium_import_featured_images.py`,
  `fix_medium_import_truncation.py`,
  `fix_medium_import_language.py`,
  `fix_medium_import_seo.py`.
  They share a common shape:
  scope query (Article join ArticleImportSource), per-row
  predicate, per-row mutation, dry-run vs --apply, idempotent
  re-run reports zero changes. The same pattern is the
  obvious target for any future Bibliogon data-fix work
  (book imports, asset migrations, etc.). Effort: M (extract
  base class + per-fix subclass + tests). Defer until a
  fifth one-shot is needed; ship the four as one-shots first
  so the abstraction is informed by real cases. Trigger: 5th
  one-shot OR a new contributor needs to write one.

- **D-06-VALIDATION-01**: fresh-machine validation of the
  v0.28.0 cross-platform installer scripts (`install.command`,
  `install.ps1`, `install.cmd`). The scripts shipped unsigned
  per launch decision and were not exercised on a fresh macOS
  user account or fresh Windows 11 install before tagging.
  Trigger: first user report OR access to a clean test machine.
  Effort: S (run each wrapper, capture any Gatekeeper /
  SmartScreen / ExecutionPolicy edge cases). Folds into the
  next point release.

- **PGS-05-FU-01**: real-world unified-commit failure-mode tuning
  (only one of two subsystems active, partial-failure UX). Effort
  S; trigger by user report.

- **AR-BULK-SERIES-HIERARCHY-01**: parent/child series for the
  bulk-export filter. The 2026-05-06 bulk-export ship landed
  series as a flat free-string field on Article (mirrors
  `Book.series`). Hierarchical series ("Cosmos > Astrophysics >
  Stars") was deferred because no user has asked for it and a
  Series model + M2M migration is a multi-session investment.
  Trigger: first concrete user request for sub-series. Effort:
  1-2 sessions for the model + migration + filter UI nesting.
  See `docs/help/{en,de}/articles/bulk-export.md` "Series" note.

- **I18N-DIACRITICS-01**: auto-translated non-DE i18n YAMLs (es,
  pt, tr, possibly fr) ship with inconsistent diacritic coverage —
  some entries use proper Unicode (`géneros`, `Décroissant`,
  `gêneros`), others ASCII-substitute (`Titulo`, `Baslik`). Found
  in Test Phase Session 3 (2026-04-28) cross-language audit while
  fixing DE umlauts. Severity: Medium (readable but inconsistent +
  non-native). Effort: M per language. Cause: `AUTO_TRANSLATED.md`
  banner in `backend/config/i18n/` indicates DeepL/LMStudio passes
  with mixed quality. Fix: re-run translation with current DE
  source as canonical (DE was just cleaned up of all ASCII
  substitutes), human-review each for native diacritic use. Defer
  until DE i18n stable + a native speaker is available per
  language for review.

- **SETTINGS-ALLGEMEIN-TAB-REORGANIZATION-01** (P3, IMPROVEMENT):
  Settings → "Allgemein" tab requires scroll to reach all
  settings below the initial three Kacheln/cards. Should be
  reorganized for better discoverability.

  Recommended approach (CC decides at implementation time):
  - Option B preferred: split "Allgemein" into multiple top-level
    tabs (consistent with the existing tab pattern, avoids
    tab-in-tab cognitive load).
  - Option A acceptable: sub-tabs within "Allgemein" if Option B's
    tab-bar becomes too wide.
  - Option C fallback: cards-layout optimization only
    (Collapsible-Sections, denser grid).

  Scope:
  - Audit current "Allgemein" tab structure (which settings are
    grouped there).
  - Decide grouping strategy: Erscheinung / Verhalten / Daten / etc.
  - Implementation: extract relevant settings into separate tab
    components OR sub-navigation.
  - i18n: new tab labels in 8 languages.
  - Tests: Vitest + E2E for navigation between new tabs.

  Effort estimate: 4-6 commits (substantial Settings refactor).

  Trigger: builds on the v0.33.0 Settings-monolith extraction work
  shipped 2026-05-15 (archived: ``PLUGIN-SETTINGS-TESTID-COVERAGE-01``,
  ``SETTINGS-INLINE-TABS-EXTRACT-01``, both in
  ``docs/roadmap-archive/2026-05.md``). Now that the per-tab
  components exist (AppSettings / AiAssistantSettings /
  TopicsSettings / PluginSettings / AuthorSettings), reorganization
  sits cleanly on top — no extraction prerequisite remaining.
  Trigger this item when a Settings-Polish-Session is convened OR a
  user complaint about Settings scroll friction surfaces.

  Defer reason:
  - Not user-blocking (existing scroll works, just friction).
  - Today's Sprint-Velocity is at the upper edge (23+ commits since
    v0.33.0); this is the 8th surface-pattern instance manual
    smoke-testing has surfaced.
  - Bug 4 (Comments-Admin restructure) + Kinderbuch test-discipline
    deliverables are this session's defined scope.

  Filed by Hotfix-Session 2026-05-16 evening (after Bug-4 ship)
  per user instruction.

- **AUTHOR-DATALIST-EXTEND-EDITORS-01** (P3): extend the Bug 8
  Phase 2 Wizard Author-Dropdown pattern (``<input>`` +
  ``<datalist>`` + "Add to Authors-Database" checkbox) to the
  remaining author input surfaces:
  - ``ArticleEditor.tsx`` author field
  - ``BookEditor.tsx`` author field
  - ``BookEditor.tsx`` backpage author-bio sidebar
  Trigger: user-feedback that one of those surfaces is friction
  to type into OR positive validation that the Wizard Author-
  Dropdown pattern works well in production. Bug 8 Phase 2
  deliberately ships the pattern on the Wizard ONLY (per D8 —
  the Wizard is the high-leverage surface because multi-article
  selection surfaces multiple authors at once; single-record
  editors get the pattern later).
  Scope: ~4-5 commits. Mirror the Wizard's
  ``computeAuthorSuggestions`` helper for each surface (the
  helper itself stays reusable; only the inputs change — for
  the Article/Book editor cases there's no multi-row selection,
  so the suggestion pool is just the global Authors-DB).
  Re-use the same Add-to-Authors-DB checkbox shape + the same
  ``api.authors.create`` call shape. Vitest + E2E for each
  surface.
  Defer reason: scope-control. The Wizard pattern is novel
  enough that shipping it to one surface and letting Aster
  validate the UX is the right next step before duplicating it
  across three more editor surfaces. Filed during the Bug 8
  Phase 2 close-out.

  **Update 2026-05-19 (post-CreateBookModal fix):** scope
  expanded to also include extraction of a shared
  ``AuthorSelectInput`` component — see the new sibling item
  ``AUTHOR-SELECT-INPUT-EXTRACT-01`` below. The two items
  should ship together in one coordinated session: the
  extraction lands first (audit-first across all 4+ usage
  sites, then build the component, then migrate each site
  in turn). At session close, BOTH items mark
  ``[x]``-complete simultaneously. Closes the
  Wizard+CreateBookModal duplication created by the
  2026-05-19 CreateBookModal fix.

- **AUTHOR-SELECT-INPUT-EXTRACT-01** (P3): extract the
  Author-Selection pattern (``<input>`` + ``<datalist>`` +
  "Add to Authors-Database" checkbox) into a shared
  ``AuthorSelectInput`` component, then migrate ALL usage
  sites in one coordinated session.

  Known usage sites at filing time (2026-05-19):
  - ``ConvertToBookWizard.tsx`` (Step-2 author field, with
    ``computeAuthorSuggestions(selectedArticles,
    globalAuthors)`` suggestion source)
  - ``CreateBookModal.tsx`` (author field, with
    ``authorChoices`` (user-identity) ∪ ``globalAuthors``
    suggestion source) — shipped 2026-05-19 as the
    pre-vs-post-AuthorsDB pattern bug fix
  - ``ArticleEditor.tsx`` (article author field, future
    AUTHOR-DATALIST-EXTEND-EDITORS-01 work)
  - ``BookEditor.tsx`` (book author field, same backlog
    item)
  - ``BookEditor.tsx`` backpage author-bio sidebar (same
    backlog item)

  **Audit-First requirement:** before extraction, grep the
  entire codebase for any other free-text author-input
  surface. Possible candidates: backup-import wizards,
  manuscript-template forms, future picture-book-specific
  metadata fields. The audit's findings determine the
  final API surface of ``AuthorSelectInput``.

  Component API (proposed; pending audit refinement):
  ```tsx
  interface AuthorSelectInputProps {
    value: string;
    onChange: (next: string) => void;
    suggestions: string[];  // pre-computed union, caller decides
    addToDbChecked: boolean;
    onAddToDbCheckedChange: (next: boolean) => void;
    addToDbVisible: boolean;  // caller computes from
                              // globalAuthors-vs-typed-name match
    testidNamespace: string;  // e.g. "create-book-author" /
                              // "convert-to-book-wizard-author"
    labelKey?: string;        // default "ui.shared.author"
    placeholderKey?: string;  // default "ui.shared.author_placeholder"
  }
  ```
  The caller stays responsible for:
  - Computing ``suggestions`` (different per surface:
    Wizard uses article-context-driven; modal uses
    user-identity-driven; editors use globalAuthors-only)
  - Computing ``addToDbVisible`` (typed name not in
    globalAuthors)
  - Calling ``api.authors.create`` on submit when
    ``addToDbChecked`` is true (the fail-soft pattern)

  The component just renders the shared visuals + emits
  the events.

  **Coordination:** ships AS A coordinated session that
  closes BOTH ``AUTHOR-SELECT-INPUT-EXTRACT-01`` AND
  ``AUTHOR-DATALIST-EXTEND-EDITORS-01`` simultaneously.
  Session shape:
  1. Audit grep (1 commit, docs-only)
  2. Component + Vitest (1 commit)
  3. Migrate ConvertToBookWizard (1 commit)
  4. Migrate CreateBookModal (1 commit)
  5. Migrate ArticleEditor (1 commit) — closes
     AUTHOR-DATALIST-EXTEND-EDITORS-01 partially
  6. Migrate BookEditor author + backpage_author_bio
     (1 commit) — closes AUTHOR-DATALIST-EXTEND-EDITORS-01
     fully
  7. Playwright smoke for all migrated surfaces (1 commit)

  ~7 commits total. Above 5-commit stop-threshold but
  acceptable because the extraction is intrinsically
  multi-site coordinated work; splitting it across
  multiple sessions would leave mixed-pattern state in
  the codebase between sessions.

  Trigger: AUTHOR-DATALIST-EXTEND-EDITORS-01 trigger fires
  (user feedback on editor friction OR positive Wizard
  validation), OR a fifth usage site appears in the audit.

  Original defer reason (2026-05-19 morning): coding-
  standards.md "Three duplicates: refactor immediately"
  threshold — at the CreateBookModal fix we were at TWO
  duplicates.

  **Updated 2026-05-19 afternoon (post Recurring-Component
  Unification Rule):** the new UI-specific rule has a
  STRICTER threshold of 2 surfaces, not 3. This item is
  now the canonical first-application of that rule — the
  earlier defer reason is superseded. Promote scheduling
  priority: this should ship as the NEXT extraction-plus-
  migration session after current in-flight work (Session
  6 PDF Export + v0.35.0 cut). The Pre-Inspection step in
  the new rule requires an audit-first commit before
  component construction, which fits naturally with the
  user-requested audit-first scope expansion captured in
  this entry.

  Pairs with: ``AUTHOR-DATALIST-EXTEND-EDITORS-01``
  (closes together) + ``RECURRING-COMPONENT-AUDIT-01``
  (broader frontend sweep that may surface additional
  related candidates).

- **KDP-CATEGORIES-CATALOG-SYNC-01** (P3, IMPROVEMENT): sync the
  KDP plugin's 25-category catalog in
  ``plugins/bibliogon-plugin-kdp/config/kdp.yaml`` with the
  10-category subset hardcoded in
  ``plugins/bibliogon-plugin-kdp/bibliogon_kdp/routes.py``.
  Trigger: a scheduled Settings-Polish-Session OR a user report
  that the KDP categories shown in the UI don't match what the
  request handler accepts.
  Scope: pick one source-of-truth (the yaml is the natural
  choice — it's the user-editable catalog), drop the inline
  subset in routes.py, route validation through a helper that
  reads the yaml. Single-commit fix; ship paired with a
  regression test that flags any future divergence.
  Defer reason: pre-existing minor drift surfaced during the
  Bug-9 Pre-Inspection audit. Not blocking Bug 8 or Bug 9
  scope; routes.py + yaml have coexisted in this drifted state
  since the KDP plugin shipped. Filed for the next polish
  session.


---

## P4 - Roadmap / Future Phases

- **MYPY-V2-MIGRATION-01**: bump ``mypy`` from 1.20.2 to
  2.x. Major bump of the type checker. mypy 2.0 changed
  several inference defaults and dropped legacy
  behaviours; Bibliogon's existing
  ``[tool.mypy.overrides]`` blocks in ``backend/pyproject.toml``
  + the test-infrastructure-audit-added CI gate
  (``lint-and-type-check`` job) mean a 2.x bump that
  surfaces new errors would red-line CI immediately.
  Effort: M (re-run mypy, classify new errors, add
  overrides or fix source). Trigger: mypy 1.x reaches
  end-of-life status, OR ~6 months of latency pressure.
  Filed by dep-update audit 2026-05-12.

- **D-07**: Phase 2 follow-up — package-manager discoverability.
  After D-06 ships, submit a winget manifest to
  `microsoft/winget-pkgs` and create a Homebrew tap at
  `astrapi69/homebrew-bibliogon`. Effort: ~2 hours of
  implementation, plus reviewer latency (winget-pkgs PR review
  can take days to weeks; do NOT couple to D-06 release timing).
  Trigger: D-06 shipped + first real user feedback to confirm
  the wrappers actually work in the wild. Per discovery report,
  this expands discovery surface meaningfully without changing
  the underlying install path. See
  [docs/explorations/installer-discovery-report.md](explorations/installer-discovery-report.md).

- **AR-BULK-CROSSPAGE-SELECT-01**: cross-page Select-all for the
  bulk-export workflow. Articles dashboard does not paginate
  today, so "Select all = current page" is moot. When pagination
  lands (or articles count grows past comfortable scroll), Select-
  all needs to either select every filtered row across pages or
  surface an "X of N visible; select all N?" affordance. Effort:
  S once pagination exists. Trigger: pagination landing OR article
  counts complaint.

- **LAUNCHER-SELFREPLACE-01**: launcher binary self-replace.
  Currently the pre-install stale-target safeguard tells the
  user "download a newer launcher manually" and opens the
  GitHub release page. A real self-replace mechanism (download
  new binary, atomic replace, relaunch) would close that loop.
  Windows non-trivial: a running binary cannot replace itself
  directly; needs a helper script (e.g. spawn a `cmd.exe`
  background that waits for parent exit, copies new binary
  over old, relaunches). Linux/macOS simpler (`rename` + exec).
  Effort: 1-2 sessions. Defer: no concrete user demand and
  current safeguard already protects against installing a
  stale Bibliogon.

(D-05 closed as won't-fix 2026-05-05; archived in
[docs/roadmap-archive/2026-05.md](roadmap-archive/2026-05.md).)

---

## P5 - Speculative / Nice-to-have

- **COMIC-BOOK-PLUGIN-01** (P5): build a separate
  `bibliogon-plugin-comics` to own `book_type == "comic_book"`.
  The value is already reserved at the Pydantic schema layer
  (PB-PHASE4 Session 2) so the comics plugin can ship its own
  migration adding `panels` and `speech_bubbles` tables WITHOUT
  re-migrating the `book_type` column.
  Trigger: 3+ Comic-book authoring sessions reported, OR user
  pre-commits to a comics project, OR a contributor steps up
  with intent to build the plugin.
  Scope: new `plugin-comics` package + Panel entity migration
  (per-page panel rows, panel_grid_4 / panel_grid_6 / panel_grid_9
  layouts) + SpeechBubble entity migration (with page-OR-panel
  XOR CHECK constraint) + CRUD routes under
  `/api/books/{id}/{panels,speech_bubbles}` + comic-specific
  Playwright renderer for KDP / Comic-archive (CBZ) export.
  Frontend variant follows after the Picture-Book PageEditor lands
  in PB-PHASE4 Session 3. Plugin-discriminator is `book_type ==
  "comic_book"` (no umbrella required).
  Deferred reason: no current Comic-book authoring demand.
  PB-PHASE4 (Picture-Book) is the active user need; building two
  plugins in parallel splits attention and risks shipping neither
  well. Reserve the schema value, ship the picture-book MVP,
  validate it end-to-end with Aster, then revisit.

- **CONVERT-TO-BOOK-REVERSE-LINK-01** (P5): restore the
  `preserve_article_id_metadata` setting that Phase 1 dropped
  to satisfy the "kwargs without behaviour are forbidden"
  rule.
  Trigger: user requests a reverse-link or provenance feature
  for converted books, OR a "pull updates from source articles"
  affordance.
  Scope: add a nullable `Chapter.source_article_id` column
  (FK with `ondelete='SET NULL'` so deleting a source article
  surfaces the broken link instead of cascading the chapter
  away). Alembic revision populates as `NULL` for every
  pre-existing chapter (data not retained from past
  conversions). Re-introduce the
  `BookFromArticlesChapterSettings.preserve_article_id_metadata`
  field with a non-trivial behaviour test (per the
  lessons-learned "End-to-end behavior tests are not
  'kwarg passes through' tests"). Wire the wizard's Step 4 to
  expose the toggle. Use cases this unlocks: "show me which
  articles built this book" (Book-Editor sidebar), "update this
  chapter from its source article" (manual sync action),
  "find books that include this article" (Article-Editor
  sidebar).
  Effort: 3-5 commits (migration + schema + endpoint +
  wizard wiring + Book/Article-Editor surfaces + tests).
  Defer reason: speculative until user reports needing
  provenance. The current decoupled-lifecycle design is
  intentional; a reverse-link is opt-in and orthogonal to
  the v1 wizard flow. Filed by Phase 1 implementation
  decision, 2026-05-15.

- **CONVERT-TO-BOOK-CHAPTER-TYPE-DETECTION-01** (P5):
  smart `chapter_type` assignment for the article-to-book
  conversion. Phase 1 defaults every converted chapter to
  `chapter`; the user retypes via the Book-Editor sidebar
  after conversion.
  Trigger: user requests smart-typing during conversion, OR
  a pattern emerges across multiple bug reports of
  "manuscripta export treated my introduction as a regular
  chapter".
  Scope: heuristic in the wizard's Step 4 (or the backend
  endpoint) that maps common article-title patterns to
  `chapter_type` overrides. Candidate mappings (informed by
  the 209-article Medium corpus): `^introduction|intro$|^getting started` ->
  `introduction`; `^epilogue|conclusion|wrap[- ]?up$` ->
  `epilogue`; `^appendix` -> `appendix`;
  `^acknowledgments?` -> `acknowledgments`. The wizard's
  review step shows the planned mapping with per-row
  override before submit. Backend stays the same; the
  payload's `chapter_settings` block grows a
  `per_article_chapter_types: dict[str, ChapterType]`.
  Effort: 2-3 commits (heuristic + wizard surface + tests).
  Defer reason: ChapterType is reversible per-row in the
  Book-Editor at zero friction (3 clicks); the v1 default
  is the safer floor (no false-positive auto-types breaking
  manuscripta export). Filed by Phase 1 Q17 deferral,
  2026-05-15.

- **GH-ACTIONS-PERIODIC-AUDIT-01**: recurring CI-hygiene audit
  for GitHub Actions version drift. The 2026-05-14 sweep
  found that within 6 months of GitHub's 2025-09-19 Node 20
  deprecation, EVERY standard action we use released a new
  major. The pattern (deprecation announcement → cascade of
  major bumps across actions/* + common third-parties) is
  predictable, not exceptional. Filing it explicitly prevents
  the "we should have checked sooner" surprise on the next
  cycle.
  Trigger: 3 months since the last full CI-hygiene audit
  (last: 2026-05-14 → next due 2026-08-14), OR any Node
  runtime / platform deprecation announcement from GitHub
  before then (subscribe-able via
  https://github.blog/changelog/?tag=actions).
  Scope: re-run the full audit per the methodology in
  `.claude/rules/lessons-learned.md` "External GitHub Action
  major-version drift" — specifically the **action.yml
  `runs.using:` read**, not release-note prose (per the trap
  documented in the same lesson). Includes the deferred
  `GH-ACTIONS-OPTIONAL-BUMPS-01` items if their triggers have
  fired by then.
  Effort: S-M depending on what's drifted. Filed by the
  2026-05-14 CI-hygiene session as the explicit
  next-touchpoint.

- **GH-ACTIONS-OPTIONAL-BUMPS-01**: two optional standard-action
  bumps deferred from the 2026-05-14 CI-hygiene full audit
  (neither blocks Node-24 coverage; both are already on Node 24
  at the v5 pin):
  - ``actions/checkout`` v5 → v6: v6 introduces "persist creds
    to a separate file" (security improvement for jobs that
    checkout multiple repos in the same runner). No-op for
    single-checkout jobs, which is most of our workflows.
  - ``actions/setup-node`` v5 → v6: v6 narrows automatic
    caching from "any package manager" to "npm only".
    `frontend/package.json` does not declare a `packageManager`
    field, so the auto-caching path is dormant either way.
  Trigger: next periodic CI-hygiene audit (~2-3 months from
  2026-05-14), OR a specific need surfaces (e.g. credential
  isolation becomes relevant for a security review, or the
  frontend starts using npm via the auto-cache path). Effort:
  S per bump (single sed + commit each). Filed by the 2026-05-14
  full-audit session.

- **STARLETTE-V1-AWAIT-FASTAPI-01** (BLOCKED, upstream):
  bump ``starlette`` from 0.46.2 to 1.0.0 across the
  backend + 11 plugins. Blocked on FastAPI shipping a
  release whose upper-bound for starlette opens to
  ``>=1.0``. Surfaced during the dep-update audit
  2026-05-12 Phase 3: ``poetry update`` (bare) on a
  plugin pulled starlette 1.0.0 because fastapi 0.136.1
  apparently relaxed its starlette range. We reverted
  that plugin's lock; the starlette 1.0 upgrade is a
  cross-surface coordinated bump (FastAPI + Starlette +
  all 11 plugins + backend, all at once) and should not
  ship piecemeal. Trigger: FastAPI ships a release that
  pins ``starlette = ">=1.0"`` as its lower bound (not
  just relaxes the upper bound), making the bump a
  forced upgrade. Filed by dep-update audit 2026-05-12.

- **PLUGIN-PYDANTIC-COORDINATED-BUMP-01**: realign
  plugin Pydantic versions with the backend. Audit
  2026-05-12 found 9 of 11 plugins still at pydantic
  2.12.5 while backend is at 2.13.3 (now 2.13.4 after
  the medium-import plugin's lock got re-resolved
  during the audit). Not a runtime conflict (both 2.x
  compatible), just a "plugins lag backend" doc
  finding. The naive fix (``make lock-all-plugins``)
  is a no-op when nothing in plugin pyprojects
  changed; ``poetry update`` (bare) per plugin pulls
  the latest pydantic BUT also surfaces high-risk
  transitives like starlette 1.0 via fastapi 0.136.1.
  Mandatory: per-plugin ``poetry update pydantic
  pydantic-core`` (allowlist subset, NOT bare). 11
  plugins × 2 packages = 11 commits or one bundled
  commit. Trigger: ANY of (a) plugin CI fails due to
  pydantic version drift, (b) a backend feature needs
  a pydantic 2.13+ API that plugins also need, (c) a
  coordinated dep-update session is planned (where
  starlette + FastAPI + Pydantic bump together as a
  unit). Filed by dep-update audit 2026-05-12 Phase 3.

- **CLICK-V8-3-AWAIT-GTTS-01** (BLOCKED, upstream):
  bump ``click`` from 8.1.8 to 8.3.3 in the backend
  (and transitively across plugins). Blocked on gtts
  (Google Text-to-Speech) opening its pin
  ``click >=7.1,<8.2``. Used by the audiobook plugin's
  TTS adapter path. Trigger: gtts releases a version
  that opens its click upper bound to ``<9`` or
  ``<8.4``. Filed by dep-update audit 2026-05-12
  Phase 4.5 (click was in the medium-risk batch but
  poetry refused to move it due to the upstream pin).

- **MEDIUM-COMMENT-MANUAL-ENTRY-01**: manual "Add
  comment" UI in the article editor that creates an
  ``ArticleComment`` with ``imported_from = "manual"``
  rather than ``"medium"``. The schema already supports
  this via the ``imported_from String(50)`` column; no
  migration needed. Trigger: user demand for capturing
  comments-on-my-articles in Bibliogon for archival.
  Surfaced 2026-05-12 after the user verified Medium's
  HTML export is "your data only" by design — replies
  others left on the user's articles are not included
  in the export, and Bibliogon cannot import what
  Medium doesn't expose. The manual-entry workflow is
  the only forward-compatible path to archive incoming
  comments. Scope hint: editor sidebar gains an "Add
  comment" button next to the existing
  ``ArticleCommentsPanel`` heading; on click opens a
  small modal collecting author + body_text +
  optional published_at + optional responds_to_url
  (the URL of the source thread the user is
  transcribing from). The ``responds_to_article_id``
  is pre-filled with the open article's id. Effort: S
  (one new component + one POST endpoint that the
  comments router currently lacks; the GET / DELETE
  paths exist already).

- **COMMENTS-COUNT-PERF-01**: switch
  ``Article.comments_count`` from a ``len()``-on-relationship
  property to a JOIN-counted subquery against
  ``article_comments``. Trigger: per-article comment counts
  routinely above ~50, where SQLAlchemy materialising every
  row just to count it becomes wasteful. Today the property
  ships with a ``len()`` over the relationship list filtered
  by ``deleted_at IS NULL``; acceptable while typical counts
  stay 0-5. The subquery rewrite is a drop-in replacement on
  the model side; no schema change, no API change. Filed
  alongside MEDIUM-COMMENTS-UI-01 commit 1.

- **TESTCLIENT-HARMONIZE-01**: harmonise the 89 backend
  ``TestClient`` instantiation sites onto the lifespan-aware
  fixture pattern. Test-infrastructure audit 2026-05-12
  finding 0.4: 23 files use module-level
  ``client = TestClient(app)`` (no ``with``, so the FastAPI
  lifespan never fires and plugin routes are not mounted),
  34 files use the fixture-with-``with`` pattern correctly,
  3 files use inline-per-test. The lessons-learned rule
  "Tests must run through ``with TestClient(app) as c:``"
  documents the lifespan requirement but the heterogeneity
  persists. Trigger: a real "plugin route returns 404 in
  test" surprise from a no-lifespan file, OR a session
  dedicated to test-fixture cleanup. Refactor blast radius:
  large (89 sites, hidden state risks from shared
  session-scope clients). Filed by test-infrastructure
  audit 2026-05-12.

- **WALKER-HYPOTHESIS-01**: introduce Hypothesis
  property-based tests for the Medium-import walker
  (``plugins/bibliogon-plugin-medium-import/bibliogon_medium_import/walker.py``).
  Test-infrastructure audit 2026-05-12 finding 0.7
  (Hypothesis option): zero ``@given`` usages today; the
  walker's example-based + regression-pin coverage is
  adequate. Candidate invariants if promoted:
  ``imageFigure`` count equals source ``<img>`` count;
  body-text length never changes more than 1% across
  re-parses; ``ParsedPost.is_comment`` is stable across
  whitespace-only HTML variations. Trigger: a third
  walker bug class slips through example-based tests
  (already had two: ``find`` vs ``find_all``,
  ``imageFigure`` vs ``image``). Effort: M, payoff
  dependent on bug rate. Filed by test-infrastructure
  audit 2026-05-12.

- **TESTCONTAINERS-EVAL-01**: evaluate Postgres-via-
  Testcontainers for backend integration tests.
  Test-infrastructure audit 2026-05-12 finding 0.7
  (Testcontainers option): Bibliogon ships SQLite as
  default and intended production DB (CLAUDE.md); no bug
  history of SQLite-vs-Postgres divergence; adopting
  Testcontainers would add 5-30s startup per CI run for
  zero documented payoff. Trigger: production-DB
  migration to Postgres, OR a documented SQLite-vs-Postgres
  divergence bug surfaces in production. Filed by
  test-infrastructure audit 2026-05-12.

- **MEDIUM-IMPORT-EXCERPT-AUTOFILL-01**: auto-populate
  ``Article.excerpt`` on Medium import, mirroring the existing
  seo_title / seo_description defaults shipped in commit
  ``2062393``. Trade-off: excerpt is conceptually similar to
  seo_description (both summarize the article), so duplicating
  the subtitle into both might feel redundant; alternatively,
  excerpt could derive from the first paragraph of body text
  with the existing heuristic-fallback rejection we applied to
  seo_description. No user complaint yet — the seo_description
  default covers the dashboard-tile use case. Promote to P2 if
  a user reports an empty-excerpt issue on imported articles.

- **AR-BULK-ASYNC-PROGRESS-01**: async bulk export with progress
  UI for selections >50 articles. The 2026-05-06 ship runs the
  request synchronously with a 180s server-side Pandoc timeout,
  which is fine for the typical workflow (<50 articles). For
  larger combined PDF runs the user sees a frozen browser tab
  until completion. Future work: convert to the async-job pattern
  used by audiobook export (background worker + SSE progress
  stream + persisted artifact). Effort: 1-2 sessions. Trigger:
  first user report of perceived hang, OR a real-world selection
  that exceeds 180s.

- **D-02 follow-ups**: macOS Intel universal2 build + code signing.
  Effort: M each. Deferred until user demand.

- **LAUNCHER-I18N-NATIVE-REVIEW-01**: native-speaker review for
  the three pending-review launcher i18n catalogs (pt, tr, ja)
  shipped in v0.30.0. Each catalog carries a
  `_meta.review_status: "pending native speaker"` block;
  `launcher/bibliogon_launcher/locales/REVIEW_STATUS.md`
  documents the per-language status and the PR-based
  correction submission flow. The
  `test_pending_review_catalogs_carry_marker` parity test
  enforces the marker contract, and `test_user_validated_*`
  enforces that markers are removed in the same change that
  promotes a language to validated. Trigger: native-speaker
  contact for any of pt/tr/ja, or a user-reported correction
  PR. Effort: S per language for an experienced reviewer
  (95 keys, mostly mechanical drift detection).
  - **Public surface:** GitHub issue
    [#18](https://github.com/astrapi69/bibliogon/issues/18)
    is the call-for-reviewers, labeled `help wanted` +
    `good first issue` + `documentation`. A passing-by
    pt / tr / ja speaker can find it without grepping the
    repo. Corrections land via PR per the flow in
    REVIEW_STATUS.md.
  - **Decision threshold:** 2026-08-07 (3 months after the
    v0.30.0 release). At that point an explicit decision
    lands on each marker: drop-the-marker (accept as
    canonical, with or without a review having happened),
    or continue-waiting. The threshold is also documented
    as a watch-list item in the v0.30.0 retrospective.

- **BISAC-DATABASE-LOOKUP-01** (P5): bundle the BISAC subject
  headings catalog with autocomplete + validation against real
  codes (vs. the current Bug-9 MVP's free-text + 9-char
  alphanumeric format check).
  Trigger: Bibliogon obtains a BISG license, OR a user requests
  autocomplete strongly enough to justify the license cost
  (~$590/year for the under-$1M-revenue tier as of 2026-05).
  Scope: ship the BISAC catalog as a JSON / SQLite resource
  inside the KDP plugin (or a new lightweight ``plugin-bisac``
  if licensing requires a separation), wire an autocomplete
  combobox into the BookMetadataEditor Marketing tab, replace
  the format-only validator with code-existence validation,
  surface the human-readable subject heading next to the code
  in the UI.
  Defer reason: BISG license terms are incompatible with
  Bibliogon's local-first + donation-based model in the v0.33.0
  state. The free-text + format-validation MVP (Bug 9 D3) is
  sufficient for the current user base — KDP best practice is
  ≤ 3 codes per book, and the format check catches the most
  common typo class (transposed letter / digit). Filed during
  the Bug 8 + Bug 9 Pre-Inspection so the deferred
  enhancement-path is visible if the licensing landscape
  shifts.

---

## Blocked / Upstream Wait

Items waiting on external triggers. Re-audit monthly via
`make check-blockers`. Do not attempt to advance these without an
unblock signal. ROADMAP entries (DEP-02, DEP-05, DEP-09, SEC-01)
are listed in the cross-reference at the top of this file; the
table below covers backlog-only waiting items + a quick-poll
summary.

| Item | Blocked on | Unblock condition |
|------|-----------|-------------------|
| DEP-02 (TipTap 3) | Upstream npm publish of `@sereneinserenade/tiptap-search-and-replace@0.2.0` | npm publish (default); path B (`prosemirror-search` adapter ~50-80 LOC) available on explicit go-ahead |
| DEP-05 (elevenlabs 2.x) | Real paid-API verification (substantial 0.2.27 -> 2.45.0 jump, careful audit required) | Schedule a dedicated audiobook test session with a live ElevenLabs key |
| PGS-04-FU-01 | First user report of cross-language structural divergence | User report |
| Manual launcher smoke tests (#2/#3/#4) | Real hardware (Windows / macOS / Linux) availability | Hardware access |
| Manual content-safety smoke (#8 Part 2 beforeunload) | Aster's local browser | Manual run |
| Manual UI smoke (#5) | Aster's local browser | Manual run |

---

## Maintenance / hygiene

Recurring upkeep, low priority but worth scheduling:

- **Test count verification** before any release. Run the
  per-plugin iteration from `ai-workflow.md` "Numeric claims
  verification". Don't grep.
- **`poetry show --outdated` + `npm outdated`** before each
  release per release-workflow.md Step 4b.
- **`npm audit --audit-level=high`** monthly (next: 2026-06-02).
- **Help docs review**: every shipped feature must update
  `help.yaml` and the help/{lang}/ pages. Audit on each release.
- **ROADMAP cleanup**: refresh the header line + "next active
  theme" sentence on each release. Move any item shipped outside
  its theme back into the right theme entry.
- **Dependency currency** per `lessons-learned.md`: only stable
  releases, no beta/RC/alpha. 2-week soak for new majors.
- **Systematic audit pass** quarterly (per
  `ai-workflow.md` "Test coverage audits → When to run"). The
  drop-in prompt lives at
  [.claude/prompts/audit.md](../.claude/prompts/audit.md);
  paste into a fresh Claude Code session at the repo root. It
  triages against documented standards in 4 sections (Test
  Validity / Code Quality / Infrastructure / Documentation)
  and is read-only — no code is modified.

---

## How to use this file

- Pick from the highest non-empty tier when starting a session
  and there's no user-driven priority override; consult ROADMAP
  for the canonical task description on cross-referenced items.
- When a session defers a sub-item, add it under the matching
  tier with a `*-FU-NN` ID and one-line "why deferred".
- When an item ships, **delete the row** from this file. The
  CHANGELOG / ROADMAP archive records the history; the backlog
  is forward-looking only.
- When the top tier changes, re-rank explicitly in this file
  before starting work, not implicitly during a session.
- Don't grow past 50 items. If it grows, split by category into
  themed files (`docs/backlog/dependencies.md`, etc.).
