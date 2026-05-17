# Session 6 PDF Export — Pre-Inspection Audit (preserved 2026-05-17)

**Status:** Audit deferred. Original priority was Session 6 (PDF
Export); user feedback from Session 4 manual-smoke surfaced four
layout-quality weaknesses that take priority. Session 6 paused
until Session 4b/4c (Layout Visual-Polish + Layout-Configuration)
closes and user-validates the foundation. This document preserves
the Session 6 Pre-Inspection findings so when Session 6 actually
starts, the audit work doesn't get re-done — just re-confirmed
against any state changes.

## Why Session 6 paused

User manual-smoke on Session 4 identified that PDF would
**exactly reproduce the current layout issues** — building on a
wackelig foundation. The four weaknesses surfaced:

1. `image_top_text_bottom`: image too small, centred; text
   left-aligned. Disharmonisch.
2. `image_left_text_right`: ratio 30/30/40 instead of 60/40;
   image-replace button at the bottom instead of on-image.
3. `speech_bubble`: image too small; bubble not configurable
   (position, opacity).
4. `image_full_text_overlay`: not natural (text-position or
   opacity ratio off).
5. `text_only`: okay.

Plus user-confusion:
- "Image upload in verschiedenen Layouts — wie?"
- "Text tippen in verschiedenen Layouts — wie?"
- Drag-reorder nach Layout-Change unklar getestet

Session 4b/4c closes these gaps. Session 6 resumes after.

---

## Track 1 — Existing PDF Infrastructure (audited 2026-05-17)

### Prose-book PDF pipeline

Lives in `plugins/bibliogon-plugin-export/`:

- Flow: `book.chapters` → `scaffold_project()` writes Markdown files
  → `run_pandoc()` → manuscripta → Pandoc → LaTeX → PDF
- Endpoint: `GET /api/books/{book_id}/export/pdf` (sync) +
  `POST .../export/async/pdf` (async + SSE progress,
  job_store-backed)
- Battle-tested for prose; covered by pytest under
  `bibliogon-plugin-export/tests/`

### CRITICAL naming collision

Manuscripta's `BookType` enum is `EBOOK | PAPERBACK | HARDCOVER |
AUDIOBOOK` — the **PRINT EDITION** concept. Completely orthogonal
to Bibliogon's `Book.book_type` (`prose | picture_book |
comic_book`) — the **CONTENT DISCRIMINATOR**. The export plugin's
existing `book_type` parameter is the manuscripta concept.
Different namespaces, same name. **Flag in commit messages when
Session 6 starts** to avoid confusion for future contributors.

### Half-wired CSS file discovery

[`plugins/bibliogon-plugin-kinderbuch/bibliogon_kinderbuch/templates/kinderbuch.css`](../../plugins/bibliogon-plugin-kinderbuch/bibliogon_kinderbuch/templates/kinderbuch.css)
exists with CSS rules for 4 of 5 layouts. But:

1. **No code consumes it** (grep confirmed zero references in
   `.py` / `.yaml`).
2. Uses HYPHENATED layout names (`image-top-text-bottom`) while
   Session 4's backend schema uses UNDERSCORES
   (`image_top_text_bottom`).
3. Missing `speech_bubble` (Session 4 addition).
4. Comic Sans MS font (not embedded for PDF; would fall back).

**4th instance of half-wired-feature-lifecycle.** Recommendation
for Session 6: DELETE in Commit 1. Note: Session 4b/4c may
choose to update or delete this file ahead of Session 6 — if so,
the Session 6 commit message just confirms the close.

### Plugin dependency direction

`bibliogon-plugin-kinderbuch` declares `depends_on = ["export"]`.
So kinderbuch can import from export, not the reverse. Important
for Session 6's architecture decision.

---

## Track 2 — KDP Picture-Book PDF Requirements

| Spec | Value | Notes |
|---|---|---|
| Common sizes | 8.5×8.5 square, 8×10, 8.5×11 portrait | 8.5×8.5 square is the canonical picture-book format |
| DPI | 300 minimum | KDP rejects below |
| Color | RGB or CMYK | RGB simpler; no ICC profile needed |
| Bleed | 0.125" if used | KDP accepts trim-only files (no bleed) |
| Margins | 0.5" safe area | Standard |
| Font | Embedded fonts required | Comic Sans must NOT be relied on |
| Typography | 18-30pt body text for children | Larger than prose |
| PDF metadata | Title + Author + Description required | ISBN optional |

KDP picture-book requirements:
<https://kdp.amazon.com/help/topic/G201953030>

---

## Track 3 — Implementation Strategy

Three additional findings sharpened the original 4-option
analysis:

1. **The existing manuscripta path CANNOT render picture-books**
   — it consumes `book.chapters` which picture-books don't have.
   Picture-book PDF needs a fundamentally separate code path, not
   an extension of manuscripta.
2. **Session 4's PageCanvas uses CSS Grid + region wrappers** —
   the same primitives WeasyPrint natively supports for
   paged-media. Direct semantic alignment.
3. **Pandoc/LaTeX is a poor fit for picture-book layouts** —
   image-overlay text, full-bleed images, speech-bubble
   positioning all require custom LaTeX templates per layout.
   WeasyPrint handles them with stock CSS.

**Recommended: Option A (WeasyPrint server-side).** Reasons:

- Bibliogon Lokal-First principle (no browser runtime, no
  external server)
- BSD-style license (MIT-compatible)
- CSS Grid + paged-media native — Session 4's layout CSS port
  directly
- Mature (>10 years), Mozilla-style print-tested
- Server-side templates testable independently of frontend
- Single Python dependency (vs. headless-browser
  containerisation)

**Rejected:**

- **Option C (headless browser)**: heavyweight; adds Playwright +
  Chromium runtime to backend; 100s of MB Docker image overhead;
  better architectural answer but worst pragmatic for v1
- **Option D (Pandoc)**: poor fit per finding #3
- **Option B (browser print)**: KDP-quality questionable per
  audit

WeasyPrint adds a new backend dependency. Per architecture rules
this needs explicit surfacing — license OK (BSD-3-clause),
install footprint moderate (~10MB Python + cairo/pango system
libs already standard on most Linux distros, present in standard
Python Docker images).

---

## Sub-decisions (preserved for Session 6 start)

When Session 6 actually starts, re-confirm these against any
state changes from Session 4b/4c. They should still hold unless
Session 4b/4c materially changed the layout architecture.

### D1 — Plugin vs Core

**Recommended: extend `bibliogon-plugin-export`** with a new
`picture_book_pdf.py` module + dispatcher in the existing
`export()` route. Rationale:

- The export plugin already owns all `GET /api/books/{id}/export/*`
  routes
- Adding book_type-dispatch inside the existing `export()` route
  is one new branch; URL stays stable
- Picture-book PDF is "just another format-routing decision"
  alongside epub/pdf/docx/html/markdown/audiobook/project
- kinderbuch already `depends_on = ["export"]` so the dependency
  direction works

Alternative (kinderbuch hosts the renderer + export plugin calls
via pluggy hook) is cleaner architecturally but adds
plugin-system overhead. For a single new format-route, the
simpler colocation wins.

### D2 — PDF Library

**Recommended: WeasyPrint.** Concrete dep: `weasyprint = "^61.0"`
(current stable, BSD-3-clause).

### D3 — KDP Format Scope (MVP)

**Recommended: 8.5×8.5 square ONLY** for v1.

- Canonical picture-book size, covers the typical use case
- Aster's "Nasenbohrer" test book targets this
- Multi-format support is N×N matrix work that fights
  commit-count stop-condition
- Other formats are user-trigger-gated future work

Backlog item to file at Session 6 close:
**`PICTURE-BOOK-PDF-KDP-FORMATS-01`** (P3) for additional formats
with trigger "user requests 8×10 / 8.5×11 / landscape OR Aster's
second picture-book book has different dimensions".

### D4 — Print-Specific CSS

Recommended for v1:

- Page size: `@page { size: 8.5in 8.5in; }`
- Margins: 0.5in safe-area; **NO explicit bleed marks** (KDP
  accepts trim-only)
- Color: RGB (no ICC profile injection)
- Embedded font: `@font-face` for a children's-book-friendly
  font — Atkinson Hyperlegible / Andika (Google Fonts, OFL
  licensed). Specific choice to confirm with user at Session 6
  start.

Backlog item to file at Session 6 close:
**`PICTURE-BOOK-PDF-BLEED-MARKS-01`** (P3) for bleed support
with trigger "user reports KDP rejects file for missing bleed OR
Aster requests print-shop quality".

### D5 — Cover Page Treatment

Recommended:

- **Page 1**: cover image (from `book.cover_image` field, Design
  tab) — full-bleed
- **Page 2**: title page (book.title centred + book.author below)
- **Page 3-N**: picture-book pages from `pages` table, ordered by
  position, rendered per their `page.layout`

NO copyright/imprint page in v1 (KDP auto-inserts a copyright
line during their print process). Backlog item at Session 6
close: **`PICTURE-BOOK-PDF-FRONT-MATTER-01`** (P3) for
dedication/copyright/imprint pages with trigger "user requests
author-controlled front-matter".

### D6 — Export-Trigger UX

Recommended **both** entry-points (mirroring prose flow's
two-place pattern):

- **Primary**: button in PageEditor header next to the existing
  Metadata button — "Export PDF"
- **Secondary**: button in BookMetadataEditor Design tab (only
  when `book_type === "picture_book"`) — same callback

Async with progress modal — **reuse `AudioExportProgress` modal
pattern** (already proven for audiobook). The async export flow
is already wired (`POST /api/books/{id}/export/async/pdf`); the
picture-book branch slots into the dispatcher.

### D7 — Kill the dead kinderbuch.css

**Recommended: DELETE in Commit 1.** Note: Session 4b/4c may
have already addressed this. If so, the Session 6 commit message
just confirms the close. If still present at Session 6 start:
fresh-write the WeasyPrint-targeted CSS rather than refactor the
hyphenated/Comic-Sans version.

---

## Plan summary (preserved)

Estimated **8 commits** (matching original upper estimate):

1. `feat(backend): WeasyPrint dependency + picture-book PDF
   generator module (skeleton) + pytest unit tests`
2. `feat(backend): book_type dispatch in export endpoint +
   integration tests`
3. `feat(backend): metadata embedding (PDF properties: Title,
   Author, Description, ISBN if set) + pytest`
4. `feat(frontend): PageEditor header Export-PDF button + reuse
   AudioExportProgress modal + Vitest`
5. `feat(frontend): BookMetadataEditor Design-tab Export-PDF
   button (picture_book only) + Vitest`
6. `feat(i18n): export-PDF labels in 8 catalogs`
7. `test(e2e): Playwright spec covering full PageEditor → Export
   PDF → download flow + prose regression pin`
8. `docs(backlog,lessons-learned): file
   PICTURE-BOOK-PDF-KDP-FORMATS-01 +
   PICTURE-BOOK-PDF-BLEED-MARKS-01 +
   PICTURE-BOOK-PDF-FRONT-MATTER-01 + document the
   dead-kinderbuch.css closure as 4th half-wired instance`

If 4+5 (both UI buttons) collapse → **7 commits**.

---

## Stop-conditions (preserved for Session 6 start)

- Existing PDF infra exists for prose → confirmed; aligning with
  it via dispatch
- WeasyPrint license check → BSD-3-clause, MIT-compatible ✓
- KDP bleed handling → deferred (D4 + backlog)
- Frontend layout-rendering bugs from Session 4 → **Session
  4b/4c addresses this BEFORE Session 6**
- Commit count > 10 → surface; current estimate 7-8
- Parallel-work coordination → at Session 6 start, re-confirm
  parallel coordination needs

---

## State changes to re-confirm at Session 6 start

When Session 6 actually starts, re-audit these against any
changes from Session 4b/4c + intervening sessions:

1. Does `kinderbuch.css` still exist? (Session 4b/4c may have
   deleted it.)
2. Did Session 4b/4c change the layout architecture beyond
   visual-polish + per-layout configuration? (If yes, the
   WeasyPrint template structure may need re-thinking.)
3. Did `speech_bubble_config` write-path land in Session 4b/4c?
   (Session 6's PDF needs to honour the persisted config —
   anchor_position, opacity — when rendering speech_bubble.)
4. Are there new layouts beyond the 5 documented? (Comic-book
   work may have introduced more.)
5. Backlog item IDs reserved: `PICTURE-BOOK-PDF-KDP-FORMATS-01`,
   `PICTURE-BOOK-PDF-BLEED-MARKS-01`,
   `PICTURE-BOOK-PDF-FRONT-MATTER-01`. Verify no collisions.

---

## Sessions ordering as of 2026-05-17

| Session | Status | Scope |
|---|---|---|
| 1-3 | Closed | Picture-book backend + frontend authoring foundation |
| 4 | Closed | Layout-rendering + visual-containers (5 layouts spatially distinct) |
| 5 | Closed (user-smoke in flight) | Book-Metadata integration for picture-books |
| **4b/4c** | **Next** | **Layout Visual-Polish + Layout-Configuration (re-proportioning + speech-bubble config write-path)** |
| **6** | **After 4b/4c GO** | **PDF Export (this audit applies)** |
| 7 | After 6 | EPUB3 export |
| 8+ | Future | Onboarding + polish + comic-book |
