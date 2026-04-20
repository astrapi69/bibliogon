# Chat journal - 2026-04-20 (afternoon, v0.20.0 arc)

## 1. AI Review Extension backend (16:00 - 17:22)

- Goal: land the exploration in docs/explorations/ai-review-extension.md. 1-2 sessions per the doc.
- Backend session (commit 537fed0): 3 new modules (prompts.py, pricing.py, review_store.py), extended ReviewRequest with chapter_type, 6 new endpoints, cascade delete hook, 31 new tests (47 in test_ai_review.py, 15 in test_ai_review_store.py).
- Frontend session (commit 946fadb): three radio focus buttons, non-prose warning in book language, cost estimate, SSE subscribe, download link, chapterType prop threaded through BookEditor, 8-language i18n, 8 Vitest string-helper tests.
- Retro lessons: JobStore.submit's type signature forced a nullary closure wrapper; manuscripta clobbers project/output/ between format runs (relevant for the batch-export bug fixed later in the same day); TipTap useEditor doesn't reliably flush storage reads to React re-renders.

## 2. Playwright smoke triage pass 1 - test-infra batch (d65ce70)

- Fixed 16 smoke failures classified as test-infra drift: dashboard-filters prefix-selector overmatch (10 tests), content-safety recovery seed contentHash semantics, Ctrl+Z typing-grouping delay, theme reload via one-shot page.evaluate instead of addInitScript, export project ZIP content-type tolerance, trash restore view switch.

## 3. Playwright smoke triage pass 2 - 3 real backend bugs (c32c274)

- **backup_import skipped soft-deleted books**: dedup check pre-dated trash; fix hard-deletes the stale row + chapters + assets and falls through to fresh-insert.
- **export_batch FileNotFoundError**: manuscripta's run_export moves project/output/ to backup/ on each call; fix stages outputs in tmp_dir/batch/ before next run_pandoc.
- **smart-import ComposerError**: project exporter writes Pandoc-style ---/--- wrapped metadata.yaml; fix uses yaml.safe_load_all + first non-empty document.
- Sub-bug on attempted partial-attribute revive: SQLAlchemy emits UPDATE with NULLs for NOT-NULL columns the backup doesn't carry (ai_tokens_used, created_at, updated_at). Hard-delete + fresh-insert sidesteps the whole dance.
- 9 new regression tests in test_backup_import_revive.py.

## 4. Playwright smoke triage pass 3 - 9 remaining (4207fa3)

- 4 real fixes: Classic first-line indent CSS specificity override (h*+p:not(:first-child) beats base on pseudo-class count); CreateBookModal Radix Select testid + pickAuthor helper; dashboard sort-direction expectation refreshed; export dialog migrated from window.open to page.waitForEvent('download').
- 4 test.skip with inline issue refs: 3 chapter-sidebar viewport zoom tests (Radix Popper collision + page overflow under CSS zoom), 1 word-count updates after typing (TipTap useEditor storage re-render).
- Smoke 135/31 -> 151/15 -> 157/9 -> 162/0/4skip.

## 5. Pre-release audit via Explore agent (17:00)

- Identified 5 protocol gaps: no smoke spec for new AI review UI (violates ai-workflow.md step 7), help pages stale on focus modes, lessons-learned missing 7 pitfalls from the session, API.md missing 8 new endpoints, coverage audit stale vs 638 backend + 405 Vitest.
- Closed all 5 gaps pre-cut.

## 6. v0.20.0 cut (17:15)

- Commits:
  - 4d54ad2 docs(v0.20): pre-release hygiene - smoke spec, help, API, lessons, coverage
  - 748ad27 docs: changelog for v0.20.0
  - f5d33f0 chore(release): bump version to v0.20.0
- Tag v0.20.0 pushed.
- GitHub release: https://github.com/astrapi69/bibliogon/releases/tag/v0.20.0
- Launcher workflows queued for Windows / macOS / Linux; permissions inherited from v0.19.1 fix so binaries attach as release assets automatically.

## Summary

- Commits since v0.19.1: 14 (2 feat, 3 fix, 9 docs/chore/test).
- Tests: 638 backend (+127) + 317 plugin + 405 Vitest (+54) + 162 Playwright smoke (was 135). 1,452 automated tests total (+181 vs 2026-04-18).
- Tracked follow-ups in GitHub issue #9: 4 Playwright skips (zoom x3, word count x1).
- Deferred major deps: elevenlabs, starlette, rich.
- Pillow 12 still blocked upstream by manuscripta.
