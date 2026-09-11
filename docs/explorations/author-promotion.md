# Author Promotion Module

**Status:** Exploration (Session-10 feature planning, 2026-09-11).
**Priority:** 2 of 3 (after [book-to-learnset-export.md](book-to-learnset-export.md),
before [bulk-import-stage2.md](bulk-import-stage2.md)).
**Requirement source:** the author's real marketing operation in the
`book-collection` repo (Marketing-Plan_2026-09.md "Drei Tueren", KDP
Aktionsplan, Titel-Potenzial-Analyse, ads/ asset files, KDP report XLSX
exports, hand-maintained TODO.md format-status lists).

## Goal

Turn the spreadsheet-and-markdown marketing operation every serious KDP
author runs beside their manuscripts into Bibliogon features: a portfolio
board (what is live in which format, where), a KDP-Select free-days
planner, campaign playbooks, sales-baseline reporting, and versioned ad
assets. First user is the project author (42 live titles, 3 pen names,
4 languages); the feature generalizes to any KDP-publishing author.

## Pre-audit: current state of the moving parts

### What the marketing plan actually needs (observed practice)

- **Portfolio truth table:** `book-collection/data/books-list.csv` columns:
  Author, Language, Title, Status, GitHub_URL, GitHub_Branch, eBook,
  Paperback, Hardcover (ASIN links), Universal_Link. Hand-maintained;
  drift proven during the 2026-09-11 bulk import (renamed repo, stale
  branches, archived titles - 5 of 45 rows were wrong).
- **Format gaps list:** `book-collection/TODO.md` tracks "Hardcover fehlt /
  Entwurf / unveroeffentlichte Aenderungen" per title by hand.
- **Free-days math:** KDP Select grants 5 free days per title per 90-day
  window; at 42 titles that is >200 promo days per quarter - the plan calls
  this the one always-on channel; nothing schedules it today.
- **Reviews-before-ads rule:** ads only after N reviews (conversion at zero
  reviews wastes budget); ARC handling is a checklist item.
- **Baseline reporting:** `data/reports/baseline-2026-09.md` +
  `kdp-orders-*.xlsx` / `kdp-kenp-*.xlsx` exports; the plan's control loop
  is "Nullpunkt-Messung" -> act -> re-measure.
- **Ad assets:** `ads/` holds negative-keyword lists (per language + per
  theme), Author-Central bios, step-by-step click-path instructions.

### What Bibliogon already has (do NOT rebuild)

- **Commercial state per book:** `BookPublishingState`
  (`backend/app/models/__init__.py:1415`) - KDP wizard Phase 2 row per book:
  pricing, KDP-Select flag, ARC choices, last visited step. The promotion
  module EXTENDS this surface, it does not create a parallel one.
- **Retail identity fields on Book** (`models/__init__.py:126-149`):
  `asin_ebook/asin_paperback/asin_hardcover`, `isbn_*`, `keywords`
  (JSON array), `html_description`, `backpage_description`,
  `backpage_author_bio`, plus `series`/`series_index` and
  `status` (shared `PublicationStatus`: draft/ready/published/archived).
  The portfolio board is largely a VIEW over existing columns; the gap is
  per-format live-status (Book.status is one value, not per eBook/PB/HC)
  and the universal link.
- **Marketing chapter types exist:** `also_by_author`, `next_in_series`,
  `excerpt`, `call_to_action` (`models/__init__.py:57`) - the series-funnel
  mechanic (door A) is content work on existing types, not schema work.
- **KDP plugin:** metadata checker (BISAC validation), cover validation,
  completeness check, publishing wizard incl. ARC + pricing steps.
- **Statistics precedent:** the `/statistics` writing dashboard (v0.59.0,
  #668) aggregates client-side and works offline - the sales dashboard
  should follow its UI + aggregation pattern.
- **Author identity:** Authors-DB with `is_profile_author` + pen-name
  handling (v0.49.0) - pen-name grouping for doors A/B/C exists.

### Constraints and prior decisions

- Architecture rule: new feature => plugin unless core. This is a plugin
  (`bibliogon-plugin-promotion`), likely `depends_on = ["kdp"]` for the
  publishing-state surface (verify the dependency direction at
  implementation; the wizard state table is core-side, so core access may
  suffice without a plugin dependency).
- Per-book vs plugin-global settings rule: schedule entries, format status,
  links are per-book DATA (DB columns / new tables), never plugin YAML.
- DEXIE-MODE-REGEL / Maximal Offline: portfolio board, free-days planner,
  playbooks are pure data features -> MUST work in Dexie mode through the
  storage seam in the same commits. XLSX import is a file-parse in the
  browser or backend - decide per phase, no /api in the PWA path.
- BACKUP-PARITY-PIN: every new table (promo schedule, format status,
  playbook state, sales snapshots) must join `.bgb` export/restore in the
  same change.
- Intentional asymmetry rule: this is Books-only by design (Articles have
  their own platform/publication tracking) - document in the commit.

## Proposal

### Phase 1: Portfolio board (the books-list.csv killer)

New per-book, per-format publication state (eBook/Paperback/Hardcover x
live/draft/missing + ASIN + store link) + `universal_link` field; a
dashboard view listing every book x format with gap highlighting (the
TODO.md hardcover list becomes a filter). CSV import seeds it once from
`books-list.csv`; after that Bibliogon is the SSoT and can EXPORT the CSV
shape back for external tooling.

### Phase 2: KDP-Select free-days planner

Per-book Select enrollment window + free-day ledger (5 per 90-day window),
a calendar view with rotation suggestions honoring the plan's 80/20 door
rule (doors are a book-tag), and iCal export for reminders. Pure data +
date math; offline-capable.

### Phase 3: Sales-baseline import + dashboard

Importer for KDP order/KENP report exports (XLSX) -> normalized
`sales_snapshots` rows -> a `/statistics`-style sales dashboard (per book,
per pen name, per door; royalties + KENP pages; baseline-vs-now delta).
Library-first: openpyxl already ships transitively? Verify; otherwise CSV
exports from KDP as the v1 input format to avoid a new dependency.

### Phase 4: Playbooks + ad assets

Checklist templates (the Schritt-fuer-Schritt plan as reusable playbooks
with per-book instances) and versioned ad assets per book (negative-keyword
lists, ad copy, A+ content text) - text blobs with history, no external
API integration (Amazon Ads API is out of scope; the plan operates via the
KDP console anyway).

## Open questions

1. Per-format status modelling: three explicit column triples on Book vs a
   `book_format_states` table (format enum x status x asin x link). Table
   is cleaner for `.bgb` parity and future formats (audiobook) - lean
   table, decide in Phase-1 planning.
2. Free-day windows: KDP does not expose enrollment dates via API; the
   ledger is user-maintained. Acceptable? (The plan already tracks this by
   hand; a reminder beats silence even without API truth.)
3. Doors/tags: introduce a generic per-book label set (chapter_labels
   precedent at book level) vs a promotion-specific "door" field. Generic
   labels serve more use cases; check against the chapter-labels design.
4. XLSX vs CSV input for Phase 3 (dependency question above).

## References

- `book-collection/ads/Marketing-Plan_2026-09.md` (Drei-Tueren-Strategie)
- `book-collection/data/{books-list.csv,title-analysis.csv,reports/}`
- `backend/app/models/__init__.py:1415` (BookPublishingState), `:126-149`
  (retail identity fields), `:57` (marketing chapter types)
- v0.59.0 `/statistics` dashboard (#668) as the reporting pattern
