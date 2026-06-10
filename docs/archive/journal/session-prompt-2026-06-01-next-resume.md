# Next-session handover — 2026-06-01

## State at handover

- **Branch:** `main`, clean working tree, pushed.
- **HEAD:** `676d9247` (= `origin/main`). "docs: archive shipped
  Scrivener P2 cluster + session journal".
- **Version:** v0.43.0 (no release cut this session — feature work on
  top of the release).
- **Baselines (verified this session):** backend pytest **2485 passed
  / 1 skipped**; Vitest **2593 passed** (200 files); tsc clean;
  verify-theme + verify-docs-discipline + verify-docs-completeness
  green; help pages en=63 / de=63.
- **Migrations head:** `b7f8a9b0c1d2` (writing goals). Chain since
  release: `a6e7f8a9b0c1` (chapter status/labels) -> `b7f8a9b0c1d2`.
  If you `git pull` onto a machine with an on-disk `backend/bibliogon.db`,
  delete it before `make test` (lessons-learned "Alembic migration +
  fresh test DB").

## What shipped this session

1. **Comprehensive docs polish** (Block 1): Story Bible headline in
   README + README-de, v0.43.0 everywhere, 13 plugins, a full Story
   Bible help section (3 new pages + storyboard rewrite + nav),
   CLAUDE.md/CONTRIBUTING gate docs, ROADMAP/backlog version-header fix.
2. **Scrivener competitive analysis** (Block 2):
   `docs/audits/scrivener-competitive-analysis-2026-06.md` (read-only).
3. **10 Scrivener-gap backlog items** filed (P2 #1-4, P3 #5-7, P4
   #8-10).
4. **The entire P2 ergonomics cluster (analysis top-10 #1-#4)** —
   shipped + archived to `docs/archive/roadmap/2026-06.md`:
   - COMPOSITION-DISTRACTION-FREE-MODE-01
   - CHAPTER-STATUS-LABELS-01
   - WRITING-GOALS-PROGRESS-TRACKING-01 (was P3, promoted P2)
   - CHAPTER-OUTLINER-VIEW-01

   Each: backend/frontend + i18n x8 + Vitest + a Playwright smoke +
   DE+EN help page. Full per-item commit ranges + Pre-Inspection
   findings are in `docs/journal/chat-journal-session-2026-06-01.md`
   ("Scrivener Ergonomie-Cluster session").

## MUST DO early next session — run the Aster E2E smokes

Per "Claude writes specs, Aster runs them", these new Playwright
smokes were written but NOT run this session. Run them against a live
app (`make dev` then `cd e2e && npx playwright test --project=smoke`,
or per-file):

- `e2e/smoke/composition-mode.spec.ts`
- `e2e/smoke/chapter-status-labels.spec.ts`
- `e2e/smoke/writing-goals.spec.ts`
- `e2e/smoke/chapter-outliner.spec.ts`

If any fail, fix + add a regression note. They target real RadixSelect
open/select paths (brittle in happy-dom, so deliberately E2E-only).

## Open work (filed, not started)

### Scrivener P3 (next most-valuable)
- **CHAPTER-SNAPSHOTS-01** — per-chapter version history UI. NOTE: a
  `ChapterVersion` snapshot model + `chapter_versions` table + the
  PATCH-snapshots-before-write logic + `/versions` endpoints ALREADY
  EXIST (the editor's restore flow uses them). This item is largely a
  *UI* over existing data (list/diff/restore panel) — re-scope its
  Pre-Inspection accordingly; it may be smaller than filed.
- **DOCX-IMPORT-01** — Pandoc DOCX -> TipTap, heading-split into
  chapters (reuse the WBT-import chapter-creation path).
- **WRITING-HISTORY-STATS-01** — per-day charts + CSV from the
  `WritingSession` table that #3 already populates (`GET
  /api/writing-sessions`). Mostly a consumer of existing data.

### Scrivener P4
- CHAPTER-COLLECTIONS-01, SCRIVENER-PROJECT-IMPORT-01,
  CHAPTER-SYNOPSIS-NOTES-01.

### Carried over from the docs-polish session
- **Story Bible screenshots (Aster-run):** new surfaces (Arc View,
  relationship lines, @-mention, prose Storyboard, entity badges) have
  no screenshot specs + the help pages ship without image refs. See
  the docs-polish journal entry + `STORY-BIBLE-INTEGRATION-DOCS-01`.
  Also refresh the 39-day-old `editor-marketing-preview.png` (the only
  verify-docs-completeness WARN): `cd e2e && npx playwright test
  --project=screenshots`.

## Reusable building blocks added this session

- `useTypewriterScroll(editor, enabled)` hook.
- `ChapterStatusLabel.tsx` — `StatusSelect` / `LabelSelect` /
  `StatusChip` / `LabelChip` + `readableTextColor` (allowlisted for
  the contrast hex). `ChapterLabelManager.tsx` (inline per-book label
  CRUD).
- `WritingGoalWidget.tsx` (+ `computeStreak`), `ChapterOutliner.tsx`.
- Backend: `app/services/writing_stats.py` (`count_words`,
  `record_progress`, `recent_sessions`), `chapter_labels` +
  `writing_stats` routers, `ChapterLabel` + `WritingSession` models.
- Pattern to reuse: prose-chapter metadata edits go through the
  Storyboard/Outliner (which own the optimistic-lock version), NOT the
  inline Editor (avoids a version-bump/409 on metadata changes). The
  Editor only READS `target_words` via a prop.

## Disciplines that held (keep using)

- Plain `git status` + explicit-paths staging before each commit;
  atomic-green-per-commit; push autonomously.
- `make verify-docs-discipline` + `make verify-docs-completeness` after
  any docs/help/i18n commit; `make verify-theme` after CSS/color
  changes (allowlist data-color hex in `scripts/check_hardcoded_colors.py`).
- i18n: add new keys to ALL 8 catalogs same commit (real umlauts in DE).
- Surface genuine forks via AskUserQuestion; surface STOP-gates before
  building.
