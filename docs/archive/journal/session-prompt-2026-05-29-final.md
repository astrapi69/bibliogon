# Next Session Resume Prompt

Fresh CC session. Resume per
`docs/journal/session-handoff-2026-05-29-final.md`.

## Step 1: State Verification

```
git status
git log origin/main --oneline -10
```

Expected HEAD: `08ae4048`. Clean tree, parity with origin/main.

Confirm baselines:
- Backend pytest: **2388 passed / 1 skipped**
- Frontend Vitest: **2468 passed**
- i18n parity: **95/95 keys** in 8 catalogs (92 baseline + 3 Title-Editing)

```
make test
```

## Step 2: Read Handover

```
cat docs/journal/session-handoff-2026-05-29-final.md
```

Title Editing C1-C4 is COMPLETE (7 commits, `770aabc9..08ae4048`).
Do NOT re-do it.

## Step 3: v0.40.0 Release (FIRST)

Trigger `release-workflow.md`. Large feature accumulation since
v0.39.0:

- Content-Types SSoT (8 types) + `Article.article_metadata` +
  `GET /api/content-types` + AD SplitButton
- Publication-Status parity (`Book.status` + shared
  `PublicationStatus` Literal) + status badge
- ArticleType -> ContentType rename + UI labels
- Title Editing C1-C4
- Picture-book Phase 3 work from before this arc

SemVer: minor bump (feat-heavy, backward-compatible) -> **v0.40.0**.

Key release steps (do not improvise; follow `release-workflow.md`):
1. `make release-state` - capture commits since v0.39.0.
2. Confirm version bump with user (propose v0.40.0).
3. Draft CHANGELOG `[0.40.0]` from the accumulated `[Unreleased]`
   section + the commits; create `changelog/releases/v0.40.0.md`.
4. Hand-edit `backend/pyproject.toml` version ONLY; `make sync-versions`.
5. `make release-outdated` (dep currency) - apply routine bumps.
6. `make release-test` (MANDATORY chain) + `tsc --noEmit` +
   `npx playwright test --project=smoke` + `make verify-docs-discipline`.
7. `make release-build`.
8. `make release-tag VERSION=0.40.0` + `make release-publish VERSION=0.40.0`.
9. Post-release: journal entry, ROADMAP done-marks, CLAUDE.md version +
   test-count refresh.

STOP for user confirmation at the version-bump decision (Step 2) and
before tagging.

## Step 4: COMIC-PANEL-CROSS-PAGE-MOVE-01 (AFTER release)

Backlog entry is in **`docs/ROADMAP.md`** (P3 Comic section), NOT
`docs/backlog.md`:

```
grep -A 40 "COMIC-PANEL-CROSS-PAGE-MOVE-01" docs/ROADMAP.md
```

Pre-Inspection is DONE (see handover). Remaining inspection before
Phase 1 code-write:

```
# Plugin panel routes (comics routes live in the PLUGIN, not backend/app/routers)
grep -rn "panels\|reorder\|page_id\|position" plugins/bibliogon-plugin-comics/ --include="*.py" | head -30
# ComicBookEditor panel render + PageThumbnails drop-target feasibility
grep -rn "ComicPanelGrid\|panels\|PageThumbnails\|DndContext\|SortableContext" frontend/src/components/ComicBookEditor.tsx --include="*.tsx" | head
grep -rn "DndContext\|SortableContext\|useDroppable\|onDrop" frontend/src/components/PageThumbnails.tsx | head
```

### Confirmed facts (from this session's Pre-Inspection)

1. Same-page panel reorder NOT shipped (no dnd-kit in comics/;
   `ComicPanelGrid.tsx:158` sorts by `position` only).
2. `ComicPanelUpdate` (`schemas/__init__.py:1314`) carries `page_id` +
   `position` -> reusable for Phase 2 cross-page move (PATCH page_id).
3. No bulk reorder endpoint -> Phase 1 needs a new plugin route
   (`POST .../pages/{page_id}/panels/reorder`, atomic-bulk like
   PagesReorder).
4. No panel-level @dnd-kit yet -> Phase 1 introduces the first
   `SortableContext`; verify nesting with any page-level DnD.

### Phase 1: Same-Page Panel Reorder (2-3 commits)

- C1: new plugin bulk-reorder endpoint + frontend @dnd-kit
  `SortableContext` around panels in ComicBookEditor/ComicPanelGrid +
  drag feedback. Vitest.
- C2: Playwright smoke for same-page reorder.

### Phase 2: Cross-Page Panel Move (3-4 commits)

- C3: PageThumbnails entries as drop targets; drop validation against
  target page layout max-panel-count; append as last position; source
  positions re-normalized; reuse ComicPanelUpdate page_id. Vitest.
- C4: visual feedback (valid = green + "3/6 Panels"; full = grey +
  "6/6 Panels (voll)"); toast on move. Vitest.
- C5: i18n (tooltips, toasts, drag hints) in 8 catalogs.
- C6: Playwright smoke for cross-page move.
- C7: close-out - ROADMAP close + help docs (DE+EN) + archive.

### STOP for adjudication after the remaining Pre-Inspection if:
- @dnd-kit nested DnD contexts (page-level + panel-level) require an
  architectural decision.
- Same-page reorder needs a fundamentally different model than
  cross-page move (sortable list vs drop-target).
- The plugin bulk-reorder endpoint scope is larger than expected.
- PageThumbnails can't serve as drop targets without a major refactor.

Otherwise proceed autonomously C1-C7, push after each atomic-green
commit.

## Active Disciplines

- Audit-First Pre-Inspection (STOP gate before code-write)
- Pre-Coding-Reality-Check at each commit boundary
- Plain `git status` before every commit; explicit-paths staging if
  parallel-session work is in the tree
- Atomic-green-per-commit-delta (backend pytest + tsc + Vitest + i18n)
- Push autonomously after atomic-green
- Reuse existing infra (ComicPanelUpdate page_id, PagesReorder
  atomic-bulk pattern)

## Tooling note

If bash/read results arrive in long delayed bursts again (the
2026-05-29 degradation), use the gate-script pattern: write + validate
+ commit inside ONE Python script, dump to a `/tmp` log, read the log
once. Avoid `Edit` on files not yet `Read` this session (it fails);
the gate-script's direct read/write bypasses that.

## End-of-Session

Session-end-report per established convention.
