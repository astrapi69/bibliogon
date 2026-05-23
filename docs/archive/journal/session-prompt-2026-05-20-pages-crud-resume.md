# Resume Prompt — PLUGIN-COMICS-SESSION-3-PAGES-CRUD-01 (P1)

Paste-ready prompt for a fresh CC session. The previous session
(2026-05-20) closed Comics-Session-2 + ran a backlog re-
prioritization audit + apply phase. PLUGIN-COMICS-SESSION-3-PAGES-
CRUD-01 is the now-P1 next-substantial-session candidate.

Full context lives in
[session-handoff-2026-05-20-pages-crud-resume.md](session-handoff-2026-05-20-pages-crud-resume.md).

---

## Prompt (copy-paste from below)

You are starting a fresh CC session to ship
`PLUGIN-COMICS-SESSION-3-PAGES-CRUD-01` (P1, Foundation-Override-
Extended). The prior 2026-05-20 session closed Comics-Session-2
+ ran a backlog re-prioritization audit + apply phase. Read
`docs/journal/session-handoff-2026-05-20-pages-crud-resume.md`
for full context.

## State Verification

```
git status
git log origin/main --oneline -10
```

Expected: clean working tree, local HEAD == `origin/main` ==
`13bbe87` `docs(backlog): file MOBILE-SELECTIVE-SYNC-EXPLORATION-
TRIAGE-01 (P3) post-exploration`.

## Context

The ComicBookEditor (shipped Comics-Session-2 C6 commit `a33baf3`)
surfaces a degraded **"no comic pages yet"** state because
plugin-kinderbuch's `/api/books/{book_id}/pages` router gates
strictly on `book_type='picture_book'` (see
`plugins/bibliogon-plugin-kinderbuch/bibliogon_kinderbuch/pages.py`
line 43). Authors cannot create comic pages from the UI.

This is the half-wired feature that the audit's Foundation-
Override-Extended fired on (filed as new Lessons-Learned in
`2b4ab95`). Closure unblocks production comic-book authoring.

## Pre-Coding-Reality-Check (mandatory before any code)

Before writing any code:

1. **Grep all callers of `_get_picture_book_or_400`**:
   ```bash
   grep -rn "_get_picture_book_or_400" plugins/ backend/
   ```
2. **Confirm Page model is genuinely shared** (no
   picture-book-specific columns):
   ```bash
   grep -n "class Page\b" backend/app/models/__init__.py
   ```
3. **Check ComicBookEditor's degraded-state wiring**: does it
   call `api.pages.list(bookId)` and catch the 400, or does it
   skip the call when `book_type === "comic_book"`? Read
   `frontend/src/components/ComicBookEditor.tsx` (the
   `useEffect` that loads pages).

Report findings before code-write. Surface only on:

- Page model carries picture-book-specific columns that would
  conflict under comic_book context
- ComicBookEditor's no-pages-state is pre-emptive (doesn't call
  the endpoint) → frontend also needs change
- Helper rename's blast radius is larger than expected (3+
  files) → surface for split-session decision

## Recommended scope (Path A from backlog body)

Per the audit + backlog body, Path A is minimum-friction:

**Backend (1-2 commits):**

- Rename `_get_picture_book_or_400` →
  `_get_picture_or_comic_book_or_400` in
  `plugins/bibliogon-plugin-kinderbuch/bibliogon_kinderbuch/pages.py`
- Update the helper to accept `book_type IN ('picture_book',
  'comic_book')`
- Update error messages to reflect the broader gate
- Add 1 new pytest case per existing endpoint (5 endpoints:
  list_pages, create_page, update_page, delete_page,
  reorder_pages → 5 new pytest cases pinning that comic_book
  is now accepted)

**Frontend (1-2 commits):**

- Remove ComicBookEditor's degraded "no pages yet" branch (the
  `pages.length === 0` early-return). The editor now goes
  through the normal page-list + grid render path.
- The existing Add-Page mechanism via `api.pages.create()` now
  works for comic_book (was previously blocked by the gate).
  Verify no additional UI changes needed — the BookMetadataEditor
  pages-list panel pattern from picture-book should work.
- Vitest update: replace the "no-pages degraded state" pin with
  a "page-create + page-render" pin.

**i18n (1 commit, possibly bundled with frontend):**

- Audit which i18n keys reference picture-book-only language
  that should now read book-type-neutral. Most likely zero
  changes — the keys live under `ui.page_editor.*` which is
  already book-type-neutral.
- If onboarding text references "Picture book" exclusively in
  the page-CRUD context, update to "Picture book or comic book".

**Playwright (1 commit, possibly bundled with frontend):**

- Update the existing `comic-book-editor.spec.ts` to remove the
  "no-pages degraded state" assertion. Add a new spec that
  creates a comic_book → adds a page → asserts the grid renders.

**Backlog close + LL filing (1 commit):**

- Mark PAGES-CRUD as `[x]` and archive to
  `docs/roadmap-archive/2026-05.md`.
- File new LL if any novel pattern emerged (e.g. "Plugin gate
  relaxation pattern" if applicable).

## Stop conditions

Surface before continuing if any of:

- Pre-Coding-Reality-Check finds Page model is NOT genuinely
  shared (picture-book-specific columns present)
- Helper rename blast radius exceeds 3 files (surfaces a
  bigger refactor)
- Backend baseline grows beyond the current 20 fail + 13 err
  with NEW logic-level failures (vs cascade-recursion-only)
- ComicBookEditor's no-pages-state has pre-emptive wiring that
  needs additional UI work beyond what's planned
- Discovery that `GETSTARTED-MULTIBOOK-TYPES-UPDATE-01` (P2)
  has a hard dependency on this work that should be addressed
  in the same session
- Commit count exceeds 5 (signal split needed; Path B was
  scoped at 2-4)

## Disciplines active (do not relax)

- **Pre-Coding-Reality-Check** at the keystroke before any code
- **Atomic-green-per-commit-delta**: each commit's new code
  introduces no NEW logic-level failures. The PLUGINFORGE-
  RECURSION-LIMIT-REGRESSION-01 cascade may widen as new
  TestClient tests land; verify all-new-tests-pass-in-isolation
  before commit.
- **Half-Wired-Lifecycle Prevention**: the gate-relaxation must
  ship with the page-CRUD UI work (don't ship the backend half
  and defer the frontend half)
- **Pre-Inspection MUST audit all callers**: the gate helper has
  multiple callers; the rename must hit all of them in one
  commit
- **Single-Router-Per-Plugin**: kinderbuch's pages router is
  already one router; no change needed there
- **Don't-push-unprompted**: ship N commits as a coherent batch,
  surface for review, push on authorization

## Push convention

After each commit: report SHA + counter-state (if backlog edited)
+ test status (Vitest sweep + backend targeted runs). Do NOT
push C1-CN until user authorizes batch.

## Phase status after ship

| Item | Status |
|---|---|
| PLUGIN-COMICS-SESSION-3-PAGES-CRUD-01 | shipped |
| ComicBookEditor degraded "no pages" state | closed |
| Comic-book authoring | unblocked for production users |
| PLUGIN-COMICS-FOUNDATION-SCAFFOLDING-01 Session 3 | partial (still has EXTENDED-FEATURES-01 P3 open) |
| Backend baseline | grows by N cascade tests (verified in isolation) |
| Frontend Vitest | sweep clean |
| Next-substantial-session candidate | RECURRING-COMPONENT-AUDIT-01 (P2) OR GETSTARTED-MULTIBOOK-TYPES-UPDATE-01 (P2) OR PluginForge 0.8.0 wait |

## References

- `docs/journal/session-handoff-2026-05-20-pages-crud-resume.md`
  (companion handover doc)
- `docs/audits/backlog-reprioritization-2026-05-20.md` (the 2026-
  05-20 audit; PAGES-CRUD's promotion rationale)
- `docs/backlog.md` P1 section (PAGES-CRUD body)
- `.claude/rules/lessons-learned.md` "Foundation-Override
  extension" + "Half-wired feature lifecycle"
- `plugins/bibliogon-plugin-kinderbuch/bibliogon_kinderbuch/pages.py`
  (the gate helper + 5 endpoints)
- `frontend/src/components/ComicBookEditor.tsx` (the degraded-
  state branch)
- `backend/tests/test_comic_routes.py` (pattern for comic-book
  backend integration tests)

Start with state verification + Pre-Coding-Reality-Check.
Surface findings before any code-write.

End of prompt.
