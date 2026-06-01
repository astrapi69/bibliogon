# Chat journal — 2026-06-01

Autonomous execution session: complete the remaining Story Bible +
Storyboard integration backlog, then cut the v0.43.0 release.

## Summary

10 feature/test commits + 3 release commits since v0.42.0. Shipped the
four deferred STORY-BIBLE-STORYBOARD-INTEGRATION-01 follow-ups
(relationship model, prose storyboard, @-mention, integration E2E)
and released **v0.43.0** "Story Bible integration depth".

| # | Commit | What |
|---|--------|------|
| 1 | `351ca3ac` | C3 — Chapter storyboard annotation columns + migration + schemas + 12 pytest |
| 2 | `690b55a8` | C10-schema — `StoryEntity.relationships` JSON + resolve endpoint + migration + 8 pytest |
| 3 | `75be8866` | C3-ui — prose chapter-card Storyboard + shared `StoryboardAnnotations` extraction (RCU) + 8 Vitest + i18n |
| 4 | `f22acfda` | C10-editor — relationship editor section + shared `relationshipColors` + 3 Vitest + i18n |
| 5 | `2cace156` | C10-ui — Arc View relationship lines + "Show relationships" toggle + 2 Vitest |
| 6 | `969136da` | C13 — @-mention autocomplete (`@tiptap/extension-mention` 2.27.2) + `?search=` + 5 Vitest + 1 pytest |
| 7 | `2000d61e` | C14 — auto-detect endpoint + sidebar panel + 5 pytest + 2 Vitest |
| 8 | `eeb738c2` | C15 — @-mention + auto-detect i18n across 8 catalogs |
| 9 | `7fe06345` | C16 — prose-storyboard Playwright smoke |
| 10 | `17590117` / `ed748f53` | CHANGELOG + version bump v0.43.0 |

## Notes / decisions

- **Prose Storyboard = separate component**, not a page-card variant
  (Stop-Condition): chapter cards have no thumbnail / drop-target /
  continuity / arc-view. The four annotation editors WERE extracted to
  a shared module and both surfaces migrated in the same commit (RCU;
  60 existing Storyboard Vitest preserved).
- **@-mention popup** mounts via ReactRenderer outside the i18n
  provider, so labels are threaded in via `buildMentionLabels(t)`.
  Comic-bubble text is a plain textarea (not TipTap) -> out of scope.
- **Auto-detect** is conservative (exact, case-insensitive, word-
  boundary; short names skipped; already-linked excluded) per the
  false-positive Stop-Condition.
- **Deferred under budget** (filed): `COMPONENT-CONSISTENCY-TAIL-01`
  (P3, advisory — `verify-components` green) + the comprehensive
  help-docs/screenshots remainder of `STORY-BIBLE-INTEGRATION-DOCS-01`.

## Release v0.43.0

Tag `v0.43.0` pushed; GitHub release published
(https://github.com/astrapi69/bibliogon/releases/tag/v0.43.0).
Gates green: backend pytest 2468 passed / 1 skipped; Vitest 2568;
tsc; ruff `app/`; mypy `app/`; pre-commit --all-files; verify-theme;
verify-components; verify-docs-discipline; launcher PyInstaller build;
frontend `npm run build`. verify-docs-completeness WARN (advisory:
one 39-day-old marketing screenshot — pre-existing). Docker push +
MkDocs deploy run via their own CI workflows.

---

## Docs Polish session (post-release v0.43.0)

Comprehensive documentation sweep bringing all docs to v0.43.0 state
(the v0.43.0 release prose was in CLAUDE.md/CHANGELOG, but the
user-facing docs still described v0.42.0 and never mentioned the
Story Bible at all in the READMEs).

| Commit | Scope |
|---|---|
| `861bb75a` | README.md + README-de.md — Story Bible headline section (entities, relationships, @-mentions, auto-detect, appearance tracker, Arc View, continuity checker, Markdown export); v0.42.0 -> v0.43.0; plugin table 12 -> 13 (plugin-story-bible); Storyboard all-book-types; README-de config parity (three-layer note + BIBLIOGON_AI_API_KEY) |
| `45a1218e` | ROADMAP.md + backlog.md `Latest release` headers v0.42.0 -> v0.43.0 (verify-docs-completeness version-header gate was failing) |
| `45e52ace` | CLAUDE.md Commands: add verify-components / verify-docs-discipline / verify-docs-completeness; CONTRIBUTING.md 12 -> 13 plugins + new "Quality gates" subsection |
| `871c4903` | Help docs: rewrite story-bible.md (the page still called @-mentions "planned for a future version"); new story-bible/mentions.md + story-bible/arc-view.md; promote Story Bible to a top-level help-nav section (regenerate mkdocs.yml); books/storyboard.md corrected from "picture-book only in v1" -> every book type + entity badges/filter + prose chapter-card sections |

### Verification

- `make verify-docs-discipline` green (mkdocs nav in sync, no orphans).
- `make verify-docs-completeness` green (en=61 de=61 help pages,
  65 _meta slugs); only the pre-existing advisory WARN remains (one
  39-day-old marketing screenshot).
- German prose authored with real UTF-8 umlauts; transliteration
  scan clean on all new/edited DE pages.

### Screenshots — Aster-run (NOT done this session)

New Story Bible surfaces (Arc View swim-lanes, relationship lines,
@-mention autocomplete, prose Storyboard chapter cards, entity
badges) have no screenshot specs yet, and the new help pages
deliberately ship WITHOUT image references (so the image-existence
gate stays green until the PNGs exist). The screenshots project at
`e2e/screenshots/` auto-starts the app via its `webServer` config, so
the run is feasible but was deferred per the session Stop-Condition
("Screenshots brauchen laufende App -> dokumentieren als Aster-Run").

Two follow-ups for Aster:

1. **Refresh existing screenshots** (clears the 39-day-old
   `editor-marketing-preview.png` WARN):
   `cd e2e && npx playwright test --project=screenshots`
2. **New Story Bible screenshots** need new screenshot specs +
   e2e/helpers/api seeding helpers for entities + links (no
   `createStoryEntity` helper exists yet, and Arc View has no
   testid). Filed as remaining scope under
   `STORY-BIBLE-INTEGRATION-DOCS-01`. Once captured, wire the image
   references into story-bible.md / arc-view.md / books/storyboard.md
   in a follow-up commit.

---

## Scrivener Ergonomie-Cluster session (P2 #1-#4)

After the docs-polish + Scrivener competitive analysis, the user
adjudicated the analysis top-10 into backlog items (P2 #1-4, P3 #5-7,
P4 #8-10) and directed implementing the **P2 cluster** in order,
autonomously, quality-over-speed. All four shipped this session.

### What shipped (all pushed to main, gates green)

| Item | Shape |
|---|---|
| **COMPOSITION-DISTRACTION-FREE-MODE-01** | Umbrella distraction-free mode (design fork resolved via AskUserQuestion -> "new umbrella toggle"). Reuses the pre-existing `focusMode` dimming + `fullscreen`; adds app-chrome hide (root `composition-mode` class) + paper backdrop + `useTypewriterScroll`. |
| **CHAPTER-STATUS-LABELS-01** | Full scope (user chose status + user-definable label set). `Chapter.status` + `label_id`, `ChapterLabel` table + CRUD + inline manager, chips + selects in the prose Storyboard. |
| **WRITING-GOALS-PROGRESS-TRACKING-01** | STOP-gate surfaced + resolved (WritingSession table + promote per-chapter goal to DB). `WritingSession` per-day table fed by the chapter PATCH delta; Dashboard daily-goal + streak widget; per-chapter `target_words` (Editor reads via prop, Storyboard/Outliner set); per-book `word_target` + deadline UI. |
| **CHAPTER-OUTLINER-VIEW-01** | Sortable, inline-editable `?view=outline` spreadsheet of chapters; reuses the status/label/beat selects + the optimistic-locked PATCH; gets its columns from #2 + #3. |

Migrations: `a6e7f8a9b0c1` (chapter status/labels), `b7f8a9b0c1d2`
(writing goals). Three new top-level help-nav pages
(editor/writing-goals, editor/outliner) + storyboard help updates.

### Pre-Inspection findings worth recording

- Composition mode was an *extension*, not greenfield: `focusMode`
  (dimming) + `fullscreen` (browser) + `useEditorDisplaySettings`
  (paper width) already existed. The umbrella composes them.
- A per-chapter `wordGoal` already existed in the Editor
  (localStorage); #3 promoted it to the DB and made the Editor read it
  via a prop (Storyboard owns the chapter version for writes, avoiding
  a version-bump/409 on metadata edits).
- A `ChapterVersion` snapshot model already exists (relevant to the
  still-open #5 CHAPTER-SNAPSHOTS-01).
- Half-wired-lifecycle discipline drove two required consumers: the
  Dashboard widget (consumes WritingSession) and the book-target UI
  (sets the Book columns) — neither could be deferred without leaving
  a write-surface without a consumer.

### Notes / decisions

- A real timezone bug (UTC `toISOString` vs local date arithmetic, vs
  the backend's local `date.today()`) was caught by the WritingGoalWidget
  Vitest and fixed (all date math is now local).
- RadixSelect open/select stays brittle in happy-dom -> the select
  interactions for all four features are covered by Playwright smokes
  (Aster-run), Vitest pins the non-Radix paths.

### Final verification

Backend pytest 2485 passed / 1 skipped; Vitest 2593 passed (200 files);
tsc clean; verify-theme (96 contrast) green; verify-docs-discipline +
verify-docs-completeness green (en=63 de=63 help pages).

### Still open (filed, not started)

Scrivener P3 (CHAPTER-SNAPSHOTS-01, DOCX-IMPORT-01,
WRITING-HISTORY-STATS-01) + P4 (CHAPTER-COLLECTIONS-01,
SCRIVENER-PROJECT-IMPORT-01, CHAPTER-SYNOPSIS-NOTES-01). The Story
Bible screenshot Aster-run (from the docs-polish session) also remains.
