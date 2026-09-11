# Book-to-Learnset Export (Bibliogon x adaptive-learner)

**Status:** Exploration (Session-10 feature planning, 2026-09-11).
**Priority:** 1 of 3 (before author-promotion and bulk-import stage 2).
**Related:** [author-promotion.md](author-promotion.md) (the call-to-action
funnel consumes the learnset link), [bulk-import-stage2.md](bulk-import-stage2.md)
(onboarded third-party authors are the second audience for this feature).

## Goal

Export a Bibliogon book as an adaptive-learner learn set: one lesson per
chapter section, theory steps + exercises, packaged in the `alc-*` content-repo
layout so the set drops straight into a content repository (e.g. `alc-books`).
The didactic condensation (summaries, exercises) runs through Bibliogon's
existing universal AI-template machinery; the structural scaffold is
mechanical. No other authoring tool ships a "book -> learning course" bridge -
this is the differentiation feature, and it doubles as a marketing funnel
(learnset link in the book's back matter).

## Pre-audit: current state of the moving parts

### Target format (adaptive-learner side, external SSoT)

- Set layout, verified against the two existing hand-built book sets in
  `alc-books/sets/de/` (`biologische-souveranitat`, `das-lebende-stimmrecht`):
  `sets/<source-lang>/<set-id>/manifest.yaml` + `lessons/NN-slug.json`.
- `manifest.yaml` carries `schema_version: "1.5"`, set id/title/description,
  `target_language`/`source_language`, `domain: knowledge`, `level: none`
  for non-language subjects (engine#127 level contract; difficulty rides a
  tag such as `grundlagen`).
- Lesson ordering is the lexicographic sort of lesson ids
  (learn-content-engine#106) - the `NN-` prefixes are the mechanism, not
  cosmetics, zero-padded to two digits.
- Lesson JSON shape (verified in `01-einleitung.json` of the
  biologische-souveranitat set): `{id, title, description, target_language,
  source_language, estimated_minutes, cards: [], steps: []}` where steps are
  `{type: "theory", title, body}` prose blocks and `{type: "exercise",
  exercise: {type: "cloze"|..., prompt, sentence, blanks, ...}}`.
- Machine-readable schemas exist at `adaptive-learner/schema/`:
  `lesson.schema.json`, `lesson-step.schema.json`, `exercise.schema.json`,
  `content-set.schema.json`, `content-manifest.schema.json`,
  `quality-rules.json`, plus `engine-version.txt` (currently `0.23.0`).
  Export output can and must be validated against these.
- KEY CONSTRAINT: the schema SSoT stays in adaptive-learner /
  learn-content-engine. Bibliogon consumes (vendors or reads) the schemas and
  pins `schema_version`; it never redefines them.

### Existing Bibliogon machinery to reuse

- **Universal AI template** (UNIVERSAL-AI-TEMPLATE-01/-02): self-explanatory
  `.biblio.yaml` templates whose rules live INSIDE the artifact
  (`backend/app/ai/template_schema.py:35` imports `ARTICLE_HEADER`/
  `BOOK_HEADER` from `app.ai.template_headers`); three workflows share one
  format - built-in provider, custom endpoint (LM Studio/Ollama), external
  copy-paste round-trip. See lessons-learned "AI-prompts embedded in data
  files beat per-call system-prompts for portability". The learnset template
  is a third template kind next to article + book.
- **AI fill endpoint shape**: `backend/app/routers/article_ai_fill.py:348`
  (`POST /api/articles/{id}/ai-fill`) is the per-entity fill precedent; the
  book variant exists alongside. A learnset fill follows the same contract.
- **Chapter text extraction**: `plugins/bibliogon-plugin-export/
  bibliogon_export/tiptap_to_md.py` converts TipTap JSON to Markdown - the
  input representation for lesson generation. Chapter ordering + chapter_type
  metadata live on `Chapter` (position, chapter_type); front/back-matter
  types (toc, imprint, also_by_author, ...) must be excluded from lesson
  generation the same way the audiobook skip-list works
  (`Book.audiobook_skip_chapter_types` precedent).
- **Export-plugin pattern**: plugin-kdp declares `depends_on = ["export"]`
  (`plugins/bibliogon-plugin-kdp/bibliogon_kdp/plugin.py:14`) and builds on
  the export plugin's machinery; plugin-comics does the same for PDF. A
  `plugin-learnset` follows this exact shape (architecture rule: new features
  land in plugins).
- **Marketing hook**: `ChapterType.CALL_TO_ACTION`
  (`backend/app/models/__init__.py:57`) + `next_in_series` back-matter types
  already exist - the "your book has a free learn set" funnel needs no new
  chapter machinery, only generated content for an existing type.

### Constraints and prior decisions

- Plugin metadata 3-source pattern applies (canonical
  `backend/config/plugins/learnset.yaml`).
- i18n: 8 catalogs for every UI string of the export surface.
- DEXIE-MODE-REGEL: the scaffold generation is pure data transformation ->
  must work offline (client-side) OR ship gated with justification. The AI
  fill follows the existing ai-generate gating (`requires_ai_key`, user CAN
  act). The external round-trip workflow works everywhere by construction.
- Library-first: JSON schema validation server-side can use existing
  validation deps; do not hand-roll a validator if one is already available
  in the dependency tree (check before stage 4).

## Proposal

### Product shape (three steps, mirroring the AI-template UX)

1. **Scaffold export** (mechanical, no AI): from a book, generate the set
   directory - `manifest.yaml` from book metadata (title, language,
   description), one `NN-slug.json` per content chapter (front/back matter
   excluded via a skip-list defaulting to the audiobook skip set), each
   lesson pre-filled with id/title/languages and EMPTY steps.
2. **AI fill** (three workflows, one format): a `lernset.biblio.yaml`-style
   template per lesson (or per book, chunked) embedding the chapter Markdown
   + the fill rules (summarize into 2-4 theory steps, generate N exercises of
   allowed types, answer in the book's language, valid JSON per the embedded
   field docs). Filled via built-in provider, custom endpoint, or external
   paste - identical to article/book templates.
3. **Validate + package**: validate every lesson against the vendored
   adaptive-learner schemas (+ quality-rules where mechanically checkable),
   then download as ZIP in the exact `sets/<lang>/<set-id>/` layout, ready to
   commit into an `alc-*` content repo.

### Architecture

- New plugin `bibliogon-plugin-learnset` (`depends_on = ["export"]` for
  tiptap_to_md reuse), routes under `/api/learnset/...`:
  scaffold-export, template-export, template-import (filled), validate,
  package-zip.
- Schemas vendored under the plugin (with `engine-version.txt` pin + a CI
  check comparing against the adaptive-learner checkout when present is a
  later nicety, not v1).
- UI slot: a "Lernset" action in the book editor's Werkzeuge group +
  an export-dialog entry; the AI panel reuses `AITemplatePanel`'s
  three-button shape (per the three-workflows-one-format lesson: no
  workflow branching in the UI).

### Phasing (each phase shippable)

- **P1 Scaffold:** chapter -> empty-lesson scaffold + manifest + ZIP
  download + schema validation. Zero AI. Proves the format bridge.
- **P2 Template round-trip:** lernset template export + filled-template
  import with validation errors surfaced per lesson. External workflow
  becomes usable end-to-end.
- **P3 Built-in fill:** ai-fill endpoint driving the configured provider
  per lesson with progress (SSE job context pattern per the
  audiobook/bulk-ai-fill precedent).
- **P4 Funnel:** generate/refresh a call_to_action back-matter chapter
  with the learnset link (needs the promotion track's link-management to
  know WHERE the set is published - cross-track dependency, keep last).

## Open questions

1. Set publication target: generated ZIP is committed by the user into an
   `alc-*` repo manually in v1. Automated publish (git push to a content
   repo) would reuse plugin-git-sync - defer until the manual loop is proven.
2. Exercise-type palette for v1: cloze is verified in the reference set;
   which other exercise types the schema allows (and which the engine's
   quality rules require) needs a schema read during implementation.
3. Per-chapter vs whole-book AI templates: token limits argue per-chapter;
   the external-paste workflow argues fewer, larger files. Decide at P2 with
   a real 300-page book as the test corpus.
4. `estimated_minutes`: derivable from word count (writing-statistics
   reading-time code exists) - confirm formula matches the engine's
   expectation.

## References

- Reference sets: `alc-books/sets/de/{biologische-souveranitat,das-lebende-stimmrecht}`
- Schemas: `adaptive-learner/schema/*.json`, engine `0.23.0`
- AI template lessons: `.claude/rules/lessons-learned.md`
  ("AI-prompts embedded in data files", "Three-workflows-share-one-format")
- Plugin pattern: `plugins/bibliogon-plugin-kdp/bibliogon_kdp/plugin.py`
