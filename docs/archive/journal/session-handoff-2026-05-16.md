# Session handoff — 2026-05-16 → next session

Last session (2026-05-16 evening) shipped 22 commits between
v0.33.0 and `f6e55bf`, all on `origin/main`. Two parallel tracks
ran: Phase-4 Kinderbuch Session 2 (backend Pages-Foundation) +
Hotfix Bugs 1-3 (Frontend UX). Both green; no carry-over
technical debt.

**UPDATE 2026-05-16 (late evening, post-Bug-4 close):** a
follow-up Hotfix-Session shipped Bug 4 (Comments-Admin
restructure) as a 7-commit atomic sequence: `6f9cd08` (backend
bulk-delete endpoint) → `028b219` (api.comments.bulkDelete) →
`c209a7a` (selection hook + bar) → `188d607` (selection +
TypeToConfirmDialog wired into the section) → `e03d3a1`
(CommentPreviewModal + click-row-to-open + JS truncation) →
`758f852` (Bug 4c: Reclassify moved out of the list row into the
modal only) → `1173397` (8-language i18n + Playwright E2E). 4
backend pytest cases added (test_bulk_delete.py expanded), 17
new Vitest cases added (useCommentSelection + CommentBulkActionBar
+ CommentPreviewModal + integration), 2 E2E specs touched
(reclassify.spec.ts retrofitted; new
comments-admin-bulk-delete.spec.ts). All comments-surface tests
green: 13 pytest + 53 Vitest. Plus `SETTINGS-ALLGEMEIN-TAB-
REORGANIZATION-01` (P3) filed in `docs/backlog.md` per Bug-5
deferral. The Bug-4 section below describes work that has now
SHIPPED — kept as historical reference for the next session's
continuity.

Full narrative: [chat-journal-session-2026-05-16.md](chat-journal-session-2026-05-16.md).

This doc enumerates ONLY the work explicitly deferred to a fresh
session.

---

## 1. Bug 4 — Comments-Admin restructure

Three sub-findings from manual smoke testing of v0.33.0:

### Bug 4a: bulk-delete missing

- Current: single-comment delete per row only.
- Expected: bulk-select checkbox + bulk-delete (matches AD/BD
  bulk-action pattern).
- Pattern: would be the **7th** Articles-vs-Books-parallel-
  surface-asymmetry instance if Comments-Admin counts as parallel
  to AD/BD bulk capabilities.

### Bug 4b: comment preview missing

- Current: rows show metadata only (author, date, source-article
  reference).
- Expected: comment text visible without clicking through.
- Decision (user-confirmed, mid-session correction): **inline
  truncated text (~100-150 chars + ellipsis) in the list row +
  click-to-detail opens preview modal with full text**.

### Bug 4c: Reclassify-as-Article action restructure

- Current: action sits at the same prominence as delete in the
  list row.
- Decision (user-confirmed, mid-session correction): **remove from
  list rows entirely; live ONLY in preview/detail modal with
  user-education tooltip**.
- Tooltip text (DE, native ship): "Diese Aktion verschiebt den
  Kommentar in die Artikel-Sammlung. Nutze sie wenn die Import-
  Heuristik einen Artikel fälschlich als Kommentar klassifiziert
  hat."
- Backend endpoint `POST /api/comments/{id}/reclassify-as-article`
  exists since v0.32.0 Phase 2 F2b; KEEP working. Only the UI
  placement changes.

### Pre-Inspection scope (mandatory STOP gate)

Before any code:

1. Audit `CommentsAdminSection.tsx` (or wherever the admin lives):
   current row structure, action surface, modal patterns already
   in use, whether `useArticleSelection`-like hook can be applied
   for comments.
2. Check existing patterns: ArticleList row actions (overflow
   handling), BookDashboard row actions, existing
   `TypeToConfirmDialog` / bulk-delete confirmation flow, existing
   admin-detail modal patterns (look at Settings tabs, Comments-
   Admin sub-views).
3. Backend: does `POST /api/comments/bulk-delete` exist, or
   needs creation? If creation, mirror the `bulk-delete` shape
   from `app/routers/bulk_delete.py`.
4. Preview pattern decision: modal vs inline-expand vs route.
   Recommendation is modal (user instinct, stays in admin flow,
   dismissable via Escape). Verify by grep against existing
   admin-detail patterns; deviate only if the codebase has a
   stronger precedent.

### Implementation requirements (per user spec)

- **Bug 4a**: bulk-select state + checkbox per row + BulkActionBar
  with delete action when count > 0; TypeToConfirmDialog for
  bulk-delete confirmation; backend bulk-delete endpoint check
  (probably needs creation per `app/routers/bulk_delete.py`
  shape). No cap on the bulk-delete (DB-bound + one-shot per the
  bulk-operation-limits lessons-learned rule).
- **Bug 4b**: truncated text in row (~100-150 chars); click-to-
  detail opens preview modal; full text + metadata + actions in
  modal.
- **Bug 4c**: Reclassify NOT in list rows. Lives in preview modal
  only. Tooltip / help-text near the action. Existing
  confirmation dialog stays (from v0.32.0 F2c).

### Mandatory tests

- **Vitest**: Comments-Admin renders selection checkboxes; bulk-
  delete triggers TypeToConfirmDialog; row renders truncated text;
  click opens preview modal; preview shows full text;
  reclassify-action NOT in list (removal regression-pin);
  reclassify-action IS in preview modal; clicking row opens
  preview.
- **Backend pytest** (if endpoint needs creation): bulk-delete-
  comments endpoint behavior.
- **E2E Playwright**: full bulk-delete flow; full reclassify flow
  via preview (open comment → preview opens → click reclassify →
  confirm → article appears in AD); bulk-delete does NOT show
  reclassify option.
- **A11y test**: full text accessible for screen-readers even
  when visually truncated.

### Commit sequence (estimated 5-6 commits)

1. `feat(comments-admin)`: bulk-select + bulk-delete for Comments
   (Bug 4a; backend endpoint if needed + frontend wiring).
2. `feat(comments-admin)`: comment text preview (truncated) in
   rows + click-to-detail (Bug 4b).
3. `feat(comments-admin)`: preview/detail modal with full text +
   reclassify action (Bug 4b + 4c combined).
4. `test(comments-admin)`: Vitest + E2E for all three sub-findings.
5. `feat(i18n)`: new strings for Bug 4 dropdowns + tooltip + modal
   in 8 languages (DE/EN native, others passthru).
6. (optional) `chore(backlog)`: file follow-up items if pattern
   inspection reveals duplications.

---

## 2. Phase-4 Kinderbuch Session 2 test-discipline deliverables

The Session 2 backend foundation shipped green (35 tests; 1770
total backend pass), but the per-session test palette discipline
requires additional artifacts beyond the pytest coverage. These
pair naturally with Bug 4 since both touch the admin-and-comments
adjacency:

### Smoke-test plan

File: `docs/testing/smoke-tests/picture-book-pages.md`

Per the Bibliogon smoke-test convention (see
`docs/testing/smoke-tests/article-to-book-conversion.md` as
template): overview + prerequisites + numbered test sequence +
stop-conditions + re-verification cadence.

Sequence outline:

1. Create a picture-book via `POST /api/books` with
   `book_type='picture_book'`.
2. Add 3 pages with different layouts via
   `POST /api/books/{id}/pages`.
3. Verify positions are dense [1, 2, 3] via
   `GET /api/books/{id}/pages`.
4. Reorder via `POST .../reorder` with reversed page_ids.
5. Verify positions reverse atomically.
6. Patch a page's `speech_bubble_config` and re-read; verify
   JSON roundtrip.
7. Delete page 2; verify remaining pages dense-shift to [1, 2].
8. Verify book-type immutability: `PATCH /api/books/{id}` with
   `book_type='prose'` returns 400.
9. Verify gate: try the above against a prose book; expect 400.

### Manual test guide (bilingual)

File: `docs/testing/smoke-tests/picture-book-pages-manual.md`

DE + EN sections, screenshot markers (placeholder for now since
Session 3 frontend hasn't landed), bug-report template, 3
scenarios: happy path / stress (50 pages) / edge case (delete
last page, reorder with stale id).

### Quality-check 12-area audit

12 verification areas per the established discipline:

1. i18n completeness (8 languages, fallback chain).
2. Testid coverage (Pages CRUD endpoints + Pydantic enums).
3. Test coverage (pytest, plugin tests, E2E gap).
4. Error handling (the 400 gates, the 404 fallbacks).
5. Accessibility (N/A this session — backend only; flag for
   Session 3).
6. Help docs (not yet written — flag for Session 7).
7. Backlog items (COMIC-BOOK-PLUGIN-01 filed; verify referenced
   from PB-PHASE4 ROADMAP entry).
8. CHANGELOG (not yet updated for Session 2 — next release will
   include).
9. Archive (Phase-4 Session 1 + Session 2 archival entries when
   PB-PHASE4 ROADMAP entry's Sessions [x]/[ ] markers update).
10. Lessons-learned (no new rules from this session).
11. CI state (no new gates needed; existing ci.yml covers the new
    pytest + Vitest paths).
12. Integration checks (cross-plugin: kinderbuch + export
    integration not yet exercised; flag for Session 4).

Output: structured PASS/FAIL/WARN report. Most will PASS for
backend-only work; A11Y / Help-Docs / CHANGELOG will surface as
WARN (Session 3+ work).

---

## 3. Pattern-tracker update

Articles-vs-Books-parallel-surface-asymmetry tally (per
lessons-learned in `.claude/rules/lessons-learned.md`):

- **Previous**: 4 instances documented.
- **Now**: **6 instances** confirmed.
  - Bug 2 (BookDashboard list-view checkboxes) = 5th.
  - Bug 3 (AD-Trash + BD-Trash view-mode defaults) = 6th.
- **Pending classification**: Bug 4a (Comments-Admin bulk-delete)
  would be the 7th if Comments-Admin counts as parallel-surface
  to AD/BD bulk-action capabilities. Bug 4c (Reclassify-action
  restructure) is a UX-restructure, not an asymmetry pattern;
  does NOT add to the tally.

The pattern continues to be load-bearing for scoping decisions
(see Bug 2 + Bug 3 commit messages for the explicit references).
No update to the lessons-learned text needed this session;
existing rule's "5 instances and counting" tally framing absorbed
the +2 without needing a rewrite.

---

## Standing-by message

Bug 4 implementation next session: bulk-delete + preview modal +
reclassify migration to detail-view. Plus Phase-4 Session 2 test-
discipline deliverables (smoke + manual + audit). Both naturally
pair as same-context work.

Velocity note (carry forward): 22 commits across two tracks in
one session was sustainable because Pre-Inspection STOP gates +
atomic-green commits + test-discipline-per-fix held throughout.
The disciplinary patterns are not overhead — they are the speed
multiplier.

---

## Post-Bug-4 update (2026-05-16 late evening)

### Bug 4 closed

7-commit atomic sequence shipped between `c0b9c60` and `1173397`.
See the top-of-file UPDATE block for hashes + counts. The Bug-4
section above is now historical; treat it as the closed-work
record.

### Status correction (multi-tool re-sync)

The mid-Bug-4 user prompt referenced three IDs as "P2-elevated"
open items. All three are actually **archived (closed 2026-05-15)**:

| ID | Status |
|---|---|
| `PLUGIN-SETTINGS-TESTID-COVERAGE-01` | Archived 2026-05-15 |
| `SETTINGS-INLINE-TABS-EXTRACT-01` | Archived 2026-05-15 |
| `ARTICLEFILTERBAR-EXTRACT-01` | Archived 2026-05-15 |

References live in `docs/roadmap-archive/2026-05.md` and
`docs/CHANGELOG.md` (the Settings monolith extraction work is
recorded under v0.33.0 closure batch). The "Settings is now the
surface with three concurrent backlog items" framing in the
prompt was based on stale state. Applied correction:

- Bug 5 backlog item (`SETTINGS-ALLGEMEIN-TAB-REORGANIZATION-01`)
  filed standalone in P3, with the Trigger field rewritten to
  reference the closed work as foundation rather than a
  concurrent bundle. The bundle-note add to
  `PLUGIN-SETTINGS-TESTID-COVERAGE-01` was dropped because
  archived items are frozen.

### New standing items for the next session

- **Phase-4 Kinderbuch Session 2 test-discipline deliverables**
  remain unwritten (smoke-test plan, bilingual manual guide,
  12-area quality-check audit). Outlined in the original handoff
  body above (sections 2 + 3); pair with whatever session
  takes them on.
- **`SETTINGS-ALLGEMEIN-TAB-REORGANIZATION-01`** (P3) — newly
  filed in `docs/backlog.md`. Trigger: a Settings-Polish-Session
  is convened OR a user complaint about Settings scroll friction
  surfaces. Not user-blocking.
- **Asymmetry tally**: Bug 4a confirmed as occurrence **#7** of
  the Articles-vs-Books-parallel-surface-asymmetry pattern
  (Comments-Admin as a third parallel surface to AD/BD bulk
  capabilities, where the missing bulk-delete was the asymmetry).
  No rule-text update needed; the existing "5 instances and
  counting" framing absorbed the +2 already.

### Pattern continuity (the speed multiplier still holds)

The 7-commit Bug-4 sequence + the status correction + the Bug-5
filing all happened inside one session because Pre-Inspection
STOP gate + atomic-green commits + test-discipline-per-fix +
explicit-status-correction-when-state-drifts each fired at the
right moment. The discipline is not overhead — it is the speed
multiplier. Keep applying it.
