# KDP-Publishing-Wizard Pre-Inspection — 2026-05-24

**Backlog item:** `KDP-PUBLISHING-WIZARD-01` (P2 STRATEGIC, filed
2026-05-19; strategic-direction gate explicitly opened by user
2026-05-24).
**Audit scope:** read-only inventory across 7 tracks; deliverable
is THIS document. NO implementation planning until A1–A5 are
adjudicated.
**Source:** repo state at commit `1b84ad0` (immediately after
`RECURRING-COMPONENT-AUDIT-01` housekeeping close).
**Pre-Inspection prompt provenance:** Strategic-Advisor, dated
2026-05-23. Neither
`docs/journal/cc-prompt-kdp-publishing-wizard-pre-inspection.md`
nor `/mnt/user-data/outputs/...` resolved at audit time; the
7-track structure from the user's session instruction is the
canonical scope.

---

## Executive summary

- **plugin-kdp's backend surface exists but is operationally
  inert.** 7 endpoints under `/api/kdp/*` (metadata, cover
  validation, categories, check-metadata, changelog CRUD) ship +
  pass tests, but **zero frontend code** calls any of them. The
  plugin manifest declares two `sidebar_actions` (`kdp_metadata`,
  `kdp_cover_check`); no UI renders the manifest. Reference:
  [plugins/bibliogon-plugin-kdp/bibliogon_kdp/routes.py:15-205](../../plugins/bibliogon-plugin-kdp/bibliogon_kdp/routes.py#L15-L205),
  [frontend/src/api/client.ts:2952](../../frontend/src/api/client.ts#L2952).
  This is the canonical **Half-Wired-Visible-in-Production**
  shape — the wizard's natural surface is to close the half-wired
  edge by routing user actions through the existing endpoints.
- **Editorial metadata is rich; commercial / launch metadata is
  absent.** The `Book` model carries every editorial field KDP
  needs (titles, ISBNs, ASINs, categories, BISAC codes,
  cover_image, html_description, backpage_description, keywords).
  It carries **nothing** about price, territory, royalty plan,
  KDP-Select enrollment, ARC reviewers, or launch checklist
  state. The wizard's commercial-half scope (Track 5 finding)
  REQUIRES schema additions; the editorial-half scope can ride
  on what already exists.
- **`ConvertToBookWizard` is the canonical wizard-pattern.**
  Radix Dialog + step-index `useState` + conditional per-step
  render, 6 steps, `convert-to-book-wizard-{step}-{slot}` testid
  namespace, structured 422 validation routing back to the
  offending step. Reference:
  [frontend/src/components/articles/ConvertToBookWizard.tsx:1-91](../../frontend/src/components/articles/ConvertToBookWizard.tsx#L1-L91).
  `AiSetupWizard` is the simpler 3-step sibling
  ([frontend/src/components/AiSetupWizard.tsx:1-80](../../frontend/src/components/AiSetupWizard.tsx#L1-L80)).
  The KDP wizard inherits this pattern; no new shape needed.
- **Three book_type discriminator branches exist; the wizard
  must respect them.** `prose` uses pandoc/manuscripta (epub +
  pdf + docx + audiobook); `picture_book` + `comic_book` use
  WeasyPrint (pdf only, 5 KDP trim sizes shared). KDP accepts
  ebook (epub/pdf) + paperback + hardcover for all three; the
  wizard's pre-launch checklist must check **different gating
  conditions per book_type**. See Track 4 matrix below.
- **No "KDP-ready package" export target exists today.** Closest
  thing is `GET /api/books/{id}/export/batch` which bundles
  epub + pdf + docx into a ZIP — but it lacks the metadata.json,
  the validated cover, and the publishing-state side-files KDP
  needs. The wizard's final step **must define** what a
  KDP-package contains (Q in A4).

The Pre-Inspection finds the wizard is feasible on the existing
backend surface, with two schema additions
(`BookPublishingState` + `ArcReviewerLog`) required for the
commercial-half scope. The pattern + endpoints + book_type
discriminator are all already shaped; the gaps are commercial
metadata + the export-package format + UI wiring.

---

## Track 1 — Backend API audit

### Existing endpoints (relevant to KDP)

#### plugin-kdp (`/api/kdp/*`)

| Method | Path | Purpose | Tested |
|---|---|---|---|
| POST | `/api/kdp/metadata` | Generate KDP-shaped metadata dict from book fields | yes |
| POST | `/api/kdp/validate-cover` | Validate cover image dimensions / DPI / aspect ratio / format / ICC profile | yes |
| GET | `/api/kdp/categories` | List 26-entry KDP category catalogue | yes |
| POST | `/api/kdp/check-metadata` | Run completeness checker (returns errors + warnings per field) | yes |
| POST | `/api/kdp/changelog` | Record a publication event for a book | yes |
| GET | `/api/kdp/changelog/{book_id}` | Read publication history | yes |
| GET | `/api/kdp/changelog/{book_id}/export` | Markdown export of the history | yes |

References:
[plugins/bibliogon-plugin-kdp/bibliogon_kdp/routes.py:99-205](../../plugins/bibliogon-plugin-kdp/bibliogon_kdp/routes.py#L99-L205),
[plugins/bibliogon-plugin-kdp/bibliogon_kdp/metadata_checker.py:66-230](../../plugins/bibliogon-plugin-kdp/bibliogon_kdp/metadata_checker.py#L66-L230),
[plugins/bibliogon-plugin-kdp/bibliogon_kdp/cover_validator.py:28-155](../../plugins/bibliogon-plugin-kdp/bibliogon_kdp/cover_validator.py#L28-L155).

#### Core books router (`/api/books/*`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/books` + `/api/books/{id}` | Read + detail |
| POST | `/api/books` | Create (with `book_type` discriminator) |
| PATCH | `/api/books/{id}` | Update with `_IMMUTABLE_BOOK_FIELDS` guard rejecting `book_type` changes |
| POST | `/api/books/from-template` + `/api/books/from-articles` | Create-from variants |

Reference:
[backend/app/routers/books.py:140-705](../../backend/app/routers/books.py#L140-L705).
Book PATCH supports every KDP-editorial field via `BookUpdate`
schema (Track 5 detail).

#### plugin-export (`/api/books/{id}/export/*`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/{fmt}` | Synchronous export (epub / pdf / docx / html / markdown / project / audiobook) with `book_type` print-edition query param (ebook / paperback / hardcover / audiobook) |
| POST | `/async/{fmt}` | Async export with SSE progress (audiobook canonical path) |
| GET | `/batch` | epub + pdf + docx as one ZIP |
| GET | `/validate-epub` | epubcheck wrapper |

Reference:
[plugins/bibliogon-plugin-export/bibliogon_export/routes.py:781-1000](../../plugins/bibliogon-plugin-export/bibliogon_export/routes.py#L781-L1000).

### KDP-specific gaps in the API surface

1. **No `/api/kdp/wizard/state/{book_id}` endpoint** — the wizard
   needs to persist + retrieve per-step state (current step,
   pricing, ARC list, launch checklist completions) across
   sessions. The wizard cannot live in localStorage alone
   because (a) launch state must survive a clean browser cache,
   (b) the export-package step needs to read the same state on
   the server side. New endpoint required.

2. **No `/api/kdp/pricing/calculate` endpoint** — KDP royalty
   calculations (35% vs 70% plans, delivery cost deductions,
   region multipliers for US/EU/UK/JP/IN) are pure math but live
   nowhere today. The wizard's pricing step needs this. New
   endpoint required.

3. **No `/api/kdp/arc/{book_id}` endpoints** — ARC reviewer
   tracking has no shape today. New CRUD endpoints required (see
   Track 5 schema additions).

4. **No `/api/kdp/package/{book_id}` endpoint** — the final-step
   export-package generation. The natural shape is to mount it
   under plugin-kdp (NOT plugin-export) because the package
   composition is KDP-specific. plugin-kdp would call out to
   plugin-export for the manuscript + use cover_validator + use
   the metadata_checker output for the bundled metadata.json.
   This is the FIRST plugin-to-plugin internal API call in
   Bibliogon — see Q in A3.

### Operational note: changelog persistence path

`plugins/bibliogon-plugin-kdp/bibliogon_kdp/changelog.py:11` sets
`_CHANGELOG_DIR = Path("config/changelogs")` — a CWD-relative
path. Per the **Filesystem isolation** lessons-learned rule, all
production data MUST live outside the project tree via
`app.paths.get_data_dir()`. The changelog persistence is a
**pre-existing half-wired surface** that the wizard will surface
+ amplify. Recommendation: file
`KDP-CHANGELOG-PATH-ISOLATION-01` (P2) as the wizard's first
prerequisite, OR include the fix inside the wizard's first
implementation commit.

---

## Track 2 — Frontend wizard-component audit

### Wizard-pattern survey

Bibliogon has 3 wizards today, plus an inline-stepped modal:

| Component | LOC | Pattern | Steps |
|---|---|---|---|
| `ConvertToBookWizard` | 1430 | Radix Dialog + step-index useState + conditional render + 422-routing | 6 |
| `AiSetupWizard` | 342 | Radix Dialog + step-index useState | 3 |
| `ImportWizardModal` | 403 | Radix Dialog + xstate state machine ([machines/wizardMachine.ts:1-340](../../frontend/src/components/import-wizard/machines/wizardMachine.ts)) | 5 (Detecting / Preview / Executing / Success / Error) |
| `CreateBookModal` | (not wizard — collapsible single-form) | step 1 required, step 2 optional Radix Collapsible | 2 |

### Recommendation for KDP wizard

`ConvertToBookWizard` is the canonical pattern: linear flow,
hand-rolled step state, structured 422 routing. The
xstate-machine shape in `ImportWizardModal` is heavier and only
justified there because of the upload → detect → preview →
execute → success/error branching tree. KDP's wizard has linear
steps (no branching) so the simpler `useState(step)` pattern
suffices.

### Reuse candidates (pure-presentational extractions)

The KDP wizard will introduce overlap with existing components.
Per the **Recurring-Component Unification Rule** (2-surface
threshold), each candidate below should be evaluated at session
start:

| Component | Origin | Reuse-in-KDP-wizard |
|---|---|---|
| `AuthorSelectInput` ([frontend/src/components/AuthorSelectInput.tsx](../../frontend/src/components/AuthorSelectInput.tsx)) | RCU candidate #4 (shipped 2026-05-23) | Step-N "Author + co-authors" |
| `CategoryInput` ([frontend/src/components/CategoryInput.tsx:1-153](../../frontend/src/components/CategoryInput.tsx#L1-L153)) | Bug 9 | Step "KDP Categories" — wiring `suggestions` to `/api/kdp/categories` closes `KDP-CATEGORIES-WIRE-TO-CATEGORYINPUT-01` as a side-effect (per the audit's own pairing note) |
| `BisacCodeInput` (Bug 9 sister) | Bug 9 | Step "BISAC codes" |
| `KeywordInput` (Bug 9 sister) | Marketing tab existing | Step "Keywords (max 7)" |

A new wizard-internal component — `LaunchChecklistRow` (read +
write each row; consumes metadata_checker output) — is the only
genuinely new shape. NO existing surface has equivalent shape;
ship as a new component scoped under
`frontend/src/components/kdp-wizard/`.

### Testid namespace recommendation

Per the **Testid namespace pinning** rule:
`kdp-publishing-wizard-{step}-{slot}`. Mirrors the
`convert-to-book-wizard-{step}-{slot}` pattern, scoped per the
KDP context. E2E spec at `e2e/smoke/kdp-publishing-wizard.spec.ts`
walks every pinned slot positively (prevents G2-F2-style silent
skip).

---

## Track 3 — Plugin-kdp integration surface

### Current state

- **Plugin class**: `KdpPlugin(BasePlugin)`, `name="kdp"`,
  `version="1.0.0"`, `depends_on=["export"]`,
  `license_tier="core"`.
  Reference:
  [plugins/bibliogon-plugin-kdp/bibliogon_kdp/plugin.py:1-41](../../plugins/bibliogon-plugin-kdp/bibliogon_kdp/plugin.py#L1-L41).
- **Hook coverage**: NONE. plugin-kdp declares no `@hookimpl`
  for any of the 4 `BibliogonHookSpec` hookspecs
  (`export_formats`, `export_execute`, `chapter_pre_save`,
  `content_pre_import`). Reference:
  [backend/app/hookspecs.py:1-93](../../backend/app/hookspecs.py).
- **Frontend manifest**: returned by `get_frontend_manifest()`
  but **dead code** — no UI consumer renders it.
  ([plugins/bibliogon-plugin-kdp/bibliogon_kdp/plugin.py:23-40](../../plugins/bibliogon-plugin-kdp/bibliogon_kdp/plugin.py#L23-L40);
  [frontend/src/api/client.ts:2952-2953](../../frontend/src/api/client.ts#L2952-L2953) for
  the inert client method).
- **Settings YAML**: `backend/config/plugins/kdp.yaml` carries
  display_name + description per i18n locale; NO user-editable
  settings (the prior plugin-settings audit stripped both
  `settings.cover` and `settings.manuscript` blocks 2026-04-11
  because they were Amazon-dictated, not user preferences).

### Hookspec wiring implications for the wizard

`export_execute` is UNWIRED today. The wizard's final-step
package generation does NOT need this hook — it can call
plugin-export endpoints over HTTP from the frontend OR via a
direct Python import from plugin-kdp's new
`/api/kdp/package/{book_id}` endpoint (the latter is the
established Bibliogon pattern; see plugin-comics importing
`bibliogon_export.picture_book_pdf` directly per the CLAUDE.md
plugin table). The wizard work does NOT block on
`HOOKSPEC-DISPATCH-WIRING-01`.

### Plugin-to-plugin dependency direction

- plugin-kdp `depends_on = ["export"]` → safe to import from
  `bibliogon_export.*` in plugin-kdp code.
- plugin-export does NOT depend on plugin-kdp → must NOT import
  from `bibliogon_kdp.*`. The wizard ARC + pricing endpoints
  live on plugin-kdp; the export package builder lives on
  plugin-kdp; plugin-export stays unchanged for KDP-wizard
  scope.

---

## Track 4 — Book-type variation matrix

### Each book_type's KDP-publishing shape

| book_type | KDP product types possible | Existing export path | Trim sizes | Notes |
|---|---|---|---|---|
| `prose` | ebook (epub/pdf), paperback, hardcover, audiobook | pandoc/manuscripta → epub/pdf/docx | manuscripta-managed (5x8, 5.5x8.5, 6x9 common KDP defaults; not surfaced in Bibliogon today) | print-edition variants via `book_type` query param on export endpoint; covers, ISBNs distinguished per edition (`isbn_ebook` / `isbn_paperback` / `isbn_hardcover` already in model) |
| `picture_book` | paperback, hardcover (ebook fixed-layout is a separate KDP track; not in scope) | WeasyPrint → PDF only | 5 surfaced: 8.5x8.5 (default), 8x10, 8.5x11, 11x8.5, 10x8 | KDP requires fixed-layout EPUB3 for ebook picture-books; PB-PHASE4 Session 6 backlog item — out of KDP-wizard scope |
| `comic_book` | paperback, hardcover (KDP has a "Comic" category) | WeasyPrint → PDF only (shared with picture_book pipeline) | Same 5 as picture_book | Comics + picture-books share the same PDF pipeline by design; KDP categorizes them under "Comics & Graphic Novels" |

References:
[plugins/bibliogon-plugin-export/bibliogon_export/routes.py:841-980](../../plugins/bibliogon-plugin-export/bibliogon_export/routes.py#L841-L980);
[plugins/bibliogon-plugin-export/bibliogon_export/picture_book_pdf.py:50-99](../../plugins/bibliogon-plugin-export/bibliogon_export/picture_book_pdf.py#L50-L99);
[backend/app/models/__init__.py:86-88](../../backend/app/models/__init__.py#L86-L88).

### Wizard per-step gating differences per book_type

| Step | prose | picture_book | comic_book |
|---|---|---|---|
| Categories | KDP-suggested; user can override | KDP-suggested filtered to children's | KDP-suggested filtered to comics |
| BISAC codes | 1-3 codes, format-validated | same | same |
| Cover validation | front + back + spine (manuscripta produces hardcover spine width); same KDP cover spec | front-only PDF; KDP picture-book covers single-image | front-only PDF |
| ISBN | per-edition (ebook + paperback + hardcover) | paperback + hardcover (no ebook) | paperback + hardcover (no ebook) |
| Audiobook section | shown (ebook + audiobook are KDP product types) | hidden | hidden |
| Page count gate | warning if very short (< 20 pages) | KDP requires >= 24 pages for paperback; gate as error | same as picture_book |
| Trim size selection | manuscripta-defaults (no Bibliogon UI today; needs new selector if prose paperback shipped via wizard) | existing dropdown (5 formats) | existing dropdown (5 formats) |

The wizard **must branch on `book_type`** at component-render
level (not at endpoint-level). One wizard component, per-step
conditional rendering based on `book.book_type`. Pattern
mirrors `BookMetadataEditor`'s `isChapterBasedBookType()` check
at
[frontend/src/components/BookMetadataEditor.tsx:50-52](../../frontend/src/components/BookMetadataEditor.tsx#L50-L52).

### Out of KDP-wizard scope

- Fixed-layout EPUB3 for picture-books / comics — separate work
  per PB-PHASE4.
- Audiobook publishing to ACX (Amazon's audiobook channel) —
  uses different upload pipeline + separate auth; file as
  `KDP-WIZARD-ACX-FOLLOWUP-01` if user adds audiobook step.

---

## Track 5 — Data model audit

### Editorial metadata (present)

The `Book` model carries every editorial field KDP needs:

```
title, subtitle, author, language, series, series_index,
description, book_idea, expose, genre, book_type,
edition, publisher, publisher_city, publish_date,
isbn_ebook, isbn_paperback, isbn_hardcover,
asin_ebook, asin_paperback, asin_hardcover,
keywords (JSON-list), categories (JSON-list), bisac_codes (JSON-list),
html_description, backpage_description, backpage_author_bio,
cover_image, custom_css,
cover_image_prompt, chapter_summaries,
ai_assisted (bool — KDP requires this disclosure)
```

Reference:
[backend/app/models/__init__.py:56-138](../../backend/app/models/__init__.py#L56-L138).
PATCH schema:
[backend/app/schemas/__init__.py:91-167](../../backend/app/schemas/__init__.py#L91-L167).

### Commercial / launch metadata (ABSENT — requires schema additions)

The model carries **zero** of the following:

1. **Pricing per region** — KDP supports US, UK, DE, FR, ES, IT,
   JP, NL, BR, IN, MX, CA, AU. Each region has its own list
   price + currency. Royalty plan (35% / 70%) is a global per-
   book choice but affects price floors per region.
2. **KDP enrollment state** — KDP Select enrollment (exclusivity
   for 90 days in exchange for KU + countdown deals);
   Expanded Distribution flag (additional retail outlets at 40%
   royalty).
3. **Territory rights** — World / world-ex-US / world-ex-EU /
   custom-per-region matrix.
4. **Launch checklist state** — which pre-launch checklist
   items the user has marked done (categories selected,
   description written, etc.) + when.
5. **ARC reviewer tracking** — table of reviewers each book
   went to, what version they got, their review permalinks.

### Schema additions required

#### `BookPublishingState` (new table, 1:1 with Book)

```
id (PK, == book_id)
royalty_plan: "35" | "70"
kdp_select_enrolled: bool, default False
kdp_select_enrollment_date: datetime | None
expanded_distribution: bool, default False
prices: JSON dict[region_code, dict{currency, list_price, royalty_rate}]
launch_checklist_state: JSON dict[checklist_item_id, ISO timestamp completed]
publication_target_date: ISO date | None
last_kdp_upload_at: datetime | None  # set by changelog at first upload
```

#### `ArcReviewer` (new table, N:1 to Book)

```
id (UUID PK)
book_id (FK)
reviewer_name: str
reviewer_email: str | None
review_status: "invited" | "received_copy" | "reviewed" | "declined"
copy_version: str  # which version of the book they got
review_permalink: str | None
review_text_excerpt: str | None  # captured manually from review URL
invited_at: datetime
reviewed_at: datetime | None
```

Both tables hang off `Book.id` via FK with CASCADE on delete.
Migration follows the standard Alembic pattern. No
data-migration needed for existing books — the absence of rows
in the new tables encodes "no commercial state yet".

### KDP-specific schema notes

- `Book.ai_assisted` already exists — KDP added the AI
  disclosure requirement 2023. Wizard surfaces this as a
  required checkbox.
- `Book.chapter_summaries` already exists from
  UNIVERSAL-AI-TEMPLATE-01. KDP's description field can be
  pre-filled from this.
- `Book.cover_image_prompt` is informational — KDP doesn't
  consume the prompt itself, but a future AI-disclosure
  enhancement might surface it for the AI-content-disclosure
  step.

---

## Track 6 — Export pipeline audit (KDP-readiness)

### What KDP requires for upload

For each product type the author submits:

- **ebook** (KDP):
  - Manuscript: EPUB (preferred) or DOCX
  - Cover: JPG/TIFF, RGB, 2560x1600 recommended, < 50 MB
  - Metadata: title, subtitle, author, description (HTML
    subset), categories (max 2), keywords (max 7), language,
    series, AI-disclosure
- **paperback** (KDP Print):
  - Manuscript: PDF, embedded fonts, KDP trim size, bleed
    optional
  - Cover: PDF (front + spine + back, KDP cover-calculator output)
  - Same editorial metadata + ISBN (free KDP-assigned OR own)
- **hardcover** (KDP Hardcover):
  - Same as paperback + jacket cover
- **audiobook** (ACX, separate channel — out of scope)

### What Bibliogon produces today

| Target | prose | picture_book | comic_book |
|---|---|---|---|
| EPUB (KDP ebook) | manuscripta-validated | NOT shipped (would need fixed-layout EPUB3 per PB-PHASE4) | NOT shipped |
| PDF interior (KDP paperback/hardcover) | manuscripta + pandoc → KDP-compliant (trim per `book_type` query param) | WeasyPrint (5 trim sizes, optional bleed) | WeasyPrint (5 trim sizes, optional bleed) |
| Cover PDF (front+spine+back) | manuscripta produces interior; spine width calculation NOT surfaced in Bibliogon — pre-existing gap | front-only PDF; spine + back not produced today | front-only |
| Cover JPG (KDP ebook) | NOT explicit; Bibliogon stores `Book.cover_image` as upload path; no validated KDP-ready export | same | same |
| Metadata sidecar (KDP-shape JSON) | `POST /api/kdp/metadata` produces this | same endpoint works | same endpoint works |

### Gaps that affect wizard scope

1. **No "KDP-package" bundling endpoint exists.** The wizard's
   final step needs:
   - validated cover (front, plus spine + back for print
     variants)
   - manuscript in the correct format per chosen edition
   - metadata.json sidecar (already generated by `/api/kdp/
     metadata`)
   - cover-validation report from
     `/api/kdp/validate-cover`
   - publication-state snapshot (which checklist items
     completed, what prices, what ARC list at upload time)
   New endpoint `POST /api/kdp/package/{book_id}` is in scope.

2. **Cover-PDF spine + back generation does not exist for any
   book_type.** manuscripta produces interior PDFs; KDP wants a
   single cover PDF with spine width pre-calculated from page
   count. Surface this as a pre-launch checklist item that
   currently can only be satisfied by an out-of-Bibliogon tool
   (e.g. KDP's cover calculator). File
   `KDP-COVER-PDF-GENERATION-01` (P3) as the natural follow-up;
   NOT in KDP-wizard initial scope.

3. **Fixed-layout EPUB3 for picture-books / comics is missing.**
   PB-PHASE4 Session 6 + comic-book parallel. The KDP wizard
   for picture-books / comics initially supports paperback +
   hardcover only; ebook step is hidden per Track 4.

---

## Track 7 — Architecture decisions A1–A5

Each decision below is a STOP point. The wizard implementation
must NOT begin until each is adjudicated. Audit author's
recommended default is stated for each; user has final say.

### A1 — Wizard surface scope (MVP vs full)

**Question:** does the v1 wizard ship all five backlog-listed
steps (pre-launch checklist, pricing, ARC, export-package,
launch-record), OR a narrower MVP?

**Audit recommendation: MVP-first.** Three steps for v1:
(1) pre-launch checklist (reads existing `/api/kdp/check-
metadata`); (2) cover validation (reads existing
`/api/kdp/validate-cover`); (3) export-package (new endpoint).
Pricing + ARC ship as v2 follow-ups. Reason: each of the v2
steps requires NEW schema (`BookPublishingState`,
`ArcReviewer`); shipping the v1 three steps closes the
half-wired plugin-kdp surface with **zero schema additions**.
Half-wired-prevention discipline favors closure over breadth.

**Alternative the user might prefer:** ship all five steps in
one multi-session arc. Higher risk; longer time-to-first-user-
value; but a single coherent shape.

**Sub-question A1a:** if MVP, do pricing + ARC ship later in
the SAME release cycle (v0.36.0), or as a separate v0.37.0+?
The 16+ commit estimate in the backlog assumed all five
together. MVP-first cuts initial commits to ~6–8.

### A2 — Pricing-step scope (calculator vs strategy-tool)

**Question:** does the pricing step calculate KDP royalties
(35%/70% × region prices) and persist the chosen plan, OR
also recommend pricing strategy (genre-tier benchmarks,
launch-discount sequences, KDP Select countdown-deal
scheduling)?

**Audit recommendation: calculator-only.** The pure-math
royalty calculation is reproducible from public KDP rules; the
strategy-tool requires (a) market data that Bibliogon doesn't
have, (b) ongoing maintenance as KDP changes terms, (c) is
fundamentally subjective. Recommend strategy guidance lives in
help-doc prose, not in code.

**Counterpoint:** the original backlog scope listed "Pricing
strategy panel" — calculator-only is narrower than what was
filed. User adjudication required.

### A3 — Plugin-to-plugin integration model

**Question:** when the export-package step needs to call
plugin-export (for the manuscript), does plugin-kdp:
(a) make a server-side HTTP call to its own `/api/books/{id}/
export/pdf` endpoint, OR
(b) import `bibliogon_export.routes._export_document` directly
(established pattern per plugin-comics' direct import of
`bibliogon_export.picture_book_pdf`)?

**Audit recommendation: (b) direct import.** Matches the
established plugin-comics pattern. Avoids the HTTP round-trip
overhead. Coupling stays one-way (plugin-kdp `depends_on =
["export"]` already documented). The two plugins ship together
as core plugins, so build-time coupling is acceptable.

**Counterpoint:** if a future "headless API" deployment shape
ever materializes (Bibliogon backend reachable over HTTP but
plugin-kdp running on a different machine), (a) becomes the
only option. Not a near-term concern.

### A4 — KDP-package output format

**Question:** what does the final KDP-package ZIP contain, and
in what filesystem layout?

**Audit recommendation: 5-file ZIP per edition + 1 metadata
root:**

```
{book-slug}-kdp-package.zip
  metadata.json                # /api/kdp/metadata output
  cover.jpg or cover.pdf       # validated, format per edition
  cover-validation-report.json # /api/kdp/validate-cover output
  manuscript-ebook.epub        # if ebook edition selected
  manuscript-paperback.pdf     # if paperback selected
  manuscript-hardcover.pdf     # if hardcover selected
  publishing-state-snapshot.json  # checklist completions, A2 outputs (v2+)
  README.txt                   # user-readable summary of contents
```

Each manuscript file matches what plugin-export already
produces. Cover-PDF generation gap (Track 6) means hardcover/
paperback variants ship without the spine+back composite in
v1; the README documents the gap.

**Alternative:** one ZIP per edition (3 ZIPs for a book sold
in all 3 formats). More files; less convenient for upload.
Recommend single ZIP.

### A5 — Wizard-state persistence + recovery

**Question:** does the wizard persist mid-flow state on the
server (new `/api/kdp/wizard/state/{book_id}` endpoint, per
Track 1 gap finding), in localStorage, or both?

**Audit recommendation: server-side persistence via the new
endpoint, with localStorage as transient draft buffer.**
Reasons:
- Launch state (pricing decisions, ARC list, checklist
  completions) is user-meaningful data that must survive
  browser cache clears + device switches.
- The export-package final step reads the persisted state
  server-side anyway; storing it server-first removes a
  client-to-server sync step.
- localStorage holds the in-progress current-step + transient
  text-field drafts so navigating away mid-step doesn't lose
  work; saved on Next-button click to server.

**Schema:** the persistent state IS `BookPublishingState` per
Track 5 schema additions. The wizard does NOT need a separate
"wizard_progress" table; `BookPublishingState.launch_checklist_
state` doubles as the wizard's progress record (which steps
have been completed maps to which checklist items have
timestamps).

---

## STOP — A1-A5 adjudication required before implementation

Per the Pre-Inspection prompt's explicit instruction, this audit
deliverable STOPS at Track 7. No implementation planning, no
commit shaping, no test-strategy sketching until each of A1–A5
has a user-confirmed answer.

After adjudication, the natural next session shape is a
**Plan-mode session** to translate the adjudicated decisions
into a commit-by-commit sequence (likely 6–8 commits for the
MVP-first scope per A1, or 16+ if user picks the full-scope
alternative).

Cross-references for the next session:
- The MVP scope per A1 has a natural pairing with closing the
  `KDP-CATEGORIES-WIRE-TO-CATEGORYINPUT-01` backlog item (the
  wizard's Categories step IS the natural wiring site).
- `KDP-CHANGELOG-PATH-ISOLATION-01` (newly filed by this audit
  as a wizard prerequisite) should ship in the wizard's first
  implementation commit OR a preceding single-commit fix.
- The frontend's `api.plugins.manifests()` method
  ([frontend/src/api/client.ts:2952](../../frontend/src/api/client.ts#L2952))
  is dead code. The KDP wizard does not need to wire it — the
  wizard's entry point is a Book-level action (button in
  `BookMetadataEditor` or sidebar item), NOT the generic
  plugin-manifest surface. Separate filing if revival is ever
  wanted.

---

## Questions and assumptions (per ai-workflow.md rule)

**Evidence-based answers derived during the audit:**

1. **Pre-Inspection prompt path resolution**: neither
   `docs/journal/cc-prompt-...md` nor `/mnt/user-data/outputs/`
   resolved. Followed the user's session-instruction 7-track
   structure as the authoritative scope.
2. **Audit date in filename**: per user-specified
   `kdp-publishing-wizard-pre-inspection-2026-05-24.md`
   (git's most-recent-commit date is 2026-05-22; the user
   carries the canonical session-date and the filename matches
   their session-context).
3. **plugin-kdp ZIP install**: README references `make
   build-zip` + activation via license key; the activation flow
   is dormant (LICENSING_ENABLED=False in
   `backend/app/licensing.py` per CLAUDE.md). The plugin runs
   as core today; no license gate.
4. **Hookspec wiring blocker**: the wizard does NOT block on
   `HOOKSPEC-DISPATCH-WIRING-01`. Confirmed by reading
   [backend/app/hookspecs.py:6-15](../../backend/app/hookspecs.py#L6-L15)
   + Track 3 plugin.py audit.

**Parked questions (per the Self-clarification rule):**

None at audit-deliverable time. The 5 STOP-point A1–A5
questions are the deliberate user-adjudication checkpoints; no
audit-internal questions were silently guessed.

**Conservative assumptions in absence of upstream clarification:**

1. KDP's API requirements (cover dimensions, royalty bands,
   region currencies) are TODAY'S documented values; KDP terms
   change. Wizard implementation should encode these as
   constants in plugin-kdp Python (NOT in user-editable YAML
   per the existing `KDP_COVER_REQUIREMENTS` precedent).
2. The user is the sole-author of the books they publish via
   the wizard; multi-author royalty splits + co-author KDP
   accounts are NOT in scope.
3. ARC management is purely informational (track who got what);
   the wizard does NOT send emails, generate review-copy ZIPs
   automatically, or integrate with BookFunnel / NetGalley.
   File `KDP-WIZARD-ARC-AUTOMATION-01` if user wants that
   later.
