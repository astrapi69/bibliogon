# Session-Handoff: Next Session Resume (2026-05-29)

## Current State

- HEAD: `ad83cda0`
- Branch: `main`, parity with `origin/main`
- Working tree: clean
- Backend pytest: **2388 passed / 1 skipped**
- Frontend Vitest: **2456 passed**
- i18n parity: **92/92 keys** across 8 catalogs
- Playwright smoke specs: **79**
- Current version: **v0.39.0** (v0.40.0 pending — substantial feature accumulation)

## Recent Session Arc (16 commits this session)

### Content-Types SSoT — 11 commits (`32e16ba8..597a0ce5`)

- `Article.content_type` repurposed as discriminator (reserved field
  since AR-01 Phase 1; docstring intent finally fulfilled).
- **8 content types**: blogpost (default), tutorial, review, essay,
  newsletter, interview, listicle, short_story.
- `backend/config/content-types.yaml` SSoT +
  `ContentTypeRegistry` (`@lru_cache(maxsize=1)`) +
  `GET /api/content-types` endpoint + drift-detector test
  (Pydantic `ContentType` Literal ↔ registry id-set parity).
- Per-type metadata fields stored in new `Article.article_metadata`
  JSON-text column:
  - tutorial: `difficulty_level` (enum), `prerequisites` (text),
    `estimated_duration_minutes` (number)
  - review: `reviewed_work` (text), `reviewed_work_author` (text),
    `rating` (number, 1-5)
  - newsletter: `issue_number` (number), `send_date` (date)
  - interview: `interview_partner_name` (text),
    `interview_partner_role` (text)
  - blogpost / essay / listicle / short_story: no extra fields
- **SplitButton** primitive extracted from Dashboard's
  `newBookGroup` per RCU 2-surface rule — now backs both Book
  Dashboard (`new-book-*`) and Article Dashboard
  (`new-article-*`).
- AD split-button: default click creates blogpost; chevron
  exposes the 7 non-default types via dropdown.
- ArticleEditor: content-type selector + description hint +
  per-type extra-fields section (auto-resets metadata on type
  switch).
- `ContentTypeBadge` in AD card footer + list-row Status cell.
- `useContentTypes()` hook + `ContentTypesProvider` (mirrors
  `useBookTypes()` shape exactly).
- Alembic migration `u0e1f2345678`: backfill `content_type
  "article" → "blogpost"`; add `article_metadata` Text column.
- 3 wired call-sites updated: `reclassify.comment_to_article`
  defaults to "blogpost", `books.py _resolve_articles_or_422`
  drops `non_article` filter, `backup.serializer` auto-rewrites
  legacy "article" → "blogpost" on restore.
- medium-import plugin: defaults to "blogpost".
- i18n: 75 → 92 keys in 8 catalogs (DE / EN / ES / FR / EL /
  PT / TR / JA).
- Playwright smoke `e2e/smoke/content-types.spec.ts` (5 cases:
  primary creates blogpost, chevron dropdown contents, menu-item
  creates tutorial, editor type-switch + extra-fields persist,
  AD badge rendering).
- Help-doc pair `docs/help/{de,en}/articles/content-types.md`.

### Publication-Status Parity (Task 0) — 2 commits (`fcea37e1..9d747dae`)

- `Book.status` column added (Alembic migration
  `v1f2345678abc`, backfills "draft" for existing rows).
- Shared `_PUBLISHING_LIFECYCLE` tuple +
  `PublicationStatus` Pydantic Literal in
  `backend/app/schemas/__init__.py` (draft / ready / published
  / archived). `_ARTICLE_STATUSES` becomes a back-compat alias
  pointing at the same source — future status changes propagate
  to both Article and Book in one edit.
- Deliberately distinct from the per-platform
  `Publication.status` 5-value enum (planned / scheduled /
  published / out_of_sync / archived).
- BookCard + BookListView gain a publication-status badge.
  Reuses `ui.articles.status_*` i18n keys (labels are
  identical between the two surfaces; a separate
  `ui.publication_status.*` namespace would be over-engineering
  for v1).
- 7 new pytest cases pin the drift-detector + create/PATCH
  contract.
- **Foundation for Title-Editing C2** (published-work warning
  reads `book.status` / `article.publications`).

### COMIC-PANEL-CROSS-PAGE-MOVE-01 backlog filing — 1 commit (`597a0ce5`)

- Filed under ROADMAP P3 Comic-Book Authoring section.
- **Pre-Inspection finding**: same-page panel reorder is NOT
  shipped (original spec's assumption was wrong). Confirmed via
  grep: no `SortablePanel` / `DragEndEvent` in
  `frontend/src/components/comics/`; `panels.py:14` comment
  reads "A future reorder endpoint mirrors PagesReorder's
  atomic-bulk". Backend cross-page move IS shipped via
  `ComicPanelUpdate.page_id` (`COMIC-PANEL-OVERFLOW-HANDLER-01`
  commit `abfbb5d0`).
- Filing reflects 2-phase scope: Phase 1 same-page reorder
  (new bulk-atomic reorder endpoint + dnd-kit `SortablePanel`
  wrapper), Phase 2 cross-page move (frontend drop-zones on
  PageThumbnails + capacity validation). Effort: 8-10 commits
  (revised up from spec's 5-7).

### ArticleType → ContentType rename — 1 commit (`ad83cda0`)

- 41 files changed (15 git-tracked file renames + 26
  modifications).
- Backend: `article-types.yaml` → `content-types.yaml`,
  `article_type_registry.py` → `content_type_registry.py`,
  `article_types.py` router → `content_types.py`, endpoint
  `/article-types` → `/content-types`. Pydantic `ArticleType`
  → `ContentType`. Test files renamed.
- Frontend: `useArticleTypes` → `useContentTypes`,
  `ArticleTypesProvider` → `ContentTypesProvider`,
  `articleTypeIcon` → `contentTypeIcon`,
  `ArticleTypeBadge` → `ContentTypeBadge`,
  `ArticleTypeFieldsSection` → `ContentTypeFieldsSection`.
  `api.articleTypes` → `api.contentTypes`.
- i18n namespace: `ui.article_types.*` → `ui.content_types.*`
  in 8 catalogs. `ui.articles.article_type{,_tooltip}` →
  `content_type{,_tooltip}`.
- **User-visible label per language**: DE "Artikel-Typ" →
  "Textart"; EN "Article type" → "Content type"; ES, FR, EL,
  PT, TR, JA all updated to local "Content type" equivalent.
- Module-state-audit allowlist updated.
- Help-doc filenames + nav slug renamed
  (`articles/article-types` → `articles/content-types`);
  mkdocs.yml regenerated.
- E2E spec `article-types.spec.ts` → `content-types.spec.ts`.
- DB column name `Article.content_type` was already correct
  since AR-01 Phase 1 — NOT renamed.

## Next Session Direction: Title Editing C1-C4

Task 0 foundation (`Book.status` with shared `PublicationStatus`
enum) is shipped. Ready for `EditableTitle` implementation.

### UX Spec

**Unpublished works (status = draft or ready):**

- Title displays as text by default (not an input field).
- Pencil icon button next to the title: click toggles edit mode.
- Inline text input. Enter or blur saves. Escape cancels and
  reverts to previous title.
- No warning. Free to edit.

**Published works (status = published or archived):**

- Same pencil icon button.
- On click: **yellow warning banner** appears below the title
  field BEFORE editing begins.
- Warning text (DE): "Achtung: Dieses Werk wurde bereits
  veröffentlicht. Eine Titeländerung muss manuell auf der
  Veröffentlichungsplattform (z.B. KDP) nachgezogen werden."
- Warning text (EN): "Warning: This work has been published.
  A title change must be manually updated on the publishing
  platform (e.g. KDP)."
- User acknowledges via "Verstanden, Titel ändern" / "Understood,
  edit title" button.
- After acknowledgment: same edit behaviour as unpublished
  (Enter saves, Escape cancels).

**Applies to:** BookEditor (prose, picture_book, comic_book),
ArticleEditor. Consistent EditableTitle shared component.

### Commit Plan

- **C1**: `feat(editors): EditableTitle shared component + wire
  into all editors` — pencil-toggle inline edit; Enter saves,
  blur saves, Escape cancels. Wire into BookEditor +
  ArticleEditor + ComicBookEditor + PageEditor. Vitest covers
  toggle / save / cancel paths.
- **C2**: `feat(editors): published-work warning on title edit`
  — yellow banner + acknowledgment button. Detection: gate on
  `book.status === "published"` (Task 0 foundation) or
  `article.publications.length > 0`. Vitest covers warning-
  visible-for-published, warning-hidden-for-draft, and the
  acknowledgment flow.
- **C3**: `feat(i18n): title editing strings in 8 catalogs` —
  pencil tooltip, warning text, acknowledgment button label.
  i18n parity must hold.
- **C4**: `docs(editors): title editing help docs + Playwright
  smoke + close` — E2E covers edit-on-unpublished + warning-on-
  published. Help-doc pair (DE + EN). Archive entry +
  CHANGELOG.

### Pre-Inspection at session start (mandatory)

```bash
grep -rn "title\|Title" frontend/src/pages/BookEditor.tsx | head -20
grep -rn "title\|Title" frontend/src/pages/ArticleEditor.tsx | head -20
grep -rn "title\|Title" frontend/src/components/ComicBookEditor.tsx | head -20
grep -rn "status\|published" frontend/src/ --include="*.tsx" | head -20
```

Determine: (1) current title rendering shape in each editor; (2)
whether existing PATCH endpoints accept title; (3) reliable
published-state detection signal (Book uses `status`; Article
uses publications.length OR `status === "published"`); (4) is
there a shared editor-header component or 4 independent ones.

## Other Queued Work (after Title Editing)

1. **COMIC-PANEL-CROSS-PAGE-MOVE-01** (P3, 8-10 commits,
   Phase 1 same-page reorder + Phase 2 cross-page move).
2. **v0.40.0 release** — large feature accumulation since
   v0.39.0 (Content-Types SSoT, Publication-Status Parity,
   Title Editing, Comic Panel Cross-Page Move if shipped,
   plus all the picture-book Phase 3 work from before this
   session). Follow `release-workflow.md` step-by-step.

## Current Backlog State

- **P0**: 0
- **P1**: 0
- **P2**: 0
- **P3**: 17
- **P4**: 26
- **P5**: 12
- **BLOCKED**: 2
- **Total active**: 57

(unchanged from session start — this session shipped 1 backlog
filing in P3 but no closures from active backlog; Content-Types
+ Task 0 + AT-RENAME were all user-directed direct ships rather
than backlog items.)

## Critical Constraints + Active Disciplines

Copy-applicable from `.claude/rules/lessons-learned.md`:

1. **Audit-First Pre-Inspection** — STOP-gate before code-write.
   Read the relevant files + grep for existing patterns +
   surface stop-conditions before proposing the commit plan.
2. **Pre-Coding-Reality-Check** at every keystroke-boundary —
   re-grep the immediate touch-surface 30 seconds before
   writing code. Catches the audit's blind spots.
3. **Plain `git status` before every commit** — read FULL
   index state (staged + unstaged + untracked). Catches the
   parallel-session absorption pattern.
4. **Explicit-paths-only staging** when ANY parallel-session
   work is in the working tree. `git add -A` and `git add .`
   are forbidden in Multi-Tool-Coordination contexts.
5. **Atomic-green-per-commit-delta** — every commit must
   leave the tree green (backend pytest + frontend tsc +
   Vitest + i18n parity).
6. **Push autonomously after atomic-green** — no waiting for
   approval between intermediate commits in a multi-commit
   arc.
7. **Half-wired feature lifecycle** — state-write without
   state-consumer (OR inverse-mutation) is purgatory.
   Title-Editing C2 published-work warning consumes
   `book.status` (Task 0 foundation) + `article.publications`
   (AR-02 foundation); both are shipped.
8. **Articles-vs-Books parallel-surface asymmetry** — every
   parallel-surface feature gets explicit parity verification.
   EditableTitle MUST land on BookEditor + ArticleEditor +
   ComicBookEditor in the same commit set; no half-migration.
9. **Testid namespace pinning** — choose a single namespace
   string at component creation; list testids in the
   component's header docstring; E2E spec walks every pinned
   testid positively.
10. **Menu-Dialog Lifecycle** — `onSelect` handlers on
    `DropdownMenu.Item` MUST NOT call `e.preventDefault()`
    when the handler triggers a dialog. Radix auto-closes;
    handler runs after.
11. **Radix DropdownMenu + happy-dom brittleness** — defer
    dropdown-content behaviour to Playwright; Vitest covers
    trigger button + click + disabled state only.
12. **End-to-end behaviour tests for every settings flag** —
    flip the flag to non-default + assert OBSERVABLE behaviour
    at the OUTPUT, not just that the value persisted.
13. **Numeric-claims verification** — any number in a doc /
    commit / chat / journal MUST be backed by running the
    authoritative command in the same session.
14. **Continuous-archival rule** — closed `[x]` items move to
    `docs/archive/roadmap/2026-05.md` in the same commit that
    closes them.

## Open Architecture-Decisions

None pending for Title Editing. User adjudicated the UX spec
in this session's mid-arc prompt; spec is locked.

For COMIC-PANEL-CROSS-PAGE-MOVE-01 (later): user adjudicated
Phase 1 same-page reorder is included in scope.

## Files to Read at Session Start (in order)

1. `docs/journal/session-handoff-2026-05-29-next-resume.md`
   (this document — re-read after `git pull`)
2. `docs/backlog.md` (active queue)
3. `.claude/rules/lessons-learned.md` (active disciplines)
4. `.claude/rules/coding-standards.md` (RCU rule + function
   design + DRY threshold)
5. `backend/config/content-types.yaml` + `book-types.yaml`
   (SSoT registries the Title-Editing component will read
   alongside Book.status / Article.publications)
6. `frontend/src/components/SplitButton.tsx` (prior shared-
   component extraction reference for EditableTitle's shape)

## Session-End Statistics

- **Commits**: 16 this session (32e16ba8..ad83cda0)
- **Files changed**: ~60 across the arc
- **Tests added**: 27 (registry) + 5 (endpoint) + 16 (hook) +
  7 (SplitButton) + 13 (FieldsSection) + 3 (Badge) + 5
  (Playwright smoke) + 7 (Book.status) = 83 new tests
- **i18n keys added**: 17 (75 → 92)
- **Backend baseline**: 2352 → 2388 (+36)
- **Frontend Vitest baseline**: 2433 → 2456 (+23)
- **Playwright smoke specs**: 78 → 79 (+1)
