# Chat journal — Comic panel arranging + v0.40.0 release (2026-05-29)

Resumed from `session-handoff-2026-05-29-next-resume.md`. Direction
(user-confirmed mid-session): ship `COMIC-PANEL-CROSS-PAGE-MOVE-01`
first, then cut the v0.40.0 release.

## 1. COMIC-PANEL-CROSS-PAGE-MOVE-01 (8 commits)

Pre-Inspection confirmed: no same-page panel reorder shipped (no
dnd-kit in `comics/`); `ComicPanelUpdate.page_id` already wired
(overflow handler `abfbb5d0`); endpoint convention is
`/api/books/{id}/comic-pages/{page_id}/panels` (verified against
the plugin router — NOT the `/api/comics/...` path the resume
prompt guessed).

- **C1** `112ff5f7` — backend bulk reorder endpoint
  `POST .../panels/reorder` + `ComicPanelsReorder` schema, mirroring
  PagesReorder's two-phase position update. 6 pytest.
- **C2** `34c0dfa4` — `ComicPanelGrid` optional `onPanelReorder`:
  dnd-kit `SortableContext` (rectSortingStrategy) + per-panel drag
  handle (handle, not body, carries the listeners → bubble drag +
  panel-select click unaffected). Read-only fallback preserves
  PageCanvas + the template picker. Optimistic re-index + reconcile.
  4 Vitest.
- **C3** `65ebd522` — Playwright smoke (same-page reorder).
- **fix** `2e641856` — renamed reorder testids off the
  `comic-panel-` prefix (`comic-reorder-item/handle-*`); the old
  names overmatched existing specs' `[data-testid^="comic-panel-"]`
  count assertions (the prefix-overmatch lesson — caught before C6).
- **C4** `81808985` — cross-page **"Move to page" menu**
  (`MovePanelToPageMenu`): user-adjudicated over drag-to-thumbnail,
  which would have forced a shared canvas+sidebar DndContext + a
  refactor of the PageThumbnails the picture-book editor also uses.
  Lazy capacity load; full pages disabled `(voll)`; reuses
  `ComicPanelUpdate.page_id` + re-normalises the source via the C1
  endpoint; toast. 5 Vitest.
- **C5** `471c0eab` — 5 `move_panel*` i18n keys × 8 catalogs (real
  translations); em-dash → hyphen in the fallback separator.
- **C6** `f1f66458` — Playwright smoke (cross-page move + full-page
  disabled).
- **C7** `f738dfc8` — close-out: help-doc pair `books/comic-panels`
  (DE+EN) + `_meta.yaml` + mkdocs nav; CHANGELOG; ROADMAP removal +
  archive.

Full suite green after the arc: backend 2394 / Vitest 2477.

### STOP-for-adjudication (Phase 2 architecture)

Surfaced the nested-DndContext / shared-PageThumbnails-refactor
stop condition before writing Phase-2 code; user chose the menu
approach. Then user re-sent the same decision unprompted — both
signals agreed.

## 2. v0.40.0 release

- **CHANGELOG** `7db205bb` — `[0.40.0]` expanded beyond the
  `[Unreleased]` 4 streams to cover the full ~100-commit release
  (comic-bubble SVG overhaul, multi-panel grids, picture-book
  Phases 1-3, Settings-Completeness batch). Per-release notes file.
- **Version bump** `36d7583c` — `backend/pyproject.toml` →
  0.40.0 + `make sync-versions` (18 files); `sync-versions-check`
  + `verify_version_pins.sh 0.40.0` green (lone `1.1.0` finding is
  the comics plugin's own independent version — advisory).

### Pre-existing CI-red, fixed as release prerequisites

CI had been red on `main` since the pre-session `ad83cda0`
(ArticleType→ContentType rename). `make release-test` runs
`pre-commit --all-files`, surfacing both:

- `3960ede9` — **theme-token**: `--warning-bg` / `--btn-primary-text`
  (referenced by EditableTitle.module.css) were undefined in every
  palette → `theme-token-completeness` hook exit 1. Defined both in
  `:root` + default `[data-theme="dark"]` (cascades to all 5
  palettes × 2 modes). (User had asked to fix this post-release;
  it was actually a release-test prerequisite, so done before.)
- `e6d70b6b` — **ruff I001**: the rename left `content_types` in
  the wrong alphabetical slot in `app/main.py` → `ruff check` exit
  1. `ruff --fix` reordered it.

### Gate + tag

- `make release-test` green (RELEASE_TEST_EXIT=0; verified the log
  exit line, NOT the background-task summary, which falsely said
  "exit 0" on the earlier failing run). Includes launcher
  PyInstaller build smoke.
- `make release-build` green (poetry + npm `dist/`).
- **All GitHub workflows green on `e6d70b6b`** before tagging
  (user instruction): CI ✓, Coverage ✓, Launcher ×3 ✓, Deploy
  Docs ✓.
- `make release-tag VERSION=0.40.0` (tag on `e6d70b6b`) +
  `make release-publish VERSION=0.40.0`.
- Release: https://github.com/astrapi69/bibliogon/releases/tag/v0.40.0

## Deferred

- Routine dependency bumps (Step 4b) — no EOL/security; deferred to
  a dedicated dep-sweep to avoid destabilizing a large feature
  release. TipTap v3 / `@types/node` 25 / `@vitejs/plugin-react` 6
  majors remain deliberately pinned.

## 3. Post-release comprehensive documentation pass

User-directed after the release: build a doc gate first, then bring
all docs to v0.40.0 state.

- **C0** `41a5427c` — new `scripts/verify_docs_completeness.py`
  release gate (8 checks; FAIL=block / WARN=advisory) wired into
  `make release-test` + a manual-stage pre-commit hook. mkdocs-nav
  completeness delegated to the existing `verify-docs-discipline`
  (no duplicate). First run found one real FAIL — the stale v0.39.0
  ROADMAP header — fixed here (ROADMAP + backlog headers → v0.40.0,
  which also covered the planned "C4").
- **C1** `a6c1959a` — README + README-de v0.38.0 → v0.40.0 (5→13
  picture-book layouts incl. collage, 3→7 comic grid templates,
  corrected 6 bubble types, 8 content types, title-editing,
  publication-status); CLAUDE.md data-model (Book.status, 13
  layouts). CONTRIBUTING unchanged (already correct). Layout count
  verified at 13 from LayoutPicker (not the "12" in the brief).
- **C2** `9634c756` — new `books/page-layouts` help pair (DE+EN)
  documenting all 13 layouts + the previously-undocumented collage;
  nav regenerated.
- **C2b** `07b12dbc` — fullscreen toggle (→ editor/display-settings)
  + per-field search-clear (→ dashboard/pagination) mentions, DE+EN.
- **C3 (screenshots)** — NOT done here: regeneration needs the live
  app (`make dev` + the manual-only `--project=screenshots`); Aster
  runs it. The gate confirms no broken image refs; one advisory
  36d-old screenshot.

Both doc gates green; help i18n parity 58/58.

## Stats

- Commits this session: 18 (8 feature + 5 release/fix + 5 docs).
- Backend pytest 2294 → 2394 (+100, 1 skipped).
- Vitest 2190 → 2477 (+287).
- New: 1 backend endpoint, 2 frontend components
  (`MovePanelToPageMenu` + reorder mode on `ComicPanelGrid`),
  5 i18n keys × 8 catalogs, 2 Playwright smokes, 2 help-doc pairs
  (comic-panels + page-layouts), 1 release-gate script.
