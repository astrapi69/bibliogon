# Scrivener 3 vs Bibliogon — Competitive Feature Analysis

**Date:** 2026-06-01
**Bibliogon version:** v0.43.0
**Scrivener version analysed:** Scrivener 3 (macOS / Windows / iPadOS)
**Status:** READ-ONLY analysis for user review. No backlog items filed
yet — the user reviews this first, then decides which gaps to promote.

---

## Why compare to Scrivener

Scrivener (Literature & Latte) is the de-facto standard long-form
writing tool for novelists and non-fiction authors. It is a
*drafting + organising* environment first and an *export* tool
second. Bibliogon overlaps on the writing/organising side and is
arguably stronger on the *publishing* side (multi-format export,
KDP wizard, audiobook, multi-platform articles) and on
*fiction-bible* tooling (the Story Bible has no Scrivener
equivalent). The gaps below are the drafting/organising affordances
Scrivener users expect and would miss when switching.

This analysis is grounded in current Scrivener documentation and
third-party guides (sources at the end) cross-checked against the
v0.43.0 Bibliogon codebase.

### Legend

- **Effort:** S (< 1 session) · M (1 focused session) · L (multi-session) · XL (multi-week arc)
- **Strategic value:** High (moves the needle on adoption / retention) · Medium · Low
- **Placement:** *Core* (touches the editor / Chapter model / shell) vs *Plugin* (per Bibliogon's "new features land as plugins" rule)

---

## 1. Writing

| Feature | Scrivener | Bibliogon (v0.43.0) | Gap | Effort | Value |
|---|---|---|---|---|---|
| Editor (rich text) | Full RTF editor, styles | TipTap WYSIWYG + Markdown, 24 toolbar buttons, footnotes, character count | — (parity / arguably richer) | — | — |
| Scrivenings (edit many docs as one continuous text) | Yes | No — chapters edited one at a time | **Yes** | L | Medium |
| Composition / distraction-free mode | Full composition mode: custom backdrop, paper width, typewriter scrolling, fade chrome | **Partial** — browser-native fullscreen (`Ctrl+Shift+F`, `useFullscreenToggle`) + editor display settings (width/font/line-height). No typewriter scrolling, no composition backdrop, no focus-on-paragraph | **Partial** | S–M | High |
| Writing targets / goals (session + document + project word targets, deadline auto-calc, writing-days) | Yes — Project/Document/Session targets with progress bars | **No** — live word count exists (CharacterCount + prose Storyboard per-chapter word count) but no *goal* tracking | **Yes** | M | High |
| Writing history / statistics (per-day word counts, charts, CSV) | Yes — Writing History + Project Statistics | **No** | **Yes** | M | Medium |
| Revision mode (colored multi-pass edit marks) | Yes — 5 revision levels | **No** (TipTap has no track-changes) | **Yes** | M–L | Low–Medium |
| Inline comments / annotations | Yes — linked comments + inline annotations in inspector | **No** author comments (footnotes only; reader-comments exist only on imported Medium articles) | **Yes** | M | Medium |
| Footnotes / endnotes | Yes | **Yes** (`tiptap-footnotes`) + ChapterType endnotes | — | — | — |
| Name generator | Yes — random names by gender/origin | **No** (but Bibliogon has an AI assistant that can do this on demand) | Minor | S | Low |
| Linguistic focus (grey out all but adverbs / dialogue / etc.) | Yes | **Partial** — `plugin-ms-tools` (style checks, metrics) + `plugin-grammar` (LanguageTool); no parts-of-speech highlight | **Partial** | M | Low–Medium |
| Spellcheck / grammar | OS spellcheck | `plugin-grammar` (LanguageTool, self-host + premium) | — (parity) | — | — |

## 2. Organising

| Feature | Scrivener | Bibliogon (v0.43.0) | Gap | Effort | Value |
|---|---|---|---|---|---|
| Binder (nested document/folder tree) | Yes — arbitrary nesting, folders, custom icons | **Partial** — flat chapter list, drag-reorder, collapsible by `chapter_type`; `part` / `part_intro` give one grouping level. No arbitrary nested folders | **Partial** | L | Medium |
| Corkboard (index cards, drag, freeform, label colors) | Yes | **Yes (different shape)** — Storyboard: page/chapter cards, drag-reorder, mood-color border, story-beat badge, act-group headers, Story Bible entity badges, entity filter | — (parity / different idiom) | — | — |
| Outliner (spreadsheet: title, synopsis, word count, status, label, custom columns, progress) | Yes | **No** — the Storyboard is card-based, there is no column/grid outline view | **Yes** | M | High |
| Synopsis (per-document index-card summary, auto-generate) | Yes | **Partial** — Storyboard `notes` + first-line preview ≈ synopsis; no dedicated synopsis field with auto-generate | **Partial** | S–M | Medium |
| Labels + Status (per-document, color-coded, shown on cards/binder/outliner) | Yes — fully user-definable label + status sets | **Partial** — `Book.status` / `Article.status` exist (draft/ready/published/archived) but **not per-chapter**; per-chapter `story_beat` / `mood_color` / `act_group` overlap conceptually but are fixed-purpose, not a free label/status set | **Yes (per-chapter)** | S–M | High |
| Keywords / tags | Yes — project keyword HUD, color chips, search | **Partial** — `Article.tags`, `Book.keywords` (marketing); Story Bible @-mentions/entities are a richer cross-reference than keywords, but there is no per-chapter keyword chip set | **Partial** | M | Medium |
| Custom metadata (text/checkbox/date/list fields per document) | Yes | **Partial** — `article_metadata` (per content type), Story Bible `entity_metadata` (per entity); no arbitrary per-chapter custom fields | **Partial** | M | Low–Medium |
| Collections (manual groups + saved-search "smart" collections) | Yes | **No** — dashboards filter, Storyboard has an entity filter, but no saved/named collections of chapters | **Yes** | M | Medium |
| Document / project notes (inspector) | Yes | **Partial** — Storyboard `notes` per chapter/page; no separate project-notes scratchpad | **Partial** | S | Low–Medium |
| Bookmarks / internal cross-references | Yes — project + document bookmarks, internal links | **Partial** — Story Bible `@-mentions` link text → entities (a strong internal-reference idiom); no chapter↔chapter bookmarks | **Partial** | M | Low |
| Fiction-entity database (characters/settings/lore + relationships + appearances) | **No** — only document-template "character sheets" + keywords | **Yes (far stronger)** — the **Story Bible**: typed entities, relationships, Arc View, continuity checker, @-mentions, auto-detect | Bibliogon ahead | — | — |

## 3. Research

| Feature | Scrivener | Bibliogon (v0.43.0) | Gap | Effort | Value |
|---|---|---|---|---|---|
| Research folder (store PDFs, images, web pages, media beside the manuscript) | Yes — import almost anything, view in-app | **Partial** — `Asset` store (images), Story Bible (structured fiction research). No general "drop a PDF / web clip / note to reference" store | **Partial** | L | Medium |
| Split editor (two panes; reference split; copyholders) | Yes | **No** — single editor pane | **Yes** | L | Medium |
| Quick Reference floating panels | Yes | **No** | **Yes** | M | Low |
| Web page import / clipping | Yes — web archive / imported page | **No** (Medium *article* import exists, but not a research clipper) | Minor | M | Low |

## 4. Compile / Export

| Feature | Scrivener | Bibliogon (v0.43.0) | Gap | Effort | Value |
|---|---|---|---|---|---|
| Compile to EPUB / PDF / DOCX / HTML | Yes — powerful Compile, section types → section layouts | **Yes** — `manuscripta` (EPUB/PDF/Word/HTML/Markdown/Project ZIP), async jobs + SSE | — (parity) | — | — |
| Section layouts / per-type formatting | Yes | **Yes** — 31 ChapterTypes + `export.yaml` + per-type front/back-matter handling | — (parity) | — | — |
| Front / back matter | Yes | **Yes** — front/back-matter chapter types | — | — | — |
| TOC generation | Yes | **Yes** — manual or generated, `use_manual_toc` | — | — | — |
| EPUB / Mobi ebook | Yes | **Yes** (EPUB) | Minor (no Mobi; KDP takes EPUB) | — | — |
| Audiobook export | **No** | **Yes (far stronger)** — `plugin-audiobook`, 5 TTS engines, content-hash cache | Bibliogon ahead | — | — |
| Illustrated-book layout (picture book / comic) | **No** (text-first) | **Yes (far stronger)** — 13 picture-book layouts + collage; comic panels + speech bubbles; WeasyPrint PDF | Bibliogon ahead | — | — |
| KDP publishing prep | **No** | **Yes** — `plugin-kdp` + 5-step KDP wizard (pricing, ARC, cover validation) | Bibliogon ahead | — | — |
| Multi-platform article publishing | **No** | **Yes** — per-platform publication tracking, content types, Medium import | Bibliogon ahead | — | — |

## 5. Workflow

| Feature | Scrivener | Bibliogon (v0.43.0) | Gap | Effort | Value |
|---|---|---|---|---|---|
| Project templates (Novel, Non-Fiction, Screenplay, ...) | Yes | **Yes** — `BookTemplate` (5 builtins) + `ChapterTemplate` (4 builtins) | — (parity) | — | — |
| Document / sheet templates (character sheet, etc.) | Yes | **Partial** — ChapterTemplate covers chapter sheets; Story Bible covers character/setting sheets | — (different idiom) | — | — |
| Snapshots / per-document version history (compare, rollback, titled) | Yes | **No** — `plugin-git-sync` gives *repo-level* history + smart-merge; autosave recovery drafts (IndexedDB); but no per-chapter snapshot/compare/rollback UI | **Yes** | M–L | High |
| Backup / restore | Auto zipped backups | **Yes** — `.bgb` full backup/restore (incl. images, optional audiobook) | — (parity) | — | — |
| Import from Word (DOCX) | Yes | **No** — imports WBT/git projects + Medium HTML; no DOCX import | **Yes** | M | Medium–High |
| Import from Scrivener (.scriv) | (n/a) | **No** | **Yes (migration)** | L | Medium–High |
| Scriptwriting (Fountain / Final Draft FDX, screenplay format) | Yes | **No** (Bibliogon does comic + picture book instead) | **Yes** | XL | Low |
| Mobile / cross-device sync | Dropbox ↔ iOS app | **Partial** — responsive web app; `plugin-git-sync` gives cross-device via repo; no native mobile app | **Partial** | XL | Medium |
| Distraction-free / typewriter scrolling | Yes (composition mode) | covered in §1 | — | — | — |
| i18n / theming / accessibility | English-centric, OS theming | **Yes (stronger)** — 8 languages, 12 theme variants, WCAG AA | Bibliogon ahead | — | — |
| Pricing / licensing | Paid (one-time) | Free, open-source (MIT), offline, plugin-extensible | Bibliogon ahead | — | — |

---

## Where Bibliogon already wins (reverse gaps)

Scrivener has **no equivalent** for these — they are Bibliogon's moat
and should stay the headline of any positioning:

1. **Story Bible** — typed fiction entities, relationships, Arc View
   swim-lane timeline, continuity checker, @-mentions, auto-detect.
   Scrivener offers only keyword tagging + a "character sheet"
   document template.
2. **Illustrated-book authoring** — 13 picture-book layouts + collage,
   comic panel grids + multi-bubble speech bubbles, dedicated PDF
   pipelines. Scrivener is text-first.
3. **Audiobook generation** — 5 TTS engines with content-hash caching.
4. **Multi-platform article publishing** — 8 content types, per-platform
   publication tracking, drift detection, Medium import.
5. **KDP publishing wizard** — pricing calculator, ARC tracker, cover
   validation.
6. **AI assistant** — multi-provider chapter review + marketing copy.
7. **Web-based, offline, local-first, free/open-source, plugin
   architecture, 8-language i18n, 12 themes, WCAG AA.**

Reading: Bibliogon is *ahead on publishing + fiction-bible + breadth
of book types*, and *behind on the day-to-day drafting/organising
ergonomics* a long-form prose writer lives in (targets, outliner,
snapshots, status labels, composition mode). Closing the §1–§2 gaps
is what makes a Scrivener user feel at home.

---

## High-value gap proposals

For each High / Medium-High value gap: a sketch of how it could land
in Bibliogon, effort, plugin-vs-core, and a *suggested* priority tier
(the user decides whether to promote).

### A. Writing Targets & Goals — value High, effort M
- **What:** Per-chapter, per-book, and per-session word targets with
  progress bars; optional draft deadline with "words/day to stay on
  track" auto-calc; optional writing-days mask.
- **How:** Word count already exists (CharacterCount + the prose
  Storyboard per-chapter word count). Add a `target_words` column to
  `Chapter` + a book-level target; a small `writing-goals` surface in
  the editor header / Storyboard. Session counts can be derived from
  per-save word-count deltas (no new infra — autosave already fires).
- **Placement:** Core for the `Chapter.target_words` column + the
  in-editor progress widget; the dashboard/stats view could be a
  plugin.
- **Priority suggestion:** **P2** (high adoption value, contained scope).

### B. Composition / distraction-free writing mode — value High, effort S–M
- **What:** A true focus mode: hide all chrome, centered paper column
  at a chosen width, optional typewriter scrolling (active line stays
  vertically centered), optional dimmed paragraphs.
- **How:** Browser-native fullscreen + editor display settings already
  exist (`useFullscreenToggle`, width/font/line-height). Add a
  "composition" toggle that applies a dedicated CSS surface
  (background, max-width paper, hidden toolbar) and a typewriter-scroll
  behaviour on the TipTap container.
- **Placement:** Core (editor).
- **Priority suggestion:** **P2** (writers strongly associate this with
  serious writing tools; low risk, builds on existing fullscreen).

### C. Per-chapter Status + Labels — value High, effort S–M
- **What:** A user-definable per-chapter **status** (e.g. To Do /
  First Draft / Revised / Final) and **label** (free color-coded set),
  shown as a chip on Storyboard cards and in the (proposed) Outliner.
- **How:** Add `status` + `label` columns to `Chapter` (mirrors the
  existing storyboard annotation columns); render chips via the
  existing `Badge` / global `.badge` system. Reuse the
  `StoryboardAnnotations` shape.
- **Placement:** Core (`Chapter` columns + Storyboard card chip).
- **Priority suggestion:** **P2** (small, high-visibility, complements
  the Storyboard already shipped).

### D. Snapshots / chapter version history — value High, effort M–L
- **What:** Take a named snapshot of a chapter before a revision pass;
  list snapshots; diff against current; roll back.
- **How:** A `chapter_snapshots` table (chapter_id, taken_at, title,
  content JSON, word count). A snapshot panel in the editor. Diffing
  can reuse the existing smart-merge three-way diff UI from
  `plugin-git-sync`. Note: git-sync already versions at the *repo*
  level — this is the *per-chapter, in-app, no-git-required* layer.
- **Placement:** Plugin (`plugin-snapshots`) depending on the editor;
  or core if it shares the git-sync diff component.
- **Priority suggestion:** **P2 / P3** (high value for revisers; weigh
  against the partial coverage git-sync already gives power users).

### E. Outliner (spreadsheet) view — value High, effort M
- **What:** A column/grid view of a book's chapters: title, synopsis,
  word count, target, status, label, story-beat — sortable, inline-
  editable; complements the card-based Storyboard.
- **How:** New `?view=outline` mount alongside `?view=storyboard`,
  reading the same Chapter rows + (new) status/target columns. Inline
  cell edits reuse the Storyboard PATCH path.
- **Placement:** Core (frontend view over existing data).
- **Priority suggestion:** **P2 / P3** (pairs naturally with C + A; the
  data mostly exists once those land).

### F. Writing History & statistics — value Medium–High, effort M
- **What:** Per-day word-count history, simple charts, CSV export,
  project statistics (totals, reading time).
- **How:** Record daily word-count deltas (derivable from the targets
  work in A). A small stats page; CSV export reuses existing export
  plumbing.
- **Placement:** Plugin (`plugin-writing-stats`), depends on A.
- **Priority suggestion:** **P3** (pairs with A; do A first).

### G. DOCX import — value Medium–High, effort M
- **What:** Import a `.docx` manuscript into a book, splitting on
  headings into chapters.
- **How:** Pandoc (already a dependency via the export path) converts
  DOCX → HTML → TipTap JSON. Heading-level split → chapters, reusing
  the existing WBT-import chapter-creation path.
- **Placement:** Plugin (extend `plugin-export` or a new
  `plugin-docx-import`).
- **Priority suggestion:** **P3** (a real switching-cost reducer for
  authors arriving from Word).

### H. Collections / saved searches — value Medium, effort M
- **What:** Named, saved groups of chapters (manual or saved-search),
  e.g. "all scenes with Mara", "needs second pass".
- **How:** Story Bible appearances already answer "all chapters with
  entity X" — a saved-search collection could be built on the entity
  filter + status/label filters. A `collections` table for manual
  groups.
- **Placement:** Plugin or core; leans on Story Bible + status/label.
- **Priority suggestion:** **P3**.

### I. Synopsis + project notes inspector — value Medium, effort M
- **What:** A dedicated per-chapter synopsis field (distinct from
  Storyboard notes) with optional auto-generate from the first
  paragraph, plus a project-level notes scratchpad.
- **How:** Reuse/extend the Storyboard `notes` column for synopsis;
  add a project-notes field on `Book`.
- **Priority suggestion:** **P3 / P4** (overlaps existing notes;
  lower urgency).

### J. Scrivener project (.scriv) import — value Medium–High (migration), effort L
- **What:** Import a `.scriv` package → a Bibliogon book (binder →
  chapters, synopses → notes, labels/status → the new fields,
  keywords → tags/entities).
- **How:** `.scriv` is a folder of RTF + a `.scrivx` XML index. Parse
  the XML for structure, convert RTF → TipTap via Pandoc.
- **Placement:** Plugin (`plugin-scrivener-import`).
- **Priority suggestion:** **P3 / P4** (the single biggest lever for
  *converting* Scrivener users, but L effort and only valuable once
  C/A landed so the imported labels/status have a home).

---

## Top 10 — ranked by impact / effort

Ordered by "most user-visible value per unit of effort first."

| # | Feature | Effort | Value | Placement | Suggested tier |
|---|---|---|---|---|---|
| 1 | **Composition / distraction-free mode** (B) | S–M | High | Core | P2 |
| 2 | **Per-chapter Status + Labels** (C) | S–M | High | Core | P2 |
| 3 | **Writing Targets & Goals** (A) | M | High | Core (+plugin stats) | P2 |
| 4 | **Outliner (spreadsheet) view** (E) | M | High | Core | P2/P3 |
| 5 | **Snapshots / chapter version history** (D) | M–L | High | Plugin | P2/P3 |
| 6 | **DOCX import** (G) | M | Medium–High | Plugin | P3 |
| 7 | **Writing History & statistics** (F) | M | Medium–High | Plugin (needs A) | P3 |
| 8 | **Collections / saved searches** (H) | M | Medium | Plugin/Core | P3 |
| 9 | **Scrivener `.scriv` import** (J) | L | Medium–High (migration) | Plugin | P3/P4 |
| 10 | **Synopsis + project notes inspector** (I) | M | Medium | Core | P3/P4 |

**Honorable mentions** (low value or high effort, not in the top 10):
Split editor (L / Medium), Scrivenings continuous-edit (L / Medium),
Inline author comments (M / Medium), Revision mode (M–L / Low–Medium),
Research folder for arbitrary files (L / Medium), Name generator (S /
Low — and the AI assistant already covers it), Linguistic focus (M /
Low–Medium — `plugin-ms-tools` is adjacent), full scriptwriting (XL /
Low — Bibliogon's illustrated-book focus is the deliberate divergence),
native mobile app (XL / Medium).

### Reading of the top 10

Items 1–4 cluster: they share the `Chapter` model + the editor/
Storyboard surfaces, and they compound — Status/Labels (2) and
Targets (3) give the Outliner (4) its columns, and all three make the
existing Storyboard feel complete. A single "writing-ergonomics" arc
covering 1–4 would close the most-felt Scrivener gaps at moderate
total cost and is the recommended first move if the user wants to
court Scrivener migrants. Snapshots (5) and DOCX import (6) are the
next independent wins (revision safety + onboarding-from-Word).

---

## Methodology & limitations

- Scrivener facts are from current L&L documentation + third-party
  guides (sources below); not from running Scrivener 3 in this
  session. Feature *details* (exact target dialogs, revision-level
  counts) are as documented, not as re-verified hands-on.
- Bibliogon facts are code-verified against v0.43.0
  (`Chapter` model, `Editor.tsx`, plugin table, Story Bible plugin).
- Effort estimates are first-pass sketches for triage, not committed
  scopes — each promoted item needs its own Pre-Inspection.
- "Parity" means *functionally comparable for the user's goal*, not
  feature-identical. Bibliogon's Storyboard and Scrivener's Corkboard
  are different idioms for the same job, for example.
- This document files **no** backlog items. Promotion to
  `docs/ROADMAP.md` / `docs/backlog.md` is the user's call after
  review.

## Sources

- [Scrivener — official site](https://scrivener.software/)
- [An Introduction to Scrivener 3](https://scrivener.app/introduction-scrivener/)
- [Organize Your Scrivener Project with the Corkboard — Literature & Latte](https://www.literatureandlatte.com/blog/organize-your-scrivener-project-with-the-corkboard)
- [Track Statistics and Targets in Your Scrivener Projects — Literature & Latte](https://www.literatureandlatte.com/blog/track-statistics-and-targets-in-your-scrivener-projects)
- [How to Use Revision Mode to Edit Your Scrivener Projects — Literature & Latte](https://www.literatureandlatte.com/blog/how-to-use-revision-mode-to-edit-your-scrivener-projects)
- [Use Scrivener's Research Folder — Literature & Latte](https://www.literatureandlatte.com/blog/use-scriveners-research-folder-to-store-information-about-your-project)
- [Splitting the Scrivener Editor — Literature & Latte](https://www.literatureandlatte.com/blog/see-more-of-your-project-splitting-the-scrivener-editor)
- [How to Compile Your Scrivener Project for Print, PDF, or Word — Literature & Latte](https://www.literatureandlatte.com/blog/how-to-compile-your-scrivener-project-for-print-pdf-or-microsoft-word)
- [Scrivener and Microsoft Word: Importing & Exporting — Literature & Latte](https://www.literatureandlatte.com/blog/scrivener-and-microsoft-word-importing-exporting)
- [Composition Mode — My Writing Journey](https://www.leedelacy.com/scrivener-features/composition-mode)
- [Scrivener 3 User Manual (Mac, PDF)](https://www.literatureandlatte.com/docs/Scrivener_Manual-Mac.pdf)
