# Chat journal — 2026-06-02

## Session summary

Scrivener P3 cluster + Story Bible relationship graph + editor context
menu, then the **v0.44.0 release**. Single long session, continuing the
Scrivener-gap work from the v0.43.0 handover.

### Shipped

1. **CHAPTER-SNAPSHOTS-01** (P3) — named manual snapshots on the
   existing `chapter_versions` (`name` / `is_manual`, retention-exempt),
   `POST .../snapshots`, snapshot-vs-current line diff, delete; modal
   with take/restore-with-confirm/delete + diff panel. 4 commits.
2. **DOCX-IMPORT-01** (P3) — closed by discovery: the feature already
   shipped end-to-end under CIO-04 (Pandoc handler + import wizard +
   17 tests). Added the missing DE+EN help page. 1 commit.
3. **WRITING-HISTORY-STATS-01** (P3) — `WritingSession` reshaped to
   per-book/chapter; `/writing-stats/summary|by-book|by-chapter|
   export.csv`; recharts Writing-History modal off the daily-goal
   widget (window selector, summary cards, bar chart, per-book drill-
   down, CSV). 3 commits.
4. **ALEMBIC-UPGRADE-CHAIN-FIX** (P0, discovered mid-session) — the
   chapter-status-labels migration crashed `alembic upgrade head` on a
   clean DB (SQLite batch table-recreate forced by an inline FK column).
   Fixed (plain ADD COLUMN); added a regression gate that runs the real
   upgrade chain in a subprocess. The whole suite had stayed green only
   because tests build the schema via `create_all`.
5. **STORY-BIBLE-RELATIONSHIP-GRAPH-01** (P2) — interactive
   `@xyflow/react` graph (`?view=relationships`): typed entity nodes +
   colour-coded relationship edges, drag-to-create + click-to-delete,
   node detail panel + open-in-editor/show-appearances + double-click
   nav, per-book layout persistence (`Book.graph_layout`), reset-layout,
   PNG export (`html-to-image`). 7 commits.
6. **EDITOR-CONTEXT-MENU-01** — right-click menu on every TipTap surface
   (chapter / page text / Story Bible description): clipboard, selection
   formatting (bold/italic/underline + heading + list submenus +
   blockquote), insert (@-mention + HR), Story-Bible search,
   take-snapshot, word-count. Behaviour in a pure
   `editorContextMenuActions` module; the Radix ContextMenu open is
   happy-dom-brittle (PageEditor real-render test stubs it to a
   passthrough). 3 commits.

### Release

- v0.43.0 → **v0.44.0** (minor, feat-dominant). 43 commits since
  v0.43.0. CHANGELOG + `changelog/releases/v0.44.0.md`. Version
  propagated via `make sync-versions`. `make release-test` +
  `make release-build` green; launcher PyInstaller build OK; tag
  `v0.44.0` pushed; GitHub release published.
- New deps (all MIT, 0 high/critical): recharts, @xyflow/react v12,
  html-to-image.

### Incident — dev-DB 502 (mid-session)

A wrong-env-var `alembic upgrade` (`BIBLIOGON_DATABASE_URL` is ignored;
the resolver reads `DATABASE_URL`) ran against the real dev DB, leaving
an orphan `chapter_labels` table + `alembic_version` stuck → the dev
backend 502'd on every `/api` call. Repaired: backed up the `.db`,
dropped the empty orphan, ran `alembic upgrade head` with the correct
var (8 books / 37 chapters preserved); verified via a throwaway backend.
Recorded as a memory + the regression gate now covers the migration
chain.

### Gates

Backend pytest 2468 → 2502 / 1 skipped; Vitest 2568 → 2630; tsc + ruff +
mypy + pre-commit + verify-theme + verify-docs-discipline +
verify-docs-completeness + verify-plugin-locks + alembic-upgrade-chain
gate + launcher build all green. E2E smokes written for Aster to run:
chapter-snapshots, writing-history, relationship-graph,
editor-context-menu.

### Note

`backend/app/routers/chapter_labels.py` carries a 1-line ruff-format-only
change that predates this session (parallel-session leftover); left
uncommitted, not absorbed into the release.
