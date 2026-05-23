# Session handover — PB-PHASE4 Session 3 start (Picture-Book frontend)

This handover packages the predecessor session's ledger + the
decisions confirmed at session-close + the Pre-Inspection nuggets,
so the next session can open Phase 4 Session 3 cold and proceed
without re-orienting.

**Predecessor session ended:** 2026-05-17 (this morning), after a
**27-commit run** between `5bf7ef7..49038e9` shipping Bug 8 Phase 1
+ Bug 10 (BLOCKER interrupt) + Bug 8 Phase 2 + Bug 9 + the new
bug-tracking file.

**Repo state at handoff:** `main = 49038e9`, all green
(1876 backend pytest + 1202 frontend Vitest + i18n parity 75 +
expanded E2E), nothing pending in working tree.

**Predecessor handoff (longer narrative):**
[session-handoff-bug-8-9-session-a.md](session-handoff-bug-8-9-session-a.md).
This file is the focused next-session-start gate.

---

## Decisions confirmed at session-close

| # | Decision | Confirmed value |
|---|---|---|
| D1 | Mutation testing schedule | **Option B**: leave `mutation-import.yml` gated by `ENABLE_NIGHTLY_MUTATION` (currently unset → nightly runs skip). CC dispatches manually via `gh workflow run mutation-import.yml` after Settings-Polish-Session, Picture-Book Sessions 3-7, Comics-Plugin sessions, or other meaningful module-level refactors. Reasoning: 20-40 min nightly for low-churn modules wastes CI minutes. |
| D2 | Session-order priority | Picture-Book Session 3 selected over Settings-Polish-Session. Settings-Polish (`SETTINGS-ALLGEMEIN-TAB-REORGANIZATION-01` P3) stays deferred — no blocker. |
| D3 | Session 3 ships in a new session | Today's 27 commits ended Session A + B; Session 3 opens cold so the implementation has full attention. |
| D4 | Session 3 scope | **8 commits per CC's proposal**, with the exploration's mandatory go/no-go gate intact (4-page test-book authoring validates UX before Sessions 4-7). |

---

## What ships in Session 3

**PB-PHASE4 Session 3** — Picture-Book frontend editor. The
Session-2 backend (`Book.book_type` discriminator + `pages` table
+ Pages CRUD endpoints + Pydantic schemas + tests) shipped
2026-05-16. Session 3 builds the frontend that lets Aster
actually author a picture book.

**Goal:** Aster authors a functional 4-page test book in the new
editor. That experience is the **mandatory go/no-go gate** for
Sessions 4-7 (PDF + EPUB3 export pipelines + layouts +
onboarding). Per the exploration's protect-against-sunk-cost
checkpoint: a weak Session 3 outcome is a strong signal to stop.

**Spec deliverables (from
[docs/explorations/children-book-plugin.md](../explorations/children-book-plugin.md)
§ "Session 3"):**

1. `BookEditor` detects `book.book_type === "picture_book"` and
   mounts a new `<PageEditor>` instead of the chapter editor.
2. Three-pane layout: page thumbnails (left) | canvas (center) |
   properties (right).
3. Layout picker: Layout A (`speech_bubble`) + Layout B
   (`image_top_text_bottom`) by default; "More layouts" toggle
   reveals the other 3 (`image_left_text_right`,
   `image_full_text_overlay`, `text_only`).
4. Drag-to-reorder pages via @dnd-kit (already installed).
5. Inline image upload on the canvas (calls
   `POST /api/books/{book_id}/assets`).
6. i18n in all 8 catalogs.
7. Smoke test: create picture book → add 2 pages → reorder →
   change layout.

---

## Commit sequence (8 commits, ~3 hours CC work)

| # | Commit |
|---|---|
| 1 | `feat(frontend): api.pages client + Vitest` — list / create / patch / delete / reorder methods against the Session-2 endpoints (`GET/POST /api/books/{book_id}/pages`, `PATCH/DELETE /api/books/{book_id}/pages/{id}`, `POST /api/books/{book_id}/pages/reorder`). Mirror `api.chapters` / `api.assets` shape. |
| 2 | `feat(frontend): PageEditor scaffold + three-pane layout shell + Vitest` — component skeleton with the three columns, no functionality yet. Testid namespace `page-editor-*`. |
| 3 | `feat(frontend): PageThumbnails sidebar with @dnd-kit drag-reorder + Vitest` — reuse the ChapterSidebar dnd-kit pattern (`useSortable` + `arrayMove`). Calls `api.pages.reorder` on drop. |
| 4 | `feat(frontend): LayoutPicker + page-content properties pane + Vitest` — right-column properties for the selected page. Default-visible layouts: A + B. "More layouts" toggle expands to all 5. |
| 5 | `feat(frontend): canvas inline image upload + text-content editor + Vitest` — center-column canvas. Image upload via `<input type="file">` calling `POST /api/books/{book_id}/assets?asset_type=figure` (or similar; check Session-2 audit). Text content is a plain textarea (no TipTap — per the Session-2 schema docstring, `Page.text_content` is short plain text). |
| 6 | `feat(book-editor): book_type-based routing into PageEditor + Vitest` — `BookEditor.tsx` reads `book.book_type` and renders `<PageEditor>` instead of the existing chapter sidebar + editor when value is `"picture_book"`. Existing `"prose"` flow stays exactly as-is. |
| 7 | `feat(i18n): kinderbuch frontend strings across 8 catalogs` — new `ui.page_editor.*` namespace (or fold into `ui.book_editor.*`; decide at implementation time). DE + EN native, ES / FR / EL / PT / TR / JA passthru-EN per `REVIEW_STATUS.md`. |
| 8 | `test(e2e): Playwright smoke (create picture book → add 2 pages → reorder → change layout)` — single happy-path spec exercising the new `page-editor-*` testid namespace. Aster runs. |

**Estimated scope: 8 commits.** +1-2 leeway if Commit 5 grows
(image upload + textarea may need to split into 5a + 5b).

---

## Stop-conditions for Session 3

Surface and pause if any of:

- **`<PageEditor>` design surfaces an awkward UX** before Session
  4 (e.g. the three-pane layout doesn't survive 1080p
  viewport without horizontal scroll; image upload UX feels
  brittle; layout-picker UX feels heavyweight). Surface, decide
  direction with the user.
- **Scope creep > 10 commits.** Original estimate is 8; +1
  leeway is OK, +2 means a real surprise the user should weigh.
- **Session-2-backend gaps surface.** Quality-check audit
  ([docs/audits/picture-book-phase4-session2-quality-check-2026-05-16.md](../audits/picture-book-phase4-session2-quality-check-2026-05-16.md))
  flagged items that may bite during integration; if any do,
  surface + decide whether to fix-in-place or file as backlog.
- **User-validation gate fails.** After Session 3 closes, Aster
  authors a 4-page test book with actual content. If the
  authoring experience feels weak, **STOP** — Sessions 4-7 do
  NOT proceed automatically. The next session re-evaluates
  scope or stops entirely.

---

## Pre-Inspection trail (reusable nuggets)

Implementation surfaces inspected at handoff-write time:

### Backend (Session 2 — already shipped, just reference)

- **Pages CRUD endpoints** (5 of them) live in
  `plugins/bibliogon-plugin-kinderbuch/bibliogon_kinderbuch/pages.py`:
  - `router = APIRouter(prefix="/books", tags=["pages"])` →
    routes mount under `/api/books/{book_id}/pages*`.
  - `GET /{book_id}/pages` → list ordered by position.
  - `POST /{book_id}/pages` → create at position N.
  - `PATCH /{book_id}/pages/{page_id}` → update layout /
    text_content / image_asset_id / speech_bubble_config.
  - `DELETE /{book_id}/pages/{page_id}` → hard-delete.
  - `POST /{book_id}/pages/reorder` → bulk-reorder by full
    id-list; transactional.
- **Page model** in `backend/app/models/__init__.py`:
  `id`, `book_id`, `position`, `layout` (string),
  `text_content` (Text nullable), `image_asset_id` (FK to
  `assets.id` with `ondelete="SET NULL"`),
  `speech_bubble_config` (JSON-as-Text), `created_at`,
  `updated_at`. Page 1 is the cover (no separate Cover entity).
- **Layout Literal** in `backend/app/schemas/__init__.py`
  around line 964: `"speech_bubble"`, `"image_top_text_bottom"`,
  `"image_left_text_right"`, `"image_full_text_overlay"`,
  `"text_only"`. Already validated server-side.
- **`book_type` immutability guard** in `app/routers/books.py`
  PATCH handler — attempts to mutate `book_type` return 400.
  Confirms picture-book once-created stays a picture-book.

### Frontend (Session 3 builds on existing infrastructure)

- **`@dnd-kit` reuse target**: `ChapterSidebar.tsx` is the
  canonical pattern. Imports needed: `useSortable`,
  `SortableContext`, `arrayMove`, `useSensor`, `PointerSensor`,
  `KeyboardSensor`, `sortableKeyboardCoordinates`,
  `verticalListSortingStrategy`. Same sensor config (5px
  pointer activation distance) keeps drag UX consistent.
- **Asset upload endpoint**: `POST /api/books/{book_id}/assets`
  (router prefix `/books/{book_id}/assets`). Multipart form
  upload with file + `asset_type` query. Returns `AssetOut`
  with `id` for later FK reference on `Page.image_asset_id`.
- **`BookEditor.tsx` book-type detection**: currently does NOT
  branch on `book.book_type`. Commit 6 adds the branch:
  ```tsx
  if (book.book_type === "picture_book") {
      return <PageEditor book={book} ...other props />
  }
  // existing chapter-based flow stays unchanged
  ```
- **i18n catalogs**: 8 catalogs at `backend/config/i18n/*.yaml`.
  DE + EN native, ES/FR/EL/PT/TR/JA passthru-EN. Add new
  `ui.page_editor.*` namespace at the same level as
  `ui.book_editor.*` (or fold in — decide at implementation).
  All 8 must have the same key set or `test_i18n_parity.py`
  fails.

### Pre-existing audit doc with Session 3 implications

- [docs/audits/picture-book-phase4-session2-quality-check-2026-05-16.md](../audits/picture-book-phase4-session2-quality-check-2026-05-16.md)
  — 12-area quality check from Session 2 close. Read this
  BEFORE starting Commit 1 to see if any backend gaps need
  patching first. Don't skip.
- [docs/audits/kinderbuch-phase4-readiness-2026-05-16.md](../audits/kinderbuch-phase4-readiness-2026-05-16.md)
  — readiness audit that gated Session 2; the architecture
  section ("flat `book_type` discriminator, no umbrella") is
  still load-bearing for Session 3.

### Smoke-test plan (reuse for Commit 8)

- [docs/testing/smoke-tests/picture-book-pages.md](../testing/smoke-tests/picture-book-pages.md)
  — the smoke-test plan shipped with Session 2's test-
  discipline deliverables. Session 3's E2E spec extends this:
  the existing backend-only checks stay, the new UI checks
  layer on top.

---

## Open items NOT part of Session 3

Confirmed deferred:

- **Bug 8 Phase 2** — already shipped today (`5a966b7..fb994d0`).
  No follow-up needed.
- **Bug 9** — already shipped today (`032a1c7..c9e9a79`). No
  follow-up needed.
- **Bug 10** — already shipped today (`f09f0c2..1b8af09`). No
  follow-up needed.
- **Settings-Polish-Session** (`SETTINGS-ALLGEMEIN-TAB-REORGANIZATION-01`
  P3) — deferred per D2. No trigger fired yet.
- **`AUTHOR-DATALIST-EXTEND-EDITORS-01`** P3 — deferred per the
  Bug 8 Phase 2 side-commit's "extend the Wizard pattern to
  Article + Book editors" backlog. Trigger: user feedback OR
  positive Wizard-pattern validation in production. NOT in
  Session 3 scope.
- **Pre-existing open findings** in
  [docs/audits/manual-smoke-test-bugs.md](../audits/manual-smoke-test-bugs.md)
  — "Settings → 'author' link broken?" + "first-row tiles
  different size?" — both `Unverified`. NOT in Session 3 scope.
  Reproduce in a future strategic-planning chat; if real,
  promote to numbered Bug + file separately.

---

## Bug-tracker file integration

The new running tracker at
[docs/audits/manual-smoke-test-bugs.md](../audits/manual-smoke-test-bugs.md)
is the cross-session source of truth for bug status. At Session
3 close-out:

- If Session 3 surfaces any new bugs during the user-validation
  4-page-test-book phase: file as next-numbered Bug (Bug 11+) in
  the tracker's summary table.
- If Session 3 introduces any new pattern-class instance: bump
  the pattern-classes table accordingly.
- If a new backlog item lands: add to the backlog table with
  trigger + originating bug.

The tracker's "Update protocol" section documents the exact
end-of-session flow. Same commit as the bug-status change.

---

## Multi-tool collaboration tracking note

This handover packages 3 days of intense work (2026-05-16 day +
evening + 2026-05-17 today's 27-commit run) and one
process-violation incident (the 2026-05-17 Bug 10 Commit 1 smoke-
test bypassed test isolation; data was reproducible from the
Medium archive so no real loss). Standard re-sync hygiene:

- The next session's planner should pre-flight check (a)
  referenced backlog items are still active (b) the prior CC
  output was read before formulating follow-up (c) tally
  references in lessons-learned + bug tracker match the current
  state.
- The bug-tracker file is the authoritative status table —
  consult it before forming any "what's the state of Bug N"
  question.

Standard hygiene, not exception behavior.

---

## Standing-by close

End-of-this-session ledger: 27 commits between
`5bf7ef7..49038e9`, all green, all pushed. Picture-Book
Session 3 queued. Mutation-testing decision recorded for the
project log. Bug-tracker file shipped + ready for end-of-
session updates.

**Next session opens with this doc as the start gate.** No
further work this session.
